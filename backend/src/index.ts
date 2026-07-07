import 'dotenv/config';
import './db'; // initialize database

import http from 'http';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import corsMiddleware from './middleware/cors';
import sessionMiddleware from './middleware/session';
import { registerRoutes } from './routes';
import { createWsServer } from './ws/wsServer';
import { startInactivityWatcher } from './services/cleanupService';
import { startTokenScheduler } from './services/tokenService';
import { db } from './db';
import { AppError } from './types';

const app = express();
const PORT: string | number = process.env.PORT || 3001;

// Middleware: cors → json body parser → session
app.use(corsMiddleware);
app.use(express.json({ limit: '100kb' }));
app.use(sessionMiddleware);

// Routes
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', sessionId: req.session.id });
});

// Test route to verify error middleware
app.get('/health/error', (_req: Request, _res: Response) => {
  throw new Error('test');
});

registerRoutes(app);

// In production, serve the frontend SPA from ./public
if (process.env.NODE_ENV === 'production') {
  const publicDir = path.join(__dirname, '../public');
  app.use(express.static(publicDir));
  app.get('*', (_req, res, next) => {
    if (_req.path.startsWith('/api') || _req.path === '/health') return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

startInactivityWatcher();

// Restart token schedulers for rooms that were active before this server boot
const activeRooms = db
  .prepare('SELECT id, code FROM rooms WHERE is_active = 1')
  .all() as Array<{ id: string; code: string }>;
for (const room of activeRooms) {
  startTokenScheduler(room.id, room.code);
}
if (activeRooms.length > 0) {
  console.log(`[token] Restarted schedulers for ${activeRooms.length} active room(s)`);
}

// 404 handler — must come after all routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler — 4-arg signature required by Express
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { type?: string; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  // Malformed JSON body — Express body-parser emits a SyntaxError with this type
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

const httpServer = http.createServer(app);
createWsServer(httpServer);
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
