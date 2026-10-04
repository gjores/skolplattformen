---
created: 2026-10-02
title: Skolgemensamma programfördjupningspaket över flera programplaner
area: programplaner
files:
  - web/app/protected-programplan-workspace.tsx
  - web/lib/programplan-catalog.ts
  - web/lib/server/programplan-planning.ts
  - docs/handbok/programplaner.md
  - .planning/research/SCHEMAMODUL-PROJEKT.md
---

## Problem

Användaren kräver att en skola kan skapa ett valbart programfördjupningspaket som är tillgängligt över fler programplaner. Dagens skyddade vy sparar en ordnad lista med enskilda nivåer per plan. Den saknar ett gemensamt paketobjekt, återanvändning och elevens paketval. Fler syntetiska provprogram innebär inte att paketfunktionen är levererad.

## Solution

- Skapa namngivna skolgemensamma paket med beskrivning, ordnade ämnes-/nivåreferenser, tillgänglighet och giltighet för relevanta utbildningar/programplaner. Samma paket ska kunna erbjudas i minst två olika programplaner inom samma skola utan att administratören återskapar det manuellt.
- Skilj skolans paketutbud från att koppla en paketversion till en programplan och från elevens faktiska paketval i studieplanen. Klargör fasta respektive valbara paket och vilka kombinationer som får erbjudas innan detaljerade kommandon planeras. Gemensamt utbud får inte innebära att alla elever eller planer automatiskt har valt paketet.
- Kontrollera varje målplans exakta program, inriktning, katalogversion och utbildningsstart. Visa en begriplig kompatibilitetsmatris: tillgängligt, otillåtet eller kräver kompletterande underlag. Paketnivåer måste vara tillåtna i respektive programs programfördjupning och får inte dubblera eller otillåtet överlappa andra nivåer. Saknade nationella regler ska markeras som okontrollerade, aldrig godkända.
- Versionshantera paketet och spara uttrycklig koppling till den version som används i varje programplan. Ändring av paketutbud får inte tyst skriva om befintliga utkast, fastställda planer, elevval eller äldre kullar. Utred kontrollerad uppdatering, kopiering till nästa kull och avslut utan historikförlust.
- Bevara kund-/skolgränser och verkliga servermandat. Planera atomiska paket-/plankommandon med revision, MFA där ändringen kräver det, obligatorisk audit, konflikt och säker hantering av osäkert writesvar.
- Beakta schemadelprojektets gemensamma ID:n, paket-/grupprelationer, elevval, kapacitet och kalender; ett paket kan behöva gemensamma undervisningsgrupper över program. Utforska sambandet utan att blanda ihop paketregistrering med automatisk grupp- eller schemaplacering.
- Gör skapande, erbjudande och återanvändning pedagogiskt på dator/telefon och uppdatera användarhandboken i genomförandeplanen.

## Verification

- Skapa ett paket och erbjud samma paketversion i minst två programplaner på samma skola. Ett tillåtet val går att spara och läsa om på båda; otillåtet program/inriktning/start stoppas med begripligt besked.
- Paketändring skapar ny version. Tidigare planversioner och elevval behåller exakt innehåll och referens. Avveckling och kullkopiering bevarar historik och ger explicita val.
- Pröva dubbla nivåer, nivåföljd/överlapp, saknad regelkontroll, samtidigt ändrat paket eller plan, obehörigt skol-/kundbyte, auditfel och tappat svar. Inga oavsiktliga massuppdateringar eller påhittade elevval.
- Rektor kan förklara skillnaden mellan skolans paket, vad som erbjuds i en programplan och vad eleven faktiskt har valt. Mänskligt användarprov ingår.

## Utökning 2026-10-04

Användaren vill att valbara block (”moduler”) ska finnas både i programfördjupningen och i det individuella valet. Rekommenderad modell, regler, kontroller och ordning finns i [VALPAKET-PROGRAMFORDJUPNING-IV-2026-10-04.md](../../research/VALPAKET-PROGRAMFORDJUPNING-IV-2026-10-04.md). Modellen har tre lager: skolans versionerade valpaket, programplanens valblock med regeln ”välj exakt ett” och en terminsram, samt elevens val i studieplanen (STUDY-01). Öppna beslut: benämning, om individuellt val ska ingå i första leveransen, vem som får skapa paket och om nivåordningen ska vara risk eller fel.

**Användarbeslut 2026-10-04:** benämningen är ”valbart block”. Individuellt val ingår i första leveransen. Huvudman, rektor och skoladministratör får skapa valpaket inom sitt mandat. Om nivåordningen ska vara risk eller fel är obesvarat. Se avsnittet ”Användarbeslut” i forskningsunderlaget, inklusive samspelet med 05-20:s planer på flera skolor.

## Sources

Primärkällor kontrollerade 2026-10-02. De visar verksamhetsbehov/regler, inte att appen redan stöder paket:

- [Skolverket: Programmens olika delar](https://utbildningsguiden.skolverket.se/gymnasieskolan/gymnasieskolans-program/gymnasieprogrammens-olika-delar) beskriver paket eller friare programfördjupningsval inom skolans utbud.
- [Skolverket: Studieplanering i Gy25](https://www.skolverket.se/styrning-och-ansvar/anordna-utbildning/anordna-gymnasieutbildning/studieplanering-i-gymnasieskolan-och-anpassade-gymnasieskolan-i-gy25) beskriver begränsningar kring jämförbara/alternativa/överlappande nivåer. Exakt regelmodell och undantag måste granskas före automatisering.

Status: **pending**. Användarbeställt behov; varken paketobjekt, gemensam pakettillgänglighet eller elevval är implementerade. Återstående fas 5-planering ska ta hänsyn till detta tillsammans med ADMIN-02 och schemadelprojektet.
