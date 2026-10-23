-- ربط الشيت v2: ربط أسماء المنتجات تاع الشيت بمنتجات الموقع، ونتيجة "جرب الاتصال".
alter table public.sheet_sources
  add column if not exists product_map   jsonb not null default '{}'::jsonb,  -- {"نص المنتج في الشيت": product_id}
  add column if not exists product_texts jsonb not null default '[]'::jsonb,  -- [{text, n}] المنتجات المختلفة اللي في الشيت
  add column if not exists last_test     jsonb;                               -- {at, ok, lines}
