-- Per-session demo acknowledgements: a demo visitor's ack of a demo-crew
-- report is stored here and applied only to that session, so the shared
-- seeded row stays delivered for every later visitor. Cleared on reset.
CREATE TABLE IF NOT EXISTS demo_acks (
  session_hash TEXT NOT NULL,
  report_client_id TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL,
  PRIMARY KEY (session_hash, report_client_id)
);
