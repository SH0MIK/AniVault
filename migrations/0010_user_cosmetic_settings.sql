CREATE TABLE IF NOT EXISTS user_cosmetic_settings (
  user_id INTEGER PRIMARY KEY,
  avatar_frame_color TEXT NOT NULL DEFAULT '#62f5ff',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
