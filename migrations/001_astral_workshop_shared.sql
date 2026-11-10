-- 星界工坊复用现有 PostgreSQL / Supabase 数据库：隔离表草案
-- 状态：未执行；本文件仅供审核，不会自动迁移密码、账户、订单或会话。
-- 范围：只新建四张 astral_workshop_ 专用表、三条专用索引和一个专用 RPC。
-- 不涉及龙鳞典藏的原有表、数据、Auth / Storage 等系统 schema。
-- 应用前必须逐一核对同名表、索引、函数；任何同名对象存在即中止本批事务。
-- CREATE TABLE / INDEX IF NOT EXISTS 仅作防覆盖保护，不能替代结构及权限核对。
-- 前提：目标库已经具有 public schema、anon / authenticated / service_role 角色；
-- service_role 已有 public 的 USAGE 权限和 BYPASSRLS（或超级用户）权限。
-- 执行者须有 public 的 CREATE 权限、创建函数所需权限及新对象的授权权限。
-- 本草案不创建 schema / 角色、不修改角色属性、不改变全局默认授权。
-- orders/accounts 仅授读取和插入；sessions/attempts 授读取、插入、更新及删除，用于原有注销和过期清理。
-- 本草案不执行数据删除或清理，也不对既有龙鳞典藏对象授权。
-- 本草案不会改动源码，不能直接作为现有 SQLite 程序可上线运行的证明。
-- service_role 凭证只可用于可信后端，禁止放入浏览器、公开目录或公开发布包。
-- 不创建访客读写策略；匿名订单应由本站后端验证并代为持久保存。
-- 表所有者及数据库超级用户的固有管理权限不由本草案撤销。

BEGIN;

DO $preflight$
DECLARE
  object_name text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'public') THEN
    RAISE EXCEPTION 'Required public schema is missing; no schema will be created.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS required(role_name)
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = required.role_name)
  ) THEN
    RAISE EXCEPTION 'Required existing database roles are missing; no roles will be created.';
  END IF;
  IF NOT pg_catalog.has_schema_privilege('service_role', 'public', 'USAGE')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role' AND (rolbypassrls OR rolsuper)) THEN
    RAISE EXCEPTION 'Existing service_role must already have public USAGE and RLS bypass.';
  END IF;
  FOREACH object_name IN ARRAY ARRAY[
    'astral_workshop_orders',
    'astral_workshop_admin_accounts',
    'astral_workshop_admin_sessions',
    'astral_workshop_admin_attempts',
    'astral_workshop_orders_created_at_idx',
    'astral_workshop_admin_sessions_expires_at_idx',
    'astral_workshop_admin_attempts_window_start_idx'
  ] LOOP
    IF pg_catalog.to_regclass('public.' || object_name) IS NOT NULL THEN
      RAISE EXCEPTION 'Existing object public.% requires separate review; draft stopped.', object_name;
    END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public' AND procedure.proname = 'astral_workshop_record_admin_attempt'
  ) THEN
    RAISE EXCEPTION 'Existing astral_workshop_record_admin_attempt function requires separate review; draft stopped.';
  END IF;
END;
$preflight$;

CREATE TABLE IF NOT EXISTS public.astral_workshop_orders (
  id text PRIMARY KEY NOT NULL,
  request_id text NOT NULL UNIQUE,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  user_id text,
  customer_name text NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 80),
  contact text NOT NULL CHECK (length(contact) BETWEEN 1 AND 160),
  note text NOT NULL CHECK (length(note) <= 1000),
  items text NOT NULL,
  total_min bigint NOT NULL CHECK (total_min BETWEEN 0 AND 9007199254740991),
  total_max bigint NOT NULL CHECK (total_max BETWEEN total_min AND 9007199254740991),
  piece_count bigint NOT NULL CHECK (piece_count BETWEEN 1 AND 9007199254740991),
  created_at text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.astral_workshop_admin_accounts (
  username text PRIMARY KEY NOT NULL CHECK (length(username) BETWEEN 1 AND 160),
  password_salt text NOT NULL CHECK (password_salt ~ '^[a-f0-9]{32}$'),
  password_hash text NOT NULL CHECK (password_hash ~ '^[a-f0-9]{64}$'),
  created_at bigint NOT NULL CHECK (created_at BETWEEN 0 AND 9007199254740991)
);

CREATE TABLE IF NOT EXISTS public.astral_workshop_admin_sessions (
  token_hash text PRIMARY KEY NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  username text NOT NULL REFERENCES public.astral_workshop_admin_accounts(username) ON DELETE CASCADE,
  expires_at bigint NOT NULL CHECK (expires_at BETWEEN 0 AND 9007199254740991)
);

CREATE TABLE IF NOT EXISTS public.astral_workshop_admin_attempts (
  key text PRIMARY KEY NOT NULL CHECK (key ~ '^[a-f0-9]{64}$'),
  window_start bigint NOT NULL CHECK (window_start BETWEEN 0 AND 9007199254740991),
  count bigint NOT NULL CHECK (count BETWEEN 1 AND 9007199254740991)
);

CREATE INDEX IF NOT EXISTS astral_workshop_orders_created_at_idx ON public.astral_workshop_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS astral_workshop_admin_sessions_expires_at_idx ON public.astral_workshop_admin_sessions (expires_at);
CREATE INDEX IF NOT EXISTS astral_workshop_admin_attempts_window_start_idx ON public.astral_workshop_admin_attempts (window_start);

ALTER TABLE public.astral_workshop_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astral_workshop_admin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astral_workshop_admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.astral_workshop_admin_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.astral_workshop_orders, public.astral_workshop_admin_accounts, public.astral_workshop_admin_sessions, public.astral_workshop_admin_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.astral_workshop_orders, public.astral_workshop_admin_accounts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.astral_workshop_admin_sessions, public.astral_workshop_admin_attempts TO service_role;

CREATE FUNCTION public.astral_workshop_record_admin_attempt(p_key text, p_now bigint, p_cutoff bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $attempt$
DECLARE
  attempt_count bigint;
BEGIN
  IF p_cutoff IS NULL OR p_cutoff < 0 OR p_now IS NULL OR p_cutoff > p_now THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid attempt time window.';
  END IF;
  INSERT INTO public.astral_workshop_admin_attempts AS attempts (key, window_start, count)
  VALUES (p_key, p_now, 1)
  ON CONFLICT (key) DO UPDATE
  SET window_start = CASE WHEN attempts.window_start < p_cutoff THEN EXCLUDED.window_start ELSE attempts.window_start END,
      count = CASE WHEN attempts.window_start < p_cutoff THEN 1 ELSE attempts.count + 1 END
  RETURNING attempts.count INTO attempt_count;
  RETURN attempt_count;
END;
$attempt$;

REVOKE ALL ON FUNCTION public.astral_workshop_record_admin_attempt(text, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.astral_workshop_record_admin_attempt(text, bigint, bigint) TO service_role;

COMMIT;