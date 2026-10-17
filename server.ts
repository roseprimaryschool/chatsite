import http from 'http';
import path from 'path';
import express from 'express';
import { app, setWsManager } from './server/app.js';
import { setupWebSocketServer } from './server/ws.js';
import { ensureDatabaseInitialized } from './server/db.js';

const PORT = 3000;
const isDev = process.env.NODE_ENV !== 'production';

async function startServer() {
  await ensureDatabaseInitialized();

  const httpServer = http.createServer(app);

  // Initialize WebSocket server
  const wsManager = setupWebSocketServer(httpServer);
  setWsManager(wsManager);

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
