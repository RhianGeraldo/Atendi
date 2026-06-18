export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      call_logs: {
        Row: {
          id: string
          wavoip_call_id: string
          whatsapp_instance_id: string | null
          contact_id: string | null
          assigned_agent_id: string | null
          company_id: string
          direction: 'INCOMING' | 'OUTGOING'
          status: 'RINGING' | 'CALLING' | 'NOT_ANSWERED' | 'ACTIVE' | 'ENDED' | 'REJECTED' | 'FAILED' | 'DISCONNECTED'
          started_at: string
          ended_at: string | null
          duration_seconds: number | null
          recording_url: string | null
          peer_number: string | null
          transcription: string | null
        }
        Insert: {
          id?: string
          wavoip_call_id: string
          whatsapp_instance_id?: string | null
          contact_id?: string | null
          assigned_agent_id?: string | null
          company_id: string
          direction: 'INCOMING' | 'OUTGOING'
          status: 'RINGING' | 'CALLING' | 'NOT_ANSWERED' | 'ACTIVE' | 'ENDED' | 'REJECTED' | 'FAILED' | 'DISCONNECTED'
          started_at?: string
          ended_at?: string | null
          duration_seconds?: number | null
          recording_url?: string | null
          peer_number?: string | null
          transcription?: string | null
        }
        Update: {
          id?: string
          wavoip_call_id?: string
          whatsapp_instance_id?: string | null
          contact_id?: string | null
          assigned_agent_id?: string | null
          company_id?: string
          direction?: 'INCOMING' | 'OUTGOING'
          status?: 'RINGING' | 'CALLING' | 'NOT_ANSWERED' | 'ACTIVE' | 'ENDED' | 'REJECTED' | 'FAILED' | 'DISCONNECTED'
          started_at?: string
          ended_at?: string | null
          duration_seconds?: number | null
          recording_url?: string | null
          peer_number?: string | null
          transcription?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          }
        ]
      },
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ad_leads: {
        Row: {
          ad_body: string | null
          ad_title: string | null
          company_id: string
          contact_id: string
          conversion_data: string | null
          conversion_source: string | null
          created_at: string
          ctwa_clid: string | null
          ctwa_payload: string | null
          id: string
          media_type: number | null
          source_app: string | null
          source_id: string | null
          source_url: string | null
          thumbnail_url: string | null
          unit_id: string | null
        }
        Insert: {
          ad_body?: string | null
          ad_title?: string | null
          company_id: string
          contact_id: string
          conversion_data?: string | null
          conversion_source?: string | null
          created_at?: string
          ctwa_clid?: string | null
          ctwa_payload?: string | null
          id?: string
          media_type?: number | null
          source_app?: string | null
          source_id?: string | null
          source_url?: string | null
          thumbnail_url?: string | null
          unit_id?: string | null
        }
        Update: {
          ad_body?: string | null
          ad_title?: string | null
          company_id?: string
          contact_id?: string
          conversion_data?: string | null
          conversion_source?: string | null
          created_at?: string
          ctwa_clid?: string | null
          ctwa_payload?: string | null
          id?: string
          media_type?: number | null
          source_app?: string | null
          source_id?: string | null
          source_url?: string | null
          thumbnail_url?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_leads_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          active_by_default: boolean
          ai_type: string
          allow_followup: boolean | null
          allow_handoff: boolean
          allow_opportunities: boolean
          allow_resolution: boolean
          allow_tasks: boolean
          allowed_agent_ids: string[] | null
          company_id: string
          created_at: string
          department_id: string | null
          description: string | null
          followup_interval_minutes: number | null
          followup_max_attempts: number | null
          followup_resolution_reason_id: string | null
          handoff_department_id: string | null
          id: string
          instance_id: string | null
          is_active: boolean
          is_main_agent: boolean
          max_tokens: number
          model: string
          name: string
          pipeline_id: string | null
          prompt_extra_info: string | null
          prompt_followup: string | null
          prompt_handoff: string | null
          prompt_instructions: string | null
          prompt_opportunities: string | null
          prompt_personality: string | null
          prompt_receive_handoff: string | null
          prompt_resolution: string | null
          prompt_tasks: string | null
          provider: string
          resolution_reason_id: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          active_by_default?: boolean
          ai_type: string
          allow_followup?: boolean | null
          allow_handoff?: boolean
          allow_opportunities?: boolean
          allow_resolution?: boolean
          allow_tasks?: boolean
          allowed_agent_ids?: string[] | null
          company_id: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          followup_interval_minutes?: number | null
          followup_max_attempts?: number | null
          followup_resolution_reason_id?: string | null
          handoff_department_id?: string | null
          id?: string
          instance_id?: string | null
          is_active?: boolean
          is_main_agent?: boolean
          max_tokens?: number
          model: string
          name: string
          pipeline_id?: string | null
          prompt_extra_info?: string | null
          prompt_followup?: string | null
          prompt_handoff?: string | null
          prompt_instructions?: string | null
          prompt_opportunities?: string | null
          prompt_personality?: string | null
          prompt_receive_handoff?: string | null
          prompt_resolution?: string | null
          prompt_tasks?: string | null
          provider?: string
          resolution_reason_id?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          active_by_default?: boolean
          ai_type?: string
          allow_followup?: boolean | null
          allow_handoff?: boolean
          allow_opportunities?: boolean
          allow_resolution?: boolean
          allow_tasks?: boolean
          allowed_agent_ids?: string[] | null
          company_id?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          followup_interval_minutes?: number | null
          followup_max_attempts?: number | null
          followup_resolution_reason_id?: string | null
          handoff_department_id?: string | null
          id?: string
          instance_id?: string | null
          is_active?: boolean
          is_main_agent?: boolean
          max_tokens?: number
          model?: string
          name?: string
          pipeline_id?: string | null
          prompt_extra_info?: string | null
          prompt_followup?: string | null
          prompt_handoff?: string | null
          prompt_instructions?: string | null
          prompt_opportunities?: string | null
          prompt_personality?: string | null
          prompt_receive_handoff?: string | null
          prompt_resolution?: string | null
          prompt_tasks?: string | null
          provider?: string
          resolution_reason_id?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_followup_resolution_reason_id_fkey"
            columns: ["followup_resolution_reason_id"]
            isOneToOne: false
            referencedRelation: "resolution_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_handoff_department_id_fkey"
            columns: ["handoff_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_resolution_reason_id_fkey"
            columns: ["resolution_reason_id"]
            isOneToOne: false
            referencedRelation: "resolution_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          ai_settings: Json | null
          business_hours: string | null
          created_at: string
          custom_variables: Json | null
          document: string | null
          evogo_global_token: string | null
          evogo_host: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
        }
        Insert: {
          address?: string | null
          ai_settings?: Json | null
          business_hours?: string | null
          created_at?: string
          custom_variables?: Json | null
          document?: string | null
          evogo_global_token?: string | null
          evogo_host?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
        }
        Update: {
          address?: string | null
          ai_settings?: Json | null
          business_hours?: string | null
          created_at?: string
          custom_variables?: Json | null
          document?: string | null
          evogo_global_token?: string | null
          evogo_host?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      contact_labels: {
        Row: {
          contact_id: string
          created_at: string | null
          label_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          label_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_labels_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_notes: {
        Row: {
          contact_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          contact_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          contact_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          source: string | null
          source_details: string | null
          tags: string[]
          unit_id: string | null
          whatsapp_lid: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          source?: string | null
          source_details?: string | null
          tags?: string[]
          unit_id?: string | null
          whatsapp_lid?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          source?: string | null
          source_details?: string | null
          tags?: string[]
          unit_id?: string | null
          whatsapp_lid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_sessions: {
        Row: {
          assigned_agent_id: string | null
          contact_id: string
          conversation_id: string
          created_at: string
          department_id: string | null
          id: string
          resolution_observation: string | null
          resolution_reason_id: string | null
          resolved_at: string | null
          started_at: string
          whatsapp_instance_id: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          contact_id: string
          conversation_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          resolution_observation?: string | null
          resolution_reason_id?: string | null
          resolved_at?: string | null
          started_at?: string
          whatsapp_instance_id?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          contact_id?: string
          conversation_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          resolution_observation?: string | null
          resolution_reason_id?: string | null
          resolved_at?: string | null
          started_at?: string
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_sessions_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_sessions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_sessions_resolution_reason_id_fkey"
            columns: ["resolution_reason_id"]
            isOneToOne: false
            referencedRelation: "resolution_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_sessions_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_active: boolean
          ai_agent_id: string | null
          ai_followup_count: number | null
          ai_last_followup_at: string | null
          assigned_agent_id: string | null
          channel: Database["public"]["Enums"]["channel_type"]
          contact_id: string
          current_session_id: string | null
          department_id: string | null
          id: string
          last_message_at: string
          last_message_preview: string | null
          resolution_observation: string | null
          resolution_reason_id: string | null
          resolved_at: string | null
          started_at: string
          status: Database["public"]["Enums"]["conversation_status"]
          tags: string[]
          unit_id: string | null
          unread_count: number
          whatsapp_instance_id: string | null
        }
        Insert: {
          ai_active?: boolean
          ai_agent_id?: string | null
          ai_followup_count?: number | null
          ai_last_followup_at?: string | null
          assigned_agent_id?: string | null
          channel?: Database["public"]["Enums"]["channel_type"]
          contact_id: string
          current_session_id?: string | null
          department_id?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          resolution_observation?: string | null
          resolution_reason_id?: string | null
          resolved_at?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[]
          unit_id?: string | null
          unread_count?: number
          whatsapp_instance_id?: string | null
        }
        Update: {
          ai_active?: boolean
          ai_agent_id?: string | null
          ai_followup_count?: number | null
          ai_last_followup_at?: string | null
          assigned_agent_id?: string | null
          channel?: Database["public"]["Enums"]["channel_type"]
          contact_id?: string
          current_session_id?: string | null
          department_id?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          resolution_observation?: string | null
          resolution_reason_id?: string | null
          resolved_at?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: string[]
          unit_id?: string | null
          unread_count?: number
          whatsapp_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_ai_agent_id_fkey"
            columns: ["ai_agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_current_session_id_fkey"
            columns: ["current_session_id"]
            isOneToOne: false
            referencedRelation: "conversation_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_resolution_reason_id_fkey"
            columns: ["resolution_reason_id"]
            isOneToOne: false
            referencedRelation: "resolution_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_whatsapp_instance_id_fkey"
            columns: ["whatsapp_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          description: string | null
          id: string
          max_agents: number
          name: string
          sla_minutes: number
          unit_id: string | null
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          max_agents?: number
          name: string
          sla_minutes?: number
          unit_id?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          max_agents?: number
          name?: string
          sla_minutes?: number
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      labels: {
        Row: {
          color: string | null
          company_id: string
          created_at: string | null
          external_id: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string | null
          external_id?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string | null
          external_id?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "labels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          is_deleted: boolean | null
          is_edited: boolean | null
          is_internal: boolean
          media_type: Database["public"]["Enums"]["media_type"]
          media_url: string | null
          metadata: Json | null
          participant_jid: string | null
          quoted_content: string | null
          quoted_message_id: string | null
          reactions: Json | null
          read_at: string | null
          remote_msg_id: string | null
          sender_id: string | null
          sender_type: Database["public"]["Enums"]["message_sender"]
          transcription: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          is_internal?: boolean
          media_type?: Database["public"]["Enums"]["media_type"]
          media_url?: string | null
          metadata?: Json | null
          participant_jid?: string | null
          quoted_content?: string | null
          quoted_message_id?: string | null
          reactions?: Json | null
          read_at?: string | null
          remote_msg_id?: string | null
          sender_id?: string | null
          sender_type: Database["public"]["Enums"]["message_sender"]
          transcription?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          is_internal?: boolean
          media_type?: Database["public"]["Enums"]["media_type"]
          media_url?: string | null
          metadata?: Json | null
          participant_jid?: string | null
          quoted_content?: string | null
          quoted_message_id?: string | null
          reactions?: Json | null
          read_at?: string | null
          remote_msg_id?: string | null
          sender_id?: string | null
          sender_type?: Database["public"]["Enums"]["message_sender"]
          transcription?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_messages_sender_profile"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_quoted_message_id_fkey"
            columns: ["quoted_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          contact_id: string
          conversation_id: string | null
          created_at: string
          expected_close_date: string | null
          id: string
          notes: string | null
          owner_id: string | null
          stage_id: string | null
          title: string
          unit_id: string | null
          value: number
        }
        Insert: {
          contact_id: string
          conversation_id?: string | null
          created_at?: string
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          stage_id?: string | null
          title: string
          unit_id?: string | null
          value?: number
        }
        Update: {
          contact_id?: string
          conversation_id?: string | null
          created_at?: string
          expected_close_date?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          stage_id?: string | null
          title?: string
          unit_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          opportunity_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          opportunity_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          opportunity_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_notes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string
          id: string
          name: string
          order: number
          pipeline_id: string | null
          unit_id: string | null
        }
        Insert: {
          color?: string
          id?: string
          name: string
          order?: number
          pipeline_id?: string | null
          unit_id?: string | null
        }
        Update: {
          color?: string
          id?: string
          name?: string
          order?: number
          pipeline_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          company_id: string | null
          created_at: string
          department_id: string | null
          email: string
          has_matriz_access: boolean
          id: string
          name: string
          online: boolean
          role: Database["public"]["Enums"]["app_role"]
          use_signature: boolean | null
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          department_id?: string | null
          email: string
          has_matriz_access?: boolean
          id: string
          name: string
          online?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          use_signature?: boolean | null
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          department_id?: string | null
          email?: string
          has_matriz_access?: boolean
          id?: string
          name?: string
          online?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          use_signature?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_message_folders: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_message_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_messages: {
        Row: {
          company_id: string
          content: string
          created_at: string
          folder_id: string | null
          id: string
          media_type: string | null
          media_url: string | null
          name: string | null
          shortcut: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          folder_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          name?: string | null
          shortcut: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          folder_id?: string | null
          id?: string
          media_type?: string | null
          media_url?: string | null
          name?: string | null
          shortcut?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_messages_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "quick_message_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      resolution_reasons: {
        Row: {
          active: boolean
          company_id: string | null
          created_at: string
          id: string
          label: string
          order: number
        }
        Insert: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          label: string
          order?: number
        }
        Update: {
          active?: boolean
          company_id?: string | null
          created_at?: string
          id?: string
          label?: string
          order?: number
        }
        Relationships: [
          {
            foreignKeyName: "resolution_reasons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      session_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          session_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          session_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "conversation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          contact_id: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          opportunity_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          task_type: string
          title: string
          unit_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: string
          title: string
          unit_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          contact_id?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          opportunity_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          task_type?: string
          title?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          active: boolean
          address: string | null
          business_hours: string | null
          color: string
          company_id: string
          created_at: string
          custom_variables: Json | null
          document: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          business_hours?: string | null
          color?: string
          company_id: string
          created_at?: string
          custom_variables?: Json | null
          document?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          active?: boolean
          address?: string | null
          business_hours?: string | null
          color?: string
          company_id?: string
          created_at?: string
          custom_variables?: Json | null
          document?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_departments: {
        Row: {
          department_id: string
          user_id: string
        }
        Insert: {
          department_id: string
          user_id: string
        }
        Update: {
          department_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_departments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_units: {
        Row: {
          role: Database["public"]["Enums"]["unit_role"]
          unit_id: string
          user_id: string
        }
        Insert: {
          role?: Database["public"]["Enums"]["unit_role"]
          unit_id: string
          user_id: string
        }
        Update: {
          role?: Database["public"]["Enums"]["unit_role"]
          unit_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_units_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_units_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          company_id: string
          created_at: string
          evogo_api_key: string
          evogo_instance_id: string | null
          id: string
          instance_name: string
          name: string
          owner_jid: string | null
          status: string
          unit_id: string | null
          wavoip_token: string | null
          webhook_url: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          evogo_api_key?: string
          evogo_instance_id?: string | null
          id?: string
          instance_name: string
          name: string
          owner_jid?: string | null
          status?: string
          unit_id?: string | null
          wavoip_token?: string | null
          webhook_url?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          evogo_api_key?: string
          evogo_instance_id?: string | null
          id?: string
          instance_name?: string
          name?: string
          owner_jid?: string | null
          status?: string
          unit_id?: string | null
          wavoip_token?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_instances_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_new_company:
        | {
            Args: { company_name: string; company_slug: string }
            Returns: string
          }
        | {
            Args: {
              company_name: string
              company_slug: string
              user_id: string
            }
            Returns: string
          }
      current_company_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_matriz_access: { Args: never; Returns: boolean }
      link_user_to_company: {
        Args: { p_company_id: string; p_email: string }
        Returns: boolean
      }
      reset_unread_count: { Args: { conv_id: string }; Returns: undefined }
      set_user_matriz_access: {
        Args: { p_has_access: boolean; p_user_id: string }
        Returns: undefined
      }
      toggle_matriz_access_rpc: {
        Args: { p_has_access: boolean; p_user_id: string }
        Returns: undefined
      }
      update_user_profile_admin: {
        Args: {
          p_company_id?: string
          p_has_matriz_access?: boolean
          p_role?: string
          p_user_id: string
        }
        Returns: undefined
      }
      user_in_unit: { Args: { _unit: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin_company" | "manager" | "agent"
      channel_type: "whatsapp" | "instagram"
      conversation_status: "waiting" | "active" | "resolved"
      media_type: "text" | "image" | "audio" | "video" | "document"
      message_sender: "agent" | "contact" | "system"
      task_priority: "low" | "medium" | "high"
      task_status: "pending" | "done"
      unit_role: "manager" | "agent"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin_company", "manager", "agent"],
      channel_type: ["whatsapp", "instagram"],
      conversation_status: ["waiting", "active", "resolved"],
      media_type: ["text", "image", "audio", "video", "document"],
      message_sender: ["agent", "contact", "system"],
      task_priority: ["low", "medium", "high"],
      task_status: ["pending", "done"],
      unit_role: ["manager", "agent"],
    },
  },
} as const
