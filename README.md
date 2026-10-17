# PulseChat — Real-Time Chatroom Platform

PulseChat is a full-stack, real-time Discord-inspired web chatroom application featuring persistent SQLite/LibSQL database storage, WebSocket-powered low-latency messaging, image transmission, live emoji reactions, member presence, typing indicators, user profiles, moderation tooling, and full security enforcement.

---

## 🏗️ Architecture Overview

PulseChat uses a unified full-stack architecture running Node.js / Express and Vite on port 3000:

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide icons.
- **Backend API**: Express REST endpoints with authentication, rate limiting, and input sanitization.
- **Real-Time Engine**: Native WebSockets (`ws`) over `http://localhost:3000/ws` handling sub-millisecond broadcasts, channel switching, typing events, and active presence.
- **Database Engine**: `@libsql/client` (SQLite embedded engine) persisted to `./data/pulsechat.db` with indexed foreign keys and ACID transactions.
- **Security & Authentication**: `bcryptjs` for password hashing with salt rounds, 64-character cryptographic tokens for sliding 30-day session persistence, rate limiters on auth and chat actions.

---

## 🗄️ Database Schema

The database is automatically provisioned and migrated on startup in `./server/db.ts`:

### 1. `users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Unique user ID (`usr_...`) |
| `username` | TEXT | UNIQUE NOT NULL | Unique handle (3-24 alphanumeric + `_`) |
| `email` | TEXT | UNIQUE NOT NULL | User contact email |
| `password_hash`| TEXT | NOT NULL | Salted bcrypt hash |
| `display_name` | TEXT | NOT NULL | Public display name |
| `avatar_url` | TEXT | NOT NULL | Avatar image URL or uploaded file |
| `bio` | TEXT | DEFAULT '' | User bio / About Me |
| `custom_status`| TEXT | DEFAULT '' | Status banner (e.g. "Coding ⚡") |
| `role` | TEXT | DEFAULT 'user' | `'user'`, `'moderator'`, or `'admin'` |
| `is_banned` | INTEGER | DEFAULT 0 | 1 = banned, 0 = active |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |
| `last_seen_at` | TEXT | NOT NULL | Last active timestamp |

### 2. `sessions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Session ID (`sess_...`) |
| `token` | TEXT | UNIQUE NOT NULL | Cryptographic token |
| `user_id` | TEXT | FOREIGN KEY(users) | Owner user ID |
| `created_at` | TEXT | NOT NULL | Creation timestamp |
| `expires_at` | TEXT | NOT NULL | Sliding expiration (30 days) |
| `user_agent` | TEXT | DEFAULT '' | Browser / client identifier |

### 3. `channels`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Channel ID (`chan_...`) |
| `name` | TEXT | UNIQUE NOT NULL | Slugified name (e.g. `general-chat`) |
| `description` | TEXT | DEFAULT '' | Channel topic |
| `is_private` | INTEGER | DEFAULT 0 | 0 = public, 1 = restricted |
| `created_by` | TEXT | NOT NULL | Creator user ID |
| `created_at` | TEXT | NOT NULL | Creation timestamp |

### 4. `messages`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Message ID (`msg_...`) |
| `channel_id` | TEXT | FOREIGN KEY(channels)| Channel ID (NULL if Direct Message) |
| `sender_id` | TEXT | FOREIGN KEY(users) | Author user ID |
| `recipient_id` | TEXT | NULLABLE | Recipient user ID for 1-on-1 DMs |
| `content` | TEXT | NOT NULL | Message text body |
| `image_url` | TEXT | NULLABLE | Attached image URL |
| `reply_to_id` | TEXT | NULLABLE | Quoted parent message ID |
| `is_pinned` | INTEGER | DEFAULT 0 | 1 = pinned to channel |
| `is_edited` | INTEGER | DEFAULT 0 | 1 = edited |
| `created_at` | TEXT | NOT NULL | Creation timestamp |
| `updated_at` | TEXT | NOT NULL | Last modification timestamp |

### 5. `reactions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Reaction ID (`react_...`) |
| `message_id` | TEXT | FOREIGN KEY(messages)| Target message |
| `user_id` | TEXT | FOREIGN KEY(users) | Reactor user |
| `emoji` | TEXT | NOT NULL | Unicode emoji character |
| `created_at` | TEXT | NOT NULL | Timestamp |
| *Constraint* | UNIQUE(message_id, user_id, emoji) | Prevents duplicate user reactions |

### 6. `reports`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | Report ID (`rep_...`) |
| `message_id` | TEXT | FOREIGN KEY(messages)| Flagged message |
| `reporter_id`| TEXT | FOREIGN KEY(users) | Reporter user ID |
| `reason` | TEXT | NOT NULL | Flag reason |
| `status` | TEXT | DEFAULT 'pending' | `'pending'`, `'resolved'`, `'dismissed'`|
| `created_at` | TEXT | NOT NULL | Submission timestamp |

### 7. `blocked_users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `user_id` | TEXT | PRIMARY KEY(user_id, blocked_user_id) | Blocking user |
| `blocked_user_id` | TEXT | PRIMARY KEY(user_id, blocked_user_id) | Blocked user |
| `created_at` | TEXT | NOT NULL | Timestamp |

---

## 🔌 API Endpoints Reference

### Authentication
- `POST /api/auth/signup`: Create a new user account with unique username, email, display name, and password. Returns session token and user profile.
- `POST /api/auth/login`: Authenticate with username or email and password. Returns session token and user profile.
- `POST /api/auth/logout`: Revoke active session token.
- `GET /api/auth/me`: Retrieve current user profile using `Authorization: Bearer <token>`.

### Media Uploads
- `POST /api/upload`: Upload image (JPG, PNG, GIF, WebP) with strict MIME validation and 8MB limit. Returns static `/uploads/<id>.<ext>` URL.

### Channels
- `GET /api/channels`: List public and joined chat channels.
- `POST /api/channels`: Create a new channel (broadcasts live `channel_created` to all clients).
- `GET /api/channels/:id/messages`: Retrieve hydrated message history (with avatars, senders, reactions, and replies).
- `GET /api/channels/:id/pins`: Retrieve pinned messages for a channel.

### Direct Messaging
- `GET /api/dms`: Fetch active DM threads and recent conversations.
- `GET /api/dms/:userId/messages`: Fetch 1-on-1 private messaging history between current user and counterpart.

### Search & Moderation
- `GET /api/messages/search?q=...&channelId=...`: Fast full-text search across messages.
- `POST /api/messages/:id/report`: Flag a message for moderator inspection.
- `GET /api/admin/reports`: List all moderation reports (Admins/Moderators only).
- `POST /api/admin/reports/:id/resolve`: Resolve or dismiss a report.
- `POST /api/admin/users/:id/ban`: Ban user and terminate active WebSocket connections.

---

## ⚡ WebSocket Protocols (`/ws`)

### Client Actions (`WsClientAction`)
- `{ type: 'auth', token: string }`
- `{ type: 'join_channel', channelId: string }`
- `{ type: 'send_message', channelId?, recipientId?, content, imageUrl?, replyToId? }`
- `{ type: 'edit_message', messageId, content }`
- `{ type: 'delete_message', messageId }`
- `{ type: 'toggle_reaction', messageId, emoji }`
- `{ type: 'toggle_pin', messageId }`
- `{ type: 'typing', channelId?, recipientId?, isTyping: boolean }`
- `{ type: 'update_status', status: 'online' | 'idle' | 'dnd', customStatus? }`

### Server Broadcasts (`WsServerEvent`)
- `auth_success` / `auth_error`
- `new_message`: Dispatched to channel subscribers or DM participants immediately.
- `reaction_updated`: Real-time aggregated reaction counts and user lists.
- `message_edited`: Live updates to message content and `(edited)` timestamp.
- `message_deleted`: Instant DOM removal of deleted messages.
- `message_pinned`: Live pin/unpin notification.
- `user_typing`: Live typing indicators with 3.5s automatic fallback expiration.
- `online_users`: Real-time presence roster.
- `channel_created`: Dynamic channel roster addition.
- `user_banned`: Force-disconnect and session eviction for banned accounts.

---

## 🛡️ Security Best Practices Enforced

1. **Password Security**: Passwords are never stored in plain text; salted with `bcryptjs` 10 rounds.
2. **Session Hijacking Prevention**: Session tokens are 32 random bytes (64-character hex strings) verified against active database records with sliding expiry.
3. **No Impersonation**: Senders cannot forge `sender_id`; the server strictly derives the author from the validated session token.
4. **Input Sanitization & Injection Prevention**: SQL queries use prepared parameterized statements via LibSQL to eliminate SQL injection. Content is sanitized against XSS attacks.
5. **Rate Limiting**: Sliding in-memory rate limiters restrict auth brute-force attempts and throttle spam messages (max 8 messages per 5 seconds).
6. **File Upload Hardening**: MIME types are checked strictly against allowed image formats (`image/jpeg`, `image/png`, `image/webp`, `image/gif`), payload size is capped at 8MB, and randomly generated UUID filenames prevent path traversal vulnerabilities.
7. **Ban Enforcement**: Banned users are rejected in HTTP middleware and immediately terminated if connected to WebSockets.

---

## 🚀 Setup & Development Instructions

### Prerequisites
- Node.js 20+

### Installation
```bash
npm install
```

### Running Locally
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### Default Seed Accounts
For convenient verification, default accounts are seeded if the database is freshly created:
- **Admin**: Username `Admin` | Password `Admin@12345` (Full moderation capabilities)
- **PulseBot**: Automated chat assistant & moderator
- **Or**: Click **"Instant Pilot Account"** or **"Create Your Free Account"** on the landing page for immediate registration.
