# Gormiti Poster Generator

Strumento web per comporre poster tipografici A3 a due colori dedicati ai Gormiti. Ogni blocco
(Popolo, Stemma, Gormita, Testo, Numero) cade dentro un campo gravitazionale disegnato sul foglio
con punti e segmenti: il look resta lo stesso, la composizione cambia ogni volta.

## Avvio

Serve Node 20.19 o più recente (sviluppato con Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
```

## Test e verifica

```bash
npm test           # test unitari e di comportamento (Vitest, in Node)
npm run verify     # i 10 criteri di accettazione nel browser (Playwright)
```

`npm run verify` avvia il server di sviluppo, usa l'interfaccia con mouse e tastiera in Chromium
headless, esporta i PDF e scrive screenshot ed export in `verification-output/` (ignorata da git).
La prima volta può servire `npx playwright install chromium`.

## Build e deploy su Vercel

```bash
npm run build      # genera dist/
npm run preview    # prova la build in locale
```

Su Vercel basta importare il repository: Vite viene riconosciuto da solo (build `npm run build`,
output `dist`). Non servono variabili d'ambiente né backend.

## Come funziona

- **Foglio**: un unico SVG con unità in millimetri, origine nell'angolo in alto a sinistra del
  formato rifilato (297 × 420 mm). Il bleed (di partenza 3 mm) fa parte del foglio: i blocchi ci
  cadono dentro; oltre il bleed si taglia, a schermo come nell'export.
- **Campo**: per ogni blocco `a = Σ forza·k / (d² + 20²)` verso il punto più vicino di ogni
  attrattore (per i segmenti la proiezione limitata agli estremi). È un'accelerazione: blocchi
  grandi e piccoli cadono allo stesso modo. `k` è tarato (`scripts/calibrate-field.mjs`) perché un
  blocco a 200 mm da un punto di forza 50 lo raggiunga in circa 1 secondo.
- **Orientamento**: il "basso" del blocco (asse +y) si gira verso il campo netto. Un segmento sul
  fondo tiene i testi dritti, un punto al centro li dispone a raggiera.
- **Fisica**: Matter.js a passo fisso (1000/60 ms con accumulatore, 4 sotto-passi), nessun numero
  casuale. I blocchi fermi diventano ostacoli immobili; spostare un attrattore li risveglia.
- **Genera / Annulla**: prima di ogni Genera il mondo fisico viene ricostruito da zero a partire
  dalle posizioni ferme; Annulla torna a quelle stesse posizioni, quindi Annulla + Genera con gli
  stessi valori dà lo stesso identico risultato.
- **Colori**: esistono solo `--carta` e `--inchiostro`. Tutto il sito e i poster li usano; gli
  export scrivono gli esadecimali esatti.

## Archivio e adattatore di salvataggio

L'archivio salva la "ricetta" del poster, non il PDF: id, numero, data, colori, bleed,
impostazioni, attrattori, elementi (tipo, parametri, x, y, angolo finale) e una miniatura SVG
senza guide. **Salva poster** aggiunge sempre un nuovo poster con numero = massimo + 1 (i doppioni
sono ammessi); il badge Numero mostra lo stesso numero.

Oggi i poster stanno in IndexedDB, nel browser (`src/storage/local.js`). Tutto il resto del codice
usa solo `src/storage/index.js`; per avere l'archivio condiviso su ogni dispositivo basterà
scrivere `src/storage/api.js` con la stessa interfaccia ed esportarlo da lì:

```js
// Tutte asincrone.
list()        // → Promise<PosterSummary[]>  ordinati per numero decrescente
get(id)       // → Promise<Recipe | null>
save(recipe)  // → Promise<Recipe>           inserisce o sostituisce per id
remove(id)    // → Promise<void>
```

```js
// Recipe (versione 1)
{
  version: 1, id: 'p…', number: 12, date: '2026-10-15T14:03:00.000Z',
  colors: { carta: '#ffffff', inchiostro: '#000000' },
  bleed: 3,
  settings: { restitution: 0.05, friction: 0.8, solidAttractors: true },
  attractors: [{ id, type: 'point', x, y, strength } | { id, type: 'segment', x1, y1, x2, y2, strength }],
  elements: [{ id, type: 'popolo' | 'stemma' | 'gormita' | 'testo' | 'numero', params: {…}, x, y, angle }],
  thumbnail: '<svg …>…</svg>'   // usa le classi colore del sito, quindi segue la palette corrente
}
// PosterSummary = Recipe senza attractors ed elements.
```

Una proposta di API per Vercel: `GET /api/posters` (lista), `GET /api/posters/:id`,
`PUT /api/posters/:id` (salva), `DELETE /api/posters/:id`, con lo stesso JSON. Le miniature
arrivate da un server andranno sanificate prima di inserirle nella pagina.

## Export

- **PDF vettoriale** (jsPDF + svg2pdf.js) generato dallo stesso SVG dell'export **SVG**.
- Testo sempre in tracciati (opentype.js), nessun font incorporato.
- Colori esatti in RGB, come scelti. **Nessuna conversione CMYK per ora.**
- TrimBox e BleedBox impostati con pdf-lib.
- Segni di taglio opzionali con un'abbondanza di 10 mm: pagina (297 + 2·bleed + 20) ×
  (420 + 2·bleed + 20) mm; senza segni (297 + 2·bleed) × (420 + 2·bleed) mm.
- Nome file: `gormiti-poster-012.pdf`.

## Font

Geist e Geist Mono (statici TTF, licenza SIL Open Font License, vedi `public/fonts/OFL.txt`),
dal repository `vercel/geist-font`.

## Struttura

```
src/main.js          avvio e loop a passo fisso
src/state.js         stato unico dell'app
src/model.js         azioni senza DOM: Genera, Annulla, Svuota, attrattori, ricette
src/physics.js       mondo Matter, campo gravitazionale, orientamento
src/field.js         matematica del campo (pura)
src/elements/        un modulo per tipo: popolo, stemma, gormita, testo, numero
src/text.js          opentype: misura e tracciati
src/sheet-view.js    il foglio SVG, zoom e pan
src/attractors.js    attrattori: guide e strumenti sul foglio
src/pad.js           il pad di partenza
src/archive.js       pannello archivio e numerazione
src/storage/         adattatore di salvataggio (local.js ora, api.js in futuro)
src/export.js        PDF e SVG
src/recipe.js        ricetta → SVG (export e miniature)
src/ui/              header, pannelli, dialoghi, stile
```

## Fase 2

- I segnaposto si sostituiscono con gli SVG di Simone: ogni elemento restituisce
  `{ markup, collisionPolygon, bounds }`, quindi basta cambiare la sorgente (per il lettering del
  Popolo la funzione da sostituire è `popoloLettering` in `src/elements/popolo.js`).
- Archivio condiviso su Vercel: implementare `src/storage/api.js` (vedi sopra).
- Eventuale conversione CMYK per la stampa.
