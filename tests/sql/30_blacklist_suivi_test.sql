-- تيستات ليست نوار والسويفي.
\set ON_ERROR_STOP 1
begin;

create schema tests;
grant usage on schema tests to authenticated, anon;
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
-- قطع: (منتج، لون، مقاس) → jsonb
create function tests.pieces(variadic k text[]) returns jsonb language sql security definer as $$
  select jsonb_agg(jsonb_build_object('variant_id', v.id))
  from unnest(k) with ordinality as x(s, i)
  join public.products p on p.name = split_part(x.s, '|', 1)
  join public.variants v on v.product_id = p.id and v.color = split_part(x.s, '|', 2) and v.size = split_part(x.s, '|', 3)
$$;
create function tests.stock(k text) returns integer language sql security definer as $$
  select v.stock from public.products p join public.variants v on v.product_id = p.id
  where p.name = split_part(k, '|', 1) and v.color = split_part(k, '|', 2) and v.size = split_part(k, '|', 3)
$$;
create function tests.oid(n text) returns bigint language sql security definer as $$
  select id from public.orders where customer_name = n
$$;
create function tests.st(n text) returns text language sql security definer as $$
  select status::text from public.orders where customer_name = n
$$;
create function tests.parcel(n text, b text) returns bigint language sql security definer as $$
  select pa.id from public.parcels pa join public.orders o on o.id = pa.order_id
  where o.customer_name = n and pa.branch_id = ('00000000-0000-0000-0000-0000000000' || b)::uuid
$$;
grant execute on all functions in schema tests to authenticated, anon;

insert into auth.users (id, email) select gen_random_uuid(), e from (values
  ('manager@test'), ('conf@test'), ('conf2@test'), ('dispatch@test'), ('b1@test'), ('b4@test'), ('s1@test'), ('s4@test')) as t(e);
insert into public.profiles (id, name, email, role, branch_id)
select u.id, u.email, u.email, x.role::public.app_role, x.branch::uuid
from auth.users u join (values
  ('manager@test',  'manager',   null),
  ('conf@test',     'confirmer', null),
  ('conf2@test',    'confirmer', null),
  ('dispatch@test', 'dispatch',  null),
  ('b1@test',       'branch',    '00000000-0000-0000-0000-0000000000b1'),
  ('b4@test',       'branch',    '00000000-0000-0000-0000-0000000000b4'),
  ('s1@test',       'suivi',     '00000000-0000-0000-0000-0000000000b1'),
  ('s4@test',       'suivi',     '00000000-0000-0000-0000-0000000000b4')
) as x(email, role, branch) on x.email = u.email;


set local role authenticated;
select tests.login('manager@test');
insert into product_confirmers (product_id, confirmer_id) values
  ('00000000-0000-0000-0000-0000000000a1', (select id from profiles where email = 'conf@test')),
  ('00000000-0000-0000-0000-0000000000a4', (select id from profiles where email = 'conf@test'));
select tests.ok(phone_key('+213 550 00 00 06') = '0550000006', 'phone key normalises +213');
select blacklist_add('+213 550-00-00-06', 'زبون تجريبي 6', 'أنيلاها');
select tests.throws($$select blacklist_add('123', null, 'x')$$, 'blacklist needs a real phone');
select tests.eq((select count(*) from blacklist), 1, 'manager sees the blacklist');
reset role;

-- المؤكدة ما تشوفش الرقم المبلوكي
set local role authenticated;
select tests.login('conf@test');
select tests.eq((select count(*) from orders), 5, 'blacklisted order never reaches the confirmer (6-1)');
select tests.eq((select count(*) from blacklist), 0, 'confirmer cannot read the blacklist');
select tests.throws($$select confirm_order(tests.oid('زبون تجريبي 6'), tests.pieces('جبة قطيفة|رمادي|M'))$$, 'cannot confirm a blacklisted number');
select blacklist_order(tests.oid('زبون متروك 2'), 'من المؤكدة عند التأكيد');
select tests.eq((select count(*) from orders), 4, 'confirmer adds a number: order disappears');
select tests.eq((select count(*) from (select 1 from blacklist) x), 0, 'still cannot read it');
select tests.throws($$select blacklist_order(tests.oid('زبون تجريبي 2'), 'x')$$, 'confirmer cannot blacklist an order that is not hers');
-- تأكيد وإرسال باش السويفي يلقى كوليات
select confirm_order(tests.oid('زبون تجريبي 1'), tests.pieces('بيجامة قطيفة|أحمر|M'));
select confirm_order(tests.oid('زبون تجريبي 4'), tests.pieces('جبة قطيفة|رمادي|M', 'بيجامة قطيفة|أحمر|L'));
select confirm_order(tests.oid('زبون تجريبي 5'), tests.pieces('بيجامة قطيفة|أخضر|L'));
reset role;
set local role authenticated;
select tests.login('manager@test');
select send_all_waiting();
select tests.eq((select count(*) from blacklist where phone_key = '0550000012'), 1, 'confirmer entry saved');
reset role;

-- السويفي
set local role authenticated;
select tests.login('s1@test');
select tests.eq((select count(*) from suivi_parcels()), 3, 's1 sees the 3 b1 parcels');
select tests.eq((select count(*) from suivi_parcels() where lines like '%جبة%'), 0, 's1 sees only b1 pieces');
select tests.eq((select count(*) from orders), 0, 'suivi cannot read the orders table');
select tests.eq((select count(*) from ledger_entries), 0, 'suivi sees no money');
select set_follow((select parcel_id from suivi_parcels() where customer_name = 'زبون تجريبي 1'), 'لا يرد');
select tests.ok((select follow = 'لا يرد' from suivi_parcels() where customer_name = 'زبون تجريبي 1'), 'suivi saves the follow-up');
select tests.throws($$select set_follow(tests.parcel('زبون تجريبي 1', 'b1'), 'كلام حر')$$, 'follow must be one of the list');
select blacklist_order((select order_id from suivi_parcels() where customer_name = 'زبون تجريبي 5'), 'أنيلاها');
select tests.eq((select count(*) from suivi_parcels()), 2, 'blacklisted parcel disappears for suivi');
reset role;

set local role authenticated;
select tests.login('s4@test');
select tests.eq((select count(*) from suivi_parcels()), 1, 's4 sees only the b4 parcel');
select tests.throws($$select set_follow(tests.parcel('زبون تجريبي 1', 'b1'), 'لا يرد')$$, 's4 cannot follow a b1 parcel');
select tests.throws($$select blacklist_order(tests.oid('زبون تجريبي 1'), 'x')$$, 's4 cannot blacklist a b1 order');
reset role;

-- الحذف للمدير وحدو
set local role authenticated;
select tests.login('conf@test');
delete from blacklist;
reset role;
select tests.eq((select count(*) from blacklist), 3, 'confirmer delete removes nothing');
set local role authenticated;
select tests.login('manager@test');
delete from blacklist where phone_key = '0550000006';
select tests.eq((select count(*) from blacklist), 2, 'manager can delete');
reset role;
select tests.eq((select count(*) from audit_log where tbl = 'blacklist'), 4, 'blacklist adds and delete are audited');

rollback;
