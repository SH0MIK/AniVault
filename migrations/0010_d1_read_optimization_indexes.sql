-- Read-path indexes for the high-frequency queries identified in D1 Insights.
-- Safe to apply repeatedly. These indexes do not modify or delete existing data.

-- Profile follower/following lists filter by one side of the relationship
-- and sort newest first. Include the opposite user id to reduce table lookups.
CREATE INDEX IF NOT EXISTS idx_follows_following_created_follower
  ON follows(following_id, created_at DESC, follower_id);

CREATE INDEX IF NOT EXISTS idx_follows_follower_created_following
  ON follows(follower_id, created_at DESC, following_id);

-- The admin dashboard lists recent users and counts registrations by date.
CREATE INDEX IF NOT EXISTS idx_users_created_at
  ON users(created_at DESC);

-- Chat presence is queried by online timestamp and by active typing timestamp.
CREATE INDEX IF NOT EXISTS idx_chat_presence_last_seen
  ON chat_presence(last_seen);

CREATE INDEX IF NOT EXISTS idx_chat_presence_typing_user
  ON chat_presence(typing_until, user_id);

-- Reactions are fetched in batches for the currently displayed message IDs.
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message
  ON chat_reactions(message_id);

-- The VdoHide summary only considers active rows, grouped by anime and ordered
-- by update time. A partial index avoids indexing inactive server records.
CREATE INDEX IF NOT EXISTS idx_vdohide_active_anime_updated
  ON vdohide_servers(anime_id, updated_at DESC)
  WHERE is_active = 1;

