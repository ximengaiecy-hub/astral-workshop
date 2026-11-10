BEGIN;
CREATE TABLE IF NOT EXISTS public.astral_workshop_custom_products (
  product_id text PRIMARY KEY CHECK (product_id ~ '^custom-(model|card|bundle)-[0-9a-f-]{36}$'),
  kind text NOT NULL CHECK (kind IN ('model', 'card', 'bundle')),
  product jsonb NOT NULL CHECK (jsonb_typeof(product) = 'object' AND product ->> 'id' = product_id),
  request_id uuid NOT NULL UNIQUE,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL CHECK (length(created_by) BETWEEN 1 AND 160)
);
ALTER TABLE public.astral_workshop_custom_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.astral_workshop_custom_products FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.astral_workshop_custom_products TO service_role;
COMMIT;
