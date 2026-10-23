-- ربط شيتات جوجل: يقرا الأعمدة، المدير يطابقهم، والطلبات تدخل وحدها بلا تكرار.

alter table public.sheet_sources
  add column headers      jsonb not null default '[]'::jsonb,  -- أسماء الأعمدة كيما في الشيت
  add column preview      jsonb not null default '[]'::jsonb,  -- 3 سطور مثال (للمدير برك)
  add column start_row    integer not null default 2 check (start_row >= 2),  -- السطور القدام ما تدخلش
  add column last_status  text,                                -- ok / error
  add column last_message text,
  add column last_count   integer not null default 0,          -- قداش دخل في آخر تزامن
  add column imported_total integer not null default 0,
  add column last_errors  jsonb not null default '[]'::jsonb;  -- [{row, reason}] (20 الأخرين)

-- خانات الطلبية كيما تجي من الشيت (المؤكدة تحتاجهم باش تهدر مع الزبونة)
alter table public.orders
  add column notes          text,
  add column details        text,      -- التفاصيل كيما كتبتهم الزبونة (اللون، المقاس...)
  add column delivery_type  text,      -- المنزل / المكتب
  add column unit_price     numeric(12, 2) check (unit_price >= 0),
  add column delivery_price numeric(12, 2) check (delivery_price >= 0),
  add column discount       numeric(12, 2) check (discount >= 0),
  add column total_price    numeric(12, 2) check (total_price >= 0);

-- معلومات المصدر: المدير برك (المؤكدة ما تعرفش من وين جات)
alter table public.order_meta
  add column source_id  bigint references public.sheet_sources (id) on delete set null,
  add column row_number integer,
  add column sheet_ref  text,          -- رقم الطلبية في الشيت
  add column sheet_date text,          -- التاريخ كيما في الشيت
  add column extra      text;          -- الأعمدة الأخرى اللي ما تطابقوش: "عمود: قيمة | ..."

-- كل سطر دخل مرة وحدة. row_key = بصمة القيم (الاسم، الهاتف، المنتج، الكمية، التاريخ)
create table public.sheet_imports (
  source_id   bigint not null references public.sheet_sources (id) on delete cascade,
  row_key     text not null,
  row_number  integer not null,
  order_id    bigint references public.orders (id) on delete set null,
  imported_at timestamptz not null default now(),
  primary key (source_id, row_key)
);
alter table public.sheet_imports enable row level security;
create policy sheet_imports_read on public.sheet_imports for select to authenticated using (public.is_manager());
revoke all on public.sheet_imports from anon, authenticated;
grant select on public.sheet_imports to authenticated;

-- p_rows = [{key, row, ref, date, name, phone, address, wilaya, commune, delivery_type, product_id, product_name, details,
--           qty, price, delivery_price, discount, total, notes, extra}]  (الأرقام نصوص نظاف ولا فارغين)
-- يخدم من السيرفر برك (service_role). يرجع عدد الطلبات الجديدة.
create function public.import_sheet_orders(p_source bigint, p_rows jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare r jsonb; v_kind public.order_kind; v_name text; v_order bigint; n integer := 0;
begin
  select kind, name into v_kind, v_name from public.sheet_sources where id = p_source;
  if v_name is null then raise exception 'الشيت ما كانش'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into public.sheet_imports (source_id, row_key, row_number)
    values (p_source, r ->> 'key', (r ->> 'row')::integer)
    on conflict do nothing;
    if not found then continue; end if;
    insert into public.orders (customer_name, phone, address, wilaya, commune, delivery_type, product_id, product_name, details, qty,
                               unit_price, delivery_price, discount, total_price, notes)
    values (r ->> 'name', r ->> 'phone', nullif(r ->> 'address', ''), coalesce(nullif(r ->> 'wilaya', ''), 'غير محددة'),
            nullif(r ->> 'commune', ''), nullif(r ->> 'delivery_type', ''), (r ->> 'product_id')::uuid, r ->> 'product_name',
            nullif(r ->> 'details', ''), greatest(1, least(10, coalesce(nullif(r ->> 'qty', '')::integer, 1))),
            nullif(r ->> 'price', '')::numeric, nullif(r ->> 'delivery_price', '')::numeric,
            nullif(r ->> 'discount', '')::numeric, nullif(r ->> 'total', '')::numeric, nullif(r ->> 'notes', ''))
    returning id into v_order;
    insert into public.order_meta (order_id, kind, source, external_ref, source_id, row_number, sheet_ref, sheet_date, extra)
    values (v_order, v_kind, v_name, r ->> 'key', p_source, (r ->> 'row')::integer, nullif(r ->> 'ref', ''),
            nullif(r ->> 'date', ''), nullif(r ->> 'extra', ''));
    update public.sheet_imports set order_id = v_order where source_id = p_source and row_key = r ->> 'key';
    n := n + 1;
  end loop;
  update public.sheet_sources set imported_total = imported_total + n where id = p_source;
  return n;
end $$;
revoke all on function public.import_sheet_orders(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.import_sheet_orders(bigint, jsonb) to service_role;
