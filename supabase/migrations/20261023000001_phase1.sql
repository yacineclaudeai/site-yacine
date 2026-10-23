-- المرحلة 1: الحسابات والأدوار، الفروع، المنتجات والستوك، الجرد، الرتور، دفتر حساب الفرع.
-- القاعدة: الصلاحيات تتحكم فيها قاعدة البيانات (RLS)، ماشي الواجهة.
-- الستوك والدراهم ما يتبدلوش مباشرة: كل تغيير يمشي بدالة (RPC) ويتسجل في audit_log.

-- ---------- الأنواع ----------
create type public.app_role as enum ('manager', 'confirmer', 'branch', 'suivi', 'dispatch');
create type public.branch_type as enum ('half', 'salary', 'ads');           -- 50/50، شهرية، أدس فقط
create type public.movement_kind as enum ('add', 'count', 'return', 'correction');
create type public.ledger_type as enum ('collected', 'purchase', 'sent', 'ads');

-- ---------- الجداول ----------
create table public.branches (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(trim(name)) > 0),
  type             public.branch_type not null default 'half',
  delivery_company text,                -- اسم بركا في المرحلة 1، الربط بالـAPI في المرحلة 2
  delivery_account text,
  liquidity        bigint not null default 0 check (liquidity >= 0),  -- السيولة اللي يصرح بيها الفرع
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null check (length(trim(name)) > 0),
  email      text not null,
  phone      text,
  joined_at  date not null default current_date,
  role       public.app_role not null,
  branch_id  uuid references public.branches (id),
  locked     boolean not null default false,
  created_at timestamptz not null default now(),
  -- الفرع والسويفي لازم يكونو مربوطين بفرع، والباقي لا
  constraint profile_branch_matches_role check (
    (role in ('branch', 'suivi') and branch_id is not null)
    or (role not in ('branch', 'suivi') and branch_id is null)
  )
);
-- سويفي واحد لكل فرع
create unique index one_suivi_per_branch on public.profiles (branch_id) where role = 'suivi' and not locked;

create table public.products (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references public.branches (id),
  name       text not null check (length(trim(name)) > 0),
  price      integer not null default 0 check (price >= 0),
  min_qty    integer not null default 3 check (min_qty >= 0),
  pending    boolean not null default false,  -- منتج جديد زادو الفرع، ينتظر المدير يحط السعر
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_name_per_branch on public.products (branch_id, lower(trim(name)));

create table public.variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  color      text not null check (length(trim(color)) > 0),
  size       text not null check (length(trim(size)) > 0),
  stock      integer not null default 0 check (stock >= 0),
  counted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index variant_unique on public.variants (product_id, lower(trim(color)), lower(trim(size)));

create table public.stock_movements (
  id           bigint generated always as identity primary key,
  variant_id   uuid not null references public.variants (id) on delete cascade,
  kind         public.movement_kind not null,
  qty          integer not null,                 -- الفرق (+ ولا -)
  stock_before integer not null,
  stock_after  integer not null check (stock_after >= 0),
  note         text,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create index on public.stock_movements (variant_id, created_at desc);

create table public.stock_counts (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references public.branches (id),
  product_id uuid not null references public.products (id) on delete cascade,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.stock_count_lines (
  count_id   uuid not null references public.stock_counts (id) on delete cascade,
  variant_id uuid not null references public.variants (id) on delete cascade,
  expected   integer not null,
  counted    integer not null check (counted >= 0),
  primary key (count_id, variant_id)
);

create table public.returns (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references public.branches (id),
  variant_id uuid not null references public.variants (id),
  qty        integer not null check (qty between 1 and 70),
  parcel_ref text,                                 -- رقم التراكينغ، في المرحلة 2 يتربط بالكولي
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.ledger_entries (
  id         bigint generated always as identity primary key,
  branch_id  uuid not null references public.branches (id),
  type       public.ledger_type not null,
  amount     bigint not null check (amount <> 0),  -- سالب غير في التصحيح
  note       text,
  entry_day  date not null default current_date,
  reverses   bigint references public.ledger_entries (id),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  constraint negative_only_for_reversal check (amount > 0 or reverses is not null)
);
create index on public.ledger_entries (branch_id, entry_day desc);

create table public.audit_log (
  id       bigint generated always as identity primary key,
  actor    uuid,
  tbl      text not null,
  row_id   text,
  action   text not null,
  old_data jsonb,
  new_data jsonb,
  at       timestamptz not null default now()
);

-- ---------- دوال مساعدة للصلاحيات ----------
-- الحساب المبلوكي ما يرجعش دور، يعني ما يشوف والو.
create function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and not locked
$$;

create function public.my_branch() returns uuid
language sql stable security definer set search_path = public as $$
  select branch_id from public.profiles where id = auth.uid() and not locked
$$;

create function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'manager', false)
$$;

-- الفرع والسويفي تاعو يشوفو نفس الفرع
create function public.sees_branch(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_manager()
      or (public.my_role() in ('branch', 'suivi') and public.my_branch() = b)
$$;

create function public.product_branch(p uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select branch_id from public.products where id = p
$$;

create function public.variant_branch(v uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select p.branch_id from public.variants v2 join public.products p on p.id = v2.product_id where v2.id = v
$$;

-- ---------- السجل (audit) ----------
create function public.audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor, tbl, row_id, action, old_data, new_data)
  values (
    auth.uid(), tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_branches        after insert or update or delete on public.branches        for each row execute function public.audit();
create trigger audit_profiles        after insert or update or delete on public.profiles        for each row execute function public.audit();
create trigger audit_products        after insert or update or delete on public.products        for each row execute function public.audit();
create trigger audit_variants        after insert or update or delete on public.variants        for each row execute function public.audit();
create trigger audit_stock_movements after insert on public.stock_movements                      for each row execute function public.audit();
create trigger audit_returns         after insert on public.returns                              for each row execute function public.audit();
create trigger audit_ledger          after insert on public.ledger_entries                       for each row execute function public.audit();

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger products_touch before update on public.products for each row execute function public.touch_updated_at();

-- الدفتر والحركات ما يتبدلوش ما يتمسحوش: التصحيح بحركة معاكسة.
create function public.forbid_change() returns trigger language plpgsql as $$
begin raise exception 'هذا السجل ما يتبدلش وما يتمسحش، دير حركة تصحيح'; end $$;
create trigger ledger_immutable    before update or delete on public.ledger_entries  for each row execute function public.forbid_change();
create trigger movements_immutable before update or delete on public.stock_movements for each row execute function public.forbid_change();
create trigger returns_immutable   before update or delete on public.returns         for each row execute function public.forbid_change();

-- ---------- RLS ----------
alter table public.branches          enable row level security;
alter table public.profiles          enable row level security;
alter table public.products          enable row level security;
alter table public.variants          enable row level security;
alter table public.stock_movements   enable row level security;
alter table public.stock_counts      enable row level security;
alter table public.stock_count_lines enable row level security;
alter table public.returns           enable row level security;
alter table public.ledger_entries    enable row level security;
alter table public.audit_log         enable row level security;

-- branches
create policy branches_read  on public.branches for select to authenticated using (public.sees_branch(id));
create policy branches_write on public.branches for all    to authenticated using (public.is_manager()) with check (public.is_manager());

-- profiles: كل واحد يشوف روحو، المدير يشوف الكل. الخلق من السيرفر (admin API) غير.
create policy profiles_read  on public.profiles for select to authenticated using (id = auth.uid() or public.is_manager());
create policy profiles_write on public.profiles for update to authenticated using (public.is_manager()) with check (public.is_manager());

-- products / variants: الفرع والسويفي يقراو تاع فرعهم. الكتابة للمدير (الفرع يزيد بالـRPC).
create policy products_read  on public.products for select to authenticated using (public.sees_branch(branch_id));
create policy products_write on public.products for all    to authenticated using (public.is_manager()) with check (public.is_manager());

create policy variants_read  on public.variants for select to authenticated using (public.sees_branch(public.product_branch(product_id)));
create policy variants_write on public.variants for all    to authenticated using (public.is_manager()) with check (public.is_manager());

create policy movements_read on public.stock_movements for select to authenticated using (public.sees_branch(public.variant_branch(variant_id)));
create policy counts_read    on public.stock_counts    for select to authenticated using (public.sees_branch(branch_id));
create policy count_lines_read on public.stock_count_lines for select to authenticated
  using (exists (select 1 from public.stock_counts c where c.id = count_id and public.sees_branch(c.branch_id)));
create policy returns_read   on public.returns         for select to authenticated using (public.sees_branch(branch_id));

-- الدفتر: المدير يكتب، الفرع يقرا تاعو. السويفي ما يشوفش الدراهم.
create policy ledger_read on public.ledger_entries for select to authenticated
  using (public.is_manager() or (public.my_role() = 'branch' and branch_id = public.my_branch()));
create policy ledger_insert on public.ledger_entries for insert to authenticated
  with check (public.is_manager() and created_by = auth.uid());

create policy audit_read on public.audit_log for select to authenticated using (public.is_manager());

-- الصلاحيات على مستوى الجداول: anon ما يقرا والو، والستوك ما يتبدلش مباشرة حتى من المدير.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.branches, public.products to authenticated;
grant update (name, phone, joined_at, role, branch_id, locked) on public.profiles to authenticated;
grant insert (product_id, color, size), update (color, size), delete on public.variants to authenticated;
grant insert (branch_id, type, amount, note, entry_day, reverses) on public.ledger_entries to authenticated;

-- ---------- الدوال (RPC) ----------
-- حركة ستوك واحدة: تقفل السطر، تحسب، وتكتب الحركة. داخلية، ما تتناداش من برا.
create function public._move_stock(p_variant uuid, p_delta integer, p_kind public.movement_kind, p_note text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_before integer; v_after integer;
begin
  select stock into v_before from public.variants where id = p_variant for update;
  if not found then raise exception 'المتغير ما كانش'; end if;
  v_after := v_before + p_delta;
  if v_after < 0 then raise exception 'الستوك ما يقدرش يولي تحت الصفر'; end if;
  update public.variants set stock = v_after where id = p_variant;
  insert into public.stock_movements (variant_id, kind, qty, stock_before, stock_after, note, created_by)
  values (p_variant, p_kind, p_delta, v_before, v_after, p_note, auth.uid());
  return v_after;
end $$;
revoke all on function public._move_stock(uuid, integer, public.movement_kind, text) from public, anon, authenticated;

-- وصلت سلعة: الفرع يكتب اسم المنتج واللون والمقاس والكمية.
-- إذا المنتج كاين في الفرع تتزاد الكمية، وإذا جديد يتسجل pending وينتظر المدير.
create function public.add_stock(p_branch uuid, p_product_name text, p_color text, p_size text, p_qty integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_role public.app_role := public.my_role(); v_product uuid; v_variant uuid;
begin
  if not coalesce(v_role = 'manager' or (v_role = 'branch' and public.my_branch() = p_branch), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 100000 then raise exception 'الكمية لازم تكون من 1 لـ100000'; end if;
  if coalesce(trim(p_product_name), '') = '' or coalesce(trim(p_color), '') = '' or coalesce(trim(p_size), '') = '' then
    raise exception 'دخل اسم المنتج واللون والمقاس';
  end if;

  select id into v_product from public.products
   where branch_id = p_branch and lower(trim(name)) = lower(trim(p_product_name));
  if v_product is null then
    insert into public.products (branch_id, name, pending) values (p_branch, trim(p_product_name), v_role <> 'manager')
    returning id into v_product;
  end if;

  select id into v_variant from public.variants
   where product_id = v_product and lower(trim(color)) = lower(trim(p_color)) and lower(trim(size)) = lower(trim(p_size));
  if v_variant is null then
    insert into public.variants (product_id, color, size) values (v_product, trim(p_color), trim(p_size))
    returning id into v_variant;
  end if;

  perform public._move_stock(v_variant, p_qty, 'add', 'وصلت سلعة');
  return v_variant;
end $$;

-- العد اليومي: الفرع يدخل العدد الحقيقي لكل لون ومقاس، والفرق يتسجل حركة 'count'.
-- p_lines = [{"variant_id": "...", "counted": 12}, ...]
create function public.submit_stock_count(p_product uuid, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_branch uuid := public.product_branch(p_product); v_role public.app_role := public.my_role();
        v_count uuid; l jsonb; v_variant uuid; v_counted integer; v_expected integer;
begin
  if v_branch is null then raise exception 'المنتج ما كانش'; end if;
  if not coalesce(v_role = 'manager' or (v_role = 'branch' and public.my_branch() = v_branch), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  insert into public.stock_counts (branch_id, product_id, created_by) values (v_branch, p_product, auth.uid())
  returning id into v_count;

  for l in select * from jsonb_array_elements(p_lines) loop
    v_variant := (l ->> 'variant_id')::uuid;
    v_counted := (l ->> 'counted')::integer;
    if v_counted is null or v_counted < 0 then raise exception 'العدد لازم يكون 0 ولا أكثر'; end if;
    select stock into v_expected from public.variants where id = v_variant and product_id = p_product for update;
    if not found then raise exception 'المتغير ماشي تاع هذا المنتج'; end if;
    insert into public.stock_count_lines (count_id, variant_id, expected, counted) values (v_count, v_variant, v_expected, v_counted);
    if v_counted <> v_expected then
      perform public._move_stock(v_variant, v_counted - v_expected, 'count', 'العد اليومي');
    end if;
    update public.variants set counted_at = now() where id = v_variant;
  end loop;
  return v_count;
end $$;

-- رتور: الفرع يختار المنتج واللون والمقاس والكمية (1 لـ70). الستوك يرجع.
create function public.record_return(p_variant uuid, p_qty integer, p_parcel_ref text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_branch uuid := public.variant_branch(p_variant); v_role public.app_role := public.my_role(); v_id uuid;
begin
  if v_branch is null then raise exception 'المتغير ما كانش'; end if;
  if not coalesce(v_role = 'manager' or (v_role = 'branch' and public.my_branch() = v_branch), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  if p_qty is null or p_qty < 1 or p_qty > 70 then raise exception 'الكمية لازم تكون من 1 لـ70'; end if;
  insert into public.returns (branch_id, variant_id, qty, parcel_ref, created_by)
  values (v_branch, p_variant, p_qty, nullif(trim(p_parcel_ref), ''), auth.uid()) returning id into v_id;
  perform public._move_stock(p_variant, p_qty, 'return', 'رتور');
  return v_id;
end $$;

-- الفرع يحدث السيولة تاعو غير
create function public.set_liquidity(p_amount bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'branch' or public.my_branch() is null then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 then raise exception 'المبلغ لازم يكون 0 ولا أكثر'; end if;
  update public.branches set liquidity = p_amount where id = public.my_branch();
end $$;

-- المدير يصحح الستوك يدويا (بحركة 'correction' مع سبب)
create function public.correct_stock(p_variant uuid, p_delta integer, p_note text)
returns integer language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'ما عندكش الصلاحية' using errcode = '42501'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'اكتب سبب التصحيح'; end if;
  return public._move_stock(p_variant, p_delta, 'correction', p_note);
end $$;

revoke all on function public.add_stock(uuid, text, text, text, integer)  from public, anon;
revoke all on function public.submit_stock_count(uuid, jsonb)              from public, anon;
revoke all on function public.record_return(uuid, integer, text)           from public, anon;
revoke all on function public.set_liquidity(bigint)                        from public, anon;
revoke all on function public.correct_stock(uuid, integer, text)           from public, anon;
grant execute on function public.add_stock(uuid, text, text, text, integer) to authenticated;
grant execute on function public.submit_stock_count(uuid, jsonb)             to authenticated;
grant execute on function public.record_return(uuid, integer, text)          to authenticated;
grant execute on function public.set_liquidity(bigint)                       to authenticated;
grant execute on function public.correct_stock(uuid, integer, text)          to authenticated;

-- ---------- Views (تحترم RLS تاع اللي يقرا) ----------
create view public.branch_balances with (security_invoker = true) as
select b.id as branch_id,
       coalesce(sum(e.amount) filter (where e.type = 'collected'), 0) as collected,
       coalesce(sum(e.amount) filter (where e.type = 'purchase'), 0)  as purchase,
       coalesce(sum(e.amount) filter (where e.type = 'sent'), 0)      as sent,
       coalesce(sum(e.amount) filter (where e.type = 'ads'), 0)       as ads,
       coalesce(sum(e.amount) filter (where e.type = 'collected'), 0)
     - coalesce(sum(e.amount) filter (where e.type = 'purchase'), 0)
     - coalesce(sum(e.amount) filter (where e.type = 'sent'), 0)      as held
from public.branches b
left join public.ledger_entries e on e.branch_id = b.id
group by b.id;

create view public.stock_alerts with (security_invoker = true) as
select v.id as variant_id, p.id as product_id, p.branch_id, p.name as product_name, v.color, v.size, v.stock, p.min_qty
from public.variants v join public.products p on p.id = v.product_id
where p.active and v.stock <= p.min_qty;

grant select on public.branch_balances, public.stock_alerts to authenticated;
