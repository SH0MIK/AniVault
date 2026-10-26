/**
 * Static homepage hero carousel content.
 * Add curated entries here; the homepage does not read admin/D1 banner settings
 * or fall back to live Hoshika trending data for its hero slides.
 */
export interface HomepageBanner {
  /** Hoshika shortId used in the anime page URL. */
  animeId: string;
  title: string;
  description: string;
  bannerImage: string;
  logoImage?: string;
  coverImage?: string;
}

export const HOMEPAGE_BANNERS: HomepageBanner[] = [];
