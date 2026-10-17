import type { User, Channel, Message, ReportItem, DmThread, VoiceChannel } from '../types';

const TOKEN_KEY = 'pulsechat_session_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP error ${response.status}`);
  }

  return data as T;
}

export const api = {
  // Auth
  async signup(payload: { username: string; email: string; password: string; displayName?: string }) {
    return request<{ token: string; user: User }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async login(payload: { login: string; password: string }) {
    return request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async logout() {
    return request<{ success: boolean }>('/api/auth/logout', {
      method: 'POST',
    });
  },

  async getMe() {
    return request<{ user: User }>('/api/auth/me');
  },

  // Profile
  async updateProfile(payload: Partial<Pick<User, 'display_name' | 'avatar_url' | 'bio' | 'custom_status'>>) {
    return request<{ user: User }>('/api/users/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async fetchUsers() {
    return request<{ users: User[] }>('/api/users');
  },

  async toggleBlockUser(userId: string) {
    return request<{ isBlocked: boolean; message: string }>(`/api/users/${userId}/block`, {
      method: 'POST',
    });
  },

  // Channels
  async fetchChannels() {
    return request<{ channels: Channel[] }>('/api/channels');
  },

  async fetchVoiceChannels() {
    return request<{ voiceChannels: VoiceChannel[] }>('/api/voice-channels');
  },

  async createChannel(payload: { name: string; description?: string }) {
    return request<{ channel: Channel }>('/api/channels', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async fetchChannelMessages(channelId: string, limit = 50) {
    return request<{ messages: Message[] }>(`/api/channels/${channelId}/messages?limit=${limit}`);
  },

  async fetchChannelPins(channelId: string) {
    return request<{ pinned: Message[] }>(`/api/channels/${channelId}/pins`);
  },

  // Direct Messages
  async fetchDmThreads() {
    return request<{ threads: DmThread[] }>('/api/dms');
  },

  async fetchDmMessages(userId: string, limit = 50) {
    return request<{ messages: Message[] }>(`/api/dms/${userId}/messages?limit=${limit}`);
  },

  // Search
  async searchMessages(query: string, channelId?: string) {
    const params = new URLSearchParams({ q: query });
    if (channelId) params.append('channelId', channelId);
    return request<{ results: any[] }>(`/api/messages/search?${params.toString()}`);
  },

  // Reporting
  async reportMessage(messageId: string, reason: string) {
    return request<{ success: boolean; message: string }>(`/api/messages/${messageId}/report`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  // Image Upload
  async uploadImage(dataUrl: string, filename?: string) {
    return request<{ url: string; filename: string; size: number }>('/api/upload', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, filename }),
    });
  },

  // Admin
  async fetchReports() {
    return request<{ reports: ReportItem[] }>('/api/admin/reports');
  },

  async resolveReport(reportId: string, status: 'resolved' | 'dismissed') {
    return request<{ success: boolean }>(`/api/admin/reports/${reportId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  async toggleBanUser(userId: string, banned: boolean) {
    return request<{ success: boolean; banned: boolean }>(`/api/admin/users/${userId}/ban`, {
      method: 'POST',
      body: JSON.stringify({ banned }),
    });
  },
};
