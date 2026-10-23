-- الإرسال التلقائي كل دقيقة (pg_cron). يتلصق في Supabase SQL Editor مرة وحدة.
create extension if not exists pg_cron;
select cron.schedule('send-due-orders', '* * * * *', 'select public.send_due_orders()');
