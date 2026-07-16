import express, { Request, Response, NextFunction } from 'express';
import { getUserPlaylists, getPlaylistItemsWithDuration } from '../services/youtubeService';

const router = express.Router();

function isInsufficientScopeError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  return msg.includes('insufficient') || msg.includes('scope');
}

// GET /api/youtube/playlists
router.get('/playlists', (req: Request, res: Response, next: NextFunction): void => {
  void (async () => {
    try {
      const accessToken = req.session.youtube?.accessToken;
      if (!accessToken) {
        res.status(401).json({ error: 'Not authenticated with YouTube' });
        return;
      }

      const pageToken = req.query.pageToken as string | undefined;
      const { playlists, nextPageToken } = await getUserPlaylists(accessToken, pageToken);
      res.status(200).json({ playlists, nextPageToken });
    } catch (err) {
      if (isInsufficientScopeError(err)) {
        res.status(403).json({ code: 'scope_error', error: 'YouTube permissions need to be renewed. Please reconnect your account.' });
        return;
      }
      next(err);
    }
  })();
});

// GET /api/youtube/playlists/:playlistId/items
router.get('/playlists/:playlistId/items', (req: Request, res: Response, next: NextFunction): void => {
  void (async () => {
    try {
      const accessToken = req.session.youtube?.accessToken;
      if (!accessToken) {
        res.status(401).json({ error: 'Not authenticated with YouTube' });
        return;
      }

      const playlistId = String(req.params.playlistId);
      const pageToken = req.query.pageToken as string | undefined;
      const musicOnly = req.query.musicOnly === 'true';

      const { items, nextPageToken } = await getPlaylistItemsWithDuration(
        playlistId,
        accessToken,
        pageToken,
        musicOnly
      );
      res.status(200).json({ items, nextPageToken });
    } catch (err) {
      if (isInsufficientScopeError(err)) {
        res.status(403).json({ code: 'scope_error', error: 'YouTube permissions need to be renewed. Please reconnect your account.' });
        return;
      }
      next(err);
    }
  })();
});

export default router;
