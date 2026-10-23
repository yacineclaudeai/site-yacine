-- المدير يبدل الحالة من الجدول: يزيد "رجعها جديدة" للملغية والمكررة.
create or replace function public.mark_order(p_order bigint, p_action text)
returns public.order_status language plpgsql security definer set search_path = public as $$
declare o public.orders; s public.order_status;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'الطلبية ما كانتش'; end if;
  if not coalesce(public.is_manager()
       or (public.my_role() = 'confirmer' and public.product_confirmer(o.product_id) = auth.uid()), false) then
    raise exception 'ما عندكش الصلاحية' using errcode = '42501';
  end if;
  -- المدير يرجع الملغية ولا المكررة جديدة (إذا تلغات بالغلط)
  if p_action = 'reopen' then
    if not public.is_manager() then raise exception 'المدير وحدو يرجعها' using errcode = '42501'; end if;
    if o.status not in ('cancelled', 'dup') then raise exception 'غير الملغية ولا المكررة ترجع جديدة'; end if;
    update public.orders set status = 'new' where id = p_order;
    return 'new';
  end if;
  if o.status not in ('new', 'failed1', 'failed2', 'failed3', 'postponed') then
    raise exception 'هذي الطلبية ما بقاتش للتأكيد';
  end if;
  s := case p_action
    when 'noans' then (case o.status when 'failed1' then 'failed2' when 'failed2' then 'failed3'
                                     when 'failed3' then 'failed3' else 'failed1' end)::public.order_status
    when 'postpone' then 'postponed'
    when 'dup' then 'dup'
    when 'cancel' then 'cancelled'
  end;
  if s is null then raise exception 'عملية ما نعرفهاش'; end if;
  update public.orders set status = s where id = p_order;
  return s;
end $$;

