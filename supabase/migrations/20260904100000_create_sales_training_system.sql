-- Migration: Create sales training system (Objection Insights, Training Sessions, Training Messages)

-- 1. Table: sales_objection_insights (Objeções mineradas das conversas reais)
CREATE TABLE IF NOT EXISTS public.sales_objection_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL DEFAULT 'week', -- 'week', 'month', 'custom'
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  objections_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_analyzed_conversations INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_objection_insights_company ON public.sales_objection_insights(company_id, created_at DESC);

ALTER TABLE public.sales_objection_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view objection insights for their company" ON public.sales_objection_insights;
CREATE POLICY "Users can view objection insights for their company" ON public.sales_objection_insights
  FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "Users can manage objection insights for their company" ON public.sales_objection_insights;
CREATE POLICY "Users can manage objection insights for their company" ON public.sales_objection_insights
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

GRANT ALL ON public.sales_objection_insights TO authenticated;
GRANT ALL ON public.sales_objection_insights TO service_role;


-- 2. Table: sales_training_sessions (Sessões de simulação e treino de vendas)
CREATE TABLE IF NOT EXISTS public.sales_training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_name TEXT NOT NULL,
  lead_channel TEXT NOT NULL DEFAULT 'whatsapp',
  hidden_scenario TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'abandoned'
  scorecard_json JSONB DEFAULT '{}'::jsonb,
  overall_score NUMERIC(4,2),
  outcome TEXT DEFAULT 'in_progress', -- 'won', 'lost', 'in_progress'
  feedback_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_training_sessions_user ON public.sales_training_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_sessions_company ON public.sales_training_sessions(company_id, created_at DESC);

ALTER TABLE public.sales_training_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view and manage training sessions for their company" ON public.sales_training_sessions;
CREATE POLICY "Users can view and manage training sessions for their company" ON public.sales_training_sessions
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM public.profiles WHERE id = auth.uid()
  ));

GRANT ALL ON public.sales_training_sessions TO authenticated;
GRANT ALL ON public.sales_training_sessions TO service_role;


-- 3. Table: sales_training_messages (Mensagens trocadas no treino)
CREATE TABLE IF NOT EXISTS public.sales_training_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sales_training_sessions(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL, -- 'lead', 'trainee', 'coach_whisper'
  content TEXT NOT NULL,
  critique_note TEXT,
  suggested_alternative TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_messages_session ON public.sales_training_messages(session_id, created_at ASC);

ALTER TABLE public.sales_training_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view and manage training messages for their company sessions" ON public.sales_training_messages;
CREATE POLICY "Users can view and manage training messages for their company sessions" ON public.sales_training_messages
  FOR ALL
  USING (session_id IN (
    SELECT id FROM public.sales_training_sessions WHERE company_id IN (
      SELECT company_id FROM public.profiles WHERE id = auth.uid()
    )
  ));

GRANT ALL ON public.sales_training_messages TO authenticated;
GRANT ALL ON public.sales_training_messages TO service_role;
