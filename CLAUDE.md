# Gormiti Poster Generator

Strumento web per creare una serie di poster A3 tipografici dedicati ai Gormiti. Ogni poster nasce lasciando cadere degli elementi (testi, stemma, figura, numero) dentro un campo gravitazionale che l'utente disegna sul foglio. Il look and feel resta sempre lo stesso, la composizione cambia ogni volta.

Autore: Simone, studente di graphic design (IED Roma). Il progetto estende l'assignment PCA02 "Memory Posters" (sistema visivo ripetibile, A3, 2 colori). Leggi tutto questo file prima di scrivere codice.

## Come lavorare

1. Costruisci una prima versione completa e funzionante, poi fermati e riassumi: cosa fa, come si avvia, quali assunzioni hai preso.
2. Lavora a passi piccoli con commit frequenti (`git init` se serve, nessun push). Aggiungi un `README.md` con avvio e deploy.
3. Verifica davvero il risultato: avvia il dev server, usa un browser headless (Playwright) per fare screenshot e controlla a occhio che gli elementi cadano, si urtino e si fermino. Esporta un PDF e controlla le dimensioni in mm.
4. Dove questo documento non dice qualcosa, scegli la soluzione più semplice e scrivila nel riepilogo finale. Non chiedere conferme su dettagli minori.
5. Interfaccia in italiano. Nomi di variabili e codice in inglese.

## Stack

- Vite, JavaScript vanilla con moduli ES. Nessun framework (niente React/Vue).
- Dipendenze npm: `matter-js` (fisica), `opentype.js` (misura e tracciati dei testi), `jspdf` + `svg2pdf.js` (PDF vettoriale). Se trovi un'alternativa più semplice per il PDF vettoriale va bene, purché il testo sia in tracciati e il formato esatto.
- Rendering del foglio: un unico SVG (viewBox in mm). Niente canvas raster.
- Font: Geist (OFL). Servono i file statici TTF/OTF dal repository `vercel/geist-font` (pesi Regular, Medium, Bold), da mettere in `public/fonts/`. opentype.js non legge WOFF2 né i variabili: se hai solo quelli, converti con fonttools. Gli stessi file servono per l'interfaccia (`@font-face`). Per etichette e numeri usa Geist Mono.
- Deploy futuro su Vercel (Vite viene riconosciuto da solo). Non costruire un backend adesso.

Struttura suggerita (adattala se serve):

```
index.html
src/main.js            avvio e collegamento dei moduli
src/state.js           stato unico: colori, bleed, attrattori, elementi
src/physics.js         mondo Matter, campo gravitazionale, loop a passo fisso
src/elements/          un modulo per tipo: popolo, stemma, gormita, testo, numero
src/text.js            opentype: misura, tracciati, bounding box
src/attractors.js      punti e segmenti, interazione
src/pad.js             il mini rettangolo di partenza
src/archive.js         lista poster, apertura, numerazione
src/storage/           adattatore: local.js ora, api.js in futuro (stessa interfaccia)
src/export.js          PDF e SVG
src/ui/                pannelli, stile
public/fonts/          Geist
reference/             poster di riferimento (li aggiunge Simone)
```

## Regola dei due colori (vale per TUTTO il sito)

- Esistono solo due colori: **carta** e **inchiostro**. Di partenza bianco (#ffffff) e nero (#000000).
- Due selettori colore nell'header li cambiano. Salvali come variabili CSS `--carta` e `--inchiostro` e ricordali (localStorage). Poster, interfaccia, bordi, guide, tutto usa solo queste due variabili. Se Simone sceglie grigio e arancione, il sito diventa grigio e arancione.
- Niente terzi colori, niente sfumature, niente ombre, niente opacità per creare grigi. Per distinguere stati usa inversione (carta su inchiostro), tratteggi, spessori.
- Impedisci che carta e inchiostro siano uguali (avviso e ripristino del valore precedente).
- Negli export usa gli esadecimali esatti scelti.

## Il foglio

- Formato A3 verticale: 297 x 420 mm, unità del mondo in mm. Origine (0,0) nell'angolo in alto a sinistra del formato rifilato (trim).
- Campo **Bleed (mm)** nelle impostazioni del poster, di partenza 3. Con 0 si lavora in A3 puro, con 3 il foglio di lavoro è (297+6) x (420+6) mm. **Gli elementi cadono e vivono anche dentro il bleed**, che è parte del foglio.
- Mostra il formato rifilato con una linea tratteggiata e il bleed come fascia attorno. Lo sfondo del foglio è carta, bleed incluso. Tutto ciò che esce oltre il bleed viene tagliato all'export.
- Il foglio è centrato e scalato per stare nella finestra, con zoom e pan di base (rotellina/pinch, trascinamento con barra spazio).

## Gli elementi

Ogni "Genera" aggiunge **un solo blocco** al foglio. Ogni blocco è un corpo rigido unico (un testo di più righe è un solo blocco). Cinque tipi:

### 1. Popolo
Blocco tipografico "Popolo dell'ELEMENTO". Scelta tra 7 popoli con articolo: Aria (dell'), Foresta (della), Luce (della), Mare (del), Tenebre (delle), Terra (della), Vulcano (del).
- Due righe in Geist Regular, interlinea molto stretta: "Popolo" e l'articolo ("dell'", "della"...).
- Sotto, sovrapposta leggermente, la parola dell'elemento in maiuscolo Geist Bold con effetto adesivo: lettere inchiostro, alone carta spesso, contorno inchiostro esterno, ombra inchiostro spostata in basso a destra di pochi mm.
- Dimensione: altezza delle maiuscole di "Popolo" in mm (di partenza 22).
- Questo lettering è un segnaposto: in fase 2 sarà sostituito da SVG di Simone, quindi isolalo in una funzione che restituisce markup SVG e sagoma di collisione.

### 2. Stemma
Cerchio con doppio anello (due contorni concentrici) e un simbolo semplice al centro, diverso per popolo: Aria (tre onde/spirali di vento), Foresta (pino stilizzato), Luce (stella a raggi), Mare (tre onde), Tenebre (spirale), Terra (triangolo su linee), Vulcano (fiamma). Solo primitive SVG. Diametro di partenza 20 mm. Collisione circolare.

### 3. Gormita (segnaposto)
Forma irregolare generata da un seme (il nome scritto dall'utente, così lo stesso nome dà sempre la stessa forma): poligono di 14-22 punti con rumore radiale, levigato con curve, riempimento inchiostro con piccole macchie carta, più 1-3 appendici (braccia/corna) come tratti spessi. Triplo contorno come nei poster di Simone: inchiostro, carta, inchiostro. Larghezza di partenza 180 mm.
- Collisione: involucro convesso (o poligono scomposto) della sagoma esterna.
- In fase 2 verrà sostituita da SVG veri. Fai in modo che ogni elemento restituisca `{ markup, collisionPolygon, bounds }` così basta cambiare la sorgente.

### 4. Testo
Per titolo, secondo nome o qualsiasi scritta. Campo multi-riga (Invio = nuova riga), un solo blocco.
- Peso Geist: Regular, Medium, Bold.
- Altezza maiuscole in mm (di partenza 40).
- Maiuscolo on/off (di partenza on). Tracking -0.03 em, interlinea 0.92, allineamento a sinistra.
- Colore riempimento (carta o inchiostro), colore contorno (nessuno, carta, inchiostro), spessore contorno in mm (di partenza 0.8).
- Due preset rapidi: **Pieno** (riempimento inchiostro, contorno carta) e **Contorno** (riempimento carta, contorno inchiostro). Sono i due stili dei titoli nei poster di riferimento.
- Usa opentype.js: il testo diventa tracciati, il rettangolo di collisione è il bounding box reale dei glifi (non il box del font).

### 5. Numero
Badge: cerchio con bordo a stella (16-20 punte piccole) con dentro il numero a tre cifre (001, 002...). Il numero **si assegna da solo**: massimo numero presente nell'archivio + 1, mostrato nel pannello. Diametro di partenza 22 mm. Collisione circolare.

## La gravità (il cuore dello strumento)

Il foglio contiene **attrattori**: punti e segmenti. Ogni attrattore ha una **forza** (1-100, di partenza 50) regolabile.

### Interazione
- Strumenti "+ Punto" e "+ Segmento": il punto si piazza con un clic, il segmento trascinando da un estremo all'altro.
- Un attrattore si seleziona con un clic. Trascinando lo si sposta (per il segmento: trascinando il corpo si sposta tutto, trascinando un estremo lo si allunga/ruota). Pannello con forza (slider e numero), elimina (tasto Canc).
- **Gli attrattori sono vivi**: mentre li trascini gli elementi già caduti si risvegliano e si riassestano in tempo reale.
- Di partenza c'è un segmento lungo la base del formato rifilato (inset 15 mm), forza 50.
- Le guide (attrattori, maniglie) si disegnano in tratteggio sottile e non compaiono mai in export né nelle miniature.

### Campo
Per ogni corpo, a ogni passo:

```
F = somma su ogni attrattore i di:  s_i * k / (d_i^2 + eps^2) * u_i
```
- `d_i`: distanza dal punto più vicino dell'attrattore (per il segmento: proiezione sul segmento, limitata agli estremi).
- `u_i`: versore verso quel punto.
- `s_i`: forza dell'attrattore. Quindi **la forza cala con la distanza** e vince il campo complessivo più forte, non l'attrattore più vicino.
- `eps` circa 20 mm (evita singolarità), `k` tarato in modo che con forza 50 un elemento a 200 mm cada in circa 1 secondo. Limita forza e velocità massime per evitare che i corpi attraversino gli altri.
- Disattiva la gravità di Matter (`engine.gravity.scale = 0`) e applica la forza con `Body.applyForce` a ogni passo.

### Orientamento
Il "basso" locale dell'elemento (asse +y dell'SVG) deve guardare verso la gravità netta nel punto in cui si trova. Con un segmento sul fondo i testi restano dritti, con un punto al centro si dispongono a raggiera con la base verso il centro.
- Angolo target in SVG (rotazione oraria positiva): `theta = atan2(-fx, fy)` dove `(fx, fy)` è la forza netta. Verifica con un test: forza verso il basso => 0, forza verso destra => -90 gradi.
- Implementazione consigliata: controllo PD sulla velocità angolare verso l'angolo target (con percorso più breve). Alternativa: `Body.setAngle` graduale con velocità massima per passo. Verifica che le pile restino stabili e non vibrino.

### Collisioni
- Gli elementi **si urtano e non si sovrappongono mai**. Attrito alto (circa 0.8), rimbalzo basso (di partenza 0.05), regolabile nelle impostazioni.
- Assunzione: il **segmento è solido** (rettangolo statico sottile, circa 2 mm) così gli elementi si appoggiano sopra come su un pavimento. Il **punto** ha un disco statico piccolo (circa 2 mm) attorno a cui gli elementi si accumulano. Se questa scelta non convince, mettila come opzione nelle impostazioni.
- Abilita il sonno dei corpi (`enableSleeping`) e risvegliali quando cambia il campo.

### Simulazione
- Passo fisso (1000/60 ms) con accumulatore in `requestAnimationFrame`, mai delta variabile. Stesso stato e stessi input danno lo stesso risultato. Niente `Math.random()` nella fisica; per la forma del Gormita usa un generatore pseudocasuale con seme.
- Se non c'è nessun attrattore, "Genera" è disattivato con il messaggio "Metti almeno un punto o un segmento di gravità".

## Generare: flusso

Pannello "Genera":
1. Scegli il tipo (Popolo, Stemma, Gormita, Testo, Numero) e compila i suoi campi.
2. Scegli la **partenza** con il pad (sotto).
3. Premi **Genera**: il blocco compare nel punto di partenza e cade. I blocchi già fermi restano dove sono e fanno da ostacolo.
4. **Annulla ultimo** (anche Cmd/Ctrl+Z) toglie l'ultimo blocco e lascia i campi come sono, così si può cambiare qualcosa e rigenerare. **Svuota foglio** toglie tutto (conferma dentro la pagina, mai `confirm()` del browser).
5. Gli elementi non si trascinano a mano. Si cambia il risultato annullando e rigenerando, o spostando gli attrattori.

### Pad di partenza
Un mini rettangolo con le proporzioni del foglio (bleed incluso), circondato da una fascia esterna di circa 20% per lato che rappresenta "fuori dal foglio". Dentro, un punto trascinabile sceglie da dove parte l'elemento, come il selettore dell'angolo nelle ombre di Photoshop ma in due dimensioni. Mostra anche gli attrattori in piccolo e una freccia dal punto verso la direzione del campo.
- Campi numerici X e Y in mm (origine nell'angolo del formato rifilato, valori negativi ammessi per partire da fuori).
- Campo opzionale **Inclinazione iniziale (gradi)**, di partenza 0, sommata all'angolo di allineamento.
- L'elemento nasce già orientato con la base verso il campo nel punto di partenza.
- Se il punto di partenza è occupato da un altro corpo, sposta il nuovo elemento indietro lungo `-u` (contro il campo) a passi di 2 mm finché è libero. Non far mai nascere due corpi sovrapposti.

## Archivio

- Pulsante **Salva poster** (salva il foglio com'è, con le posizioni finali). Il numero del poster viene assegnato al salvataggio ed è coerente con l'elemento Numero.
- Pannello **Archivio** con la lista di tutti i poster: miniatura con le proporzioni A3, numero, data. Azioni: Riapri, Esporta PDF, Elimina (conferma dentro la pagina).
- Non serve controllare i duplicati.
- Cosa si salva (la "ricetta", non il PDF): id, numero, data, colori, bleed, attrattori (posizione, forza), elementi (tipo, parametri, x, y, angolo finale), miniatura SVG leggera senza guide.
- Riaprire un poster ripristina anche i suoi colori e rimette i corpi fermi nelle posizioni salvate; se poi si muove un attrattore si risvegliano.
- Persistenza dietro un **adattatore** (`list`, `get`, `save`, `remove`, tutte async). Ora implementa `local.js` con IndexedDB (o localStorage se basta). Documenta nel README l'interfaccia che dovrà rispettare `api.js` quando in seguito su Vercel collegheremo un database, così l'archivio sarà disponibile su ogni dispositivo.

## Export

Finestra "Esporta" con:
- **PDF vettoriale** (principale) e **SVG** (bonus, è gratis se il PDF parte dall'SVG).
- Bleed (mostra quello del poster).
- **Segni di taglio**: opzione, di partenza spenta. Se accesa, aggiungi una zona di abbondanza esterna (slug) di 10 mm dove disegnare i segni; la pagina PDF diventa (297 + 2*bleed + 2*slug) x (420 + 2*bleed + 2*slug) mm. Con segni spenti la pagina è (297 + 2*bleed) x (420 + 2*bleed) mm.
- Testo sempre in tracciati. Colori esatti scelti. Niente CMYK per ora (dillo nel README).
- Se riesci, imposta TrimBox e BleedBox nel PDF (pdf-lib). Altrimenti salta.
- Nome file: `gormiti-poster-012.pdf`.
- Non esportare guide, griglie, pad.

## Interfaccia

Desktop prima di tutto (mobile non è una priorità, ma niente scroll orizzontale).
- Header: titolo del sito, selettori **Carta** e **Inchiostro**, pulsanti Archivio ed Esporta.
- Colonna sinistra (circa 340 px) con sezioni: Foglio (formato fisso A3 297 x 420 mm, bleed in mm), Gravità (strumenti punto/segmento, forza), Genera (tipo, campi, pad, Genera, Annulla ultimo, Svuota), Impostazioni (rimbalzo, solidità dei segmenti).
- Al centro il foglio. Archivio come pannello laterale o a scomparsa.
- Stile in linea con i poster: Geist e Geist Mono (etichette in maiuscolo con un po' di tracking, numeri in mono), angoli vivi, linee sottili da 1 px in inchiostro, nessun raggio, nessuna ombra. Stati attivi per inversione. Focus da tastiera ben visibile (contorno spesso).
- Controlli standard ma ridisegnati solo con i due colori (slider, bottoni, input, select).
- Tutte le misure mostrate in mm.

## Look dei poster di riferimento (per orientarti)

14 poster A3, due colori. Titolo di testa in alto a sinistra ("Popolo dell'" in Regular grande, poi la parola dell'elemento come adesivo con contorni doppi). Stemma tondo in alto a destra. Figura enorme che esce dal formato, con doppio contorno inchiostro/carta. Titoli giganti sovrapposti alla figura: righe piene in nero (epiteto) e righe a contorno con riempimento carta (nome), tracking stretto, interlinea quasi a contatto. In basso a sinistra due colonne di testo piccolo in grassetto (**qui non servono**, Simone non vuole i paragrafi), in basso a destra il numero in un badge a stella con un fregio sottile. Se trovi file in `reference/`, guardali.

## Fase 2 (NON fare ora, ma non chiuderti la strada)

- Sostituire i segnaposto con gli SVG di Simone (`public/assets/gormiti/`, `popoli/`, `stemmi/` con un `manifest.json`), ricavando la sagoma di collisione dall'SVG.
- Database su Vercel per l'archivio condiviso tra dispositivi (implementare `storage/api.js`).
- Eventuale conversione CMYK per la stampa.

## Criteri di accettazione

1. `npm install && npm run dev` avvia il sito, senza errori in console.
2. Di partenza si vede un foglio A3 con un segmento sul fondo; scrivo "Sommo Luminescente", scelgo la dimensione, premo Genera e il blocco cade da dove ho messo il punto nel pad e si ferma appoggiato al segmento, dritto.
3. Premendo Annulla e poi Genera con gli stessi valori ottengo lo stesso identico risultato.
4. Con un punto di gravità al centro gli elementi si dispongono attorno al punto con la base verso il centro, urtandosi senza mai sovrapporsi.
5. Con due attrattori di forza diversa gli elementi seguono quello che ha il campo più forte nel punto in cui si trovano (verifica spostando i due attrattori).
6. Trascinando un attrattore gli elementi già fermi si riassestano in tempo reale.
7. Con bleed 0 il foglio è 297 x 420 mm, con bleed 3 mm è 303 x 426 mm e gli elementi cadono anche nella fascia del bleed. Controlla anche il PDF esportato (dimensioni in mm, con e senza segni di taglio).
8. Cambiando Carta e Inchiostro cambia tutto: foglio, elementi, interfaccia, guide. Nessun terzo colore resta a schermo.
9. Salvo un poster, compare nell'archivio con numero progressivo, lo riapro e torna identico; ricarico la pagina e c'è ancora.
10. Il PDF si apre in Illustrator o Acrobat con testo in tracciati e colori esatti.

## Da non fare

- Niente framework UI, niente Tailwind, niente librerie di componenti.
- Niente colori oltre ai due, niente gradienti, ombre, trasparenze.
- Niente paragrafo descrittivo del Gormita nei poster.
- Niente `alert`, `confirm`, `prompt`.
- Niente backend, niente deploy, niente push in questa fase.
- Non modificare né spostare i file in `reference/`.
