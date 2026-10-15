# Gormiti Poster Generator

Strumento web per comporre poster tipografici A3 a due colori dedicati ai Gormiti. Ogni blocco
(Popolo, Stemma, Gormita, Nome, Alias, Numero) cade dentro un campo gravitazionale disegnato sul foglio
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
- **Genera / Annulla**: a ogni Genera si fotografa il mondo così com'è (i blocchi ancora in volo
  tengono posizione, velocità e rotazione: niente salti) e il motore viene ricostruito da quella
  foto. Annulla torna alla stessa foto, quindi Annulla + Genera con gli stessi valori dà lo stesso
  identico risultato. Se nel frattempo sono cambiati attrattori o impostazioni, Annulla toglie solo
  l'ultimo blocco e il resto continua da dov'è.
- **Colori**: esistono solo `--carta` e `--inchiostro`. Tutto il sito e i poster li usano; gli
  export scrivono gli esadecimali esatti.

## Archivio e adattatore di salvataggio

L'archivio salva la "ricetta" del poster, non il PDF: id, numero, data, colori, bleed,
impostazioni, attrattori, elementi (tipo, parametri, x, y, angolo finale) e una miniatura SVG
senza guide. Un poster si può salvare o esportare solo quando sul foglio c'è almeno un blocco di
ogni tipo (Popolo, Stemma, Gormita, Nome, Alias, Numero); altrimenti un messaggio dice cosa manca.
**Salva in archivio** (icona segnalibro) aggiunge sempre un nuovo poster con numero = massimo + 1 (i doppioni
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
  elements: [{ id, type: 'popolo' | 'stemma' | 'gormita' | 'nome' | 'testo' (Alias) | 'numero', params: {…}, x, y, angle }],
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

## Figure dei Gormiti (SVG)

Le figure sono gli SVG in `public/assets/gormiti/`. Basta copiare il file nella cartella e
ricaricare la pagina: compare nel menu **Figura** del tipo Gormita, con il nome preso dal nome del
file (`sommoLuminescente.svg` o `sommo-luminescente.svg` → «Sommo Luminescente»). L'elenco per il
browser (`assets/manifest.json`) si genera da solo, in sviluppo e nella build: non va scritto a mano.
L'ultima voce del menu resta il segnaposto generato dal nome.

Il file contiene **solo il disegno**: i due contorni (2 mm di carta attaccati al disegno, poi 2 mm di
inchiostro) li disegna il sito, uguali su ogni figura qualunque sia la larghezza scelta
(`FIGURE_RING_MM` in `src/svg-figure.js`). Seguono la sagoma esterna, buchi compresi; per gli urti
conta l'involucro convesso della sagoma con i contorni.

Come preparare il file in Illustrator:

- Documento RGB, solo `#000000` e `#ffffff`: il nero diventa inchiostro e il bianco carta. Un
  colore scuro qualsiasi conta come nero e uno chiaro come bianco (il nero K100 di un documento
  CMYK, `#231f20`, è nero).
- Forme piene: tracciati convertiti in forme (Oggetto › Tracciato › Contorno traccia). I tratti
  funzionano, ma i contorni del sito seguono meglio le forme piene.
- Niente sfumature, trasparenze, effetti, immagini, testo vivo, maschere di ritaglio (le parti
  nascoste conterebbero per i contorni), niente rettangolo di sfondo: ogni forma del file fa parte
  della figura. Le cose non supportate vengono ignorate con un avviso in console.
- Figura dritta: il lato basso della tavola è quello che si gira verso la gravità.
- Tavola adattata al disegno; la misura non conta, la decide il campo Larghezza.
- File › Esporta › Esporta come › SVG; vanno bene sia «CSS interno» sia «Attributi di
  presentazione».

Il nome del file è anche l'identificativo salvato nei poster: rinominando un file, i poster già
salvati con quella figura tornano al segnaposto. `npm test` controlla che ogni SVG della cartella
si legga senza problemi.

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
src/elements/        un modulo per tipo: popolo, stemma, gormita, testo (Nome e Alias), numero
src/svg-figure.js    SVG di Simone → figura: lettura, colori, contorni del sito, miniature
src/figures.js       carica le figure elencate in assets/manifest.json
src/text.js          opentype: misura e tracciati
src/sheet-view.js    il foglio SVG, zoom e pan
src/attractors.js    attrattori: guide e strumenti sul foglio
src/pad.js           il pad di partenza
src/archive.js       pannello archivio e numerazione
src/storage/         adattatore di salvataggio (local.js ora, api.js in futuro)
src/export.js        PDF e SVG
src/recipe.js        ricetta → SVG (export e miniature)
src/ui/              header, pannelli, dialoghi, stile
scripts/assets-manifest.mjs  elenco delle figure (servito in sviluppo, scritto nella build)
```

## Fase 2

- Gormiti: fatto (vedi «Figure dei Gormiti»).
- Popoli e stemmi: le cartelle `public/assets/popoli/` e `stemmi/` esistono ma non vengono ancora
  lette. Ogni elemento restituisce `{ markup, collisionPolygon, bounds }`, quindi basta cambiare la
  sorgente (per il lettering del Popolo la funzione da sostituire è `popoloLettering` in
  `src/elements/popolo.js`).
- Archivio condiviso su Vercel: implementare `src/storage/api.js` (vedi sopra).
- Eventuale conversione CMYK per la stampa.
