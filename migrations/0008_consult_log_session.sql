ALTER TABLE consult_log ADD COLUMN session_id TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_consult_log_session ON consult_log (session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_consult_log_created ON consult_log (created_at);
