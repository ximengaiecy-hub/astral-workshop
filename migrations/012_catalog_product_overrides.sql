BEGIN;
CREATE TABLE IF NOT EXISTS public.astral_workshop_product_overrides (
  kind text NOT NULL CHECK (kind IN ('model', 'card', 'bundle')),
  product_id text NOT NULL CHECK (product_id ~ '^[a-z0-9][a-z0-9_-]{0,159}$'),
  product jsonb NOT NULL CHECK (jsonb_typeof(product) = 'object' AND product ->> 'id' = product_id),
  version uuid NOT NULL,
  last_request_id uuid NOT NULL UNIQUE,
  last_request_hash text NOT NULL CHECK (last_request_hash ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL CHECK (length(updated_by) BETWEEN 1 AND 160),
  PRIMARY KEY (kind, product_id)
);
ALTER TABLE public.astral_workshop_product_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.astral_workshop_product_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.astral_workshop_product_overrides TO service_role;

CREATE OR REPLACE FUNCTION public.astral_workshop_catalog_state()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kind', kind, 'product_id', product_id, 'product', product) ORDER BY created_at, product_id)
      FROM public.astral_workshop_custom_products
    ), '[]'::jsonb),
    'deleted', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kind', kind, 'productId', product_id) ORDER BY kind, product_id)
      FROM public.astral_workshop_product_deletions
    ), '[]'::jsonb),
    'overrides', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('kind', kind, 'product_id', product_id, 'product', product, 'version', version) ORDER BY kind, product_id)
      FROM public.astral_workshop_product_overrides
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.astral_workshop_catalog_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.astral_workshop_catalog_state() TO service_role;

CREATE OR REPLACE FUNCTION public.astral_workshop_update_product(
  p_kind text, p_product_id text, p_expected_version text, p_request_id uuid,
  p_request_hash text, p_product jsonb, p_updated_by text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  current_row public.astral_workshop_product_overrides%ROWTYPE;
  applied_version uuid;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('model', 'card', 'bundle')
    OR p_product_id IS NULL OR p_product_id !~ '^[a-z0-9][a-z0-9_-]{0,159}$'
    OR p_request_id IS NULL OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$'
    OR p_product IS NULL OR jsonb_typeof(p_product) <> 'object' OR p_product ->> 'id' IS DISTINCT FROM p_product_id
    OR p_updated_by IS NULL OR length(p_updated_by) NOT BETWEEN 1 AND 160
    OR p_expected_version IS NULL OR (p_expected_version <> 'base' AND p_expected_version !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  THEN
    RETURN jsonb_build_object('ok', false, 'status', 400, 'error', '商品更新内容无效。');
  END IF;

  IF p_expected_version = 'base' THEN
    INSERT INTO public.astral_workshop_product_overrides
      (kind, product_id, product, version, last_request_id, last_request_hash, updated_by)
    VALUES (p_kind, p_product_id, p_product, gen_random_uuid(), p_request_id, p_request_hash, p_updated_by)
    ON CONFLICT (kind, product_id) DO NOTHING
    RETURNING version INTO applied_version;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'version', applied_version, 'applied', true);
    END IF;
  END IF;

  SELECT * INTO current_row FROM public.astral_workshop_product_overrides
  WHERE kind = p_kind AND product_id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'status', 409, 'error', '商品版本已改变，请刷新后重新编辑。');
  END IF;
  IF current_row.last_request_id = p_request_id THEN
    IF current_row.last_request_hash = p_request_hash THEN
      RETURN jsonb_build_object('ok', true, 'version', current_row.version, 'applied', false);
    END IF;
    RETURN jsonb_build_object('ok', false, 'status', 409, 'error', '此次提交内容已改变，请重新发起编辑。');
  END IF;
  IF p_expected_version = 'base' OR current_row.version::text <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'status', 409, 'error', '商品已被其他管理员更新，请刷新后重新编辑。');
  END IF;

  UPDATE public.astral_workshop_product_overrides
  SET product = p_product, version = gen_random_uuid(), last_request_id = p_request_id,
      last_request_hash = p_request_hash, updated_at = now(), updated_by = p_updated_by
  WHERE kind = p_kind AND product_id = p_product_id
  RETURNING version INTO applied_version;
  RETURN jsonb_build_object('ok', true, 'version', applied_version, 'applied', true);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO current_row FROM public.astral_workshop_product_overrides
  WHERE kind = p_kind AND product_id = p_product_id FOR UPDATE;
  IF FOUND AND current_row.last_request_id = p_request_id AND current_row.last_request_hash = p_request_hash THEN
    RETURN jsonb_build_object('ok', true, 'version', current_row.version, 'applied', false);
  END IF;
  RETURN jsonb_build_object('ok', false, 'status', 409, 'error', '此次提交标识已用于其他商品，请重新发起编辑。');
END;
$$;
REVOKE ALL ON FUNCTION public.astral_workshop_update_product(text, text, text, uuid, text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.astral_workshop_update_product(text, text, text, uuid, text, jsonb, text) TO service_role;
COMMIT;
