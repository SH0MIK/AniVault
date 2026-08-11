// Builds the list of [icon, url, label] tuples for a user's social links,
// shared between the edit-profile hero and the public /u/:username page so
// the two never drift out of sync.
//
// Discord is special: if the account is OAuth-connected (discord_id is
// set), we always use that ID for the link — a manually-entered
// social_discord_id is ignored in that case so people can't spoof a
// different Discord account than the one they actually logged in with.
// Either way we don't have a Discord *username* from OAuth (Discord's
// OAuth scope we request doesn't return one), so the label always comes
// from social_discord_label, falling back to a plain "Discord".
export function buildSocialLinks(u: any): [string, string, string][] {
  const links: [string, string, string][] = [];

  const discordId = u.discord_id || u.social_discord_id;
  if (discordId) {
    links.push(['discord', `https://discord.com/users/${discordId}`, u.social_discord_label || 'Discord']);
  }
  if (u.social_twitter) links.push(['twitter', `https://twitter.com/${u.social_twitter}`, `@${u.social_twitter}`]);
  if (u.social_instagram) links.push(['instagram', `https://instagram.com/${u.social_instagram}`, `@${u.social_instagram}`]);
  if (u.social_facebook) links.push(['facebook', `https://facebook.com/${u.social_facebook}`, 'Facebook']);
  if (u.social_youtube) links.push(['youtube', `https://youtube.com/@${u.social_youtube}`, 'YouTube']);
  if (u.social_reddit) links.push(['reddit', `https://reddit.com/u/${u.social_reddit}`, `u/${u.social_reddit}`]);
  if (u.social_mal) links.push(['tv', `https://myanimelist.net/profile/${u.social_mal}`, 'MyAnimeList']);
  if (u.social_anilist) links.push(['anilist', `https://anilist.co/user/${u.social_anilist}`, 'AniList']);
  if (u.social_website) {
    const url = /^https?:\/\//i.test(u.social_website) ? u.social_website : `https://${u.social_website}`;
    links.push(['globe', url, 'Website']);
  }

  return links;
}

// Brand accent color shown on hover for each platform's icon button.
const PLATFORM_COLORS: Record<string, string> = {
  discord: '#5865F2', twitter: '#1DA1F2', instagram: '#E1306C', facebook: '#1877F2',
  youtube: '#FF0000', reddit: '#FF4500', tv: '#2E51A2', anilist: '#02A9FF', globe: '#8B8FA3',
};
export function platformColor(icon: string): string {
  return PLATFORM_COLORS[icon] || 'var(--accent)';
}
