import crypto from 'crypto';
import { db } from './db.js';
import type { Message, Reaction, UserRole } from './types.js';

export async function hydrateMessages(rows: any[], currentUserId?: string): Promise<Message[]> {
  if (rows.length === 0) return [];

  const messageIds = rows.map((r) => r.id);
  const placeholders = messageIds.map(() => '?').join(',');

  // Fetch reactions for these messages
  const reactionsResult = await db.execute({
    sql: `SELECT r.id, r.message_id, r.user_id, r.emoji, u.username, u.display_name
          FROM reactions r
          JOIN users u ON u.id = r.user_id
          WHERE r.message_id IN (${placeholders})`,
    args: messageIds,
  });

  // Group reactions by message_id -> emoji -> { count, users, hasReacted }
  const reactionsMap = new Map<string, Record<string, { count: number; users: string[]; hasReacted: boolean }>>();
  for (const r of reactionsResult.rows) {
    const msgId = r.message_id as string;
    const emoji = r.emoji as string;
    const userName = (r.display_name || r.username) as string;
    const isCurrentUser = currentUserId === (r.user_id as string);

    if (!reactionsMap.has(msgId)) {
      reactionsMap.set(msgId, {});
    }
    const msgReactions = reactionsMap.get(msgId)!;
    if (!msgReactions[emoji]) {
      msgReactions[emoji] = { count: 0, users: [], hasReacted: false };
    }
    msgReactions[emoji].count += 1;
    msgReactions[emoji].users.push(userName);
    if (isCurrentUser) {
      msgReactions[emoji].hasReacted = true;
    }
  }

  // Hydrate each message
  return rows.map((r) => {
    return {
      id: r.id as string,
      channel_id: (r.channel_id as string) || null,
      sender_id: r.sender_id as string,
      recipient_id: (r.recipient_id as string) || null,
      content: r.content as string,
      image_url: (r.image_url as string) || null,
      reply_to_id: (r.reply_to_id as string) || null,
      is_pinned: Number(r.is_pinned || 0),
      is_edited: Number(r.is_edited || 0),
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
      sender: {
        id: r.sender_id as string,
        username: r.sender_username as string,
        display_name: r.sender_display_name as string,
        avatar_url: r.sender_avatar_url as string,
        role: r.sender_role as UserRole,
        custom_status: (r.sender_custom_status as string) || '',
      },
      reply_to: r.reply_to_id
        ? {
            id: r.reply_to_id as string,
            sender_name: (r.reply_sender_name as string) || 'User',
            content: (r.reply_content as string) || 'Message deleted',
          }
        : null,
      reactions: reactionsMap.get(r.id) || {},
    };
  });
}

export async function getChannelMessages(channelId: string, limit = 50, currentUserId?: string): Promise<Message[]> {
  const result = await db.execute({
    sql: `SELECT m.id, m.channel_id, m.sender_id, m.recipient_id, m.content, m.image_url,
                 m.reply_to_id, m.is_pinned, m.is_edited, m.created_at, m.updated_at,
                 u.username as sender_username, u.display_name as sender_display_name,
                 u.avatar_url as sender_avatar_url, u.role as sender_role, u.custom_status as sender_custom_status,
                 rm.content as reply_content, ru.display_name as reply_sender_name
          FROM messages m
          JOIN users u ON u.id = m.sender_id
          LEFT JOIN messages rm ON rm.id = m.reply_to_id
          LEFT JOIN users ru ON ru.id = rm.sender_id
          WHERE m.channel_id = ?
          ORDER BY m.created_at ASC
          LIMIT ?`,
    args: [channelId, limit],
  });

  return hydrateMessages(result.rows, currentUserId);
}

export async function getDmMessages(user1Id: string, user2Id: string, limit = 50, currentUserId?: string): Promise<Message[]> {
  const result = await db.execute({
    sql: `SELECT m.id, m.channel_id, m.sender_id, m.recipient_id, m.content, m.image_url,
                 m.reply_to_id, m.is_pinned, m.is_edited, m.created_at, m.updated_at,
                 u.username as sender_username, u.display_name as sender_display_name,
                 u.avatar_url as sender_avatar_url, u.role as sender_role, u.custom_status as sender_custom_status,
                 rm.content as reply_content, ru.display_name as reply_sender_name
          FROM messages m
          JOIN users u ON u.id = m.sender_id
          LEFT JOIN messages rm ON rm.id = m.reply_to_id
          LEFT JOIN users ru ON ru.id = rm.sender_id
          WHERE (m.sender_id = ? AND m.recipient_id = ?)
             OR (m.sender_id = ? AND m.recipient_id = ?)
          ORDER BY m.created_at ASC
          LIMIT ?`,
    args: [user1Id, user2Id, user2Id, user1Id, limit],
  });

  return hydrateMessages(result.rows, currentUserId);
}

export async function createMessage(params: {
  channelId?: string | null;
  senderId: string;
  recipientId?: string | null;
  content: string;
  imageUrl?: string | null;
  replyToId?: string | null;
}): Promise<Message> {
  const messageId = 'msg_' + crypto.randomUUID().slice(0, 10);
  const now = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO messages (id, channel_id, sender_id, recipient_id, content, image_url, reply_to_id, is_pinned, is_edited, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
    args: [
      messageId,
      params.channelId || null,
      params.senderId,
      params.recipientId || null,
      params.content,
      params.imageUrl || null,
      params.replyToId || null,
      now,
      now,
    ],
  });

  // Fetch created message with sender info
  const fetchResult = await db.execute({
    sql: `SELECT m.id, m.channel_id, m.sender_id, m.recipient_id, m.content, m.image_url,
                 m.reply_to_id, m.is_pinned, m.is_edited, m.created_at, m.updated_at,
                 u.username as sender_username, u.display_name as sender_display_name,
                 u.avatar_url as sender_avatar_url, u.role as sender_role, u.custom_status as sender_custom_status,
                 rm.content as reply_content, ru.display_name as reply_sender_name
          FROM messages m
          JOIN users u ON u.id = m.sender_id
          LEFT JOIN messages rm ON rm.id = m.reply_to_id
          LEFT JOIN users ru ON ru.id = rm.sender_id
          WHERE m.id = ?`,
    args: [messageId],
  });

  const hydrated = await hydrateMessages(fetchResult.rows, params.senderId);
  return hydrated[0];
}

export async function toggleReaction(messageId: string, userId: string, emoji: string) {
  // Check if message exists
  const msgCheck = await db.execute({ sql: 'SELECT id FROM messages WHERE id = ?', args: [messageId] });
  if (msgCheck.rows.length === 0) {
    throw new Error('Message not found');
  }

  // Check if user already reacted
  const existing = await db.execute({
    sql: 'SELECT id FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
    args: [messageId, userId, emoji],
  });

  if (existing.rows.length > 0) {
    // Remove reaction
    await db.execute({
      sql: 'DELETE FROM reactions WHERE id = ?',
      args: [existing.rows[0].id],
    });
  } else {
    // Add reaction
    const reactId = 'react_' + crypto.randomUUID().slice(0, 8);
    const now = new Date().toISOString();
    await db.execute({
      sql: 'INSERT INTO reactions (id, message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [reactId, messageId, userId, emoji, now],
    });
  }

  // Fetch updated reactions for this message
  const reactionsResult = await db.execute({
    sql: `SELECT r.id, r.emoji, r.user_id, u.username, u.display_name
          FROM reactions r
          JOIN users u ON u.id = r.user_id
          WHERE r.message_id = ?`,
    args: [messageId],
  });

  const reactions: Record<string, { count: number; users: string[]; hasReacted: boolean }> = {};
  for (const r of reactionsResult.rows) {
    const e = r.emoji as string;
    const name = (r.display_name || r.username) as string;
    if (!reactions[e]) {
      reactions[e] = { count: 0, users: [], hasReacted: false };
    }
    reactions[e].count += 1;
    reactions[e].users.push(name);
    if (r.user_id === userId) {
      reactions[e].hasReacted = true;
    }
  }

  return reactions;
}

export async function togglePin(messageId: string) {
  const msg = await db.execute({ sql: 'SELECT id, is_pinned FROM messages WHERE id = ?', args: [messageId] });
  if (msg.rows.length === 0) throw new Error('Message not found');

  const currentPin = Number(msg.rows[0].is_pinned);
  const nextPin = currentPin === 1 ? 0 : 1;

  await db.execute({
    sql: 'UPDATE messages SET is_pinned = ? WHERE id = ?',
    args: [nextPin, messageId],
  });

  return nextPin === 1;
}

export async function editMessage(messageId: string, userId: string, newContent: string) {
  const msg = await db.execute({ sql: 'SELECT sender_id FROM messages WHERE id = ?', args: [messageId] });
  if (msg.rows.length === 0) throw new Error('Message not found');

  if (msg.rows[0].sender_id !== userId) {
    throw new Error('You can only edit your own messages');
  }

  const now = new Date().toISOString();
  await db.execute({
    sql: 'UPDATE messages SET content = ?, is_edited = 1, updated_at = ? WHERE id = ?',
    args: [newContent, now, messageId],
  });

  return { messageId, content: newContent, updated_at: now };
}

export async function deleteMessage(messageId: string, userId: string, userRole: UserRole) {
  const msg = await db.execute({ sql: 'SELECT sender_id FROM messages WHERE id = ?', args: [messageId] });
  if (msg.rows.length === 0) throw new Error('Message not found');

  if (msg.rows[0].sender_id !== userId && userRole !== 'admin' && userRole !== 'moderator') {
    throw new Error('You do not have permission to delete this message');
  }

  await db.execute({ sql: 'DELETE FROM messages WHERE id = ?', args: [messageId] });
  return true;
}
