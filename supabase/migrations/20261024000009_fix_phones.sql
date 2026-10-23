-- الطلبات اللي دخلو من الشيت بلا 0 في الهاتف (776351302 → 0776351302). البصمات ما تتبدلش.
update public.orders o set phone = '0' || o.phone
from public.order_meta m
where m.order_id = o.id and m.source_id is not null and o.phone ~ '^[567][0-9]{8}$';
-- "+ 0659206622" ولا "0550 11 22 33" → أرقام برك
update public.orders o set phone = regexp_replace(o.phone, '\D', '', 'g')
from public.order_meta m
where m.order_id = o.id and m.source_id is not null
  and regexp_replace(o.phone, '\D', '', 'g') ~ '^0[567][0-9]{8}$' and o.phone <> regexp_replace(o.phone, '\D', '', 'g');
