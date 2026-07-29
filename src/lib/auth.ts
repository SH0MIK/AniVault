// Full port of includes/auth.php. Logic is kept 1:1 with the PHP version;
// only the storage mechanics changed (PDO -> D1, $_SESSION -> Session class,
// curl -> fetch). The MySQL-enum "OWNER" uppercase workaround from the PHP
// version is dropped because D1's CHECK constraint isn't a real MySQL enum,
// so plain lowercase 'owner' works directly — one less moving part.
import bcrypt from 'bcryptjs';
import { Db, Row } from './db';
import { Session } from './session';
import { Logger } from './logger';
import { DiscordNotifier, DiscordEnv } from './discord';

export const OWNER_USER_ID = 2;

// How long a *silently auto-created* account's session should stick around.
// Regular logins still use SESSION_LIFETIME_SECONDS (default 24h) — this is
// deliberately much longer (1 year) so a visitor who never sees a password
// prompt doesn't get logged out and orphaned from the account/watchlist we
// made for them.
export const AUTO_SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 365;

export interface AuthEnv extends DiscordEnv {
  SITE_URL: string;
  AVATARS: R2Bucket;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_REDIRECT_URI?: string;
  DISCORD_SERVER_ID?: string;
  DISCORD_BOT_TOKEN?: string;
}

export interface AuthResult {
  success: boolean;
  message?: string;
}

interface UserRow extends Row {
  id: number;
  uid: string | null;
  username: string;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  bio: string | null;
  role: string;
  is_active: number;
  google_id: string | null;
  discord_id: string | null;
}

const UID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no ambiguous chars, matches PHP version

export class Auth {
  constructor(private db: Db, private session: Session, private env: AuthEnv, private ip: string) {}

  // ----------------------------------------------------------
  async assignUid(userId: number): Promise<string> {
    let uid = '';
    // eslint-disable-next-line no-constant-condition
    while (true) {
      uid = Array.from({ length: 6 }, () => UID_CHARS[Math.floor(Math.random() * UID_CHARS.length)]).join('');
      const exists = await this.db.fetchOne('SELECT id FROM users WHERE uid = ?', [uid]);
      if (!exists) break;
    }
    await this.db.query('UPDATE users SET uid = ? WHERE id = ?', [uid, userId]);
    return uid;
  }

  // ----------------------------------------------------------
  // Email/password login
  // ----------------------------------------------------------
  async login(username: string, password: string): Promise<AuthResult> {
    const user = await this.db.fetchOne<UserRow>(
      'SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1',
      [username, username]
    );
    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      return { success: false, message: 'Invalid username or password.' };
    }
    this.setSession(user);
    await this.db.query("UPDATE users SET last_login = datetime('now') WHERE id = ?", [user.id]);
    await Logger.log(this.db, user.id, 'login', 'User logged in', this.ip);
    await DiscordNotifier.userLogin(this.env, this.db, user, 'email');
    return { success: true };
  }

  // ----------------------------------------------------------
  // Register
  // ----------------------------------------------------------
  async register(username: string, email: string, password: string): Promise<AuthResult> {
    username = username.trim();
    email = email.trim();

    if (username.length < 3 || username.length > 30)
      return { success: false, message: 'Username must be 3–30 characters.' };
    if (!/^[a-zA-Z0-9_]+$/.test(username))
      return { success: false, message: 'Username can only contain letters, numbers and underscores.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return { success: false, message: 'Invalid email address.' };
    if (password.length < 6)
      return { success: false, message: 'Password must be at least 6 characters.' };

    const exists = await this.db.fetchOne(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (exists) return { success: false, message: 'Username or email already taken.' };

    const hash = await bcrypt.hash(password, 12);
    const id = await this.db.insert(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, hash]
    );
    await this.assignUid(id);
    const user = await this.db.fetchOne<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return { success: false, message: 'Registration failed.' };

    this.setSession(user);
    await Logger.log(this.db, id, 'register', 'New user registered', this.ip);
    await DiscordNotifier.newUser(this.env, this.db, user, 'email');

    if (id !== OWNER_USER_ID) {
      await this.db.query(
        'INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)',
        [id, OWNER_USER_ID]
      );
    }
    return { success: true };
  }

  // ----------------------------------------------------------
  // Silent/auto registration — creates a real, fully-functional account with
  // a generated username + password and logs the visitor straight in, with
  // no popup and no email required. Used for actions that shouldn't be
  // blocked by a login wall (watching an episode, adding to a list,
  // favoriting) — see the /api/auto_auth.php route and its callers.
  // Mirrors register()'s side effects (uid, logging, Discord relay,
  // auto-follow of the owner account) so an auto-created account behaves
  // identically to a manually registered one from that point on.
  // ----------------------------------------------------------
  async autoRegister(): Promise<AuthResult & { username?: string; password?: string }> {
    // "Guest4821" reads much friendlier than a cryptic random-char suffix
    // (e.g. "Guest_vtnxaf"). generateUsername() below still de-dupes with a
    // "_2" suffix on the rare collision.
    const base = 'Guest' + (1000 + Math.floor(Math.random() * 9000));
    const username = await this.generateUsername(base);
    const password = this.generateRandomPassword();
    const hash = await bcrypt.hash(password, 12);

    // A blank '' would satisfy the NOT NULL constraint, but if `email` also
    // has a unique index we don't know about (not visible in a plain
    // CREATE TABLE dump), every 2nd guest account would fail to insert.
    // Deriving the placeholder from the (already unique) username sidesteps
    // that regardless of whether such an index exists.
    const placeholderEmail = `${username.toLowerCase()}@guest.invalid`;

    const id = await this.db.insert(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [username, placeholderEmail, hash]
    );
    await this.assignUid(id);
    const user = await this.db.fetchOne<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) return { success: false, message: 'Could not create an account.' };

    this.setSession(user);
    this.session.data.auto_created = true;
    await Logger.log(this.db, id, 'register', 'Auto-created account (no login wall)', this.ip);
    await DiscordNotifier.newUser(this.env, this.db, user, 'auto');

    if (id !== OWNER_USER_ID) {
      await this.db.query('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)', [id, OWNER_USER_ID]);
      await this.db.insert('INSERT INTO notifications (user_id, actor_id, type) VALUES (?, ?, ?)', [OWNER_USER_ID, id, 'follow']);
    }

    // Self-notification carrying the generated credentials, so the user can
    // find them again later in the bell dropdown even after the one-time
    // on-screen toast is gone. This goes straight through db.insert (not
    // Notification.create) because that helper skips self-notifications.
    await this.db.insert(
      'INSERT INTO notifications (user_id, actor_id, type, entity_meta) VALUES (?, ?, ?, ?)',
      [id, id, 'auto_account', JSON.stringify({ username, password })]
    );

    return { success: true, username, password };
  }

  private generateRandomPassword(length = 12): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => chars[b % chars.length]).join('');
  }

  // ----------------------------------------------------------
  // Google OAuth
  // ----------------------------------------------------------
  getGoogleAuthUrl(): string {
    const state = crypto.randomUUID().replace(/-/g, '');
    this.session.data.oauth_state = state;

    const params = new URLSearchParams({
      client_id: this.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: this.env.GOOGLE_REDIRECT_URI ?? '',
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async loginWithGoogle(code: string, state: string): Promise<AuthResult> {
    if (!this.session.data.oauth_state || state !== this.session.data.oauth_state) {
      return { success: false, message: 'Invalid OAuth state.' };
    }
    delete this.session.data.oauth_state;

    const tokenRes = await this.httpPostForm('https://oauth2.googleapis.com/token', {
      code,
      client_id: this.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: this.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: this.env.GOOGLE_REDIRECT_URI ?? '',
      grant_type: 'authorization_code',
    });
    if (!tokenRes.access_token) return { success: false, message: 'Failed to obtain Google access token.' };

    const profile = await this.httpGetBearer('https://www.googleapis.com/oauth2/v3/userinfo', tokenRes.access_token);
    if (!profile.sub) return { success: false, message: 'Failed to fetch Google profile.' };

    const googleId = profile.sub as string;
    const email = (profile.email as string) ?? null;
    const name = (profile.name as string) ?? null;
    const avatar = (profile.picture as string) ?? null;

    if (this.check()) {
      return this.connectSocial(this.session.user_id!, 'google', googleId, avatar);
    }

    let user = await this.db.fetchOne<UserRow>('SELECT * FROM users WHERE google_id = ?', [googleId]);

    if (!user && email) {
      user = await this.db.fetchOne<UserRow>('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
      if (user) {
        await this.db.query('UPDATE users SET google_id = ? WHERE id = ?', [googleId, user.id]);
        user.google_id = googleId;
      }
    }

    if (!user) {
      const username = await this.generateUsername(name ?? 'user');
      const id = await this.db.insert(
        'INSERT INTO users (username, email, google_id, avatar_url, password_hash) VALUES (?, ?, ?, ?, ?)',
        [username, email ?? `${username.toLowerCase()}@google.invalid`, googleId, avatar, '']
      );
      await this.assignUid(id);
      user = await this.db.fetchOne<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
      if (!user) return { success: false, message: 'Registration failed.' };
      await Logger.log(this.db, id, 'register', 'Registered via Google', this.ip);
      await DiscordNotifier.newUser(this.env, this.db, user, 'google');
      if (id !== OWNER_USER_ID) {
        await this.db.query('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)', [id, OWNER_USER_ID]);
        await this.db.insert('INSERT INTO notifications (user_id, actor_id, type) VALUES (?, ?, ?)', [OWNER_USER_ID, id, 'follow']);
      }
      this.session.data.username_setup = true;
    }

    if (!user || !user.is_active) return { success: false, message: 'Account is disabled.' };

    // Skip if avatar_url is already ours (e.g. a manual upload) or there's
    // nothing new from Google to mirror.
    if (avatar && this.isExternalAvatar(user.avatar_url)) {
      const mirrored = await this.mirrorAvatar(avatar, user.id);
      if (mirrored) {
        await this.db.query('UPDATE users SET avatar_url = ? WHERE id = ?', [mirrored, user.id]);
        user.avatar_url = mirrored;
      }
    }

    this.setSession(user);
    await this.db.query("UPDATE users SET last_login = datetime('now') WHERE id = ?", [user.id]);
    await Logger.log(this.db, user.id, 'login', 'Logged in via Google', this.ip);
    await DiscordNotifier.userLogin(this.env, this.db, user, 'google');
    return { success: true };
  }

  // ----------------------------------------------------------
  // Discord OAuth
  // ----------------------------------------------------------
  getDiscordAuthUrl(): string {
    const state = crypto.randomUUID().replace(/-/g, '');
    this.session.data.oauth_state = state;

    const params = new URLSearchParams({
      client_id: this.env.DISCORD_CLIENT_ID ?? '',
      redirect_uri: this.env.DISCORD_REDIRECT_URI ?? '',
      response_type: 'code',
      scope: 'identify email guilds.join',
      state,
    });
    return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  }

  async loginWithDiscord(code: string, state: string): Promise<AuthResult> {
    if (!this.session.data.oauth_state || state !== this.session.data.oauth_state) {
      return { success: false, message: 'Invalid OAuth state.' };
    }
    delete this.session.data.oauth_state;

    const tokenRes = await this.httpPostForm('https://discord.com/api/oauth2/token', {
      code,
      client_id: this.env.DISCORD_CLIENT_ID ?? '',
      client_secret: this.env.DISCORD_CLIENT_SECRET ?? '',
      redirect_uri: this.env.DISCORD_REDIRECT_URI ?? '',
      grant_type: 'authorization_code',
    });
    if (!tokenRes.access_token) return { success: false, message: 'Failed to obtain Discord access token.' };

    const profile = await this.httpGetBearer('https://discord.com/api/users/@me', tokenRes.access_token);
    if (!profile.id) return { success: false, message: 'Failed to fetch Discord profile.' };

    const discordId = profile.id as string;
    const email = profile.verified ? ((profile.email as string) ?? null) : null;
    const username = (profile.username as string) ?? null;
    const avatar = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${discordId}/${profile.avatar}.png`
      : null;

    if (this.check()) {
      return this.connectSocial(this.session.user_id!, 'discord', discordId, avatar);
    }

    let user = await this.db.fetchOne<UserRow>('SELECT * FROM users WHERE discord_id = ?', [discordId]);

    if (!user && email) {
      user = await this.db.fetchOne<UserRow>('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
      if (user) {
        await this.db.query('UPDATE users SET discord_id = ? WHERE id = ?', [discordId, user.id]);
        user.discord_id = discordId;
      }
    }

    if (!user) {
      const uname = await this.generateUsername(username ?? 'user');
      const id = await this.db.insert(
        'INSERT INTO users (username, email, discord_id, avatar_url, password_hash) VALUES (?, ?, ?, ?, ?)',
        [uname, email ?? `${uname.toLowerCase()}@discord.invalid`, discordId, avatar, '']
      );
      await this.assignUid(id);
      user = await this.db.fetchOne<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
      if (!user) return { success: false, message: 'Registration failed.' };
      await Logger.log(this.db, id, 'register', 'Registered via Discord', this.ip);
      await DiscordNotifier.newUser(this.env, this.db, user, 'discord');
      if (id !== OWNER_USER_ID) {
        await this.db.query('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)', [id, OWNER_USER_ID]);
        await this.db.insert('INSERT INTO notifications (user_id, actor_id, type) VALUES (?, ?, ?)', [OWNER_USER_ID, id, 'follow']);
      }
      this.session.data.username_setup = true;
    }

    if (!user || !user.is_active) return { success: false, message: 'Account is disabled.' };

    // Skip if avatar_url is already ours (e.g. a manual upload) or there's
    // nothing new from Discord to mirror.
    if (avatar && this.isExternalAvatar(user.avatar_url)) {
      const mirrored = await this.mirrorAvatar(avatar, user.id);
      if (mirrored) {
        await this.db.query('UPDATE users SET avatar_url = ? WHERE id = ?', [mirrored, user.id]);
        user.avatar_url = mirrored;
      }
    }

    this.setSession(user);
    await this.db.query("UPDATE users SET last_login = datetime('now') WHERE id = ?", [user.id]);
    await Logger.log(this.db, user.id, 'login', 'Logged in via Discord', this.ip);
    await DiscordNotifier.userLogin(this.env, this.db, user, 'discord');

    // Auto-join the user to the Discord server; never blocks login on failure.
    await this.addToDiscordServer(tokenRes.access_token, discordId);

    return { success: true };
  }

  // ----------------------------------------------------------
  async connectSocial(userId: number, provider: 'google' | 'discord', providerId: string, _avatar: string | null): Promise<AuthResult> {
    const col = `${provider}_id`;
    const existing = await this.db.fetchOne<{ id: number }>(`SELECT id FROM users WHERE ${col} = ?`, [providerId]);
    if (existing && Number(existing.id) !== userId) {
      return { success: false, message: `${cap(provider)} account is already linked to another user.` };
    }
    await this.db.query(`UPDATE users SET ${col} = ? WHERE id = ?`, [providerId, userId]);
    return { success: true, message: `${cap(provider)} account connected!` };
  }

  async disconnectSocial(userId: number, provider: 'google' | 'discord'): Promise<AuthResult> {
    const col = `${provider}_id`;
    const user = await this.db.fetchOne<UserRow>(
      'SELECT password_hash, google_id, discord_id FROM users WHERE id = ?',
      [userId]
    );
    const hasPassword = !!user?.password_hash;
    const otherSocial = provider === 'google' ? !!user?.discord_id : !!user?.google_id;

    if (!hasPassword && !otherSocial) {
      return { success: false, message: 'Set a password before disconnecting your only login method.' };
    }
    await this.db.query(`UPDATE users SET ${col} = NULL WHERE id = ?`, [userId]);
    return { success: true, message: `${cap(provider)} account disconnected.` };
  }

  // ----------------------------------------------------------
  private setSession(user: UserRow): void {
    this.session.setUser(user.id, user.username, user.role);
  }

  check(): boolean {
    return this.session.isLoggedIn();
  }

  isAdmin(): boolean {
    if (!this.check()) return false;
    if (this.session.data.role === 'admin') return true;
    return this.isOwner();
  }

  /** Ports Auth::requireAdmin() as a boolean check (the route handles the
   * actual redirect, since Workers can't just header()+exit mid-function). */
  requireAdmin(): boolean {
    return this.isAdmin();
  }

  isOwner(): boolean {
    return this.check() && this.session.user_id === OWNER_USER_ID && this.session.data.role === 'owner';
  }

  isOwnerUserId(userId: number): boolean {
    return userId === OWNER_USER_ID;
  }

  async getCurrentUser(): Promise<UserRow | null> {
    if (!this.check()) return null;
    return this.db.fetchOne<UserRow>('SELECT * FROM users WHERE id = ?', [this.session.user_id]);
  }

  async updateProfile(userId: number, data: { bio?: string; avatar_url?: string; new_password?: string }): Promise<AuthResult> {
    const fields: string[] = [];
    const params: unknown[] = [];
    if (data.bio !== undefined) {
      fields.push('bio = ?');
      params.push(data.bio.substring(0, 500));
    }
    if (data.avatar_url) {
      fields.push('avatar_url = ?');
      params.push(data.avatar_url);
    }
    if (data.new_password) {
      if (data.new_password.length < 6) return { success: false, message: 'Password too short.' };
      fields.push('password_hash = ?');
      params.push(await bcrypt.hash(data.new_password, 12));
    }
    if (fields.length === 0) return { success: false, message: 'Nothing to update.' };
    params.push(userId);
    await this.db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
    return { success: true };
  }

  // ----------------------------------------------------------
  private async generateUsername(base: string): Promise<string> {
    let clean = base.replace(/ /g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
    clean = clean.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    clean = (clean || 'user').substring(0, 30);

    let username = clean;
    let i = 2;
    while (await this.db.fetchOne('SELECT id FROM users WHERE username = ?', [username])) {
      const suffix = `_${i++}`;
      username = clean.substring(0, 30 - suffix.length) + suffix;
    }
    return username;
  }

  private async addToDiscordServer(accessToken: string, discordId: string): Promise<void> {
    if (!this.env.DISCORD_SERVER_ID || !this.env.DISCORD_BOT_TOKEN) return;
    try {
      await fetch(`https://discord.com/api/guilds/${this.env.DISCORD_SERVER_ID}/members/${discordId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${this.env.DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: accessToken }),
      });
    } catch {
      // Ignored — must never block login, same as the PHP version.
    }
  }

  private async httpPostForm(url: string, fields: Record<string, string>): Promise<Record<string, any>> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });
    try {
      return await res.json();
    } catch {
      return {};
    }
  }

  private async httpGetBearer(url: string, token: string): Promise<Record<string, any>> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    try {
      return await res.json();
    } catch {
      return {};
    }
  }

  // Google/Discord profile picture URLs are not permanent -- Google's
  // OAuth `picture` claim in particular can 404 after a while, and Discord's
  // link breaks if the user changes their Discord avatar later. Rather than
  // store the provider's URL directly, download it once and re-host it in
  // our own AVATARS bucket (same storage the manual upload flow uses), so
  // it keeps working regardless of what happens on the provider's side.
  // Returns null (never throws) so a mirroring failure never blocks login.
  private async mirrorAvatar(sourceUrl: string, userId: number): Promise<string | null> {
    try {
      const res = await fetch(sourceUrl);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      const ext = contentType.includes('png') ? 'png'
        : contentType.includes('gif') ? 'gif'
        : contentType.includes('webp') ? 'webp'
        : 'jpg';
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 100 || buf.byteLength > 8 * 1024 * 1024) return null;

      const filename = `avatar_${userId}_${Date.now()}.${ext}`;
      await this.env.AVATARS.put(`avatars/${filename}`, buf, { httpMetadata: { contentType } });
      return `${this.env.SITE_URL}/assets/img/avatars/${filename}`;
    } catch {
      return null; // never block login over a flaky avatar fetch
    }
  }

  // True if avatar_url points somewhere other than our own /assets/img/avatars/
  // path -- i.e. it's still a raw, unmirrored Google/Discord link.
  private isExternalAvatar(url: string | null): url is string {
    return !!url && !url.includes('/assets/img/avatars/');
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
