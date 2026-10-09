-- AniVault Points: wallets, immutable ledger, daily task claims, cosmetics catalog and ownership.
CREATE TABLE IF NOT EXISTS points_wallets (
  user_id INTEGER PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  lifetime_spent INTEGER NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS points_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL CHECK (amount != 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  event_type TEXT NOT NULL,
  event_key TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, event_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_points_ledger_user_created ON points_ledger(user_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS points_daily_claims (
  user_id INTEGER NOT NULL,
  task_key TEXT NOT NULL,
  claim_date TEXT NOT NULL,
  points INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(user_id, task_key, claim_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS points_catalog (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'sparkles',
  price INTEGER NOT NULL CHECK (price >= 0),
  cosmetic_type TEXT NOT NULL,
  cosmetic_value TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS points_inventory (
  user_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  purchased_at TEXT NOT NULL DEFAULT (datetime('now')),
  equipped INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, item_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES points_catalog(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_points_inventory_equipped ON points_inventory(user_id, equipped);

INSERT OR IGNORE INTO points_catalog(id,category,name,description,icon,price,cosmetic_type,cosmetic_value,sort_order) VALUES
('frame-sakura','Avatar Frames','Sakura Frame','Soft cherry blossoms for your avatar.','flower-2',700,'avatar_frame','sakura',10),
('frame-gold','Avatar Frames','Gold Frame','A clean golden frame for your avatar.','circle',1000,'avatar_frame','gold',20),
('frame-neon','Avatar Frames','Neon Frame','A vivid neon outline around your avatar.','zap',1200,'avatar_frame','neon',30),
('bg-constellation','Backgrounds','Constellations','A starry night profile background.','sparkles',1200,'profile_background','constellation',10),
('bg-sakura','Backgrounds','Sakura Garden','A calm cherry blossom profile theme.','flower-2',1600,'profile_background','sakura',20),
('bg-midnight','Backgrounds','Midnight Grid','A subtle midnight grid pattern.','grid-2x2',1000,'profile_background','midnight',30),
('name-gradient','Name Styles','Gradient Name','A colorful gradient username.','palette',900,'name_style','gradient',10),
('name-gold','Name Styles','Gold Name','Give your username a golden finish.','star',1300,'name_style','gold',20),
('flair-anime-fan','Flair','Anime Fan','Show everyone your love for anime.','heart',500,'flair','anime-fan',10),
('flair-night-owl','Flair','Night Owl','For late-night episode marathons.','moon',700,'flair','night-owl',20),
('effect-sparkle','Effects','Profile Sparkle','A subtle sparkle effect for your profile.','sparkles',2200,'profile_effect','sparkle',10),
('badge-pioneer','Badges','Pioneer Badge','A collectible badge for early supporters.','award',2000,'badge','pioneer',10);

-- Server-timed playback progression prevents a single forged 90% progress
-- request from immediately granting an episode reward.
CREATE TABLE IF NOT EXISTS points_watch_sessions (
  user_id INTEGER NOT NULL,
  anime_id INTEGER NOT NULL,
  episode_num INTEGER NOT NULL,
  last_position INTEGER NOT NULL DEFAULT 0,
  watched_seconds INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL,
  rewarded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, anime_id, episode_num),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
