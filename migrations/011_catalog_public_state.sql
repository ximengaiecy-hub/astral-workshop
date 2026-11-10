BEGIN;
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
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.astral_workshop_catalog_state() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.astral_workshop_catalog_state() TO service_role;

CREATE OR REPLACE FUNCTION public.astral_workshop_custom_product_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', kind, 'product_id', product_id, 'product', product, 'request_hash', request_hash)), '[]'::jsonb)
  FROM public.astral_workshop_custom_products
  WHERE request_id = p_request_id;
$$;
REVOKE ALL ON FUNCTION public.astral_workshop_custom_product_request(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.astral_workshop_custom_product_request(uuid) TO service_role;
COMMIT;
