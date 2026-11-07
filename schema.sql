-- schema.sql — STAR PLUS D1 Database Schema (Minimal Storage)

-- Astronauts / crew members
CREATE TABLE IF NOT EXISTS astronauts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('astronaut', 'flight_medical_officer', 'mission_control')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'standby', 'off-duty')),
  last_checkin TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Vital sign readings
CREATE TABLE IF NOT EXISTS vitals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  astronaut_id TEXT NOT NULL,
  heart_rate INTEGER,
  blood_pressure_systolic INTEGER,
  blood_pressure_diastolic INTEGER,
  oxygen_saturation INTEGER,
  temperature_c REAL,
  timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (astronaut_id) REFERENCES astronauts(id)
);

-- WATCH signals (30-day baselines, 72-hour moving window)
CREATE TABLE IF NOT EXISTS watch_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_type TEXT NOT NULL,
  astronaut_id TEXT NOT NULL,
  baseline_30d TEXT,      -- JSON: { min, max, mean, stddev }
  moving_window_72h TEXT, -- JSON: { current, trend, deviation_pct }
  status TEXT NOT NULL CHECK (status IN ('nominal', 'watch', 'critical')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (astronaut_id) REFERENCES astronauts(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vitals_astronaut_id ON vitals(astronaut_id);
CREATE INDEX IF NOT EXISTS idx_vitals_timestamp ON vitals(timestamp);
CREATE INDEX IF NOT EXISTS idx_watch_signals_astronaut ON watch_signals(astronaut_id);
CREATE INDEX IF NOT EXISTS idx_watch_signals_status ON watch_signals(status);
