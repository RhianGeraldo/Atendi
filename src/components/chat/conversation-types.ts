export type Status = "waiting" | "active" | "resolved";
export type TabType = Status | "groups";

export interface ConvRow {
  id: string;
  channel: "whatsapp" | "instagram";
  status: Status;
  last_message_at: string;
  started_at: string;
  tags: string[];
  unread_count?: number;
  last_message_preview?: string | null;
  contact: { 
    id: string; 
    name: string; 
    phone: string | null; 
    email: string | null; 
    tags: string[];
    avatar_url?: string | null;
    instagram_username?: string | null;
    whatsapp_lid?: string | null;
    instagram_id?: string | null;
    company_id?: string | null;
    is_blocked?: boolean;
    contact_labels?: { labels: { id: string; name: string; color: string | null } }[];
  };
  department: { name: string } | null;
  assigned_agent?: { name: string } | null;
  department_id: string | null;
  assigned_agent_id: string | null;
  ai_active?: boolean;
  ai_agent_id?: string | null;
  ai_agent?: { name: string } | null;
  unit_id: string;
  whatsapp_instance_id: string | null;
  unit?: { name: string; color?: string | null; custom_variables?: any } | null;
  whatsapp_instance?: { name: string } | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_type: "agent" | "contact" | "system";
  is_internal?: boolean;
  content: string | null;
  media_type: "text" | "image" | "audio" | "video" | "document";
  media_url?: string | null;
  created_at: string;
  quoted_content?: string | null;
  is_edited?: boolean;
  is_deleted?: boolean;
  reactions?: Record<string, string[]>;
  isOptimistic?: boolean;
  remote_msg_id?: string | null;
  profiles?: { name: string };
  metadata?: any;
  quoted_message_id?: string | null;
  transcription?: string | null;
  participant_jid?: string | null;
  sender_id?: string | null;
}

import { supabase } from "@/integrations/supabase/client";

export const fetchConversationMessages = async (convId: string): Promise<MessageRow[]> => {
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_type, sender_id, participant_jid, is_internal, content, media_type, media_url, created_at, quoted_content, quoted_message_id, is_edited, is_deleted, reactions, remote_msg_id, transcription, profiles(name), metadata")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: false })
    .limit(15);

  if (error) throw error;
  return ((data ?? []) as MessageRow[]).reverse();
};

