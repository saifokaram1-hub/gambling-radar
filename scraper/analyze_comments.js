// Kommentar-Analyse: holt die neuesten ~40 Kommentare jedes Threads (ab 5 Antworten)
// und berechnet Community-Bewertungen 0-10 (gesamt, KYC-Qualität, Auszahlungen)
// plus die Betragsgrenze, ab der Auszahlungsprobleme erwähnt werden. Resumierbar.
const fs = require('fs');
const path = require('path');

const SUPA = 'https://abeheiewozqbkylmgrqr.supabase.co/rest/v1/casinos';
const KEY = 'sb_publishable_OysS4ElWHUiZNcC5aVdt8g__8LkRzh4';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const STATE_DIR = path.join(__dirname, 'state');
const DELAY_MS = 380;
const FLUSH_EVERY = 300;

if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decode(s) {
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|td|tr|li)>/gi, '\n')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; } })
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return ' '; } })
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

/* ---------- Signal-Wörterbücher ---------- */
const PAY_NEG = /not paying|won'?t pay|refus(e|ing) to pay|withdrawal[^.\n]{0,30}(problem|stuck|pending|delayed|issue|denied|frozen)|no payout|never (received|got|paid)|confiscat|locked (my )?(account|funds)|selective scam|scam(med)?|stole my|rip[- ]?off|still waiting[^.\n]{0,25}(withdraw|payout|payment)/i;
const PAY_POS = /instant (withdrawal|payout|cashout)|fast (withdrawal|payout|cashout)|got paid|paid (fast|quickly|instantly|within)|payment (received|arrived)|withdrew (fast|instantly|no problem)|withdrawals? (are|is|were) (fast|instant|smooth|quick)|always paid|pays? (out )?(fast|instantly|on time)/i;
const KYC_NEG = /(kyc|verification|verify|selfie|documents?)[^.\n]{0,45}(again|repeat|3rd|third|another time|stuck|hell|nightmare|takes? (weeks|forever)|rejected|denied)|asked (me )?(for )?(kyc|documents|verification)|request(ed)? (kyc|verification|documents)|endless (kyc|verification)|kyc (trap|scam)/i;
const KYC_POS = /(kyc|verification)[^.\n]{0,35}(easy|fast|quick|smooth|simple|only once|in minutes|no problem)|passed (kyc|verification) (fast|quickly|easily)|no kyc (asked|needed|required|so far)/i;
const GEN_NEG = /avoid (this|them)|stay away|be ?ware|warning|fraud|dishonest|worst (casino|site)|do ?n.t (deposit|trust|play)/i;
const GEN_POS = /great (casino|site|support)|awesome|best (casino|site)|love (this|it)|recommend(ed)?|trustworthy|reliable|good experience|excellent/i;
const SCHWELLE = /(?:withdraw\w*|payout|cash ?out)[^.\n]{0,60}?([\d][\d,.]*)\s*(btc|eth|usdt|usd|\$|€|k\b)[^.\n]{0,60}?(stuck|pending|problem|kyc|delay|hold|review|frozen|denied)|([\d][\d,.]*)\s*(btc|eth|usdt|usd|\$|€|k\b)[^.\n]{0,45}?(withdraw\w*|payout)[^.\n]{0,45}?(stuck|pending|problem|kyc|delay|hold|review|frozen|denied)/i;

function scorePosts(posts, istKyc) {
  let payP = 0, payN = 0, kycP = 0, kycN = 0, genP = 0, genN = 0;
  const schwellen = [];
  for (const p of posts) {
    if (PAY_NEG.test(p)) payN++;
    if (PAY_POS.test(p)) payP++;
    if (KYC_NEG.test(p)) kycN++;
    if (KYC_POS.test(p)) kycP++;
    if (GEN_NEG.test(p)) genN++;
    if (GEN_POS.test(p)) genP++;
    const m = p.match(SCHWELLE);
    if (m) {
      const zahl = parseFloat((m[1] || m[4] || '').replace(/,/g, ''));
      const einheit = (m[2] || m[5] || '').toLowerCase();
      if (zahl > 0) schwellen.push({ zahl: einheit === 'k' ? zahl * 1000 : zahl, einheit: einheit === 'k' ? '$' : einheit });
    }
  }
  const note = (pos, neg) => (pos + neg === 0 ? null : Math.round(((pos + 1) / (pos + neg + 2)) * 100) / 10);
  const payNote = note(payP, payN);
  const kycNote = istKyc ? note(kycP, kycN) : null; // Non-KYC: zählt nicht
  const genNote = note(genP, genN);

  // Gesamt: gewichteter Schnitt der vorhandenen Teile (Auszahlung 50%, KYC 20%, Allgemein 30%)
  const teile = [];
  if (payNote != null) teile.push([payNote, 0.5]);
  if (kycNote != null) teile.push([kycNote, 0.2]);
  if (genNote != null) teile.push([genNote, 0.3]);
  const gewicht = teile.reduce((s, [, w]) => s + w, 0);
  const gesamt = teile.length ? Math.round((teile.reduce((s, [n, w]) => s + n * w, 0) / gewicht) * 10) / 10 : null;

  // Betragsgrenze
  let problemAb;
  if (schwellen.length) {
    schwellen.sort((a, b) => a.zahl - b.zahl);
    const med = schwellen[Math.floor(schwellen.length / 2)];
    const einheit = med.einheit === '$' || med.einheit === 'usd' ? '$' : med.einheit === '€' ? '€' : ' ' + med.einheit.toUpperCase();
    problemAb = `Probleme ab ca. ${einheit === '$' || einheit === '€' ? einheit : ''}${med.zahl.toLocaleString('de-AT')}${einheit.startsWith(' ') ? einheit : ''} (aus Kommentaren)`;
  } else if (payN > 0) {
    problemAb = 'Probleme erwähnt, ohne Betragsangabe';
  } else {
    problemAb = 'Keine Auszahlungsprobleme in Kommentaren erwähnt';
  }
  return { gesamt, kycNote, payNote, problemAb };
}

/* ---------- Thread-Kommentare holen ---------- */
async function fetchSeite(topicId, offset, versuch = 1) {
  try {
    const res = await fetch(`https://bitcointalk.org/index.php?topic=${topicId}.${offset}`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
    });
    if (res.status === 403 || res.status === 429) { await sleep(120000); if (versuch <= 3) return fetchSeite(topicId, offset, versuch + 1); return null; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return Buffer.from(await res.arrayBuffer()).toString('latin1');
  } catch {
    if (versuch <= 3) { await sleep(1800 * versuch); return fetchSeite(topicId, offset, versuch + 1); }
    return null;
  }
}

function postsAusHtml(html, opUeberspringen) {
  const teile = html.split('<div class="post">').slice(1);
  const posts = teile.map((t) => {
    let ende = t.indexOf('<div class="signature"');
    if (ende === -1) ende = Math.min(t.length, 12000);
    return decode(t.slice(0, ende)).slice(0, 4000);
  });
  return opUeberspringen ? posts.slice(1) : posts;
}

/* ---------- Hauptschleife ---------- */
async function holeOffene() {
  const rows = [];
  for (let off = 0; ; off += 1000) {
    const res = await fetch(`${SUPA}?select=topic_id,title,thread_url,replies,kyc&replies=gte.5&bewertung_am=is.null&order=topic_id.asc&limit=1000&offset=${off}`, { headers: { apikey: KEY } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const b = await res.json();
    rows.push(...b);
    if (b.length < 1000) break;
  }
  return rows;
}

async function upsert(batch) {
  if (!batch.length) return true;
  const res = await fetch(`${SUPA}?on_conflict=topic_id`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(batch),
  });
  if (!res.ok) { console.error('Upsert HTTP', res.status, (await res.text()).slice(0, 300)); return false; }
  return true;
}

(async () => {
  const offene = await holeOffene();
  console.log('Zu bewerten:', offene.length);
  let buffer = [], done = 0, fehler = 0;

  const flush = async () => {
    if (buffer.length) { if (await upsert(buffer)) buffer = []; else { fs.writeFileSync(path.join(STATE_DIR, 'bewertung_failed.json'), JSON.stringify(buffer)); buffer = []; } }
    fs.writeFileSync(path.join(STATE_DIR, 'bewertung_progress.txt'), `${done}/${offene.length}, Fehler: ${fehler}, ${new Date().toISOString()}\n`);
  };

  for (const row of offene) {
    const posts = [];
    const letzterOffset = Math.floor(row.replies / 20) * 20;
    const html1 = await fetchSeite(row.topic_id, letzterOffset);
    if (html1) posts.push(...postsAusHtml(html1, letzterOffset === 0));
    if (posts.length < 30 && letzterOffset >= 20) {
      await sleep(DELAY_MS);
      const html2 = await fetchSeite(row.topic_id, letzterOffset - 20);
      if (html2) posts.unshift(...postsAusHtml(html2, letzterOffset - 20 === 0));
    }
    if (posts.length) {
      const s = scorePosts(posts, row.kyc === 'KYC');
      buffer.push({
        topic_id: row.topic_id, title: row.title, thread_url: row.thread_url,
        bewertung_gesamt: s.gesamt, bewertung_kyc: s.kycNote, bewertung_auszahlung: s.payNote,
        auszahlung_problem_ab: s.problemAb, bewertung_kommentare: posts.length,
        bewertung_am: new Date().toISOString(),
      });
      done++;
    } else {
      fehler++;
      fs.appendFileSync(path.join(STATE_DIR, 'bewertung_failed_topics.log'), row.topic_id + '\n');
    }
    if (buffer.length >= FLUSH_EVERY) await flush();
    await sleep(DELAY_MS);
  }
  await flush();
  fs.writeFileSync(path.join(STATE_DIR, 'bewertung_done.txt'), `FERTIG ${new Date().toISOString()}: ${done} bewertet, ${fehler} Fehler\n`);
  console.log('FERTIG:', done, 'Fehler:', fehler);
})().catch((e) => { console.error(e); process.exit(1); });
