import { Db } from './db';

/** Map of anime_id -> status for a user's list. Used by anime cards to show
 * "Edit in List" vs "Add to List" and the status badge. */
export async function getUserAnimeStatuses(db: Db, userId: number | null): Promise<Record<number, string>> {
  if (!userId) return {};
  const rows = await db.fetchAll<{ anime_id: number; status: string }>(
    'SELECT anime_id, status FROM anime_list WHERE user_id = ?',
    [userId]
  );
  const map: Record<number, string> = {};
  for (const r of rows) map[r.anime_id] = r.status;
  return map;
}
