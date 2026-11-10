-- Migration: Ad Status (Ativo / Pausado) e Atividade Recente
-- Atualiza a função get_marketing_roi_analytics para incluir status, is_active e days_since_last_lead

CREATE OR REPLACE FUNCTION public.get_marketing_roi_analytics(
    p_company_id UUID,
    p_unit_id UUID DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL,
    p_source_app TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_total_leads BIGINT := 0;
    v_total_opps BIGINT := 0;
    v_won_deals BIGINT := 0;
    v_total_revenue NUMERIC(12,2) := 0;
    v_conversion_rate NUMERIC(5,2) := 0;
    v_ticket_medio NUMERIC(12,2) := 0;
    v_ads JSONB := '[]'::jsonb;
BEGIN
    -- 1. Métricas Globais (KPIs de topo)
    WITH filtered_leads AS (
        SELECT DISTINCT ON (al.contact_id, al.source_id)
            al.id,
            al.contact_id,
            al.source_id,
            al.unit_id,
            al.created_at
        FROM public.ad_leads al
        WHERE al.company_id = p_company_id
          AND (p_unit_id IS NULL OR al.unit_id = p_unit_id)
          AND (p_start_date IS NULL OR al.created_at >= p_start_date)
          AND (p_end_date IS NULL OR al.created_at <= p_end_date)
          AND (p_source_app IS NULL OR p_source_app = 'all' OR al.source_app = p_source_app)
    ),
    distinct_contacts AS (
        SELECT DISTINCT contact_id FROM filtered_leads
    ),
    matched_opps AS (
        SELECT 
            o.id,
            o.contact_id,
            o.status,
            COALESCE(o.value, 0) as value
        FROM public.opportunities o
        INNER JOIN distinct_contacts dc ON dc.contact_id = o.contact_id
    )
    SELECT
        COUNT(DISTINCT dc.contact_id),
        COUNT(DISTINCT mo.id),
        COUNT(DISTINCT CASE WHEN mo.status = 'won' THEN mo.id END),
        COALESCE(SUM(CASE WHEN mo.status = 'won' THEN mo.value ELSE 0 END), 0)
    INTO
        v_total_leads,
        v_total_opps,
        v_won_deals,
        v_total_revenue
    FROM distinct_contacts dc
    LEFT JOIN matched_opps mo ON mo.contact_id = dc.contact_id;

    IF v_total_leads > 0 THEN
        v_conversion_rate := ROUND((v_won_deals::NUMERIC / v_total_leads::NUMERIC) * 100, 2);
    END IF;

    IF v_won_deals > 0 THEN
        v_ticket_medio := ROUND(v_total_revenue / v_won_deals, 2);
    END IF;

    -- 2. Agregação por Anúncio Criativo
    WITH lead_ad_pairs AS (
        SELECT
            al.source_id,
            al.contact_id,
            al.unit_id,
            al.ad_title,
            al.ad_body,
            al.thumbnail_url,
            al.source_url,
            al.source_app,
            al.created_at
        FROM public.ad_leads al
        WHERE al.company_id = p_company_id
          AND al.source_id IS NOT NULL
          AND al.source_id <> ''
          AND (p_unit_id IS NULL OR al.unit_id = p_unit_id)
          AND (p_start_date IS NULL OR al.created_at >= p_start_date)
          AND (p_end_date IS NULL OR al.created_at <= p_end_date)
          AND (p_source_app IS NULL OR p_source_app = 'all' OR al.source_app = p_source_app)
    ),
    ad_opps AS (
        SELECT
            lap.source_id,
            COUNT(DISTINCT lap.contact_id) AS leads_count,
            COUNT(DISTINCT o.id) AS opportunities_count,
            COUNT(DISTINCT CASE WHEN o.status = 'won' THEN o.id END) AS won_count,
            COALESCE(SUM(CASE WHEN o.status = 'won' THEN o.value ELSE 0 END), 0) AS won_revenue,
            MIN(lap.created_at) AS first_lead_at,
            MAX(lap.created_at) AS last_lead_at,
            -- Metadados representativos do criativo
            MAX(COALESCE(mac.ad_name, lap.ad_title, 'Anúncio sem título')) AS ad_title,
            MAX(COALESCE(mac.ad_body, lap.ad_body, '')) AS ad_body,
            MAX(COALESCE(mac.thumbnail_url, lap.thumbnail_url, '')) AS thumbnail_url,
            MAX(COALESCE(mac.source_url, lap.source_url, '')) AS source_url,
            MAX(COALESCE(mac.source_app, lap.source_app, 'instagram')) AS source_app,
            MAX(mac.campaign_name) AS campaign_name,
            MAX(mac.adset_name) AS adset_name,
            MAX(mac.status) AS custom_status
        FROM lead_ad_pairs lap
        LEFT JOIN public.meta_ads_cache mac ON mac.ad_id = lap.source_id
        LEFT JOIN public.opportunities o ON o.contact_id = lap.contact_id
        GROUP BY lap.source_id
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'source_id', ao.source_id,
            'ad_title', ao.ad_title,
            'ad_body', ao.ad_body,
            'thumbnail_url', ao.thumbnail_url,
            'source_url', ao.source_url,
            'source_app', ao.source_app,
            'campaign_name', ao.campaign_name,
            'adset_name', ao.adset_name,
            'status', COALESCE(ao.custom_status, CASE WHEN ao.last_lead_at >= (NOW() - INTERVAL '7 days') THEN 'ACTIVE' ELSE 'PAUSED' END),
            'is_active', COALESCE(ao.custom_status = 'ACTIVE', ao.last_lead_at >= (NOW() - INTERVAL '7 days')),
            'days_since_last_lead', GREATEST(0, ROUND(EXTRACT(EPOCH FROM (NOW() - ao.last_lead_at)) / 86400)),
            'leads_count', ao.leads_count,
            'opportunities_count', ao.opportunities_count,
            'won_count', ao.won_count,
            'won_revenue', ao.won_revenue,
            'conversion_rate', CASE WHEN ao.leads_count > 0 THEN ROUND((ao.won_count::NUMERIC / ao.leads_count::NUMERIC) * 100, 2) ELSE 0 END,
            'ticket_medio', CASE WHEN ao.won_count > 0 THEN ROUND(ao.won_revenue / ao.won_count, 2) ELSE 0 END,
            'first_lead_at', ao.first_lead_at,
            'last_lead_at', ao.last_lead_at
        )
        ORDER BY ao.won_revenue DESC, ao.leads_count DESC
    )
    INTO v_ads
    FROM ad_opps ao;

    v_result := jsonb_build_object(
        'kpis', jsonb_build_object(
            'total_leads', v_total_leads,
            'total_opportunities', v_total_opps,
            'total_won_deals', v_won_deals,
            'total_won_revenue', v_total_revenue,
            'conversion_rate', v_conversion_rate,
            'ticket_medio', v_ticket_medio
        ),
        'ads', COALESCE(v_ads, '[]'::jsonb)
    );

    RETURN v_result;
END;
$$;
