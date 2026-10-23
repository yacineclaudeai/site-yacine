-- بيانات تجريبية للتطوير (بلا زبائن حقيقيين). الحسابات تتخلق من الموقع (المدير) ولا من سكريبت create-manager.
insert into public.branches (id, name, type, delivery_company, delivery_account) values
  ('00000000-0000-0000-0000-0000000000b1', 'بومرداس · Boutique Bouchra', 'half',   'HHD Express (Ecotrack)', 'Boumerdes'),
  ('00000000-0000-0000-0000-0000000000b2', 'براقي 1 · Boutique YACINE',  'salary', 'HHD Express (Ecotrack)', 'Baraki'),
  ('00000000-0000-0000-0000-0000000000b3', 'معسكر · BOUTIQUE DZYRIA',    'half',   'HHD Express (Ecotrack)', 'Mascara'),
  ('00000000-0000-0000-0000-0000000000b4', 'حمادي 1 · Boutique YARA',    'half',   'My Ecom Delivery', 'Swakria · YARA DELIVERY'),
  ('00000000-0000-0000-0000-0000000000b5', 'حمادي 2 · Boutique YALIM',   'half',   'My Ecom Delivery', 'Swakria · YALIM delivery'),
  ('00000000-0000-0000-0000-0000000000b6', 'براقي 2 · Boutique YAMIR',   'half',   'My Ecom Delivery', 'Birkhadem · yamir ecom'),
  ('00000000-0000-0000-0000-0000000000b7', 'براقي 3 · Boutique YALYN',   'salary', 'HHD Express (Ecotrack)', 'Baraki'),
  ('00000000-0000-0000-0000-0000000000b8', 'سوريكال · Boutique AZZOU',   'ads',    'Ecotrack Packers', 'Ain Naadja');

insert into public.products (id, branch_id, name, price) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', 'بيجامة قطيفة', 2700),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000b2', 'روب سبور', 1500),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000b3', 'طقم أطفال', 2200),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000b4', 'جبة قطيفة', 2900);

-- الستوك الأولي يدخل كحركة 'add' باش يبقى التاريخ كامل
with v(product_id, color, size, qty) as (values
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'أحمر', 'M', 14), ('00000000-0000-0000-0000-0000000000a1'::uuid, 'أحمر', 'L', 1),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'أخضر', 'M', 0),  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'أخضر', 'L', 12),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'رمادي', 'L', 21),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'أسود', 'L', 9),  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'رمادي', 'M', 2),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'أزرق', 'XL', 6),
  ('00000000-0000-0000-0000-0000000000a3'::uuid, 'أحمر', '4 سنوات', 0), ('00000000-0000-0000-0000-0000000000a3'::uuid, 'أخضر', '6 سنوات', 0),
  ('00000000-0000-0000-0000-0000000000a4'::uuid, 'رمادي', 'M', 7), ('00000000-0000-0000-0000-0000000000a4'::uuid, 'زيتي', 'M', 5),
  ('00000000-0000-0000-0000-0000000000a4'::uuid, 'بني', 'L', 4)
), ins as (
  insert into public.variants (product_id, color, size) select product_id, color, size from v returning id, product_id, color, size
)
select public._move_stock(ins.id, v.qty, 'add', 'ستوك أولي (تجريبي)')
from ins join v using (product_id, color, size) where v.qty > 0;

insert into public.ledger_entries (branch_id, type, amount, note, entry_day) values
  ('00000000-0000-0000-0000-0000000000b1', 'collected', 420000, 'تحصيل الأسبوع', '2026-10-15'),
  ('00000000-0000-0000-0000-0000000000b1', 'purchase',  150000, 'شراء بيجامة قطيفة', '2026-10-10'),
  ('00000000-0000-0000-0000-0000000000b1', 'sent',      100000, 'تحويل بريدي موب', '2026-10-17'),
  ('00000000-0000-0000-0000-0000000000b1', 'ads',        60000, 'أدس الأسبوع', '2026-10-14'),
  ('00000000-0000-0000-0000-0000000000b2', 'collected', 130000, 'تحصيل', '2026-10-16'),
  ('00000000-0000-0000-0000-0000000000b2', 'purchase',   70000, 'شراء روب سبور', '2026-10-12'),
  ('00000000-0000-0000-0000-0000000000b4', 'collected', 210000, 'تحصيل', '2026-10-18');

-- طلبيات تجريبية (زبائن وهميين، كيما النموذج)
with o(name, phone, wilaya, commune, pid, qty, status, kind) as (values
  ('زبون تجريبي 1', '0550000001', 'بومرداس', 'بودواو', '00000000-0000-0000-0000-0000000000a1'::uuid, 1, 'new', 'normal'),
  ('زبون تجريبي 2', '0550000002', 'الجزائر', 'براقي', '00000000-0000-0000-0000-0000000000a2'::uuid, 2, 'new', 'normal'),
  ('زبون تجريبي 3', '0550000003', 'معسكر', 'سيق', '00000000-0000-0000-0000-0000000000a3'::uuid, 1, 'new', 'normal'),
  ('زبون تجريبي 4', '0550000004', 'تيبازة', 'القليعة', '00000000-0000-0000-0000-0000000000a4'::uuid, 1, 'failed1', 'normal'),
  ('زبون تجريبي 5', '0550000005', 'وهران', 'السانية', '00000000-0000-0000-0000-0000000000a1'::uuid, 1, 'postponed', 'normal'),
  ('زبون تجريبي 6', '0550000006', 'البليدة', 'بوفاريك', '00000000-0000-0000-0000-0000000000a4'::uuid, 2, 'new', 'normal'),
  ('زبون متروك 1', '0550000011', 'الجزائر', 'الحراش', '00000000-0000-0000-0000-0000000000a1'::uuid, 1, 'new', 'abandoned'),
  ('زبون متروك 2', '0550000012', 'سطيف', 'العلمة', '00000000-0000-0000-0000-0000000000a4'::uuid, 1, 'new', 'abandoned')
), ins as (
  insert into public.orders (customer_name, phone, wilaya, commune, product_id, product_name, qty, status)
  select o.name, o.phone, o.wilaya, o.commune, o.pid, p.name, o.qty, o.status::public.order_status
  from o join public.products p on p.id = o.pid
  returning id, customer_name
)
insert into public.order_meta (order_id, kind, source)
select ins.id, o.kind::public.order_kind, case o.kind when 'abandoned' then 'طلبات متروكة (تجريبي)' else 'الطلبات الرئيسية (تجريبي)' end
from ins join o on o.name = ins.customer_name;
