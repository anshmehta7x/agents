import { db } from "../db/sqlite";

export function initObservabilitySchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id     TEXT    NOT NULL,
      type       TEXT    NOT NULL,
      payload    TEXT    NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
    CREATE INDEX IF NOT EXISTS idx_events_type   ON events(type);
  `);
}
