// Beweis + Priority-Bewertung: die 15 meistgesehenen Threads, holt echte Kommentare,
// zeigt Anzahl + Note + Auszahlungssignal und schreibt sie sofort in die DB.
const SUPA = 'https://abeheiewozqbkylmgrqr.supabase.co/rest/v1/casinos';
const KEY = 'sb_publishable_OysS4ElWHUiZNcC5aVdt8g__8LkRzh4';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function decode(s) {
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:div|p|td|tr|li)>/gi, '\n').replace(/<img[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; } })
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return ' '; } })
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ');
}
const PAY_NEG = /not paying|won'?t pay|refus(e|ing) to pay|withdrawal[^.\n]{0,30}(problem|stuck|pending|delayed|issue|denied|frozen)|no payout|never (received|got|paid)|confiscat|locked (my )?(account|funds)|selective scam|scam(med)?|stole my|rip[- ]?off|still waiting[^.\n]{0,25}(withdraw|payout|payment)/i;
const PAY_POS = /instant (withdrawal|payout|cashout)|fast (withdrawal|payout|cashout)|got paid|paid (fast|quickly|instantly|within)|payment (received|arrived)|withdrew (fast|instantly|no problem)|withdrawals? (are|is|were) (fast|instant|smooth|quick)|always paid|pays? (out )?(fast|instantly|on time)/i;
const KYC_NEG = /(kyc|verification|verify|selfie|documents?)[^.\n]{0,45}(again|repeat|3rd|third|another time|stuck|hell|nightmare|takes? (weeks|forever)|rejected|denied)|asked (me )?(for )?(kyc|documents|verification)|request(ed)? (kyc|verification|documents)|endless (kyc|verification)|kyc (trap|scam)/i;
const KYC_POS = /(kyc|verification)[^.\n]{0,35}(easy|fast|quick|smooth|simple|only once|in minutes|no problem)|passed (kyc|verification) (fast|quickly|easily)|no kyc (asked|needed|required|so far)/i;
const GEN_NEG = /avoid (this|them)|stay away|be ?ware|warning|fraud|dishonest|worst (casino|site)|do ?n.t (deposit|trust|play)/i;
const GEN_POS = /great (casino|site|support)|awesome|best (casino|site)|love (this|it)|recommend(ed)?|trustworthy|reliable|good experience|excellent/i;
const SCHWELLE = /(?:withdraw\w*|payout|cash ?out)[^.\n]{0,60}?([\d][\d,.]*)\s*(btc|eth|usdt|usd|\$|€|k\b)[^.\n]{0,60}?(stuck|pending|problem|kyc|delay|hold|review|frozen|denied)|([\d][\d,.]*)\s*(btc|eth|usdt|usd|\$|€|k\b)[^.\n]{0,45}?(withdraw\w*|payout)[^.\n]{0,45}?(stuck|pending|problem|kyc|delay|hold|review|frozen|denied)/i;

function scorePosts(posts, istKyc) {
  let payP = 0, payN = 0, kycP = 0, kycN = 0, genP = 0, genN = 0; const schwellen = [];
  for (const p of posts) {
    if (PAY_NEG.test(p)) payN++; if (PAY_POS.test(p)) payP++;
    if (KYC_NEG.test(p)) kycN++; if (KYC_POS.test(p)) kycP++;
    if (GEN_NEG.test(p)) genN++; if (GEN_POS.test(p)) genP++;
    const m = p.match(SCHWELLE);
    if (m) { const zahl = parseFloat((m[1] || m[4] || '').replace(/,/g, '')); const einheit = (m[2] || m[5] || '').toLowerCase(); if (zahl > 0) schwellen.push({ zahl: einheit === 'k' ? zahl * 1000 : zahl, einheit: einheit === 'k' ? '$' : einheit }); }
  }
  const note = (pos, neg) => (pos + neg === 0 ? null : Math.round(((pos + 1) / (pos + neg + 2)) * 100) / 10);
  const payNote = note(payP, payN), kycNote = istKyc ? note(kycP, kycN) : null, genNote = note(genP, genN);
  const teile = []; if (payNote != null) teile.push([payNote, 0.5]); if (kycNote != null) teile.push([kycNote, 0.2]); if (genNote != null) teile.push([genNote, 0.3]);
  const gw = teile.reduce((s, [, w]) => s + w, 0);
  const gesamt = teile.length ? Math.round((teile.reduce((s, [n, w]) => s + n * w, 0) / gw) * 10) / 10 : null;
  let problemAb;
  if (schwellen.length) { schwellen.sort((a, b) => a.zahl - b.zahl); const med = schwellen[Math.floor(schwellen.length / 2)]; const e = (med.einheit === '$' || med.einheit === 'usd') ? '$' : med.einheit === '€' ? '€' : ' ' + med.einheit.toUpperCase(); problemAb = `Probleme ab ca. ${e === '$' || e === '€' ? e : ''}${med.zahl.toLocaleString('de-AT')}${e.startsWith(' ') ? e : ''} (aus Kommentaren)`; }
  else if (payN > 0) problemAb = 'Probleme erwähnt, ohne Betragsangabe';
  else problemAb = 'Keine Auszahlungsprobleme in Kommentaren erwähnt';
  return { gesamt, kycNote, payNote, problemAb, signale: { payP, payN, kycP, kycN, genP, genN } };
}
async function fetchSeite(topicId, offset, v = 1) {
  try {
    const res = await fetch(`https://bitcointalk.org/index.php?topic=${topicId}.${offset}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
    if (res.status === 403 || res.status === 429) { await sleep(90000); if (v <= 3) return fetchSeite(topicId, offset, v + 1); return null; }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return Buffer.from(await res.arrayBuffer()).toString('latin1');
  } catch { if (v <= 3) { await sleep(1500 * v); return fetchSeite(topicId, offset, v + 1); } return null; }
}
function postsAusHtml(html, opUeberspringen) {
  const teile = html.split('<div class="post">').slice(1);
  const posts = teile.map((t) => { let e = t.indexOf('<div class="signature"'); if (e === -1) e = Math.min(t.length, 12000); return decode(t.slice(0, e)).slice(0, 4000); });
  return opUeberspringen ? posts.slice(1) : posts;
}

(async () => {
  const res = await fetch(`${SUPA}?select=topic_id,title,replies,kyc,views&replies=gte.5&order=views.desc.nullslast&limit=15`, { headers: { apikey: KEY } });
  const rows = await res.json();
  const updates = [];
  for (const row of rows) {
    const posts = [];
    const lastOff = Math.floor(row.replies / 20) * 20;
    const h1 = await fetchSeite(row.topic_id, lastOff);
    if (h1) posts.push(...postsAusHtml(h1, lastOff === 0));
    await sleep(400);
    if (posts.length < 25 && lastOff >= 20) { const h2 = await fetchSeite(row.topic_id, lastOff - 20); if (h2) posts.unshift(...postsAusHtml(h2, lastOff - 20 === 0)); }
    const s = scorePosts(posts, row.kyc === 'KYC');
    console.log(`${(row.views + '').padStart(8)} Aufrufe | "${row.title.slice(0, 38).padEnd(38)}" | ${posts.length} Komm. | Note ${s.gesamt ?? '–'} | Ausz ${s.payNote ?? '–'} | Signale +${s.signale.payP + s.signale.genP + s.signale.kycP}/-${s.signale.payN + s.signale.genN + s.signale.kycN} | ${s.problemAb}`);
    updates.push({ topic_id: row.topic_id, title: row.title, thread_url: `https://bitcointalk.org/index.php?topic=${row.topic_id}.0`, bewertung_gesamt: s.gesamt, bewertung_kyc: s.kycNote, bewertung_auszahlung: s.payNote, auszahlung_problem_ab: s.problemAb, bewertung_kommentare: posts.length, bewertung_am: new Date().toISOString() });
    await sleep(300);
  }
  require('fs').writeFileSync(__dirname + '/state/top15.json', JSON.stringify(updates));
  // Einzeln per PATCH schreiben (nur Bewertungsfelder, kein Upsert-Konflikt mit NOT-NULL-Spalten)
  let ok = 0;
  for (const u of updates) {
    const r = await fetch(`${SUPA}?topic_id=eq.${u.topic_id}`, {
      method: 'PATCH', headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ bewertung_gesamt: u.bewertung_gesamt, bewertung_kyc: u.bewertung_kyc, bewertung_auszahlung: u.bewertung_auszahlung, auszahlung_problem_ab: u.auszahlung_problem_ab, bewertung_kommentare: u.bewertung_kommentare, bewertung_am: u.bewertung_am }),
    });
    if (r.ok) ok++; else console.log('PATCH-Fehler', r.status, (await r.text()).slice(0, 200));
  }
  console.log('\nIn DB geschrieben:', ok + '/' + updates.length + ' Top-Threads bewertet');
})();
