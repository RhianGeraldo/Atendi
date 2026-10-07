export type ChannelType = "direct" | "group";
export type ChannelScope = "company" | "unit" | "custom" | "direct";

export interface InternalChannel {
  id: string;
  company_id: string;
  unit_id: string | null;
  department_id: string | null;
  name: string | null;
  description: string | null;
  type: ChannelType;
  scope: ChannelScope;
  avatar_url: string | null;
  created_by: string | null;
  last_message_preview: string | null;
  last_message_sender_id?: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
  is_announcement?: boolean;
  unit?: {
    id: string;
    name: string;
    color?: string | null;
  } | null;
  members?: InternalChannelMember[];
  unread_count?: number;
  has_mention?: boolean;
  mention_count?: number;
  other_user?: {
    id: string;
    name: string;
    avatar_url?: string | null;
    role?: string | null;
    unit_name?: string | null;
    online?: boolean;
  } | null;
}

export interface InternalChannelMember {
  id: string;
  channel_id: string;
  user_id: string;
  role: "admin" | "member";
  last_read_at: string;
  unread_count: number;
  is_muted: boolean;
  created_at: string;
  profile?: {
    id: string;
    name: string;
    avatar_url?: string | null;
    role?: string | null;
    online?: boolean;
  } | null;
}

export interface InternalMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string | null;
  media_type: "text" | "image" | "audio" | "video" | "document" | null;
  media_url: string | null;
  file_name: string | null;
  file_size: number | null;
  reply_to_id: string | null;
  metadata?: any;
  is_edited: boolean;
  is_deleted: boolean;
  is_pinned?: boolean;
  pinned_at?: string | null;
  pinned_by?: string | null;
  pinned_by_user?: {
    id: string;
    name: string;
  } | null;
  created_at: string;
  updated_at: string;
  isOptimistic?: boolean;
  sender?: {
    id: string;
    name: string;
    avatar_url?: string | null;
    role?: string | null;
  } | null;
  reply_to?: {
    id: string;
    content: string | null;
    sender_name?: string | null;
  } | null;
  reactions?: InternalMessageReaction[];
}

export interface InternalMessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  profile?: {
    name: string;
  } | null;
}

export interface TeamMember {
  id: string;
  name: string;
  avatar_url?: string | null;
  role?: string | null;
  active: boolean;
  online?: boolean;
  last_seen_at?: string | null;
  units?: { id: string; name: string }[];
}
