-- Seed only an explicitly verified cross-catalog mapping.
-- This does not rewrite any existing watch/list/progress rows.
INSERT INTO anime_identity_map
  (hoshika_short_id, legacy_mal_id, slug, title, mapping_source, verified, updated_at)
SELECT
  '33374', 16498, 'attack-on-titan', 'Attack on Titan', 'verified-seed', 1, datetime('now')
WHERE NOT EXISTS (
  SELECT 1
  FROM anime_identity_map
  WHERE legacy_mal_id = 16498 AND hoshika_short_id != '33374'
)
ON CONFLICT(hoshika_short_id) DO UPDATE SET
  legacy_mal_id = excluded.legacy_mal_id,
  slug = excluded.slug,
  title = excluded.title,
  mapping_source = excluded.mapping_source,
  verified = 1,
  updated_at = datetime('now')
WHERE anime_identity_map.legacy_mal_id IS NULL
   OR anime_identity_map.legacy_mal_id = excluded.legacy_mal_id;
