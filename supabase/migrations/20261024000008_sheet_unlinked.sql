-- ربط الشيت v3: كل الطلبات تطلع في قسم الطلبات حتى قبل ربط المنتج.
-- الطلبية اللي منتجها ما تربطش تبقى عند المدير برك (المؤكدات يشوفو غير المنتجات اللي عطاهملهم).
-- كي المدير يربط المنتج، الطلبات القدام تاعو تتربط وحدها.

create or replace function public.import_sheet_orders(p_source bigint, p_rows jsonb)
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
            nullif(r ->> 'commune', ''), nullif(r ->> 'delivery_type', ''), nullif(r ->> 'product_id', '')::uuid, r ->> 'product_name',
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

-- البصمات اللي دخلو من قبل (باش السيرفر ما يعاودش يبعث 25 ألف سطر كل دقيقة)
create or replace function public.sheet_keys(p_source bigint)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(row_key), '{}') from public.sheet_imports where source_id = p_source
$$;

-- يربط الطلبات اللي جاو من الشيت بلا منتج: p_map = {"نص المنتج (صغير)": product_id}
create or replace function public.apply_product_map(p_source bigint, p_map jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.orders o set product_id = (p_map ->> lower(regexp_replace(trim(o.product_name), '\s+', ' ', 'g')))::uuid
  from public.order_meta m
  where m.order_id = o.id and m.source_id = p_source and o.product_id is null
    and p_map ? lower(regexp_replace(trim(o.product_name), '\s+', ' ', 'g'));
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.import_sheet_orders(bigint, jsonb), public.sheet_keys(bigint), public.apply_product_map(bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.import_sheet_orders(bigint, jsonb), public.sheet_keys(bigint), public.apply_product_map(bigint, jsonb)
  to service_role;
