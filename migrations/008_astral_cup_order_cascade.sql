-- 删除报名订单时同步取消报名；不删除账号、投稿或投票。
-- 执行前将已有无订单报名备份到 E 盘的私密运行目录。
BEGIN;
SET LOCAL lock_timeout='2s';
LOCK TABLE public.astral_workshop_orders,public.astral_cup_registrations IN SHARE ROW EXCLUSIVE MODE;
DO $check$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.astral_cup_registrations'::regclass AND conname='astral_cup_registrations_order_id_fkey' AND confrelid='public.astral_workshop_orders'::regclass AND confdeltype='n') THEN
    RAISE EXCEPTION 'Expected existing order relationship not found; review before migrating.';
  END IF;
END $check$;
DELETE FROM public.astral_cup_registrations WHERE order_id IS NULL;
ALTER TABLE public.astral_cup_registrations DROP CONSTRAINT astral_cup_registrations_order_id_fkey;
ALTER TABLE public.astral_cup_registrations ADD CONSTRAINT astral_cup_registrations_order_id_fkey FOREIGN KEY(order_id) REFERENCES public.astral_workshop_orders(id) ON DELETE CASCADE;
COMMIT;
