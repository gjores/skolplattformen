---
phase: 05-bevarade-utbildnings-och-klassfloden
package: APL-ANNUAL
status: delivered_awaiting_user
updated: 2026-10-17
---

# Samlad verifiering av skoltid och års-APL

## Avgränsning

Beställningen är Skola HT/VT samt separat års-APL, perioder senare och ingen APL-funktion för högskoleförberedande program. Timmar i en period är en del av årsramen, aldrig extra total. Rektors bekräftelse och huvudmannens beslut är fortsatt skilda. Detta paket bevisar inte genomförd APL, verklig elevintegration eller extern SS 12000-anslutning.

## Spårbarhet

| Krav | Aktuellt bevis och avgränsning |
| --- | --- |
| ANNUAL-01 | PASS: modell/SQL48, UI24 och faktisk dator/telefon sparar och återläser HT20 + VT20 + års-APL60 utan period eller datum. |
| ANNUAL-02 | PASS: SQL/TS-paritet, minutbaserade beslut och autofördelning. Faktisk total100 efter sparning och förläggning; varje minut räknas en gång. |
| ANNUAL-03 | PASS: faktisk period40 ur årsram60 ger20 kvar och fortsatt total100. SQL nekar period över ramen och sänkning under förlagt. |
| ANNUAL-04 | PASS: SQL80→79:30+0:30; faktisk helplansövergång på båda enheter bevarar total/gamla celler. UI provar cancel, status och ändrat underlag. |
| ANNUAL-05 | PASS: SQL kopia, nästa version, proveniens och gamla frysta kvitton; faktisk ny yrkesplan skapas och återläses. Uppskjuten matriskontroll verifierad vid riktig COMMIT. |
| ANNUAL-06 | PASS inom lokala prov: SQL mandat, CAS, auditrollback, låst version, beslutsrunda och tre observerade samtidighetsfall; API/MFA/ursprung/epoch och UI-journal. Faktisk HM läser utan rektorsredigering. Högskoleförberedande program saknar APL i färdig UI och nekas APL-skrivning på servern. |
| ANNUAL-07 | Teknisk PASS: handbok/docsbygge, UI24 samt faktisk dator/telefon och tolv granskade bilder. Mänsklig begriplighetsbedömning är awaiting_user. |

## Bevarade fel och rättningar

- Ny UI-svit hade ett inaktuellt testnamn för autofördelningsradion; rättat utan ändrad produktsemantik. Senare initial sidladdning på telefon stannade; rå rapport sparad. Slutlig UI24 passerar utan retries.
- Äldre APL-svit gav59/60, återstående telefonfall stoppade under uppstart. Fokuserat försök avbröts med över15min väggtid trots40s testgräns. Ny isolerad körning passerade1/1 på6,5s. Assertions och tidsgränser ändrades inte. Orsak till miljöavbrottet är inte säkerställd.
- Granskning fann att uttryckligt HTTP500 kunde radera den nya tidsradens journal. Nu behålls samma begäran tills status och aktuell plan har kontrollerats. Eget dator-/telefonprov PASS.
- Ändrat övergångsunderlag vid oförändrad planrevision kräver ny granskning; samma begäran skickas inte i en konfliktloop. Eget dator-/telefonprov PASS.
- Faktiskt prov01 på kandidatc36f5c6 passerade övergång men stoppade vid ny yrkestimplan med500. Den uppskjutna gamla matriskontrollen krävde gamla timceller vid commit. Tidigare SQL44 använde rollback och fångade inte detta. Kontrollen är rättad för båda modellerna. SQL15 passerar48 kontroller inklusive verklig Worker-commit/återläsning, samtliga uppskjutna kontroller och negativa fall för saknad/felaktig rad. Slutkandidat2cd3ad0 passerar faktisk körning03 efter rättningen. `/private/tmp/apl-annual-actual-01.json` är FAIL, med full runtime-/OIDC-/databascleanup och två verifierade callbacks.

- Bildgranskningen av faktiskt prov02 upptäckte att det negativa UI-provet för högskoleförberedande program kunde passera medan sidan ännu laddade. Servernekandet verifierades, men frånvaro av APL i färdig UI var inte bevisad av den bilden. Provet skärps med väntan på rätt planrubrik och den skolbaserade timtabellen före frånvarokontroller och skärmbild; slutlig körning03 passerade14/14 med detta krav och rätt plan synlig i båda skärmbilderna.

## Slutliga verifieringsresultat

- SQL15: **48 PASS**, tre observerade låskonkurrenser, 75 oförändrade verifieringskällor, migrerings-/matrisrollback och full egen snapshot-cleanup. Verklig Worker-COMMIT, omedelbar kontroll av alla uppskjutna constraints och två negativa matrissabotage ingår. 74 tabeller/376 syntetiska originalrader bevarades i installationsprovet.
- Samordnad Node161 samt slutliga namngiven-plan/server-/verktygsprov16 PASS. Dessa kan överlappa tidigare delsviter och summeras inte till ett unikt antal. Typkontroll, full produktlint, separat skyddat bygge och handboksbygge PASS.
- UI24 PASS utan retries. Befintlig autofördelning24 och äldre APL59+1 PASS, med felhistoriken ovan bevarad.
- Faktisk körning03: **14/14 PASS**, desktop Chromium och phone WebKit, noll retries, åtta verifierade OIDC/MFA-callbacks. Runtime, egna identiteter/sessioner och schema-only-databas städade. Produkt-, migrations-, verifieringskällor och artefakt oförändrade före/efter. Tolv bilder granskade av root; endast separat reviewed-kopia markerar granskningen, rårapport/sidofiler/bilder ändrades inte.
- Mobilen visar en årskurs med sidledsrullning; alla kolumner ryms inte samtidigt. Befintligt skol-/läsårshuvud tar relativt stor höjd. Dialogen rullas. Det automatiska interaktionsprovet bevisar funktion, inte full mänsklig begriplighet.

## Lokal installation och leverans

Läsande prepare och migrationsverify PASS. Två exakta migrationer installerades atomärt, utan backfill/automatisk övergång av gamla planer. Originalkolumner och rader i74 tabeller, tidigare rättigheter och migrationsjournal bevarades. Nya tre tabeller var tomma vid installation. Kontrollerad låstid före commit var5 774ms. Därefter verifierades och överfördes exakt samma testade213 filer, utan bygge i aktiv dist.

3012 kör produktrevision **2cd3ad069754997f5035f735572a76e04ba51a64**, artefakt **1ca531d68daeab0fc5259966f1d589a7d4b3d764efc5042611bc726a1ed73b46**. Läsande OIDC/MFA med rätt rektorsuppdrag PASS; äldre plan och beslutsunderlag kan läsas.74 verksamhetstabeller oförändrade vid byte/läsprov. Egna nya app-/GoTrue-sessioner borttagna, gamla sessioner/audit/verksamhetsdata bevarade. Konfiguration kontrollerad oförändrad av leveransverktyget. Databasanslutningen stängd, workerd-hälsa PASS och recoveryRequired=false.

Gamla timplaner har inte konverterats automatiskt. Full beslutsrunda och skrivningar provas i isolerad syntetisk miljö; efterprovet i aktiv app är läsande. Ingen faktisk APL-närvaro, verklig kommunanslutning eller full pilotacceptans följer av resultaten. SS12000-avgränsningen i huvudplanen består.

## Privata bevisreferenser

| Rapport under /private/tmp | SHA-256 |
| --- | --- |
| timplan-time-v2-sql-15.json | 92ebed8c906d5964e0fb0d334d92eae9be5bebceb9da4d176c2f83f047dfe154 |
| apl-annual-actual-03.json | f7acfb5aa3abf95939c4e32f0865390d0c0271279b5ab6467998abc8243d3a72 |
| apl-annual-actual-03-reviewed.json | b2fb1bce729ae7d0b92735389e4d3f13600d4d0468de0afd4c5ef6dfed0d7266 |
| apl-annual-installed.json | b1593864ade5c47140b1be2f2203945abb66634eb9724319326e6ebc7af94f36 |
| apl-annual-delivered.json | c289e660b2d20a731d33016e64868da3c6e1d7616330987f5b54c128931db00c |

Läsande aktiva OIDC-provet har SHA89588cac5fda1a83a8bdf116dfc000e6d4146d5af01854d752dc76564c8faf5b och refereras av leveransrapporten. Underlagen är lokala och privata; inga identiteter, driftkonfigurationer eller rådata versionshanteras. Första FAIL01 samt begränsade PASS02 behålls som historik. Humanbedömning fortsätter i [leveransens användarprov](05-APL-ANNUAL-RELEASE.md).
