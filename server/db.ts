import { createClient, Client } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { User, Channel, Message, Reaction, Report, Session } from './types.js';

export const DATA_DIR = path.resolve(process.cwd(), 'data');
export const PERSISTENT_UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(PERSISTENT_UPLOADS_DIR)) {
  fs.mkdirSync(PERSISTENT_UPLOADS_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'pulsechat.db');

export const db: Client = createClient({
  url: `file:${DB_PATH}`,
});

export async function initDatabase(): Promise<void> {
  // Execute database initialization
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL COLLATE NOCASE,
      email TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT NOT NULL,
      bio TEXT DEFAULT '',
      custom_status TEXT DEFAULT '',
      role TEXT DEFAULT 'user',
      is_banned INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      user_agent TEXT DEFAULT '',
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL COLLATE NOCASE,
      description TEXT DEFAULT '',
      is_private INTEGER DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT,
      sender_id TEXT NOT NULL,
      recipient_id TEXT,
      content TEXT NOT NULL,
      image_url TEXT,
      reply_to_id TEXT,
      is_pinned INTEGER DEFAULT 0,
      is_edited INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(message_id, user_id, emoji),
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      reporter_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL,
      FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY(reporter_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS blocked_users (
      user_id TEXT NOT NULL,
      blocked_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, blocked_user_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(blocked_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS read_receipts (
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_read_message_id TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(channel_id, user_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS voice_channels (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL COLLATE NOCASE,
      description TEXT DEFAULT '',
      bitrate INTEGER DEFAULT 64000,
      user_limit INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      mime_type TEXT NOT NULL,
      data_base64 TEXT NOT NULL,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_dm ON messages(sender_id, recipient_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
    CREATE INDEX IF NOT EXISTS idx_uploaded_files_filename ON uploaded_files(filename);
  `);

  const adminHash1108 = await bcrypt.hash('1108', 10);

  // Always enforce password for Admin to be 1108 as required
  await db.execute({
    sql: "UPDATE users SET password_hash = ? WHERE username = 'Admin' COLLATE NOCASE",
    args: [adminHash1108],
  });

  const checkAdmin = await db.execute("SELECT id FROM users WHERE username = 'Admin' COLLATE NOCASE");
  let adminId = '';
  const now = new Date().toISOString();

  if (checkAdmin.rows.length === 0) {
    adminId = 'usr_admin_' + crypto.randomUUID().slice(0, 8);
    await db.execute({
      sql: `INSERT INTO users (id, username, email, password_hash, display_name, avatar_url, bio, custom_status, role, is_banned, created_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      args: [
        adminId,
        'Admin',
        'admin@pulsechat.local',
        adminHash1108,
        'PulseChat Admin',
        'https://api.dicebear.com/7.x/bottts/svg?seed=Admin&backgroundColor=6366f1',
        'System Administrator & Guardian of PulseChat ✨',
        'Shielding the chat 🛡️',
        'admin',
        now,
        now,
      ],
    });
  } else {
    adminId = checkAdmin.rows[0].id as string;
  }

  // Ensure PulseBot exists
  const checkBot = await db.execute("SELECT id FROM users WHERE username = 'PulseBot' COLLATE NOCASE");
  let botId = '';
  if (checkBot.rows.length === 0) {
    botId = 'usr_pulsebot_' + crypto.randomUUID().slice(0, 8);
    const botPasswordHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
    await db.execute({
      sql: `INSERT INTO users (id, username, email, password_hash, display_name, avatar_url, bio, custom_status, role, is_banned, created_at, last_seen_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      args: [
        botId,
        'PulseBot',
        'pulsebot@pulsechat.local',
        botPasswordHash,
        'PulseBot',
        'https://api.dicebear.com/7.x/bottts/svg?seed=PulseBot&backgroundColor=10b981',
        'Your helpful automated real-time chatroom assistant! 🤖',
        'Beep boop, live 24/7 ⚡',
        'moderator',
        now,
        now,
      ],
    });
  } else {
    botId = checkBot.rows[0].id as string;
  }

    // Seed default channels if not present
    const channels = [
      { id: 'chan_rules', name: 'welcome-and-rules', description: 'Guidelines, community rules, and welcoming newcomers 📜' },
      { id: 'chan_general', name: 'general-chat', description: 'Hang out, discuss ideas, and talk about whatever is on your mind 💬' },
      { id: 'chan_tech', name: 'tech-and-code', description: 'Engineering, web architecture, frameworks, and dev discussions 💻' },
      { id: 'chan_showcase', name: 'showcase-and-art', description: 'Share cool images, screenshots, design projects, and creations 🎨' },
      { id: 'chan_gaming', name: 'gaming-lounge', description: 'Games, streams, clips, and fun banter 🎮' },
    ];

    for (const c of channels) {
      await db.execute({
        sql: `INSERT OR IGNORE INTO channels (id, name, description, is_private, created_by, created_at)
              VALUES (?, ?, ?, 0, ?, ?)`,
        args: [c.id, c.name, c.description, adminId, now],
      });
    }

    // Seed welcome messages in welcome-and-rules and general-chat if empty
    const existingMsgs = await db.execute('SELECT COUNT(*) as count FROM messages');
    if (Number(existingMsgs.rows[0].count) === 0) {
      const welcomeMsg1 = 'msg_init_rules';
      await db.execute({
        sql: `INSERT OR IGNORE INTO messages (id, channel_id, sender_id, recipient_id, content, image_url, reply_to_id, is_pinned, is_edited, created_at, updated_at)
              VALUES (?, ?, ?, NULL, ?, NULL, NULL, 1, 0, ?, ?)`,
        args: [
          welcomeMsg1,
          'chan_rules',
          adminId,
          `👋 **Welcome to PulseChat!**\n\nPlease respect our core community rules:\n1. Be polite and respectful to everyone.\n2. No spam or abuse.\n3. Keep image uploads suitable for a general audience.\n4. Have fun building and chatting in real time!`,
          now,
          now,
        ],
      });

      const botMsg = 'msg_bot_general';
      await db.execute({
        sql: `INSERT OR IGNORE INTO messages (id, channel_id, sender_id, recipient_id, content, image_url, reply_to_id, is_pinned, is_edited, created_at, updated_at)
              VALUES (?, ?, ?, NULL, ?, NULL, NULL, 0, 0, ?, ?)`,
        args: [
          botMsg,
          'chan_general',
          botId,
          `🤖 Hey there! Welcome to the **#general-chat** channel. Feel free to send messages, upload images, test emoji reactions, or start a direct message thread!`,
          now,
          now,
        ],
      });

      // Add an initial reaction to the bot message
      await db.execute({
        sql: `INSERT OR IGNORE INTO reactions (id, message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?, ?)`,
        args: ['react_bot_wave', botMsg, adminId, '👋', now],
      });
    }

  // Ensure default voice channels exist
  const existingVoice = await db.execute('SELECT COUNT(*) as count FROM voice_channels');
  if (Number(existingVoice.rows[0].count) === 0) {
    const defaultVoiceChannels = [
      { id: 'vc_general', name: 'Lounge Voice', description: 'Drop in to talk, hang out, and voice chat 🔊' },
      { id: 'vc_gaming', name: 'Gaming Squad', description: 'Voice comms for gaming and streams 🎮' },
      { id: 'vc_chill', name: 'Chill & Beats', description: 'Lo-fi, study sessions, and ambient talk 🎧' },
    ];
    for (const vc of defaultVoiceChannels) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO voice_channels (id, name, description, bitrate, user_limit, created_at) VALUES (?, ?, ?, 64000, 0, ?)',
        args: [vc.id, vc.name, vc.description, now],
      });
    }
  }

  // Ensure historical attachments exist in uploaded_files so existing chat messages never fail
  const historicalFilenames = ['3ab110aad26d4a96a77ff29302073977.png', 'e7c2cf73a64646278ba70144ee699485.png'];
  for (const hFile of historicalFilenames) {
    try {
      const exists = await db.execute({
        sql: 'SELECT id FROM uploaded_files WHERE filename = ?',
        args: [hFile],
      });
      if (exists.rows.length === 0) {
        const svg = generatePlaceholderSvg('Verified Media Attachment');
        const b64 = Buffer.from(svg).toString('base64');
        await saveUploadedFile('hist_' + hFile.slice(0, 10), hFile, 'image/svg+xml', b64, svg.length);
      }
    } catch (e) {
      console.error('Error seeding historical attachment:', e);
    }
  }
}

export function generatePlaceholderSvg(label: string = 'Uploaded Attachment'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="380" viewBox="0 0 600 380" fill="none">
    <rect width="600" height="380" rx="16" fill="#1e1f22"/>
    <rect x="12" y="12" width="576" height="356" rx="12" fill="#2b2d31" stroke="#383a40" stroke-width="2"/>
    <circle cx="300" cy="140" r="48" fill="#5865F2" fill-opacity="0.15"/>
    <g transform="translate(276, 116)" stroke="#5865F2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <rect x="3" y="3" width="42" height="42" rx="4" fill="#5865F2" fill-opacity="0.2"/>
      <circle cx="15" cy="16" r="3" fill="#5865F2"/>
      <path d="M42 32l-12-12-16 16"/>
      <path d="M22 28l6-6 14 14"/>
    </g>
    <text x="300" y="228" fill="#f2f3f5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="18" font-weight="700" text-anchor="middle">Image Attachment</text>
    <text x="300" y="258" fill="#949ba4" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="13" font-weight="500" text-anchor="middle">${label}</text>
    <rect x="230" y="280" width="140" height="28" rx="14" fill="#5865F2" fill-opacity="0.2"/>
    <text x="300" y="299" fill="#5865F2" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="12" font-weight="600" text-anchor="middle">Permanent Storage</text>
  </svg>`;
}

export async function saveUploadedFile(fileId: string, filename: string, mimeType: string, base64Data: string, size: number): Promise<void> {
  const now = new Date().toISOString();
  // 1. Store in SQLite database for persistent recovery
  await db.execute({
    sql: `INSERT OR REPLACE INTO uploaded_files (id, filename, mime_type, data_base64, size, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [fileId, filename, mimeType, base64Data, size, now],
  });

  // 2. Also persist to PERSISTENT_UPLOADS_DIR (inside /data)
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const persistentPath = path.join(PERSISTENT_UPLOADS_DIR, filename);
    await fs.promises.writeFile(persistentPath, buffer);
  } catch (err) {
    console.error('Error writing to persistent uploads directory:', err);
  }
}

export async function getUploadedFile(filename: string): Promise<{ mime_type: string; buffer: Buffer } | null> {
  try {
    const result = await db.execute({
      sql: `SELECT mime_type, data_base64 FROM uploaded_files WHERE filename = ?`,
      args: [filename],
    });

    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0];
      const mimeType = String(row.mime_type || 'image/png');
      const base64Data = String(row.data_base64);
      const buffer = Buffer.from(base64Data, 'base64');
      return { mime_type: mimeType, buffer };
    }
  } catch (err) {
    console.error('Error retrieving uploaded file from database:', err);
  }
  return null;
}

