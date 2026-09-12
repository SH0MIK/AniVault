CREATE TABLE IF NOT EXISTS push_tokens (
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  platform TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, token)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON push_tokens(user_id);
