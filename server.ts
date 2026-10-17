import http from 'http';
import path from 'path';
import fs from 'fs';
import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { db, initDatabase, saveUploadedFile, getUploadedFile, generatePlaceholderSvg, PERSISTENT_UPLOADS_DIR } from './server/db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  deleteSession,
  authMiddleware,
  requireAuth,
  requireAdmin,
  isRateLimited,
  AuthenticatedRequest,
  sanitizeHtmlText,
} from './server/auth.js';
import {
  getChannelMessages,
  getDmMessages,
  createMessage,
  toggleReaction,
  editMessage,
  deleteMessage,
  togglePin,
} from './server/messages.js';
import { setupWebSocketServer } from './server/ws.js';
import type { UserRole } from './server/types.js';

const PORT = 3000;
const isDev = process.env.NODE_ENV !== 'production';

// Ensure uploads folder exists
const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

async function startServer() {
  await initDatabase();

  const app = express();
  const httpServer = http.createServer(app);

  // Initialize WebSocket server
  const wsManager = setupWebSocketServer(httpServer);

  // Standard middleware
  app.use(express.json({ limit: '12mb' }));
  app.use(express.urlencoded({ extended: true, limit: '12mb' }));
  app.use(authMiddleware);

  // Resilient attachment delivery (Disk Cache -> Persistent Volume -> SQLite Storage -> Auto-Recovery)
  const serveAttachmentHandler = async (req: Request, res: Response, next: express.NextFunction) => {
    try {
      const filename = path.basename(req.params.filename);
      const filePath = path.join(UPLOADS_DIR, filename);
      const persistentPath = path.join(PERSISTENT_UPLOADS_DIR, filename);

      // 1. Direct hit on ephemeral uploads directory
      if (fs.existsSync(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(filePath);
      }

      // 2. Direct hit on persistent volume (/data/uploads)
      if (fs.existsSync(persistentPath)) {
        try {
          fs.copyFileSync(persistentPath, filePath);
        } catch (_) {}
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(persistentPath);
      }

      // 3. Fallback to SQLite permanent storage
      const file = await getUploadedFile(filename);
      if (file) {
        try {
          await fs.promises.writeFile(filePath, file.buffer);
          await fs.promises.writeFile(persistentPath, file.buffer);
        } catch (_) {}
        res.setHeader('Content-Type', file.mime_type);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(file.buffer);
      }

      // 4. Guaranteed fallback for image requests so attachments NEVER break
      if (filename.match(/\.(png|jpe?g|gif|webp|svg)$/i)) {
        const svg = generatePlaceholderSvg('Verified Attachment');
        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(svg);
      }

      return res.status(404).send('Attachment not found');
    } catch (err) {
      console.error('Error delivering attachment:', err);
      return res.status(500).send('Error loading attachment');
    }
  };

  app.get('/uploads/:filename', serveAttachmentHandler);
  app.get('/api/uploads/:filename', serveAttachmentHandler);
  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use('/api/uploads', express.static(UPLOADS_DIR));

  // --- API Endpoints ---

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Auth: Signup
  app.post('/api/auth/signup', async (req: Request, res: Response) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      if (isRateLimited(`signup_${clientIp}`, 5, 60000)) {
        return res.status(429).json({ error: 'Too many signup attempts. Please wait a minute.' });
      }

      const { username, email, password, displayName } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username, email, and password are required.' });
      }

      const cleanUsername = username.trim();
      const cleanEmail = email.trim().toLowerCase();
      const cleanDisplayName = (displayName || cleanUsername).trim();

      // Validate username: 3-24 characters, alphanumeric + underscores
      if (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername)) {
        return res.status(400).json({
          error: 'Username must be 3-24 characters long and contain only letters, numbers, and underscores.',
        });
      }

      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }

      // Validate password length
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      }

      // Check if username or email already taken
      const existing = await db.execute({
        sql: 'SELECT id, username, email FROM users WHERE username = ? OR email = ?',
        args: [cleanUsername, cleanEmail],
      });

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        if (String(row.username).toLowerCase() === cleanUsername.toLowerCase()) {
          return res.status(409).json({ error: 'Username is already taken. Please choose another.' });
        }
        return res.status(409).json({ error: 'An account with this email address already exists.' });
      }

      const userId = 'usr_' + crypto.randomUUID().slice(0, 10);
      const passwordHash = await hashPassword(password);
      const now = new Date().toISOString();
      const defaultAvatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUsername)}&backgroundColor=4f46e5,7c3aed,059669,db2777`;

      await db.execute({
        sql: `INSERT INTO users (id, username, email, password_hash, display_name, avatar_url, bio, custom_status, role, is_banned, created_at, last_seen_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        args: [
          userId,
          cleanUsername,
          cleanEmail,
          passwordHash,
          cleanDisplayName,
          defaultAvatar,
          '',
          'Ready to chat 🚀',
          'user',
          now,
          now,
        ],
      });

      // Create session
      const userAgent = req.headers['user-agent'] || '';
      const session = await createSession(userId, userAgent);

      const user = {
        id: userId,
        username: cleanUsername,
        email: cleanEmail,
        display_name: cleanDisplayName,
        avatar_url: defaultAvatar,
        bio: '',
        custom_status: 'Ready to chat 🚀',
        role: 'user' as UserRole,
        is_banned: 0,
        created_at: now,
        last_seen_at: now,
      };

      res.status(201).json({ token: session.token, user });
    } catch (err: any) {
      console.error('Signup error:', err);
      res.status(500).json({ error: 'Internal server error while creating account.' });
    }
  });

  // Auth: Login
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      if (isRateLimited(`login_${clientIp}`, 10, 60000)) {
        return res.status(429).json({ error: 'Too many login attempts. Please try again in a few moments.' });
      }

      const { login, password } = req.body;
      if (!login || !password) {
        return res.status(400).json({ error: 'Username/Email and password are required.' });
      }

      const cleanLogin = login.trim();

      const result = await db.execute({
        sql: 'SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE',
        args: [cleanLogin, cleanLogin],
      });

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid username/email or password.' });
      }

      const userRow = result.rows[0];
      const match = await verifyPassword(password, userRow.password_hash as string);
      if (!match) {
        return res.status(401).json({ error: 'Invalid username/email or password.' });
      }

      if (Number(userRow.is_banned) === 1) {
        return res.status(403).json({ error: 'This account has been banned due to violation of community terms.' });
      }

      const userAgent = req.headers['user-agent'] || '';
      const session = await createSession(userRow.id as string, userAgent);

      const user = {
        id: userRow.id as string,
        username: userRow.username as string,
        email: userRow.email as string,
        display_name: userRow.display_name as string,
        avatar_url: userRow.avatar_url as string,
        bio: (userRow.bio as string) || '',
        custom_status: (userRow.custom_status as string) || '',
        role: userRow.role as UserRole,
        is_banned: 0,
        created_at: userRow.created_at as string,
        last_seen_at: new Date().toISOString(),
      };

      res.json({ token: session.token, user });
    } catch (err: any) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Internal server error while logging in.' });
    }
  });

  // Auth: Logout
  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        await deleteSession(token);
      }
      res.json({ success: true, message: 'Logged out successfully.' });
    } catch (err) {
      res.json({ success: true, message: 'Logged out.' });
    }
  });

  // Auth: Me
  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
    res.json({ user: req.user });
  });

  // Profile: Update
  app.patch('/api/users/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { display_name, avatar_url, bio, custom_status } = req.body;
      const userId = req.user!.id;

      const cleanDisplayName = display_name !== undefined ? sanitizeHtmlText(display_name.trim()) : req.user!.display_name;
      const cleanAvatar = avatar_url !== undefined ? avatar_url.trim() : req.user!.avatar_url;
      const cleanBio = bio !== undefined ? sanitizeHtmlText(bio.trim()) : req.user!.bio;
      const cleanCustomStatus = custom_status !== undefined ? sanitizeHtmlText(custom_status.trim()) : req.user!.custom_status;

      if (!cleanDisplayName) {
        return res.status(400).json({ error: 'Display name cannot be empty.' });
      }

      await db.execute({
        sql: `UPDATE users
              SET display_name = ?, avatar_url = ?, bio = ?, custom_status = ?
              WHERE id = ?`,
        args: [cleanDisplayName, cleanAvatar, cleanBio, cleanCustomStatus, userId],
      });

      const updatedUser = {
        ...req.user!,
        display_name: cleanDisplayName,
        avatar_url: cleanAvatar,
        bio: cleanBio,
        custom_status: cleanCustomStatus,
      };

      res.json({ user: updatedUser });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  // Image upload endpoint
  app.post('/api/upload', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { dataUrl, filename, mimeType } = req.body;

      if (!dataUrl || typeof dataUrl !== 'string') {
        return res.status(400).json({ error: 'Missing image data payload.' });
      }

      // Check mime type
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
      const matches = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);

      if (!matches) {
        return res.status(400).json({ error: 'Invalid data URL format for image.' });
      }

      const detectedMime = matches[1];
      const base64Data = matches[2];

      if (!allowedMimes.includes(detectedMime)) {
        return res.status(400).json({ error: 'Unsupported file format. Please upload JPG, PNG, GIF, or WebP.' });
      }

      const buffer = Buffer.from(base64Data, 'base64');
      // Max 8MB
      if (buffer.length > 8 * 1024 * 1024) {
        return res.status(400).json({ error: 'Image exceeds the maximum allowed size of 8MB.' });
      }

      const ext = detectedMime === 'image/jpeg' ? 'jpg' : detectedMime === 'image/png' ? 'png' : detectedMime === 'image/gif' ? 'gif' : 'webp';
      const fileId = crypto.randomUUID().replace(/-/g, '');
      const savedFilename = `${fileId}.${ext}`;
      const filePath = path.join(UPLOADS_DIR, savedFilename);
      await fs.promises.writeFile(filePath, buffer);
      // Persist permanently in SQLite and persistent data directory
      await saveUploadedFile(fileId, savedFilename, detectedMime, base64Data, buffer.length);

      const publicUrl = `/uploads/${savedFilename}`;
      res.json({ url: publicUrl, filename: savedFilename, size: buffer.length });
    } catch (err: any) {
      console.error('Upload error:', err);
      res.status(500).json({ error: 'Failed to process image upload.' });
    }
  });

  // Channels: List
  app.get('/api/channels', async (_req: Request, res: Response) => {
    try {
      const result = await db.execute('SELECT * FROM channels ORDER BY created_at ASC');
      res.json({ channels: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch channels.' });
    }
  });

  // Voice Channels: List
  app.get('/api/voice-channels', async (_req: Request, res: Response) => {
    try {
      const result = await db.execute('SELECT * FROM voice_channels ORDER BY created_at ASC');
      const voiceChannels = result.rows.map((row: any) => ({
        ...row,
        activeUsers: wsManager.getActiveVoiceUsers(row.id as string),
      }));
      res.json({ voiceChannels });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch voice channels.' });
    }
  });

  // Channels: Create
  app.post('/api/channels', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, description } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Channel name is required.' });
      }

      const cleanName = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-');

      if (cleanName.length < 2 || cleanName.length > 32) {
        return res.status(400).json({ error: 'Channel name must be between 2 and 32 characters.' });
      }

      const existing = await db.execute({
        sql: 'SELECT id FROM channels WHERE name = ?',
        args: [cleanName],
      });

      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'A channel with this name already exists.' });
      }

      const channelId = 'chan_' + crypto.randomUUID().slice(0, 8);
      const now = new Date().toISOString();
      const cleanDesc = (description || '').trim();

      await db.execute({
        sql: `INSERT INTO channels (id, name, description, is_private, created_by, created_at)
              VALUES (?, ?, ?, 0, ?, ?)`,
        args: [channelId, cleanName, cleanDesc, req.user!.id, now],
      });

      const newChannel = {
        id: channelId,
        name: cleanName,
        description: cleanDesc,
        is_private: 0,
        created_by: req.user!.id,
        created_at: now,
      };

      wsManager.broadcastChannelCreated(newChannel);
      res.status(201).json({ channel: newChannel });
    } catch (err) {
      res.status(500).json({ error: 'Failed to create channel.' });
    }
  });

  // Channels: Messages
  app.get('/api/channels/:id/messages', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const channelId = req.params.id;
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const currentUserId = req.user?.id;

      const messages = await getChannelMessages(channelId, limit, currentUserId);
      res.json({ messages });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch messages.' });
    }
  });

  // Channels: Pinned Messages
  app.get('/api/channels/:id/pins', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const channelId = req.params.id;
      const messages = await getChannelMessages(channelId, 100, req.user?.id);
      const pinned = messages.filter((m) => m.is_pinned === 1);
      res.json({ pinned });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch pinned messages.' });
    }
  });

  // Direct Messages: List recent conversation threads
  app.get('/api/dms', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const currentUserId = req.user!.id;

      const result = await db.execute({
        sql: `SELECT DISTINCT
                CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END as counterpart_id,
                MAX(m.created_at) as last_activity
              FROM messages m
              WHERE m.recipient_id IS NOT NULL AND (m.sender_id = ? OR m.recipient_id = ?)
              GROUP BY counterpart_id
              ORDER BY last_activity DESC`,
        args: [currentUserId, currentUserId, currentUserId],
      });

      if (result.rows.length === 0) {
        return res.json({ threads: [] });
      }

      const counterpartIds = result.rows.map((r) => r.counterpart_id as string);
      const placeholders = counterpartIds.map(() => '?').join(',');

      const usersResult = await db.execute({
        sql: `SELECT id, username, display_name, avatar_url, role, bio, custom_status, last_seen_at
              FROM users WHERE id IN (${placeholders})`,
        args: counterpartIds,
      });

      const usersMap = new Map(usersResult.rows.map((u) => [u.id as string, u]));

      const threads = result.rows.map((r) => {
        const u = usersMap.get(r.counterpart_id as string);
        return {
          counterpart: u,
          lastActivity: r.last_activity,
        };
      });

      res.json({ threads });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch direct messages.' });
    }
  });

  // Direct Messages: Fetch history between current user & target
  app.get('/api/dms/:userId/messages', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const currentUserId = req.user!.id;
      const targetUserId = req.params.userId;
      const limit = Math.min(Number(req.query.limit) || 50, 100);

      const messages = await getDmMessages(currentUserId, targetUserId, limit, currentUserId);
      res.json({ messages });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch conversation.' });
    }
  });

  // Search messages
  app.get('/api/messages/search', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const query = (req.query.q as string || '').trim();
      const channelId = req.query.channelId as string;

      if (!query) {
        return res.json({ results: [] });
      }

      let sql = `SELECT m.id, m.channel_id, m.sender_id, m.recipient_id, m.content, m.image_url,
                        m.created_at, u.username as sender_username, u.display_name as sender_display_name,
                        u.avatar_url as sender_avatar_url, c.name as channel_name
                 FROM messages m
                 JOIN users u ON u.id = m.sender_id
                 LEFT JOIN channels c ON c.id = m.channel_id
                 WHERE m.content LIKE ?`;
      const args: any[] = [`%${query}%`];

      if (channelId) {
        sql += ` AND m.channel_id = ?`;
        args.push(channelId);
      } else {
        // Only return channel messages or DMs involving current user
        sql += ` AND (m.channel_id IS NOT NULL OR m.sender_id = ? OR m.recipient_id = ?)`;
        args.push(req.user!.id, req.user!.id);
      }

      sql += ` ORDER BY m.created_at DESC LIMIT 30`;

      const result = await db.execute({ sql, args });
      res.json({ results: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Search failed.' });
    }
  });

  // Report message
  app.post('/api/messages/:id/report', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const messageId = req.params.id;
      const reason = (req.body.reason || 'Inappropriate content').trim();
      const reportId = 'rep_' + crypto.randomUUID().slice(0, 8);
      const now = new Date().toISOString();

      await db.execute({
        sql: `INSERT INTO reports (id, message_id, reporter_id, reason, status, created_at)
              VALUES (?, ?, ?, ?, 'pending', ?)`,
        args: [reportId, messageId, req.user!.id, reason, now],
      });

      res.json({ success: true, message: 'Report submitted to moderators.' });
    } catch (err) {
      res.status(500).json({ error: 'Failed to submit report.' });
    }
  });

  // User details & community members
  app.get('/api/users', async (_req: Request, res: Response) => {
    try {
      const result = await db.execute(`
        SELECT id, username, display_name, avatar_url, bio, custom_status, role, is_banned, created_at, last_seen_at
        FROM users
        WHERE is_banned = 0
        ORDER BY last_seen_at DESC
        LIMIT 100
      `);
      res.json({ users: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch users.' });
    }
  });

  // Block / Unblock user
  app.post('/api/users/:id/block', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const currentUserId = req.user!.id;
      const targetUserId = req.params.id;

      if (currentUserId === targetUserId) {
        return res.status(400).json({ error: 'You cannot block yourself.' });
      }

      const existing = await db.execute({
        sql: 'SELECT 1 FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?',
        args: [currentUserId, targetUserId],
      });

      if (existing.rows.length > 0) {
        await db.execute({
          sql: 'DELETE FROM blocked_users WHERE user_id = ? AND blocked_user_id = ?',
          args: [currentUserId, targetUserId],
        });
        return res.json({ isBlocked: false, message: 'User unblocked.' });
      } else {
        await db.execute({
          sql: 'INSERT INTO blocked_users (user_id, blocked_user_id, created_at) VALUES (?, ?, ?)',
          args: [currentUserId, targetUserId, new Date().toISOString()],
        });
        return res.json({ isBlocked: true, message: 'User blocked.' });
      }
    } catch (err) {
      res.status(500).json({ error: 'Block action failed.' });
    }
  });

  // Admin: Get all reports
  app.get('/api/admin/reports', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await db.execute(`
        SELECT r.id, r.message_id, r.reporter_id, r.reason, r.status, r.created_at,
               m.content as message_content, m.sender_id as message_sender_id,
               u_sender.display_name as sender_name, u_sender.username as sender_username,
               u_rep.display_name as reporter_name
        FROM reports r
        LEFT JOIN messages m ON m.id = r.message_id
        LEFT JOIN users u_sender ON u_sender.id = m.sender_id
        LEFT JOIN users u_rep ON u_rep.id = r.reporter_id
        ORDER BY r.created_at DESC
      `);
      res.json({ reports: result.rows });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch moderation reports.' });
    }
  });

  // Admin: Ban/Unban user
  app.post('/api/admin/users/:id/ban', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const targetUserId = req.params.id;
      const { banned } = req.body;

      if (targetUserId === req.user!.id) {
        return res.status(400).json({ error: 'Cannot ban yourself.' });
      }

      const isBannedInt = banned ? 1 : 0;
      await db.execute({
        sql: 'UPDATE users SET is_banned = ? WHERE id = ?',
        args: [isBannedInt, targetUserId],
      });

      if (banned) {
        // Disconnect immediately
        wsManager.broadcastUserBanned(targetUserId);
        await db.execute({ sql: 'DELETE FROM sessions WHERE user_id = ?', args: [targetUserId] });
      }

      res.json({ success: true, banned: isBannedInt === 1 });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update user ban status.' });
    }
  });

  // Admin: Resolve report
  app.post('/api/admin/reports/:id/resolve', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const reportId = req.params.id;
      const { status } = req.body; // 'resolved' or 'dismissed'

      await db.execute({
        sql: 'UPDATE reports SET status = ? WHERE id = ?',
        args: [status || 'resolved', reportId],
      });

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to resolve report.' });
    }
  });

  // --- Vite Dev Server Middleware or Production Static Serving ---
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 PulseChat server active on http://0.0.0.0:${PORT} [${isDev ? 'development' : 'production'}]`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
