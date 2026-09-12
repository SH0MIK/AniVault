// Sends push notifications via Expo's push service to any registered
// devices for a user. Called from notification.ts right after a
// notification row is inserted, so app users get a push the same moment a
// web user would see the bell update — same events, same data, just a
// different delivery channel.
import { Db } from './db';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function getPushTokensForUser(db: Db, userId: number): Promise<string[]> {
  try {
    const rows = await db.fetchAll<{ token: string }>('SELECT token FROM push_tokens WHERE user_id = ?', [userId]);
    return rows.map((r) => r.token);
  } catch {
    return [];
  }
}

export async function sendPush(tokens: string[], title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  if (tokens.length === 0) return;
  try {
    const messages = tokens.map((to) => ({ to, title, body, data, sound: 'default' }));
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk),
      });
    }
  } catch {
    // Best-effort — push failures must never break notification creation.
  }
}

export async function sendPushToUser(db: Db, userId: number, title: string, body: string, data?: Record<string, unknown>): Promise<void> {
  const tokens = await getPushTokensForUser(db, userId);
  await sendPush(tokens, title, body, data);
}
