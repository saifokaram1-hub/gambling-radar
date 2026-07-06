// Importiert die gescrapten Board-56-Daten in die Lovable-Cloud-Datenbank (Supabase REST)
const fs = require('fs');
const path = require('path');

const URL_BASE = 'https://abeheiewozqbkylmgrqr.supabase.co/rest/v1/casinos';
const KEY = 'sb_publishable_OysS4ElWHUiZNcC5aVdt8g__8LkRzh4';
const BATCH = 500;

const COLS = ['topic_id','title','thread_url','website','starter','replies','views','last_post','bekanntheits_score','is_sticky','kyc','sportwetten','allgemeines_angebot','zahlungsmoeglichkeiten','affiliate'];

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'board56_data.json'), 'utf8'));
const rows = data.map((d) => {
  const r = {};
  for (const c of COLS) r[c] = d[c] === undefined ? null : d[c];
  return r;
});

(async () => {
  let ok = 0, fail = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const res = await fetch(URL_BASE + '?on_conflict=topic_id', {
      method: 'POST',
      headers: {
        apikey: KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(chunk),
    });
    if (res.ok) {
      ok += chunk.length;
    } else {
      fail += chunk.length;
      console.error('Batch', i / BATCH, 'HTTP', res.status, (await res.text()).slice(0, 500));
    }
    process.stdout.write(`\rImportiert: ${ok}/${rows.length} (Fehler: ${fail})   `);
  }
  console.log('\nFERTIG. ok=' + ok + ' fail=' + fail);
})();
