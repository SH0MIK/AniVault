// Workers has no server-side session store like PHP's $_SESSION, so this
// replicates it: a random token goes in an httpOnly cookie, and a `sessions`
// row in D1 holds { user_id, data } the same way PHP's session file did.
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { Db } from './db';

const COOKIE_NAME = 'av_session';

export interface SessionData {
  username?: string;
  role?: string;
  logged_in?: boolean;
  oauth_state?: string;
  oauth_redirect?: string;
  post_setup_redirect?: string;
  username_setup?: boolean;
  auto_created?: boolean;
  csrf_token?: string;
  impersonate_owner?: { user_id: number; username: string; role: string } | null;
  flash?: { type: string; message: string } | null;
  [key: string]: unknown;
}

export class Session {
  id: string;
  user_id: number | null;
  data: SessionData;
  private db: Db;
  private isNew: boolean;
  private persistedDataJson: string;
  private persistedUserId: number | null;
  private expiresAt: number;

  private constructor(db: Db, id: string, user_id: number | null, data: SessionData, isNew: boolean, expiresAt = 0) {
    this.db = db;
    this.id = id;
    this.user_id = user_id;
    this.data = data;
    this.isNew = isNew;
    this.persistedDataJson = JSON.stringify(data);
    this.persistedUserId = user_id;
    this.expiresAt = expiresAt;
  }

  private fromBearer = false;

  private static bearerId(c: Context): string | null {
    const header = c.req.header('authorization') ?? c.req.header('Authorization');
    if (!header) return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match ? match[1].trim() : null;
  }

  static async load(c: Context, db: Db, lifetimeSeconds: number): Promise<Session> {
    const cookieId = getCookie(c, COOKIE_NAME);
    const bearerId = cookieId ? null : Session.bearerId(c);
    const id = cookieId ?? bearerId;

    if (id) {
      const row = await db.fetchOne<{ id: string; user_id: number | null; data: string; expires_at: number }>(
        'SELECT id, user_id, data, expires_at FROM sessions WHERE id = ?',
        [id]
      );
      if (row && row.expires_at > Math.floor(Date.now() / 1000)) {
        let parsed: SessionData = {};
        try { parsed = JSON.parse(row.data || '{}'); } catch { /* ignore malformed */ }
        const session = new Session(db, row.id, row.user_id, parsed, false, row.expires_at);
        session.fromBearer = !!bearerId;
        return session;
      }
    }
    const newId = crypto.randomUUID();
    const session = new Session(db, newId, null, {}, true);
    session.fromBearer = cookieId === undefined && bearerId !== null;
    return session;
  }

  async save(c: Context, lifetimeSeconds: number): Promise<void> {
    // Public pages do not need a durable session for signed-out visitors.
    // Avoid creating a D1 row (and cookie) for an untouched anonymous session.
    // Keep persistence for guests with actual state (OAuth/CSRF/flash) and for
    // authenticated users; this does not affect existing account sessions.
    if (this.isNew && this.user_id === null && Object.keys(this.data).length === 0) return;

    const cookieMaxAge = await this.persist(lifetimeSeconds);
    if (!this.fromBearer) {
      setCookie(c, COOKIE_NAME, this.id, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: cookieMaxAge,
      });
    }
  }

  async persist(lifetimeSeconds: number): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const nextExpiresAt = now + lifetimeSeconds;
    const json = JSON.stringify(this.data);

    if (this.isNew) {
      await this.db.query(
        'INSERT INTO sessions (id, user_id, data, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
        [this.id, this.user_id, json, nextExpiresAt, now]
      );
      this.isNew = false;
      this.expiresAt = nextExpiresAt;
      this.persistedDataJson = json;
      this.persistedUserId = this.user_id;
      return lifetimeSeconds;
    }

    // Session expiry is sliding, but ordinary page/API reads shouldn't rewrite
    // the D1 row every time. Persist changes immediately and refresh unchanged
    // sessions only once the stored expiry is halfway through its lifetime.
    const changed = json !== this.persistedDataJson || this.user_id !== this.persistedUserId;
    const remaining = this.expiresAt - now;
    if (!changed && remaining > Math.floor(lifetimeSeconds / 2)) {
      return Math.max(1, remaining);
    }

    await this.db.query(
      'UPDATE sessions SET user_id = ?, data = ?, expires_at = ? WHERE id = ?',
      [this.user_id, json, nextExpiresAt, this.id]
    );
    this.expiresAt = nextExpiresAt;
    this.persistedDataJson = json;
    this.persistedUserId = this.user_id;
    return lifetimeSeconds;
  }

  async destroy(c: Context): Promise<void> {
    await this.db.query('DELETE FROM sessions WHERE id = ?', [this.id]);
    deleteCookie(c, COOKIE_NAME, { path: '/' });
  }

  setUser(userId: number, username: string, role: string): void {
    this.user_id = userId;
    this.data.username = username;
    this.data.role = role;
    this.data.logged_in = true;
  }

  isLoggedIn(): boolean {
    return !!this.data.logged_in && this.user_id !== null;
  }

  setFlash(type: 'success' | 'error', message: string): void {
    this.data.flash = { type, message };
  }

  takeFlash(): { type: string; message: string } | null {
    const f = this.data.flash ?? null;
    delete this.data.flash;
    return f;
  }
}
