-- قبل "ابعث الآن": المدير وعامل الإرسال يشوفو كل كولي لأنهي فرع وأنهي شركة توصيل، وإذا الـAPI مربوط.
create or replace function public.send_preview()
returns table (order_id bigint, branch_name text, delivery_company text, has_key boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(public.is_manager() or public.my_role() = 'dispatch', false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  return query
    select distinct o.id, b.name, b.delivery_company,
           exists (select 1 from public.delivery_keys k where k.branch_id = b.id and k.secret_id is not null and k.api_url is not null)
    from public.orders o
    join public.order_lines l on l.order_id = o.id
    join public.variants v on v.id = l.variant_id
    join public.products p on p.id = v.product_id
    join public.branches b on b.id = p.branch_id
    where o.status = 'wait'
    order by o.id, b.name;
end $$;
revoke all on function public.send_preview() from public, anon;
grant execute on function public.send_preview() to authenticated;
