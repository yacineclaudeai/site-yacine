-- تيستات استيراد الشيت: السيرفر برك، بلا تكرار، والمؤكدة ما تعرفش المصدر.
\set ON_ERROR_STOP 1
begin;

create schema tests;
grant usage on schema tests to authenticated, anon, service_role;
create function tests.login(p_email text) returns void language plpgsql security definer as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from auth.users where email = p_email))::text, true);
end $$;
create function tests.eq(got numeric, want numeric, what text) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL %: got %, want %', what, got, want; end if;
  raise notice 'ok  %', what;
end $$;
create function tests.ok(cond boolean, what text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL %', what; end if;
  raise notice 'ok  %', what;
end $$;
create function tests.throws(q text, what text) returns void language plpgsql as $$
begin
  begin execute q;
  exception when others then raise notice 'ok  % (%)', what, sqlerrm; return;
  end;
  raise exception 'FAIL %: expected an error', what;
end $$;
grant execute on all functions in schema tests to authenticated, anon, service_role;

insert into auth.users (id, email) select gen_random_uuid(), e from (values ('manager@test'), ('conf@test')) as t(e);
insert into public.profiles (id, name, email, role)
select u.id, u.email, u.email, x.role::public.app_role
from auth.users u join (values ('manager@test', 'manager'), ('conf@test', 'confirmer')) as x(email, role) on x.email = u.email;
insert into product_confirmers values ('00000000-0000-0000-0000-0000000000a1', (select id from profiles where email = 'conf@test'));
update sheet_sources set kind = 'abandoned' where id = (select min(id) from sheet_sources);

create temp table rows as select (select min(id) from sheet_sources) as src, jsonb_build_array(
  jsonb_build_object('key', 'ref:0551000001:49462', 'row', 2, 'ref', '49462', 'date', '23/10/2026 20:30', 'name', 'زبونة شيت',
    'phone', '0551000001', 'address', 'حي 100 مسكن', 'wilaya', 'تلمسان', 'commune', 'الرمشي', 'delivery_type', 'المنزل',
    'product_id', '00000000-0000-0000-0000-0000000000a1', 'product_name', 'بيجامة قطيفة', 'details', 'couleur: Rouge Taille: L',
    'qty', 2, 'price', '2900', 'delivery_price', '700', 'discount', '', 'total', '6500', 'notes', 'بعد العصر',
    'extra', 'Country: Algeria'),
  jsonb_build_object('key', 'h2', 'row', 3, 'ref', '', 'date', '', 'name', 'زبون 2', 'phone', '0551000002', 'address', '',
    'wilaya', '', 'commune', '', 'delivery_type', '', 'product_id', '00000000-0000-0000-0000-0000000000a1',
    'product_name', 'بيجامة قطيفة', 'details', '', 'qty', 1, 'price', '', 'delivery_price', '', 'discount', '', 'total', '',
    'notes', '', 'extra', '')) as r;
grant select on rows to authenticated, service_role;

-- ===== ما يعيطلهاش غير السيرفر =====
set local role authenticated;
select tests.login('manager@test');
select tests.throws($$select import_sheet_orders((select src from rows), (select r from rows))$$, 'manager cannot call import directly');
select tests.throws($$select * from sheet_imports where false; insert into sheet_imports values (1, 'x', 2)$$, 'manager cannot write sheet_imports');
reset role;
set local role anon;
select tests.throws($$select import_sheet_orders(1, '[]')$$, 'anon cannot import');
reset role;

set local role service_role;
select tests.eq(import_sheet_orders((select src from rows), (select r from rows)), 2, 'server imports 2 rows');
select tests.eq(import_sheet_orders((select src from rows), (select r from rows)), 0, 're-sync imports nothing (no duplicates)');
reset role;

select tests.eq((select imported_total from sheet_sources where id = (select src from rows)), 2, 'imported_total counted once');
select tests.ok((select status = 'new' and address = 'حي 100 مسكن' and delivery_type = 'المنزل' and total_price = 6500
                   and delivery_price = 700 and unit_price = 2900 and qty = 2 and details like 'couleur%'
                 from orders where phone = '0551000001'), 'sheet fields land on the order');
select tests.ok((select wilaya = 'غير محددة' and unit_price is null from orders where phone = '0551000002'), 'empty wilaya/price are tolerated');
select tests.ok((select kind = 'abandoned' and sheet_ref = '49462' and extra = 'Country: Algeria' and row_number = 2
                 from order_meta m join orders o on o.id = m.order_id where o.phone = '0551000001'), 'meta keeps kind, ref and other columns');

-- ===== المؤكدة تشوف الطلبية، بلا المصدر =====
set local role authenticated;
select tests.login('conf@test');
select tests.eq((select count(*) from orders where phone in ('0551000001', '0551000002')), 2, 'confirmer gets imported orders in her queue');
select tests.eq((select count(*) from order_meta), 0, 'confirmer cannot see source/abandoned/other columns');
select tests.eq((select count(*) from sheet_imports), 0, 'confirmer cannot see sheet_imports');
select tests.eq((select count(*) from sheet_sources), 0, 'confirmer cannot see sheet sources');
reset role;

select tests.ok((select count(*) from audit_log where tbl = 'orders') >= 2, 'imported orders are audited');

rollback;
