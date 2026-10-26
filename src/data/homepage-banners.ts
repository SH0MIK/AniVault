/**
 * Static homepage hero carousel content.
 * This list is intentionally independent of admin/D1 banner settings and live catalog feeds.
 */
export interface HomepageBanner {
  /** AniVault anime ID used in the details URL and Add to List action. */
  animeId: string;
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
    animeId: '21',
    title: 'One Piece',
    description: 'After surviving a deadly whirlpool at sea by hiding inside a barrel, the carefree Monkey D. Luffy finds himself on a ship that is being attacked by fearsome pirates. Although he looks like a naive teenager, Luffy should not be underestimated. He is an unmatched fighter and a pirate himself, determined to obtain the coveted One Piece treasure and claim the title of King of the Pirates. Before his death, the former King of the Pirates, Gol D. Roger, shook the world by revealing the location of his vast riches and daring anyone to claim them. Since then, countless powerful pirates have sailed dangerous seas in search of the One Piece, only to never return. Luffy may lack a crew and a proper ship, but he possesses a superhuman ability and an unbreakable spirit that make him both a formidable opponent and an inspiration to many. With a big smile on his face, Luffy faces numerous challenges and gathers one-of-a-kind companions to join his ambitious quest. Together, they embrace perils and wonders on a once-in-a-lifetime adventure.',
    genres: ['Action', 'Adventure', 'Fantasy'],
    score: 86.0,
    episodes: 1181,
    format: 'TV',
    bannerImage: '',
    logoImage: '',
    coverImage: '',
  },
];
