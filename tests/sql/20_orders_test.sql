-- تيستات الطلبات: التأكيد، الانتظار، الإرسال، والصلاحيات.
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
grant execute on all functions in schema tests to authenticated, anon;

insert into auth.users (id, email) select gen_random_uuid(), e from (values
  ('manager@test'), ('conf@test'), ('conf2@test'), ('dispatch@test'), ('b1@test'), ('b4@test')) as t(e);
insert into public.profiles (id, name, email, role, branch_id)
select u.id, u.email, u.email, x.role::public.app_role, x.branch::uuid
from auth.users u join (values
  ('manager@test',  'manager',   null),
  ('conf@test',     'confirmer', null),
  ('conf2@test',    'confirmer', null),
  ('dispatch@test', 'dispatch',  null),
  ('b1@test',       'branch',    '00000000-0000-0000-0000-0000000000b1'),
  ('b4@test',       'branch',    '00000000-0000-0000-0000-0000000000b4')
) as x(email, role, branch) on x.email = u.email;

-- ===== المدير يوزع المنتجات =====
set local role authenticated;
select tests.login('manager@test');
insert into product_confirmers (product_id, confirmer_id) values
  ('00000000-0000-0000-0000-0000000000a1', (select id from profiles where email = 'conf@test')),
  ('00000000-0000-0000-0000-0000000000a4', (select id from profiles where email = 'conf@test')),
  ('00000000-0000-0000-0000-0000000000a2', (select id from profiles where email = 'conf2@test'));
select tests.throws($$insert into product_confirmers values ('00000000-0000-0000-0000-0000000000a3', (select id from profiles where email = 'b1@test'))$$,
  'only a confirmer can be assigned a product');
select tests.throws($$insert into orders (customer_name, phone, wilaya, product_name) values ('x', '0550000099', 'x', 'x')$$,
  'manager cannot insert orders directly (RPC only)');
select tests.eq((select count(*) from orders), 8, 'manager sees all orders');
select tests.eq((select count(*) from order_meta where kind = 'abandoned'), 2, 'manager sees abandoned flag');
select tests.ok(create_order('زبون يدوي', '0661 22 33 44', 'الجزائر', 'القبة', '00000000-0000-0000-0000-0000000000a2', 1) > 0, 'manager creates an order by hand');
select tests.throws($$select create_order('x', '12', 'x', null, '00000000-0000-0000-0000-0000000000a2', 1)$$, 'phone must have 9+ digits');
reset role;

-- ===== المؤكدة =====
set local role authenticated;
select tests.login('conf@test');
select tests.eq((select count(*) from orders), 6, 'confirmer sees only queue orders of her products (a1, a4)');
select tests.eq((select count(*) from order_meta), 0, 'confirmer cannot tell abandoned from normal');
select tests.eq((select count(*) from branches), 0, 'confirmer still sees no branches');
select tests.eq((select count(*) from parcels), 0, 'confirmer sees no parcels');
select tests.ok((select count(*) from order_catalog()) > 0, 'confirmer gets the catalog (no branch column)');
select tests.throws($$select confirm_order(tests.oid('زبون تجريبي 2'), tests.pieces('روب سبور|أسود|L'))$$, 'confirmer cannot confirm another confirmer''s order');
select tests.throws($$select confirm_order(tests.oid('زبون تجريبي 1'), tests.pieces('بيجامة قطيفة|أخضر|M'))$$, 'cannot confirm a colour with 0 stock');

-- تأكيد بقطعتين: الستوك ينقص والوقت يبدا
select confirm_order(tests.oid('زبون تجريبي 1'), tests.pieces('بيجامة قطيفة|أحمر|M', 'بيجامة قطيفة|أحمر|M'));
select tests.eq(tests.stock('بيجامة قطيفة|أحمر|M'), 12, 'confirm takes 2 pieces from stock (14-2)');
select tests.ok(tests.st('زبون تجريبي 1') = 'wait', 'order is waiting');
select tests.ok((select send_at = confirmed_at + interval '10 minutes' from orders where id = tests.oid('زبون تجريبي 1')), 'send_at = confirm + 10 min');
select tests.throws($$select send_now(tests.oid('زبون تجريبي 1'))$$, 'confirmer cannot send early');
select tests.throws($$select * from send_preview()$$, 'confirmer cannot see branches/delivery companies');

-- تبدل القطع: الوقت ما يتعاودش
select update_waiting_lines(tests.oid('زبون تجريبي 1'), tests.pieces('بيجامة قطيفة|رمادي|L'));
select tests.eq(tests.stock('بيجامة قطيفة|أحمر|M'), 14, 'changed pieces: old ones back to stock');
select tests.eq(tests.stock('بيجامة قطيفة|رمادي|L'), 20, 'changed pieces: new one taken (21-1)');
select tests.ok((select send_at = confirmed_at + interval '10 minutes' from orders where id = tests.oid('زبون تجريبي 1')), 'countdown does not reset on change');

-- ما جاوبش: فاشلة 1 → 2
select mark_order(tests.oid('زبون تجريبي 6'), 'noans');
select mark_order(tests.oid('زبون تجريبي 6'), 'noans');
select tests.ok(tests.st('زبون تجريبي 6') = 'failed2', 'no answer twice = failed2');

-- إلغاء في الانتظار يرجع الستوك
select confirm_order(tests.oid('زبون تجريبي 5'), tests.pieces('بيجامة قطيفة|أخضر|L'));
select cancel_waiting(tests.oid('زبون تجريبي 5'));
select tests.eq(tests.stock('بيجامة قطيفة|أخضر|L'), 12, 'cancel during wait restores stock');
select tests.ok(tests.st('زبون تجريبي 5') = 'cancelled', 'cancelled');

-- طلبية فيها منتجين من فرعين (بومرداس + حمادي 1)
select confirm_order(tests.oid('زبون تجريبي 4'), tests.pieces('جبة قطيفة|رمادي|M', 'بيجامة قطيفة|أحمر|L'));
select tests.eq((select count(*) from orders where status = 'wait'), 2, 'confirmer sees her 2 waiting orders');
reset role;

-- ===== مؤكدة أخرى ما تشوفش =====
set local role authenticated;
select tests.login('conf2@test');
select tests.eq((select count(*) from orders where confirmed_by is not null), 0, 'conf2 does not see conf orders');
select tests.throws($$select cancel_waiting(tests.oid('زبون تجريبي 1'))$$, 'conf2 cannot cancel conf''s order');
reset role;

-- ===== عامل الإرسال =====
set local role authenticated;
select tests.login('dispatch@test');
select tests.eq((select count(*) from orders), 2, 'dispatch sees only waiting/sent orders');
select tests.eq((select count(*) from send_preview()), 3, 'dispatch sees branch + delivery company per parcel before sending (1 + 2)');
select tests.eq((select count(*) from send_preview() where order_id = tests.oid('زبون تجريبي 4')), 2, 'two-branch order shows two parcels');
select tests.throws($$select confirm_order(tests.oid('زبون تجريبي 3'), tests.pieces('طقم أطفال|أحمر|4 سنوات'))$$, 'dispatch cannot confirm');
select send_now(tests.oid('زبون تجريبي 1'));
select tests.ok(tests.st('زبون تجريبي 1') = 'sent', 'dispatch sends early');
select tests.throws($$select send_now(tests.oid('زبون تجريبي 1'))$$, 'cannot send twice');
reset role;

-- بعد الإرسال: ما تتبدلش ما تتلغاش
set local role authenticated;
select tests.login('conf@test');
select tests.throws($$select cancel_waiting(tests.oid('زبون تجريبي 1'))$$, 'cannot cancel after send');
select tests.throws($$select update_waiting_lines(tests.oid('زبون تجريبي 1'), tests.pieces('بيجامة قطيفة|رمادي|L'))$$, 'cannot edit after send');
select tests.eq((select count(*) from orders where status = 'sent'), 1, 'confirmer sees her sent order');
reset role;

-- ===== المدير: ابعث الكل، والإرسال التلقائي =====
set local role authenticated;
select tests.login('manager@test');
select tests.eq(send_all_waiting(), 1, 'send all sends the remaining waiting order');
select tests.eq((select count(*) from parcels where order_id = tests.oid('زبون تجريبي 4')), 2, 'two branches = two parcels');
select tests.eq((select count(*) from parcels where order_id = tests.oid('زبون تجريبي 1')), 1, 'same branch = one parcel');
select tests.ok((select bool_and(stub and tracking like 'STUB-%') from parcels), 'parcels are marked stub');
update settings set wait_minutes = 0;
reset role;

set local role authenticated;
select tests.login('conf@test');
select confirm_order(tests.oid('زبون متروك 1'), tests.pieces('بيجامة قطيفة|رمادي|L'));
reset role;
select tests.eq(public.send_due_orders(), 1, 'auto send picks the due order');
select tests.ok((select sent_by is null from orders where id = tests.oid('زبون متروك 1')), 'auto send has no sender');

-- ===== الفرع: يشوف قطعو غير =====
set local role authenticated;
select tests.login('b1@test');
select tests.eq((select count(*) from orders), 0, 'branch cannot read orders table');
select tests.eq((select count(*) from branch_parcels()), 3, 'b1 has 3 parcels to pack');
select tests.eq((select count(*) from branch_parcels() where lines like '%جبة%'), 0, 'b1 does not see b4 pieces');
select tests.login('b4@test');
select tests.eq((select count(*) from branch_parcels()), 1, 'b4 has 1 parcel');
select tests.ok((select lines from branch_parcels()) = 'جبة قطيفة · رمادي / M', 'b4 sees only its piece');
reset role;

set local role anon;
select tests.throws($$select send_due_orders()$$, 'anon cannot call send');
select tests.throws($$select count(*) from orders$$, 'anon cannot read orders');
reset role;

select tests.ok((select count(*) from audit_log where tbl = 'orders') > 0, 'order writes are audited');
select tests.eq((select count(*) from stock_movements where kind in ('order', 'order_cancel')), 10, 'every piece movement is recorded');

rollback;
