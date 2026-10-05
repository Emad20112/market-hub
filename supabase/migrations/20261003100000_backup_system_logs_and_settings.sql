-- ============================================================================
-- Migration: 20261003100000_backup_system_logs_and_settings.sql
-- Description: Create backup_logs table for persisting historical backup/restore events
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.backup_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL DEFAULT 'default',
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    actor_name TEXT NOT NULL DEFAULT 'المالك (Owner)',
    action_type TEXT NOT NULL CHECK (action_type IN ('manual_local', 'manual_cloud', 'auto_scheduled', 'pre_restore_safety')),
    storage_type TEXT NOT NULL CHECK (storage_type IN ('local', 'cloud', 'both')),
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'in_progress', 'pending')),
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    metadata JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view backup logs for their tenant"
    ON public.backup_logs
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert backup logs for their tenant"
    ON public.backup_logs
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Indexes for fast history queries
CREATE INDEX IF NOT EXISTS idx_backup_logs_tenant_created 
    ON public.backup_logs(tenant_id, created_at DESC);

COMMENT ON TABLE public.backup_logs IS 'Tracks all backup generation and restore operations for auditing and notification reminders.';
