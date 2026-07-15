--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.5 (Debian 17.5-1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

DROP POLICY IF EXISTS "whatsapp_templates read" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "whatsapp_templates manage" ON public.whatsapp_templates;
DROP POLICY IF EXISTS "whatsapp_instances read" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "whatsapp_instances manage" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "user_units read" ON public.user_units;
DROP POLICY IF EXISTS "user_units admin manage" ON public.user_units;
DROP POLICY IF EXISTS "user_departments read" ON public.user_departments;
DROP POLICY IF EXISTS "user_departments admin manage" ON public.user_departments;
DROP POLICY IF EXISTS "units read" ON public.units;
DROP POLICY IF EXISTS "units admin manage" ON public.units;
DROP POLICY IF EXISTS "tasks unit" ON public.tasks;
DROP POLICY IF EXISTS "resolution_reasons read" ON public.resolution_reasons;
DROP POLICY IF EXISTS "resolution_reasons manage" ON public.resolution_reasons;
DROP POLICY IF EXISTS "resolution_reasons company" ON public.resolution_reasons;
DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
DROP POLICY IF EXISTS "profiles self read" ON public.profiles;
DROP POLICY IF EXISTS "profiles admin manage" ON public.profiles;
DROP POLICY IF EXISTS "pipelines read" ON public.pipelines;
DROP POLICY IF EXISTS "pipelines manage" ON public.pipelines;
DROP POLICY IF EXISTS "pipeline_stages read" ON public.pipeline_stages;
DROP POLICY IF EXISTS "pipeline_stages manage" ON public.pipeline_stages;
DROP POLICY IF EXISTS "pipeline unit" ON public.pipeline_stages;
DROP POLICY IF EXISTS "opps unit" ON public.opportunities;
DROP POLICY IF EXISTS "opportunity notes update" ON public.opportunity_notes;
DROP POLICY IF EXISTS "opportunity notes select" ON public.opportunity_notes;
DROP POLICY IF EXISTS "opportunity notes insert" ON public.opportunity_notes;
DROP POLICY IF EXISTS "opportunity notes delete" ON public.opportunity_notes;
DROP POLICY IF EXISTS "messages via conv" ON public.messages;
DROP POLICY IF EXISTS "labels read" ON public.labels;
DROP POLICY IF EXISTS "labels manage" ON public.labels;
DROP POLICY IF EXISTS "departments read" ON public.departments;
DROP POLICY IF EXISTS "departments manage" ON public.departments;
DROP POLICY IF EXISTS "conversations unit" ON public.conversations;
DROP POLICY IF EXISTS "contacts unit" ON public.contacts;
DROP POLICY IF EXISTS "companies read" ON public.companies;
DROP POLICY IF EXISTS "companies insert" ON public.companies;
DROP POLICY IF EXISTS "companies admin manage" ON public.companies;
DROP POLICY IF EXISTS "ai_agents read" ON public.ai_agents;
DROP POLICY IF EXISTS "ai_agents manage" ON public.ai_agents;
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view session_events for their company" ON public.session_events;
DROP POLICY IF EXISTS "Users can view quick_messages of their company" ON public.quick_messages;
DROP POLICY IF EXISTS "Users can view quick_message_folders of their company" ON public.quick_message_folders;
DROP POLICY IF EXISTS "Users can view notes of contacts in their company" ON public.contact_notes;
DROP POLICY IF EXISTS "Users can view lead_routing_configs of their company" ON public.lead_routing_configs;
DROP POLICY IF EXISTS "Users can view conversation sessions for their company" ON public.conversation_sessions;
DROP POLICY IF EXISTS "Users can view call_logs in their company" ON public.call_logs;
DROP POLICY IF EXISTS "Users can view analyses from their company" ON public.sales_coach_analyses;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update quick_messages of their company" ON public.quick_messages;
DROP POLICY IF EXISTS "Users can update quick_message_folders of their company" ON public.quick_message_folders;
DROP POLICY IF EXISTS "Users can update lead_routing_configs of their company" ON public.lead_routing_configs;
DROP POLICY IF EXISTS "Users can update conversation sessions" ON public.conversation_sessions;
DROP POLICY IF EXISTS "Users can update call_logs in their company" ON public.call_logs;
DROP POLICY IF EXISTS "Users can manage labels for their company" ON public.labels;
DROP POLICY IF EXISTS "Users can manage contact_labels for their company" ON public.contact_labels;
DROP POLICY IF EXISTS "Users can insert session_events" ON public.session_events;
DROP POLICY IF EXISTS "Users can insert quick_messages to their company" ON public.quick_messages;
DROP POLICY IF EXISTS "Users can insert quick_message_folders to their company" ON public.quick_message_folders;
DROP POLICY IF EXISTS "Users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert notes for contacts in their company" ON public.contact_notes;
DROP POLICY IF EXISTS "Users can insert lead_routing_configs of their company" ON public.lead_routing_configs;
DROP POLICY IF EXISTS "Users can insert conversation sessions" ON public.conversation_sessions;
DROP POLICY IF EXISTS "Users can insert call_logs in their company" ON public.call_logs;
DROP POLICY IF EXISTS "Users can insert analyses for their company" ON public.sales_coach_analyses;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete quick_messages of their company" ON public.quick_messages;
DROP POLICY IF EXISTS "Users can delete quick_message_folders of their company" ON public.quick_message_folders;
DROP POLICY IF EXISTS "Users can delete analyses for their company" ON public.sales_coach_analyses;
DROP POLICY IF EXISTS "Users can access pipelines of their company" ON public.pipelines;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.ad_leads;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.ad_leads;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.ad_leads;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.ad_leads;
ALTER TABLE IF EXISTS ONLY public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_whatsapp_instance_id_fkey;
ALTER TABLE IF EXISTS ONLY public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_unit_id_fkey;
ALTER TABLE IF EXISTS ONLY public.whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.user_units DROP CONSTRAINT IF EXISTS user_units_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.user_units DROP CONSTRAINT IF EXISTS user_units_unit_id_fkey;
ALTER TABLE IF EXISTS ONLY public.user_departments DROP CONSTRAINT IF EXISTS user_departments_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.user_departments DROP CONSTRAINT IF EXISTS user_departments_department_id_fkey;
ALTER TABLE IF EXISTS ONLY public.units DROP CONSTRAINT IF EXISTS units_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_unit_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_opportunity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_contact_id_fkey;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_fkey;
ALTER TABLE IF EXISTS ONLY public.session_events DROP CONSTRAINT IF EXISTS session_events_session_id_fkey;
ALTER TABLE IF EXISTS ONLY public.session_events DROP CONSTRAINT IF EXISTS session_events_actor_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales_coach_analyses DROP CONSTRAINT IF EXISTS sales_coach_analyses_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.sales_coach_analyses DROP CONSTRAINT IF EXISTS sales_coach_analyses_conversation_id_fkey;
ALTER TABLE IF EXISTS ONLY public.sales_coach_analyses DROP CONSTRAINT IF EXISTS sales_coach_analyses_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.resolution_reasons DROP CONSTRAINT IF EXISTS resolution_reasons_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.quick_messages DROP CONSTRAINT IF EXISTS quick_messages_folder_id_fkey;
ALTER TABLE IF EXISTS ONLY public.quick_messages DROP CONSTRAINT IF EXISTS quick_messages_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.quick_message_folders DROP CONSTRAINT IF EXISTS quick_message_folders_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_department_id_fkey;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.pipelines DROP CONSTRAINT IF EXISTS pipelines_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_unit_id_fkey;
ALTER TABLE IF EXISTS ONLY public.pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_pipeline_id_fkey;
ALTER TABLE IF EXISTS ONLY public.opportunity_notes DROP CONSTRAINT IF EXISTS opportunity_notes_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.opportunity_notes DROP CONSTRAINT IF EXISTS opportunity_notes_opportunity_id_fkey;
ALTER TABLE IF EXISTS ONLY public.opportunities DROP CONSTRAINT IF EXISTS opportunities_unit_id_fkey;
ALTER TABLE IF EXISTS ONLY public.opportunities DROP CONSTRAINT IF EXISTS opportunities_stage_id_fkey;
ALTER TABLE IF EXISTS ONLY public.opportunities DROP CONSTRAINT IF EXISTS opportunities_owner_id_fkey;
ALTER TABLE IF EXISTS ONLY public.opportunities DROP CONSTRAINT IF EXISTS opportunities_conversation_id_fkey;
ALTER TABLE IF EXISTS ONLY public.opportunities DROP CONSTRAINT IF EXISTS opportunities_contact_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.messages DROP CONSTRAINT IF EXISTS messages_quoted_message_id_fkey;
ALTER TABLE IF EXISTS ONLY public.messages DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;
ALTER TABLE IF EXISTS ONLY public.lead_routing_configs DROP CONSTRAINT IF EXISTS lead_routing_configs_unit_id_fkey;
ALTER TABLE IF EXISTS ONLY public.lead_routing_configs DROP CONSTRAINT IF EXISTS lead_routing_configs_department_id_fkey;
ALTER TABLE IF EXISTS ONLY public.lead_routing_configs DROP CONSTRAINT IF EXISTS lead_routing_configs_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.labels DROP CONSTRAINT IF EXISTS labels_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.messages DROP CONSTRAINT IF EXISTS fk_messages_sender_profile;
ALTER TABLE IF EXISTS ONLY public.departments DROP CONSTRAINT IF EXISTS departments_unit_id_fkey;
ALTER TABLE IF EXISTS ONLY public.departments DROP CONSTRAINT IF EXISTS departments_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_whatsapp_instance_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_unit_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_resolution_reason_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_department_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_current_session_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_contact_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_assigned_agent_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_ai_agent_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversation_sessions DROP CONSTRAINT IF EXISTS conversation_sessions_whatsapp_instance_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversation_sessions DROP CONSTRAINT IF EXISTS conversation_sessions_resolution_reason_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversation_sessions DROP CONSTRAINT IF EXISTS conversation_sessions_department_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversation_sessions DROP CONSTRAINT IF EXISTS conversation_sessions_conversation_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversation_sessions DROP CONSTRAINT IF EXISTS conversation_sessions_contact_id_fkey;
ALTER TABLE IF EXISTS ONLY public.conversation_sessions DROP CONSTRAINT IF EXISTS conversation_sessions_assigned_agent_id_fkey;
ALTER TABLE IF EXISTS ONLY public.contacts DROP CONSTRAINT IF EXISTS contacts_unit_id_fkey;
ALTER TABLE IF EXISTS ONLY public.contacts DROP CONSTRAINT IF EXISTS contacts_merged_into_id_fkey;
ALTER TABLE IF EXISTS ONLY public.contacts DROP CONSTRAINT IF EXISTS contacts_created_by_fkey;
ALTER TABLE IF EXISTS ONLY public.contacts DROP CONSTRAINT IF EXISTS contacts_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.contact_notes DROP CONSTRAINT IF EXISTS contact_notes_user_id_fkey;
ALTER TABLE IF EXISTS ONLY public.contact_notes DROP CONSTRAINT IF EXISTS contact_notes_contact_id_fkey;
ALTER TABLE IF EXISTS ONLY public.contact_labels DROP CONSTRAINT IF EXISTS contact_labels_label_id_fkey;
ALTER TABLE IF EXISTS ONLY public.contact_labels DROP CONSTRAINT IF EXISTS contact_labels_contact_id_fkey;
ALTER TABLE IF EXISTS ONLY public.call_logs DROP CONSTRAINT IF EXISTS call_logs_whatsapp_instance_id_fkey;
ALTER TABLE IF EXISTS ONLY public.call_logs DROP CONSTRAINT IF EXISTS call_logs_contact_id_fkey;
ALTER TABLE IF EXISTS ONLY public.call_logs DROP CONSTRAINT IF EXISTS call_logs_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.call_logs DROP CONSTRAINT IF EXISTS call_logs_assigned_agent_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_unit_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_resolution_reason_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_pipeline_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_instance_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_handoff_department_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_followup_resolution_reason_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_department_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_company_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ad_leads DROP CONSTRAINT IF EXISTS ad_leads_unit_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ad_leads DROP CONSTRAINT IF EXISTS ad_leads_contact_id_fkey;
ALTER TABLE IF EXISTS ONLY public.ad_leads DROP CONSTRAINT IF EXISTS ad_leads_company_id_fkey;
DROP TRIGGER IF EXISTS trigger_sync_call_log_to_messages ON public.call_logs;
DROP TRIGGER IF EXISTS on_message_inserted ON public.messages;
DROP INDEX IF EXISTS public.unique_active_conversation;
DROP INDEX IF EXISTS public.lead_routing_configs_dept_idx;
DROP INDEX IF EXISTS public.idx_session_events_session_id;
DROP INDEX IF EXISTS public.idx_conversation_sessions_conversation_id;
DROP INDEX IF EXISTS public.idx_conversation_sessions_contact_id;
DROP INDEX IF EXISTS public.contacts_whatsapp_lid_idx;
DROP INDEX IF EXISTS public.ad_leads_contact_id_idx;
DROP INDEX IF EXISTS public.ad_leads_company_id_idx;
DROP INDEX IF EXISTS public.active_session_per_conversation_idx;
ALTER TABLE IF EXISTS ONLY public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_whatsapp_instance_id_name_language_key;
ALTER TABLE IF EXISTS ONLY public.whatsapp_templates DROP CONSTRAINT IF EXISTS whatsapp_templates_pkey;
ALTER TABLE IF EXISTS ONLY public.whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_pkey;
ALTER TABLE IF EXISTS ONLY public.whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_instance_name_key;
ALTER TABLE IF EXISTS ONLY public.user_units DROP CONSTRAINT IF EXISTS user_units_pkey;
ALTER TABLE IF EXISTS ONLY public.user_departments DROP CONSTRAINT IF EXISTS user_departments_pkey;
ALTER TABLE IF EXISTS ONLY public.units DROP CONSTRAINT IF EXISTS units_pkey;
ALTER TABLE IF EXISTS ONLY public.units DROP CONSTRAINT IF EXISTS units_company_id_slug_key;
ALTER TABLE IF EXISTS ONLY public.tasks DROP CONSTRAINT IF EXISTS tasks_pkey;
ALTER TABLE IF EXISTS ONLY public.session_events DROP CONSTRAINT IF EXISTS session_events_pkey;
ALTER TABLE IF EXISTS ONLY public.sales_coach_analyses DROP CONSTRAINT IF EXISTS sales_coach_analyses_pkey;
ALTER TABLE IF EXISTS ONLY public.resolution_reasons DROP CONSTRAINT IF EXISTS resolution_reasons_pkey;
ALTER TABLE IF EXISTS ONLY public.quick_messages DROP CONSTRAINT IF EXISTS quick_messages_pkey;
ALTER TABLE IF EXISTS ONLY public.quick_message_folders DROP CONSTRAINT IF EXISTS quick_message_folders_pkey;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
ALTER TABLE IF EXISTS ONLY public.pipelines DROP CONSTRAINT IF EXISTS pipelines_pkey;
ALTER TABLE IF EXISTS ONLY public.pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_pkey;
ALTER TABLE IF EXISTS ONLY public.opportunity_notes DROP CONSTRAINT IF EXISTS opportunity_notes_pkey;
ALTER TABLE IF EXISTS ONLY public.opportunities DROP CONSTRAINT IF EXISTS opportunities_pkey;
ALTER TABLE IF EXISTS ONLY public.notifications DROP CONSTRAINT IF EXISTS notifications_pkey;
ALTER TABLE IF EXISTS ONLY public.messages DROP CONSTRAINT IF EXISTS messages_remote_msg_id_key;
ALTER TABLE IF EXISTS ONLY public.messages DROP CONSTRAINT IF EXISTS messages_pkey;
ALTER TABLE IF EXISTS ONLY public.lead_routing_configs DROP CONSTRAINT IF EXISTS lead_routing_configs_pkey;
ALTER TABLE IF EXISTS ONLY public.labels DROP CONSTRAINT IF EXISTS labels_pkey;
ALTER TABLE IF EXISTS ONLY public.departments DROP CONSTRAINT IF EXISTS departments_pkey;
ALTER TABLE IF EXISTS ONLY public.conversations DROP CONSTRAINT IF EXISTS conversations_pkey;
ALTER TABLE IF EXISTS ONLY public.conversation_sessions DROP CONSTRAINT IF EXISTS conversation_sessions_pkey;
ALTER TABLE IF EXISTS ONLY public.contacts DROP CONSTRAINT IF EXISTS contacts_pkey;
ALTER TABLE IF EXISTS ONLY public.contact_notes DROP CONSTRAINT IF EXISTS contact_notes_pkey;
ALTER TABLE IF EXISTS ONLY public.contact_labels DROP CONSTRAINT IF EXISTS contact_labels_pkey;
ALTER TABLE IF EXISTS ONLY public.companies DROP CONSTRAINT IF EXISTS companies_slug_key;
ALTER TABLE IF EXISTS ONLY public.companies DROP CONSTRAINT IF EXISTS companies_pkey;
ALTER TABLE IF EXISTS ONLY public.call_logs DROP CONSTRAINT IF EXISTS call_logs_wavoip_call_id_key;
ALTER TABLE IF EXISTS ONLY public.call_logs DROP CONSTRAINT IF EXISTS call_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_pkey;
ALTER TABLE IF EXISTS ONLY public.ad_leads DROP CONSTRAINT IF EXISTS ad_leads_pkey;
DROP TABLE IF EXISTS public.whatsapp_templates;
DROP TABLE IF EXISTS public.whatsapp_instances;
DROP TABLE IF EXISTS public.user_units;
DROP TABLE IF EXISTS public.user_departments;
DROP TABLE IF EXISTS public.units;
DROP TABLE IF EXISTS public.tasks;
DROP TABLE IF EXISTS public.session_events;
DROP TABLE IF EXISTS public.sales_coach_analyses;
DROP TABLE IF EXISTS public.resolution_reasons;
DROP TABLE IF EXISTS public.quick_messages;
DROP TABLE IF EXISTS public.quick_message_folders;
DROP TABLE IF EXISTS public.profiles;
DROP TABLE IF EXISTS public.pipelines;
DROP TABLE IF EXISTS public.pipeline_stages;
DROP TABLE IF EXISTS public.opportunity_notes;
DROP TABLE IF EXISTS public.opportunities;
DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.messages;
DROP TABLE IF EXISTS public.lead_routing_configs;
DROP TABLE IF EXISTS public.labels;
DROP TABLE IF EXISTS public.departments;
DROP TABLE IF EXISTS public.conversations;
DROP TABLE IF EXISTS public.conversation_sessions;
DROP TABLE IF EXISTS public.contacts;
DROP TABLE IF EXISTS public.contact_notes;
DROP TABLE IF EXISTS public.contact_labels;
DROP TABLE IF EXISTS public.companies;
DROP TABLE IF EXISTS public.call_logs;
DROP TABLE IF EXISTS public.ai_agents;
DROP TABLE IF EXISTS public.ad_leads;
DROP FUNCTION IF EXISTS public.user_in_unit(_unit uuid);
DROP FUNCTION IF EXISTS public.update_user_profile_admin(p_user_id uuid, p_role text, p_has_matriz_access boolean, p_company_id uuid);
DROP FUNCTION IF EXISTS public.update_conversation_on_message();
DROP FUNCTION IF EXISTS public.toggle_matriz_access_rpc(p_user_id uuid, p_has_access boolean);
DROP FUNCTION IF EXISTS public.super_delete_unit(p_unit_id uuid);
DROP FUNCTION IF EXISTS public.super_delete_company(p_company_id uuid);
DROP FUNCTION IF EXISTS public.super_create_unit(p_company_id uuid, p_name text);
DROP FUNCTION IF EXISTS public.super_create_company(p_name text, p_slug text, p_first_unit_name text);
DROP FUNCTION IF EXISTS public.set_user_matriz_access(p_user_id uuid, p_has_access boolean);
DROP FUNCTION IF EXISTS public.rls_auto_enable();
DROP FUNCTION IF EXISTS public.reset_unread_count(conv_id uuid);
DROP FUNCTION IF EXISTS public.remove_user_from_company(p_user_id uuid);
DROP FUNCTION IF EXISTS public.merge_contacts(source_id uuid, target_id uuid, final_name text, final_phone text, final_whatsapp_lid text, final_instagram_username text, final_profile_picture_url text, final_messenger_id text);
DROP FUNCTION IF EXISTS public.merge_contacts(source_id uuid, target_id uuid, final_name text, final_phone text, final_whatsapp_lid text, final_instagram_username text, final_profile_picture_url text);
DROP FUNCTION IF EXISTS public.merge_contacts(source_id uuid, target_id uuid);
DROP FUNCTION IF EXISTS public.link_user_to_company(p_email text, p_company_id uuid);
DROP FUNCTION IF EXISTS public.is_super_admin();
DROP FUNCTION IF EXISTS public.has_matriz_access();
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.handle_call_log_message_sync();
DROP FUNCTION IF EXISTS public.get_company_units(_company_id uuid);
DROP FUNCTION IF EXISTS public.get_all_companies();
DROP FUNCTION IF EXISTS public."current_role"();
DROP FUNCTION IF EXISTS public.current_company_id();
DROP FUNCTION IF EXISTS public.create_new_company(company_name text, company_slug text, user_id uuid);
DROP FUNCTION IF EXISTS public.create_new_company(company_name text, company_slug text);
DROP FUNCTION IF EXISTS public.can_read_contact(c_id uuid);
DROP TYPE IF EXISTS public.unit_role;
DROP TYPE IF EXISTS public.task_status;
DROP TYPE IF EXISTS public.task_priority;
DROP TYPE IF EXISTS public.opportunity_status;
DROP TYPE IF EXISTS public.message_sender;
DROP TYPE IF EXISTS public.media_type;
DROP TYPE IF EXISTS public.conversation_status;
DROP TYPE IF EXISTS public.channel_type;
DROP TYPE IF EXISTS public.call_status_type;
DROP TYPE IF EXISTS public.call_direction;
DROP TYPE IF EXISTS public.app_role;
DROP SCHEMA IF EXISTS public;
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin_company',
    'manager',
    'agent',
    'super_admin'
);


--
-- Name: call_direction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.call_direction AS ENUM (
    'INCOMING',
    'OUTGOING'
);


--
-- Name: call_status_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.call_status_type AS ENUM (
    'RINGING',
    'CALLING',
    'NOT_ANSWERED',
    'ACTIVE',
    'ENDED',
    'REJECTED',
    'FAILED',
    'DISCONNECTED'
);


--
-- Name: channel_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.channel_type AS ENUM (
    'whatsapp',
    'instagram',
    'messenger',
    'facebook'
);


--
-- Name: conversation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.conversation_status AS ENUM (
    'waiting',
    'active',
    'resolved'
);


--
-- Name: media_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.media_type AS ENUM (
    'text',
    'image',
    'audio',
    'video',
    'document'
);


--
-- Name: message_sender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.message_sender AS ENUM (
    'agent',
    'contact',
    'system'
);


--
-- Name: opportunity_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.opportunity_status AS ENUM (
    'open',
    'won',
    'lost'
);


--
-- Name: task_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_priority AS ENUM (
    'low',
    'medium',
    'high'
);


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_status AS ENUM (
    'pending',
    'done'
);


--
-- Name: unit_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.unit_role AS ENUM (
    'manager',
    'agent'
);


--
-- Name: can_read_contact(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_read_contact(c_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.conversations 
    WHERE contact_id = c_id AND (unit_id IS NULL OR public.user_in_unit(unit_id))
  )
$$;


--
-- Name: create_new_company(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_new_company(company_name text, company_slug text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: create_new_company(text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_new_company(company_name text, company_slug text, user_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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


--
-- Name: current_company_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_company_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT company_id FROM public.profiles WHERE id = auth.uid()
$$;


--
-- Name: current_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public."current_role"() RETURNS public.app_role
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;


--
-- Name: get_all_companies(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_all_companies() RETURNS TABLE(id uuid, name text, slug text, logo_url text, created_at timestamp with time zone, unit_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin pode listar empresas.';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.slug,
    c.logo_url,
    c.created_at,
    COUNT(u.id)::BIGINT AS unit_count
  FROM public.companies c
  LEFT JOIN public.units u ON u.company_id = c.id
  GROUP BY c.id, c.name, c.slug, c.logo_url, c.created_at
  ORDER BY c.created_at DESC;
END;
$$;


--
-- Name: get_company_units(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_company_units(_company_id uuid) RETURNS TABLE(id uuid, company_id uuid, name text, slug text, color text, active boolean, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin pode listar unidades desta forma.';
  END IF;

  RETURN QUERY
  SELECT u.id, u.company_id, u.name, u.slug, u.color, u.active, u.created_at
  FROM public.units u
  WHERE u.company_id = _company_id
  ORDER BY u.created_at ASC;
END;
$$;


--
-- Name: handle_call_log_message_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_call_log_message_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
            DECLARE
                v_unit_id UUID;
            BEGIN
                SELECT unit_id INTO v_unit_id FROM public.contacts WHERE id = NEW.contact_id;
                
                IF v_unit_id IS NULL THEN
                    SELECT id INTO v_unit_id FROM public.units WHERE company_id = NEW.company_id LIMIT 1;
                END IF;

                INSERT INTO public.conversations (
                    unit_id,
                    whatsapp_instance_id,
                    contact_id,
                    channel,
                    status,
                    last_message_at
                ) VALUES (
                    v_unit_id,
                    NEW.whatsapp_instance_id,
                    NEW.contact_id,
                    'whatsapp',
                    'waiting',
                    now()
                ) RETURNING id INTO v_conversation_id;
            END;
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
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: has_matriz_access(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_matriz_access() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT has_matriz_access FROM public.profiles WHERE id = auth.uid()
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role::text = 'super_admin'
  );
END;
$$;


--
-- Name: link_user_to_company(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_user_to_company(p_email text, p_company_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id UUID;
  v_admin_company UUID;
  v_is_super_admin BOOLEAN;
BEGIN
  -- Verifica se é super admin
  SELECT (role = 'super_admin') INTO v_is_super_admin 
  FROM public.profiles 
  WHERE id = auth.uid();

  IF v_is_super_admin IS NULL OR NOT v_is_super_admin THEN
    -- Se não for super admin, verifica se é Admin da Sede da empresa destino
    SELECT company_id INTO v_admin_company 
    FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin_company';

    IF v_admin_company IS NULL OR v_admin_company != p_company_id THEN
      RAISE EXCEPTION 'Apenas administradores podem vincular usuários.';
    END IF;
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


--
-- Name: merge_contacts(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_contacts(source_id uuid, target_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
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
$$;


--
-- Name: merge_contacts(uuid, uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_contacts(source_id uuid, target_id uuid, final_name text DEFAULT NULL::text, final_phone text DEFAULT NULL::text, final_whatsapp_lid text DEFAULT NULL::text, final_instagram_username text DEFAULT NULL::text, final_profile_picture_url text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Move all conversations from source to target
  UPDATE public.conversations
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Move conversation_sessions
  UPDATE public.conversation_sessions
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Move opportunities
  UPDATE public.opportunities
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Move tasks
  UPDATE public.tasks
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Move contact_notes
  UPDATE public.contact_notes
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Update target with the chosen final values
  UPDATE public.contacts
  SET 
    name = COALESCE(final_name, name),
    phone = COALESCE(final_phone, phone),
    whatsapp_lid = COALESCE(final_whatsapp_lid, whatsapp_lid),
    instagram_username = COALESCE(final_instagram_username, instagram_username),
    profile_picture_url = COALESCE(final_profile_picture_url, profile_picture_url)
  WHERE id = target_id;

  -- Mark source as merged into target
  UPDATE public.contacts
  SET merged_into_id = target_id
  WHERE id = source_id;
END;
$$;


--
-- Name: merge_contacts(uuid, uuid, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.merge_contacts(source_id uuid, target_id uuid, final_name text DEFAULT NULL::text, final_phone text DEFAULT NULL::text, final_whatsapp_lid text DEFAULT NULL::text, final_instagram_username text DEFAULT NULL::text, final_profile_picture_url text DEFAULT NULL::text, final_messenger_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Move all conversations from source to target
  UPDATE public.conversations
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Move all conversation_sessions from source to target
  UPDATE public.conversation_sessions
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Move all contact_notes from source to target
  UPDATE public.contact_notes
  SET contact_id = target_id
  WHERE contact_id = source_id;

  -- Update target with provided final fields or coalesce
  UPDATE public.contacts
  SET 
    name = COALESCE(final_name, public.contacts.name),
    phone = COALESCE(final_phone, public.contacts.phone, (SELECT phone FROM public.contacts WHERE id = source_id)),
    whatsapp_lid = COALESCE(final_whatsapp_lid, public.contacts.whatsapp_lid, (SELECT whatsapp_lid FROM public.contacts WHERE id = source_id)),
    instagram_username = COALESCE(final_instagram_username, public.contacts.instagram_username, (SELECT instagram_username FROM public.contacts WHERE id = source_id)),
    instagram_id = COALESCE(public.contacts.instagram_id, (SELECT instagram_id FROM public.contacts WHERE id = source_id)),
    messenger_id = COALESCE(final_messenger_id, public.contacts.messenger_id, (SELECT messenger_id FROM public.contacts WHERE id = source_id)),
    profile_picture_url = COALESCE(final_profile_picture_url, public.contacts.profile_picture_url, (SELECT profile_picture_url FROM public.contacts WHERE id = source_id))
  WHERE id = target_id;

  -- Mark source as merged into target
  UPDATE public.contacts
  SET merged_into_id = target_id
  WHERE id = source_id;
END;
$$;


--
-- Name: remove_user_from_company(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_user_from_company(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_super_admin BOOLEAN;
  v_caller_company UUID;
  v_target_company UUID;
BEGIN
  -- Verifica se é super admin
  SELECT (role = 'super_admin') INTO v_is_super_admin FROM public.profiles WHERE id = auth.uid();
  
  -- Pega a empresa do chamador (se for admin)
  SELECT company_id INTO v_caller_company FROM public.profiles WHERE id = auth.uid() AND role = 'admin_company';

  -- Pega a empresa do alvo
  SELECT company_id INTO v_target_company FROM public.profiles WHERE id = p_user_id;

  IF (v_is_super_admin IS NULL OR NOT v_is_super_admin) AND (v_caller_company IS NULL OR v_caller_company != v_target_company) THEN
    RAISE EXCEPTION 'Sem permissão para remover este usuário.';
  END IF;

  -- Remove o usuário da empresa e reseta permissões
  UPDATE public.profiles
  SET company_id = NULL, role = 'agent', has_matriz_access = false, department_id = NULL
  WHERE id = p_user_id;

  -- Remove de todas as unidades
  DELETE FROM public.user_units WHERE user_id = p_user_id;
  
  -- Remove de departamentos associados
  DELETE FROM public.user_departments WHERE user_id = p_user_id;
END;
$$;


--
-- Name: reset_unread_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_unread_count(conv_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.conversations SET unread_count = 0 WHERE id = conv_id;
END;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: set_user_matriz_access(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_matriz_access(p_user_id uuid, p_has_access boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_is_super_admin BOOLEAN;
BEGIN
  -- Verifica se é super admin
  SELECT (role = 'super_admin') INTO v_is_super_admin 
  FROM public.profiles 
  WHERE id = auth.uid();

  -- Verify if the caller is an admin_company or super_admin
  IF (v_is_super_admin IS TRUE) OR EXISTS (
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


--
-- Name: super_create_company(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.super_create_company(p_name text, p_slug text, p_first_unit_name text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  new_company_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin pode criar empresas.';
  END IF;

  INSERT INTO public.companies (name, slug)
  VALUES (p_name, p_slug)
  RETURNING companies.id INTO new_company_id;

  IF p_first_unit_name IS NOT NULL AND p_first_unit_name != '' THEN
    INSERT INTO public.units (company_id, name, slug)
    VALUES (
      new_company_id,
      p_first_unit_name,
      lower(regexp_replace(p_first_unit_name, '[^a-zA-Z0-9]', '', 'g'))
    );
  END IF;

  RETURN new_company_id;
END;
$$;


--
-- Name: super_create_unit(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.super_create_unit(p_company_id uuid, p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  new_unit_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin pode criar unidades desta forma.';
  END IF;

  INSERT INTO public.units (company_id, name, slug)
  VALUES (
    p_company_id,
    p_name,
    lower(regexp_replace(p_name, '[^a-zA-Z0-9]', '', 'g'))
  )
  RETURNING units.id INTO new_unit_id;

  RETURN new_unit_id;
END;
$$;


--
-- Name: super_delete_company(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.super_delete_company(p_company_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin pode deletar empresas.';
  END IF;

  DELETE FROM public.companies WHERE id = p_company_id;
END;
$$;


--
-- Name: super_delete_unit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.super_delete_unit(p_unit_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas super_admin pode deletar unidades desta forma.';
  END IF;

  DELETE FROM public.units WHERE id = p_unit_id;
END;
$$;


--
-- Name: toggle_matriz_access_rpc(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_matriz_access_rpc(p_user_id uuid, p_has_access boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
      BEGIN
        UPDATE profiles SET has_matriz_access = p_has_access WHERE id = p_user_id;
      END;
      $$;


--
-- Name: update_conversation_on_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_conversation_on_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Update last message preview
  UPDATE public.conversations
  SET last_message_preview = NEW.content,
      last_message_at = NEW.created_at,
      unread_count = CASE 
        WHEN NEW.sender_type = 'contact' THEN unread_count + 1 
        ELSE unread_count 
      END
  WHERE id = NEW.conversation_id;
  
  RETURN NEW;
END;
$$;


--
-- Name: update_user_profile_admin(uuid, text, boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_profile_admin(p_user_id uuid, p_role text DEFAULT NULL::text, p_has_matriz_access boolean DEFAULT NULL::boolean, p_company_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  UPDATE profiles
  SET 
    role = COALESCE(p_role::app_role, role),
    has_matriz_access = COALESCE(p_has_matriz_access, has_matriz_access),
    company_id = COALESCE(p_company_id, company_id)
  WHERE id = p_user_id;
END;
$$;


--
-- Name: user_in_unit(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_in_unit(_unit uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_units WHERE user_id = auth.uid() AND unit_id = _unit)
      OR public.current_role() = 'admin_company'
      OR public.has_matriz_access()
      OR public.is_super_admin()
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ad_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ad_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    unit_id uuid,
    contact_id uuid NOT NULL,
    ad_title text,
    ad_body text,
    source_url text,
    thumbnail_url text,
    source_id text,
    ctwa_clid text,
    conversion_source text,
    conversion_data text,
    ctwa_payload text,
    source_app text,
    media_type integer,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: ai_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    instance_id uuid,
    department_id uuid,
    ai_type text NOT NULL,
    model text NOT NULL,
    prompt_personality text,
    prompt_instructions text,
    prompt_extra_info text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    active_by_default boolean DEFAULT false NOT NULL,
    provider text DEFAULT 'openai'::text NOT NULL,
    unit_id uuid,
    allow_handoff boolean DEFAULT false NOT NULL,
    handoff_department_id uuid,
    allow_resolution boolean DEFAULT false NOT NULL,
    resolution_reason_id uuid,
    max_tokens integer DEFAULT 4096 NOT NULL,
    prompt_handoff text,
    prompt_resolution text,
    is_main_agent boolean DEFAULT false NOT NULL,
    allow_tasks boolean DEFAULT false NOT NULL,
    prompt_tasks text,
    allow_opportunities boolean DEFAULT false NOT NULL,
    prompt_opportunities text,
    pipeline_id uuid,
    allowed_agent_ids uuid[] DEFAULT '{}'::uuid[],
    prompt_receive_handoff text,
    description text,
    allow_followup boolean DEFAULT false,
    followup_interval_minutes integer DEFAULT 15,
    followup_max_attempts integer DEFAULT 2,
    prompt_followup text,
    followup_resolution_reason_id uuid
);


--
-- Name: COLUMN ai_agents.followup_resolution_reason_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.ai_agents.followup_resolution_reason_id IS 'Motivo de encerramento usado quando a conversa é encerrada por inatividade do cliente (follow-up exausto). Separado do resolution_reason_id que é usado no encerramento bem-sucedido.';


--
-- Name: call_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wavoip_call_id text NOT NULL,
    whatsapp_instance_id uuid,
    contact_id uuid,
    assigned_agent_id uuid,
    company_id uuid NOT NULL,
    direction public.call_direction NOT NULL,
    status public.call_status_type NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    duration_seconds integer,
    recording_url text,
    peer_number text,
    transcription text
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    evogo_host text,
    evogo_global_token text,
    ai_settings jsonb DEFAULT '{}'::jsonb,
    document text,
    address text,
    business_hours text,
    custom_variables jsonb DEFAULT '{}'::jsonb,
    meta_system_user_token text,
    stevo_host text,
    stevo_global_token text
);


--
-- Name: contact_labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_labels (
    contact_id uuid NOT NULL,
    label_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: contact_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    unit_id uuid,
    whatsapp_lid text,
    created_by uuid,
    source text,
    source_details text,
    marketing_opt_in boolean DEFAULT true,
    profile_picture_url text,
    merged_into_id uuid,
    instagram_username text,
    instagram_id text,
    messenger_id text,
    is_blocked boolean DEFAULT false NOT NULL,
    block_reason text
);


--
-- Name: conversation_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    whatsapp_instance_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    assigned_agent_id uuid,
    department_id uuid,
    resolution_reason_id uuid,
    resolution_observation text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid,
    department_id uuid,
    contact_id uuid NOT NULL,
    channel public.channel_type DEFAULT 'whatsapp'::public.channel_type NOT NULL,
    status public.conversation_status DEFAULT 'waiting'::public.conversation_status NOT NULL,
    assigned_agent_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    unread_count integer DEFAULT 0 NOT NULL,
    last_message_preview text,
    whatsapp_instance_id uuid,
    resolution_reason_id uuid,
    resolution_observation text,
    current_session_id uuid,
    ai_active boolean DEFAULT false NOT NULL,
    ai_agent_id uuid,
    ai_followup_count integer DEFAULT 0,
    ai_last_followup_at timestamp with time zone,
    remote_id text
);

ALTER TABLE ONLY public.conversations REPLICA IDENTITY FULL;


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid,
    name text NOT NULL,
    description text,
    max_agents integer DEFAULT 10 NOT NULL,
    sla_minutes integer DEFAULT 30 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid
);


--
-- Name: labels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.labels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    external_id text,
    name text NOT NULL,
    color text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: lead_routing_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_routing_configs (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    department_id uuid,
    is_active boolean DEFAULT false,
    agents jsonb DEFAULT '[]'::jsonb,
    last_assigned_index integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    unit_id uuid
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    sender_type public.message_sender NOT NULL,
    sender_id uuid,
    content text,
    media_type public.media_type DEFAULT 'text'::public.media_type NOT NULL,
    media_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    remote_msg_id text,
    quoted_message_id uuid,
    quoted_content text,
    is_edited boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    reactions jsonb DEFAULT '{}'::jsonb,
    participant_jid text,
    metadata jsonb DEFAULT '{}'::jsonb,
    transcription text,
    is_internal boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY public.messages REPLICA IDENTITY FULL;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    company_id uuid NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    link text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: opportunities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid,
    contact_id uuid NOT NULL,
    conversation_id uuid,
    title text NOT NULL,
    value numeric(12,2) DEFAULT 0 NOT NULL,
    stage_id uuid,
    owner_id uuid,
    expected_close_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.opportunity_status DEFAULT 'open'::public.opportunity_status NOT NULL
);


--
-- Name: opportunity_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opportunity_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    opportunity_id uuid NOT NULL,
    user_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pipeline_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid,
    name text NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    color text DEFAULT '#2563EB'::text NOT NULL,
    pipeline_id uuid
);


--
-- Name: pipelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    company_id uuid,
    name text NOT NULL,
    email text NOT NULL,
    avatar_url text,
    role public.app_role DEFAULT 'agent'::public.app_role NOT NULL,
    active boolean DEFAULT true NOT NULL,
    online boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    has_matriz_access boolean DEFAULT false NOT NULL,
    use_signature boolean DEFAULT false,
    department_id uuid
);


--
-- Name: quick_message_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quick_message_folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: quick_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quick_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    shortcut text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    media_url text,
    media_type text,
    name text DEFAULT ''::text,
    folder_id uuid
);


--
-- Name: resolution_reasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resolution_reasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    label text NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sales_coach_analyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_coach_analyses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    company_id uuid NOT NULL,
    analysis_markdown text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: session_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    event_type text NOT NULL,
    actor_id uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    unit_id uuid,
    contact_id uuid,
    opportunity_id uuid,
    title text NOT NULL,
    description text,
    assigned_to uuid,
    due_date timestamp with time zone,
    priority public.task_priority DEFAULT 'medium'::public.task_priority NOT NULL,
    status public.task_status DEFAULT 'pending'::public.task_status NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    task_type text DEFAULT 'other'::text NOT NULL
);


--
-- Name: units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    color text DEFAULT '#6366f1'::text NOT NULL,
    document text,
    address text,
    business_hours text,
    custom_variables jsonb DEFAULT '{}'::jsonb
);


--
-- Name: user_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_departments (
    user_id uuid NOT NULL,
    department_id uuid NOT NULL
);


--
-- Name: user_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_units (
    user_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    role public.unit_role DEFAULT 'agent'::public.unit_role NOT NULL
);


--
-- Name: whatsapp_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    unit_id uuid,
    name text NOT NULL,
    instance_name text NOT NULL,
    evogo_api_key text DEFAULT (gen_random_uuid())::text NOT NULL,
    status text DEFAULT 'disconnected'::text NOT NULL,
    webhook_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    evogo_instance_id uuid,
    owner_jid text,
    wavoip_token text,
    provider character varying(50) DEFAULT 'evogo'::character varying,
    oficial_phone_number_id character varying(255),
    oficial_access_token text,
    oficial_verify_token character varying(255),
    oficial_waba_id text,
    last_account_alert jsonb,
    waba_review_status text,
    last_account_update jsonb,
    phone_name_status text,
    phone_name_rejection_reason text,
    messaging_limit text,
    stevo_api_key text DEFAULT (gen_random_uuid())::text,
    stevo_instance_id uuid,
    custom_host text,
    CONSTRAINT valid_provider CHECK (((provider)::text = ANY (ARRAY[('evogo'::character varying)::text, ('oficial'::character varying)::text, ('stevo'::character varying)::text, ('instagram'::character varying)::text, ('messenger'::character varying)::text, ('facebook'::character varying)::text])))
);


--
-- Name: whatsapp_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    whatsapp_instance_id uuid NOT NULL,
    name text NOT NULL,
    language text NOT NULL,
    category text NOT NULL,
    status text NOT NULL,
    components jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    quality_score text
);


--
-- Name: ad_leads ad_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_leads
    ADD CONSTRAINT ad_leads_pkey PRIMARY KEY (id);


--
-- Name: ai_agents ai_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_pkey PRIMARY KEY (id);


--
-- Name: call_logs call_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_pkey PRIMARY KEY (id);


--
-- Name: call_logs call_logs_wavoip_call_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_wavoip_call_id_key UNIQUE (wavoip_call_id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: companies companies_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_slug_key UNIQUE (slug);


--
-- Name: contact_labels contact_labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_labels
    ADD CONSTRAINT contact_labels_pkey PRIMARY KEY (contact_id, label_id);


--
-- Name: contact_notes contact_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: conversation_sessions conversation_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_sessions
    ADD CONSTRAINT conversation_sessions_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: labels labels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels
    ADD CONSTRAINT labels_pkey PRIMARY KEY (id);


--
-- Name: lead_routing_configs lead_routing_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_routing_configs
    ADD CONSTRAINT lead_routing_configs_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: messages messages_remote_msg_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_remote_msg_id_key UNIQUE (remote_msg_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: opportunities opportunities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_pkey PRIMARY KEY (id);


--
-- Name: opportunity_notes opportunity_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_notes
    ADD CONSTRAINT opportunity_notes_pkey PRIMARY KEY (id);


--
-- Name: pipeline_stages pipeline_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pkey PRIMARY KEY (id);


--
-- Name: pipelines pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: quick_message_folders quick_message_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_message_folders
    ADD CONSTRAINT quick_message_folders_pkey PRIMARY KEY (id);


--
-- Name: quick_messages quick_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_messages
    ADD CONSTRAINT quick_messages_pkey PRIMARY KEY (id);


--
-- Name: resolution_reasons resolution_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resolution_reasons
    ADD CONSTRAINT resolution_reasons_pkey PRIMARY KEY (id);


--
-- Name: sales_coach_analyses sales_coach_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_coach_analyses
    ADD CONSTRAINT sales_coach_analyses_pkey PRIMARY KEY (id);


--
-- Name: session_events session_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_events
    ADD CONSTRAINT session_events_pkey PRIMARY KEY (id);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: units units_company_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_company_id_slug_key UNIQUE (company_id, slug);


--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--
-- Name: user_departments user_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_departments
    ADD CONSTRAINT user_departments_pkey PRIMARY KEY (user_id, department_id);


--
-- Name: user_units user_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_units
    ADD CONSTRAINT user_units_pkey PRIMARY KEY (user_id, unit_id);


--
-- Name: whatsapp_instances whatsapp_instances_instance_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_instance_name_key UNIQUE (instance_name);


--
-- Name: whatsapp_instances whatsapp_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_templates whatsapp_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_templates whatsapp_templates_whatsapp_instance_id_name_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_whatsapp_instance_id_name_language_key UNIQUE (whatsapp_instance_id, name, language);


--
-- Name: active_session_per_conversation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX active_session_per_conversation_idx ON public.conversation_sessions USING btree (conversation_id) WHERE (resolved_at IS NULL);


--
-- Name: ad_leads_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ad_leads_company_id_idx ON public.ad_leads USING btree (company_id);


--
-- Name: ad_leads_contact_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ad_leads_contact_id_idx ON public.ad_leads USING btree (contact_id);


--
-- Name: contacts_whatsapp_lid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_whatsapp_lid_idx ON public.contacts USING btree (whatsapp_lid);


--
-- Name: idx_conversation_sessions_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_sessions_contact_id ON public.conversation_sessions USING btree (contact_id);


--
-- Name: idx_conversation_sessions_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_conversation_sessions_conversation_id ON public.conversation_sessions USING btree (conversation_id);


--
-- Name: idx_session_events_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_session_events_session_id ON public.session_events USING btree (session_id);


--
-- Name: lead_routing_configs_dept_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX lead_routing_configs_dept_idx ON public.lead_routing_configs USING btree (company_id, COALESCE(unit_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: unique_active_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_active_conversation ON public.conversations USING btree (contact_id, whatsapp_instance_id) WHERE (status = ANY (ARRAY['waiting'::public.conversation_status, 'active'::public.conversation_status]));


--
-- Name: messages on_message_inserted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_message_inserted AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message();


--
-- Name: call_logs trigger_sync_call_log_to_messages; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_sync_call_log_to_messages BEFORE INSERT OR UPDATE ON public.call_logs FOR EACH ROW EXECUTE FUNCTION public.handle_call_log_message_sync();


--
-- Name: ad_leads ad_leads_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_leads
    ADD CONSTRAINT ad_leads_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: ad_leads ad_leads_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_leads
    ADD CONSTRAINT ad_leads_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: ad_leads ad_leads_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ad_leads
    ADD CONSTRAINT ad_leads_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE SET NULL;


--
-- Name: ai_agents ai_agents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: ai_agents ai_agents_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: ai_agents ai_agents_followup_resolution_reason_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_followup_resolution_reason_id_fkey FOREIGN KEY (followup_resolution_reason_id) REFERENCES public.resolution_reasons(id) ON DELETE SET NULL;


--
-- Name: ai_agents ai_agents_handoff_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_handoff_department_id_fkey FOREIGN KEY (handoff_department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: ai_agents ai_agents_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;


--
-- Name: ai_agents ai_agents_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id);


--
-- Name: ai_agents ai_agents_resolution_reason_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_resolution_reason_id_fkey FOREIGN KEY (resolution_reason_id) REFERENCES public.resolution_reasons(id) ON DELETE SET NULL;


--
-- Name: ai_agents ai_agents_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agents
    ADD CONSTRAINT ai_agents_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE SET NULL;


--
-- Name: call_logs call_logs_assigned_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_assigned_agent_id_fkey FOREIGN KEY (assigned_agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: call_logs call_logs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: call_logs call_logs_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: call_logs call_logs_whatsapp_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_logs
    ADD CONSTRAINT call_logs_whatsapp_instance_id_fkey FOREIGN KEY (whatsapp_instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;


--
-- Name: contact_labels contact_labels_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_labels
    ADD CONSTRAINT contact_labels_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_labels contact_labels_label_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_labels
    ADD CONSTRAINT contact_labels_label_id_fkey FOREIGN KEY (label_id) REFERENCES public.labels(id) ON DELETE CASCADE;


--
-- Name: contact_notes contact_notes_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: contact_notes contact_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_notes
    ADD CONSTRAINT contact_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_merged_into_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_merged_into_id_fkey FOREIGN KEY (merged_into_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: contacts contacts_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: conversation_sessions conversation_sessions_assigned_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_sessions
    ADD CONSTRAINT conversation_sessions_assigned_agent_id_fkey FOREIGN KEY (assigned_agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: conversation_sessions conversation_sessions_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_sessions
    ADD CONSTRAINT conversation_sessions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: conversation_sessions conversation_sessions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_sessions
    ADD CONSTRAINT conversation_sessions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversation_sessions conversation_sessions_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_sessions
    ADD CONSTRAINT conversation_sessions_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: conversation_sessions conversation_sessions_resolution_reason_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_sessions
    ADD CONSTRAINT conversation_sessions_resolution_reason_id_fkey FOREIGN KEY (resolution_reason_id) REFERENCES public.resolution_reasons(id) ON DELETE SET NULL;


--
-- Name: conversation_sessions conversation_sessions_whatsapp_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_sessions
    ADD CONSTRAINT conversation_sessions_whatsapp_instance_id_fkey FOREIGN KEY (whatsapp_instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_ai_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_ai_agent_id_fkey FOREIGN KEY (ai_agent_id) REFERENCES public.ai_agents(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_assigned_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_assigned_agent_id_fkey FOREIGN KEY (assigned_agent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_current_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_current_session_id_fkey FOREIGN KEY (current_session_id) REFERENCES public.conversation_sessions(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_resolution_reason_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_resolution_reason_id_fkey FOREIGN KEY (resolution_reason_id) REFERENCES public.resolution_reasons(id) ON DELETE SET NULL;


--
-- Name: conversations conversations_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_whatsapp_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_whatsapp_instance_id_fkey FOREIGN KEY (whatsapp_instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;


--
-- Name: departments departments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: departments departments_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: messages fk_messages_sender_profile; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT fk_messages_sender_profile FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: labels labels_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labels
    ADD CONSTRAINT labels_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: lead_routing_configs lead_routing_configs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_routing_configs
    ADD CONSTRAINT lead_routing_configs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);


--
-- Name: lead_routing_configs lead_routing_configs_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_routing_configs
    ADD CONSTRAINT lead_routing_configs_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: lead_routing_configs lead_routing_configs_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_routing_configs
    ADD CONSTRAINT lead_routing_configs_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id);


--
-- Name: messages messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: messages messages_quoted_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_quoted_message_id_fkey FOREIGN KEY (quoted_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: opportunities opportunities_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;


--
-- Name: opportunities opportunities_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;


--
-- Name: opportunities opportunities_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunities
    ADD CONSTRAINT opportunities_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: opportunity_notes opportunity_notes_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_notes
    ADD CONSTRAINT opportunity_notes_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE CASCADE;


--
-- Name: opportunity_notes opportunity_notes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.opportunity_notes
    ADD CONSTRAINT opportunity_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: pipeline_stages pipeline_stages_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE CASCADE;


--
-- Name: pipeline_stages pipeline_stages_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipeline_stages
    ADD CONSTRAINT pipeline_stages_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: pipelines pipelines_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pipelines
    ADD CONSTRAINT pipelines_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: quick_message_folders quick_message_folders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_message_folders
    ADD CONSTRAINT quick_message_folders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: quick_messages quick_messages_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_messages
    ADD CONSTRAINT quick_messages_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: quick_messages quick_messages_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quick_messages
    ADD CONSTRAINT quick_messages_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.quick_message_folders(id) ON DELETE SET NULL;


--
-- Name: resolution_reasons resolution_reasons_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resolution_reasons
    ADD CONSTRAINT resolution_reasons_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: sales_coach_analyses sales_coach_analyses_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_coach_analyses
    ADD CONSTRAINT sales_coach_analyses_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: sales_coach_analyses sales_coach_analyses_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_coach_analyses
    ADD CONSTRAINT sales_coach_analyses_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: sales_coach_analyses sales_coach_analyses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_coach_analyses
    ADD CONSTRAINT sales_coach_analyses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: session_events session_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_events
    ADD CONSTRAINT session_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: session_events session_events_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session_events
    ADD CONSTRAINT session_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.conversation_sessions(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_opportunity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_opportunity_id_fkey FOREIGN KEY (opportunity_id) REFERENCES public.opportunities(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: units units_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: user_departments user_departments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_departments
    ADD CONSTRAINT user_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: user_departments user_departments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_departments
    ADD CONSTRAINT user_departments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: user_units user_units_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_units
    ADD CONSTRAINT user_units_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: user_units user_units_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_units
    ADD CONSTRAINT user_units_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: whatsapp_instances whatsapp_instances_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: whatsapp_instances whatsapp_instances_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--
-- Name: whatsapp_templates whatsapp_templates_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: whatsapp_templates whatsapp_templates_whatsapp_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_templates
    ADD CONSTRAINT whatsapp_templates_whatsapp_instance_id_fkey FOREIGN KEY (whatsapp_instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE;


--
-- Name: ad_leads Enable delete for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable delete for authenticated users" ON public.ad_leads FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: ad_leads Enable insert for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for authenticated users" ON public.ad_leads FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: ad_leads Enable read access for all authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for all authenticated users" ON public.ad_leads FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: ad_leads Enable update for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable update for authenticated users" ON public.ad_leads FOR UPDATE USING ((auth.role() = 'authenticated'::text));


--
-- Name: pipelines Users can access pipelines of their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can access pipelines of their company" ON public.pipelines USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: sales_coach_analyses Users can delete analyses for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete analyses for their company" ON public.sales_coach_analyses FOR DELETE USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: quick_message_folders Users can delete quick_message_folders of their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete quick_message_folders of their company" ON public.quick_message_folders FOR DELETE USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: quick_messages Users can delete quick_messages of their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete quick_messages of their company" ON public.quick_messages FOR DELETE USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: notifications Users can delete their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: sales_coach_analyses Users can insert analyses for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert analyses for their company" ON public.sales_coach_analyses FOR INSERT WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: call_logs Users can insert call_logs in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert call_logs in their company" ON public.call_logs FOR INSERT WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: conversation_sessions Users can insert conversation sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert conversation sessions" ON public.conversation_sessions FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.contacts c
     JOIN public.companies co ON ((c.company_id = co.id)))
     JOIN public.profiles p ON ((p.company_id = co.id)))
  WHERE ((c.id = conversation_sessions.contact_id) AND (p.id = auth.uid())))));


--
-- Name: lead_routing_configs Users can insert lead_routing_configs of their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert lead_routing_configs of their company" ON public.lead_routing_configs FOR INSERT WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: contact_notes Users can insert notes for contacts in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert notes for contacts in their company" ON public.contact_notes FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.contacts c
  WHERE ((c.id = contact_notes.contact_id) AND (c.company_id = ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))) AND (auth.uid() = user_id)));


--
-- Name: notifications Users can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert notifications" ON public.notifications FOR INSERT WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: quick_message_folders Users can insert quick_message_folders to their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert quick_message_folders to their company" ON public.quick_message_folders FOR INSERT WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: quick_messages Users can insert quick_messages to their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert quick_messages to their company" ON public.quick_messages FOR INSERT WITH CHECK ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: session_events Users can insert session_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert session_events" ON public.session_events FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.conversation_sessions cs
     JOIN public.contacts c ON ((cs.contact_id = c.id)))
     JOIN public.profiles p ON ((p.company_id = c.company_id)))
  WHERE ((cs.id = session_events.session_id) AND (p.id = auth.uid())))));


--
-- Name: contact_labels Users can manage contact_labels for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage contact_labels for their company" ON public.contact_labels USING ((contact_id IN ( SELECT contacts.id
   FROM public.contacts
  WHERE (contacts.company_id IN ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid()))))));


--
-- Name: labels Users can manage labels for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage labels for their company" ON public.labels USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: call_logs Users can update call_logs in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update call_logs in their company" ON public.call_logs FOR UPDATE USING ((company_id = public.current_company_id()));


--
-- Name: conversation_sessions Users can update conversation sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update conversation sessions" ON public.conversation_sessions FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ((public.contacts c
     JOIN public.companies co ON ((c.company_id = co.id)))
     JOIN public.profiles p ON ((p.company_id = co.id)))
  WHERE ((c.id = conversation_sessions.contact_id) AND (p.id = auth.uid())))));


--
-- Name: lead_routing_configs Users can update lead_routing_configs of their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update lead_routing_configs of their company" ON public.lead_routing_configs FOR UPDATE USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: quick_message_folders Users can update quick_message_folders of their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update quick_message_folders of their company" ON public.quick_message_folders FOR UPDATE USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: quick_messages Users can update quick_messages of their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update quick_messages of their company" ON public.quick_messages FOR UPDATE USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: notifications Users can update their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: sales_coach_analyses Users can view analyses from their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view analyses from their company" ON public.sales_coach_analyses FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: call_logs Users can view call_logs in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view call_logs in their company" ON public.call_logs FOR SELECT USING ((company_id = public.current_company_id()));


--
-- Name: conversation_sessions Users can view conversation sessions for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view conversation sessions for their company" ON public.conversation_sessions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.contacts c
     JOIN public.companies co ON ((c.company_id = co.id)))
     JOIN public.profiles p ON ((p.company_id = co.id)))
  WHERE ((c.id = conversation_sessions.contact_id) AND (p.id = auth.uid())))));


--
-- Name: lead_routing_configs Users can view lead_routing_configs of their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view lead_routing_configs of their company" ON public.lead_routing_configs FOR SELECT USING ((company_id IN ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: contact_notes Users can view notes of contacts in their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view notes of contacts in their company" ON public.contact_notes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.contacts c
  WHERE ((c.id = contact_notes.contact_id) AND (c.company_id = ( SELECT profiles.company_id
           FROM public.profiles
          WHERE (profiles.id = auth.uid())))))));


--
-- Name: quick_message_folders Users can view quick_message_folders of their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view quick_message_folders of their company" ON public.quick_message_folders FOR SELECT USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: quick_messages Users can view quick_messages of their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view quick_messages of their company" ON public.quick_messages FOR SELECT USING ((company_id = ( SELECT profiles.company_id
   FROM public.profiles
  WHERE (profiles.id = auth.uid()))));


--
-- Name: session_events Users can view session_events for their company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view session_events for their company" ON public.session_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.conversation_sessions cs
     JOIN public.contacts c ON ((cs.contact_id = c.id)))
     JOIN public.profiles p ON ((p.company_id = c.company_id)))
  WHERE ((cs.id = session_events.session_id) AND (p.id = auth.uid())))));


--
-- Name: notifications Users can view their own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: ad_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ad_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_agents ai_agents manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_agents manage" ON public.ai_agents TO authenticated USING ((((company_id = public.current_company_id()) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin())) WITH CHECK ((((company_id = public.current_company_id()) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin()));


--
-- Name: ai_agents ai_agents read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ai_agents read" ON public.ai_agents FOR SELECT TO authenticated USING (((company_id = public.current_company_id()) OR public.is_super_admin()));


--
-- Name: call_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: companies companies admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "companies admin manage" ON public.companies TO authenticated USING ((((id = public.current_company_id()) AND (public."current_role"() = 'admin_company'::public.app_role)) OR public.is_super_admin())) WITH CHECK ((((id = public.current_company_id()) AND (public."current_role"() = 'admin_company'::public.app_role)) OR public.is_super_admin()));


--
-- Name: companies companies insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "companies insert" ON public.companies FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: companies companies read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "companies read" ON public.companies FOR SELECT TO authenticated USING (((id = public.current_company_id()) OR public.is_super_admin()));


--
-- Name: contact_labels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_labels ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts contacts unit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "contacts unit" ON public.contacts TO authenticated USING ((((company_id = public.current_company_id()) AND ((public."current_role"() = 'admin_company'::public.app_role) OR public.has_matriz_access() OR ((unit_id IS NOT NULL) AND public.user_in_unit(unit_id)) OR public.can_read_contact(id))) OR public.is_super_admin())) WITH CHECK ((((company_id = public.current_company_id()) AND ((public."current_role"() = 'admin_company'::public.app_role) OR public.has_matriz_access() OR ((unit_id IS NOT NULL) AND public.user_in_unit(unit_id)) OR public.can_read_contact(id))) OR public.is_super_admin()));


--
-- Name: conversation_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversation_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: conversations conversations unit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "conversations unit" ON public.conversations TO authenticated USING (((unit_id IS NULL) OR public.user_in_unit(unit_id) OR public.is_super_admin())) WITH CHECK (((unit_id IS NULL) OR public.user_in_unit(unit_id) OR public.is_super_admin()));


--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: departments departments manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "departments manage" ON public.departments TO authenticated USING ((((EXISTS ( SELECT 1
   FROM public.units u
  WHERE ((u.id = departments.unit_id) AND (u.company_id = public.current_company_id())))) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin())) WITH CHECK ((((EXISTS ( SELECT 1
   FROM public.units u
  WHERE ((u.id = departments.unit_id) AND (u.company_id = public.current_company_id())))) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin()));


--
-- Name: departments departments read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "departments read" ON public.departments FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.units u
  WHERE ((u.id = departments.unit_id) AND (u.company_id = public.current_company_id())))) OR public.is_super_admin()));


--
-- Name: labels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

--
-- Name: labels labels manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "labels manage" ON public.labels TO authenticated USING ((((company_id = public.current_company_id()) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin())) WITH CHECK ((((company_id = public.current_company_id()) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin()));


--
-- Name: labels labels read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "labels read" ON public.labels FOR SELECT TO authenticated USING (((company_id = public.current_company_id()) OR public.is_super_admin()));


--
-- Name: lead_routing_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_routing_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages via conv; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "messages via conv" ON public.messages TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.unit_id IS NULL) OR public.user_in_unit(c.unit_id))))) OR public.is_super_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.unit_id IS NULL) OR public.user_in_unit(c.unit_id))))) OR public.is_super_admin()));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunity_notes opportunity notes delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "opportunity notes delete" ON public.opportunity_notes FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: opportunity_notes opportunity notes insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "opportunity notes insert" ON public.opportunity_notes FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.opportunities o
  WHERE ((o.id = opportunity_notes.opportunity_id) AND (((o.unit_id IS NULL) AND ((public."current_role"() = 'admin_company'::public.app_role) OR public.has_matriz_access())) OR ((o.unit_id IS NOT NULL) AND public.user_in_unit(o.unit_id)))))) AND (auth.uid() = user_id)));


--
-- Name: opportunity_notes opportunity notes select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "opportunity notes select" ON public.opportunity_notes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.opportunities o
  WHERE ((o.id = opportunity_notes.opportunity_id) AND (((o.unit_id IS NULL) AND ((public."current_role"() = 'admin_company'::public.app_role) OR public.has_matriz_access())) OR ((o.unit_id IS NOT NULL) AND public.user_in_unit(o.unit_id)))))));


--
-- Name: opportunity_notes opportunity notes update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "opportunity notes update" ON public.opportunity_notes FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: opportunity_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.opportunity_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: opportunities opps unit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "opps unit" ON public.opportunities TO authenticated USING (((unit_id IS NULL) OR public.user_in_unit(unit_id) OR public.is_super_admin())) WITH CHECK (((unit_id IS NULL) OR public.user_in_unit(unit_id) OR public.is_super_admin()));


--
-- Name: pipeline_stages pipeline unit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pipeline unit" ON public.pipeline_stages TO authenticated USING ((((unit_id IS NULL) AND ((public."current_role"() = 'admin_company'::public.app_role) OR public.has_matriz_access())) OR ((unit_id IS NOT NULL) AND public.user_in_unit(unit_id)))) WITH CHECK ((((unit_id IS NULL) AND ((public."current_role"() = 'admin_company'::public.app_role) OR public.has_matriz_access())) OR ((unit_id IS NOT NULL) AND public.user_in_unit(unit_id))));


--
-- Name: pipeline_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_stages pipeline_stages manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pipeline_stages manage" ON public.pipeline_stages TO authenticated USING ((((EXISTS ( SELECT 1
   FROM public.pipelines p
  WHERE ((p.id = pipeline_stages.pipeline_id) AND (p.company_id = public.current_company_id())))) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin())) WITH CHECK ((((EXISTS ( SELECT 1
   FROM public.pipelines p
  WHERE ((p.id = pipeline_stages.pipeline_id) AND (p.company_id = public.current_company_id())))) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin()));


--
-- Name: pipeline_stages pipeline_stages read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pipeline_stages read" ON public.pipeline_stages FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pipelines p
  WHERE ((p.id = pipeline_stages.pipeline_id) AND (p.company_id = public.current_company_id())))) OR public.is_super_admin()));


--
-- Name: pipelines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

--
-- Name: pipelines pipelines manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pipelines manage" ON public.pipelines TO authenticated USING ((((company_id = public.current_company_id()) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin())) WITH CHECK ((((company_id = public.current_company_id()) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin()));


--
-- Name: pipelines pipelines read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pipelines read" ON public.pipelines FOR SELECT TO authenticated USING (((company_id = public.current_company_id()) OR public.is_super_admin()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles admin manage" ON public.profiles TO authenticated USING ((((public."current_role"() = 'admin_company'::public.app_role) AND (company_id = public.current_company_id())) OR public.is_super_admin())) WITH CHECK ((((public."current_role"() = 'admin_company'::public.app_role) AND (company_id = public.current_company_id())) OR public.is_super_admin()));


--
-- Name: profiles profiles self read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR (company_id = public.current_company_id()) OR public.is_super_admin()));


--
-- Name: profiles profiles self update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: quick_message_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quick_message_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: quick_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quick_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: resolution_reasons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resolution_reasons ENABLE ROW LEVEL SECURITY;

--
-- Name: resolution_reasons resolution_reasons company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "resolution_reasons company" ON public.resolution_reasons TO authenticated USING (((company_id = public.current_company_id()) OR (company_id IS NULL))) WITH CHECK ((company_id = public.current_company_id()));


--
-- Name: resolution_reasons resolution_reasons manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "resolution_reasons manage" ON public.resolution_reasons TO authenticated USING ((((company_id = public.current_company_id()) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin())) WITH CHECK ((((company_id = public.current_company_id()) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin()));


--
-- Name: resolution_reasons resolution_reasons read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "resolution_reasons read" ON public.resolution_reasons FOR SELECT TO authenticated USING (((company_id = public.current_company_id()) OR public.is_super_admin()));


--
-- Name: sales_coach_analyses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_coach_analyses ENABLE ROW LEVEL SECURITY;

--
-- Name: session_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks unit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tasks unit" ON public.tasks TO authenticated USING (((unit_id IS NULL) OR public.user_in_unit(unit_id) OR public.is_super_admin())) WITH CHECK (((unit_id IS NULL) OR public.user_in_unit(unit_id) OR public.is_super_admin()));


--
-- Name: units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

--
-- Name: units units admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "units admin manage" ON public.units TO authenticated USING ((((company_id = public.current_company_id()) AND (public."current_role"() = 'admin_company'::public.app_role)) OR public.is_super_admin())) WITH CHECK ((((company_id = public.current_company_id()) AND (public."current_role"() = 'admin_company'::public.app_role)) OR public.is_super_admin()));


--
-- Name: units units read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "units read" ON public.units FOR SELECT TO authenticated USING (((company_id = public.current_company_id()) OR public.is_super_admin()));


--
-- Name: user_departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_departments ENABLE ROW LEVEL SECURITY;

--
-- Name: user_departments user_departments admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_departments admin manage" ON public.user_departments TO authenticated USING (((public."current_role"() = 'admin_company'::public.app_role) OR public.is_super_admin())) WITH CHECK (((public."current_role"() = 'admin_company'::public.app_role) OR public.is_super_admin()));


--
-- Name: user_departments user_departments read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_departments read" ON public.user_departments FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_departments.user_id) AND (p.company_id = public.current_company_id())))) OR public.is_super_admin()));


--
-- Name: user_units; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_units ENABLE ROW LEVEL SECURITY;

--
-- Name: user_units user_units admin manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_units admin manage" ON public.user_units TO authenticated USING (((public."current_role"() = 'admin_company'::public.app_role) OR public.is_super_admin())) WITH CHECK (((public."current_role"() = 'admin_company'::public.app_role) OR public.is_super_admin()));


--
-- Name: user_units user_units read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_units read" ON public.user_units FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = user_units.user_id) AND (p.company_id = public.current_company_id())))) OR public.is_super_admin()));


--
-- Name: whatsapp_instances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_instances whatsapp_instances manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "whatsapp_instances manage" ON public.whatsapp_instances TO authenticated USING ((((company_id = public.current_company_id()) AND (public."current_role"() = 'admin_company'::public.app_role)) OR public.is_super_admin())) WITH CHECK ((((company_id = public.current_company_id()) AND (public."current_role"() = 'admin_company'::public.app_role)) OR public.is_super_admin()));


--
-- Name: whatsapp_instances whatsapp_instances read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "whatsapp_instances read" ON public.whatsapp_instances FOR SELECT TO authenticated USING (((company_id = public.current_company_id()) OR public.is_super_admin()));


--
-- Name: whatsapp_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_templates whatsapp_templates manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "whatsapp_templates manage" ON public.whatsapp_templates TO authenticated USING ((((company_id = public.current_company_id()) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin())) WITH CHECK ((((company_id = public.current_company_id()) AND (public."current_role"() = ANY (ARRAY['admin_company'::public.app_role, 'manager'::public.app_role]))) OR public.is_super_admin()));


--
-- Name: whatsapp_templates whatsapp_templates read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "whatsapp_templates read" ON public.whatsapp_templates FOR SELECT TO authenticated USING (((company_id = public.current_company_id()) OR public.is_super_admin()));


--
-- PostgreSQL database dump complete
--

