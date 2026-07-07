declare module 'connect-sqlite3' {
  import session from 'express-session';
  function SQLiteStore(s: typeof session): new (options?: {
    db?: string;
    dir?: string;
    table?: string;
  }) => session.Store;
  export = SQLiteStore;
}
