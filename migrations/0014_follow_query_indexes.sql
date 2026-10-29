-- Reduce D1 rows read when loading recent followers/following.
-- These composite indexes support the ID filter and created_at ordering while
-- carrying the joined user ID, avoiding a temporary sort for the list queries.
CREATE INDEX IF NOT EXISTS idx_follows_following_created_at
  ON follows (following_id, created_at DESC, follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower_created_at
  ON follows (follower_id, created_at DESC, following_id);
