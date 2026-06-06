
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
