-- 仅开放管理员修改报名组别及选款；原金额、个人资料和关联标识保持原值。
BEGIN;
SET LOCAL lock_timeout='2s';
DO $check$ BEGIN
  IF to_regprocedure('public.astral_cup_admin_update_registration(text,uuid,text,jsonb,jsonb)') IS NOT NULL
     OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.astral_cup_registrations'::regclass AND conname='astral_cup_registrations_check1' AND pg_get_constraintdef(oid) LIKE '%fee_cents%CASE%') THEN
    RAISE EXCEPTION 'Registration edit schema differs; review before applying.';
  END IF;
END $check$;
ALTER TABLE public.astral_cup_registrations DROP CONSTRAINT astral_cup_registrations_check1;
ALTER TABLE public.astral_cup_registrations ADD CONSTRAINT astral_cup_registrations_fee_cents_check CHECK(fee_cents IN(1590,1990));
GRANT UPDATE(division,models) ON public.astral_cup_registrations TO service_role;
GRANT UPDATE(items,piece_count,note) ON public.astral_workshop_orders TO service_role;

CREATE FUNCTION public.astral_cup_admin_update_registration(p_actor text,p_id uuid,p_division text,p_models jsonb,p_expected jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $fn$
DECLARE
  saved public.astral_cup_registrations; linked public.astral_workshop_orders;
  old_ids jsonb; next_items jsonb; next_note text; division_name text; treatment text;
  old_header text; new_header text; old_tail text; new_tail text;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.astral_workshop_admin_accounts WHERE username=p_actor) THEN
    RETURN jsonb_build_object('error','管理员身份无效。','status',401);
  END IF;
  IF p_id IS NULL OR p_division IS NULL OR p_division NOT IN('beginner','experienced')
     OR p_models IS NULL OR jsonb_typeof(p_models)<>'array' OR p_expected IS NULL OR jsonb_typeof(p_expected)<>'object' THEN
    RETURN jsonb_build_object('error','请选择组别及对应数量的模型。','status',400);
  END IF;
  IF jsonb_array_length(p_models)<>(CASE p_division WHEN 'beginner' THEN 1 ELSE 2 END)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_models) m WHERE jsonb_typeof(m)<>'object' OR COALESCE(m->>'id','') !~ '^dwarf-(0[1-9]|1[0-9]|20)$' OR COALESCE(m->>'name','')='' OR COALESCE(m->>'image','') NOT LIKE '/assets/%') THEN
    RETURN jsonb_build_object('error','请选择本届指定的矮人模型及正确数量。','status',400);
  END IF;
  -- 与订单删除一致，先锁订单，再锁对应报名；两处修改在同一事务提交。
  SELECT * INTO saved FROM public.astral_cup_registrations WHERE id=p_id AND event_id='astral-cup-1';
  IF NOT FOUND THEN RETURN jsonb_build_object('error','报名不存在或已删除，请刷新列表。','status',404); END IF;
  SELECT * INTO linked FROM public.astral_workshop_orders WHERE id=saved.order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','关联订单不存在，请刷新核对。','status',409); END IF;
  SELECT * INTO saved FROM public.astral_cup_registrations WHERE id=p_id AND event_id='astral-cup-1' FOR UPDATE;
  IF NOT FOUND OR saved.order_id IS DISTINCT FROM linked.id THEN RETURN jsonb_build_object('error','报名已发生变化，请刷新后重试。','status',409); END IF;
  SELECT jsonb_agg(m->>'id' ORDER BY n) INTO old_ids FROM jsonb_array_elements(saved.models) WITH ORDINALITY AS selected(m,n);
  IF p_expected IS DISTINCT FROM jsonb_build_object('division',saved.division,'modelIds',old_ids) THEN
    RETURN jsonb_build_object('error','此报名已被其他管理员修改，请刷新后重新选择。','status',409);
  END IF;
  IF saved.division=p_division AND saved.models=p_models THEN RETURN jsonb_build_object('ok',true,'unchanged',true); END IF;
  division_name=CASE p_division WHEN 'beginner' THEN '新手组' ELSE '老手组' END;
  treatment=CASE p_division WHEN 'beginner' THEN '赠送 1 只打磨预处理矮人，包邮到家' ELSE '赠送 2 只未处理矮人，由主办方寄送' END;
  SELECT jsonb_agg(jsonb_build_object(
    'name','星界杯 · '||division_name||'报名 · '||(m->>'name'),'officialName',m->>'officialName',
    'source',m->>'source','series',m->>'series','issue',m->>'issue','sourceUrl',m->>'sourceUrl','image',m->>'image',
    'note',treatment||CASE WHEN n>1 THEN '（费用已包含）' ELSE '' END,'quantity',1,'unit','枚','tier','cup',
    'unitMin',CASE WHEN n=1 THEN linked.total_min/100.0 ELSE 0 END,'unitMax',CASE WHEN n=1 THEN linked.total_max/100.0 ELSE 0 END,
    'lineMin',CASE WHEN n=1 THEN linked.total_min/100.0 ELSE 0 END,'lineMax',CASE WHEN n=1 THEN linked.total_max/100.0 ELSE 0 END) ORDER BY n)
    INTO next_items FROM jsonb_array_elements(p_models) WITH ORDINALITY AS selected(m,n);
  -- 只替换已知的赛道标题和赠送说明；原地址、联系信息及额外备注逐字保留。
  old_header='【星界杯报名】'||chr(10)||'参赛用户名：'||saved.display_name||chr(10)||'注册邮箱：'||saved.email||chr(10)||'赛道：'||CASE saved.division WHEN 'beginner' THEN '新手组' ELSE '老手组' END||chr(10);
  new_header='【星界杯报名】'||chr(10)||'参赛用户名：'||saved.display_name||chr(10)||'注册邮箱：'||saved.email||chr(10)||'赛道：'||division_name||chr(10);
  next_note=linked.note;
  IF starts_with(next_note,old_header) THEN next_note=new_header||substr(next_note,length(old_header)+1); END IF;
  old_tail=chr(10)||CASE saved.division WHEN 'beginner' THEN '赠送 1 只打磨预处理矮人，包邮到家' ELSE '赠送 2 只未处理矮人，由主办方寄送' END||chr(10)||'未在线付款；报名费用请联系主办方确认。';
  new_tail=chr(10)||treatment||chr(10)||'未在线付款；报名费用请联系主办方确认。';
  IF right(next_note,length(old_tail))=old_tail THEN next_note=left(next_note,length(next_note)-length(old_tail))||new_tail; END IF;
  UPDATE public.astral_cup_registrations SET division=p_division,models=p_models WHERE id=saved.id;
  UPDATE public.astral_workshop_orders SET items=next_items::text,piece_count=jsonb_array_length(p_models),note=next_note WHERE id=linked.id;
  INSERT INTO public.astral_cup_audit(actor,action,target,before_data) VALUES(p_actor,'adminUpdateRegistration',saved.id::text,
    jsonb_build_object('before',jsonb_build_object('division',saved.division,'models',saved.models),'requested',jsonb_build_object('division',p_division,'models',p_models)));
  RETURN jsonb_build_object('ok',true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.astral_cup_admin_update_registration(text,uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.astral_cup_admin_update_registration(text,uuid,text,jsonb,jsonb) TO service_role;
COMMIT;
