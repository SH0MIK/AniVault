// Posts login/register notification embeds straight to your Discord log
// channel using the site's own bot token — no Railway/Vercel relay involved.
// This is the SAME DISCORD_BOT_TOKEN already used elsewhere in auth.ts to
// auto-join OAuth users to the server, so no new secret is needed here.
import { Db } from './db';

export interface DiscordEnv {
  DISCORD_BOT_TOKEN?: string;
  DISCORD_LOG_CHANNEL_ID?: string;
}

interface NotifyUser {
  id: number;
  username: string;
  email?: string | null;
  uid?: string | null;
  avatar_url?: string | null;
}

const SITE_URL = 'https://www.anivault.co';

const METHOD_LABEL: Record<string, string> = {
  email: '📧 Email',
  google: '🔵 Google',
  discord: '🎮 Discord',
};

function maskEmail(email: string | null | undefined): string {
  if (!email) return 'N/A';
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'N/A';
  const masked = local.slice(0, 2) + '*'.repeat(Math.max(1, local.length - 2));
  return `${masked}@${domain}`;
}

function profileUrl(username: string): string {
  return `${SITE_URL}/u/${encodeURIComponent(username)}`;
}

function buildRegisterEmbed(user: NotifyUser, displayId: number | null, method: string) {
  const url = profileUrl(user.username);
  return {
    title: '🎉 New User Joined AniVault!',
    description: `**[${user.username}](${url})** just created an account.`,
    color: 0x57f287,
    url,
    fields: [
      { name: 'Username', value: `\`${user.username}\``, inline: true },
      { name: 'User ID', value: `\`#${displayId ?? user.id}\``, inline: true },
      { name: 'Email', value: `\`${maskEmail(user.email)}\``, inline: true },
      { name: 'Signed up via', value: METHOD_LABEL[method] ?? method, inline: true },
    ],
    thumbnail: user.avatar_url ? { url: user.avatar_url } : undefined,
    footer: { text: 'AniVault • New Registration' },
    timestamp: new Date().toISOString(),
  };
}

function buildLoginEmbed(user: NotifyUser, displayId: number | null, method: string) {
  const url = profileUrl(user.username);
  return {
    title: '👤 User Logged In',
    description: `**[${user.username}](${url})** just signed in.`,
    color: 0x5865f2,
    url,
    fields: [
      { name: 'Username', value: `\`${user.username}\``, inline: true },
      { name: 'User ID', value: `\`#${displayId ?? user.id}\``, inline: true },
      { name: 'Login via', value: METHOD_LABEL[method] ?? method, inline: true },
    ],
    thumbnail: user.avatar_url ? { url: user.avatar_url } : undefined,
    footer: { text: 'AniVault • Login Event' },
    timestamp: new Date().toISOString(),
  };
}

async function send(env: DiscordEnv, db: Db, type: 'register' | 'login', user: NotifyUser, method: string): Promise<void> {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_LOG_CHANNEL_ID) return;

  let displayId: number | null = null;
  if (user.id) {
    const row = await db.fetchOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM users WHERE id <= ?', [user.id]);
    displayId = row?.cnt ?? null;
  }

  const embed = type === 'register'
    ? buildRegisterEmbed(user, displayId, method)
    : buildLoginEmbed(user, displayId, method);

  try {
    // Fire-and-forget-ish; a failed post here must never break login/register.
    // Workers still needs the promise settled before the response finishes,
    // so we await with a short timeout via AbortController.
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    await fetch(`https://discord.com/api/v10/channels/${env.DISCORD_LOG_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      },
      body: JSON.stringify({ embeds: [embed] }),
      signal: controller.signal,
    });
    clearTimeout(t);
  } catch {
    // Silently ignore — a Discord outage must never affect login/register.
  }
}

export const DiscordNotifier = {
  newUser: (env: DiscordEnv, db: Db, user: NotifyUser, method = 'email') => send(env, db, 'register', user, method),
  userLogin: (env: DiscordEnv, db: Db, user: NotifyUser, method = 'email') => send(env, db, 'login', user, method),
};
