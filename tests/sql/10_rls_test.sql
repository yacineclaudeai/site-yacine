-- تيستات الصلاحيات: كل دور يحاول يقرا ولا يكتب حاجة ماشي تاعو، ولازم يفشل.
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

create function tests.throws(q text, what text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    raise notice 'ok  % (%)', what, sqlerrm;
    return;
  end;
  raise exception 'FAIL %: expected an error', what;
end $$;

-- عدد السطور اللي تبدلو فعلا (UPDATE/DELETE تحت RLS ما يغلطوش، يبدلو 0 سطر)
create function tests.affected(q text) returns bigint language plpgsql as $$
declare n bigint;
begin execute q; get diagnostics n = row_count; return n; end $$;

grant execute on all functions in schema tests to authenticated, anon;

-- المستعملين
insert into auth.users (id, email) select gen_random_uuid(), e from (values
  ('manager@test'), ('b1@test'), ('b2@test'), ('suivi1@test'), ('conf@test'), ('dispatch@test'), ('locked@test')) as t(e);
insert into public.profiles (id, name, email, role, branch_id, locked)
select u.id, u.email, u.email, x.role::public.app_role, x.branch::uuid, x.locked
from auth.users u join (values
  ('manager@test',  'manager',   null, false),
  ('b1@test',       'branch',    '00000000-0000-0000-0000-0000000000b1', false),
  ('b2@test',       'branch',    '00000000-0000-0000-0000-0000000000b2', false),
  ('suivi1@test',   'suivi',     '00000000-0000-0000-0000-0000000000b1', false),
  ('conf@test',     'confirmer', null, false),
  ('dispatch@test', 'dispatch',  null, false),
  ('locked@test',   'branch',    '00000000-0000-0000-0000-0000000000b1', true)
) as x(email, role, branch, locked) on x.email = u.email;

-- ===== المدير =====
set local role authenticated;
select tests.login('manager@test');
select tests.eq((select count(*) from branches), 8, 'manager sees all branches');
select tests.eq((select count(*) from profiles), 7, 'manager sees all profiles');
select tests.eq((select count(*) from ledger_entries), 7, 'manager sees all ledger');
select tests.eq((select held from branch_balances where branch_id = '00000000-0000-0000-0000-0000000000b1'), 170000, 'b1 held = 420000-150000-100000');
select tests.throws($$update variants set stock = 999$$, 'even manager cannot set stock directly');
select tests.throws($$update ledger_entries set amount = 1$$, 'ledger is immutable');
select tests.eq((select count(*) from audit_log where tbl = 'ledger_entries'), 7, 'ledger writes are audited');
reset role;

-- ===== الفرع b1 =====
set local role authenticated;
select tests.login('b1@test');
select tests.eq((select count(*) from branches), 1, 'branch sees only its branch');
select tests.eq((select count(*) from products), 1, 'branch sees only its products');
select tests.eq((select count(*) from variants), 5, 'branch sees only its variants');
select tests.eq((select count(*) from ledger_entries), 4, 'branch sees only its ledger');
select tests.eq((select count(*) from profiles), 1, 'branch sees only own profile');
select tests.eq((select count(*) from audit_log), 0, 'branch cannot read audit log');
select tests.throws($$insert into ledger_entries (branch_id, type, amount) values ('00000000-0000-0000-0000-0000000000b1', 'sent', 1000)$$, 'branch cannot write ledger');
select tests.throws($$insert into products (branch_id, name) values ('00000000-0000-0000-0000-0000000000b1', 'x')$$, 'branch cannot insert product directly');
select tests.eq(tests.affected($$update branches set type = 'ads'$$), 0, 'branch cannot change branch type');
select tests.eq(tests.affected($$update profiles set role = 'manager' where email = 'b1@test'$$), 0, 'branch cannot promote itself');
select tests.throws($$select add_stock('00000000-0000-0000-0000-0000000000b2', 'روب سبور', 'أسود', 'L', 5)$$, 'branch cannot add stock to another branch');
select tests.throws($$select record_return((select id from variants limit 1), 71)$$, 'return qty max 70');

-- يزيد ستوك لمنتج كاين: الكمية تتزاد
select add_stock('00000000-0000-0000-0000-0000000000b1', '  بيجامة قطيفة ', 'أحمر', 'm', 6);
select tests.eq((select stock from variants v join products p on p.id = v.product_id where p.name = 'بيجامة قطيفة' and color = 'أحمر' and size = 'M'), 20, 'add_stock matches name/colour/size loosely: 14+6');
-- منتج جديد: يتسجل pending
select add_stock('00000000-0000-0000-0000-0000000000b1', 'قميص جديد', 'أبيض', 'XL', 10);
select tests.eq((select count(*) from products where name = 'قميص جديد' and pending), 1, 'new product from branch is pending');
-- العد اليومي
select submit_stock_count('00000000-0000-0000-0000-0000000000a1',
  (select jsonb_agg(jsonb_build_object('variant_id', id, 'counted', 3)) from variants where product_id = '00000000-0000-0000-0000-0000000000a1'));
select tests.eq((select sum(stock) from variants where product_id = '00000000-0000-0000-0000-0000000000a1'), 15, 'count sets every variant to 3 (5 variants)');
select tests.eq((select count(*) from stock_count_lines), 5, 'count lines saved');
-- رتور
select record_return((select v.id from variants v where product_id = '00000000-0000-0000-0000-0000000000a1' and color = 'أخضر' and size = 'L'), 2, 'ECO-1');
select tests.eq((select stock from variants where product_id = '00000000-0000-0000-0000-0000000000a1' and color = 'أخضر' and size = 'L'), 5, 'return restores stock 3+2');
select tests.throws($$select submit_stock_count('00000000-0000-0000-0000-0000000000a2', '[]'::jsonb)$$, 'branch cannot count another branch product');
select set_liquidity(50000);
select tests.eq((select liquidity from branches), 50000, 'branch updates own liquidity');
reset role;

-- ===== الفرع b2 ما يشوفش b1 =====
set local role authenticated;
select tests.login('b2@test');
select tests.eq((select count(*) from returns), 0, 'b2 does not see b1 returns');
select tests.eq((select count(*) from stock_movements where variant_id in (select id from variants)), (select count(*) from stock_movements), 'b2 sees only own movements');
select tests.eq((select count(*) from ledger_entries where branch_id <> '00000000-0000-0000-0000-0000000000b2'), 0, 'b2 sees no other ledger');
select tests.eq((select count(*) from stock_alerts where branch_id <> '00000000-0000-0000-0000-0000000000b2'), 0, 'b2 alerts are own only');
reset role;

-- ===== السويفي =====
set local role authenticated;
select tests.login('suivi1@test');
select tests.eq((select count(*) from products), 2, 'suivi sees its branch products');
select tests.eq((select count(*) from ledger_entries), 0, 'suivi sees no money');
select tests.throws($$select add_stock('00000000-0000-0000-0000-0000000000b1', 'بيجامة قطيفة', 'أحمر', 'M', 1)$$, 'suivi cannot add stock');
select tests.throws($$select set_liquidity(1)$$, 'suivi cannot set liquidity');
reset role;

-- ===== المؤكدة والإرسال: ما يشوفو لا فروع لا دراهم =====
set local role authenticated;
select tests.login('conf@test');
select tests.eq((select count(*) from branches), 0, 'confirmer sees no branches');
select tests.eq((select count(*) from products), 0, 'confirmer sees no products in phase 1');
select tests.eq((select count(*) from ledger_entries), 0, 'confirmer sees no ledger');
select tests.eq((select count(*) from profiles), 1, 'confirmer sees only own profile');
select tests.login('dispatch@test');
select tests.eq((select count(*) from branches), 0, 'dispatch sees no branches');
select tests.eq((select count(*) from ledger_entries), 0, 'dispatch sees no ledger');
reset role;

-- ===== حساب مبلوكي =====
set local role authenticated;
select tests.login('locked@test');
select tests.eq((select count(*) from branches), 0, 'locked account sees nothing');
select tests.throws($$select add_stock('00000000-0000-0000-0000-0000000000b1', 'بيجامة قطيفة', 'أحمر', 'M', 1)$$, 'locked account cannot add stock');
reset role;

-- ===== anon =====
set local role anon;
select tests.throws($$select count(*) from branches$$, 'anon cannot read branches');
select tests.throws($$select add_stock('00000000-0000-0000-0000-0000000000b1', 'x', 'x', 'x', 1)$$, 'anon cannot call add_stock');
reset role;

-- ===== كل حركة ستوك متسجلة =====
select tests.eq((select count(*) from audit_log where tbl = 'stock_movements'), (select count(*) from stock_movements), 'every stock movement is audited');

rollback;
