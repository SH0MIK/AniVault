// Global chat API. New feature — no PHP equivalent to port, but built to
// match the shape of the other /api/*.php action-dispatch endpoints in this
// codebase (see api-lists.ts) so it's not a stranger in the house.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth } from '../lib/auth';
import { Chat, ChatMessageRow } from '../lib/chat';
import { h, timeAgo } from '../lib/helpers';

export const apiChatRoutes = new Hono<{ Bindings: Env }>();

async function buildCtx(c: any) {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  return { db, session, lifetime, auth };
}

function serialize(row: ChatMessageRow, currentUserId: number, isAdmin: boolean) {
  return {
    id: row.id,
    user_id: row.user_id,
    username: h(row.username),
    avatar_url: row.avatar_url ?? null,
    role: row.role,
    message: h(row.message), // escaped server-side — client renders as-is
    time: timeAgo(row.created_at),
    ts: Math.floor(new Date(row.created_at.replace(' ', 'T') + 'Z').getTime() / 1000),
    mine: row.user_id === currentUserId,
    can_delete: row.user_id === currentUserId || isAdmin,
  };
}

// Reading (get/poll/count) is open to guests; only sending/reading-receipts/
// deleting require a logged-in session.
const WRITE_ACTIONS = new Set(['send', 'read', 'delete']);

apiChatRoutes.on(['GET', 'POST'], '/api/chat', async (c) => {
  const { db, session, lifetime, auth } = await buildCtx(c);
  const body = c.req.method === 'POST' ? await c.req.parseBody() : ({} as Record<string, unknown>);
  const action = (c.req.query('action') || (body.action as string) || '').trim();
  const getParam = (key: string): string => (c.req.query(key) ?? (body[key] as string) ?? '');

  if (WRITE_ACTIONS.has(action) && !auth.check()) {
    await session.save(c, lifetime);
    return c.json({ success: false, message: 'Please log in to join the chat.' }, 401);
  }
  const userId = session.user_id ?? 0; // 0 for guests — never matches a real user_id, so `mine`/unread stay false
  const isAdmin = auth.check() && auth.isAdmin();

  let result: any;
  switch (action) {
    // Initial load: last N messages (optionally paging further back with before_id). Open to guests.
    case 'get': {
      const beforeId = parseInt(getParam('before_id') || '0', 10) || undefined;
      const rows = await Chat.getRecent(db, 50, beforeId);
      result = {
        success: true,
        messages: rows.map((r) => serialize(r, userId, isAdmin)),
        latest_id: await Chat.latestId(db),
      };
      break;
    }

    // Poll for anything newer than after_id, while the panel is open. Open to guests.
    case 'poll': {
      const afterId = parseInt(getParam('after_id') || '0', 10) || 0;
      const rows = await Chat.getAfter(db, afterId);
      result = {
        success: true,
        messages: rows.map((r) => serialize(r, userId, isAdmin)),
        latest_id: rows.length ? rows[rows.length - 1].id : afterId,
      };
      break;
    }

    // Unread badge — guests always read 0 since there's nothing to track for them.
    case 'count':
      result = { success: true, unread: auth.check() ? await Chat.unreadCount(db, userId) : 0 };
      break;

    case 'send': {
      const text = (getParam('message') || '').toString();
      const sent = await Chat.send(db, userId, text);
      if (!sent.success) {
        result = { success: false, message: sent.error };
        break;
      }
      await Chat.markRead(db, userId, sent.row!.id);
      result = { success: true, message: serialize(sent.row!, userId, isAdmin) };
      break;
    }

    case 'read': {
      const throughId = parseInt(getParam('through_id') || '0', 10) || undefined;
      await Chat.markRead(db, userId, throughId);
      result = { success: true };
      break;
    }

    case 'delete': {
      const id = parseInt(getParam('id') || '0', 10) || 0;
      const ok = id ? await Chat.deleteMessage(db, id, userId, isAdmin) : false;
      result = { success: ok };
      break;
    }

    default:
      await session.save(c, lifetime);
      return c.json({ success: false, message: 'Unknown action.' }, 400);
  }
  await session.save(c, lifetime);
  return c.json(result);
});
