/**
 * Static homepage hero carousel content.
 * This list is intentionally independent of admin/D1 banner settings and live catalog feeds.
 */
export interface HomepageBanner {
  /** AniVault anime ID used in the details URL and Add to List action. */
  animeId: string;
  /** Hoshika shortId for catalog-backed actions, when available. */
  hoshikaShortId?: number;
  title: string;
  description: string;
  genres: string[];
  score: number;
  episodes: number;
  format: string;
  bannerImage: string;
  logoImage?: string;
  coverImage?: string;
}

export const HOMEPAGE_BANNERS: HomepageBanner[] = [
  {
    animeId: '58090',
    hoshikaShortId: 58090,
    title: 'One Piece',
    description: 'After surviving a deadly whirlpool at sea by hiding inside a barrel, the carefree Monkey D. Luffy finds himself on a ship that is being attacked by fearsome pirates. Although he looks like a naive teenager, Luffy should not be underestimated. He is an unmatched fighter and a pirate himself, determined to obtain the coveted One Piece treasure and claim the title of King of the Pirates. Before his death, the former King of the Pirates, Gol D. Roger, shook the world by revealing the location of his vast riches and daring anyone to claim them. Since then, countless powerful pirates have sailed dangerous seas in search of the One Piece, only to never return. Luffy may lack a crew and a proper ship, but he possesses a superhuman ability and an unbreakable spirit that make him both a formidable opponent and an inspiration to many. With a big smile on his face, Luffy faces numerous challenges and gathers one-of-a-kind companions to join his ambitious quest. Together, they embrace perils and wonders on a once-in-a-lifetime adventure.',
    genres: ['Action', 'Adventure', 'Fantasy'],
    score: 86.0,
    episodes: 1181,
    format: 'TV',
    bannerImage: 'https://cdn.hoshika.app/catalog/anime/contrib/a1a4a0b8-7813-463f-8d5a-eae842158e52.webp',
    logoImage: 'https://www.anivault.co/assets/img/home-banner-library/logo-21-1791167330238-u31ivh.webp',
    coverImage: 'https://cdn.hoshika.app/catalog/anime/58090/cover.webp',
  },
  {
    animeId: '556910',
    hoshikaShortId: 556910,
    title: 'Black Clover Season 2',
    description: 'The battle for the Clover Kingdom enters a new phase as Asta and the Magic Knights face the growing threat of the Spade Kingdom. With powerful enemies emerging and the stakes rising, they must push their abilities further to protect their kingdom and everyone they care about.',
    genres: ['Action', 'Fantasy', 'Shounen'],
    score: 88,
    episodes: 3,
    format: 'TV',
    bannerImage: 'https://cdn.hoshika.app/catalog/banners/556910.webp',
    logoImage: '',
    coverImage: 'https://cdn.hoshika.app/catalog/covers/anime/556910.webp',
  },
];
