import path from 'path';
import fs from 'fs';
import session from 'express-session';
import Database from 'better-sqlite3';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const sessionDb = new Database(path.join(DATA_DIR, 'sessions.db'));
sessionDb.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid     TEXT    PRIMARY KEY NOT NULL,
    sess    TEXT    NOT NULL,
    expired INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expired_idx ON sessions (expired);
`);

const ONE_DAY_S = 24 * 60 * 60;

class BetterSQLiteStore extends session.Store {
  constructor(private db: Database.Database, private ttl = ONE_DAY_S) {
    super();
    setInterval(() => {
      db.prepare('DELETE FROM sessions WHERE expired < ?').run(Date.now());
    }, 15 * 60 * 1000).unref();
  }

  get(sid: string, callback: (err: unknown, session?: session.SessionData | null) => void): void {
    try {
      const row = this.db
        .prepare('SELECT sess FROM sessions WHERE sid = ? AND expired > ?')
        .get(sid, Date.now()) as { sess: string } | undefined;
      callback(null, row ? (JSON.parse(row.sess) as session.SessionData) : null);
    } catch (e) {
      callback(e);
    }
  }

  set(sid: string, sess: session.SessionData, callback: (err?: unknown) => void): void {
    try {
      const ttl = sess.cookie?.maxAge != null ? Math.ceil(sess.cookie.maxAge / 1000) : this.ttl;
      this.db
        .prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)')
        .run(sid, JSON.stringify(sess), Date.now() + ttl * 1000);
      callback();
    } catch (e) {
      callback(e);
    }
  }

  destroy(sid: string, callback: (err?: unknown) => void): void {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      callback();
    } catch (e) {
      callback(e);
    }
  }

  touch(sid: string, sess: session.SessionData, callback: (err?: unknown) => void): void {
    try {
      const ttl = sess.cookie?.maxAge != null ? Math.ceil(sess.cookie.maxAge / 1000) : this.ttl;
      this.db
        .prepare('UPDATE sessions SET expired = ? WHERE sid = ?')
        .run(Date.now() + ttl * 1000, sid);
      callback();
    } catch (e) {
      callback(e);
    }
  }
}

if (!process.env.SESSION_SECRET) {
  console.warn(
    '[session] WARNING: SESSION_SECRET is not set. Using insecure fallback — do not use in production.'
  );
}

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'dev-fallback-secret-change-me',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store: new BetterSQLiteStore(sessionDb),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ONE_DAY_S * 1000,
  },
});

export default sessionMiddleware;
