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
  {
    animeId: '153',
    hoshikaShortId: 89408,
    title: 'Black Clover',
    description: 'Asta and Yuno were abandoned together at a church and grew up as rivals with one shared dream: to become the Wizard King. While Yuno is a gifted mage, Asta is born without magic in a world where magic defines almost everything. Refusing to give up, Asta gains an unusual anti-magic power and joins the Black Bulls, beginning a journey filled with fierce battles, powerful rivals, and an unshakable determination to prove that anyone can rise to the top.',
    genres: ['Action', 'Fantasy', 'Shounen'],
    score: 82,
    episodes: 170,
    format: 'TV',
    bannerImage: 'https://cdn.hoshika.app/catalog/banners/89408.webp',
    logoImage: '',
    coverImage: 'https://cdn.hoshika.app/catalog/covers/anime/89408.webp',
  },
];
