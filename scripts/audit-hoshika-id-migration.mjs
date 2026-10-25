#!/usr/bin/env node
// Read-only audit of AniVault numeric IDs against Hoshika. Never writes to D1.
import fs from 'node:fs/promises';

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const db = process.env.ANIVAULT_D1_DATABASE_ID || 'd81c4c7f-74c1-413f-ac90-30ac305415b6';
if (!account || !token) throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN');

async function d1(sql) {
  const response = await fetch('https://api.cloudflare.com/client/v4/accounts/' + account + '/d1/database/' + db + '/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql })
  });
  const json = await response.json();
  if (!response.ok || !json.success) throw new Error(JSON.stringify(json.errors || json));
  return json.result?.[0]?.results || [];
}
async function hoshika(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (response.status === 429) throw new Error('Hoshika rate limit reached; stop and rerun later.');
  if (!response.ok) return null;
  const json = await response.json();
  return json?.ok === false ? null : json;
}
function object(x) { return x && typeof x === 'object' ? x : {}; }
function shortId(x) { return String(x.shortId ?? x.short_id ?? '').trim(); }
function malId(x) {
  const n = Number(x.mal_id ?? x.malId ?? x.malID ?? x.myanimelist_id);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
function title(x) {
  return String(x.titleLocalized ?? x.titleEnglish ?? x.title_english ?? x.titleRomaji ?? x.title_romaji ?? x.title ?? x.slug ?? '').trim();
}
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function compatible(a, b) {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}
function resultList(p) {
  for (const k of ['anime', 'items', 'results']) if (Array.isArray(p?.[k])) return p[k];
  return Array.isArray(p?.data) ? p.data : [];
}
function imageId(url) {
  const m = String(url || '').match(/\/anime-library\/anime-(\d+)(?:[-.]|$)/i);
  return m ? Number(m[1]) : null;
}
const rows = await d1(
  "WITH all_rows AS (" +
  " SELECT CAST(anime_id AS TEXT) id, anime_title title, anime_image image FROM anime_list" +
  " UNION ALL SELECT CAST(anime_id AS TEXT), anime_title, anime_image FROM watch_history" +
  " UNION ALL SELECT CAST(anime_id AS TEXT), anime_title, anime_image FROM favorites" +
  "), grouped AS (" +
  " SELECT id, MAX(COALESCE(NULLIF(TRIM(title),''),'')) title, MAX(COALESCE(NULLIF(TRIM(image),''),'')) image, COUNT(*) row_count FROM all_rows GROUP BY id" +
  ") SELECT g.*, h.hoshika_short_id known_hoshika, h.legacy_mal_id known_mal," +
  " l.hoshika_short_id known_from_mal FROM grouped g" +
  " LEFT JOIN anime_identity_map h ON h.hoshika_short_id=g.id" +
  " LEFT JOIN anime_identity_map l ON CAST(l.legacy_mal_id AS TEXT)=g.id AND l.verified=1"
);
const known = rows.filter(r => r.known_hoshika || r.known_from_mal).map(r => ({
  current_id: r.id, title: r.title, image: r.image, row_count: Number(r.row_count),
  image_filename_id: imageId(r.image) || '', proposed_hoshika_short_id: r.known_hoshika || r.known_from_mal,
  proposed_legacy_mal_id: r.known_mal || (r.known_from_mal ? r.id : ''),
  confidence: 'known', evidence: 'existing-identity-map', matched_title: '', notes: 'Already mapped.'
}));
const todo = rows.filter(r => !r.known_hoshika && !r.known_from_mal);
const output = [...known];
let done = 0;
for (const row of todo) {
  const rec = {
    current_id: row.id, title: row.title, image: row.image, row_count: Number(row.row_count),
    image_filename_id: imageId(row.image) || '', proposed_hoshika_short_id: '',
    proposed_legacy_mal_id: '', confidence: 'review', evidence: 'no-safe-match',
    matched_title: '', notes: ''
  };
  try {
    const detailPayload = await hoshika('https://hoshika.app/api/v1/anime/' + encodeURIComponent(row.id));
    const detail = object(detailPayload?.anime ?? detailPayload?.item ?? detailPayload?.data ?? detailPayload);
    if (detailPayload && title(detail) && compatible(row.title, title(detail))) {
      rec.proposed_hoshika_short_id = shortId(detail) || row.id;
      rec.proposed_legacy_mal_id = malId(detail) || rec.image_filename_id || '';
      rec.matched_title = title(detail);
      rec.confidence = 'high';
      rec.evidence = 'detail-title-match';
      rec.notes = 'Hoshika detail title matches stored title; review before any write.';
    } else if (row.title) {
      const url = new URL('https://hoshika.app/api/v1/search');
      url.searchParams.set('q', row.title);
      const payload = await hoshika(url.toString());
      const exact = resultList(payload).filter(x => malId(object(x)) === Number(row.id) && compatible(row.title, title(object(x))));
      if (exact.length === 1 && shortId(object(exact[0]))) {
        rec.proposed_hoshika_short_id = shortId(object(exact[0]));
        rec.proposed_legacy_mal_id = Number(row.id);
        rec.matched_title = title(object(exact[0]));
        rec.confidence = 'high';
        rec.evidence = 'exact-mal_id-and-title';
        rec.notes = 'Hoshika search returned exact mal_id and compatible title; review before any write.';
      } else {
        rec.evidence = exact.length > 1 ? 'multiple-candidates' : 'not-confirmed';
        rec.notes = 'No unique exact MAL-ID/title match. Do not migrate automatically.';
      }
    }
  } catch (error) {
    rec.evidence = 'request-error';
    rec.notes = String(error?.message || error);
    if (rec.notes.includes('rate limit')) throw error;
  }
  output.push(rec);
  done++;
  if (done % 25 === 0) console.log('Audited ' + done + '/' + todo.length);
  await new Promise(resolve => setTimeout(resolve, 250));
}
await fs.writeFile('hoshika-id-migration-audit.json', JSON.stringify(output, null, 2));
const cols = ['current_id','title','image','row_count','image_filename_id','proposed_hoshika_short_id','proposed_legacy_mal_id','confidence','evidence','matched_title','notes'];
const csv = [cols.join(','), ...output.map(r => cols.map(k => '"' + String(r[k] ?? '').replace(/"/g, '""') + '"').join(','))].join('\n');
await fs.writeFile('hoshika-id-migration-audit.csv', csv);
const summary = {};
for (const row of output) summary[row.confidence + ':' + row.evidence] = (summary[row.confidence + ':' + row.evidence] || 0) + 1;
console.log('Completed read-only audit; no D1 writes performed.');
console.log(JSON.stringify(summary, null, 2));
