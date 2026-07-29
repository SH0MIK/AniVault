// Global chat API. New feature — no PHP equivalent to port, but built to
// match the shape of the other /api/*.php action-dispatch endpoints in this
// codebase (see api-lists.ts) so it's not a stranger in the house.
import { Hono } from 'hono';
import type { Env } from '../index';
import { Db } from '../lib/db';
import { Session } from '../lib/session';
import { Auth, OWNER_USER_ID } from '../lib/auth';
import { Chat, ChatMessageRow } from '../lib/chat';
import { Badge, BadgeRow } from '../lib/badges';
import { Notification } from '../lib/notification';
import { h, timeAgo } from '../lib/helpers';

export const apiChatRoutes = new Hono<{ Bindings: Env }>();

// Fixed whitelist — keeps reactions to a known, moderation-friendly set instead of arbitrary text.
export const CHAT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

async function buildCtx(c: any) {
  const db = new Db(c.env.DB);
  const lifetime = Number(c.env.SESSION_LIFETIME_SECONDS ?? 86400);
  const session = await Session.load(c, db, lifetime);
  const auth = new Auth(db, session, c.env as any, c.req.header('cf-connecting-ip') ?? 'unknown');
  return { db, session, lifetime, auth };
}

type Extras = {
  badges: BadgeRow[];
  reactions: { emoji: string; count: number; mine: boolean }[];
  watching: { anime_id: number; title: string; image: string } | null;
};

function serialize(row: ChatMessageRow, currentUserId: number, isAdmin: boolean, extras: Extras) {
  const avatarBadge =
    (row.user_id === OWNER_USER_ID || row.role === 'owner') ? 'OWNER' :
    row.role === 'admin' ? 'ADMIN' :
    null;
  return {
    id: row.id,
    user_id: row.user_id,
    username: h(row.username),
    avatar_url: row.avatar_url ?? null,
    role: row.role,
    avatar_badge: avatarBadge, // same OWNER/ADMIN pill shown on the profile page avatar
    badges_html: Badge.renderList(extras.badges), // the user's actual earned badges, same as the profile page
    watching: extras.watching ? { anime_id: extras.watching.anime_id, title: h(extras.watching.title), image: extras.watching.image } : null,
    message: h(row.message), // escaped server-side — client renders as-is
    time: timeAgo(row.created_at),
    ts: Math.floor(new Date(row.created_at.replace(' ', 'T') + 'Z').getTime() / 1000),
    mine: row.user_id === currentUserId,
    can_delete: row.user_id === currentUserId || isAdmin,
    reactions: extras.reactions,
    reaction_emojis: CHAT_REACTION_EMOJIS,
  };
}

/** Batch-fetches badges/reactions/watching-status for every message in one pass, then serializes. */
async function serializeAll(db: Db, rows: ChatMessageRow[], currentUserId: number, isAdmin: boolean) {
  const userIds = rows.map((r) => r.user_id);
  const messageIds = rows.map((r) => r.id);
  const [badgeMap, reactionMap, watchingMap] = await Promise.all([
    Badge.getForUsers(db, userIds),
    Chat.getReactionsForMessages(db, messageIds, currentUserId),
    Chat.getWatchingMap(db, userIds),
  ]);
  return rows.map((r) =>
    serialize(r, currentUserId, isAdmin, {
      badges: badgeMap[r.user_id] ?? [],
      reactions: reactionMap[r.id] ?? [],
      watching: watchingMap[r.user_id] ?? null,
    })
  );
}

// Reading (get/poll/count/presence) is open to guests; anything that writes
// on a user's behalf requires a logged-in session.
const WRITE_ACTIONS = new Set(['send', 'read', 'delete', 'react', 'typing']);

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
        messages: await serializeAll(db, rows, userId, isAdmin),
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
        messages: await serializeAll(db, rows, userId, isAdmin),
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
      await Chat.ping(db, userId, false); // sending implicitly stops "typing"

      // @mentions — notify anyone named in the message (excluding the sender).
      const mentioned = await Chat.findMentionedUsers(db, text, userId);
      const preview = text.length > 60 ? text.slice(0, 57) + '...' : text;
      for (const u of mentioned) {
        await Notification.create(db, u.id, userId, 'chat_mention', sent.row!.id, preview);
      }

      const [myBadges, myWatching] = await Promise.all([
        Badge.getForUser(db, userId),
        Chat.getWatchingMap(db, [userId]),
      ]);
      result = {
        success: true,
        message: serialize(sent.row!, userId, isAdmin, { badges: myBadges, reactions: [], watching: myWatching[userId] ?? null }),
      };
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

    case 'react': {
      const messageId = parseInt(getParam('message_id') || '0', 10) || 0;
      const emoji = (getParam('emoji') || '').toString();
      if (!messageId || !CHAT_REACTION_EMOJIS.includes(emoji)) {
        result = { success: false, message: 'Invalid reaction.' };
        break;
      }
      await Chat.toggleReaction(db, messageId, userId, emoji);
      const reactionMap = await Chat.getReactionsForMessages(db, [messageId], userId);
      result = { success: true, reactions: reactionMap[messageId] ?? [] };
      break;
    }

    // Typing ping — client calls this (debounced) while the input has text.
    case 'typing': {
      await Chat.ping(db, userId, true);
      result = { success: true };
      break;
    }

    // Online count + who's typing. Open to guests (they just never appear in either).
    case 'presence': {
      const [online, typing] = await Promise.all([
        Chat.onlineCount(db),
        auth.check() ? Chat.typingUsernames(db, userId) : Chat.typingUsernames(db, 0),
      ]);
      result = { success: true, online, typing };
      break;
    }

    default:
      await session.save(c, lifetime);
      return c.json({ success: false, message: 'Unknown action.' }, 400);
  }
  await session.save(c, lifetime);
  return c.json(result);
});
