-- الإعدادات: مصدر الطلبات، الشيتات (كل واحد بالأعمدة تاعو)، والحدود والنسب.

alter table public.settings
  add column order_source text    not null default 'sheet' check (order_source in ('sheet', 'direct')),
  add column low_qty      integer not null default 10  check (low_qty >= 0),
  add column big_qty      integer not null default 100 check (big_qty >= 0),
  add column return_pct   integer not null default 50  check (return_pct between 0 and 100),
  add column min_sample   integer not null default 20  check (min_sample >= 1),
  add column ret_low      integer not null default 25  check (ret_low between 0 and 100),
  add column ret_high     integer not null default 30  check (ret_high between 0 and 100),
  add constraint ret_range check (ret_low <= ret_high),
  add constraint qty_range check (low_qty <= big_qty);

create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();

-- Supabase يعطي كلش افتراضيا: نحددو واش يتبدل
revoke insert, update, delete on public.settings from authenticated, anon;
grant update (wait_minutes, order_source, low_qty, big_qty, return_pct, min_sample, ret_low, ret_high) on public.settings to authenticated;

-- ---------- الشيتات ----------
-- الأعمدة: {"name": "...", "phone": "...", "wilaya": "...", "commune": "...", "product": "...",
--           "qty": "...", "price": "...", "date": "...", "notes": "..."} (اسم العمود ولا الحرف)
create table public.sheet_sources (
  id           bigint generated always as identity primary key,
  name         text not null check (length(trim(name)) > 0),
  kind         public.order_kind not null default 'normal',
  url          text check (url is null or url ~ '^https://docs\.google\.com/spreadsheets/'),
  columns      jsonb not null default '{}'::jsonb check (jsonb_typeof(columns) = 'object'),
  sync_minutes integer not null default 5 check (sync_minutes between 1 and 1440),
  active       boolean not null default true,
  last_sync_at timestamptz,             -- يتعمر كي نربطو القراية
  created_at   timestamptz not null default now()
);
create trigger audit_sheet_sources after insert or update or delete on public.sheet_sources for each row execute function public.audit();
alter table public.sheet_sources enable row level security;
create policy sheet_sources_manager on public.sheet_sources for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
revoke all on public.sheet_sources from anon;
grant select, insert, update, delete on public.sheet_sources to authenticated;

insert into public.sheet_sources (name, kind, active) values
  ('الطلبات الرئيسية', 'normal', true),
  ('طلبات متروكة (abandoned checkout)', 'abandoned', true),
  ('شيت إضافي 1', 'normal', false),
  ('شيت إضافي 2', 'normal', false);
