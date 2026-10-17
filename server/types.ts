export type UserRole = 'user' | 'moderator' | 'admin';

export interface User {
  id: string;
  username: string;
  email: string;
  password_hash?: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  custom_status: string;
  role: UserRole;
  is_banned: number; // 0 or 1
  created_at: string;
  last_seen_at: string;
  status?: 'online' | 'idle' | 'dnd' | 'offline';
}

export interface Session {
  id: string;
  token: string;
  user_id: string;
  created_at: string;
  expires_at: string;
  user_agent?: string;
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

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  username?: string;
  display_name?: string;
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
  // Hydrated properties
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
  reactions?: Record<string, { count: number; users: string[]; hasReacted: boolean }>;
}

export interface Report {
  id: string;
  message_id: string;
  reporter_id: string;
  reason: string;
  status: 'pending' | 'resolved' | 'dismissed';
  created_at: string;
  message_content?: string;
  message_sender_name?: string;
  reporter_name?: string;
}

export interface VoiceChannel {
  id: string;
  name: string;
  description: string;
  bitrate?: number;
  user_limit?: number;
  created_at?: string;
  activeUsers?: Array<{
    user: User;
    isMuted: boolean;
    isDeafened: boolean;
    isSpeaking: boolean;
  }>;
}

// WebSocket Event Types
export type WsClientAction =
  | { type: 'auth'; token: string }
  | { type: 'join_channel'; channelId: string }
  | { type: 'leave_channel'; channelId: string }
  | { type: 'send_message'; channelId?: string; recipientId?: string; content: string; imageUrl?: string; replyToId?: string }
  | { type: 'edit_message'; messageId: string; content: string }
  | { type: 'delete_message'; messageId: string }
  | { type: 'toggle_reaction'; messageId: string; emoji: string }
  | { type: 'toggle_pin'; messageId: string }
  | { type: 'typing'; channelId?: string; recipientId?: string; isTyping: boolean }
  | { type: 'update_status'; status: 'online' | 'idle' | 'dnd' | 'offline'; customStatus?: string }
  | { type: 'mark_read'; channelId: string; lastMessageId: string }
  | { type: 'join_voice'; channelId: string; isMuted?: boolean; isDeafened?: boolean }
  | { type: 'leave_voice' }
  | { type: 'voice_signal'; toUserId: string; signal: any }
  | { type: 'voice_state'; isMuted: boolean; isDeafened: boolean; isSpeaking: boolean }
  | { type: 'voice_audio_relay'; audioData: string };

export type WsServerEvent =
  | { type: 'auth_success'; user: Omit<User, 'password_hash'> }
  | { type: 'auth_error'; message: string }
  | { type: 'new_message'; message: Message }
  | { type: 'message_edited'; messageId: string; content: string; updated_at: string }
  | { type: 'message_deleted'; messageId: string }
  | { type: 'reaction_updated'; messageId: string; emoji: string; reactions: Record<string, { count: number; users: string[]; hasReacted: boolean }> }
  | { type: 'message_pinned'; messageId: string; isPinned: boolean }
  | { type: 'user_typing'; user: { id: string; username: string; display_name: string }; channelId?: string; recipientId?: string; isTyping: boolean }
  | { type: 'presence_update'; userId: string; status: 'online' | 'idle' | 'dnd' | 'offline'; customStatus?: string; lastSeenAt: string }
  | { type: 'online_users'; users: Array<{ id: string; username: string; display_name: string; avatar_url: string; role: UserRole; status: 'online' | 'idle' | 'dnd' | 'offline'; customStatus?: string }> }
  | { type: 'channel_created'; channel: Channel }
  | { type: 'user_banned'; userId: string }
  | { type: 'voice_channel_users'; channelId: string; users: Array<{ user: User; isMuted: boolean; isDeafened: boolean; isSpeaking: boolean }> }
  | { type: 'voice_user_joined'; channelId: string; user: User; isMuted: boolean; isDeafened: boolean }
  | { type: 'voice_user_left'; channelId: string; userId: string }
  | { type: 'voice_signal'; fromUserId: string; signal: any }
  | { type: 'voice_state_update'; channelId: string; userId: string; isMuted: boolean; isDeafened: boolean; isSpeaking: boolean }
  | { type: 'voice_audio_relay'; fromUserId: string; audioData: string };
