import { Hono } from 'hono';
import { authRoutes } from './routes/auth';
import { homeRoutes } from './routes/home';
import { browseRoutes } from './routes/browse';
import { discoverRoutes } from './routes/discover';
import { animeRoutes } from './routes/anime';
import { characterRoutes } from './routes/character';
import { watchRoutes } from './routes/watch';
import { listRoutes } from './routes/lists';
import { apiListRoutes } from './routes/api-lists';
import { importExportRoutes } from './routes/importexport';
import { profileRoutes } from './routes/profile';
import { avatarRoutes } from './routes/avatar';
import { bannerRoutes } from './routes/banner';
import { userRoutes } from './routes/user';
import { adminIndexRoutes } from './routes/admin/index';
import { impersonateRoutes } from './routes/admin/impersonate';
import { adminUsersRoutes } from './routes/admin/users';
import { adminEpisodesRoutes } from './routes/admin/episodes';
import { episodeOverrideRoutes } from './routes/api-episode-override';
import { adminVideosRoutes } from './routes/admin/videos';
import { apiVideosRoutes } from './routes/api-videos';
import { adminEpThumbnailsRoutes } from './routes/admin/ep-thumbnails';
import { adminEpisodeCacheImportRoutes } from './routes/admin/episode-cache-import';
import { thumbSearchRoutes } from './routes/api-thumb-search';
import { adminMiscSmallRoutes } from './routes/admin/misc-small';
import { adminAnnouncementsRoutes } from './routes/admin/announcements';
import { adminAnimeImagesRoutes } from './routes/admin/anime-images';
import { adminAnimeBannersRoutes } from './routes/admin/anime-banners';
import { adminHomeBannersRoutes } from './routes/admin/home-banners';
import { adminMergeUsersRoutes } from './routes/admin/merge-users';
import { adminUsernameFixerRoutes } from './routes/admin/username-fixer';
import { adminAnalyticsRoutes } from './routes/admin/analytics';
import { adminFeedbackRoutes } from './routes/admin/feedback';
import { adminBadgesRoutes } from './routes/admin/badges';
import { adminSurveyRoutes } from './routes/admin/survey';
import { adminCacheRoutes } from './routes/admin/cache';
import { adminEpisodeScannerRoutes } from './routes/admin/episode-scanner';
import { adminWatchStatsRoutes } from './routes/admin/watch-stats';
import { adminHealImagesRoutes } from './routes/admin/heal-images';
import { scraperRoutes } from './routes/api-scraper';
import { legalRoutes } from './routes/legal';
import { watchNowRoutes } from './routes/watch-now';
import { legacyRedirectRoutes } from './routes/legacy-redirects';
import { apiChatRoutes } from './routes/api-chat';
import { healthRoutes } from './routes/health';
import { handleScheduled } from './scheduled';

// Env bindings + secrets (set secrets via `wrangler secret put NAME`, see wrangler.toml)
export interface Env {
  DB: D1Database;
  API_CACHE: KVNamespace;
  AVATARS: R2Bucket;
  SITE_NAME: string;
  SITE_URL: string;
  SESSION_LIFETIME_SECONDS: string;
  API_CACHE_ENABLED?: string;
  API_CACHE_TIME?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_REDIRECT_URI?: string;
  DISCORD_SERVER_ID?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_LOG_CHANNEL_ID?: string;
  // Shared secret between this Worker and the AniVault Discord bot (Vercel).
  // Used both ways: the bot doesn't call in with it anymore for notifications
  // (the Worker posts those to Discord directly), but the bot DOES send it
  // as `x-bot-secret` when hitting /api/discord/user-lookup for /user.
  BOT_SECRET?: string;
  MAL_CLIENT_ID?: string;
  MAL_CLIENT_SECRET?: string;
  MAL_REDIRECT_URI?: string;
  ANILIST_CLIENT_ID?: string;
  ANILIST_CLIENT_SECRET?: string;
  ANILIST_REDIRECT_URI?: string;
  TMDB_API_KEY?: string;
  SCRAPER_API_BASE?: string;
}

const app = new Hono<{ Bindings: Env }>();

app.route('/', healthRoutes);
app.route('/', authRoutes);
app.route('/', homeRoutes);
app.route('/', browseRoutes);
app.route('/', discoverRoutes);
app.route('/', animeRoutes);
app.route('/', characterRoutes);
app.route('/', watchRoutes);
app.route('/', listRoutes);
app.route('/', apiListRoutes);
app.route('/', importExportRoutes);
app.route('/', profileRoutes);
app.route('/', avatarRoutes);
app.route('/', bannerRoutes);
app.route('/', userRoutes);
app.route('/', adminIndexRoutes);
app.route('/', impersonateRoutes);
app.route('/', adminUsersRoutes);
app.route('/', adminEpisodesRoutes);
app.route('/', episodeOverrideRoutes);
app.route('/', adminVideosRoutes);
app.route('/', apiVideosRoutes);
app.route('/', adminEpThumbnailsRoutes);
app.route('/', adminEpisodeCacheImportRoutes);
app.route('/', thumbSearchRoutes);
app.route('/', adminMiscSmallRoutes);
app.route('/', adminAnnouncementsRoutes);
app.route('/', adminAnimeImagesRoutes);
app.route('/', adminAnimeBannersRoutes);
app.route('/', adminHomeBannersRoutes);
app.route('/', adminMergeUsersRoutes);
app.route('/', adminUsernameFixerRoutes);
app.route('/', adminAnalyticsRoutes);
app.route('/', adminFeedbackRoutes);
app.route('/', adminBadgesRoutes);
app.route('/', adminSurveyRoutes);
app.route('/', adminCacheRoutes);
app.route('/', adminEpisodeScannerRoutes);
app.route('/', adminWatchStatsRoutes);
app.route('/', adminHealImagesRoutes);
app.route('/', scraperRoutes);
app.route('/', legalRoutes);
app.route('/', watchNowRoutes);
app.route('/', legacyRedirectRoutes);
app.route('/', apiChatRoutes);

// Global error handler — without this, an unhandled exception anywhere just
// shows a bare "Internal Server Error" with no detail in the logs beyond
// whatever single stack frame Cloudflare happens to capture. This logs the
// full error (message + stack + which URL triggered it) and returns a
// plain but on-brand error page instead of a blank one.
app.onError((err, c) => {
  console.error(`[unhandled] ${c.req.method} ${c.req.url} — ${err.message}\n${err.stack ?? ''}`);
  return c.html(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Something went wrong</title>
    <style>body{background:#080808;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:20px;}
    h1{font-size:1.3rem;margin-bottom:8px;} p{color:#8a8aa3;font-size:.9rem;} a{color:#9d6ef8;}</style></head>
    <body><div><h1>Something went wrong</h1><p>This page hit an unexpected error. It's been logged — try again in a moment.</p><p><a href="/">Go home</a></p></div></body></html>`,
    500
  );
});

export default {
  fetch: app.fetch,
  // Cloudflare Cron Trigger entry point — see [triggers] in wrangler.toml.
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(env, event.cron));
  },
};
