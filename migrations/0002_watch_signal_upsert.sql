-- 0002_watch_signal_upsert.sql
-- One row per (astronaut, signal type), so recomputation can upsert in place.
CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_signals_astronaut_type
  ON watch_signals (astronaut_id, signal_type);

-- Range queries for baseline windows filter on both columns.
CREATE INDEX IF NOT EXISTS idx_vitals_astronaut_time
  ON vitals (astronaut_id, timestamp);
