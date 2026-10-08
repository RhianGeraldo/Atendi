export type TodooCampaignType =
  | 'retention_saldo'
  | 'upsell_zones'
  | 'reactivation'
  | 'mgm_referral'
  | 'quote_followup'
  | 'birthday'
  | 'custom';

export type TodooSourceType = 'internal_crm' | 'erp_import' | 'manual';

export type TodooCampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export type TodooDistributionMode = 'round_robin' | 'last_agent' | 'fixed_user';

export type TodooLeadStatus =
  | 'pending'
  | 'contacted'
  | 'scheduled'
  | 'quoted'
  | 'won'
  | 'lost'
  | 'callback';

export type TodooOutcomeType = 'won' | 'scheduled' | 'quoted' | 'callback' | 'lost';

export interface TodooCampaign {
  id: string;
  company_id: string;
  unit_id: string | null;
  title: string;
  description: string | null;
  type: TodooCampaignType;
  source_type: TodooSourceType;
  status: TodooCampaignStatus;
  message_template: string | null;
  offer_details: string | null;
  sla_hours: number;
  redistribute_on_sla_breach: boolean;
  distribution_mode: TodooDistributionMode;
  target_count: number;
  target_revenue: number;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Campos calculados / agregados
  total_leads?: number;
  completed_leads?: number;
  won_leads?: number;
  won_revenue?: number;
}

export interface TodooLead {
  id: string;
  campaign_id: string;
  company_id: string;
  unit_id: string | null;
  contact_id: string | null;
  contact_name: string;
  contact_phone: string;
  assigned_user_id: string | null;
  assigned_at: string;
  sla_deadline: string | null;
  sla_breached: boolean;
  status: TodooLeadStatus;
  custom_fields: Record<string, any>;
  first_contact_at: string | null;
  last_interaction_at: string | null;
  outcome_type: TodooOutcomeType | null;
  outcome_notes: string | null;
  outcome_value: number;
  callback_scheduled_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;

  // Relacionamentos carregados
  assigned_user?: {
    id: string;
    name: string;
    avatar_url?: string | null;
  } | null;
  campaign?: {
    id: string;
    title: string;
    type: TodooCampaignType;
    message_template?: string | null;
    offer_details?: string | null;
  } | null;
}

export interface TodooEvent {
  id: string;
  lead_id: string;
  campaign_id: string;
  company_id: string;
  user_id: string | null;
  event_type: string;
  notes: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface TodooConsultantScore {
  userId: string;
  userName: string;
  userAvatar?: string | null;
  leadsAssigned: number;
  leadsContacted: number;
  leadsWon: number;
  leadsScheduled: number;
  revenueWon: number;
  slaBreaches: number;
  conversionRate: number;
  totalPoints: number;
}

export type TodooReferralStatus = 'pending' | 'contacted' | 'scheduled' | 'won' | 'lost';
export type TodooRewardStatus = 'pending' | 'granted' | 'claimed';

export interface TodooReferral {
  id: string;
  company_id: string;
  unit_id: string | null;
  referrer_contact_id: string | null;
  referrer_name: string;
  referrer_phone: string | null;
  referred_contact_id: string | null;
  referred_name: string;
  referred_phone: string;
  interested_service: string | null;
  voucher_code: string | null;
  voucher_value: number;
  captured_by_user_id: string | null;
  status: TodooReferralStatus;
  reward_status: TodooRewardStatus;
  reward_details: string | null;
  created_at: string;
  updated_at: string;

  captured_by?: {
    id: string;
    name: string;
    avatar_url?: string | null;
  } | null;
}

export interface TodooGoal {
  id: string;
  company_id: string;
  user_id: string;
  month_year: string;
  target_contacts: number;
  target_conversions: number;
  target_revenue: number;
  created_at: string;
  updated_at: string;

  user?: {
    id: string;
    name: string;
    avatar_url?: string | null;
  } | null;
  current_contacts?: number;
  current_conversions?: number;
  current_revenue?: number;
}
