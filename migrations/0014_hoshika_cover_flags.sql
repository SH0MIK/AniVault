CREATE TABLE IF NOT EXISTS hoshika_cover_flags (
  anime_id INTEGER PRIMARY KEY,
  anime_title TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT 'No Hoshika coverImage found',
  status TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('missing', 'resolved')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hoshika_cover_flags_status_updated
  ON hoshika_cover_flags(status, updated_at DESC);
