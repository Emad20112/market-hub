-- Migration: Offline Sync Engine & Idempotency Protection
-- Date: 2026-09-30
-- Phase 2 Architecture Contract

CREATE TABLE IF NOT EXISTS public.sync_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT UNIQUE NOT NULL,
  entity_name TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  origin_device_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'completed', 'failed'
  response_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for instant idempotency checks
CREATE INDEX IF NOT EXISTS idx_sync_idempotency_key ON public.sync_idempotency_keys (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_sync_device_origin ON public.sync_idempotency_keys (origin_device_id, created_at);

-- Device Registration Table for Offline Multi-device Governance
CREATE TABLE IF NOT EXISTS public.device_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT UNIQUE NOT NULL,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'browser', -- 'desktop_tauri', 'web_pwa', 'browser'
  assigned_warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sync_idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_registrations ENABLE ROW LEVEL SECURITY;

-- Service role and authenticated user policies
CREATE POLICY "Authenticated users can check and insert idempotency keys"
  ON public.sync_idempotency_keys
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read device registrations"
  ON public.device_registrations
  FOR SELECT
  TO authenticated
  USING (true);

/**
 * Atomic Server Idempotency Handler RPC
 * Prevents double execution when client retries network requests.
 */
CREATE OR REPLACE FUNCTION public.sync_apply_operation(
  p_idempotency_key TEXT,
  p_entity_name TEXT,
  p_operation_type TEXT,
  p_origin_device_id TEXT,
  p_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing RECORD;
  v_result JSONB;
BEGIN
  -- 1. Check if idempotency key exists
  SELECT * INTO v_existing
  FROM public.sync_idempotency_keys
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.status = 'completed' THEN
      RETURN jsonb_build_object(
        'status', 'DUPLICATE_ACK',
        'idempotency_key', p_idempotency_key,
        'message', 'Operation already processed previously',
        'result', v_existing.response_payload
      );
    ELSIF v_existing.status = 'processing' THEN
      -- In-flight request concurrent lock
      RETURN jsonb_build_object(
        'status', 'IN_FLIGHT',
        'idempotency_key', p_idempotency_key,
        'message', 'Operation is currently being processed by server'
      );
    END IF;
  END IF;

  -- 2. Insert processing lock
  INSERT INTO public.sync_idempotency_keys (
    idempotency_key,
    entity_name,
    operation_type,
    origin_device_id,
    status
  ) VALUES (
    p_idempotency_key,
    p_entity_name,
    p_operation_type,
    p_origin_device_id,
    'processing'
  );

  -- 3. Return success acknowledgment payload template
  v_result := jsonb_build_object(
    'acknowledged', true,
    'entity_name', p_entity_name,
    'operation_type', p_operation_type,
    'processed_at', now()
  );

  -- Mark completed
  UPDATE public.sync_idempotency_keys
  SET status = 'completed',
      response_payload = v_result,
      updated_at = now()
  WHERE idempotency_key = p_idempotency_key;

  RETURN jsonb_build_object(
    'status', 'PROCESSED',
    'idempotency_key', p_idempotency_key,
    'result', v_result
  );

EXCEPTION WHEN OTHERS THEN
  UPDATE public.sync_idempotency_keys
  SET status = 'failed',
      error_message = SQLERRM,
      updated_at = now()
  WHERE idempotency_key = p_idempotency_key;

  RAISE EXCEPTION 'Sync Apply Operation Failed: %', SQLERRM;
END;
$$;
