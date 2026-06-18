import fs from 'fs';
let code = fs.readFileSync('src/integrations/supabase/types.ts', 'utf8');

const tableDef = `
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
      }`;

code = code.replace('    Tables: {', '    Tables: {' + tableDef + ',');
fs.writeFileSync('src/integrations/supabase/types.ts', code);
