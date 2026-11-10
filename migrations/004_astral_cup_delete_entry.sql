BEGIN;
SET LOCAL lock_timeout='2s';
DO $patch$
DECLARE definition text;
  anchor text := '    WHEN ''adminSetMember'' THEN';
  deletion text := $branch$
    WHEN 'adminDeleteEntry' THEN
      IF p_payload->>'confirmation' IS DISTINCT FROM '删除投稿' THEN RETURN jsonb_build_object('error','请确认删除投稿。','status',400); END IF;
      SELECT * INTO entry FROM public.astral_cup_entries WHERE id=(p_payload->>'entryId')::uuid AND event_id=event.id FOR UPDATE;
      IF NOT FOUND THEN RETURN jsonb_build_object('error','作品不存在或已删除。','status',404); END IF;
      SELECT jsonb_build_object('entry',to_jsonb(entry),'votes',COALESCE(jsonb_agg(v),'[]'::jsonb)) INTO before_value FROM public.astral_cup_votes v WHERE entry_id=entry.id;
      target_value=entry.id::text;
      DELETE FROM public.astral_cup_votes WHERE entry_id=entry.id AND event_id=event.id;
      DELETE FROM public.astral_cup_entries WHERE id=entry.id AND event_id=event.id;
$branch$;
BEGIN
  definition := pg_get_functiondef('public.astral_cup_admin_action(text,text,jsonb)'::regprocedure);
  IF position('WHEN ''adminDeleteEntry'' THEN' IN definition)>0 THEN RAISE EXCEPTION 'Delete-entry action already exists; review before applying.'; END IF;
  IF position(anchor IN definition)=0 OR position('FOR UPDATE' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected cup action function; review before applying.'; END IF;
  EXECUTE replace(definition,anchor,deletion||anchor);
END;
$patch$;
GRANT DELETE ON public.astral_cup_entries TO service_role;
COMMIT;
