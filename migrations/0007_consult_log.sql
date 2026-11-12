CREATE TABLE IF NOT EXISTS consult_log (
  crew_id TEXT NOT NULL,
  device_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_consult_log_window ON consult_log (crew_id, device_id, created_at);
