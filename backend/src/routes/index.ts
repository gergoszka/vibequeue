import type { Express } from 'express';
import roomsRouter from './rooms';
import queueRouter from './queue';
import { tokenStatusHandler } from './tokenRoutes';
import authRouter from './auth';
import searchRouter from './search';
import youtubeRouter from './youtubeRoutes';

export function registerRoutes(app: Express): void {
  app.use('/api/rooms', roomsRouter);
  // Queue routes are nested under /api/rooms/:code/queue
  app.use('/api/rooms/:code/queue', queueRouter);
  // Token status is room-scoped: GET /api/rooms/:code/token-status
  app.get('/api/rooms/:code/token-status', tokenStatusHandler);
  app.use('/api/auth', authRouter);
  app.use('/api/search', searchRouter);
  app.use('/api/youtube', youtubeRouter);
}
