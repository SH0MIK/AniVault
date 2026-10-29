-- Reduce full-table scans and avoid temporary sorting for common profile/admin queries.
-- These indexes are additive and safe to apply to an existing D1 database.

CREATE INDEX IF NOT EXISTS idx_users_last_login
  ON users(last_login);

CREATE INDEX IF NOT EXISTS idx_users_created_at
  ON users(created_at);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at
  ON activity_log(created_at DESC);

-- Support follower/following lists in newest-first order without a temp sort.
CREATE INDEX IF NOT EXISTS idx_follows_following_created
  ON follows(following_id, created_at DESC, follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower_created
  ON follows(follower_id, created_at DESC, following_id);
