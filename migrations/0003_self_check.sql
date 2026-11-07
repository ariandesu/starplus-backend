-- 0003_self_check.sql — Self-check tables beside the old ones.
-- Old tables (astronauts, vitals, watch_signals) are untouched; no backfill.

CREATE TABLE IF NOT EXISTS crew (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('astronaut', 'flight_medical_officer', 'mission_control')),
  provenance TEXT NOT NULL CHECK (provenance IN ('real', 'synthetic', 'simulated_device')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS measurements (
  client_id TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL REFERENCES crew(id),
  metric TEXT NOT NULL,
  value_num REAL,
  value_text TEXT,
  unit TEXT,
  measured_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'questionnaire', 'test', 'import', 'ble', 'voice', 'ocr', 'camera_hr')),
  device_id TEXT NOT NULL,
  capture_id TEXT,
  is_estimate INTEGER NOT NULL CHECK (is_estimate IN (0, 1)),
  confirmed_by_user INTEGER NOT NULL CHECK (confirmed_by_user IN (0, 1)),
  provenance TEXT NOT NULL CHECK (provenance IN ('real', 'synthetic', 'simulated_device')),
  setting TEXT NOT NULL CHECK (setting IN ('iss', 'mars_transit', 'moon_base', 'rover')),
  phase TEXT NOT NULL CHECK (phase IN ('preflight', 'inflight', 'surface', 'postflight')),
  phase_day INTEGER,
  supersedes_client_id TEXT,
  voided INTEGER NOT NULL DEFAULT 0 CHECK (voided IN (0, 1)),
  catalog_version TEXT NOT NULL,
  schema_version INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_measurements_crew_metric_time
  ON measurements (crew_id, metric, measured_at);
CREATE INDEX IF NOT EXISTS idx_measurements_received
  ON measurements (received_at);

CREATE TABLE IF NOT EXISTS results (
  client_id TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL REFERENCES crew(id),
  assessed_at TEXT NOT NULL,
  overall_status TEXT NOT NULL CHECK (overall_status IN ('insufficient', 'nominal', 'watch', 'critical')),
  per_measure_json TEXT NOT NULL,
  model_advice_json TEXT,
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  catalog_version TEXT NOT NULL,
  kb_version TEXT NOT NULL,
  inputs_hash TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_results_crew_assessed
  ON results (crew_id, assessed_at);
CREATE INDEX IF NOT EXISTS idx_results_received_client
  ON results (received_at, client_id);

CREATE TABLE IF NOT EXISTS reports (
  client_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  submitted_by TEXT NOT NULL,
  subject_crew_id TEXT,
  subject_label TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('emergency', 'routine')),
  created_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  summary_text TEXT,
  summary_edited INTEGER NOT NULL CHECK (summary_edited IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('delivered', 'acknowledged')),
  acknowledged_by TEXT,
  acknowledged_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_status_received
  ON reports (status, received_at);

CREATE TABLE IF NOT EXISTS access_codes (
  code_hash TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL REFERENCES crew(id),
  created_at TEXT NOT NULL,
  used_at TEXT,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL REFERENCES crew(id),
  role TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_sessions_crew
  ON sessions (crew_id);
