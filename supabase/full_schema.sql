-- Migration: 20260606162637_3f18bd18-8d5d-4b45-ab17-115a10eed68f.sql

-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin_company','manager','agent');
CREATE TYPE public.unit_role AS ENUM ('manager','agent');
CREATE TYPE public.channel_type AS ENUM ('whatsapp','instagram');
CREATE TYPE public.conversation_status AS ENUM ('waiting','active','resolved');
CREATE TYPE public.message_sender AS ENUM ('agent','contact','system');
CREATE TYPE public.media_type AS ENUM ('text','image','audio','video','document');
CREATE TYPE public.task_priority AS ENUM ('low','medium','high');
CREATE TYPE public.task_status AS ENUM ('pending','done');

-- ============ COMPANIES ============
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- ============ UNITS ============
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

-- ============ DEPARTMENTS ============
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  max_agents INT NOT NULL DEFAULT 10,
  sla_minutes INT NOT NULL DEFAULT 30,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES (users) ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  role public.app_role NOT NULL DEFAULT 'agent',
  active BOOLEAN NOT NULL DEFAULT true,
  online BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ↔ UNIT / DEPARTMENT ============
CREATE TABLE public.user_units (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  role public.unit_role NOT NULL DEFAULT 'agent',
  PRIMARY KEY (user_id, unit_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_units TO authenticated;
GRANT ALL ON public.user_units TO service_role;
ALTER TABLE public.user_units ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_departments (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, department_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_departments TO authenticated;
GRANT ALL ON public.user_departments TO service_role;
ALTER TABLE public.user_departments ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.app_role LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.user_in_unit(_unit UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_units WHERE user_id = auth.uid() AND unit_id = _unit)
      OR public.current_role() = 'admin_company'
$$;

-- ============ CONTACTS ============
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- ============ CONVERSATIONS ============
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  channel public.channel_type NOT NULL DEFAULT 'whatsapp',
  status public.conversation_status NOT NULL DEFAULT 'waiting',
  assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- ============ MESSAGES ============
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_type public.message_sender NOT NULL,
  sender_id UUID,
  content TEXT,
  media_type public.media_type NOT NULL DEFAULT 'text',
  media_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ============ PIPELINE & OPPORTUNITIES ============
CREATE TABLE public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  "order" INT NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#2563EB'
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_stages TO authenticated;
GRANT ALL ON public.pipeline_stages TO service_role;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  expected_close_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO authenticated;
GRANT ALL ON public.opportunities TO service_role;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

-- ============ TASKS ============
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  due_date TIMESTAMPTZ,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  status public.task_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- ============ RLS POLICIES (company-scoped, permissive for MVP) ============
-- Profiles: user sees profiles in own company
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR company_id = public.current_company_id());
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles admin manage" ON public.profiles FOR ALL TO authenticated
  USING (public.current_role() = 'admin_company' AND company_id = public.current_company_id())
  WITH CHECK (public.current_role() = 'admin_company' AND company_id = public.current_company_id());

-- Companies: read own
CREATE POLICY "companies read" ON public.companies FOR SELECT TO authenticated
  USING (id = public.current_company_id());
CREATE POLICY "companies admin manage" ON public.companies FOR ALL TO authenticated
  USING (id = public.current_company_id() AND public.current_role() = 'admin_company')
  WITH CHECK (id = public.current_company_id() AND public.current_role() = 'admin_company');

-- Units: read in company
CREATE POLICY "units read" ON public.units FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());
CREATE POLICY "units admin manage" ON public.units FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.current_role() = 'admin_company')
  WITH CHECK (company_id = public.current_company_id() AND public.current_role() = 'admin_company');

-- Departments
CREATE POLICY "departments read" ON public.departments FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.units u WHERE u.id = departments.unit_id AND u.company_id = public.current_company_id()));
CREATE POLICY "departments manage" ON public.departments FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.units u WHERE u.id = departments.unit_id AND u.company_id = public.current_company_id())
         AND public.current_role() IN ('admin_company','manager'))
  WITH CHECK (EXISTS(SELECT 1 FROM public.units u WHERE u.id = departments.unit_id AND u.company_id = public.current_company_id())
         AND public.current_role() IN ('admin_company','manager'));

-- user_units / user_departments
CREATE POLICY "user_units read" ON public.user_units FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = user_units.user_id AND p.company_id = public.current_company_id()));
CREATE POLICY "user_units admin manage" ON public.user_units FOR ALL TO authenticated
  USING (public.current_role() = 'admin_company')
  WITH CHECK (public.current_role() = 'admin_company');

CREATE POLICY "user_departments read" ON public.user_departments FOR SELECT TO authenticated
  USING (user_id = auth.uid()
         OR EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = user_departments.user_id AND p.company_id = public.current_company_id()));
CREATE POLICY "user_departments admin manage" ON public.user_departments FOR ALL TO authenticated
  USING (public.current_role() = 'admin_company')
  WITH CHECK (public.current_role() = 'admin_company');

-- Contacts
CREATE POLICY "contacts company" ON public.contacts FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());

-- Conversations
CREATE POLICY "conversations unit" ON public.conversations FOR ALL TO authenticated
  USING (public.user_in_unit(unit_id))
  WITH CHECK (public.user_in_unit(unit_id));

-- Messages: via conversation
CREATE POLICY "messages via conv" ON public.messages FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND public.user_in_unit(c.unit_id)))
  WITH CHECK (EXISTS(SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND public.user_in_unit(c.unit_id)));

-- Pipeline / Opportunities / Tasks
CREATE POLICY "pipeline unit" ON public.pipeline_stages FOR ALL TO authenticated
  USING (public.user_in_unit(unit_id)) WITH CHECK (public.user_in_unit(unit_id));
CREATE POLICY "opps unit" ON public.opportunities FOR ALL TO authenticated
  USING (public.user_in_unit(unit_id)) WITH CHECK (public.user_in_unit(unit_id));
CREATE POLICY "tasks unit" ON public.tasks FOR ALL TO authenticated
  USING (public.user_in_unit(unit_id)) WITH CHECK (public.user_in_unit(unit_id));

-- ============ TRIGGER: auto profile on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    'agent'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;


-- Migration: 20260606162739_1b2b4f47-f891-4d0a-afd1-209677b902f7.sql

REVOKE EXECUTE ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_in_unit(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- Migration: 20260606172000_add_evogo_instances.sql
-- ============ EVOGO CONFIG IN COMPANIES ============
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS evogo_host TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS evogo_global_token TEXT;

-- ============ WHATSAPP INSTANCES ============
CREATE TABLE public.whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- Nome amigável visual no sistema
  instance_name TEXT NOT NULL UNIQUE, -- Nome técnico no EvoGo slug(company)-[slug(unit)]-slug(name)
  evogo_api_key TEXT NOT NULL DEFAULT gen_random_uuid()::text, -- Token individual
  status TEXT NOT NULL DEFAULT 'disconnected',
  webhook_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_instances TO authenticated;
GRANT ALL ON public.whatsapp_instances TO service_role;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- ============ RLS FOR WHATSAPP INSTANCES ============
-- Read: User can see instances if they belong to their company
CREATE POLICY "whatsapp_instances read" ON public.whatsapp_instances FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

-- Manage (Insert, Update, Delete): Only admins or managers (company level) can manage instances
-- For simplicity in MVP, admins can manage everything in their company.
CREATE POLICY "whatsapp_instances manage" ON public.whatsapp_instances FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.current_role() = 'admin_company')
  WITH CHECK (company_id = public.current_company_id() AND public.current_role() = 'admin_company');


-- Migration: 20260606173600_fix_company_insert.sql
-- Permitir que usuários autenticados criem empresas
CREATE POLICY "companies insert" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);


-- Migration: 20260606174000_create_company_rpc.sql
CREATE OR REPLACE FUNCTION public.create_new_company(company_name TEXT, company_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- Bypasses RLS
SET search_path = public
AS $$
DECLARE
  new_company_id UUID;
BEGIN
  -- Insert the new company
  INSERT INTO public.companies (name, slug)
  VALUES (company_name, company_slug)
  RETURNING id INTO new_company_id;

  -- Update the user's profile to be admin of this company
  UPDATE public.profiles
  SET company_id = new_company_id, role = 'admin_company'
  WHERE id = auth.uid();

  RETURN new_company_id;
END;
$$;


-- Migration: 20260606174300_create_company_rpc_fixed.sql
CREATE OR REPLACE FUNCTION public.create_new_company(company_name TEXT, company_slug TEXT, user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- Bypasses RLS
SET search_path = public
AS $$
DECLARE
  new_company_id UUID;
BEGIN
  -- Insert the new company
  INSERT INTO public.companies (name, slug)
  VALUES (company_name, company_slug)
  RETURNING id INTO new_company_id;

  -- Update the user's profile to be admin of this company
  UPDATE public.profiles
  SET company_id = new_company_id, role = 'admin_company'
  WHERE id = user_id;

  RETURN new_company_id;
END;
$$;


-- Migration: 20260606193500_add_evogo_instance_id.sql
-- Adiciona a coluna para armazenar o ID gerado pela EvoGo na criação da instância
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS evogo_instance_id UUID;


-- Migration: 20260606203900_make_unit_id_optional.sql
-- ============ ALTERANDO UNIT_ID PARA OPCIONAL ============
-- Para permitir que a "Sede / Empresa Mãe" tenha seus próprios dados (onde unit_id = null)

-- 1. Contacts: Adiciona unit_id e define RLS
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE;

-- 2. Conversations: Torna unit_id opcional
ALTER TABLE public.conversations ALTER COLUMN unit_id DROP NOT NULL;

-- 3. Pipeline Stages: Torna unit_id opcional
ALTER TABLE public.pipeline_stages ALTER COLUMN unit_id DROP NOT NULL;

-- 4. Opportunities: Torna unit_id opcional
ALTER TABLE public.opportunities ALTER COLUMN unit_id DROP NOT NULL;

-- 5. Tasks: Torna unit_id opcional
ALTER TABLE public.tasks ALTER COLUMN unit_id DROP NOT NULL;

-- ============ ATUALIZANDO AS POLÍTICAS (RLS) ============

-- Para garantir que os dados sem unit_id sejam acessíveis caso o usuário pertença à empresa

-- Contacts
DROP POLICY IF EXISTS "contacts company" ON public.contacts;
CREATE POLICY "contacts company" ON public.contacts FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id() AND
    (unit_id IS NULL OR public.user_in_unit(unit_id))
  )
  WITH CHECK (
    company_id = public.current_company_id() AND
    (unit_id IS NULL OR public.user_in_unit(unit_id))
  );

-- Conversations
DROP POLICY IF EXISTS "conversations unit" ON public.conversations;
CREATE POLICY "conversations unit" ON public.conversations FOR ALL TO authenticated
  USING (unit_id IS NULL OR public.user_in_unit(unit_id))
  WITH CHECK (unit_id IS NULL OR public.user_in_unit(unit_id));

-- Pipeline Stages
DROP POLICY IF EXISTS "pipeline unit" ON public.pipeline_stages;
CREATE POLICY "pipeline unit" ON public.pipeline_stages FOR ALL TO authenticated
  USING (unit_id IS NULL OR public.user_in_unit(unit_id)) 
  WITH CHECK (unit_id IS NULL OR public.user_in_unit(unit_id));

-- Opportunities
DROP POLICY IF EXISTS "opps unit" ON public.opportunities;
CREATE POLICY "opps unit" ON public.opportunities FOR ALL TO authenticated
  USING (unit_id IS NULL OR public.user_in_unit(unit_id)) 
  WITH CHECK (unit_id IS NULL OR public.user_in_unit(unit_id));

-- Tasks
DROP POLICY IF EXISTS "tasks unit" ON public.tasks;
CREATE POLICY "tasks unit" ON public.tasks FOR ALL TO authenticated
  USING (unit_id IS NULL OR public.user_in_unit(unit_id)) 
  WITH CHECK (unit_id IS NULL OR public.user_in_unit(unit_id));

-- Messages
DROP POLICY IF EXISTS "messages via conv" ON public.messages;
CREATE POLICY "messages via conv" ON public.messages FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.unit_id IS NULL OR public.user_in_unit(c.unit_id))))
  WITH CHECK (EXISTS(SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.unit_id IS NULL OR public.user_in_unit(c.unit_id))));


-- Migration: 20260606210600_setup_departments_and_invites.sql
-- ============ DEPARTMENTS: ADICIONANDO COMPANY_ID E TORNANDO UNIT_ID OPCIONAL ============

-- 1. Adicionando company_id na tabela departments
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- 2. (Segurança) Se já houverem departamentos, vamos preencher o company_id com base no unit_id atual
UPDATE public.departments d
SET company_id = (SELECT company_id FROM public.units u WHERE u.id = d.unit_id)
WHERE d.company_id IS NULL AND d.unit_id IS NOT NULL;

-- 3. Torna o company_id NOT NULL para garantir a integridade
-- ALTER TABLE public.departments ALTER COLUMN company_id SET NOT NULL; 
-- (Vou deixar NULLABLE temporariamente caso dê erro por causa de dados sujos, 
-- mas a nível de app, garantiremos que sempre enviaremos o company_id)

-- 4. Torna o unit_id opcional (NULL = Departamento da Matriz)
ALTER TABLE public.departments ALTER COLUMN unit_id DROP NOT NULL;


-- ============ ATUALIZANDO AS POLÍTICAS (RLS) ============

DROP POLICY IF EXISTS "departments read" ON public.departments;
CREATE POLICY "departments read" ON public.departments FOR SELECT TO authenticated
  USING (
    company_id = public.current_company_id() 
    OR EXISTS(SELECT 1 FROM public.units u WHERE u.id = departments.unit_id AND u.company_id = public.current_company_id())
  );

DROP POLICY IF EXISTS "departments manage" ON public.departments;
CREATE POLICY "departments manage" ON public.departments FOR ALL TO authenticated
  USING (
    (company_id = public.current_company_id() OR EXISTS(SELECT 1 FROM public.units u WHERE u.id = departments.unit_id AND u.company_id = public.current_company_id()))
    AND public.current_role() IN ('admin_company','manager')
  )
  WITH CHECK (
    (company_id = public.current_company_id() OR EXISTS(SELECT 1 FROM public.units u WHERE u.id = departments.unit_id AND u.company_id = public.current_company_id()))
    AND public.current_role() IN ('admin_company','manager')
  );


-- ============ ATUALIZANDO A TRIGGER DE USUÁRIOS ============
-- Permitir que o usuário seja criado já atrelado a uma empresa via Link de Convite

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id UUID := NULL;
BEGIN
  -- Se o metadata conter company_id, pegamos ele (usado nos links de convite)
  IF (NEW.raw_user_meta_data->>'company_id') IS NOT NULL THEN
    v_company_id := (NEW.raw_user_meta_data->>'company_id')::UUID;
  END IF;

  INSERT INTO public.profiles (id, name, email, role, company_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    'agent',
    v_company_id
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;


-- Migration: 20260606215000_matriz_access.sql
-- Adicionar flag de acesso à matriz no perfil do usuário
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_matriz_access BOOLEAN NOT NULL DEFAULT false;

-- Criar função para facilitar as RLS
CREATE OR REPLACE FUNCTION public.has_matriz_access()
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT has_matriz_access FROM public.profiles WHERE id = auth.uid()
$$;

-- Atualizar RLS de conversas para proteger as conversas da matriz (onde unit_id IS NULL)
DROP POLICY IF EXISTS "conversations unit" ON public.conversations;
CREATE POLICY "conversations unit" ON public.conversations FOR ALL TO authenticated
  USING (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  )
  WITH CHECK (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  );

-- Atualizar pipeline stages (que foi mudado para unit_id NULLABLE no primeiro checkpoint)
DROP POLICY IF EXISTS "pipeline unit" ON public.pipeline_stages;
CREATE POLICY "pipeline unit" ON public.pipeline_stages FOR ALL TO authenticated
  USING (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  )
  WITH CHECK (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  );

-- Atualizar oportunidades
DROP POLICY IF EXISTS "opps unit" ON public.opportunities;
CREATE POLICY "opps unit" ON public.opportunities FOR ALL TO authenticated
  USING (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  )
  WITH CHECK (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  );

-- Atualizar tarefas
DROP POLICY IF EXISTS "tasks unit" ON public.tasks;
CREATE POLICY "tasks unit" ON public.tasks FOR ALL TO authenticated
  USING (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  )
  WITH CHECK (
    (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
    OR 
    (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
  );


-- Migration: 20260606215500_rpc_link_user.sql
CREATE OR REPLACE FUNCTION public.link_user_to_company(p_email TEXT, p_company_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID;
  v_admin_company UUID;
BEGIN
  -- 1. Verifica se quem está chamando é Admin da Sede
  SELECT company_id INTO v_admin_company 
  FROM public.profiles 
  WHERE id = auth.uid() AND role = 'admin_company';

  IF v_admin_company IS NULL OR v_admin_company != p_company_id THEN
    RAISE EXCEPTION 'Apenas administradores podem vincular usuários.';
  END IF;

  -- 2. Encontra o perfil pelo email
  SELECT id INTO v_user_id FROM public.profiles WHERE email = p_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado. Ele precisa criar a conta primeiro.';
  END IF;

  -- 3. Atualiza o perfil para pertencer à empresa
  UPDATE public.profiles
  SET company_id = p_company_id
  WHERE id = v_user_id AND (company_id IS NULL OR company_id = p_company_id);

  RETURN TRUE;
END;
$$;


-- Migration: 20260607214907_add_whatsapp_interaction_columns.sql
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS remote_msg_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS quoted_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS quoted_content TEXT,
ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;


-- Migration: 20260607235603_add_use_signature_to_profiles.sql
ALTER TABLE profiles ADD COLUMN use_signature BOOLEAN DEFAULT false;


-- Migration: 20260608002424_add_contact_labels.sql
CREATE TABLE IF NOT EXISTS labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  external_id TEXT,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_labels (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (contact_id, label_id)
);

-- RLS
ALTER TABLE labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage labels for their company" ON labels
  FOR ALL
  USING (company_id IN (
    SELECT company_id FROM profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can manage contact_labels for their company" ON contact_labels
  FOR ALL
  USING (contact_id IN (
    SELECT id FROM contacts WHERE company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  ));


-- Migration: 20260608160340_add_user_department.sql
-- Adicionar department_id em profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- Atualizar handle_new_user para lidar com department_id
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_company_id UUID := NULL;
  v_department_id UUID := NULL;
BEGIN
  -- company_id (usado nos links de convite ou criação manual)
  IF (NEW.raw_user_meta_data->>'company_id') IS NOT NULL THEN
    v_company_id := (NEW.raw_user_meta_data->>'company_id')::UUID;
  END IF;

  -- department_id (opcional no momento do cadastro)
  IF (NEW.raw_user_meta_data->>'department_id') IS NOT NULL THEN
    v_department_id := (NEW.raw_user_meta_data->>'department_id')::UUID;
  END IF;

  INSERT INTO public.profiles (id, name, email, role, company_id, department_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    'agent',
    v_company_id,
    v_department_id
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$;


-- Migration: 20260608171746_separate_departments_sede_unidade.sql
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;

-- Atualizar registros existentes para herdar company_id de suas respectivas unidades
UPDATE public.departments 
SET company_id = (SELECT company_id FROM public.units WHERE id = departments.unit_id) 
WHERE company_id IS NULL AND unit_id IS NOT NULL;

-- Tornar unit_id opcional (pois departamentos globais da Sede não terão unit_id)
ALTER TABLE public.departments ALTER COLUMN unit_id DROP NOT NULL;

-- Se desejar, tornar company_id NOT NULL após garantir que não há dados sem company_id.
-- Descomente se todos os departamentos agora tem company_id
-- ALTER TABLE public.departments ALTER COLUMN company_id SET NOT NULL;

-- Atualizar RLS
DROP POLICY IF EXISTS "departments read" ON public.departments;
DROP POLICY IF EXISTS "departments manage" ON public.departments;

CREATE POLICY "departments read" ON public.departments FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "departments manage" ON public.departments FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.current_role() IN ('admin_company','manager'))
  WITH CHECK (company_id = public.current_company_id() AND public.current_role() IN ('admin_company','manager'));


-- Migration: 20260608195750_update_matriz_access_rpc.sql
CREATE OR REPLACE FUNCTION set_user_matriz_access(p_user_id UUID, p_has_access BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify if the caller is an admin_company
  IF EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'admin_company'
  ) THEN
    -- Update the target user
    UPDATE profiles 
    SET has_matriz_access = p_has_access 
    WHERE id = p_user_id;
  ELSE
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem alterar este campo.';
  END IF;
END;
$$;


-- Migration: 20260608205000_add_contact_notes.sql
CREATE TABLE IF NOT EXISTS public.contact_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view notes of contacts in their company" ON public.contact_notes;
CREATE POLICY "Users can view notes of contacts in their company" ON public.contact_notes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = contact_notes.contact_id
    AND c.company_id = (SELECT company_id FROM public.profiles WHERE profiles.id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can insert notes for contacts in their company" ON public.contact_notes;
CREATE POLICY "Users can insert notes for contacts in their company" ON public.contact_notes FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = contact_notes.contact_id
    AND c.company_id = (SELECT company_id FROM public.profiles WHERE profiles.id = auth.uid())
  )
  AND auth.uid() = user_id
);


-- Migration: 20260609011045_add_task_type.sql
ALTER TABLE tasks ADD COLUMN task_type text DEFAULT 'other' NOT NULL;


-- Migration: 20260609105500_add_unit_colors.sql
-- Adiciona a coluna de cor à tabela de unidades
ALTER TABLE public.units ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#6366f1';


-- Migration: 20260609143500_add_unit_to_contacts.sql
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_unit_id ON public.contacts(unit_id);


-- Migration: 20260609143600_retrofill_contacts_unit.sql
UPDATE public.contacts c
SET unit_id = (
  SELECT unit_id
  FROM public.conversations conv
  WHERE conv.contact_id = c.id
  ORDER BY started_at DESC
  LIMIT 1
)
WHERE c.unit_id IS NULL;


-- Migration: 20260609144000_clear_conversations.sql
DELETE FROM public.messages;
DELETE FROM public.conversations;
DELETE FROM public.contact_labels;
DELETE FROM public.contacts;


-- Migration: 20260609153500_add_participant_jid.sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS participant_jid TEXT;


-- Migration: 20260609164000_create_quick_messages.sql
create table if not exists public.quick_messages (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  shortcut text not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.quick_messages enable row level security;

create policy "Users can view quick_messages of their company"
on public.quick_messages for select
using (
  company_id = (select company_id from public.profiles where id = auth.uid())
);

create policy "Users can insert quick_messages to their company"
on public.quick_messages for insert
with check (
  company_id = (select company_id from public.profiles where id = auth.uid())
);

create policy "Users can update quick_messages of their company"
on public.quick_messages for update
using (
  company_id = (select company_id from public.profiles where id = auth.uid())
);

create policy "Users can delete quick_messages of their company"
on public.quick_messages for delete
using (
  company_id = (select company_id from public.profiles where id = auth.uid())
);


-- Migration: 20260609165500_fix_update_user_rpc.sql
CREATE OR REPLACE FUNCTION public.update_user_profile_admin(
  p_user_id UUID,
  p_role TEXT DEFAULT NULL,
  p_has_matriz_access BOOLEAN DEFAULT NULL,
  p_company_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Atualizar os dados usando cast explícito de string para o enum app_role
  UPDATE profiles
  SET 
    role = COALESCE(p_role::app_role, role),
    has_matriz_access = COALESCE(p_has_matriz_access, has_matriz_access),
    company_id = COALESCE(p_company_id, company_id)
  WHERE id = p_user_id;
END;
$$;


-- Migration: 20260609200000_add_resolution_reasons.sql
-- ============ RESOLUTION REASONS ============
-- Table to store predefined reasons for closing a conversation
CREATE TABLE public.resolution_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  "order" INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resolution_reasons TO authenticated;
GRANT ALL ON public.resolution_reasons TO service_role;
ALTER TABLE public.resolution_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resolution_reasons company" ON public.resolution_reasons FOR ALL TO authenticated
  USING (company_id = public.current_company_id() OR company_id IS NULL)
  WITH CHECK (company_id = public.current_company_id());

-- Insert default reasons (no company_id = global defaults for all companies)
-- These will be seeded as company-specific when the company first uses the feature.
-- For now we use a trigger or the app will insert them.

-- ============ ADD RESOLUTION FIELDS TO CONVERSATIONS ============
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS resolution_reason_id UUID REFERENCES public.resolution_reasons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_observation TEXT;


-- Migration: 20260610000000_add_conversation_sessions.sql
-- Create conversation_sessions table to track attendance history
-- Each time a conversation is resolved, a session record is created
CREATE TABLE IF NOT EXISTS conversation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  whatsapp_instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_agent_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  resolution_reason_id UUID REFERENCES resolution_reasons(id) ON DELETE SET NULL,
  resolution_observation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by contact
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_contact_id ON conversation_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversation_sessions_conversation_id ON conversation_sessions(conversation_id);

-- Enable RLS
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;

-- RLS policies matching conversations table
CREATE POLICY "Users can view conversation sessions for their company"
  ON conversation_sessions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      JOIN companies co ON c.company_id = co.id
      JOIN profiles p ON p.company_id = co.id
      WHERE c.id = conversation_sessions.contact_id
        AND p.id = auth.uid()
    )
  );

CREATE POLICY "Users can insert conversation sessions"
  ON conversation_sessions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts c
      JOIN companies co ON c.company_id = co.id
      JOIN profiles p ON p.company_id = co.id
      WHERE c.id = conversation_sessions.contact_id
        AND p.id = auth.uid()
    )
  );


-- Migration: 20260612101629_add_owner_jid_to_instances.sql
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS owner_jid TEXT;


-- Migration: 20260612124000_update_crm_visibility.sql
-- Update user_in_unit to grant access if user has matriz access
CREATE OR REPLACE FUNCTION public.user_in_unit(_unit UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_units WHERE user_id = auth.uid() AND unit_id = _unit)
      OR public.current_role() = 'admin_company'
      OR public.has_matriz_access()
$$;

-- Update contacts RLS to respect unit_id and matriz access
DROP POLICY IF EXISTS "contacts company" ON public.contacts;

CREATE POLICY "contacts unit" ON public.contacts FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id() AND (
      (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
      OR 
      (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
    )
  )
  WITH CHECK (
    company_id = public.current_company_id() AND (
      (unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
      OR 
      (unit_id IS NOT NULL AND public.user_in_unit(unit_id))
    )
  );


-- Migration: 20260612161755_add_opportunity_notes.sql
CREATE TABLE IF NOT EXISTS public.opportunity_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE public.opportunity_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opportunity notes select" ON public.opportunity_notes;
CREATE POLICY "opportunity notes select" ON public.opportunity_notes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = opportunity_notes.opportunity_id
    AND (
      (o.unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
      OR 
      (o.unit_id IS NOT NULL AND public.user_in_unit(o.unit_id))
    )
  )
);

DROP POLICY IF EXISTS "opportunity notes insert" ON public.opportunity_notes;
CREATE POLICY "opportunity notes insert" ON public.opportunity_notes FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.opportunities o
    WHERE o.id = opportunity_notes.opportunity_id
    AND (
      (o.unit_id IS NULL AND (public.current_role() = 'admin_company' OR public.has_matriz_access()))
      OR 
      (o.unit_id IS NOT NULL AND public.user_in_unit(o.unit_id))
    )
  )
  AND auth.uid() = user_id
);

DROP POLICY IF EXISTS "opportunity notes update" ON public.opportunity_notes;
CREATE POLICY "opportunity notes update" ON public.opportunity_notes FOR UPDATE USING (
  auth.uid() = user_id
) WITH CHECK (
  auth.uid() = user_id
);

DROP POLICY IF EXISTS "opportunity notes delete" ON public.opportunity_notes;
CREATE POLICY "opportunity notes delete" ON public.opportunity_notes FOR DELETE USING (
  auth.uid() = user_id
);


-- Migration: 20260612200242_add_messages_metadata.sql
-- Adicionar coluna metadata para guardar informações como anúncios de WhatsApp (externalAdReply)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;


-- Migration: 20260612210000_add_transcription_fields.sql
-- Add AI settings to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS transcription_provider TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS transcription_api_key TEXT;

-- Add transcription field to messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS transcription TEXT;


-- Migration: 20260612211000_add_ai_settings.sql
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS ai_settings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.companies DROP COLUMN IF EXISTS transcription_provider;
ALTER TABLE public.companies DROP COLUMN IF EXISTS transcription_api_key;


-- Migration: 20260612215945_add_media_to_quick_messages.sql
alter table public.quick_messages
add column if not exists media_url text,
add column if not exists media_type text;


-- Migration: 20260612232922_add_quick_message_folders.sql
create table if not exists public.quick_message_folders (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS
alter table public.quick_message_folders enable row level security;

DROP POLICY IF EXISTS "Users can view quick_message_folders of their company" ON public.quick_message_folders;
create policy "Users can view quick_message_folders of their company"
on public.quick_message_folders for select
using (
  company_id = (select company_id from public.profiles where id = auth.uid())
);


DROP POLICY IF EXISTS "Users can insert quick_message_folders to their company" ON public.quick_message_folders;
create policy "Users can insert quick_message_folders to their company"
on public.quick_message_folders for insert
with check (
  company_id = (select company_id from public.profiles where id = auth.uid())
);


DROP POLICY IF EXISTS "Users can update quick_message_folders of their company" ON public.quick_message_folders;
create policy "Users can update quick_message_folders of their company"
on public.quick_message_folders for update
using (
  company_id = (select company_id from public.profiles where id = auth.uid())
);


DROP POLICY IF EXISTS "Users can delete quick_message_folders of their company" ON public.quick_message_folders;
create policy "Users can delete quick_message_folders of their company"
on public.quick_message_folders for delete
using (
  company_id = (select company_id from public.profiles where id = auth.uid())
);


-- Alter quick_messages table
alter table public.quick_messages
add column if not exists name text default '',
add column if not exists folder_id uuid references public.quick_message_folders(id) on delete set null;


-- Migration: 20260613000000_refactor_ticket_sessions.sql
-- 1. Alter conversation_sessions to allow NULL resolved_at
ALTER TABLE conversation_sessions ALTER COLUMN resolved_at DROP NOT NULL;
ALTER TABLE conversation_sessions ALTER COLUMN resolved_at DROP DEFAULT;

-- 2. Add current_session_id to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS current_session_id UUID REFERENCES conversation_sessions(id) ON DELETE SET NULL;

-- 3. Create session_events table
CREATE TABLE IF NOT EXISTS session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'started', 'assigned', 'transferred', 'resolved', 'note_added', 'task_created', 'returned_to_queue'
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_session_events_session_id ON session_events(session_id);

-- Enable RLS
ALTER TABLE session_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for session_events
DROP POLICY IF EXISTS "Users can view session_events for their company" ON session_events;
CREATE POLICY "Users can view session_events for their company"
  ON session_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversation_sessions cs
      JOIN contacts c ON cs.contact_id = c.id
      JOIN profiles p ON p.company_id = c.company_id
      WHERE cs.id = session_events.session_id
        AND p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert session_events" ON session_events;
CREATE POLICY "Users can insert session_events"
  ON session_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversation_sessions cs
      JOIN contacts c ON cs.contact_id = c.id
      JOIN profiles p ON p.company_id = c.company_id
      WHERE cs.id = session_events.session_id
        AND p.id = auth.uid()
    )
  );


-- Migration: 20260613080000_add_contact_creation_metadata.sql
-- Adiciona campos de rastreamento de criação de contato
ALTER TABLE public.contacts
ADD COLUMN created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN source TEXT,
ADD COLUMN source_details TEXT;


-- Migration: 20260613090000_fix_contacts_rls.sql
-- Fix contacts RLS so agents can see contacts with no unit (null unit_id)
-- This is necessary so agents can see incoming WhatsApp contacts before they are assigned to a unit.

DROP POLICY IF EXISTS "contacts unit" ON public.contacts;

CREATE POLICY "contacts unit" ON public.contacts FOR ALL TO authenticated
  USING (
    company_id = public.current_company_id() AND (
      unit_id IS NULL 
      OR 
      public.user_in_unit(unit_id)
    )
  )
  WITH CHECK (
    company_id = public.current_company_id() AND (
      unit_id IS NULL 
      OR 
      public.user_in_unit(unit_id)
    )
  );


-- Migration: 20260613142000_create_ai_agents.sql
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ai_type TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_personality TEXT,
  prompt_instructions TEXT,
  prompt_extra_info TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agents TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_agents read" ON public.ai_agents;
CREATE POLICY "ai_agents read" ON public.ai_agents FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

DROP POLICY IF EXISTS "ai_agents manage" ON public.ai_agents;
CREATE POLICY "ai_agents manage" ON public.ai_agents FOR ALL TO authenticated
  USING (company_id = public.current_company_id())
  WITH CHECK (company_id = public.current_company_id());


-- Migration: 20260613143200_add_ai_conversation_control.sql
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS active_by_default BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_agent_id UUID REFERENCES public.ai_agents(id) ON DELETE SET NULL;


-- Migration: 20260613151400_add_provider_to_ai_agents.sql
ALTER TABLE public.ai_agents ADD COLUMN provider TEXT NOT NULL DEFAULT 'openai';


-- Migration: 20260613162500_add_ai_unit_and_handoff.sql
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS allow_handoff BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS handoff_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;


-- Migration: 20260613170500_add_internal_notes_and_ai_resolution.sql
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS allow_resolution BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS resolution_reason_id UUID REFERENCES public.resolution_reasons(id) ON DELETE SET NULL;


-- Migration: 20260613181000_add_session_update_policy.sql
CREATE POLICY "Users can update conversation sessions"
  ON conversation_sessions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      JOIN companies co ON c.company_id = co.id
      JOIN profiles p ON p.company_id = co.id
      WHERE c.id = conversation_sessions.contact_id
        AND p.id = auth.uid()
    )
  );


-- Migration: 20260613224200_add_max_tokens_to_ai_agents.sql
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS max_tokens INT NOT NULL DEFAULT 4096;


-- Migration: 20260613230200_add_dynamic_prompts_to_ai_agents.sql
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS prompt_handoff TEXT;
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS prompt_resolution TEXT;


-- Migration: 20260614170000_add_main_agent_flag.sql
ALTER TABLE public.ai_agents ADD COLUMN IF NOT EXISTS is_main_agent BOOLEAN NOT NULL DEFAULT false;


-- Migration: 20260615193000_set_use_signature_true_by_default.sql
-- Set the default value for new profiles
ALTER TABLE profiles ALTER COLUMN use_signature SET DEFAULT true;

-- Update existing profiles to have use_signature = true if they are currently false or null
UPDATE profiles SET use_signature = true WHERE use_signature IS NULL OR use_signature = false;


-- Migration: 20260616120000_create_ad_leads.sql
-- Create ad_leads table
CREATE TABLE IF NOT EXISTS public.ad_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    ad_title TEXT,
    ad_body TEXT,
    source_url TEXT,
    thumbnail_url TEXT,
    source_id TEXT,
    ctwa_clid TEXT,
    conversion_source TEXT,
    conversion_data TEXT,
    ctwa_payload TEXT,
    source_app TEXT,
    media_type INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS ad_leads_company_id_idx ON public.ad_leads(company_id);
CREATE INDEX IF NOT EXISTS ad_leads_contact_id_idx ON public.ad_leads(contact_id);

-- Enable RLS
ALTER TABLE public.ad_leads ENABLE ROW LEVEL SECURITY;

-- Create Policy
CREATE POLICY "Enable read access for all authenticated users" ON public.ad_leads
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authenticated users" ON public.ad_leads
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users" ON public.ad_leads
    FOR UPDATE
    USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users" ON public.ad_leads
    FOR DELETE
    USING (auth.role() = 'authenticated');


-- Migration: 20260616130000_add_followup_count.sql
-- Add ai_followup_count to conversations
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS ai_followup_count INT DEFAULT 0;


-- Migration: 20260616140000_add_ai_agent_followup_settings.sql
-- Add follow-up settings to ai_agents
ALTER TABLE public.ai_agents 
  ADD COLUMN IF NOT EXISTS allow_followup BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_interval_minutes INT DEFAULT 15,
  ADD COLUMN IF NOT EXISTS followup_max_attempts INT DEFAULT 2,
  ADD COLUMN IF NOT EXISTS prompt_followup TEXT;


-- Migration: 20260616150000_add_followup_resolution_reason.sql
-- Add a separate resolution reason for follow-up inactivity closures
ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS followup_resolution_reason_id uuid REFERENCES resolution_reasons(id) ON DELETE SET NULL;

COMMENT ON COLUMN ai_agents.followup_resolution_reason_id IS 
  'Motivo de encerramento usado quando a conversa é encerrada por inatividade do cliente (follow-up exausto). Separado do resolution_reason_id que é usado no encerramento bem-sucedido.';


-- Migration: 20260616170000_add_ai_last_followup_at.sql
-- Track when the last follow-up was sent per conversation
-- Used by the cron to enforce the configured interval between each follow-up attempt
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS ai_last_followup_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN conversations.ai_last_followup_at IS
  'Timestamp do último follow-up automático enviado pela IA. Usado pelo cron para garantir o intervalo configurado entre tentativas.';


-- Migration: 20260616183100_add_wavoip_token_to_instances.sql
-- Migration to add wavoip_token to whatsapp_instances table

ALTER TABLE public.whatsapp_instances
ADD COLUMN IF NOT EXISTS wavoip_token TEXT;


-- Migration: 20260617204205_create_call_logs.sql
CREATE TYPE public.call_direction AS ENUM ('INCOMING', 'OUTGOING');
CREATE TYPE public.call_status_type AS ENUM ('RINGING', 'CALLING', 'NOT_ANSWERED', 'ACTIVE', 'ENDED', 'REJECTED', 'FAILED', 'DISCONNECTED');

CREATE TABLE IF NOT EXISTS public.call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wavoip_call_id TEXT NOT NULL UNIQUE,
    whatsapp_instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    assigned_agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    direction public.call_direction NOT NULL,
    status public.call_status_type NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    recording_url TEXT,
    peer_number TEXT
);

-- RLS
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view call_logs in their company" ON public.call_logs
    FOR SELECT USING (company_id = public.current_company_id());

CREATE POLICY "Users can insert call_logs in their company" ON public.call_logs
    FOR INSERT WITH CHECK (company_id = public.current_company_id());

CREATE POLICY "Users can update call_logs in their company" ON public.call_logs
    FOR UPDATE USING (company_id = public.current_company_id());


-- Migration: 20260618003000_add_transcription_to_call_logs.sql
-- Adiciona campo de transcrição à tabela call_logs
-- A transcrição é gerada automaticamente via Whisper quando a gravação da Wavoip chega via webhook
-- e pode ser feita manualmente pelo agente na tela de Histórico de Chamadas

ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS transcription TEXT DEFAULT NULL;

COMMENT ON COLUMN call_logs.transcription IS 'Transcrição automática da gravação da ligação via Whisper (OpenAI/Groq/OpenRouter)';


-- Migration: 20260618120000_sync_call_logs_to_messages.sql
-- Criar função para sincronizar call_logs com mensagens no chat com auto-resolução de contatos e instâncias e casting de enums
CREATE OR REPLACE FUNCTION public.handle_call_log_message_sync()
RETURNS TRIGGER AS $$
DECLARE
    v_conversation_id UUID;
    v_message_exists BOOLEAN;
    v_content TEXT;
    v_metadata JSONB;
    v_sender_type TEXT;
    v_status_final BOOLEAN;
    v_calc_duration INTEGER;
    v_phone_suffix TEXT;
BEGIN
    -- 1. Resolver contact_id caso esteja nulo, buscando pelo peer_number (sufixo de 8 dígitos)
    IF NEW.contact_id IS NULL AND NEW.peer_number IS NOT NULL THEN
        v_phone_suffix := right(regexp_replace(NEW.peer_number, '\D', '', 'g'), 8);
        IF v_phone_suffix IS NOT NULL AND v_phone_suffix <> '' THEN
            SELECT id INTO NEW.contact_id FROM public.contacts
            WHERE company_id = NEW.company_id
              AND regexp_replace(phone, '\D', '', 'g') LIKE '%' || v_phone_suffix
            LIMIT 1;
        END IF;
    END IF;

    -- 2. Resolver whatsapp_instance_id caso esteja nulo, buscando uma instância conectada da empresa
    IF NEW.whatsapp_instance_id IS NULL THEN
        SELECT id INTO NEW.whatsapp_instance_id FROM public.whatsapp_instances
        WHERE company_id = NEW.company_id
        ORDER BY status = 'connected' DESC, created_at ASC
        LIMIT 1;
    END IF;

    -- Determina se o status é final para criar a mensagem
    v_status_final := NEW.status IN ('ENDED', 'NOT_ANSWERED', 'REJECTED', 'FAILED', 'DISCONNECTED');
    
    IF NOT v_status_final THEN
        RETURN NEW;
    END IF;

    -- Calcula a duração se houver datas de início e fim
    v_calc_duration := COALESCE(
        NEW.duration_seconds, 
        CASE 
            WHEN NEW.ended_at IS NOT NULL AND NEW.started_at IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at))::INTEGER 
            ELSE NULL 
        END
    );

    -- Verifica se já existe mensagem para esta chamada
    SELECT EXISTS (
        SELECT 1 FROM public.messages 
        WHERE metadata->>'wavoip_call_id' = NEW.wavoip_call_id
    ) INTO v_message_exists;

    IF v_message_exists THEN
        -- Se já existir a mensagem, atualiza a duração se ela foi alterada ou calculada
        IF NEW.status = 'ENDED' AND v_calc_duration IS NOT NULL THEN
            UPDATE public.messages
            SET metadata = jsonb_set(metadata::jsonb, '{duration}', to_jsonb(v_calc_duration))
            WHERE metadata->>'wavoip_call_id' = NEW.wavoip_call_id;
        END IF;
        RETURN NEW;
    END IF;

    -- Busca a conversa mais recente para o contato e instância da chamada
    IF NEW.contact_id IS NOT NULL AND NEW.whatsapp_instance_id IS NOT NULL THEN
        SELECT id FROM public.conversations
        WHERE contact_id = NEW.contact_id 
          AND whatsapp_instance_id = NEW.whatsapp_instance_id
        ORDER BY last_message_at DESC
        LIMIT 1
        INTO v_conversation_id;

        -- Se não encontrar conversa, cria uma
        IF v_conversation_id IS NULL THEN
            INSERT INTO public.conversations (
                company_id,
                whatsapp_instance_id,
                contact_id,
                channel,
                status,
                last_message_at
            ) VALUES (
                NEW.company_id,
                NEW.whatsapp_instance_id,
                NEW.contact_id,
                'whatsapp',
                'waiting',
                now()
            ) RETURNING id INTO v_conversation_id;
        END IF;
    END IF;

    -- Se ainda assim for nulo, aborta
    IF v_conversation_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Define o remetente e conteúdo
    IF NEW.direction = 'INCOMING' THEN
        v_sender_type := 'contact';
        IF NEW.status = 'ENDED' THEN
            v_content := 'Ligação de voz';
            v_metadata := json_build_object(
                'type', 'call',
                'direction', 'incoming',
                'status', 'completed',
                'wavoip_call_id', NEW.wavoip_call_id,
                'duration', v_calc_duration
            );
        ELSE
            v_content := 'Ligação de voz perdida';
            v_metadata := json_build_object(
                'type', 'call',
                'direction', 'incoming',
                'status', 'missed',
                'wavoip_call_id', NEW.wavoip_call_id
            );
        END IF;
    ELSE
        v_sender_type := 'agent';
        IF NEW.status = 'ENDED' THEN
            v_content := 'Ligação de voz';
            v_metadata := json_build_object(
                'type', 'call',
                'direction', 'outgoing',
                'status', 'completed',
                'wavoip_call_id', NEW.wavoip_call_id,
                'duration', v_calc_duration
            );
        ELSE
            v_content := 'Ligação de voz não atendida';
            v_metadata := json_build_object(
                'type', 'call',
                'direction', 'outgoing',
                'status', 'missed',
                'wavoip_call_id', NEW.wavoip_call_id
            );
        END IF;
    END IF;

    -- Insere a mensagem com cast explícito para os Enums message_sender e media_type
    INSERT INTO public.messages (
        conversation_id,
        sender_type,
        is_internal,
        media_type,
        content,
        metadata,
        created_at
    ) VALUES (
        v_conversation_id,
        v_sender_type::public.message_sender,
        FALSE,
        'text'::public.media_type,
        v_content,
        v_metadata,
        COALESCE(NEW.ended_at, NEW.started_at, now())
    );

    -- Atualiza o last_message_at da conversa
    UPDATE public.conversations
    SET last_message_at = now()
    WHERE id = v_conversation_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar a trigger
DROP TRIGGER IF EXISTS trigger_sync_call_log_to_messages ON public.call_logs;
CREATE TRIGGER trigger_sync_call_log_to_messages
BEFORE INSERT OR UPDATE ON public.call_logs
FOR EACH ROW
EXECUTE FUNCTION public.handle_call_log_message_sync();


-- Migration: 20260618214123_add_whatsapp_providers.sql
-- Add provider columns to whatsapp_instances
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'evogo';
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS oficial_phone_number_id VARCHAR(255);
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS oficial_access_token TEXT;
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS oficial_verify_token VARCHAR(255);

-- Se já existirem registros sem provider definido, defina como evogo (o default cobrirá, mas previne nulos se já estava inserido)
UPDATE public.whatsapp_instances SET provider = 'evogo' WHERE provider IS NULL;

-- Constraint para limitar provedores válidos
ALTER TABLE public.whatsapp_instances ADD CONSTRAINT valid_provider CHECK (provider IN ('evogo', 'oficial', 'stevo'));



-- Migration: 20260619143537_add_whatsapp_templates.sql
-- Add WABA ID to whatsapp_instances
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS oficial_waba_id VARCHAR(255);

-- Create whatsapp_templates table
CREATE TABLE public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  whatsapp_instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  status TEXT NOT NULL,
  category TEXT NOT NULL,
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(whatsapp_instance_id, name, language)
);

-- Setup permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Setup RLS
CREATE POLICY "whatsapp_templates read" ON public.whatsapp_templates FOR SELECT TO authenticated
  USING (company_id = public.current_company_id());

CREATE POLICY "whatsapp_templates manage" ON public.whatsapp_templates FOR ALL TO authenticated
  USING (company_id = public.current_company_id() AND public.current_role() = 'admin_company')
  WITH CHECK (company_id = public.current_company_id() AND public.current_role() = 'admin_company');


-- Migration: 20260619220800_add_instagram_provider.sql
ALTER TABLE whatsapp_instances DROP CONSTRAINT IF EXISTS valid_provider; ALTER TABLE whatsapp_instances ADD CONSTRAINT valid_provider CHECK (provider::text = ANY (ARRAY['evogo'::character varying, 'oficial'::character varying, 'stevo'::character varying, 'instagram'::character varying]::text[]));


-- Migration: 20260619230000_add_profile_picture_url.sql
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;


-- Migration: 20260619233000_add_messenger_provider.sql
ALTER TABLE whatsapp_instances DROP CONSTRAINT IF EXISTS valid_provider;
ALTER TABLE whatsapp_instances ADD CONSTRAINT valid_provider CHECK (provider::text = ANY (ARRAY['evogo'::character varying, 'oficial'::character varying, 'stevo'::character varying, 'instagram'::character varying, 'messenger'::character varying]::text[]));


-- Migration: 20260620085446_add_meta_system_token.sql
ALTER TABLE public.companies ADD COLUMN meta_system_user_token TEXT;


-- Migration: 20260620104000_add_omnichannel_identity.sql
-- Migration to support Omnichannel Contact Merging

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS instagram_username TEXT;

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS remote_id TEXT;

-- Data migration: set remote_id for existing conversations
UPDATE public.conversations c
SET remote_id = (SELECT whatsapp_lid FROM public.contacts WHERE id = c.contact_id)
WHERE c.remote_id IS NULL;

-- Create an RPC to safely merge contacts
CREATE OR REPLACE FUNCTION merge_contacts(source_id UUID, target_id UUID)
RETURNS void AS $$
BEGIN
  -- Move all conversations from source to target
  UPDATE public.conversations
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Move all messages from source to target
  UPDATE public.messages
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Update target with source's instagram_username if target doesn't have one
  UPDATE public.contacts
  SET instagram_username = COALESCE(public.contacts.instagram_username, (SELECT instagram_username FROM public.contacts WHERE id = source_id))
  WHERE id = target_id;

  -- Mark source as merged into target
  UPDATE public.contacts
  SET merged_into_id = target_id
  WHERE id = source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Migration: 20260620160000_add_instagram_id.sql
-- Migration to add instagram_id to contacts

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS instagram_id TEXT;

-- Update the merge_contacts RPC to also handle instagram_id
CREATE OR REPLACE FUNCTION merge_contacts(source_id UUID, target_id UUID)
RETURNS void AS $$
BEGIN
  -- Move all conversations from source to target
  UPDATE public.conversations
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Move all messages from source to target
  UPDATE public.messages
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Update target with source's instagram_username if target doesn't have one
  UPDATE public.contacts
  SET instagram_username = COALESCE(public.contacts.instagram_username, (SELECT instagram_username FROM public.contacts WHERE id = source_id))
  WHERE id = target_id;

  -- Update target with source's instagram_id if target doesn't have one
  UPDATE public.contacts
  SET instagram_id = COALESCE(public.contacts.instagram_id, (SELECT instagram_id FROM public.contacts WHERE id = source_id))
  WHERE id = target_id;

  -- Update target with source's whatsapp_lid if target doesn't have one
  UPDATE public.contacts
  SET whatsapp_lid = COALESCE(public.contacts.whatsapp_lid, (SELECT whatsapp_lid FROM public.contacts WHERE id = source_id))
  WHERE id = target_id;

  -- Update target with source's phone if target doesn't have one
  UPDATE public.contacts
  SET phone = COALESCE(public.contacts.phone, (SELECT phone FROM public.contacts WHERE id = source_id))
  WHERE id = target_id;

  -- Mark source as merged into target
  UPDATE public.contacts
  SET merged_into_id = target_id
  WHERE id = source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

