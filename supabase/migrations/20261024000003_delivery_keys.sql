-- مفاتيح API تاع شركات التوصيل، فرع بفرع.
-- المفتاح يتخزن مشفر في Supabase Vault. حتى واحد ما يقدر يقراه من الموقع: المدير يشوف غير آخر 4 حروف.

create table public.delivery_keys (
  branch_id  uuid primary key references public.branches (id) on delete cascade,
  api_url    text check (api_url is null or api_url ~ '^https://'),
  secret_id  uuid,          -- vault.secrets.id
  key_hint   text,          -- آخر 4 حروف برك
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);
create trigger audit_delivery_keys after insert or update or delete on public.delivery_keys for each row execute function public.audit();
alter table public.delivery_keys enable row level security;
create policy delivery_keys_read on public.delivery_keys for select to authenticated using (public.is_manager());
revoke all on public.delivery_keys from public, anon, authenticated;  -- Supabase يعطي كلش افتراضيا
grant select (branch_id, api_url, key_hint, updated_at) on public.delivery_keys to authenticated;

-- p_key فارغ = نخليو المفتاح القديم
create function public.set_delivery_key(p_branch uuid, p_url text, p_key text)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_secret uuid; k text := nullif(trim(coalesce(p_key, '')), ''); u text := nullif(trim(coalesce(p_url, '')), '');
begin
  if not public.is_manager() then raise exception 'ما عندكش الصلاحية' using errcode = '42501'; end if;
  if not exists (select 1 from public.branches where id = p_branch) then raise exception 'الفرع ما كانش'; end if;
  if u is not null and u !~ '^https://' then raise exception 'الرابط لازم يبدا بـ https://'; end if;
  if k is not null and length(k) < 8 then raise exception 'المفتاح قصير بزاف'; end if;
  select secret_id into v_secret from public.delivery_keys where branch_id = p_branch;
  if k is not null then
    if v_secret is null then
      v_secret := vault.create_secret(k, 'delivery_' || p_branch::text, 'مفتاح API شركة التوصيل');
    else
      perform vault.update_secret(v_secret, k);
    end if;
  end if;
  insert into public.delivery_keys (branch_id, api_url, secret_id, key_hint, updated_by, updated_at)
  values (p_branch, u, v_secret, case when k is not null then right(k, 4) end, auth.uid(), now())
  on conflict (branch_id) do update
    set api_url = excluded.api_url,
        secret_id = coalesce(excluded.secret_id, delivery_keys.secret_id),
        key_hint = coalesce(excluded.key_hint, delivery_keys.key_hint),
        updated_by = excluded.updated_by, updated_at = now();
end $$;

-- المدير يمسح المفتاح
create function public.clear_delivery_key(p_branch uuid)
returns void language plpgsql security definer set search_path = public, vault as $$
declare v_secret uuid;
begin
  if not public.is_manager() then raise exception 'ما عندكش الصلاحية' using errcode = '42501'; end if;
  select secret_id into v_secret from public.delivery_keys where branch_id = p_branch;
  if v_secret is not null then delete from vault.secrets where id = v_secret; end if;
  update public.delivery_keys set secret_id = null, key_hint = null, updated_by = auth.uid(), updated_at = now() where branch_id = p_branch;
end $$;

revoke all on function public.set_delivery_key(uuid, text, text), public.clear_delivery_key(uuid) from public, anon;
grant execute on function public.set_delivery_key(uuid, text, text), public.clear_delivery_key(uuid) to authenticated;
