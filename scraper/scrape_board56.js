// Scraper für bitcointalk.org Board 56 (Gambling) — alle Seiten, Titel + Links + Metadaten
const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DELAY_MS = 300;
const MAX_OFFSET = 11880; // von Seite 1 ermittelt (298 Seiten à 40 Threads)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPage(offset, attempt = 1) {
  const url = `https://bitcointalk.org/index.php?board=56.${offset}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString('latin1');
  } catch (e) {
    if (attempt <= 4) {
      await sleep(1500 * attempt);
      return fetchPage(offset, attempt + 1);
    }
    throw e;
  }
}

function parseTopics(html) {
  const topics = [];
  // Zeilen anhand des Titel-Spans aufsplitten; Folge-TDs enthalten Starter/Replies/Views/LastPost
  const re = /<span id="msg_\d+"><a href="https:\/\/bitcointalk\.org\/index\.php\?topic=(\d+)\.0">([\s\S]*?)<\/a><\/span>([\s\S]*?)(?=<span id="msg_\d+">|<\/table>)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const topicId = +m[1];
    const title = decodeEntities(m[2]);
    const rest = m[3];
    const starterM = rest.match(/action=profile;u=\d+" title="View the profile of ([^"]+)"/);
    const numsM = rest.match(/<td class="windowbg" valign="middle" width="4%" align="center">\s*(\d+)\s*<\/td>\s*<td class="windowbg" valign="middle" width="4%" align="center">\s*(\d+)\s*<\/td>/);
    const lastM = rest.match(/<span class="smalltext">\s*(?:<b>)?([\s\S]*?)<br \/>/);
    topics.push({
      topic_id: topicId,
      title,
      thread_url: `https://bitcointalk.org/index.php?topic=${topicId}.0`,
      starter: starterM ? decodeEntities(starterM[1]) : null,
      replies: numsM ? +numsM[1] : null,
      views: numsM ? +numsM[2] : null,
      last_post: lastM ? decodeEntities(lastM[1].replace(/<[^>]+>/g, ' ')) : null,
    });
  }
  return topics;
}

// ---- Auto-Kategorisierung aus dem Titel ----
const TLDS = 'com|io|net|org|game|games|casino|bet|co|gg|vip|fun|live|app|me|ag|eu|us|uk|de|at|ch|xyz|site|club|cash|win|money|plus|one|top|life|world|group|team|pro|link|online|website|space|store|tech|tv|cc|is|to|ws|so|sh|im|fm|la|lol|wtf|pw|bz|am|ac|casa|poker|exchange|finance|network|zone|run|red|blue|gold|black|city|day|now|today|best|cool|fyi|ninja|dog|win';
function categorize(t, allViews) {
  const title = t.title || '';
  const lower = title.toLowerCase();

  const domM = title.match(new RegExp('([a-z0-9][a-z0-9-]{1,30}\\.(?:' + TLDS + '))\\b', 'i'));
  const website = domM ? domM[1].toLowerCase() : null;

  const nonKyc = /no[\s\-–—.]?kyc|non[\s\-–—.]?kyc|kyc[\s\-–—.]?free|without kyc|ohne kyc|no verification/i.test(lower);
  const kycYes = /\bkyc\b/i.test(lower) && !nonKyc;

  const sport = /sports?book|sports?[\s\-]?bet|betting|bookmaker|wetten|esports?|e-sports/i.test(lower);
  const casino = /casino|slots?\b|roulette|blackjack|baccarat/i.test(lower);

  const angebot = [];
  if (casino) angebot.push('Casino');
  if (/slots?\b/i.test(lower)) angebot.push('Slots');
  if (sport) angebot.push('Sportwetten');
  if (/poker/i.test(lower)) angebot.push('Poker');
  if (/dice|würfel/i.test(lower)) angebot.push('Dice');
  if (/crash\b/i.test(lower)) angebot.push('Crash');
  if (/lotter|lotto|raffle/i.test(lower)) angebot.push('Lotterie');
  if (/live[\s\-]?(casino|dealer)/i.test(lower)) angebot.push('Live-Casino');
  if (/plinko|mines|keno|bingo/i.test(lower)) angebot.push('Minigames');

  const crypto = [];
  if (/\bbtc\b|bitcoin/i.test(lower)) crypto.push('BTC');
  if (/\beth\b|ethereum/i.test(lower)) crypto.push('ETH');
  if (/\bltc\b|litecoin/i.test(lower)) crypto.push('LTC');
  if (/\bdoge\b/i.test(lower)) crypto.push('DOGE');
  if (/usdt|tether/i.test(lower)) crypto.push('USDT');
  if (/\btrx\b|tron/i.test(lower)) crypto.push('TRX');
  if (/\bsol\b|solana/i.test(lower)) crypto.push('SOL');
  if (/\bxrp\b/i.test(lower)) crypto.push('XRP');
  if (/crypto|krypto/i.test(lower) && crypto.length === 0) crypto.push('Diverse Kryptowährungen');

  const affiliate = /affiliat|referral|ref[\s\-]?program|partner[\s\-]?program|revshare|rev[\s\-]?share|\bcpa\b/i.test(lower);

  // Bekanntheits-Score: Perzentil der Views (0–100)
  let score = null;
  if (t.views != null && allViews.length) {
    const below = allViews.filter((v) => v < t.views).length;
    score = Math.round((below / allViews.length) * 100);
  }

  const isSticky = [39621, 408265].includes(t.topic_id);

  return {
    ...t,
    website,
    kyc: isSticky ? null : nonKyc ? 'Non-KYC' : kycYes ? 'KYC' : 'Unbekannt',
    kyc_details: null,
    sportwetten: isSticky ? null : sport ? 'Ja' : 'Unbekannt',
    allgemeines_angebot: angebot.join(', ') || null,
    zahlungsmoeglichkeiten: crypto.join(', ') || null,
    affiliate: isSticky ? null : affiliate ? 'Ja' : 'Unbekannt',
    bekanntheits_score: score,
    is_sticky: isSticky,
  };
}

(async () => {
  const seen = new Map();
  let pages = 0;
  for (let off = 0; off <= MAX_OFFSET; off += 40) {
    const html = await fetchPage(off);
    const topics = parseTopics(html);
    for (const t of topics) if (!seen.has(t.topic_id)) seen.set(t.topic_id, t);
    pages++;
    if (pages % 10 === 0 || off === MAX_OFFSET) {
      fs.writeFileSync(path.join(OUT_DIR, 'progress.txt'), `Seite ${pages}/298, Threads: ${seen.size}\n`);
    }
    await sleep(DELAY_MS);
  }

  const raw = [...seen.values()];
  const allViews = raw.map((t) => t.views).filter((v) => v != null);
  const data = raw.map((t) => categorize(t, allViews));

  fs.writeFileSync(path.join(OUT_DIR, 'board56_data.json'), JSON.stringify(data, null, 1));

  // CSV für Import
  const cols = ['topic_id','title','thread_url','website','starter','replies','views','last_post','bekanntheits_score','kyc','sportwetten','allgemeines_angebot','zahlungsmoeglichkeiten','affiliate','is_sticky'];
  const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v));
  const csv = [cols.join(',')].concat(data.map((d) => cols.map((c) => esc(d[c])).join(','))).join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'board56_data.csv'), '﻿' + csv, 'utf8');

  fs.writeFileSync(path.join(OUT_DIR, 'progress.txt'), `FERTIG: ${data.length} Threads, ${pages} Seiten\n`);
  console.log('FERTIG', data.length);
})().catch((e) => {
  fs.writeFileSync(path.join(OUT_DIR, 'progress.txt'), 'FEHLER: ' + e.message + '\n');
  console.error(e);
  process.exit(1);
});
