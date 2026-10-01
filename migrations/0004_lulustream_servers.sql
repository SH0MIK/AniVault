CREATE TABLE IF NOT EXISTS lulustream_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anime_id INTEGER NOT NULL,
  episode_num INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT 'LuluStream',
  embed_url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(anime_id, episode_num)
);
CREATE INDEX IF NOT EXISTS idx_lulustream_servers_episode ON lulustream_servers(anime_id, episode_num, is_active);