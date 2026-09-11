# Granskning av arbetsversionen – 7 september 2026

## Bedömning

Modelltester, typkontroll, riktad kodkontroll och produktionsbygge passerar. Tre funktionella fel behöver rättas i kopplingen mellan gränssnittet och datalagret. Dessutom har timplanen ett breddfel på mobil. De befintliga modelltesterna täcker inte dessa fall.

Granskningen gäller filernas aktuella tillstånd. Projektmappen saknar Git-historik, så det går inte att avgränsa exakt vilka ändringar Claude Code gjorde. Inga ändringar har gjorts i appens implementation och inga uppgifter har skrivits till den gemensamma Supabase-databasen under granskningen.

## 1. P1 – Äldre sparning kan skriva över en nyare timplansändring

**Plats:** `web/app/organisation-workspace.tsx:354–381`, särskilt rad 368–376. Inmatningen sker i `web/app/timplan-view.tsx:231–233`; skrivningen i `web/lib/planning-store.ts:136–144`.

Varje tangenttryckning i ett timplansfält startar en ny asynkron sparning. Sparningarna köas inte, och fältet är fortfarande redigerbart. Om användaren skriver 20 och därefter 200 kan skrivningen av 20 slutföras sist. Då står 20 i databasen. Dessutom ersätter varje avslutad omläsning hela klientens plantillstånd, även när användaren hunnit göra fler ändringar. Läsårens `runLasar` använder samma mönster.

**Verifiering:** Den riktiga funktionen `persistTimplans` kördes mot en isolerad databasstub. Två ändringar av samma befintliga rad startades i ordningen 20, 200. Den första skrivningen fördröjdes 80 ms och den andra 5 ms. Slutvärdet blev 20. Inga molnuppgifter användes eller ändrades.

**Rättning:** Samordna sparningar per plan/läsår, med ett känt senast sparat tillstånd. Köa eller slå ihop väntande ändringar och hindra äldre lässvar från att ersätta nyare redigeringar. Nya objekts databas-id måste också vara känt innan efterföljande ändringar sparas. En fördröjning av inmatningen ensam garanterar inte rätt ordning.

**Regressionstest:** Skriv flera värden snabbt med varierande svarstider. Det sist inmatade värdet ska finnas kvar både i gränssnittet och efter omladdning. Testa även en ändring direkt efter att en ny version skapats.

## 2. P2 – Utbildningsförslag försvinner efter import av skolenhet

**Plats:** `web/app/organisation-workspace.tsx:639` och `:666`; `suggested.unitId` sätts på rad 426.

Efter import sparas skolenhetskoden i `suggested.unitId`. Databasen tilldelar däremot skolan ett UUID. När steg 2 ritas upp anropas `suggestOfferings` med koden, men funktionen söker strikt på `unit.id`. Förslagslistan blir därför tom och användaren får felaktigt besked om att registret saknar program. Knappen för att skapa utbildningar översätter däremot koden till UUID på rad 432; den kan därmed skapa förvalda utbildningar som inte syntes i listan.

**Verifiering:** Ett organisationsobjekt med olika värden för skolenhetskod och databas-id skickades till den riktiga `suggestOfferings`. Koden gav noll förslag. UUID gav två förslag från samma skolas uppgifter.

**Rättning:** Använd samma upplösta skolenhets-id för visning, tomt meddelande och skapande. Alternativt lagras skolenhetskoden som ett uttryckligt separat fält och översätts på ett gemensamt ställe.

**Regressionstest:** Importera en gymnasieskola med minst ett känt program via ett datalager som genererar UUID. Steg 2 ska visa förslagen och bara skapa de utbildningar användaren har valt.

## 3. P2 – Sparning återställer vald skolenhet

**Plats:** `web/app/organisation-workspace.tsx:301` och `:308`; `web/lib/organisation-store.ts:293`.

`loadOrganisation` väljer alltid den första skolenheten. Efter en sparning ersätter `persist` hela tillståndet med detta lässvar. Om huvudmannen arbetar med skola B och sparar exempelvis årskurser eller uppdrag visas därför skola A efteråt. Samma sak händer när en ny skolenhet har lagts till. Nästa åtgärd kan då gälla en annan skola än den användaren avsåg.

**Verifiering:** Den riktiga `loadOrganisation` kördes med två skolenheter i en isolerad databasstub och returnerade den första som aktiv. Sättningen i `persist` ersätter det befintliga skolvalet utan att bevara det.

**Rättning:** Håll skolvalet separat från serveruppgifterna eller bevara aktiv skolas id vid omläsning, förutsatt att skolan finns kvar. Efter import behöver den nya skolans kod översättas till dess databas-id. Vid borttagning väljs en kvarvarande skola uttryckligen.

**Regressionstest:** Välj skola B, spara en ändring och kontrollera att B fortfarande är vald. Kontrollera även import av skola C och borttagning av den aktiva skolan.

## 4. P2 – Timplansvyn gör hela sidan rullbar i sidled på telefon

**Plats att undersöka:** timplanslayouten i `web/app/timplan-view.tsx:279` och dess tabeller samt mobilreglerna i `web/app/globals.css:1834–1836`.

Vid 390 pixlars skärmbredd får dokumentet en rullbredd på 1182 pixlar i timplansvyn för grundskolan. Detta är inte bara tabellens avsedda interna rullning: `window.scrollTo(600, 0)` gav `window.scrollX === 600`. Hela sidan kan alltså förskjutas långt utanför telefonskärmen. De övriga åtta granskade vyerna hade dokumentbredd 390 pixlar med samma inställning.

**Verifiering:** Återskapat i två separata Playwright-körningar i Chromium med rektorsrollen och den lokala exempelplanen. Sidbredd och faktisk rullning av fönstret mättes. Den enskilda CSS-regel som orsakar läckaget har inte isolerats.

**Rättning:** Begränsa överflödet till tabellernas egna rullområden och kontrollera deras layout, inklusive de låsta ämneskolumnerna. Säkerställ att tabellerna fortfarande går att använda; att bara dölja överflödet på hela dokumentet kan maskera innehåll som behöver vara åtkomligt.

**Regressionstest:** Öppna grundskolans timplan vid 390 pixlars bredd. Dokumentet ska hålla sig inom skärmen medan tabellen kan rullas till samtliga årskurser. Kontrollera även redigering och beslutsdialog på mobil.

## Genomförda kontroller

- 75 modelltester godkända.
- TypeScript-kontroll utan fel.
- Oxlint för `app` och `lib` utan fel.
- Produktionsbygget klart. Bygget varnar om stora JavaScript-paket och om en framtida ändring av hur Vite läser konfiguration; detta stoppar inte nuvarande bygge.
- Tre isolerade reproduktioner av felen ovan, med riktiga modell- och datalagerfunktioner och ersatta databassvar.
- Webbläsarkontroll av Skolenheter, Utbildningar, Poängplaner, Timplaner, Läsår & skoldagar, Elever, Studieplaner, Grupper samt Schema & resurser, vid 1440 respektive 390 pixlars bredd. Mobilmenyn öppnas och dess navigation visas.

Den visuella kontrollen använde appens lokala exempeldata genom en ersättning av databasmodulen i en separat webbläsarsession. Skillnaden mot serverns laddningsplatshållare gav ett förväntat hydreringsmeddelande från testuppsättningen; detta har inte klassats som ett produktfel. Kontrollens resultat gäller layout och navigation, inte de verkliga molnflödena.

Gemensam molnlagring, verkliga behörigheter och samtidiga användare mot Supabase har inte funktionstestats i denna granskning. Demoinloggning och att elevuppgifter fortfarande är sessionsbundna är redan dokumenterade avgränsningar och har inte klassats som nya fel.
