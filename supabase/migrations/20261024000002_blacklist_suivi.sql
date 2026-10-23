-- المرحلة 2، الخطوة 2: ليست نوار + شاشة السويفي.

-- رقم موحد: أرقام برك، و213 / 00213 يوليو 0
create function public.phone_key(p text) returns text language sql immutable as $$
  select regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^00213', '0'), '^213', '0')
$$;

-- ---------- ليست نوار ----------
-- المؤكدات والسويفي يزيدو، المدير وحدو يمسح. تتحفظ دايما.
create table public.blacklist (
  phone_key  text primary key check (length(phone_key) between 9 and 13),
  phone      text not null,
  name       text,
  reason     text not null,
  added_by   uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create trigger audit_blacklist after insert or update or delete on public.blacklist for each row execute function public.audit();
alter table public.blacklist enable row level security;
create policy blacklist_read   on public.blacklist for select to authenticated using (public.is_manager());
create policy blacklist_delete on public.blacklist for delete to authenticated using (public.is_manager());
grant select, delete on public.blacklist to authenticated;

create function public.is_blacklisted(p_phone text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blacklist where phone_key = public.phone_key(p_phone))
$$;

-- المؤكدة ما تشوفش حتى طلبية رقمها في ليست نوار
drop policy orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using (
  public.is_manager()
  or (public.my_role() = 'dispatch' and status in ('wait', 'sent'))
  or (public.my_role() = 'confirmer' and not public.is_blacklisted(phone) and (
        confirmed_by = auth.uid()
     or (status in ('new', 'failed1', 'failed2', 'failed3', 'postponed')
         and exists (select 1 from public.product_confirmers pc
                     where pc.product_id = orders.product_id and pc.confirmer_id = auth.uid()))))
);

-- ما يتأكدش رقم في ليست نوار
create or replace function public.confirm_order(p_order bigint, p_lines jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare o public.orders; n integer; w integer;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'الطلبية ما كانتش'; end if;
  if not coalesce(public.is_manager()
       or (public.my_role() = 'confirmer' and public.product_confirmer(o.product_id) = auth.uid()), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  if public.is_blacklisted(o.phone) then raise exception 'هذا الرقم في ليست نوار'; end if;
  if o.status not in ('new', 'failed1', 'failed2', 'failed3', 'postponed') then
    raise exception 'هذي الطلبية ما بقاتش للتأكيد';
  end if;
  n := public._take_lines(p_order, p_lines);
  select wait_minutes * 60 into w from public.settings;
  update public.orders
     set status = 'wait', qty = n, confirmed_by = auth.uid(), confirmed_at = now(),
         wait_seconds = w, send_at = now() + make_interval(secs => w)
   where id = p_order;
  return now() + make_interval(secs => w);
end $$;

-- المدير يزيد رقم بيدو
create function public.blacklist_add(p_phone text, p_name text, p_reason text)
returns text language plpgsql security definer set search_path = public as $$
declare k text := public.phone_key(p_phone);
begin
  if not public.is_manager() then raise exception 'ما عندكش الصلاحية' using errcode = '42501'; end if;
  if length(k) not between 9 and 13 then raise exception 'دخل رقم هاتف صحيح'; end if;
  insert into public.blacklist (phone_key, phone, name, reason)
  values (k, trim(p_phone), nullif(trim(p_name), ''), coalesce(nullif(trim(p_reason), ''), 'المدير'))
  on conflict (phone_key) do nothing;
  return k;
end $$;

-- المؤكدة (طلبية تاعها) ولا السويفي (كولي تاع فرعو) يزيدو رقم الزبونة
create function public.blacklist_order(p_order bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; r public.app_role := public.my_role();
begin
  select * into o from public.orders where id = p_order;
  if not found then raise exception 'الطلبية ما كانتش'; end if;
  if not coalesce(r = 'manager'
       or (r = 'confirmer' and (o.confirmed_by = auth.uid() or public.product_confirmer(o.product_id) = auth.uid()))
       or (r = 'suivi' and exists (select 1 from public.parcels where order_id = o.id and branch_id = public.my_branch())), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  insert into public.blacklist (phone_key, phone, name, reason)
  values (public.phone_key(o.phone), o.phone, o.customer_name, coalesce(nullif(trim(p_reason), ''), 'بلا سبب'))
  on conflict (phone_key) do nothing;
end $$;

-- ---------- السويفي ----------
alter table public.parcels
  add column follow    text check (follow in ('لا يرد', 'رايح للمكتب', 'تفاهم مع الليفرور', 'أنيلاها', 'غير مطابقة', 'مؤجلة')),
  add column follow_at timestamptz,
  add column follow_by uuid references public.profiles (id);

-- السويفي يشوف كوليات فرعو اللي في التوصيل، بلا اللي رقمهم في ليست نوار.
create function public.suivi_parcels()
returns table (parcel_id bigint, order_id bigint, tracking text, delivery_company text, customer_name text, phone text,
               wilaya text, commune text, lines text, follow text, sent_at timestamptz, stub boolean)
language plpgsql stable security definer set search_path = public as $$
declare b uuid := public.my_branch();
begin
  if public.my_role() is distinct from 'suivi' or b is null then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  return query
    select pa.id, o.id, pa.tracking, pa.delivery_company, o.customer_name, o.phone, o.wilaya, o.commune,
           (select string_agg(l.product_name || ' · ' || l.color || ' / ' || l.size, ' + ' order by l.id)
              from public.order_lines l join public.variants v on v.id = l.variant_id
              join public.products p on p.id = v.product_id
             where l.order_id = o.id and p.branch_id = b),
           pa.follow, o.sent_at, pa.stub
    from public.parcels pa join public.orders o on o.id = pa.order_id
    where pa.branch_id = b and pa.status = 'sent' and not public.is_blacklisted(o.phone)
    order by o.sent_at desc;
end $$;

create function public.set_follow(p_parcel bigint, p_follow text)
returns void language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  select branch_id into b from public.parcels where id = p_parcel;
  if b is null then raise exception 'الكولي ما كانش'; end if;
  if not coalesce(public.is_manager() or (public.my_role() = 'suivi' and public.my_branch() = b), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  update public.parcels set follow = p_follow, follow_at = now(), follow_by = auth.uid() where id = p_parcel;
end $$;

revoke all on function public.blacklist_add(text, text, text), public.blacklist_order(bigint, text),
                       public.suivi_parcels(), public.set_follow(bigint, text), public.is_blacklisted(text) from public, anon;
grant execute on function public.blacklist_add(text, text, text), public.blacklist_order(bigint, text),
                          public.suivi_parcels(), public.set_follow(bigint, text), public.is_blacklisted(text) to authenticated;
