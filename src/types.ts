export type UserRole = 'user' | 'moderator' | 'admin';
export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface User {
  id: string;
  username: string;
  email?: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  custom_status: string;
  role: UserRole;
  is_banned?: number;
  created_at: string;
  last_seen_at?: string;
  status?: UserStatus;
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  is_private: number;
  created_by: string;
  created_at: string;
  unread_count?: number;
}

export interface VoiceUser {
  user: User;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
}

export interface VoiceChannel {
  id: string;
  name: string;
  description: string;
  bitrate?: number;
  user_limit?: number;
  created_at?: string;
  activeUsers?: VoiceUser[];
}

export interface ReactionDetail {
  count: number;
  users: string[];
  hasReacted: boolean;
}

export interface Message {
  id: string;
  channel_id: string | null;
  sender_id: string;
  recipient_id: string | null;
  content: string;
  image_url: string | null;
  reply_to_id: string | null;
  is_pinned: number;
  is_edited: number;
  created_at: string;
  updated_at: string;
  sender?: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string;
    role: UserRole;
    custom_status?: string;
  };
  reply_to?: {
    id: string;
    sender_name: string;
    content: string;
  } | null;
  reactions?: Record<string, ReactionDetail>;
}

export interface ReportItem {
  id: string;
  message_id: string;
  reporter_id: string;
  reason: string;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
  message_content?: string;
  sender_name?: string;
  sender_username?: string;
  reporter_name?: string;
}

export interface DmThread {
  counterpart: User;
  lastActivity: string;
}
