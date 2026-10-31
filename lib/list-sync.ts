// List-sync for MyAnimeList and AniList: OAuth connect (with auto-fetched
// username, mirroring how Discord/Google login works), a one-time "merge"
// pull-sync run on connect (only adds entries missing locally — never
// touches/overwrites anything already on the site list), and a push-sync
// helper called after every local list write so the connected account(s)
// stay current going forward.
//
// MAL requires PKCE (code_verifier/code_challenge) on its OAuth flow, and
// only supports the "plain" challenge method (the challenge is just the
// verifier itself, no SHA256 step) — see
// https://myanimelist.net/apiconfig/references/authorization
//
// AniList is a standard OAuth2 authorization-code flow against a GraphQL
// API (https://graphql.anilist.co). Its access tokens are long-lived
// (~1 year) and it doesn't hand out refresh tokens for the standard
// "Authorization Code" grant, so unlike MAL there's no refresh step here
// — once the token expires the user just reconnects.
import type { Env } from '../index';
import { Db } from './db';

export const LOCAL_STATUSES = ['watching', 'completed', 'plan_to_watch', 'dropped', 'on_hold'] as const;
type LocalStatus = (typeof LOCAL_STATUSES)[number];

// AniList status <-> local status mapping is duplicated in
// scripts/anilist-sync-relay.mjs (the relay does the actual AniList-side
// pull, not this file) — keep the two in sync if either changes.
const LOCAL_STATUS_TO_ANILIST: Record<LocalStatus, string> = {
  watching: 'CURRENT', plan_to_watch: 'PLANNING', completed: 'COMPLETED', dropped: 'DROPPED', on_hold: 'PAUSED',
};

async function getLocalAnimeImage(db: Db, animeId: number): Promise<string> {
  if (!animeId) return '';
  const row = await db.fetchOne<{ image_url: string }>('SELECT image_url FROM anime_images WHERE anime_id = ?', [animeId]);
  return row ? (row.image_url as string) : '';
}

// =====================================================================
// MyAnimeList
// =====================================================================

export const MalSync = {
  getAuthUrl(env: Env, session: { data: Record<string, any> }): string {
    // MAL's PKCE only supports "plain", so the verifier IS the challenge.
    const verifier = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const state = crypto.randomUUID().replace(/-/g, '');
    session.data.mal_sync_verifier = verifier;
    session.data.mal_sync_state = state;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: env.MAL_CLIENT_ID ?? '',
      code_challenge: verifier,
      code_challenge_method: 'plain',
      state,
      redirect_uri: env.MAL_REDIRECT_URI ?? '',
    });
    return `https://myanimelist.net/v1/oauth2/authorize?${params.toString()}`;
  },

  async handleCallback(env: Env, db: Db, session: { data: Record<string, any> }, userId: number, code: string, state: string): Promise<{ success: boolean; message: string }> {
    if (!session.data.mal_sync_state || state !== session.data.mal_sync_state) {
      return { success: false, message: 'Invalid or expired MAL authorization — please try connecting again.' };
    }
    const verifier = session.data.mal_sync_verifier;
    delete session.data.mal_sync_state;
    delete session.data.mal_sync_verifier;

    const tokenRes = await fetch('https://myanimelist.net/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.MAL_CLIENT_ID ?? '',
        client_secret: env.MAL_CLIENT_SECRET ?? '',
        code,
        code_verifier: verifier ?? '',
        grant_type: 'authorization_code',
        redirect_uri: env.MAL_REDIRECT_URI ?? '',
      }),
    });
    const token = await tokenRes.json<any>().catch(() => null);
    if (!token?.access_token) {
      const detail = token?.error_description || token?.error || `HTTP ${tokenRes.status}`;
      return { success: false, message: `MAL token exchange failed: ${detail}` };
    }

    const meRes = await fetch('https://api.myanimelist.net/v2/users/@me?fields=id,name', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const me = await meRes.json<any>().catch(() => null);
    if (!me?.name) return { success: false, message: 'Connected, but could not fetch your MAL username.' };

    const expiresAt = Math.floor(Date.now() / 1000) + Number(token.expires_in ?? 3600);
    await db.query(
      `UPDATE users SET mal_sync_username=?, mal_sync_access_token=?, mal_sync_refresh_token=?, mal_sync_token_expires=? WHERE id=?`,
      [me.name, token.access_token, token.refresh_token ?? null, expiresAt, userId]
    );
    return { success: true, message: `Connected to MyAnimeList as ${me.name}!` };
  },

  async disconnect(db: Db, userId: number): Promise<void> {
    await db.query(
      `UPDATE users SET mal_sync_username=NULL, mal_sync_access_token=NULL, mal_sync_refresh_token=NULL, mal_sync_token_expires=NULL WHERE id=?`,
      [userId]
    );
  },

  /** Returns a live access token, transparently refreshing if it's expired. */
  async getValidToken(env: Env, db: Db, userId: number): Promise<string | null> {
    const user = await db.fetchOne<any>('SELECT mal_sync_access_token, mal_sync_refresh_token, mal_sync_token_expires FROM users WHERE id=?', [userId]);
    if (!user?.mal_sync_access_token) return null;
    if (Number(user.mal_sync_token_expires ?? 0) > Math.floor(Date.now() / 1000) + 60) return user.mal_sync_access_token;
    if (!user.mal_sync_refresh_token) return null;

    const res = await fetch('https://myanimelist.net/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.MAL_CLIENT_ID ?? '',
        client_secret: env.MAL_CLIENT_SECRET ?? '',
        grant_type: 'refresh_token',
        refresh_token: user.mal_sync_refresh_token,
      }),
    });
    const token = await res.json<any>().catch(() => null);
    if (!token?.access_token) return null;
    const expiresAt = Math.floor(Date.now() / 1000) + Number(token.expires_in ?? 3600);
    await db.query('UPDATE users SET mal_sync_access_token=?, mal_sync_refresh_token=?, mal_sync_token_expires=? WHERE id=?',
      [token.access_token, token.refresh_token ?? user.mal_sync_refresh_token, expiresAt, userId]);
    return token.access_token;
  },

  /** Pull-sync: adds anime from the user's MAL list that aren't on-site yet. Never touches existing local entries. */
  async pullMerge(env: Env, db: Db, userId: number): Promise<{ added: number; error?: string }> {
    const token = await this.getValidToken(env, db, userId);
    if (!token) return { added: 0, error: 'Not connected.' };

    let added = 0;
    let url: string | null = 'https://api.myanimelist.net/v2/users/@me/animelist?fields=list_status&limit=100&nsfw=true';
    let guard = 0;
    while (url && guard < 50) {
      guard++;
      const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const page: any = await res.json().catch(() => null);
      if (!page?.data) break;
      for (const item of page.data) {
        const animeId = Number(item.node?.id ?? 0);
        const status = (item.list_status?.status as LocalStatus) ?? 'plan_to_watch';
        if (!animeId || !LOCAL_STATUSES.includes(status)) continue;

        const exists = await db.fetchOne('SELECT id FROM anime_list WHERE user_id=? AND anime_id=?', [userId, animeId]);
        if (exists) continue;

        const localImage = await getLocalAnimeImage(db, animeId);
        const image = localImage || item.node?.main_picture?.large || item.node?.main_picture?.medium || '';
        await db.insert(
          `INSERT INTO anime_list (user_id, anime_id, anime_title, anime_image, status, episodes_watched, score, updated_at)
           VALUES (?,?,?,?,?,?,?,datetime('now'))`,
          [userId, animeId, item.node?.title ?? '', image, status,
            Number(item.list_status?.num_episodes_watched ?? 0),
            item.list_status?.score ? Number(item.list_status.score) : null]
        );
        added++;
      }
      url = page.paging?.next ?? null;
    }
    return { added };
  },

  /** Push a single entry's status/progress/score to MAL. Best-effort — errors are swallowed by the caller. */
  async pushUpdate(env: Env, db: Db, userId: number, animeId: number, status: string, episodesWatched: number, score: number | null): Promise<void> {
    const token = await this.getValidToken(env, db, userId);
    if (!token) return;
    const body = new URLSearchParams({ status, num_watched_episodes: String(episodesWatched) });
    if (score) body.set('score', String(score));
    await fetch(`https://api.myanimelist.net/v2/anime/${animeId}/my_list_status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  },
};

// =====================================================================
// AniList
// =====================================================================

export const AniListSync = {
  getAuthUrl(env: Env, session: { data: Record<string, any> }): string {
    // Note: AniList's OAuth implementation doesn't support/echo a `state`
    // param (see https://docs.anilist.co/guide/auth/authorization-code —
    // the documented authorize URL only has client_id/redirect_uri/
    // response_type). So unlike MAL/Google/Discord we can't do a
    // round-tripped state check here — instead we just flag in the
    // session that *this* session recently initiated a connect, and
    // check that flag on the way back. Since the code exchange only
    // proceeds for the still-logged-in session that set the flag, this
    // gives the same practical CSRF protection without relying on a
    // parameter AniList won't return.
    session.data.anilist_sync_pending = true;
    const params = new URLSearchParams({
      client_id: env.ANILIST_CLIENT_ID ?? '',
      redirect_uri: env.ANILIST_REDIRECT_URI ?? '',
      response_type: 'code',
    });
    return `https://anilist.co/api/v2/oauth/authorize?${params.toString()}`;
  },

  // Token exchange happens against anilist.co (not graphql.anilist.co) —
  // that host isn't blocked, only the GraphQL API is — so this part can
  // stay in the Worker. Everything past this point (fetching the
  // username, pulling/pushing list data) has to go through the GitHub
  // Actions relay instead; see requestPull()/queuePush() below.
  async handleCallback(env: Env, db: Db, session: { data: Record<string, any> }, userId: number, code: string): Promise<{ success: boolean; message: string }> {
    if (!session.data.anilist_sync_pending) {
      return { success: false, message: 'Invalid or expired AniList authorization — please try connecting again.' };
    }
    delete session.data.anilist_sync_pending;

    const tokenRes = await fetch('https://anilist.co/api/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: env.ANILIST_CLIENT_ID ?? '',
        client_secret: env.ANILIST_CLIENT_SECRET ?? '',
        redirect_uri: env.ANILIST_REDIRECT_URI ?? '',
        code,
      }),
    });
    const token = await tokenRes.json<any>().catch(() => null);
    if (!token?.access_token) {
      const detail = token?.error_description || token?.error || `HTTP ${tokenRes.status}`;
      return { success: false, message: `AniList token exchange failed: ${detail}` };
    }

    // We deliberately do NOT call graphql.anilist.co here (see note
    // above) — just store the token and flag this account for the relay
    // to pick up on its next run.
    const expiresAt = Math.floor(Date.now() / 1000) + Number(token.expires_in ?? 31536000);
    await db.query(
      `UPDATE users SET anilist_sync_access_token=?, anilist_sync_token_expires=?, anilist_sync_pending_pull=1 WHERE id=?`,
      [token.access_token, expiresAt, userId]
    );
    return { success: true, message: 'Connected! Fetching your AniList username and list now — this runs on a short delay (check back in a few minutes), refresh this page to see it.' };
  },

  async disconnect(db: Db, userId: number): Promise<void> {
    await db.query(
      `UPDATE users SET anilist_sync_username=NULL, anilist_sync_user_id=NULL, anilist_sync_access_token=NULL, anilist_sync_token_expires=NULL, anilist_sync_pending_pull=0 WHERE id=?`,
      [userId]
    );
    await db.query('DELETE FROM anilist_push_queue WHERE user_id=?', [userId]);
  },

  /** "Sync Now" — re-flags the account for the relay's next run rather than pulling inline (can't reach graphql.anilist.co from the Worker). */
  async requestPull(db: Db, userId: number): Promise<{ success: boolean; message: string }> {
    const user = await db.fetchOne<any>('SELECT anilist_sync_access_token FROM users WHERE id=?', [userId]);
    if (!user?.anilist_sync_access_token) return { success: false, message: 'Not connected.' };
    await db.query('UPDATE users SET anilist_sync_pending_pull=1 WHERE id=?', [userId]);
    return { success: true, message: 'Sync requested — the relay picks this up within a few minutes.' };
  },

  /** Push a single entry's status/progress/score to AniList — queued for the relay, never called directly from the Worker. */
  async pushUpdate(db: Db, userId: number, animeId: number, status: string, episodesWatched: number, score: number | null): Promise<void> {
    if (!LOCAL_STATUS_TO_ANILIST[status as LocalStatus]) return;
    await db.query(
      `INSERT INTO anilist_push_queue (user_id, anime_id, status, episodes_watched, score) VALUES (?,?,?,?,?)`,
      [userId, animeId, status, episodesWatched, score]
    );
  },
};


/** Fire-and-forget push to whichever of MAL/AniList the user has connected. Never throws. */
export async function pushListSync(env: Env, db: Db, userId: number, animeId: number, status: string, episodesWatched: number, score: number | null): Promise<void> {
  const user = await db.fetchOne<any>('SELECT mal_sync_access_token, anilist_sync_access_token FROM users WHERE id=?', [userId]);
  if (!user) return;
  const jobs: Promise<any>[] = [];
  if (user.mal_sync_access_token) jobs.push(MalSync.pushUpdate(env, db, userId, animeId, status, episodesWatched, score).catch(() => {}));
  if (user.anilist_sync_access_token) jobs.push(AniListSync.pushUpdate(db, userId, animeId, status, episodesWatched, score).catch(() => {}));
  if (jobs.length) await Promise.all(jobs);
}
