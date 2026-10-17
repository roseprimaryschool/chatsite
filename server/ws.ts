import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { getUserBySessionToken, isRateLimited } from './auth.js';
import {
  createMessage,
  toggleReaction,
  editMessage,
  deleteMessage,
  togglePin,
} from './messages.js';
import { db } from './db.js';
import type { User, WsClientAction, WsServerEvent } from './types.js';

interface AuthenticatedClient {
  ws: WebSocket;
  user: User;
  currentChannelId?: string;
  isAlive: boolean;
  voiceChannelId?: string;
  isMuted?: boolean;
  isDeafened?: boolean;
  isSpeaking?: boolean;
}

export function setupWebSocketServer(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // Map of client sockets to auth details
  const clients = new Map<WebSocket, AuthenticatedClient>();

  // Broadcast helper
  function broadcast(event: WsServerEvent, filter?: (client: AuthenticatedClient) => boolean) {
    const payload = JSON.stringify(event);
    for (const client of clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        if (!filter || filter(client)) {
          client.ws.send(payload);
        }
      }
    }
  }

  // Get list of online users
  function getOnlineUsersList() {
    const uniqueUsers = new Map<string, AuthenticatedClient['user']>();
    for (const client of clients.values()) {
      uniqueUsers.set(client.user.id, client.user);
    }
    return Array.from(uniqueUsers.values()).map((u) => ({
      id: u.id,
      username: u.username,
      display_name: u.display_name,
      avatar_url: u.avatar_url,
      role: u.role,
      status: u.status || 'online',
      customStatus: u.custom_status,
    }));
  }

  // Broadcast online users
  function broadcastOnlineUsers() {
    const list = getOnlineUsersList();
    broadcast({ type: 'online_users', users: list });
  }

  // Helper to get active users in a voice channel
  function getVoiceChannelUsers(channelId: string) {
    const list: Array<{ user: User; isMuted: boolean; isDeafened: boolean; isSpeaking: boolean }> = [];
    for (const c of clients.values()) {
      if (c.voiceChannelId === channelId) {
        list.push({
          user: c.user,
          isMuted: !!c.isMuted,
          isDeafened: !!c.isDeafened,
          isSpeaking: !!c.isSpeaking,
        });
      }
    }
    return list;
  }

  // Heartbeat ping interval
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = clients.get(ws);
      if (client) {
        if (!client.isAlive) {
          if (client.voiceChannelId) {
            broadcast({ type: 'voice_user_left', channelId: client.voiceChannelId, userId: client.user.id });
          }
          ws.terminate();
          clients.delete(ws);
          broadcastOnlineUsers();
          return;
        }
        client.isAlive = false;
        ws.ping();
      }
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  wss.on('connection', (ws: WebSocket) => {
    ws.on('pong', () => {
      const client = clients.get(ws);
      if (client) client.isAlive = true;
    });

    ws.on('message', async (data: Buffer | string) => {
      try {
        const text = data.toString();
        const action: WsClientAction = JSON.parse(text);

        // 1. Auth action
        if (action.type === 'auth') {
          const user = await getUserBySessionToken(action.token);
          if (!user) {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid or expired session token.' }));
            return;
          }

          if (user.is_banned) {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'Account is banned from PulseChat.' }));
            ws.close();
            return;
          }

          user.status = 'online';
          clients.set(ws, { ws, user, isAlive: true });

          ws.send(JSON.stringify({ type: 'auth_success', user }));
          broadcastOnlineUsers();
          return;
        }

        // Must be authenticated for any further action
        const client = clients.get(ws);
        if (!client) {
          ws.send(JSON.stringify({ type: 'auth_error', message: 'Unauthenticated connection. Please authenticate.' }));
          return;
        }

        // Check if user has become banned in real time
        if (client.user.is_banned) {
          ws.send(JSON.stringify({ type: 'auth_error', message: 'Account has been banned.' }));
          ws.close();
          return;
        }

        // 2. Channel switching
        if (action.type === 'join_channel') {
          client.currentChannelId = action.channelId;
          return;
        }

        if (action.type === 'leave_channel') {
          if (client.currentChannelId === action.channelId) {
            client.currentChannelId = undefined;
          }
          return;
        }

        // 3. Send Message
        if (action.type === 'send_message') {
          // Rate limit: max 8 messages per 5 seconds per user
          if (isRateLimited(`user_msg:${client.user.id}`, 8, 5000)) {
            ws.send(JSON.stringify({ type: 'auth_error', message: 'You are sending messages too fast. Slow down!' }));
            return;
          }

          const trimmedContent = (action.content || '').trim();
          const imageUrl = action.imageUrl?.trim() || null;

          if (!trimmedContent && !imageUrl) {
            return; // Empty messages not allowed
          }

          // Rule Enforcement: In #welcome-and-rules channel members cannot talk
          if (action.channelId) {
            const chanCheck = await db.execute({
              sql: 'SELECT id, name FROM channels WHERE id = ?',
              args: [action.channelId],
            });
            if (chanCheck.rows.length > 0) {
              const cName = String(chanCheck.rows[0].name).toLowerCase();
              if (cName.includes('rule') || cName.includes('welcome') || action.channelId === 'chan_rules') {
                if (client.user.role !== 'admin' && client.user.role !== 'moderator') {
                  ws.send(
                    JSON.stringify({
                      type: 'auth_error',
                      message: 'This channel is read-only. Members cannot talk in #welcome-and-rules.',
                    })
                  );
                  return;
                }
              }
            }
          }

          // Check if blocked
          if (action.recipientId) {
            const blockCheck = await db.execute({
              sql: 'SELECT 1 FROM blocked_users WHERE (user_id = ? AND blocked_user_id = ?) OR (user_id = ? AND blocked_user_id = ?)',
              args: [action.recipientId, client.user.id, client.user.id, action.recipientId],
            });
            if (blockCheck.rows.length > 0) {
              ws.send(JSON.stringify({ type: 'auth_error', message: 'Direct messaging unavailable due to user block.' }));
              return;
            }
          }

          const message = await createMessage({
            channelId: action.channelId || null,
            senderId: client.user.id,
            recipientId: action.recipientId || null,
            content: trimmedContent,
            imageUrl,
            replyToId: action.replyToId || null,
          });

          // Broadcast to channel members or DM participants
          if (message.channel_id) {
            broadcast({ type: 'new_message', message });
          } else if (message.recipient_id) {
            broadcast(
              { type: 'new_message', message },
              (c) => c.user.id === message.sender_id || c.user.id === message.recipient_id
            );
          }
          return;
        }

        // 4. Toggle Reaction
        if (action.type === 'toggle_reaction') {
          try {
            const updatedReactions = await toggleReaction(action.messageId, client.user.id, action.emoji);
            broadcast({
              type: 'reaction_updated',
              messageId: action.messageId,
              emoji: action.emoji,
              reactions: updatedReactions,
            });
          } catch (err: any) {
            console.error('Reaction error:', err);
          }
          return;
        }

        // 5. Edit Message
        if (action.type === 'edit_message') {
          try {
            const trimmed = action.content.trim();
            if (!trimmed) return;
            const res = await editMessage(action.messageId, client.user.id, trimmed);
            broadcast({
              type: 'message_edited',
              messageId: res.messageId,
              content: res.content,
              updated_at: res.updated_at,
            });
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'auth_error', message: err.message || 'Edit failed.' }));
          }
          return;
        }

        // 6. Delete Message
        if (action.type === 'delete_message') {
          try {
            await deleteMessage(action.messageId, client.user.id, client.user.role);
            broadcast({
              type: 'message_deleted',
              messageId: action.messageId,
            });
          } catch (err: any) {
            ws.send(JSON.stringify({ type: 'auth_error', message: err.message || 'Delete failed.' }));
          }
          return;
        }

        // 7. Toggle Pin
        if (action.type === 'toggle_pin') {
          try {
            const isPinned = await togglePin(action.messageId);
            broadcast({
              type: 'message_pinned',
              messageId: action.messageId,
              isPinned,
            });
          } catch (err: any) {
            console.error('Pin error:', err);
          }
          return;
        }

        // 8. Typing indicator
        if (action.type === 'typing') {
          broadcast(
            {
              type: 'user_typing',
              user: {
                id: client.user.id,
                username: client.user.username,
                display_name: client.user.display_name,
              },
              channelId: action.channelId,
              recipientId: action.recipientId,
              isTyping: !!action.isTyping,
            },
            (c) => c.user.id !== client.user.id
          );
          return;
        }

        // 9. Update status
        if (action.type === 'update_status') {
          client.user.status = action.status;
          if (action.customStatus !== undefined) {
            client.user.custom_status = action.customStatus;
            await db.execute({
              sql: 'UPDATE users SET custom_status = ? WHERE id = ?',
              args: [action.customStatus, client.user.id],
            });
          }
          broadcastOnlineUsers();
          return;
        }

        // 10. Mark Read
        if (action.type === 'mark_read') {
          const now = new Date().toISOString();
          await db.execute({
            sql: `INSERT INTO read_receipts (channel_id, user_id, last_read_message_id, updated_at)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id, updated_at = excluded.updated_at`,
            args: [action.channelId, client.user.id, action.lastMessageId, now],
          });
          return;
        }

        // 11. VOICE CHAT: Join Voice Channel
        if (action.type === 'join_voice') {
          // If already in a voice channel, leave first
          if (client.voiceChannelId && client.voiceChannelId !== action.channelId) {
            const oldId = client.voiceChannelId;
            client.voiceChannelId = undefined;
            broadcast({ type: 'voice_user_left', channelId: oldId, userId: client.user.id });
          }

          client.voiceChannelId = action.channelId;
          client.isMuted = !!action.isMuted;
          client.isDeafened = !!action.isDeafened;
          client.isSpeaking = false;

          // Notify existing participants in this voice channel
          broadcast(
            {
              type: 'voice_user_joined',
              channelId: action.channelId,
              user: client.user,
              isMuted: client.isMuted,
              isDeafened: client.isDeafened,
            },
            (c) => c.user.id !== client.user.id && c.voiceChannelId === action.channelId
          );

          // Send current voice channel occupants to joining user
          const currentOccupants = getVoiceChannelUsers(action.channelId);
          ws.send(
            JSON.stringify({
              type: 'voice_channel_users',
              channelId: action.channelId,
              users: currentOccupants,
            })
          );
          return;
        }

        // 12. VOICE CHAT: Leave Voice Channel
        if (action.type === 'leave_voice') {
          if (client.voiceChannelId) {
            const vcId = client.voiceChannelId;
            client.voiceChannelId = undefined;
            client.isSpeaking = false;
            broadcast({ type: 'voice_user_left', channelId: vcId, userId: client.user.id });
          }
          return;
        }

        // 13. VOICE CHAT: WebRTC Signaling (offer/answer/ice-candidate)
        if (action.type === 'voice_signal') {
          for (const targetClient of clients.values()) {
            if (targetClient.user.id === action.toUserId && targetClient.ws.readyState === WebSocket.OPEN) {
              targetClient.ws.send(
                JSON.stringify({
                  type: 'voice_signal',
                  fromUserId: client.user.id,
                  signal: action.signal,
                })
              );
              break;
            }
          }
          return;
        }

        // 14. VOICE CHAT: State Update (Mute / Deafen / Speaking)
        if (action.type === 'voice_state') {
          client.isMuted = !!action.isMuted;
          client.isDeafened = !!action.isDeafened;
          client.isSpeaking = !!action.isSpeaking;

          if (client.voiceChannelId) {
            broadcast(
              {
                type: 'voice_state_update',
                channelId: client.voiceChannelId,
                userId: client.user.id,
                isMuted: client.isMuted,
                isDeafened: client.isDeafened,
                isSpeaking: client.isSpeaking,
              },
              (c) => c.voiceChannelId === client.voiceChannelId
            );
          }
          return;
        }

        // 15. VOICE CHAT: Audio Packet Relay (guarantees voice works even behind strict NAT/firewalls)
        if (action.type === 'voice_audio_relay') {
          if (client.voiceChannelId && !client.isMuted) {
            const payload = JSON.stringify({
              type: 'voice_audio_relay',
              fromUserId: client.user.id,
              audioData: action.audioData,
            });
            for (const other of clients.values()) {
              if (
                other.user.id !== client.user.id &&
                other.voiceChannelId === client.voiceChannelId &&
                !other.isDeafened &&
                other.ws.readyState === WebSocket.OPEN
              ) {
                other.ws.send(payload);
              }
            }
          }
          return;
        }
      } catch (err) {
        console.error('WebSocket message parsing error:', err);
      }
    });

    ws.on('close', () => {
      const client = clients.get(ws);
      if (client) {
        if (client.voiceChannelId) {
          broadcast({ type: 'voice_user_left', channelId: client.voiceChannelId, userId: client.user.id });
        }
        clients.delete(ws);
        broadcastOnlineUsers();
      }
    });

    ws.on('error', (err) => {
      console.error('WebSocket connection error:', err);
      const client = clients.get(ws);
      if (client?.voiceChannelId) {
        broadcast({ type: 'voice_user_left', channelId: client.voiceChannelId, userId: client.user.id });
      }
      clients.delete(ws);
      broadcastOnlineUsers();
    });
  });

  return {
    broadcastChannelCreated: (channel: any) => {
      broadcast({ type: 'channel_created', channel });
    },
    broadcastUserBanned: (userId: string) => {
      for (const [ws, c] of clients.entries()) {
        if (c.user.id === userId) {
          if (c.voiceChannelId) {
            broadcast({ type: 'voice_user_left', channelId: c.voiceChannelId, userId: c.user.id });
          }
          ws.send(JSON.stringify({ type: 'user_banned', userId }));
          ws.close();
          clients.delete(ws);
        }
      }
      broadcastOnlineUsers();
    },
    getActiveVoiceUsers: (channelId: string) => {
      return getVoiceChannelUsers(channelId);
    },
  };
}
