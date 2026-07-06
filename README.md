# Crypto Gambling Radar

Kategorisierungs- und Recherche-Tool für alle Threads des [Bitcointalk Gambling-Boards](https://bitcointalk.org/index.php?board=56.0) (Board 56).

## Was es kann

- **11.886 Threads** (Titel + Links) vom kompletten Board gescrapt (298 Seiten)
- **Suchleiste**: durchsucht Titel, Website und eigene Notizen
- **Filter** für jede Kategorie: Verfügbarkeit AT/DE, KYC/Non-KYC, Sportwetten, Kette, Affiliate, CPA, Recherche-Status
- **Sortierung** nach Bekanntheits-Score, Aufrufen, Antworten, Titel
- **Detail-Ansicht** mit allen 21 Kriterien-Feldern, direkt bearbeitbar
- **Live-Speicherung**: Jede Änderung wird sofort in der Datenbank gespeichert und ist für alle Besucher der Seite live sichtbar

## Automatisch vorausgefüllt (aus den Thread-Titeln)

- Website/Domain-Erkennung
- Non-KYC-Erkennung (z.B. "No KYC" im Titel)
- Sportwetten-Erkennung (Sportsbook, Betting …)
- Angebots-Keywords (Casino, Slots, Poker, Dice, Crash …)
- Krypto-Zahlungen (BTC, ETH, USDT … sofern im Titel genannt)
- Affiliate-Erwähnung
- **Bekanntheits-Score (0–100)**: Perzentil der Thread-Aufrufe im Vergleich zu allen anderen Threads

Alle übrigen Kriterien (CPA-Höhe, Revshare, Auszahlungsdauer, Kontaktdaten …) sind Recherche-Felder, die man in der Detail-Ansicht ausfüllt.

## Technik

- Frontend: statisches HTML/CSS/JavaScript (kein Framework, kein Build-Schritt)
- Datenbank: Supabase (Projekt `abeheiewozqbkylmgrqr`, Tabelle `casinos`)
- Hosting: GitHub Pages (kostenlos)

## Daten neu scrapen

Der Scraper liegt unter `scraper/scrape_board56.js`:

```
node scraper/scrape_board56.js     # scrapt alle 298 Seiten neu (ca. 4 Min.)
node scraper/import_to_supabase.js # importiert neue Threads (Duplikate werden übersprungen)
```

Bestehende Einträge und deine Recherche-Daten bleiben beim Re-Import erhalten (`on_conflict=topic_id, ignore-duplicates`).
