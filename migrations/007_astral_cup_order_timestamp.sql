BEGIN;
SET LOCAL lock_timeout='2s';
DO $fix$
DECLARE definition text:=pg_get_functiondef('public.astral_cup_enroll(uuid,uuid,uuid,text,text,jsonb,text,text,text,text)'::regprocedure);
BEGIN
  IF position('clock_timestamp()::text' IN definition)>0 THEN
    EXECUTE replace(definition,'clock_timestamp()::text',$replacement$to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')$replacement$);
  ELSIF position('YYYY-MM-DD"T"HH24:MI:SS.MS"Z"' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected registration function; no change applied.';
  END IF;
END $fix$;
COMMIT;
