import { Db } from './db';

/**
 * Safe bridge between Hoshika's canonical short IDs and IDs already stored in
 * AniVault's user data / streaming tables. This module never guesses a match
 * from a title and never rewrites user-owned rows.
 */
export interface AnimeIdentity {
  [key: string]: unknown;
  hoshika_short_id: string;
  legacy_mal_id: number | null;
  hoshika_uuid: string | null;
  slug: string;
  title: string;
  mapping_source: string;
  verified: number;
}

export async function findIdentityByHoshikaId(db: Db, shortId: string | number): Promise<AnimeIdentity | null> {
  const id = String(shortId ?? '').trim();
  if (!id) return null;
  return db.fetchOne<AnimeIdentity>(
    'SELECT hoshika_short_id, legacy_mal_id, hoshika_uuid, slug, title, mapping_source, verified FROM anime_identity_map WHERE hoshika_short_id = ?',
    [id],
  );
}

export async function findIdentityByLegacyMalId(db: Db, malId: number): Promise<AnimeIdentity | null> {
  if (!Number.isSafeInteger(malId) || malId <= 0) return null;
  return db.fetchOne<AnimeIdentity>(
    'SELECT hoshika_short_id, legacy_mal_id, hoshika_uuid, slug, title, mapping_source, verified FROM anime_identity_map WHERE legacy_mal_id = ?',
    [malId],
  );
}

/**
 * Register a Hoshika record without claiming a MAL mapping. Only call
 * linkVerifiedLegacyMalId after a mapping has been explicitly verified.
 */
export async function rememberHoshikaIdentity(
  db: Db,
  anime: { shortId: string | number; id?: string; slug?: string; title?: string },
): Promise<void> {
  const shortId = String(anime.shortId ?? '').trim();
  if (!shortId) return;
  await db.query(
    `INSERT INTO anime_identity_map
      (hoshika_short_id, hoshika_uuid, slug, title, mapping_source, verified, updated_at)
     VALUES (?, ?, ?, ?, 'hoshika', 0, datetime('now'))
     ON CONFLICT(hoshika_short_id) DO UPDATE SET
       hoshika_uuid = COALESCE(NULLIF(excluded.hoshika_uuid, ''), anime_identity_map.hoshika_uuid),
       slug = CASE WHEN excluded.slug != '' THEN excluded.slug ELSE anime_identity_map.slug END,
       title = CASE WHEN excluded.title != '' THEN excluded.title ELSE anime_identity_map.title END,
       updated_at = datetime('now')`,
    [shortId, anime.id ?? '', anime.slug ?? '', anime.title ?? ''],
  );
}

/**
 * Attach a legacy MAL ID only when a human or trusted migration process has
 * verified the exact match. INSERT OR IGNORE prevents a conflicting mapping
 * from silently stealing either canonical ID.
 */
export async function linkVerifiedLegacyMalId(
  db: Db,
  shortId: string | number,
  malId: number,
): Promise<boolean> {
  const id = String(shortId ?? '').trim();
  if (!id || !Number.isSafeInteger(malId) || malId <= 0) return false;
  const existing = await findIdentityByHoshikaId(db, id);
  if (existing?.legacy_mal_id === malId && existing.verified === 1) return true;
  if (existing?.legacy_mal_id && existing.legacy_mal_id !== malId) return false;
  const other = await findIdentityByLegacyMalId(db, malId);
  if (other && other.hoshika_short_id !== id) return false;
  await db.query(
    `INSERT INTO anime_identity_map
      (hoshika_short_id, legacy_mal_id, mapping_source, verified, updated_at)
     VALUES (?, ?, 'verified-migration', 1, datetime('now'))
     ON CONFLICT(hoshika_short_id) DO UPDATE SET
       legacy_mal_id = excluded.legacy_mal_id,
       mapping_source = 'verified-migration',
       verified = 1,
       updated_at = datetime('now')
     WHERE anime_identity_map.legacy_mal_id IS NULL OR anime_identity_map.legacy_mal_id = excluded.legacy_mal_id`,
    [id, malId],
  );
  const verified = await findIdentityByHoshikaId(db, id);
  return verified?.legacy_mal_id === malId && verified.verified === 1;
}
