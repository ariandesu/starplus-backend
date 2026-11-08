-- 0004_demo_login.sql — demo sessions and fixed demo crew support.
-- Adds a demo flag to sessions; demo crew rows are created on first demo login.

ALTER TABLE sessions ADD COLUMN demo INTEGER NOT NULL DEFAULT 0 CHECK (demo IN (0, 1));
