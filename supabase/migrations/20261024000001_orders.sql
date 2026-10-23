-- المرحلة 2، الخطوة 1: الطلبات، التأكيد، وقت الانتظار (10 دقايق ما يتعاودش)، والإرسال.
-- الإرسال لشركة التوصيل مازال تجريبي (stub): رقم تتبع "STUB-..." حتى نجيبو وثائق الـAPI.

alter type public.movement_kind add value if not exists 'order';         -- قطعة خرجت مع طلبية مؤكدة
alter type public.movement_kind add value if not exists 'order_cancel';  -- رجعت للستوك كي تلغات ولا تبدلت في الانتظار

create type public.order_status as enum
  ('new', 'failed1', 'failed2', 'failed3', 'postponed', 'dup', 'cancelled', 'wait', 'sent', 'returned');
create type public.order_kind as enum ('normal', 'abandoned');
create type public.parcel_status as enum ('sent', 'delivered', 'returned');

-- ---------- الإعدادات (سطر واحد) ----------
create table public.settings (
  id           boolean primary key default true check (id),
  wait_minutes integer not null default 10 check (wait_minutes between 0 and 1440),
  updated_at   timestamptz not null default now()
);
insert into public.settings default values;

-- ---------- توزيع المنتجات على المؤكدات ----------
create table public.product_confirmers (
  product_id   uuid primary key references public.products (id) on delete cascade,
  confirmer_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now()
);

create function public.check_confirmer() returns trigger language plpgsql as $$
begin
  if (select role from public.profiles where id = new.confirmer_id) is distinct from 'confirmer' then
    raise exception 'هذا الحساب ماشي مؤكدة';
  end if;
  return new;
end $$;
create trigger product_confirmers_check before insert or update on public.product_confirmers
  for each row execute function public.check_confirmer();

-- ---------- الطلبات ----------
create table public.orders (
  id            bigint generated always as identity primary key,
  customer_name text not null check (length(trim(customer_name)) > 0),
  phone         text not null check (length(regexp_replace(phone, '\D', '', 'g')) between 9 and 13),
  wilaya        text not null check (length(trim(wilaya)) > 0),
  commune       text,
  address       text,
  product_id    uuid references public.products (id),  -- المنتج اللي طلبتو الزبونة
  product_name  text not null,                         -- نسخة من الاسم وقت الطلب
  qty           integer not null default 1 check (qty between 1 and 10),
  status        public.order_status not null default 'new',
  confirmed_by  uuid references public.profiles (id),
  confirmed_at  timestamptz,
  wait_seconds  integer,                                -- المدة الكاملة (للدائرة)
  send_at       timestamptz,                            -- تتحسب مرة وحدة كي تتأكد، وما تتعاودش
  sent_at       timestamptz,
  sent_by       uuid references public.profiles (id),  -- null = تلقائي
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index orders_status_idx on public.orders (status);
create index orders_confirmed_by_idx on public.orders (confirmed_by, confirmed_at);
create index orders_send_at_idx on public.orders (send_at) where status = 'wait';

-- النوع (عادية/متروكة) والمصدر في جدول وحدو: المؤكدات ما يقدروش يقراوه.
create table public.order_meta (
  order_id     bigint primary key references public.orders (id) on delete cascade,
  kind         public.order_kind not null default 'normal',
  source       text,           -- اسم الشيت، ولا "إدخال يدوي"
  external_ref text,           -- رقم السطر في الشيت (المرحلة الجاية)
  created_by   uuid references auth.users (id)
);

-- كل قطعة سطر. نسخة من الاسم واللون والمقاس والسعر، وبلا فرع (المؤكدة ما تعرفش الفروع).
create table public.order_lines (
  id           bigint generated always as identity primary key,
  order_id     bigint not null references public.orders (id) on delete cascade,
  variant_id   uuid not null references public.variants (id),
  product_name text not null,
  color        text not null,
  size         text not null,
  unit_price   integer not null check (unit_price >= 0)
);
create index order_lines_order_idx on public.order_lines (order_id);

-- كولي لكل فرع في الطلبية (رقم تتبع وسعر توصيل وحدهم).
create table public.parcels (
  id               bigint generated always as identity primary key,
  order_id         bigint not null references public.orders (id) on delete cascade,
  branch_id        uuid not null references public.branches (id),
  delivery_company text,
  tracking         text,
  delivery_price   integer,
  status           public.parcel_status not null default 'sent',
  stub             boolean not null default true,  -- true = ما تبعثش بصح لشركة التوصيل
  created_at       timestamptz not null default now(),
  unique (order_id, branch_id)
);
create index parcels_branch_idx on public.parcels (branch_id, status);

create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();

create trigger audit_settings           after insert or update or delete on public.settings           for each row execute function public.audit();
create trigger audit_product_confirmers after insert or update or delete on public.product_confirmers for each row execute function public.audit();
create trigger audit_orders             after insert or update or delete on public.orders             for each row execute function public.audit();
create trigger audit_order_meta         after insert or update or delete on public.order_meta         for each row execute function public.audit();
create trigger audit_order_lines        after insert or update or delete on public.order_lines        for each row execute function public.audit();
create trigger audit_parcels            after insert or update or delete on public.parcels            for each row execute function public.audit();

-- ---------- RLS ----------
alter table public.settings           enable row level security;
alter table public.product_confirmers enable row level security;
alter table public.orders             enable row level security;
alter table public.order_meta         enable row level security;
alter table public.order_lines        enable row level security;
alter table public.parcels            enable row level security;

create policy settings_read  on public.settings for select to authenticated using (public.my_role() is not null);
create policy settings_write on public.settings for update to authenticated using (public.is_manager()) with check (public.is_manager());

create policy pc_read  on public.product_confirmers for select to authenticated
  using (public.is_manager() or confirmer_id = auth.uid() and public.my_role() = 'confirmer');
create policy pc_write on public.product_confirmers for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- المؤكدة تشوف: الطلبات اللي للتأكيد تاع المنتجات اللي عطاهالها المدير، واللي أكدتها هي.
-- عامل الإرسال يشوف اللي في الانتظار واللي تبعثو. الفرع يشوف الكوليات تاعو بالدالة branch_parcels().
create policy orders_read on public.orders for select to authenticated using (
  public.is_manager()
  or (public.my_role() = 'dispatch' and status in ('wait', 'sent'))
  or (public.my_role() = 'confirmer' and (
        confirmed_by = auth.uid()
     or (status in ('new', 'failed1', 'failed2', 'failed3', 'postponed')
         and exists (select 1 from public.product_confirmers pc
                     where pc.product_id = orders.product_id and pc.confirmer_id = auth.uid()))))
);
create policy order_meta_read  on public.order_meta  for select to authenticated using (public.is_manager());
create policy order_lines_read on public.order_lines for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy parcels_read on public.parcels for select to authenticated using (public.is_manager());

grant select on public.settings, public.product_confirmers, public.orders, public.order_meta, public.order_lines, public.parcels to authenticated;
grant update (wait_minutes) on public.settings to authenticated;
grant insert, update, delete on public.product_confirmers to authenticated;
-- الطلبات والقطع والكوليات ما تتكتبش مباشرة: غير بالدوال اللي تحت.

-- ---------- دوال داخلية ----------
-- تزيد القطع وتنقص الستوك. p_lines = [{"variant_id": "..."}, ...] (كل عنصر قطعة وحدة)
create function public._take_lines(p_order bigint, p_lines jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare l jsonb; v record; n integer := 0;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 10 then
    raise exception 'لازم من قطعة وحدة لـ10 قطع';
  end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    select vr.id, vr.color, vr.size, vr.stock, p.name, p.price into v
    from public.variants vr join public.products p on p.id = vr.product_id
    where vr.id = (l ->> 'variant_id')::uuid and p.active and not p.pending
    for update of vr;
    if not found then raise exception 'المنتج ولا اللون ما كانش'; end if;
    if v.stock < 1 then raise exception 'الكمية المتوفرة من % (% / %) ما تكفيش', v.name, v.color, v.size; end if;
    perform public._move_stock(v.id, -1, 'order', 'طلبية #' || p_order);
    insert into public.order_lines (order_id, variant_id, product_name, color, size, unit_price)
    values (p_order, v.id, v.name, v.color, v.size, v.price);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ترجع القطع للستوك وتمسحهم
create function public._release_lines(p_order bigint) returns void
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  for l in select id, variant_id from public.order_lines where order_id = p_order loop
    perform public._move_stock(l.variant_id, 1, 'order_cancel', 'طلبية #' || p_order);
    delete from public.order_lines where id = l.id;
  end loop;
end $$;

-- الإرسال: كولي لكل فرع. STUB حتى نربطو API تاع شركات التوصيل.
create function public._send_order(p_order bigint, p_by uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b record;
begin
  perform 1 from public.orders where id = p_order and status = 'wait' for update;
  if not found then raise exception 'هذي الطلبية ماراهيش في الانتظار'; end if;
  for b in
    select distinct p.branch_id, br.delivery_company
    from public.order_lines l
    join public.variants v on v.id = l.variant_id
    join public.products p on p.id = v.product_id
    join public.branches br on br.id = p.branch_id
    where l.order_id = p_order
  loop
    insert into public.parcels (order_id, branch_id, delivery_company, tracking, stub)
    values (p_order, b.branch_id, b.delivery_company,
            'STUB-' || p_order || '-' || upper(substr(md5(random()::text), 1, 4)), true);
  end loop;
  update public.orders set status = 'sent', sent_at = now(), sent_by = p_by where id = p_order;
end $$;

-- المؤكدة المسؤولة على منتج
create function public.product_confirmer(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select confirmer_id from public.product_confirmers where product_id = p
$$;

-- ---------- دوال للواجهة ----------
-- المنتجات المتوفرة للتأكيد: بلا فرع.
create function public.order_catalog()
returns table (product_id uuid, product_name text, price integer, variant_id uuid, color text, size text, stock integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(public.my_role() in ('manager', 'confirmer', 'dispatch'), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.price, v.id, v.color, v.size, v.stock
    from public.products p join public.variants v on v.product_id = p.id
    where p.active and not p.pending
    order by p.name, v.color, v.size;
end $$;

-- المدير يدخل طلبية بيدو (الشيتات تجي من بعد)
create function public.create_order(p_name text, p_phone text, p_wilaya text, p_commune text,
                                    p_product uuid, p_qty integer, p_kind public.order_kind default 'normal')
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_name text;
begin
  if not public.is_manager() then raise exception 'ما عندكش الصلاحية' using errcode = '42501'; end if;
  select name into v_name from public.products where id = p_product;
  if v_name is null then raise exception 'اختار المنتج'; end if;
  insert into public.orders (customer_name, phone, wilaya, commune, product_id, product_name, qty)
  values (trim(p_name), trim(p_phone), trim(p_wilaya), nullif(trim(p_commune), ''), p_product, v_name, coalesce(p_qty, 1))
  returning id into v_id;
  insert into public.order_meta (order_id, kind, source, created_by) values (v_id, coalesce(p_kind, 'normal'), 'إدخال يدوي', auth.uid());
  return v_id;
end $$;

-- التأكيد: القطع تخرج من الستوك، والطلبية تستنى wait_minutes وبعدها تتبعث وحدها.
create function public.confirm_order(p_order bigint, p_lines jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare o public.orders; n integer; w integer;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'الطلبية ما كانتش'; end if;
  if not coalesce(public.is_manager()
       or (public.my_role() = 'confirmer' and public.product_confirmer(o.product_id) = auth.uid()), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
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

-- ما جاوبش / تأجيل / مكررة / إلغاء (قبل التأكيد)
create function public.mark_order(p_order bigint, p_action text)
returns public.order_status language plpgsql security definer set search_path = public as $$
declare o public.orders; s public.order_status;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'الطلبية ما كانتش'; end if;
  if not coalesce(public.is_manager()
       or (public.my_role() = 'confirmer' and public.product_confirmer(o.product_id) = auth.uid()), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  if o.status not in ('new', 'failed1', 'failed2', 'failed3', 'postponed') then
    raise exception 'هذي الطلبية ما بقاتش للتأكيد';
  end if;
  s := case p_action
    when 'noans' then (case o.status when 'failed1' then 'failed2' when 'failed2' then 'failed3'
                                     when 'failed3' then 'failed3' else 'failed1' end)::public.order_status
    when 'postpone' then 'postponed'
    when 'dup' then 'dup'
    when 'cancel' then 'cancelled'
  end;
  if s is null then raise exception 'عملية ما نعرفهاش'; end if;
  update public.orders set status = s where id = p_order;
  return s;
end $$;

-- تبدل القطع في الانتظار. الوقت ما يتعاودش.
create function public.update_waiting_lines(p_order bigint, p_lines jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; n integer;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'الطلبية ما كانتش'; end if;
  if not coalesce(public.is_manager() or (public.my_role() = 'confirmer' and o.confirmed_by = auth.uid()), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  if o.status <> 'wait' then raise exception 'الطلبية تبعثت، ما تقدرش تبدلها'; end if;
  perform public._release_lines(p_order);
  n := public._take_lines(p_order, p_lines);
  update public.orders set qty = n where id = p_order;  -- send_at ما يتبدلش
end $$;

-- إلغاء في الانتظار: القطع ترجع للستوك، والـ50 دج تتنحى (الحساب يعد غير wait/sent/returned).
create function public.cancel_waiting(p_order bigint)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'الطلبية ما كانتش'; end if;
  if not coalesce(public.is_manager() or (public.my_role() = 'confirmer' and o.confirmed_by = auth.uid()), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  if o.status <> 'wait' then raise exception 'الطلبية تبعثت، ما تقدرش تلغيها'; end if;
  perform public._release_lines(p_order);
  update public.orders set status = 'cancelled' where id = p_order;
end $$;

-- ابعث الآن: المدير ولا عامل الإرسال
create function public.send_now(p_order bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(public.my_role() in ('manager', 'dispatch'), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  perform public._send_order(p_order, auth.uid());
end $$;

create function public.send_all_waiting()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not coalesce(public.my_role() in ('manager', 'dispatch'), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  for r in select id from public.orders where status = 'wait' order by send_at loop
    perform public._send_order(r.id, auth.uid()); n := n + 1;
  end loop;
  return n;
end $$;

-- الإرسال التلقائي: يبعث غير اللي فات وقتهم. يخدم بـpg_cron كل دقيقة، والصفحات تعيطلو تاني.
create function public.send_due_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id from public.orders where status = 'wait' and send_at <= now() order by send_at
           for update skip locked loop
    perform public._send_order(r.id, null); n := n + 1;
  end loop;
  return n;
end $$;

-- الفرع يشوف الكوليات تاعو للتغليف: القطع تاعو غير، بلا اسم ولا رقم الزبونة.
create function public.branch_parcels()
returns table (parcel_id bigint, tracking text, delivery_company text, status public.parcel_status,
               sent_at timestamptz, wilaya text, commune text, lines text)
language plpgsql stable security definer set search_path = public as $$
declare b uuid := public.my_branch();
begin
  if public.my_role() is distinct from 'branch' or b is null then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  return query
    select pa.id, pa.tracking, pa.delivery_company, pa.status, o.sent_at, o.wilaya, o.commune,
           (select string_agg(l.product_name || ' · ' || l.color || ' / ' || l.size, ' + ' order by l.id)
              from public.order_lines l join public.variants v on v.id = l.variant_id
              join public.products p on p.id = v.product_id
             where l.order_id = o.id and p.branch_id = b)
    from public.parcels pa join public.orders o on o.id = pa.order_id
    where pa.branch_id = b
    order by o.sent_at desc;
end $$;

revoke all on function public._take_lines(bigint, jsonb), public._release_lines(bigint), public._send_order(bigint, uuid),
                       public.product_confirmer(uuid) from public, anon, authenticated;
revoke all on function public.order_catalog(), public.create_order(text, text, text, text, uuid, integer, public.order_kind),
                       public.confirm_order(bigint, jsonb), public.mark_order(bigint, text),
                       public.update_waiting_lines(bigint, jsonb), public.cancel_waiting(bigint),
                       public.send_now(bigint), public.send_all_waiting(), public.send_due_orders(),
                       public.branch_parcels() from public, anon;
grant execute on function public.order_catalog(), public.create_order(text, text, text, text, uuid, integer, public.order_kind),
                          public.confirm_order(bigint, jsonb), public.mark_order(bigint, text),
                          public.update_waiting_lines(bigint, jsonb), public.cancel_waiting(bigint),
                          public.send_now(bigint), public.send_all_waiting(), public.send_due_orders(),
                          public.branch_parcels() to authenticated;
