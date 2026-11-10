-- 第一届星界杯。只新增 astral_cup_ 对象；未执行，须审核后手动应用。
BEGIN;
DO $preflight$
DECLARE object_name text;
BEGIN
  IF NOT pg_catalog.has_schema_privilege('service_role', 'public', 'USAGE')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role' AND (rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'Existing service_role privileges must be reviewed.';
  END IF;
  FOREACH object_name IN ARRAY ARRAY['astral_cup_events','astral_cup_members','astral_cup_entries','astral_cup_votes','astral_cup_audit','astral_cup_entries_gallery_idx','astral_cup_votes_entry_idx'] LOOP
    IF pg_catalog.to_regclass('public.' || object_name) IS NOT NULL THEN RAISE EXCEPTION 'Existing object public.% requires separate review.', object_name; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('astral_cup_register_member','astral_cup_status','astral_cup_submit_entry','astral_cup_vote','astral_cup_admin_overview','astral_cup_admin_action')) THEN
    RAISE EXCEPTION 'Existing astral_cup RPC requires separate review.';
  END IF;
END;
$preflight$;

CREATE TABLE public.astral_cup_events (
  id text PRIMARY KEY,
  phase text NOT NULL DEFAULT 'upcoming' CHECK (phase IN ('upcoming','registration','painting','voting','ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.astral_cup_members (
  id uuid PRIMARY KEY,
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 60),
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.astral_cup_entries (
  id uuid PRIMARY KEY,
  event_id text NOT NULL REFERENCES public.astral_cup_events(id),
  author_id uuid NOT NULL REFERENCES public.astral_cup_members(id),
  author_name text NOT NULL CHECK (length(author_name) BETWEEN 1 AND 60),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  description text NOT NULL CHECK (length(description)<=1000),
  division text NOT NULL CHECK (division IN ('beginner','experienced')),
  images text[] NOT NULL CHECK (cardinality(images) BETWEEN 1 AND 4 AND array_position(images,NULL) IS NULL),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','hidden')),
  review_note text NOT NULL DEFAULT '' CHECK (length(review_note)<=1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id,event_id,author_id,division)
);
CREATE TABLE public.astral_cup_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES public.astral_cup_events(id),
  voter_id uuid NOT NULL REFERENCES public.astral_cup_members(id),
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 5),
  entry_id uuid NOT NULL,
  author_id uuid NOT NULL,
  division text NOT NULL CHECK (division IN ('beginner','experienced')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id,voter_id,division,slot),
  UNIQUE (event_id,voter_id,division,author_id),
  FOREIGN KEY (entry_id,event_id,author_id,division) REFERENCES public.astral_cup_entries(id,event_id,author_id,division)
);
CREATE TABLE public.astral_cup_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor text NOT NULL CHECK (length(actor) BETWEEN 1 AND 160),
  action text NOT NULL,
  target text NOT NULL,
  before_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX astral_cup_entries_gallery_idx ON public.astral_cup_entries(event_id,status,division,created_at DESC);
CREATE INDEX astral_cup_votes_entry_idx ON public.astral_cup_votes(entry_id);
INSERT INTO public.astral_cup_events(id) VALUES ('astral-cup-1');

ALTER TABLE public.astral_cup_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astral_cup_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astral_cup_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astral_cup_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astral_cup_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.astral_cup_events,public.astral_cup_members,public.astral_cup_entries,public.astral_cup_votes,public.astral_cup_audit FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,UPDATE ON public.astral_cup_events TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.astral_cup_members,public.astral_cup_entries TO service_role;
GRANT SELECT,INSERT,DELETE ON public.astral_cup_votes TO service_role;
GRANT SELECT,INSERT ON public.astral_cup_audit TO service_role;

CREATE FUNCTION public.astral_cup_register_member(p_id uuid,p_email text,p_display_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE member public.astral_cup_members;
BEGIN
  IF p_email IS NULL OR length(p_email) NOT BETWEEN 3 AND 320 OR p_display_name IS NULL OR length(p_display_name) NOT BETWEEN 1 AND 60 THEN RETURN jsonb_build_object('error','账号资料无效。','status',400); END IF;
  INSERT INTO public.astral_cup_members(id,email,display_name) VALUES(p_id,p_email,p_display_name)
  ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,last_login_at=now()
  RETURNING * INTO member;
  RETURN to_jsonb(member);
END;
$fn$;

CREATE FUNCTION public.astral_cup_status(p_member_id uuid DEFAULT NULL,p_division text DEFAULT NULL,p_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE event public.astral_cup_events; member public.astral_cup_members; entries jsonb; mine jsonb; user_data jsonb; has_more boolean;
BEGIN
  SELECT * INTO event FROM public.astral_cup_events WHERE id='astral-cup-1';
  IF NOT FOUND THEN RETURN jsonb_build_object('error','活动尚未配置。','status',503); END IF;
  IF p_division IS NOT NULL AND p_division NOT IN ('beginner','experienced') OR p_page IS NULL OR p_page<1 OR p_page>10000 THEN RETURN jsonb_build_object('error','展示参数无效。','status',400); END IF;
  SELECT COALESCE(jsonb_agg(item.data ORDER BY item.created_at DESC,item.id DESC),'[]'::jsonb) INTO entries FROM (
    SELECT e.id,e.created_at,jsonb_build_object('id',e.id,'authorId',e.author_id,'authorName',e.author_name,'title',e.title,'description',e.description,'division',e.division,'images',e.images,'status',e.status,'reviewNote','','votes',(SELECT count(*) FROM public.astral_cup_votes v WHERE v.entry_id=e.id),'createdAt',e.created_at) AS data
    FROM public.astral_cup_entries e WHERE e.event_id=event.id AND e.status='approved' AND (p_division IS NULL OR e.division=p_division)
    ORDER BY e.created_at DESC,e.id DESC OFFSET (p_page-1)*24 LIMIT 24
  ) item;
  SELECT EXISTS(SELECT 1 FROM public.astral_cup_entries e WHERE e.event_id=event.id AND e.status='approved' AND (p_division IS NULL OR e.division=p_division) OFFSET p_page*24 LIMIT 1) INTO has_more;
  SELECT * INTO member FROM public.astral_cup_members WHERE id=p_member_id;
  IF FOUND THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',e.id,'authorId',e.author_id,'authorName',e.author_name,'title',e.title,'description',e.description,'division',e.division,'images',e.images,'status',e.status,'reviewNote',e.review_note,'votes',(SELECT count(*) FROM public.astral_cup_votes v WHERE v.entry_id=e.id),'createdAt',e.created_at) ORDER BY e.created_at DESC),'[]'::jsonb) INTO mine FROM public.astral_cup_entries e WHERE e.event_id=event.id AND e.author_id=member.id;
    SELECT jsonb_build_object('id',member.id,'displayName',member.display_name,'email',member.email,'disabled',member.disabled,
      'votesUsed',jsonb_build_object('beginner',count(*) FILTER(WHERE v.division='beginner'),'experienced',count(*) FILTER(WHERE v.division='experienced')),
      'votedAuthors',jsonb_build_object('beginner',COALESCE(jsonb_agg(v.author_id) FILTER(WHERE v.division='beginner'),'[]'::jsonb),'experienced',COALESCE(jsonb_agg(v.author_id) FILTER(WHERE v.division='experienced'),'[]'::jsonb)))
    INTO user_data FROM public.astral_cup_votes v WHERE v.event_id=event.id AND v.voter_id=member.id;
  END IF;
  RETURN jsonb_build_object('event',jsonb_build_object('id',event.id,'phase',event.phase,'updatedAt',event.updated_at),'entries',entries,'myEntries',COALESCE(mine,'[]'::jsonb),'user',user_data,'page',p_page,'hasMore',has_more);
END;
$fn$;

CREATE FUNCTION public.astral_cup_submit_entry(p_id uuid,p_member_id uuid,p_title text,p_description text,p_division text,p_images text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE event public.astral_cup_events; member public.astral_cup_members;
BEGIN
  SELECT * INTO event FROM public.astral_cup_events WHERE id='astral-cup-1' FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','活动尚未配置。','status',503); END IF;
  IF event.phase NOT IN ('registration','painting') THEN RETURN jsonb_build_object('error','当前阶段暂不接受投稿。','status',409); END IF;
  SELECT * INTO member FROM public.astral_cup_members WHERE id=p_member_id FOR UPDATE;
  IF NOT FOUND OR member.disabled THEN RETURN jsonb_build_object('error','账号无效或已停用。','status',403); END IF;
  IF p_title IS NULL OR length(p_title) NOT BETWEEN 1 AND 80 OR p_description IS NULL OR length(p_description)>1000 OR p_division IS NULL OR p_division NOT IN ('beginner','experienced') OR p_images IS NULL OR cardinality(p_images) NOT BETWEEN 1 AND 4 OR EXISTS(SELECT 1 FROM unnest(p_images) path WHERE path IS NULL OR path NOT LIKE event.id || '/' || member.id::text || '/%.jpg' OR path LIKE '%..%') THEN RETURN jsonb_build_object('error','投稿内容无效。','status',400); END IF;
  INSERT INTO public.astral_cup_entries(id,event_id,author_id,author_name,title,description,division,images) VALUES(p_id,event.id,member.id,member.display_name,p_title,p_description,p_division,p_images);
  RETURN jsonb_build_object('ok',true,'id',p_id);
END;
$fn$;

CREATE FUNCTION public.astral_cup_vote(p_member_id uuid,p_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE event public.astral_cup_events; member public.astral_cup_members; entry public.astral_cup_entries; free_slot smallint; vote_id uuid;
BEGIN
  SELECT * INTO event FROM public.astral_cup_events WHERE id='astral-cup-1' FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','活动尚未配置。','status',503); END IF;
  IF event.phase<>'voting' THEN RETURN jsonb_build_object('error','当前阶段尚未开放投票或投票已结束。','status',409); END IF;
  SELECT * INTO member FROM public.astral_cup_members WHERE id=p_member_id FOR UPDATE;
  IF NOT FOUND OR member.disabled THEN RETURN jsonb_build_object('error','账号无效或已停用。','status',403); END IF;
  SELECT * INTO entry FROM public.astral_cup_entries WHERE id=p_entry_id AND event_id=event.id FOR SHARE;
  IF NOT FOUND OR entry.status<>'approved' THEN RETURN jsonb_build_object('error','作品尚未公开或已下架。','status',404); END IF;
  IF EXISTS(SELECT 1 FROM public.astral_cup_votes WHERE event_id=event.id AND voter_id=member.id AND division=entry.division AND author_id=entry.author_id) THEN RETURN jsonb_build_object('error','你已在本组支持过这位作者。','status',409); END IF;
  SELECT n::smallint INTO free_slot FROM generate_series(1,5) n WHERE NOT EXISTS(SELECT 1 FROM public.astral_cup_votes WHERE event_id=event.id AND voter_id=member.id AND division=entry.division AND slot=n) ORDER BY n LIMIT 1;
  IF free_slot IS NULL THEN RETURN jsonb_build_object('error','本组的5票已经用完。','status',409); END IF;
  INSERT INTO public.astral_cup_votes(event_id,voter_id,slot,entry_id,author_id,division) VALUES(event.id,member.id,free_slot,entry.id,entry.author_id,entry.division) RETURNING id INTO vote_id;
  RETURN jsonb_build_object('ok',true,'id',vote_id);
END;
$fn$;

CREATE FUNCTION public.astral_cup_admin_overview()
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
  SELECT jsonb_build_object(
    'event',jsonb_build_object('id',ev.id,'phase',ev.phase,'updatedAt',ev.updated_at),
    'entries',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'authorId',e.author_id,'authorName',e.author_name,'title',e.title,'description',e.description,'division',e.division,'images',e.images,'status',e.status,'reviewNote',e.review_note,'votes',(SELECT count(*) FROM public.astral_cup_votes v WHERE v.entry_id=e.id),'createdAt',e.created_at) ORDER BY e.created_at DESC) FROM public.astral_cup_entries e WHERE e.event_id=ev.id),'[]'::jsonb),
    'members',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',m.id,'email',m.email,'displayName',m.display_name,'disabled',m.disabled,'createdAt',m.created_at,'lastLoginAt',m.last_login_at) ORDER BY m.created_at DESC) FROM public.astral_cup_members m),'[]'::jsonb),
    'votes',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'voterId',v.voter_id,'voterEmail',m.email,'authorId',v.author_id,'authorName',e.author_name,'entryId',v.entry_id,'entryTitle',e.title,'division',v.division,'createdAt',v.created_at) ORDER BY v.created_at DESC) FROM public.astral_cup_votes v JOIN public.astral_cup_members m ON m.id=v.voter_id JOIN public.astral_cup_entries e ON e.id=v.entry_id WHERE v.event_id=ev.id),'[]'::jsonb),
    'audit',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'actor',a.actor,'action',a.action,'target',a.target,'createdAt',a.created_at) ORDER BY a.created_at DESC) FROM (SELECT * FROM public.astral_cup_audit ORDER BY created_at DESC LIMIT 100) a),'[]'::jsonb)
  ) FROM public.astral_cup_events ev WHERE ev.id='astral-cup-1';
$fn$;

CREATE FUNCTION public.astral_cup_admin_action(p_actor text,p_op text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE event public.astral_cup_events; before_value jsonb; target_value text; member public.astral_cup_members; entry public.astral_cup_entries; vote public.astral_cup_votes; next_phase text; next_status text; division_value text;
BEGIN
  IF p_actor IS NULL OR length(p_actor) NOT BETWEEN 1 AND 160 THEN RETURN jsonb_build_object('error','管理员身份无效。','status',401); END IF;
  SELECT * INTO event FROM public.astral_cup_events WHERE id='astral-cup-1' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','活动尚未配置。','status',503); END IF;
  CASE p_op
    WHEN 'adminSetPhase' THEN
      next_phase=p_payload->>'phase';
      IF next_phase IS NULL OR next_phase NOT IN ('upcoming','registration','painting','voting','ended') THEN RETURN jsonb_build_object('error','活动阶段无效。','status',400); END IF;
      SELECT jsonb_build_object('event',to_jsonb(event),'votes',COALESCE(jsonb_agg(v),'[]'::jsonb)) INTO before_value FROM public.astral_cup_votes v WHERE event_id=event.id;
      target_value=event.id;
      UPDATE public.astral_cup_events SET phase=next_phase,updated_at=clock_timestamp() WHERE id=event.id;
    WHEN 'adminReviewEntry' THEN
      next_status=p_payload->>'status';
      IF next_status IS NULL OR next_status NOT IN ('approved','rejected','hidden') OR length(COALESCE(p_payload->>'reviewNote',''))>1000 THEN RETURN jsonb_build_object('error','审核内容无效。','status',400); END IF;
      SELECT * INTO entry FROM public.astral_cup_entries WHERE id=(p_payload->>'entryId')::uuid AND event_id=event.id FOR UPDATE;
      IF NOT FOUND THEN RETURN jsonb_build_object('error','作品不存在。','status',404); END IF;
      SELECT jsonb_build_object('entry',to_jsonb(entry),'votes',COALESCE(jsonb_agg(v),'[]'::jsonb)) INTO before_value FROM public.astral_cup_votes v WHERE entry_id=entry.id;
      target_value=entry.id::text;
      UPDATE public.astral_cup_entries SET status=next_status,review_note=COALESCE(p_payload->>'reviewNote','') WHERE id=entry.id;
    WHEN 'adminSetMember' THEN
      IF jsonb_typeof(p_payload->'disabled') IS DISTINCT FROM 'boolean' THEN RETURN jsonb_build_object('error','账号状态无效。','status',400); END IF;
      SELECT * INTO member FROM public.astral_cup_members WHERE id=(p_payload->>'memberId')::uuid FOR UPDATE;
      IF NOT FOUND THEN RETURN jsonb_build_object('error','参与者不存在。','status',404); END IF;
      SELECT jsonb_build_object('member',to_jsonb(member),'votes',COALESCE(jsonb_agg(v),'[]'::jsonb)) INTO before_value FROM public.astral_cup_votes v WHERE event_id=event.id AND voter_id=member.id;
      target_value=member.id::text;
      UPDATE public.astral_cup_members SET disabled=(p_payload->>'disabled')::boolean WHERE id=member.id;
    WHEN 'adminRevokeVote' THEN
      SELECT * INTO vote FROM public.astral_cup_votes WHERE id=(p_payload->>'voteId')::uuid AND event_id=event.id;
      IF NOT FOUND THEN RETURN jsonb_build_object('error','该票不存在或已撤销。','status',404); END IF;
      before_value=to_jsonb(vote); target_value=vote.id::text;
      DELETE FROM public.astral_cup_votes WHERE id=vote.id;
    WHEN 'adminClearVotes' THEN
      division_value=p_payload->>'division';
      IF p_payload->>'confirmation' IS DISTINCT FROM '清空票数' OR division_value IS NULL OR division_value NOT IN ('beginner','experienced','all') THEN RETURN jsonb_build_object('error','清票范围或确认文字无效。','status',400); END IF;
      SELECT COALESCE(jsonb_agg(v),'[]'::jsonb) INTO before_value FROM public.astral_cup_votes v WHERE event_id=event.id AND (division_value='all' OR division=division_value);
      target_value=division_value;
      DELETE FROM public.astral_cup_votes WHERE event_id=event.id AND (division_value='all' OR division=division_value);
    ELSE RETURN jsonb_build_object('error','管理操作无效。','status',400);
  END CASE;
  INSERT INTO public.astral_cup_audit(actor,action,target,before_data) VALUES(p_actor,p_op,target_value,jsonb_build_object('before',before_value,'requested',p_payload));
  RETURN jsonb_build_object('ok',true);
END;
$fn$;

REVOKE ALL ON FUNCTION public.astral_cup_register_member(uuid,text,text),public.astral_cup_status(uuid,text,integer),public.astral_cup_submit_entry(uuid,uuid,text,text,text,text[]),public.astral_cup_vote(uuid,uuid),public.astral_cup_admin_overview(),public.astral_cup_admin_action(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.astral_cup_register_member(uuid,text,text),public.astral_cup_status(uuid,text,integer),public.astral_cup_submit_entry(uuid,uuid,text,text,text,text[]),public.astral_cup_vote(uuid,uuid),public.astral_cup_admin_overview(),public.astral_cup_admin_action(text,text,jsonb) TO service_role;
COMMIT;
