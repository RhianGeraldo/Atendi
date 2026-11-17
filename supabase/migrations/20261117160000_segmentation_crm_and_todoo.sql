-- ==============================================================================
-- Migration: Add CRM and Todoo filters to mass campaign audience segmentation
-- ==============================================================================

DROP FUNCTION IF EXISTS public.get_campaign_audience_contacts(UUID, JSONB, INT, INT);
DROP FUNCTION IF EXISTS public.count_campaign_audience_contacts(UUID, JSONB);

-- 1. RPC: GET CAMPAIGN AUDIENCE CONTACTS (WITH GENERAL, CRM & TODOO FILTERS)
CREATE OR REPLACE FUNCTION public.get_campaign_audience_contacts(
    p_company_id UUID,
    p_filters JSONB DEFAULT '{}'::jsonb,
    p_limit INT DEFAULT 500,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    name TEXT,
    phone TEXT,
    email TEXT,
    unit_id UUID,
    tags TEXT[],
    contact_type TEXT,
    source TEXT,
    last_interaction TIMESTAMPTZ,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inactivity_days INT;
    v_tags TEXT[];
    v_excluded_tags TEXT[];
    v_unit_ids UUID[];
    v_only_without_open_conversations BOOLEAN;
    v_contact_type TEXT;
    v_sources TEXT[];
    v_ddds TEXT[];
    v_created_after TIMESTAMPTZ;
    v_created_before TIMESTAMPTZ;
    v_inactivity_cutoff TIMESTAMPTZ;

    -- CRM Filters
    v_crm_enabled BOOLEAN := false;
    v_crm_mode TEXT := 'with';
    v_crm_pipeline_ids UUID[];
    v_crm_stage_ids UUID[];
    v_crm_statuses TEXT[];

    -- Todoo Filters
    v_todoo_enabled BOOLEAN := false;
    v_todoo_mode TEXT := 'with';
    v_todoo_campaign_ids UUID[];
    v_todoo_stage_ids UUID[];
    v_todoo_lead_statuses TEXT[];
BEGIN
    -- Inactivity
    IF (p_filters->>'inactivity_days') IS NOT NULL 
       AND (p_filters->>'inactivity_days') <> '' 
       AND (p_filters->>'inactivity_days') ~ '^[0-9]+$' THEN
        v_inactivity_days := (p_filters->>'inactivity_days')::INT;
    END IF;

    -- Tags to include
    IF jsonb_typeof(p_filters->'tags') = 'array' AND jsonb_array_length(p_filters->'tags') > 0 THEN
        SELECT array_agg(value::text) INTO v_tags FROM jsonb_array_elements_text(p_filters->'tags');
    END IF;

    -- Tags to exclude
    IF jsonb_typeof(p_filters->'excluded_tags') = 'array' AND jsonb_array_length(p_filters->'excluded_tags') > 0 THEN
        SELECT array_agg(value::text) INTO v_excluded_tags FROM jsonb_array_elements_text(p_filters->'excluded_tags');
    END IF;

    -- Units
    IF jsonb_typeof(p_filters->'unit_ids') = 'array' AND jsonb_array_length(p_filters->'unit_ids') > 0 THEN
        SELECT array_agg(value::uuid) INTO v_unit_ids FROM jsonb_array_elements_text(p_filters->'unit_ids');
    END IF;

    -- Open conversations check
    v_only_without_open_conversations := COALESCE((p_filters->>'only_without_open_conversations')::BOOLEAN, false);

    -- Contact type ('all', 'lead', 'client')
    v_contact_type := NULLIF(trim(p_filters->>'contact_type'), '');

    -- Sources (origem)
    IF jsonb_typeof(p_filters->'sources') = 'array' AND jsonb_array_length(p_filters->'sources') > 0 THEN
        SELECT array_agg(value::text) INTO v_sources FROM jsonb_array_elements_text(p_filters->'sources');
    END IF;

    -- DDDs
    IF jsonb_typeof(p_filters->'ddds') = 'array' AND jsonb_array_length(p_filters->'ddds') > 0 THEN
        SELECT array_agg(value::text) INTO v_ddds FROM jsonb_array_elements_text(p_filters->'ddds');
    END IF;

    -- Date range
    IF (p_filters->>'created_after') IS NOT NULL AND (p_filters->>'created_after') <> '' THEN
        BEGIN
            v_created_after := (p_filters->>'created_after')::TIMESTAMPTZ;
        EXCEPTION WHEN OTHERS THEN
            v_created_after := NULL;
        END;
    END IF;

    IF (p_filters->>'created_before') IS NOT NULL AND (p_filters->>'created_before') <> '' THEN
        BEGIN
            v_created_before := (p_filters->>'created_before')::TIMESTAMPTZ;
        EXCEPTION WHEN OTHERS THEN
            v_created_before := NULL;
        END;
    END IF;

    IF v_inactivity_days IS NOT NULL AND v_inactivity_days > 0 THEN
        v_inactivity_cutoff := now() - (v_inactivity_days || ' days')::INTERVAL;
    END IF;

    -- CRM Filters
    IF (p_filters->>'crm_enabled') IS NOT NULL THEN
        v_crm_enabled := (p_filters->>'crm_enabled')::BOOLEAN;
    END IF;
    IF (p_filters->>'crm_mode') IS NOT NULL AND (p_filters->>'crm_mode') <> '' THEN
        v_crm_mode := lower(trim(p_filters->>'crm_mode'));
    END IF;
    IF jsonb_typeof(p_filters->'crm_pipeline_ids') = 'array' AND jsonb_array_length(p_filters->'crm_pipeline_ids') > 0 THEN
        SELECT array_agg(value::uuid) INTO v_crm_pipeline_ids FROM jsonb_array_elements_text(p_filters->'crm_pipeline_ids');
    END IF;
    IF jsonb_typeof(p_filters->'crm_stage_ids') = 'array' AND jsonb_array_length(p_filters->'crm_stage_ids') > 0 THEN
        SELECT array_agg(value::uuid) INTO v_crm_stage_ids FROM jsonb_array_elements_text(p_filters->'crm_stage_ids');
    END IF;
    IF jsonb_typeof(p_filters->'crm_statuses') = 'array' AND jsonb_array_length(p_filters->'crm_statuses') > 0 THEN
        SELECT array_agg(value::text) INTO v_crm_statuses FROM jsonb_array_elements_text(p_filters->'crm_statuses');
    END IF;

    -- Todoo Filters
    IF (p_filters->>'todoo_enabled') IS NOT NULL THEN
        v_todoo_enabled := (p_filters->>'todoo_enabled')::BOOLEAN;
    END IF;
    IF (p_filters->>'todoo_mode') IS NOT NULL AND (p_filters->>'todoo_mode') <> '' THEN
        v_todoo_mode := lower(trim(p_filters->>'todoo_mode'));
    END IF;
    IF jsonb_typeof(p_filters->'todoo_campaign_ids') = 'array' AND jsonb_array_length(p_filters->'todoo_campaign_ids') > 0 THEN
        SELECT array_agg(value::uuid) INTO v_todoo_campaign_ids FROM jsonb_array_elements_text(p_filters->'todoo_campaign_ids');
    END IF;
    IF jsonb_typeof(p_filters->'todoo_stage_ids') = 'array' AND jsonb_array_length(p_filters->'todoo_stage_ids') > 0 THEN
        SELECT array_agg(value::uuid) INTO v_todoo_stage_ids FROM jsonb_array_elements_text(p_filters->'todoo_stage_ids');
    END IF;
    IF jsonb_typeof(p_filters->'todoo_lead_statuses') = 'array' AND jsonb_array_length(p_filters->'todoo_lead_statuses') > 0 THEN
        SELECT array_agg(value::text) INTO v_todoo_lead_statuses FROM jsonb_array_elements_text(p_filters->'todoo_lead_statuses');
    END IF;

    RETURN QUERY
    WITH latest_convs AS (
        SELECT 
            c.contact_id,
            max(c.last_message_at) AS max_last_message_at,
            bool_or(c.status IN ('active', 'waiting')) AS has_open_conv
        FROM public.conversations c
        GROUP BY c.contact_id
    )
    SELECT 
        ct.id,
        ct.name,
        ct.phone,
        ct.email,
        ct.unit_id,
        ct.tags,
        ct.contact_type,
        ct.source,
        COALESCE(lc.max_last_message_at, ct.created_at) AS last_interaction,
        ct.created_at
    FROM public.contacts ct
    LEFT JOIN latest_convs lc ON lc.contact_id = ct.id
    WHERE ct.company_id = p_company_id
      AND ct.is_blocked = false
      AND ct.merged_into_id IS NULL
      AND ct.phone IS NOT NULL
      AND trim(ct.phone) <> ''
      
      -- Unit filter
      AND (v_unit_ids IS NULL OR ct.unit_id = ANY(v_unit_ids))
      
      -- Contact type filter (lead vs client)
      AND (
          v_contact_type IS NULL 
          OR v_contact_type = 'all' 
          OR ct.contact_type = v_contact_type
      )
      
      -- Unified tags (checks ct.tags array OR contact_labels table)
      AND (
          v_tags IS NULL 
          OR ct.tags && v_tags
          OR EXISTS (
              SELECT 1 
              FROM public.contact_labels cl
              JOIN public.labels l ON l.id = cl.label_id
              WHERE cl.contact_id = ct.id 
                AND l.name = ANY(v_tags)
          )
      )
      
      -- Excluded tags (must NOT be in ct.tags AND must NOT be in contact_labels)
      AND (
          v_excluded_tags IS NULL 
          OR (
              NOT (ct.tags && v_excluded_tags)
              AND NOT EXISTS (
                  SELECT 1 
                  FROM public.contact_labels cl
                  JOIN public.labels l ON l.id = cl.label_id
                  WHERE cl.contact_id = ct.id 
                    AND l.name = ANY(v_excluded_tags)
              )
          )
      )
      
      -- Sources filter
      AND (
          v_sources IS NULL 
          OR ct.source = ANY(v_sources)
      )
      
      -- DDDs filter
      AND (
          v_ddds IS NULL 
          OR substring(regexp_replace(ct.phone, '^55', '') from 1 for 2) = ANY(v_ddds)
      )
      
      -- Created date range
      AND (v_created_after IS NULL OR ct.created_at >= v_created_after)
      AND (v_created_before IS NULL OR ct.created_at <= v_created_before)
      
      -- Inactivity cutoff
      AND (
          v_inactivity_cutoff IS NULL 
          OR COALESCE(lc.max_last_message_at, ct.created_at) <= v_inactivity_cutoff
      )
      
      -- Open conversation avoidance
      AND (
          NOT v_only_without_open_conversations 
          OR COALESCE(lc.has_open_conv, false) = false
      )

      -- CRM Filters (Oportunidades)
      AND (
          NOT v_crm_enabled
          OR (
              v_crm_mode = 'without'
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.opportunities opp
                  LEFT JOIN public.pipeline_stages ps ON ps.id = opp.stage_id
                  WHERE opp.contact_id = ct.id
                    AND opp.company_id = p_company_id
                    AND (v_crm_pipeline_ids IS NULL OR ps.pipeline_id = ANY(v_crm_pipeline_ids))
                    AND (v_crm_stage_ids IS NULL OR opp.stage_id = ANY(v_crm_stage_ids))
                    AND (v_crm_statuses IS NULL OR opp.status::text = ANY(v_crm_statuses))
              )
          )
          OR (
              v_crm_mode <> 'without'
              AND EXISTS (
                  SELECT 1
                  FROM public.opportunities opp
                  LEFT JOIN public.pipeline_stages ps ON ps.id = opp.stage_id
                  WHERE opp.contact_id = ct.id
                    AND opp.company_id = p_company_id
                    AND (v_crm_pipeline_ids IS NULL OR ps.pipeline_id = ANY(v_crm_pipeline_ids))
                    AND (v_crm_stage_ids IS NULL OR opp.stage_id = ANY(v_crm_stage_ids))
                    AND (v_crm_statuses IS NULL OR opp.status::text = ANY(v_crm_statuses))
              )
          )
      )

      -- Todoo Filters (Cadência & Ações Comerciais)
      AND (
          NOT v_todoo_enabled
          OR (
              v_todoo_mode = 'without'
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.todoo_leads tl
                  WHERE tl.contact_id = ct.id
                    AND tl.company_id = p_company_id
                    AND (v_todoo_campaign_ids IS NULL OR tl.campaign_id = ANY(v_todoo_campaign_ids))
                    AND (v_todoo_stage_ids IS NULL OR tl.stage_id = ANY(v_todoo_stage_ids))
                    AND (v_todoo_lead_statuses IS NULL OR tl.status = ANY(v_todoo_lead_statuses))
              )
          )
          OR (
              v_todoo_mode <> 'without'
              AND EXISTS (
                  SELECT 1
                  FROM public.todoo_leads tl
                  WHERE tl.contact_id = ct.id
                    AND tl.company_id = p_company_id
                    AND (v_todoo_campaign_ids IS NULL OR tl.campaign_id = ANY(v_todoo_campaign_ids))
                    AND (v_todoo_stage_ids IS NULL OR tl.stage_id = ANY(v_todoo_stage_ids))
                    AND (v_todoo_lead_statuses IS NULL OR tl.status = ANY(v_todoo_lead_statuses))
              )
          )
      )
    ORDER BY COALESCE(lc.max_last_message_at, ct.created_at) ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- 2. RPC: COUNT CAMPAIGN AUDIENCE CONTACTS (FAST COUNT WITH ADVANCED SEGMENTATION)
CREATE OR REPLACE FUNCTION public.count_campaign_audience_contacts(
    p_company_id UUID,
    p_filters JSONB DEFAULT '{}'::jsonb
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inactivity_days INT;
    v_tags TEXT[];
    v_excluded_tags TEXT[];
    v_unit_ids UUID[];
    v_only_without_open_conversations BOOLEAN;
    v_contact_type TEXT;
    v_sources TEXT[];
    v_ddds TEXT[];
    v_created_after TIMESTAMPTZ;
    v_created_before TIMESTAMPTZ;
    v_inactivity_cutoff TIMESTAMPTZ;

    -- CRM Filters
    v_crm_enabled BOOLEAN := false;
    v_crm_mode TEXT := 'with';
    v_crm_pipeline_ids UUID[];
    v_crm_stage_ids UUID[];
    v_crm_statuses TEXT[];

    -- Todoo Filters
    v_todoo_enabled BOOLEAN := false;
    v_todoo_mode TEXT := 'with';
    v_todoo_campaign_ids UUID[];
    v_todoo_stage_ids UUID[];
    v_todoo_lead_statuses TEXT[];

    v_count BIGINT;
BEGIN
    -- Inactivity
    IF (p_filters->>'inactivity_days') IS NOT NULL 
       AND (p_filters->>'inactivity_days') <> '' 
       AND (p_filters->>'inactivity_days') ~ '^[0-9]+$' THEN
        v_inactivity_days := (p_filters->>'inactivity_days')::INT;
    END IF;

    -- Tags to include
    IF jsonb_typeof(p_filters->'tags') = 'array' AND jsonb_array_length(p_filters->'tags') > 0 THEN
        SELECT array_agg(value::text) INTO v_tags FROM jsonb_array_elements_text(p_filters->'tags');
    END IF;

    -- Tags to exclude
    IF jsonb_typeof(p_filters->'excluded_tags') = 'array' AND jsonb_array_length(p_filters->'excluded_tags') > 0 THEN
        SELECT array_agg(value::text) INTO v_excluded_tags FROM jsonb_array_elements_text(p_filters->'excluded_tags');
    END IF;

    -- Units
    IF jsonb_typeof(p_filters->'unit_ids') = 'array' AND jsonb_array_length(p_filters->'unit_ids') > 0 THEN
        SELECT array_agg(value::uuid) INTO v_unit_ids FROM jsonb_array_elements_text(p_filters->'unit_ids');
    END IF;

    -- Open conversations check
    v_only_without_open_conversations := COALESCE((p_filters->>'only_without_open_conversations')::BOOLEAN, false);

    -- Contact type ('all', 'lead', 'client')
    v_contact_type := NULLIF(trim(p_filters->>'contact_type'), '');

    -- Sources (origem)
    IF jsonb_typeof(p_filters->'sources') = 'array' AND jsonb_array_length(p_filters->'sources') > 0 THEN
        SELECT array_agg(value::text) INTO v_sources FROM jsonb_array_elements_text(p_filters->'sources');
    END IF;

    -- DDDs
    IF jsonb_typeof(p_filters->'ddds') = 'array' AND jsonb_array_length(p_filters->'ddds') > 0 THEN
        SELECT array_agg(value::text) INTO v_ddds FROM jsonb_array_elements_text(p_filters->'ddds');
    END IF;

    -- Date range
    IF (p_filters->>'created_after') IS NOT NULL AND (p_filters->>'created_after') <> '' THEN
        BEGIN
            v_created_after := (p_filters->>'created_after')::TIMESTAMPTZ;
        EXCEPTION WHEN OTHERS THEN
            v_created_after := NULL;
        END;
    END IF;

    IF (p_filters->>'created_before') IS NOT NULL AND (p_filters->>'created_before') <> '' THEN
        BEGIN
            v_created_before := (p_filters->>'created_before')::TIMESTAMPTZ;
        EXCEPTION WHEN OTHERS THEN
            v_created_before := NULL;
        END;
    END IF;

    IF v_inactivity_days IS NOT NULL AND v_inactivity_days > 0 THEN
        v_inactivity_cutoff := now() - (v_inactivity_days || ' days')::INTERVAL;
    END IF;

    -- CRM Filters
    IF (p_filters->>'crm_enabled') IS NOT NULL THEN
        v_crm_enabled := (p_filters->>'crm_enabled')::BOOLEAN;
    END IF;
    IF (p_filters->>'crm_mode') IS NOT NULL AND (p_filters->>'crm_mode') <> '' THEN
        v_crm_mode := lower(trim(p_filters->>'crm_mode'));
    END IF;
    IF jsonb_typeof(p_filters->'crm_pipeline_ids') = 'array' AND jsonb_array_length(p_filters->'crm_pipeline_ids') > 0 THEN
        SELECT array_agg(value::uuid) INTO v_crm_pipeline_ids FROM jsonb_array_elements_text(p_filters->'crm_pipeline_ids');
    END IF;
    IF jsonb_typeof(p_filters->'crm_stage_ids') = 'array' AND jsonb_array_length(p_filters->'crm_stage_ids') > 0 THEN
        SELECT array_agg(value::uuid) INTO v_crm_stage_ids FROM jsonb_array_elements_text(p_filters->'crm_stage_ids');
    END IF;
    IF jsonb_typeof(p_filters->'crm_statuses') = 'array' AND jsonb_array_length(p_filters->'crm_statuses') > 0 THEN
        SELECT array_agg(value::text) INTO v_crm_statuses FROM jsonb_array_elements_text(p_filters->'crm_statuses');
    END IF;

    -- Todoo Filters
    IF (p_filters->>'todoo_enabled') IS NOT NULL THEN
        v_todoo_enabled := (p_filters->>'todoo_enabled')::BOOLEAN;
    END IF;
    IF (p_filters->>'todoo_mode') IS NOT NULL AND (p_filters->>'todoo_mode') <> '' THEN
        v_todoo_mode := lower(trim(p_filters->>'todoo_mode'));
    END IF;
    IF jsonb_typeof(p_filters->'todoo_campaign_ids') = 'array' AND jsonb_array_length(p_filters->'todoo_campaign_ids') > 0 THEN
        SELECT array_agg(value::uuid) INTO v_todoo_campaign_ids FROM jsonb_array_elements_text(p_filters->'todoo_campaign_ids');
    END IF;
    IF jsonb_typeof(p_filters->'todoo_stage_ids') = 'array' AND jsonb_array_length(p_filters->'todoo_stage_ids') > 0 THEN
        SELECT array_agg(value::uuid) INTO v_todoo_stage_ids FROM jsonb_array_elements_text(p_filters->'todoo_stage_ids');
    END IF;
    IF jsonb_typeof(p_filters->'todoo_lead_statuses') = 'array' AND jsonb_array_length(p_filters->'todoo_lead_statuses') > 0 THEN
        SELECT array_agg(value::text) INTO v_todoo_lead_statuses FROM jsonb_array_elements_text(p_filters->'todoo_lead_statuses');
    END IF;

    WITH latest_convs AS (
        SELECT 
            c.contact_id,
            max(c.last_message_at) AS max_last_message_at,
            bool_or(c.status IN ('active', 'waiting')) AS has_open_conv
        FROM public.conversations c
        GROUP BY c.contact_id
    )
    SELECT COUNT(*)
    INTO v_count
    FROM public.contacts ct
    LEFT JOIN latest_convs lc ON lc.contact_id = ct.id
    WHERE ct.company_id = p_company_id
      AND ct.is_blocked = false
      AND ct.merged_into_id IS NULL
      AND ct.phone IS NOT NULL
      AND trim(ct.phone) <> ''
      
      -- Unit filter
      AND (v_unit_ids IS NULL OR ct.unit_id = ANY(v_unit_ids))
      
      -- Contact type filter (lead vs client)
      AND (
          v_contact_type IS NULL 
          OR v_contact_type = 'all' 
          OR ct.contact_type = v_contact_type
      )
      
      -- Unified tags (checks ct.tags array OR contact_labels table)
      AND (
          v_tags IS NULL 
          OR ct.tags && v_tags
          OR EXISTS (
              SELECT 1 
              FROM public.contact_labels cl
              JOIN public.labels l ON l.id = cl.label_id
              WHERE cl.contact_id = ct.id 
                AND l.name = ANY(v_tags)
          )
      )
      
      -- Excluded tags (must NOT be in ct.tags AND must NOT be in contact_labels)
      AND (
          v_excluded_tags IS NULL 
          OR (
              NOT (ct.tags && v_excluded_tags)
              AND NOT EXISTS (
                  SELECT 1 
                  FROM public.contact_labels cl
                  JOIN public.labels l ON l.id = cl.label_id
                  WHERE cl.contact_id = ct.id 
                    AND l.name = ANY(v_excluded_tags)
              )
          )
      )
      
      -- Sources filter
      AND (
          v_sources IS NULL 
          OR ct.source = ANY(v_sources)
      )
      
      -- DDDs filter
      AND (
          v_ddds IS NULL 
          OR substring(regexp_replace(ct.phone, '^55', '') from 1 for 2) = ANY(v_ddds)
      )
      
      -- Created date range
      AND (v_created_after IS NULL OR ct.created_at >= v_created_after)
      AND (v_created_before IS NULL OR ct.created_at <= v_created_before)
      
      -- Inactivity cutoff
      AND (
          v_inactivity_cutoff IS NULL 
          OR COALESCE(lc.max_last_message_at, ct.created_at) <= v_inactivity_cutoff
      )
      
      -- Open conversation avoidance
      AND (
          NOT v_only_without_open_conversations 
          OR COALESCE(lc.has_open_conv, false) = false
      )

      -- CRM Filters (Oportunidades)
      AND (
          NOT v_crm_enabled
          OR (
              v_crm_mode = 'without'
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.opportunities opp
                  LEFT JOIN public.pipeline_stages ps ON ps.id = opp.stage_id
                  WHERE opp.contact_id = ct.id
                    AND opp.company_id = p_company_id
                    AND (v_crm_pipeline_ids IS NULL OR ps.pipeline_id = ANY(v_crm_pipeline_ids))
                    AND (v_crm_stage_ids IS NULL OR opp.stage_id = ANY(v_crm_stage_ids))
                    AND (v_crm_statuses IS NULL OR opp.status::text = ANY(v_crm_statuses))
              )
          )
          OR (
              v_crm_mode <> 'without'
              AND EXISTS (
                  SELECT 1
                  FROM public.opportunities opp
                  LEFT JOIN public.pipeline_stages ps ON ps.id = opp.stage_id
                  WHERE opp.contact_id = ct.id
                    AND opp.company_id = p_company_id
                    AND (v_crm_pipeline_ids IS NULL OR ps.pipeline_id = ANY(v_crm_pipeline_ids))
                    AND (v_crm_stage_ids IS NULL OR opp.stage_id = ANY(v_crm_stage_ids))
                    AND (v_crm_statuses IS NULL OR opp.status::text = ANY(v_crm_statuses))
              )
          )
      )

      -- Todoo Filters (Cadência & Ações Comerciais)
      AND (
          NOT v_todoo_enabled
          OR (
              v_todoo_mode = 'without'
              AND NOT EXISTS (
                  SELECT 1
                  FROM public.todoo_leads tl
                  WHERE tl.contact_id = ct.id
                    AND tl.company_id = p_company_id
                    AND (v_todoo_campaign_ids IS NULL OR tl.campaign_id = ANY(v_todoo_campaign_ids))
                    AND (v_todoo_stage_ids IS NULL OR tl.stage_id = ANY(v_todoo_stage_ids))
                    AND (v_todoo_lead_statuses IS NULL OR tl.status = ANY(v_todoo_lead_statuses))
              )
          )
          OR (
              v_todoo_mode <> 'without'
              AND EXISTS (
                  SELECT 1
                  FROM public.todoo_leads tl
                  WHERE tl.contact_id = ct.id
                    AND tl.company_id = p_company_id
                    AND (v_todoo_campaign_ids IS NULL OR tl.campaign_id = ANY(v_todoo_campaign_ids))
                    AND (v_todoo_stage_ids IS NULL OR tl.stage_id = ANY(v_todoo_stage_ids))
                    AND (v_todoo_lead_statuses IS NULL OR tl.status = ANY(v_todoo_lead_statuses))
              )
          )
      );

    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_audience_contacts(UUID, JSONB, INT, INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_campaign_audience_contacts(UUID, JSONB) TO authenticated, service_role;
