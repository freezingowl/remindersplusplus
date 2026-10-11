-- Safe to run again. Never drop/reset this table during a deployment.
CREATE TABLE IF NOT EXISTS cue_quotas (
  route TEXT PRIMARY KEY CHECK (route IN ('parse', 'transcribe')),
  minute_window INTEGER NOT NULL,
  minute_count INTEGER NOT NULL CHECK (minute_count >= 0),
  day_window INTEGER NOT NULL,
  day_count INTEGER NOT NULL CHECK (day_count >= 0)
);

-- Separate quota so the existing AI table/counters do not need replacing.
CREATE TABLE IF NOT EXISTS cue_activity_quotas (
  route TEXT PRIMARY KEY CHECK (route = 'activity'),
  minute_window INTEGER NOT NULL,
  minute_count INTEGER NOT NULL CHECK (minute_count >= 0),
  day_window INTEGER NOT NULL,
  day_count INTEGER NOT NULL CHECK (day_count >= 0)
);
