CREATE TABLE IF NOT EXISTS anime_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anime_id INTEGER NOT NULL,
  episode_num INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  parent_id INTEGER,
  body TEXT NOT NULL,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (parent_id) REFERENCES anime_comments(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_anime_comments_episode ON anime_comments(anime_id, episode_num, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_anime_comments_parent ON anime_comments(parent_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_anime_comments_user ON anime_comments(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS anime_comment_votes (
  comment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (comment_id, user_id),
  FOREIGN KEY (comment_id) REFERENCES anime_comments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_anime_comment_votes_comment ON anime_comment_votes(comment_id);
