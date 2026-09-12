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

  private constructor(db: Db, id: string, user_id: number | null, data: SessionData, isNew: boolean) {
    this.db = db;
    this.id = id;
    this.user_id = user_id;
    this.data = data;
    this.isNew = isNew;
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
        const session = new Session(db, row.id, row.user_id, parsed, false);
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
    await this.persist(lifetimeSeconds);
    if (!this.fromBearer) {
      setCookie(c, COOKIE_NAME, this.id, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'Lax',
        maxAge: lifetimeSeconds,
      });
    }
  }

  async persist(lifetimeSeconds: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + lifetimeSeconds;
    const json = JSON.stringify(this.data);

    if (this.isNew) {
      await this.db.query(
        'INSERT INTO sessions (id, user_id, data, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
        [this.id, this.user_id, json, expiresAt, now]
      );
      this.isNew = false;
    } else {
      await this.db.query(
        'UPDATE sessions SET user_id = ?, data = ?, expires_at = ? WHERE id = ?',
        [this.user_id, json, expiresAt, this.id]
      );
    }
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
