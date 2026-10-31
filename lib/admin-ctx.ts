// Shared "requireAdmin" context builder used by every admin/*.ts route.
// Ports the Auth::requireAdmin() redirect-on-failure pattern from admin/header.php.
import { Db } from './db';
import { Session } from './session';
import { Auth } from './auth';

export interface AdminCtx {
  db: Db;
  session: Session;
  lifetime: number;
  auth: Auth;
  userId: number;
  isOwner: boolean;
  impersonating: { username: string } | null;
}

/** Returns null if the user isn't an admin/owner -- caller should redirect. */
export async function buildAdminCtx(c: any): Promise<AdminCtx | null> {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');

  if (!auth.requireAdmin()) return null;

  const impersonateData = session.data.impersonate_owner ?? null;
  return {
    db, session, lifetime, auth,
    userId: session.user_id!,
    isOwner: auth.isOwner(),
    impersonating: impersonateData ? { username: session.data.username ?? '' } : null,
  };
}
