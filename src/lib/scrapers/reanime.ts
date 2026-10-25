// Cloudflare Worker adapter for the original ReAnime resolver. No Node.js APIs or external scraper service.
const crypto = self.crypto;
const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  return btoa(binary);
}
function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
function bufferLike(bytes: Uint8Array): any {
  const out: any = new Uint8Array(bytes);
  out.toString = (encoding = 'utf8') => {
    if (encoding === 'base64') return bytesToBase64(out);
    if (encoding === 'base64url') return bytesToBase64(out).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    return dec.decode(out);
  };
  return out;
}
const Buffer: any = {
  from(value: string | Uint8Array, encoding = 'utf8') {
    if (value instanceof Uint8Array) return bufferLike(value);
    if (encoding === 'base64' || encoding === 'base64url') return bufferLike(base64ToBytes(value));
    return bufferLike(enc.encode(value));
  },
  alloc(size: number) { return bufferLike(new Uint8Array(size)); },
};
async function workerRequest(url: string, config: any = {}, method = 'GET', body?: any): Promise<any> {
  const target = new URL(url);
  for (const [key, value] of Object.entries(config.params ?? {})) {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(config.timeout ?? 15000));
  try {
    const headers = { ...(config.headers ?? {}) } as Record<string, string>;
    if (body !== undefined) headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    const response = await fetch(target.toString(), {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal, redirect: 'follow',
    });
    const text = await response.text();
    if (!response.ok) throw new Error('Upstream HTTP ' + response.status + ' for ' + target.hostname);
    let data: any = text;
    if (config.responseType !== 'text') {
      try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    }
    return { data, status: response.status, headers: response.headers };
  } finally { clearTimeout(timer); }
}
const axios: any = {
  get: (url: string, config?: any) => workerRequest(url, config),
  post: (url: string, body: any, config?: any) => workerRequest(url || 'https://graphql.anilist.co', config, 'POST', body),
};
// Worker has no process-local cache; correctness is preserved while Cloudflare cache integration can be added separately.
function cacheGet<T>(_key: string): T | null { return null; }
function cacheSet(_key: string, _value: unknown, _kind?: string): void {}
const anilistClient: any = { post: (path: string, body: any) => axios.post('https://graphql.anilist.co' + path, body, { timeout: 12000 }) };


const BASE = 'https://reanime.to';
const FLIX = 'https://flixcloud.cc';
const ANIZIP = 'https://api.ani.zip/mappings';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

declare const WebAssembly: any;

export interface ReanimeEpisode {
  num: number;
  id: string;
  title: string;
  titleJapanese?: string | null;
  titleRomanji?: string | null;
  image?: string | null;
  airDate?: string | null;
  duration?: number | null;
  filler?: boolean;
  recap?: boolean;
  description?: string | null;
}

export interface ReanimeServer {
  name: string;
  sourceId: string;
  type: 'sub' | 'dub';
}

export interface ReanimeSubtitle {
  lang: string;
  url: string;
  default?: boolean;
}

export interface ReanimeQuality {
  label: string;
  url: string;
  bandwidth?: number;
  resolution?: string;
}

export interface ReanimeAudioTrack {
  lang: string;
  name?: string;
  url?: string;
  default?: boolean;
}

export interface ReanimeStream {
  embedUrl: string;
  m3u8: string | null;
  referer?: string;
  playlistKey?: string | null;
  subtitles: ReanimeSubtitle[];
  audioTracks?: ReanimeAudioTrack[];
  selectedAudioLang?: string | null;
  qualities?: ReanimeQuality[];
  serverName: string;
  dataType?: string;
  intro?: any;
  outro?: any;
  thumbnailsVtt?: string | null;
  videoTitle?: string | null;
  type: 'hls' | 'iframe';
}

interface ReanimeSeries {
  animeId: string;
  title: string;
  anilistId: number;
  malId: number | null;
  subbed: number | null;
  dubbed: number | null;
  episodesCount: number | null;
}

interface ReanimeLink {
  '$id'?: string;
  serverName?: string;
  dataType?: string;
  dataLink?: string;
}

interface ReanimeEpisodeLookup {
  animeId?: string | null;
  anilistId?: number | string | null;
  malId?: number | string | null;
  title?: string | null;
  altTitle?: string | null;
}

async function sha256hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === 'string' ? enc.encode(input) : input;
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function b64toU8(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

async function deriveFields(seed: string) {
  let e = seed;
  for (let i = 0; i < 3; i++) e = await sha256hex(e + i);
  let l = e;
  for (let i = 0; i < 3; i++) l = await sha256hex(l + i);
  return {
    keyField: 'kf_' + e.substring(8, 16),
    ivField: 'ivf_' + e.substring(16, 24),
    containerName: 'cd_' + e.substring(24, 32),
    arrayName: 'ad_' + e.substring(32, 40),
    objectName: 'od_' + e.substring(40, 48),
    tokenField: e.substring(48, 64) + '_' + e.substring(56, 64),
    keyFrag2Field: l.substring(0, 16) + '_' + l.substring(16, 24),
  };
}

function extractSsrObj(html: string): string {
  const m = html.match(/\{type:"data",data:(\{)/);
  if (!m || m.index === undefined) throw new Error('SSR data block not found');
  let depth = 0;
  const start = html.indexOf('{', m.index + m[0].length - 1);
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      if (--depth === 0) return html.slice(start, i + 1);
    }
  }
  throw new Error('SSR brace matching failed');
}

function parseJsLiteral(src: string): any {
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const parseString = (quote: string) => {
    let out = '';
    i++;
    while (i < src.length && src[i] !== quote) {
      if (src[i] !== '\\') {
        out += src[i++];
        continue;
      }
      i++;
      const ch = src[i++];
      if (ch === 'u') {
        const hex = src.slice(i, i + 4);
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else {
        out += ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', "'": "'", '\\': '\\', '/': '/' } as Record<string, string>)[ch] ?? ch;
      }
    }
    i++;
    return out;
  };
  const parseKey = () => {
    ws();
    if (src[i] === '"' || src[i] === "'") return parseString(src[i]);
    const m = src.slice(i).match(/^[a-zA-Z_$][a-zA-Z0-9_$]*/);
    if (!m) throw new Error(`Bad key at pos ${i}`);
    i += m[0].length;
    return m[0];
  };
  const parseValue = (): any => {
    ws();
    if (src[i] === '{') return parseObject();
    if (src[i] === '[') return parseArray();
    if (src[i] === '"' || src[i] === "'") return parseString(src[i]);
    if (src.startsWith('true', i)) return i += 4, true;
    if (src.startsWith('false', i)) return i += 5, false;
    if (src.startsWith('null', i)) return i += 4, null;
    if (src.startsWith('undefined', i)) return i += 9, null;
    if (src.startsWith('!0', i)) return i += 2, true;
    if (src.startsWith('!1', i)) return i += 2, false;
    const m = src.slice(i).match(/^-?[\d.]+(?:[eE][+-]?\d+)?/);
    if (m) {
      i += m[0].length;
      return parseFloat(m[0]);
    }
    throw new Error(`JS parse error at pos ${i}: ${src.slice(i, i + 30)}`);
  };
  const parseObject = () => {
    const obj: Record<string, any> = {};
    i++;
    ws();
    while (i < src.length && src[i] !== '}') {
      if (src[i] === ',') {
        i++;
        ws();
        continue;
      }
      const key = parseKey();
      ws();
      if (src[i] !== ':') throw new Error(`Expected colon at pos ${i}`);
      i++;
      obj[key] = parseValue();
      ws();
    }
    i++;
    return obj;
  };
  const parseArray = () => {
    const arr: any[] = [];
    i++;
    ws();
    while (i < src.length && src[i] !== ']') {
      if (src[i] === ',') {
        i++;
        ws();
        continue;
      }
      arr.push(parseValue());
      ws();
    }
    i++;
    return arr;
  };
  return parseValue();
}

function parseWasmDecrypt(wasmBytes: Uint8Array) {
  const b = wasmBytes;
  let pos = 8;
  while (pos < b.length) {
    const secId = b[pos++];
    let sz = 0, sh = 0, by = 0;
    do {
      by = b[pos++];
      sz |= (by & 127) << sh;
      sh += 7;
    } while (by & 128);
    if (secId === 10) {
      pos++;
      let sbs = 0, sh2 = 0, by2 = 0;
      do {
        by2 = b[pos++];
        sbs |= (by2 & 127) << sh2;
        sh2 += 7;
      } while (by2 & 128);
      pos += sbs;
      break;
    }
    pos += sz;
  }
  let rbs = 0, sh3 = 0, by3 = 0;
  do {
    by3 = b[pos++];
    rbs |= (by3 & 127) << sh3;
    sh3 += 7;
  } while (by3 & 128);
  const r = b.slice(pos, pos + rbs);
  const leb = (arr: Uint8Array, idx: number): [number, number] => {
    let v = 0, s = 0, byte = 0;
    do {
      byte = arr[idx++];
      v |= (byte & 127) << s;
      s += 7;
    } while (byte & 128);
    return [v, idx];
  };

  const xorEnd = [32, 2, 32, 5, 106, 45, 0, 0, 115, 33, 6];
  let txStart = -1;
  outer: for (let i = 0; i < r.length - xorEnd.length; i++) {
    for (let j = 0; j < xorEnd.length; j++) if (r[i + j] !== xorEnd[j]) continue outer;
    txStart = i + xorEnd.length;
    break;
  }
  if (txStart < 0) throw new Error('WASM: transform start not found');

  let txEnd = -1, step = 36;
  for (let i = txStart; i < r.length - 4; i++) {
    if (r[i] === 32 && r[i + 1] === 5 && r[i + 2] === 65) {
      const [val, ni] = leb(r, i + 3);
      if (r[ni] === 108) {
        txEnd = i;
        step = val;
        break;
      }
    }
  }
  if (txEnd < 0) throw new Error('WASM: keystream not found');
  const code = r.slice(txStart, txEnd);

  const transform = (inputByte: number) => {
    let local6 = inputByte & 255;
    const stk: number[] = [];
    let i = 0;
    while (i < code.length) {
      const op = code[i++];
      if (op === 32) {
        const [idx, ni] = leb(code, i);
        i = ni;
        stk.push(idx === 6 ? local6 : 0);
      } else if (op === 33) {
        const [idx, ni] = leb(code, i);
        i = ni;
        const v = stk.pop() ?? 0;
        if (idx === 6) local6 = v & 255;
      } else if (op === 65) {
        const [v, ni] = leb(code, i);
        i = ni;
        stk.push(v);
      } else if (op === 106) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a + b2) & 255);
      } else if (op === 107) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a - b2 + 256) & 255);
      } else if (op === 113) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a & b2) & 255);
      } else if (op === 114) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a | b2) & 255);
      } else if (op === 115) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a ^ b2) & 255);
      } else if (op === 116) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a << (b2 & 7)) & 255);
      } else if (op === 118) {
        const b2 = stk.pop() ?? 0, a = stk.pop() ?? 0;
        stk.push((a >>> (b2 & 7)) & 255);
      }
    }
    return local6;
  };
  return { step, transform };
}

async function runWasmDecrypt(wasmBytes: Uint8Array, frag1: Uint8Array, kf2: Uint8Array, tokenBytes: Uint8Array, seedInt: number): Promise<{ key: Uint8Array; playlistKey: Uint8Array | null }> {
  try {
    const wasm = await WebAssembly.instantiate(wasmBytes, {});
    const instance: any = 'instance' in wasm ? wasm.instance : wasm;
    const exports: any = instance.exports;
    const memory = exports.memory;
    if (!memory || typeof exports._s !== 'function' || typeof exports._r !== 'function') throw new Error('Required WASM exports missing');
    if (memory.buffer.byteLength === 0) memory.grow(1);
    const heap = new Uint8Array(memory.buffer);
    const len = frag1.length;
    const fragOffset = 1000;
    const keyFragOffset = fragOffset + len;
    const tokenOffset = keyFragOffset + len;
    const outOffset = tokenOffset + len;
    heap.set(frag1, fragOffset);
    heap.set(kf2, keyFragOffset);
    heap.set(tokenBytes, tokenOffset);
    exports._s(seedInt);
    exports._r(fragOffset, keyFragOffset, tokenOffset, outOffset, len);
    const key = new Uint8Array(len);
    key.set(new Uint8Array(memory.buffer).subarray(outOffset, outOffset + len));
    let playlistKey: Uint8Array | null = null;
    if (typeof exports._c === 'function') {
      const ptr = Number(exports._c());
      if (Number.isFinite(ptr) && ptr >= 0) {
        playlistKey = new Uint8Array(32);
        playlistKey.set(new Uint8Array(memory.buffer).subarray(ptr, ptr + 32));
      }
    }
    return { key, playlistKey };
  } catch {
    const { step, transform } = parseWasmDecrypt(wasmBytes);
    const key = new Uint8Array(frag1.length);
    for (let i = 0; i < frag1.length; i++) {
      const c = (frag1[i] ^ kf2[i] ^ tokenBytes[i]) & 255;
      key[i] = (transform(c) ^ ((i * step + seedInt) & 255)) & 255;
    }
    return { key, playlistKey: null };
  }
}

function decodeFlixPlaylist(text: string, playlistKey?: string | null): string {
  if (text.trim().startsWith('#EXTM3U') || !playlistKey) return text;
  try {
    const key = Buffer.from(playlistKey, 'base64');
    const encrypted = Buffer.from(text.trim(), 'base64');
    if (!key.length || !encrypted.length) return text;
    const out = Buffer.alloc(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) out[i] = encrypted[i] ^ key[i % key.length];
    const decoded = out.toString('utf8');
    return decoded.startsWith('#EXTM3U') ? decoded : text;
  } catch {
    return text;
  }
}

function runDecrypt(wasmBytes: Uint8Array, frag1: Uint8Array, kf2: Uint8Array, tokenBytes: Uint8Array, seedInt: number): Uint8Array {
  const { step, transform } = parseWasmDecrypt(wasmBytes);
  const out = new Uint8Array(frag1.length);
  for (let i = 0; i < frag1.length; i++) {
    const c = (frag1[i] ^ kf2[i] ^ tokenBytes[i]) & 255;
    out[i] = (transform(c) ^ ((i * step + seedInt) & 255)) & 255;
  }
  return out;
}

async function decryptEmbed(html: string) {
  const data = parseJsLiteral(extractSsrObj(html));
  const seed = data.obfuscation_seed;
  if (!seed) throw new Error('obfuscation_seed missing');
  const fields = await deriveFields(seed);
  const obj = data.obfuscated_crypto_data?.[fields.containerName]?.[fields.arrayName]?.[0]?.[fields.objectName];
  if (!obj) throw new Error('obfuscated_crypto_data missing');

  const frag1 = b64toU8(obj[fields.keyField]);
  const iv = b64toU8(obj[fields.ivField]);
  const kf2 = b64toU8(data[fields.keyFrag2Field] ?? '');
  const token = data[fields.tokenField];
  if (!token) throw new Error('token field missing');

  const tokRes = await axios.get(`${FLIX}/api/m3u8/${token}`, {
    headers: { ...HEADERS, Referer: `${BASE}/` },
    timeout: 15000,
  });
  const tokData = tokRes.data;
  const vidKey = (await sha256hex(token + 'vid')).substring(0, 10);
  const keyKey = (await sha256hex(token + 'key')).substring(0, 10);
  const encryptedVideo = b64toU8(tokData[vidKey] ?? '');
  const tokenBytes = b64toU8(tokData[keyKey] ?? '');
  const wasmPayload = b64toU8(data.w_payload ?? '');
  if (!encryptedVideo.length || !tokenBytes.length || !wasmPayload.length) throw new Error('Token or wasm payload missing');

  const seedInt = parseInt(seed.substring(0, 8), 16);
  const wasmResult = await runWasmDecrypt(wasmPayload, frag1, kf2, tokenBytes, seedInt);
  const wasmOut = wasmResult.key;
  const keyMat = await crypto.subtle.importKey('raw', wasmOut, { name: 'PBKDF2' }, false, ['deriveBits']);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(seed), iterations: 1000, hash: 'SHA-256' }, keyMat, 256));
  for (let i = 0; i < 32; i++) derived[i] ^= seed.charCodeAt(i % seed.length);
  const aesKeyBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', derived));
  const aesKey = await crypto.subtle.importKey('raw', aesKeyBytes, { name: 'AES-CBC' }, false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, encryptedVideo);
  const url = dec.decode(plain).trim().replace(/\0+$/, '');
  if (!url.startsWith('http')) throw new Error(`Unexpected decrypted value: ${url.substring(0, 60)}`);

  return {
    url,
    playlistKey: wasmResult.playlistKey ? Buffer.from(wasmResult.playlistKey).toString('base64') : null,
    subtitles: data.subtitles ?? [],
    thumbnails_vtt: data.thumbnails_vtt ?? null,
    video_title: data.video_title ?? null,
    intro_chapter: data.intro_chapter ?? null,
    outro_chapter: data.outro_chapter ?? null,
  };
}

function encodePayload(payload: any): string {
  return `reanime:${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
}

function decodePayload(sourceId: string): any {
  if (!sourceId.startsWith('reanime:')) throw new Error('Invalid ReAnime sourceId');
  return JSON.parse(Buffer.from(sourceId.slice('reanime:'.length), 'base64url').toString('utf8'));
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  return Array.from(new Map(items.map((item) => [key(item), item])).values());
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function significantWords(title: string): string[] {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length >= 2);
}

function scoreTitle(query: string, title: string): number {
  const needle = normalizeTitle(query);
  const hay = normalizeTitle(title);
  if (!needle || !hay) return 0;
  if (needle === hay) return 100;
  const ratio = Math.min(needle.length, hay.length) / Math.max(needle.length, hay.length);
  if (hay.startsWith(needle) || needle.startsWith(hay)) return ratio >= 0.6 ? 85 : Math.floor(ratio * 60);
  if (hay.includes(needle) || needle.includes(hay)) return ratio >= 0.6 ? 70 : Math.floor(ratio * 45);
  const qWords = new Set(significantWords(query));
  const hits = significantWords(title).filter((word) => qWords.has(word)).length;
  return Math.floor((hits / Math.max(qWords.size, 1)) * 55);
}

function buildTitles(media: any, anizip: any): string[] {
  const titles = [
    media?.title?.english,
    media?.title?.romaji,
    media?.title?.native,
    ...(Array.isArray(media?.synonyms) ? media.synonyms : []),
    ...Object.values(anizip?.titles ?? {}),
  ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return unique(titles.map((title) => title.replace(/\s+/g, ' ').trim()), (title) => title.toLowerCase()).slice(0, 12);
}

function titleHintVariants(title?: string | null, altTitle?: string | null): string[] {
  const raw = [title, altTitle].filter((value): value is string => typeof value === 'string' && value.trim().length > 0 && value !== 'Unknown');
  const variants = raw.flatMap((value) => [
    value,
    value.replace(/[â€™']/g, ''),
    value.split(/[:(|-]/)[0]?.trim(),
  ]);
  return unique(variants.filter((value) => value && value.length >= 3).map((value) => value.replace(/\s+/g, ' ').trim()), (value) => value.toLowerCase()).slice(0, 8);
}

async function getAnilistMedia(anilistId: number): Promise<any> {
  const cached = cacheGet<any>(`reanime:anilist:${anilistId}`);
  if (cached) return cached;
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        episodes
        title { english romaji native }
        synonyms
      }
    }
  `;
  const res = await anilistClient.post('', { query, variables: { id: anilistId } });
  const media = res.data?.data?.Media;
  if (!media) throw new Error(`AniList media ${anilistId} not found`);
  cacheSet(`reanime:anilist:${anilistId}`, media, 'mapping');
  return media;
}

async function fetchAnizip(anilistId: number): Promise<any> {
  try {
    const res = await axios.get(`${ANIZIP}?anilist_id=${anilistId}`, { timeout: 10000 });
    return res.data;
  } catch {
    return null;
  }
}

async function searchReanime(query: string): Promise<any[]> {
  // ReAnime's public API moved from /api/v1/search to /api/search.
  // Keep the legacy path as a fallback, and normalize both response shapes.
  for (const path of ['/api/search', '/api/v1/search']) {
    try {
      const res = await axios.get(`${BASE}${path}`, {
        params: { q: query, limit: 10 },
        headers: HEADERS,
        timeout: 15000,
      });
      const payload = res.data;
      const rows = Array.isArray(payload) ? payload
        : Array.isArray(payload?.results) ? payload.results
        : Array.isArray(payload?.data) ? payload.data
        : Array.isArray(payload?.anime) ? payload.anime : [];
      if (rows.length) {
        return rows.map((item: any) => {
          const id = item?.anime_id ?? item?.slug ?? item?.id ?? item?.animeId;
          const rawTitle = item?.title;
          const title = typeof rawTitle === 'string'
            ? { english: rawTitle, romaji: rawTitle }
            : rawTitle ?? { english: item?.title_english ?? item?.name ?? '', romaji: item?.title_romaji ?? item?.name ?? '' };
          return { ...item, anime_id: id == null ? undefined : String(id), title };
        }).filter((item: any) => item.anime_id && (item.title?.english || item.title?.romaji));
      }
    } catch {
      // Try the other known API version.
    }
  }
  return [];
}

async function fetchAnimeDetail(animeId: string): Promise<any | null> {
  // Current ReAnime exposes the anime object through /api/watch/{slug}/1.
  // The older /api/v1/anime/{slug} endpoint remains a compatibility fallback.
  for (const path of [
    `/api/watch/${encodeURIComponent(animeId)}/1`,
    `/api/v1/anime/${encodeURIComponent(animeId)}`,
  ]) {
    try {
      const res = await axios.get(`${BASE}${path}`, { headers: HEADERS, timeout: 15000 });
      const data = res.data?.anime ?? res.data?.data ?? res.data;
      if (data && typeof data === 'object') return data;
    } catch {
      // Try the next known endpoint.
    }
  }
  return null;
}

function extractAnilistIdFromCover(coverImage: any): number | null {
  const urls = [coverImage?.extra_large, coverImage?.large, coverImage?.medium].filter(Boolean);
  for (const url of urls) {
    const match = String(url).match(/anilist\.co\/.*\/bx(\d+)-/);
    if (match) return Number(match[1]);
  }
  return null;
}

async function resolveReanimeSeries(anilistId: number): Promise<ReanimeSeries> {
  const cacheKey = `reanime:series:${anilistId}`;
  const cached = cacheGet<ReanimeSeries>(cacheKey);
  if (cached) return cached;

  const [media, anizip] = await Promise.all([getAnilistMedia(anilistId), fetchAnizip(anilistId)]);
  const queries = buildTitles(media, anizip).slice(0, 5);
  const candidates = new Map<string, any>();
  await Promise.all(queries.map(async (query) => {
    const results = await searchReanime(query).catch(() => []);
    for (const item of results) if (item?.anime_id && !candidates.has(item.anime_id)) candidates.set(item.anime_id, item);
  }));

  for (const [animeId, item] of candidates) {
    if (extractAnilistIdFromCover(item.cover_image) === Number(anilistId)) {
      const series = {
        animeId,
        title: item.title?.english || item.title?.romaji || animeId,
        anilistId: Number(anilistId),
        malId: null,
        subbed: Number.isFinite(item.subbed) ? item.subbed : null,
        dubbed: Number.isFinite(item.dubbed) ? item.dubbed : null,
        episodesCount: Number.isFinite(item.episodes) ? item.episodes : null,
      };
      cacheSet(cacheKey, series, 'mapping');
      return series;
    }
  }

  const details = await Promise.all([...candidates.keys()].map(async (animeId) => ({ animeId, detail: await fetchAnimeDetail(animeId) })));
  for (const { animeId, detail } of details) {
    if (Number(detail?.anilist_id) === Number(anilistId) || (media?.idMal && Number(detail?.mal_id) === Number(media.idMal))) {
      const series = {
        animeId,
        title: detail?.title?.english || detail?.title?.romaji || candidates.get(animeId)?.title?.english || animeId,
        anilistId: Number(anilistId),
        malId: detail?.mal_id ? Number(detail.mal_id) : null,
        subbed: Number.isFinite(detail?.subbed) ? detail.subbed : null,
        dubbed: Number.isFinite(detail?.dubbed) ? detail.dubbed : null,
        episodesCount: Number.isFinite(detail?.episodes) ? detail.episodes : null,
      };
      cacheSet(cacheKey, series, 'mapping');
      return series;
    }
  }

  throw new Error(`No confirmed ReAnime match for AniList ${anilistId}`);
}

async function resolveReanimeSeriesByTitle(title: string, altTitle?: string | null, malId?: number | null): Promise<ReanimeSeries> {
  const cacheKey = `reanime:series:title:${String(title).toLowerCase().trim()}:${malId ?? ''}`;
  const cached = cacheGet<ReanimeSeries>(cacheKey);
  if (cached) return cached;

  const candidates = new Map<string, any>();
  await Promise.all(titleHintVariants(title, altTitle).slice(0, 5).map(async (query) => {
    const results = await searchReanime(query).catch(() => []);
    for (const item of results) if (item?.anime_id && !candidates.has(item.anime_id)) candidates.set(item.anime_id, item);
  }));

  const details = await Promise.all([...candidates.keys()].map(async (animeId) => ({ animeId, detail: await fetchAnimeDetail(animeId) })));
  const ranked = details
    .map(({ animeId, detail }) => {
      const item = candidates.get(animeId);
      const bestTitle = item?.title?.english || item?.title?.romaji || detail?.title?.english || detail?.title?.romaji || animeId;
      const score = Math.max(
        scoreTitle(title, bestTitle),
        altTitle ? scoreTitle(altTitle, bestTitle) : 0,
        detail?.mal_id && malId && Number(detail.mal_id) === Number(malId) ? 100 : 0,
      );
      return { animeId, detail, item, score };
    })
    .filter((entry) => entry.item)
    .sort((a, b) => b.score - a.score);

  const selected = ranked[0];
  if (!selected || selected.score < 45) throw new Error(`No confirmed ReAnime match for ${title}`);
  const series = {
    animeId: selected.animeId,
    title: selected.item?.title?.english || selected.item?.title?.romaji || selected.animeId,
    anilistId: Number(selected.item?.anilist_id || selected.item?.anilist || selected.detail?.anilist_id || selected.detail?.anilist || extractAnilistIdFromCover(selected.detail?.cover_image || selected.detail?.coverImage || selected.detail?.cover_image_url) || malId || 0),
    malId: (selected.detail?.mal_id ?? selected.detail?.malId ?? selected.detail?.myanimelist_id) ? Number(selected.detail?.mal_id ?? selected.detail?.malId ?? selected.detail?.myanimelist_id) : (malId ? Number(malId) : null),
    subbed: Number.isFinite(selected.item?.subbed) ? selected.item.subbed : null,
    dubbed: Number.isFinite(selected.item?.dubbed) ? selected.item.dubbed : null,
    episodesCount: Number.isFinite(selected.item?.episodes) ? selected.item.episodes : null,
  };
  cacheSet(cacheKey, series, 'mapping');
  return series;
}

async function fetchEpisodesList(animeId: string): Promise<any[]> {
  // Current ReAnime uses /api/episodes/{slug}; support the older v1 route too.
  for (const path of [
    `/api/episodes/${encodeURIComponent(animeId)}`,
    `/api/v1/anime/${encodeURIComponent(animeId)}/episodes`,
  ]) {
    try {
      const res = await axios.get(`${BASE}${path}`, {
        params: { limit: 2000 },
        headers: HEADERS,
        timeout: 15000,
      });
      const payload = res.data;
      const rows = Array.isArray(payload) ? payload
        : Array.isArray(payload?.data) ? payload.data
        : Array.isArray(payload?.episodes) ? payload.episodes : [];
      if (rows.length) return rows;
    } catch {
      // Try the next known endpoint.
    }
  }
  return [];
}

function normalizeSubtitles(raw: any[], masterUrl: string): ReanimeSubtitle[] {
  if (!Array.isArray(raw)) return [];
  const subs = raw.map((item: any, index: number) => {
    const url = item?.url || item?.file || item?.src;
    if (!url || typeof url !== 'string') return null;
    return {
      lang: String(item?.lang || item?.language || item?.label || item?.name || `Subtitle ${index + 1}`),
      url: new URL(url, masterUrl).toString(),
      default: Boolean(item?.default),
    };
  }).filter(Boolean) as ReanimeSubtitle[];
  return unique(subs, (sub) => sub.url);
}

function parseHlsAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const body = line.slice(line.indexOf(':') + 1);
  const re = /([A-Z0-9-]+)=("(?:[^"\\]|\\.)*"|[^,]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) attrs[match[1].toUpperCase()] = match[2].replace(/^"|"$/g, '');
  return attrs;
}

function parseHlsMaster(master: string, masterUrl: string): { qualities: ReanimeQuality[]; subtitles: ReanimeSubtitle[]; audioTracks: ReanimeAudioTrack[] } {
  const lines = master.split(/\r?\n/);
  const qualities: ReanimeQuality[] = [];
  const subtitles: ReanimeSubtitle[] = [];
  const audioTracks: ReanimeAudioTrack[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-MEDIA') && /TYPE=AUDIO/i.test(line)) {
      const attrs = parseHlsAttributes(line);
      audioTracks.push({
        lang: attrs.LANGUAGE || attrs.NAME || 'audio',
        name: attrs.NAME,
        url: attrs.URI ? new URL(attrs.URI, masterUrl).toString() : undefined,
        default: attrs.DEFAULT?.toUpperCase() === 'YES',
      });
    }
    if (line.startsWith('#EXT-X-MEDIA') && /TYPE=SUBTITLES/i.test(line)) {
      const attrs = parseHlsAttributes(line);
      if (attrs.URI) {
        subtitles.push({
          lang: attrs.LANGUAGE || attrs.NAME || 'Subtitle',
          url: new URL(attrs.URI, masterUrl).toString(),
          default: attrs.DEFAULT?.toUpperCase() === 'YES',
        });
      }
    }
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const attrs = parseHlsAttributes(line);
      const uri = lines.slice(i + 1).find((candidate) => {
        const trimmed = candidate.trim();
        return trimmed && !trimmed.startsWith('#');
      })?.trim();
      if (!uri) continue;
      const bandwidth = attrs.BANDWIDTH ? parseInt(attrs.BANDWIDTH, 10) : undefined;
      const resolution = attrs.RESOLUTION;
      const height = resolution?.match(/x(\d+)$/)?.[1];
      qualities.push({
        label: height ? `${height}p` : bandwidth ? `${Math.round(bandwidth / 1000)}kbps` : 'Auto',
        url: new URL(uri, masterUrl).toString(),
        bandwidth: Number.isFinite(bandwidth) ? bandwidth : undefined,
        resolution,
      });
    }
  }
  return {
    qualities: unique(qualities, (quality) => quality.url),
    subtitles: unique(subtitles, (subtitle) => subtitle.url),
    audioTracks: unique(audioTracks, (track) => `${track.lang}:${track.name ?? ''}:${track.url ?? ''}`),
  };
}

async function enrichHls(m3u8: string | null, subtitles: ReanimeSubtitle[], playlistKey?: string | null): Promise<{ qualities: ReanimeQuality[]; subtitles: ReanimeSubtitle[]; audioTracks: ReanimeAudioTrack[] }> {
  if (!m3u8) return { qualities: [], subtitles, audioTracks: [] };
  try {
    const res = await axios.get(m3u8, {
      headers: { ...HEADERS, Accept: '*/*', Referer: `${FLIX}/` },
      timeout: 12000,
      responseType: 'text',
      transformResponse: [(data: unknown) => data],
    });
    const parsed = parseHlsMaster(decodeFlixPlaylist(String(res.data), playlistKey), m3u8);
    return {
      qualities: parsed.qualities,
      subtitles: unique([...subtitles, ...parsed.subtitles], (subtitle) => subtitle.url),
      audioTracks: parsed.audioTracks,
    };
  } catch {
    return { qualities: [], subtitles, audioTracks: [] };
  }
}

async function fetchEpisodeLinks(lookup: ReanimeEpisodeLookup, ep: number): Promise<{ series: ReanimeSeries; links: ReanimeLink[] }> {
  const alId = lookup.anilistId == null ? null : Number(lookup.anilistId);
  const malId = lookup.malId == null ? null : Number(lookup.malId);
  const title = lookup.title && lookup.title !== 'Unknown' ? lookup.title : null;
  const altTitle = lookup.altTitle && lookup.altTitle !== 'Unknown' ? lookup.altTitle : null;
  // The episode ID carries the exact ReAnime slug used to fetch its episode
  // list. Reuse it instead of searching by title a second time, which could
  // resolve a different season or alias when the catalog has duplicate titles.
  const series: ReanimeSeries = lookup.animeId
    ? {
      animeId: String(lookup.animeId),
      title: title || altTitle || String(lookup.animeId),
      anilistId: alId != null && Number.isFinite(alId) ? alId : 0,
      malId: malId != null && Number.isFinite(malId) ? malId : null,
      subbed: null,
      dubbed: null,
      episodesCount: null,
    }
    : alId != null && Number.isFinite(alId)
      ? await resolveReanimeSeries(alId).catch((err) => {
        if (title) return resolveReanimeSeriesByTitle(title, altTitle, malId);
        throw err;
      })
      : await resolveReanimeSeriesByTitle(title || altTitle || 'Unknown', altTitle, malId);
  const [watchRes, flixRes] = await Promise.allSettled([
    axios.get(`${BASE}/api/watch/${encodeURIComponent(series.animeId)}/${ep}`, { headers: HEADERS, timeout: 15000 }).then((res: any) => res.data),
    alId != null && Number.isFinite(alId)
      ? axios.get(`${BASE}/api/flix/${alId}/${ep}`, { headers: HEADERS, timeout: 15000 }).then((res: any) => res.data)
      : Promise.resolve(null),
  ]);
  const watchData = watchRes.status === 'fulfilled' ? watchRes.value : null;
  const flixData = flixRes.status === 'fulfilled' ? flixRes.value : null;
  const rawWatchLinks = [
    watchData?.episode_links,
    watchData?.episodeLinks,
    watchData?.servers,
    watchData?.links,
    watchData?.data?.episode_links,
    watchData?.data?.episodeLinks,
    watchData?.data?.servers,
    watchData?.data?.links,
  ].find(Array.isArray) as any[] | undefined;
  const normalizeLink = (raw: any): ReanimeLink | null => {
    if (!raw || typeof raw !== 'object') return null;
    const rawType = String(raw.dataType ?? raw.data_type ?? raw.audio ?? raw.language ?? raw.type ?? '').toLowerCase();
    const serverName = String(raw.serverName ?? raw.server_name ?? raw.name ?? raw.server ?? '');
    const dataLink = raw.dataLink ?? raw.data_link ?? raw.url ?? raw.link ?? raw.src ?? raw.href ?? raw.embedUrl ?? raw.embed_url;
    let dataType = rawType;
    if (!['sub', 's-sub', 'dub', 's-dub'].includes(dataType)) {
      const hint = `${serverName} ${raw.label ?? ''} ${rawType}`.toLowerCase();
      if (/\b(dub|english)\b/.test(hint)) dataType = 'dub';
      else if (/\b(sub|japanese|raw)\b/.test(hint)) dataType = 'sub';
    }
    if (typeof dataLink !== 'string' || !/^https?:\/\//i.test(dataLink)) return null;
    if (!['sub', 's-sub', 'dub', 's-dub'].includes(dataType)) return null;
    return { '$id': raw['$id'] ?? raw.id, serverName: serverName || (dataType.includes('dub') ? 'DUB' : 'SUB'), dataType, dataLink };
  };
  const links: ReanimeLink[] = (rawWatchLinks ?? []).map(normalizeLink).filter(Boolean) as ReanimeLink[];
  if (flixData?.success && Array.isArray(flixData.servers)) {
    const seen = new Set(links.map((link) => link['$id'] || `${link.serverName}:${link.dataType}:${link.dataLink}`));
    for (const link of flixData.servers) {
      const key = link['$id'] || `${link.serverName}:${link.dataType}:${link.dataLink}`;
      if (!seen.has(key)) links.push(link);
    }
  }
  return { series, links };
}

function linkType(dataType?: string): 'sub' | 'dub' | null {
  if (dataType === 'sub' || dataType === 's-sub') return 'sub';
  if (dataType === 'dub' || dataType === 's-dub') return 'dub';
  return null;
}

function sortServers(servers: ReanimeServer[]): ReanimeServer[] {
  const order: Record<string, number> = { 'HD-2': 0, 'HD-1': 1 };
  return servers.slice().sort((a, b) => (order[a.name] ?? 9) - (order[b.name] ?? 9));
}

export async function getReanimeEpisodes(input: number | string | ReanimeEpisodeLookup): Promise<ReanimeEpisode[]> {
  const lookup: ReanimeEpisodeLookup = typeof input === 'object' ? input : { anilistId: input };
  const alId = lookup.anilistId == null ? null : Number(lookup.anilistId);
  const malId = lookup.malId == null ? null : Number(lookup.malId);
  const title = lookup.title && lookup.title !== 'Unknown' ? lookup.title : null;
  const altTitle = lookup.altTitle && lookup.altTitle !== 'Unknown' ? lookup.altTitle : null;
  if ((alId == null || !Number.isFinite(alId)) && !title) throw new Error('ReAnime requires an AniList ID or title');
  const cacheKey = alId != null && Number.isFinite(alId) ? `reanime:episodes:${alId}` : `reanime:episodes:title:${String(title).toLowerCase().trim()}:${malId ?? ''}`;
  const cached = cacheGet<ReanimeEpisode[]>(cacheKey);
  if (cached) return cached;

  const series = alId != null && Number.isFinite(alId)
    ? await resolveReanimeSeries(alId).catch((err) => {
      if (title) return resolveReanimeSeriesByTitle(title, altTitle, malId);
      throw err;
    })
    : await resolveReanimeSeriesByTitle(title!, altTitle, malId);
  const [episodes, anizip] = await Promise.all([fetchEpisodesList(series.animeId), fetchAnizip(series.anilistId || alId || 0)]);
  const merged = episodes.map((ep) => {
    const num = Number(ep.episode_number ?? ep.episodeNumber ?? ep.episode ?? ep.number);
    const meta = anizip?.episodes?.[String(num)] ?? null;
    return {
      num,
      id: encodePayload({ animeId: series.animeId, anilistId: series.anilistId || alId, malId: series.malId || malId, title: title || series.title, altTitle: altTitle || series.title, ep: num }),
      title: meta?.title?.en || meta?.title?.['x-jat'] || ep.title || `Episode ${num}`,
      titleJapanese: meta?.title?.ja || ep.title_japanese || null,
      titleRomanji: meta?.title?.['x-jat'] || ep.title_romanji || null,
      image: meta?.image || ep.thumbnail || null,
      airDate: meta?.airdate || ep.aired || null,
      duration: meta?.runtime ? meta.runtime * 60 : (ep.duration ? ep.duration * 60 : null),
      filler: ep.is_filler ?? meta?.filler ?? false,
      recap: ep.is_recap ?? false,
      description: meta?.overview || ep.description || null,
    };
  }).filter((ep) => Number.isFinite(ep.num)).sort((a, b) => a.num - b.num);
  cacheSet(cacheKey, merged, 'episodes');
  return merged;
}

export async function getReanimeServers(episodeId: string): Promise<ReanimeServer[]> {
  const payload = decodePayload(episodeId);
  const { links } = await fetchEpisodeLinks(payload, Number(payload.ep));
  const servers = links.map((link): ReanimeServer | null => {
    const type = linkType(link.dataType);
    if (!type || !link.dataLink) return null;
    const name = link.serverName || (type === 'sub' ? 'SUB' : 'DUB');
    if (name === 'HD-1') return null;
    return {
      name,
      type,
      sourceId: encodePayload({ anilistId: payload.anilistId, ep: payload.ep, name, dataType: link.dataType, dataLink: link.dataLink }),
    };
  }).filter(Boolean) as ReanimeServer[];
  return sortServers(unique(servers, (server) => `${server.name}:${server.type}:${server.sourceId}`));
}

export async function getReanimeStream(sourceId: string): Promise<ReanimeStream> {
  const payload = decodePayload(sourceId);
  const embedUrl = payload.dataLink;
  const serverName = payload.name || 'ReAnime';
  if (!embedUrl) throw new Error('Missing ReAnime embed URL');
  let decrypted: Awaited<ReturnType<typeof decryptEmbed>>;
  try {
    const embedRes = await axios.get(embedUrl, {
      headers: { ...HEADERS, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', Referer: `${BASE}/` },
      timeout: 20000,
      responseType: 'text',
      transformResponse: [(data: unknown) => data],
    });
    decrypted = await decryptEmbed(String(embedRes.data));
  } catch (error) {
    // ReAnime/FlixCloud occasionally changes its embed crypto payload or blocks
    // Worker-side extraction. Preserve the server as playable via its native
    // embed instead of throwing and having the watch UI mark it dead.
    console.warn('[ReAnime] HLS extraction failed; falling back to embed:', error instanceof Error ? error.message : String(error));
    return {
      embedUrl,
      m3u8: null,
      subtitles: [],
      audioTracks: [],
      qualities: [],
      serverName,
      dataType: payload.dataType,
      type: 'iframe',
    };
  }
  const m3u8 = decrypted.url || null;
  const rawSubtitles = normalizeSubtitles(decrypted.subtitles, m3u8 || embedUrl);
  const hls = await enrichHls(m3u8, rawSubtitles, decrypted.playlistKey);
  const selectedAudioLang = payload.dataType === 'dub' || payload.dataType === 's-dub'
    ? 'eng'
    : payload.dataType === 'sub' || payload.dataType === 's-sub'
      ? 'jpn'
      : null;
  return {
    embedUrl,
    m3u8,
    referer: `${FLIX}/`,
    playlistKey: decrypted.playlistKey ?? null,
    subtitles: hls.subtitles,
    audioTracks: hls.audioTracks,
    selectedAudioLang,
    qualities: hls.qualities,
    serverName,
    dataType: payload.dataType,
    intro: decrypted.intro_chapter ?? null,
    outro: decrypted.outro_chapter ?? null,
    thumbnailsVtt: decrypted.thumbnails_vtt ?? null,
    videoTitle: decrypted.video_title ?? null,
    type: m3u8 ? 'hls' : 'iframe',
  };
}
