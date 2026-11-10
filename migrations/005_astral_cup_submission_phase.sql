BEGIN;
SET LOCAL lock_timeout='2s';
ALTER TABLE public.astral_cup_events DROP CONSTRAINT astral_cup_events_phase_check;
ALTER TABLE public.astral_cup_events ADD CONSTRAINT astral_cup_events_phase_check CHECK (phase IN ('upcoming','registration','painting','submission','voting','ended'));
DO $patch$
DECLARE definition text;
  old_phases text := '(''upcoming'',''registration'',''painting'',''voting'',''ended'')';
  new_phases text := '(''upcoming'',''registration'',''painting'',''submission'',''voting'',''ended'')';
  old_submission text := 'event.phase NOT IN (''registration'',''painting'')';
BEGIN
  definition := pg_get_functiondef('public.astral_cup_admin_action(text,text,jsonb)'::regprocedure);
  IF position(old_phases IN definition)=0 THEN RAISE EXCEPTION 'Unexpected cup phases; review before applying.'; END IF;
  EXECUTE replace(definition,old_phases,new_phases);
  definition := pg_get_functiondef('public.astral_cup_submit_entry(uuid,uuid,text,text,text,text[])'::regprocedure);
  IF position(old_submission IN definition)=0 THEN RAISE EXCEPTION 'Unexpected submission guard; review before applying.'; END IF;
  EXECUTE replace(definition,old_submission,'event.phase<>''submission''');
END;
$patch$;
COMMIT;
