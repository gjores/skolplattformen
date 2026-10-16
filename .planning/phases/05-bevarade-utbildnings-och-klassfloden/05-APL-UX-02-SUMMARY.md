---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-UX-02
status: complete_preview_verified
date: 2026-10-16
requires: [APL-UX-01]
provides: [term-first-editor, progressive-details, handbook]
affects: [APL-UX-03]
---

# APL-UX-02: årskurs och termin först

Användaren kan välja årskurs och termin, granska och spara en preliminär period utan namn, datum, veckor eller ämneskopplingar. Det valfria `plannedTermIndex` använder befintlig sparjournal och samma omläsning. Läsåret härleds från timplanens frysta start, inte från vyns läsårsfilter. Inga datum, namn eller nollallokeringar skapas för att fylla ut modellen.

## Genomfört

- Första periodsteget visar valfritt namn, årskurs, termin och härlett läsår. Datum/omfattning och ämnen/tid utvecklas separat. Utbildningsform och fullständig klassificering ligger i egen utfällbar del. Bekräftelsekraven benämns uttryckligen som krav inför rektors bekräftelse, inte som hinder för att spara utkast.
- Periodens fördelade tid i samtliga terminer visas ovanför de utfällbara detaljerna. I normalfallet visas den valda terminens inmatningsfält, med möjlighet att fördela på fler terminer. Befintliga inmatade värden visas alltid. Terminsbyte flyttar inga datum eller minuter; skillnader visas för kontroll. Äldre perioder får ingen tyst terminsnyckel.
- Ett delvis ifyllt terminsval behöver kompletteras eller tömmas före spargranskning. Avbryt återställer även de tillfälliga väljarna. Gamla sparbesked rensas när en ny redigering inleds, så att ett tidigare besked inte ser ut att gälla den nya ändringen.
- Efter bildgranskning förenklades även spargranskningen: rena terminsutkast visar period/termin och nästa steg först. Tidsjämförelsen är utfällbar. När tidigare eller nytt underlag innehåller datum, ämnen, omfattning, fördelad tid eller fullständig klassificering är jämförelsen öppen från början.
- Handboken beskriver det prövade flödet och skillnaden mellan preliminär sparning, rektors bekräftelse, huvudmannens beslut och faktiskt genomförande.

## Kontroller och bevis

Alla browserprov här använder **simulerade HTTP-svar**, med verklig applikationsvy, parsers, journal och navigationsskydd. De är inte bevis på faktisk Worker/SQL/IdP-integration eller installation på 3012.

| Kontroll | Resultat |
| --- | --- |
| Full APL-preview, Chromium dator och WebKit iPhone 13 | **58/58 PASS**, retries 0, inga hoppade/flaky fall, på `dc47adc` före den sista dialogförenklingen |
| Riktad verifiering efter dialogförenklingen: terminsutkast, vårstart, okänd-källa-felväg, datumprecisering, äldre tomt underlag och full ämnes-/tidsgranskning | **12/12 PASS**, samma två enheter, retries 0 |
| Befintliga APL-beslutsregressioner | **26/26 PASS**, båda enheter, retries 0 |
| `npx tsc --noEmit` och `npx oxlint app lib` | **PASS** även efter sista produktändringen |
| `npm run docs:build` | **PASS** för slutlig handbokstext; ofarlig lokal Docusaurus update-check-varning |
| `git diff --check` för ändrade produkt-/handboksfiler | **PASS** |

Fullsviten omfattar återläsning av samma period med enbart terminsavsikt, vårstart utan indexförskjutning, oförändrad omsparning av äldre flerterminsperiod, terminsbyte utan databortfall, flerterminsinmatning, ny bekräftelse efter ändrad avsikt, tangentbordsförflyttning timmar→minuter, minst 44 px sparåtgärd, ingen horisontell sidöverrinning, osparat/pågående navigationsskydd, återfunnen journal, förlorat svar, exakt retry, konflikt och indraget mandat.

Lokala resultat (syntetiska data, ej versionshanterade):

- `/private/tmp/apl-ux-preview-full.json`, SHA-256 `81b22618c85168e9f673feabd4cd166498e5e3746cdac5a79c2416c511721443`; bilder i `/private/tmp/apl-ux-preview-full-results`.
- `/private/tmp/apl-ux-preview-dialog-final.json`, SHA-256 `8bcadce3434decc76ca1b4a48c7ac80fac702e79c72bfd4e59975cc2da3fb05a`; sista bilder i `/private/tmp/apl-plan-ui-results`.
- `/private/tmp/apl-decision-ui.json`, SHA-256 `605fb899102a2f973f110b158800baebde1eb5202591bbfc975a1a0620625386`.

Bildgranskat på dator och telefon: terminsval, datumprecisering, gransknings-/sparåtgärd och slutlig kompakt terminsdialog. Årskurs/termin/läsår är läsbara, fälten ligger under den fasta planeringsraden och den kompakta dialogen visar rubrik, vald termin och sparknapp tillsammans. Utfällbara delar har tydliga riktningsmarkörer. Den fasta planeringsraden tar fortfarande stor plats på telefon; dess övergripande utformning ändras inte i detta paket.

## Fynd och avgränsningar

Första utvecklingsrundan (47/52) bevarades i `/private/tmp/apl-ux-preview-first.json` och motsvarande `-first-results`: exakt label-sökning för nya select behövde explicita tillgängliga namn, okänd-start-fixturen bröt befintligt källkontrakt och ett gammalt sparbesked kunde ge en för tidig testassertion. Detta rättades utan lättnader i valideringen. Andra rundan (54/56) bevarades i `-second.json`; dess två fel bekräftade att okänd start inte är en giltig fullständig timplanskälla. Tredje rundan (55/56) bevarades i `-third.json`; telefonprovet gjorde både reload och omedelbar goto, vilket avbröt pågående läsningar. Det överflödiga andra navigationssteget togs bort. Inga fel filtrerades bort och slutliga körningar använde retries 0.

`parseGymTimplan` kräver en verifierad katalogkälla, och katalog/start måste finnas tillsammans. En fullständig timplan med okänd start släpps därför inte in i APL-editorn. Testet verifierar detta som **felväg utan skrivning**, inte som ett fungerande sparflöde. UI:s defensiva projektion hittar inte på läsår. Giltig vårstart är separat prövad. Ingen ny uppluckring av källkontraktet görs för att uppfylla ett felaktigt fixtureantagande.

SS 12000-bedömningen från APL-UX-CONTEXT gäller: terminsavsikten är intern planering, inte en faktisk CalendarEvent, Placement eller Attendance. Stabil periodidentitet och skol-/utbildningsrelationer bevaras; datum och minutvärden skapas bara genom uttrycklig inmatning. Ingen extern anslutning eller verifierad standardefterlevnad tillkommer.

Root samordnar commits/push, faktisk integration, nytt kandidatbygge och eventuell lokal installation enligt UX-03. Den här planen ändrade inte aktiv databas, IdP, 3012 eller rotens körande `dist-protected`. Ny mänsklig bedömning av begripligheten återstår.
