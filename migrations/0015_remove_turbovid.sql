-- TurboVid has been discontinued and is no longer supported by AniVault.
-- Remove its server records and global feature flag from D1.
DROP TABLE IF EXISTS turbovid_servers;
DELETE FROM settings WHERE `key` = 'turbovid_enabled';
