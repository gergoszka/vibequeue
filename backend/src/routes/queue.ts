import express, { Request, Response, NextFunction } from 'express';
import { getQueue, addToQueue, removeEntry, advanceQueue, appendPlaylistItems } from '../services/queueService';
import { getPlaylistItems } from '../services/youtubeService';
import { validate } from '../middleware/validate';
import { AppError } from '../types';

const router = express.Router({ mergeParams: true });

// GET /api/rooms/:code/queue
// Returns all pending/playing entries for a room, ordered by position.
router.get('/', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const code = String(req.params.code).toUpperCase();
    const entries = getQueue(code);
    res.status(200).json({ entries });
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 404) {
      res.status(404).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// POST /api/rooms/:code/queue
// Add a song to the queue. Deducts a token from guests.
router.post(
  '/',
  validate({
    youtubeVideoId: {
      rules: ['required', 'youtubeVideoId'],
      message: 'youtubeVideoId must be a valid 11-character YouTube video ID',
    },
    title: {
      rules: ['required', ['minLen', 1], ['maxLen', 200]],
      sanitize: true,
      message: 'title must be 1-200 characters',
    },
    thumbnailUrl: {
      rules: ['url'],
      message: 'thumbnailUrl must be a valid URL',
    },
    durationSeconds: {
      rules: [['min', 1]],
      coerce: 'int',
      message: 'durationSeconds must be a positive integer',
    },
  }),
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const code = String(req.params.code).toUpperCase();
      const body = req.body as {
        youtubeVideoId: string;
        title: string;
        thumbnailUrl?: string | null;
        durationSeconds?: number | null;
      };
      const { youtubeVideoId, title, thumbnailUrl, durationSeconds } = body;

      const entry = addToQueue(code, req.session.id, {
        youtubeVideoId: youtubeVideoId.trim(),
        title: title.trim(),
        thumbnailUrl: thumbnailUrl || null,
        durationSeconds: durationSeconds != null ? Number(durationSeconds) : null,
      });

      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof AppError) {
        if ([404, 410, 402, 403].includes(err.statusCode)) {
          res.status(err.statusCode).json({ error: err.message });
          return;
        }
      }
      next(err);
    }
  }
);

// DELETE /api/rooms/:code/queue/:entryId
// Remove a queue entry. Creator can remove any; guests can only remove their own pending entries.
router.delete('/:entryId', (req: Request, res: Response, next: NextFunction): void => {
  try {
    const code = String(req.params.code).toUpperCase();
    const entryId = String(req.params.entryId);

    removeEntry(code, entryId, req.session.id);
    res.status(204).send();
  } catch (err) {
    if (err instanceof AppError) {
      if (err.statusCode === 404) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err.statusCode === 403) {
        res.status(403).json({ error: err.message });
        return;
      }
    }
    next(err);
  }
});

// POST /api/rooms/:code/queue/advance
// Advance the queue: marks current playing entry as played, promotes next pending.
// Creator only. If the playlist is exhausted and a next page exists, fetches it first.
router.post('/advance', (req: Request, res: Response, next: NextFunction): void => {
  void (async () => {
    try {
      const code = String(req.params.code).toUpperCase();
      let result = advanceQueue(code, req.session.id);

      if (result.type === 'fetch_more_playlist') {
        const accessToken = req.session.youtube?.accessToken;
        let fetched = false;

        if (accessToken) {
          try {
            const { items, nextPageToken } = await getPlaylistItems(
              result.playlistId,
              accessToken,
              result.pageToken
            );
            if (items.length > 0) {
              appendPlaylistItems(code, result.playlistId, items, nextPageToken);
              fetched = true;
            }
          } catch (err) {
            console.warn('[advance] playlist page fetch failed, falling back to loop:', (err as Error).message);
          }
        }

        if (!fetched) {
          // No access token or fetch failed — force a loop by clearing the token in the DB
          // so advanceQueue's loop branch fires on the retry
          appendPlaylistItems(code, result.playlistId, [], undefined);
        }

        // Re-advance now that new (or reset) entries are available
        result = advanceQueue(code, req.session.id);
      }

      const nowPlaying = result.type === 'playing' ? result.entry : null;
      res.status(200).json({ nowPlaying });
    } catch (err) {
      if (err instanceof AppError) {
        if (err.statusCode === 404) {
          res.status(404).json({ error: err.message });
          return;
        }
        if (err.statusCode === 403) {
          res.status(403).json({ error: err.message });
          return;
        }
      }
      next(err);
    }
  })();
});

export default router;
