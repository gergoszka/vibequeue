import path from 'path';
import session from 'express-session';
import SQLiteStoreFactory from 'connect-sqlite3';

if (!process.env.SESSION_SECRET) {
  console.warn(
    '[session] WARNING: SESSION_SECRET is not set. Using insecure fallback — do not use in production.'
  );
}

const SQLiteStore = SQLiteStoreFactory(session);
const store = new SQLiteStore({
  db: 'sessions.db',
  dir: process.env.DATA_DIR || path.join(__dirname, '../../data'),
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'dev-fallback-secret-change-me',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ONE_DAY_MS,
  },
});

export default sessionMiddleware;
