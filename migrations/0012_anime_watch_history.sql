-- Daily episode-watch activity used by the profile timeline chart.
-- This intentionally records activity from the point this migration is deployed;
-- it does not fabricate historical data from current anime_list totals.
CREATE TABLE IF NOT EXISTS anime_watch_history (
  user_id INTEGER NOT NULL,
  activity_date TEXT NOT NULL,
  episodes_watched INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, activity_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_anime_watch_history_user_date
  ON anime_watch_history(user_id, activity_date);