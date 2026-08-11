// Dub availability, sourced from MyDubList (https://mydublist.com), an
// open-source, MAL-ID-keyed, CC BY 4.0 dataset updated daily, aggregating
// MAL/Jikan, AniList, ANN, AnimeSchedule, aniSearch, Kitsu and curated
// community lists. We mirror it into `dub_status` on a daily cron rather
// than hitting GitHub on every page view.
//
// Attribution requirement (CC BY 4.0) — keep this credit wherever dub
// badges are shown: "Dub data © MyDubList - https://mydublist.com"
import { Db } from './db';

// Curated subset of the 20+ languages MyDubList tracks. Add more language
// keys here any time — see https://github.com/Joelis57/MyDubList for the
// full list of supported `dubbed_<lang>.json` files.
export const DUB_LANGUAGES: Record<string, string> = {
  english: 'English',
  hindi: 'Hindi',
  spanish: 'Spanish',
  german: 'German',
  french: 'French',
  portuguese: 'Portuguese',
  italian: 'Italian',
  korean: 'Korean',
};

const RAW_BASE = 'https://raw.githubusercontent.com/Joelis57/MyDubList/main/dubs/counts';

export const DubStatus = {
  /** Pulls every tracked language's dataset and replaces `dub_status` with it. Best-effort per language — one failing doesn't block the rest. */
  async refresh(db: Db): Promise<{ lang: string; count: number; ok: boolean }[]> {
    const results: { lang: string; count: number; ok: boolean }[] = [];

    for (const lang of Object.keys(DUB_LANGUAGES)) {
      try {
        const res = await fetch(`${RAW_BASE}/dubbed_${lang}.json`);
        if (!res.ok) { results.push({ lang, count: 0, ok: false }); continue; }
        const data = await res.json<Record<string, number>>();
        const ids = Object.keys(data).map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id));

        await db.query('DELETE FROM dub_status WHERE lang = ?', [lang]);
        // D1 batch caps out well before thousands of statements in one
        // call, so chunk the upsert into reasonably sized batches.
        const CHUNK = 400;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          const stmts = chunk.map((id) => db.prepare('INSERT OR IGNORE INTO dub_status (anime_id, lang) VALUES (?, ?)').bind(id, lang));
          await db.batch(stmts);
        }
        results.push({ lang, count: ids.length, ok: true });
      } catch {
        results.push({ lang, count: 0, ok: false });
      }
    }
    return results;
  },

  /** All dubbed languages for one anime, e.g. ['english', 'hindi']. */
  async getFor(db: Db, animeId: number): Promise<string[]> {
    const rows = await db.fetchAll<{ lang: string }>('SELECT lang FROM dub_status WHERE anime_id = ?', [animeId]);
    return rows.map((r) => r.lang);
  },

  /** Bulk lookup for card grids — one query instead of N. Returns a Map so renderAnimeCard call sites can do a cheap .get() per card. */
  async getForMany(db: Db, animeIds: number[]): Promise<Map<number, string[]>> {
    const map = new Map<number, string[]>();
    if (!animeIds.length) return map;
    const placeholders = animeIds.map(() => '?').join(',');
    const rows = await db.fetchAll<{ anime_id: number; lang: string }>(
      `SELECT anime_id, lang FROM dub_status WHERE anime_id IN (${placeholders})`,
      animeIds
    );
    for (const row of rows) {
      const list = map.get(row.anime_id) ?? [];
      list.push(row.lang);
      map.set(row.anime_id, list);
    }
    return map;
  },
};
