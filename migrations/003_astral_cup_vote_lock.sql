-- 管理操作已持有活动排他锁，撤票读取无需额外行锁/UPDATE授权。
BEGIN;
DO $patch$
DECLARE definition text; old_clause text := 'SELECT * INTO vote FROM public.astral_cup_votes WHERE id=(p_payload->>''voteId'')::uuid AND event_id=event.id FOR UPDATE;';
BEGIN
  definition := pg_get_functiondef('public.astral_cup_admin_action(text,text,jsonb)'::regprocedure);
  IF position(old_clause IN definition)=0 THEN RAISE EXCEPTION 'Unexpected cup function; review before applying.'; END IF;
  EXECUTE replace(definition,old_clause,replace(old_clause,' FOR UPDATE',''));
END;
$patch$;
COMMIT;
