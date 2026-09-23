CREATE TABLE IF NOT EXISTS turbovid_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anime_id INTEGER NOT NULL,
  episode_num INTEGER NOT NULL,
  audio_group TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  embed_url TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(anime_id, episode_num, audio_group, language)
);
CREATE INDEX IF NOT EXISTS idx_turbovid_servers_episode ON turbovid_servers(anime_id, episode_num, is_active);