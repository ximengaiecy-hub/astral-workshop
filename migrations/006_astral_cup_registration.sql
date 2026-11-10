-- 报名与预估订单在同一事务内保存；只新增星界杯专用表及 RPC。
BEGIN;
SET LOCAL lock_timeout='2s';
DO $check$ BEGIN
  IF to_regclass('public.astral_cup_registrations') IS NOT NULL OR to_regprocedure('public.astral_cup_enroll(uuid,uuid,uuid,text,text,jsonb,text,text,text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Registration objects already exist; review before applying.';
  END IF;
END $check$;

CREATE TABLE public.astral_cup_registrations (
  id uuid PRIMARY KEY,
  event_id text NOT NULL REFERENCES public.astral_cup_events(id),
  member_id uuid NOT NULL REFERENCES public.astral_cup_members(id),
  request_id uuid NOT NULL UNIQUE,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  order_id text UNIQUE REFERENCES public.astral_workshop_orders(id) ON DELETE SET NULL,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 60),
  email text NOT NULL,
  division text NOT NULL CHECK (division IN ('beginner','experienced')),
  models jsonb NOT NULL CHECK (jsonb_typeof(models)='array' AND jsonb_array_length(models)=CASE division WHEN 'beginner' THEN 1 ELSE 2 END),
  recipient text NOT NULL CHECK (length(recipient) BETWEEN 1 AND 60),
  phone text NOT NULL CHECK (length(phone) BETWEEN 6 AND 30),
  address text NOT NULL CHECK (length(address) BETWEEN 8 AND 300),
  contact text NOT NULL CHECK (length(contact) BETWEEN 1 AND 160),
  fee_cents integer NOT NULL CHECK (fee_cents=CASE division WHEN 'beginner' THEN 1590 ELSE 1990 END),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id,member_id)
);
ALTER TABLE public.astral_cup_registrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.astral_cup_registrations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.astral_cup_registrations TO service_role;

CREATE FUNCTION public.astral_cup_enroll(p_id uuid,p_member_id uuid,p_request_id uuid,p_payload_hash text,p_division text,p_models jsonb,p_recipient text,p_phone text,p_address text,p_contact text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
  event public.astral_cup_events; member public.astral_cup_members; saved public.astral_cup_registrations;
  fee integer; piece_count integer; division_name text; treatment text; order_items jsonb; order_note text;
BEGIN
  SELECT * INTO event FROM public.astral_cup_events WHERE id='astral-cup-1' FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','活动尚未配置。','status',503); END IF;
  SELECT * INTO member FROM public.astral_cup_members WHERE id=p_member_id FOR UPDATE;
  IF NOT FOUND OR member.disabled THEN RETURN jsonb_build_object('error','账号无效或已停用。','status',403); END IF;
  SELECT * INTO saved FROM public.astral_cup_registrations WHERE event_id=event.id AND member_id=member.id;
  IF FOUND THEN
    IF saved.request_id=p_request_id AND saved.payload_hash=p_payload_hash THEN
      RETURN jsonb_build_object('ok',true,'reused',true,'registration',to_jsonb(saved)-'payload_hash'-'request_id');
    END IF;
    RETURN jsonb_build_object('error','本账号已报名本届赛事，请到报名页查看记录；修改请联系主办方。','status',409);
  END IF;
  IF event.phase<>'registration' THEN RETURN jsonb_build_object('error','当前不在报名阶段，暂不能提交报名。','status',409); END IF;
  IF p_id IS NULL OR p_request_id IS NULL OR p_payload_hash IS NULL OR p_payload_hash !~ '^[a-f0-9]{64}$'
     OR p_division IS NULL OR p_division NOT IN ('beginner','experienced') OR p_models IS NULL OR jsonb_typeof(p_models)<>'array'
     OR (CASE WHEN jsonb_typeof(p_models)='array' THEN jsonb_array_length(p_models) ELSE 0 END)<>(CASE p_division WHEN 'beginner' THEN 1 ELSE 2 END)
     OR p_recipient IS NULL OR length(trim(p_recipient)) NOT BETWEEN 1 AND 60
     OR p_phone IS NULL OR p_phone !~ '^[+0-9][0-9 ()-]{5,29}$'
     OR p_address IS NULL OR length(trim(p_address)) NOT BETWEEN 8 AND 300
     OR p_contact IS NULL OR length(trim(p_contact)) NOT BETWEEN 1 AND 160 THEN
    RETURN jsonb_build_object('error','报名内容无效，请核对选款、赛道和邮寄资料。','status',400);
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_models) m WHERE jsonb_typeof(m)<>'object' OR COALESCE(m->>'id','') !~ '^dwarf-(0[1-9]|1[0-9]|20)$' OR COALESCE(m->>'name','')='' OR COALESCE(m->>'image','') NOT LIKE '/assets/%') THEN
    RETURN jsonb_build_object('error','请选择本届指定的矮人模型。','status',400);
  END IF;
  fee=CASE p_division WHEN 'beginner' THEN 1590 ELSE 1990 END;
  piece_count=jsonb_array_length(p_models);
  division_name=CASE p_division WHEN 'beginner' THEN '新手组' ELSE '老手组' END;
  treatment=CASE p_division WHEN 'beginner' THEN '赠送 1 只打磨预处理矮人，包邮到家' ELSE '赠送 2 只未处理矮人，由主办方寄送' END;
  SELECT jsonb_agg(jsonb_build_object(
    'name','星界杯 · ' || division_name || '报名 · ' || (m->>'name'),
    'officialName',m->>'officialName',
    'source',m->>'source','series',m->>'series','issue',m->>'issue',
    'sourceUrl',m->>'sourceUrl','image',m->>'image',
    'note',treatment || CASE WHEN n>1 THEN '（费用已包含）' ELSE '' END,
    'quantity',1,'unit','枚','tier','cup',
    'unitMin',CASE WHEN n=1 THEN fee/100.0 ELSE 0 END,
    'unitMax',CASE WHEN n=1 THEN fee/100.0 ELSE 0 END,
    'lineMin',CASE WHEN n=1 THEN fee/100.0 ELSE 0 END,
    'lineMax',CASE WHEN n=1 THEN fee/100.0 ELSE 0 END) ORDER BY n)
    INTO order_items FROM jsonb_array_elements(p_models) WITH ORDINALITY AS selected(m,n);
  order_note='【星界杯报名】' || chr(10) || '参赛用户名：' || member.display_name || chr(10) || '注册邮箱：' || member.email || chr(10) || '赛道：' || division_name || chr(10) || '收件人：' || trim(p_recipient) || chr(10) || '收件电话：' || trim(p_phone) || chr(10) || '邮寄地址：' || trim(p_address) || chr(10) || treatment || chr(10) || '未在线付款；报名费用请联系主办方确认。';
  INSERT INTO public.astral_workshop_orders(id,request_id,payload_hash,user_id,customer_name,contact,note,items,total_min,total_max,piece_count,created_at)
    VALUES(p_id::text,p_request_id::text,p_payload_hash,member.id::text,member.display_name,trim(p_contact),order_note,order_items::text,fee,fee,piece_count,to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  INSERT INTO public.astral_cup_registrations(id,event_id,member_id,request_id,payload_hash,order_id,display_name,email,division,models,recipient,phone,address,contact,fee_cents)
    VALUES(p_id,event.id,member.id,p_request_id,p_payload_hash,p_id::text,member.display_name,member.email,p_division,p_models,trim(p_recipient),trim(p_phone),trim(p_address),trim(p_contact),fee) RETURNING * INTO saved;
  RETURN jsonb_build_object('ok',true,'registration',to_jsonb(saved)-'payload_hash'-'request_id');
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('error','提交标识已使用，请刷新报名记录后核对。','status',409);
END;
$fn$;
REVOKE ALL ON FUNCTION public.astral_cup_enroll(uuid,uuid,uuid,text,text,jsonb,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.astral_cup_enroll(uuid,uuid,uuid,text,text,jsonb,text,text,text,text) TO service_role;
COMMIT;
