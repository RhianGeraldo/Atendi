-- Migration: Create user_daily_activity table and tracking columns
-- Tracks active, idle, and background tab presence per user per day

CREATE TABLE IF NOT EXISTS public.user_daily_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    total_logged_seconds INTEGER NOT NULL DEFAULT 0,
    total_active_seconds INTEGER NOT NULL DEFAULT 0,
    total_idle_seconds INTEGER NOT NULL DEFAULT 0,
    total_background_seconds INTEGER NOT NULL DEFAULT 0,
    
    current_status TEXT NOT NULL DEFAULT 'offline', -- 'active', 'idle', 'background', 'offline'
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    CONSTRAINT user_daily_activity_user_date_key UNIQUE(user_id, date)
);

-- Performance indices
CREATE INDEX IF NOT EXISTS idx_user_daily_activity_company_date 
ON public.user_daily_activity(company_id, date);

CREATE INDEX IF NOT EXISTS idx_user_daily_activity_user_date 
ON public.user_daily_activity(user_id, date);

-- Enable Row Level Security
ALTER TABLE public.user_daily_activity ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Allow select user_daily_activity for company users" ON public.user_daily_activity;
DROP POLICY IF EXISTS "Allow manage own user_daily_activity" ON public.user_daily_activity;

-- Policies:
-- Authenticated users can view activities from their company
CREATE POLICY "Allow select user_daily_activity for company users"
ON public.user_daily_activity
FOR SELECT
TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
  )
);

-- Users can insert and update their own activity records
CREATE POLICY "Allow manage own user_daily_activity"
ON public.user_daily_activity
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Add current_status and last_seen_at to profiles if not exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'offline';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

-- Atomic Heartbeat RPC function
CREATE OR REPLACE FUNCTION public.record_user_heartbeat(
  p_user_id UUID,
  p_company_id UUID,
  p_status TEXT,
  p_interval_seconds INT
)
RETURNS VOID AS $$
DECLARE
  v_date DATE := CURRENT_DATE;
  v_active_add INT := 0;
  v_idle_add INT := 0;
  v_bg_add INT := 0;
  v_logged_add INT := 0;
BEGIN
  IF p_status = 'active' THEN
    v_active_add := p_interval_seconds;
    v_logged_add := p_interval_seconds;
  ELSIF p_status = 'idle' THEN
    v_idle_add := p_interval_seconds;
    v_logged_add := p_interval_seconds;
  ELSIF p_status = 'background' THEN
    v_bg_add := p_interval_seconds;
    v_logged_add := p_interval_seconds;
  END IF;

  -- Atualiza o perfil instantâneo
  UPDATE public.profiles
  SET 
    online = (p_status = 'active' OR p_status = 'idle'),
    current_status = p_status,
    last_seen_at = now()
  WHERE id = p_user_id;

  -- Upsert atômico acumulativo no registro do dia
  INSERT INTO public.user_daily_activity (
    user_id, company_id, date,
    total_logged_seconds, total_active_seconds, total_idle_seconds, total_background_seconds,
    current_status, last_heartbeat_at, updated_at
  )
  VALUES (
    p_user_id, p_company_id, v_date,
    v_logged_add, v_active_add, v_idle_add, v_bg_add,
    p_status, now(), now()
  )
  ON CONFLICT (user_id, date) DO UPDATE SET
    total_logged_seconds = user_daily_activity.total_logged_seconds + EXCLUDED.total_logged_seconds,
    total_active_seconds = user_daily_activity.total_active_seconds + EXCLUDED.total_active_seconds,
    total_idle_seconds = user_daily_activity.total_idle_seconds + EXCLUDED.total_idle_seconds,
    total_background_seconds = user_daily_activity.total_background_seconds + EXCLUDED.total_background_seconds,
    current_status = EXCLUDED.current_status,
    last_heartbeat_at = now(),
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

