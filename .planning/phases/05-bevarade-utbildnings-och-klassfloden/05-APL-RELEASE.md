---
phase: 05-bevarade-utbildnings-och-klassfloden
package: APL
stage: 1
status: delivered_user_trial_pending
updated: 2026-10-16
---

# APL etapp 1 – lokal leveranskandidat

Paketet är installerat efter användarens uttryckliga godkännande. De tre migrationerna och samma testade68cecb4/209-fils kandidat kör lokalt. Installation, originalbevarande och verklig läsande OIDC/MFA PASS. [APL-09](05-APL-09-SUMMARY.md) redovisar journaler och extra provhjälpsavvikelse med exakt egen återhämtning. [Användarprovet](05-APL-USER-TRIAL.md) väntar på mänsklig bedömning.

## Vad användaren får

Rektor och skoladministratör kan planera perioder, ämnesinnehåll och fördelning av APL inom en namngiven timplan. Total undervisningstid inkluderar APL; delen visas som **Varav planerad APL**. Tre granskade femveckorsperioder motsvarar 345 timmar en gång, även när varje period kopplas till flera ämnesnivåer. Minutfördelning stöds utan avrundning till hela timmar.

Rektor bekräftar förläggningen för det sparade innehållet. Huvudmannen fastställer timplanen separat och kan skicka tillbaka den för rättning. En innehållsändring kräver förnyad bekräftelse. Kopiering bevarar strukturen med nya period-ID:n och granskningsbehov; rektors beslut kopieras inte.

Äldre fastställda planer förblir läsbara. Ett äldre inskickat yrkesärende utan strukturerat APL-underlag behöver kompletteras innan ett nytt fastställande. Återsändning och tidigare beslutshistorik bevaras. Programplanens godkännande kräver inte en färdig APL-plan.

Detta är planering. Arbetsplatser, elevplaceringar, närvaro och genomförd APL tillhör etapp 2–3. Okänd utbildningsform, del-/blandveckor och lärlingsutbildning får inget automatiskt besked om uppfylld omfattning.

## Exakta bytes och mål

Målet är befintlig lokal skyddad miljö, med app på `http://127.0.0.1:3012`. Produktionsdrift eller externa anslutningar ingår inte.

- Tidigare app före bytet: `a34dd199a96a1c24448c1c6ad8a688da4b91949a`; exakt process och artefakt binds mot föregående leveransbevis.
- Ny skyddad byggrevision: `68cecb41e1d61ae8381951ee295758c4f764511c`.
- Ny artefakt: 209 filer, SHA-256 `e37a996c33ba301a86490512aff7ab4a65f3ccd32337ba91ac5cc713062ae9c6`.
- Bygget görs i separat lokal källkopia utanför ignorerade kataloger. Genererade dialog-/layoutstilar och oförändrad aktiv artefakt kontrolleras. Samma färdiga bytes som integrationsprovas ska överföras; inget nytt bygge vid leverans.

| Migration | SHA-256 |
| --- | --- |
| `20261016120000_apl_planning.sql` | `e8e11a42b26695fc18c85af7dfed42bfd2ef9a0de90371f31325f6f66756a160` |
| `20261016121000_apl_plan_decisions.sql` | `9f53a253a3f20b7fc23c15f4e4ca865bf2dd8ac9ce7bd9bf1e2e8ae874cba781` |
| `20261016122000_apl_worker_access.sql` | `00160ba5c368d19d6892b4f67c9d58d5aa6aaf6bb8e9bb7220b172923d22ad36` |

Paketet lägger till nio stängda APL-tabeller, trettio funktioner och exakt tre nya körbehörigheter för Worker. Fem befintliga funktionskroppar uppdateras och två befintliga tabeller får nya skyddstriggers. Befintliga rader, kolumner, historik och rättigheter ska bevaras. Ingen automatisk bakåtfyllning av gamla APL-intyganden görs.

## Verifiering och första avvikelser

Slutkandidaten passerar34 faktiska kontroller, dator/telefon utan omprov,19 verifierade callbacks,14 granskade bilder och full cleanup. Samtliga386 produktkällor/59 verifieringskällor samt byggbytes är oförändrade. Läsande schema-/installationsförkontroll och leveransförberedelse PASS; aktuell databas och3012 är oförändrade. Oberoende slutgranskning utan nya blockerare. Exakta privata bevishashar och första fel finns i [APL-08](05-APL-08-SUMMARY.md).

- Samlad faktisk SQL: 65 kontroller, 12 observerade samtidighetsfall, 65 originaltabeller och 530 ursprungliga syntetiska rader bevarade, full schemarollback och cleanup. [APL-07](05-APL-07-SUMMARY.md).
- UI med simulerade svar: 44 editorfall och 26 beslutsfall på dator/telefon. Slutliga modell-/serverprov: 91 PASS. Handbok byggd enligt [APL-06](05-APL-06-SUMMARY.md).
- Första verkliga browserkörningen avbröts vid sparknappen: isolerad byggkatalog under Git-ignorerad förälder gav inga Tailwind-utilities trots deklarerade källor. Kandidaten levererades inte. Nytt bygge från samma produktkod har verifierade stilar. Fyra egna syntetiska IdP-konton, egen redirect och körlås återhämtades exakt efter en obehandlad testpromise. Promisehantering och förälderns reservstädning har rättats.
- Andra faktiska körningen sparade/reloadade tre perioder och återhämtade rektors bekräftelse efter riktig MFA på båda enheterna. Länken till APL-underlaget tappade däremot fokus genom navigering/remontering. Rättat i `d294a27`; två riktade tangentbordsprov, TypeScript och full app/lib-lint PASS. Båda körda OIDC-fixturerna (åtta egna konton) samt runtime/databaskopia städades. Övergripande cleanupfält räknade felaktigt även den ej startade API-fixturen som saknad; rapporten är kvar som FAIL och räknaren är rättad inför tredje körningen.
- Tredje körningen verifierade fokusfixen i riktig app. Därefter missade testets exakta `getByLabel` ett förifyllt textfält (etikettens DOM-text innehåller även textarea-innehållet). Ett fristående browserprov visade 0 träffar med etiketttext och 1 med korrekt tillgängligt textboxnamn. Fältväljaren är rättad; sparade perioder fanns kvar.
- Femte körningen passerade hela faktiska kedjan:34 kontroller, dator och telefon utan omprov,19 verifierade callbacks och full cleanup av12 egna konton/runtime/schemakopia. Den visuella mobilgranskningen visade dock att planeringsrutan skymde APL-rubriken. Rättat genom avgränsad mobil scrollmarginal i `68cecb4`; två dator-/telefonprov PASS. Ny slutkörning mäter fri yta både efter riktig länk och vid bildfångst.
- Två brister i leveransverktygen hittades vid tidigare oberoende granskning: överlappande källmanifest kunde maskera äldre hash, och leveransidentiteten kontrollerades för sent. Båda är rättade med negativa prov. Verktygens senaste 69 Node-prov PASS. Sjätte slutkörningen och båda läsande förkontrollerna passerar; resultaten ovan ersätter tidigare väntande status.

Privata bevis ligger utanför Git. Inga råa sessionsuppgifter, hemligheter eller användardata läggs i denna fil.

## Godkännande och installation

Användaren godkände uttryckligen 2026-10-16: ”Ja, godkänner de tre APL-databasändringarna och bytet på 3012. Kör på!” Godkännandet gäller de tre migrationshasharna och kandidat68cecb4 ovan. APL-09 påbörjas med förnyad läsande kontroll; ingen ny tillåtelse behövs.

APL-09 kräver godkännande av just dessa tre migrationer och denna testade kandidat. Tidigare godkännande av fem andra migrationer gäller inte detta paket. Faktiskt prov och läsande förkontroller är klara; nästa steg är detta konkreta installationsbeslut.

1. Läsande `apply-apl-plan.mjs --verify` binder schema, mål, migrationsjournal, originalrader, rättigheter, SQL/API-bevis och byggbytes.
2. Läsande `deliver-apl-plan.mjs --prepare` binder nuvarande 3012-process/konfiguration och prövad kandidat. Den kontrollerar även befintligt rektorsmandat, GoTrue-identitet, lokal MFA-konfiguration och faktiskt IdP-konto före permanent DDL.
3. Kontrollera precis före installation att `work/pilot/targets/protected/idp/class-cohort-run.lock` är ledigt. Den oberoende slutgranskningen fann inga nya blockerare, men efterkontrollen tar detta lås först efter bytet. Efter godkännande körs de tre migrationerna i en sammanhängande transaktion med begränsad lås-/körtid. Originalrader och rättigheter jämförs före/efter utan dataexport. Schema och definitioner måste motsvara den separat testade installationen exakt.
4. Appen byts till samma testade filer och kontrolleras genom verklig läsande OIDC/MFA och verksamhetsläsningar. Egna sessionsspår städas med bevarande av tidigare sessioner, historik och verksamhetsdata.
5. APL-10 prövar därefter begripligheten med användaren; automatiska prov ersätter inte detta.

En återställd gammal app gör inte databasändringen ogjord. Den gamla Workern betraktas inte som kompatibel efter APL-paketets commit. Vid oklart installationsutfall görs ingen blind omkörning; privata journaler och aktuellt schema avgör fortsatt återhämtning. Vid misslyckat appbyte efter commit markeras återhämtning som nödvändig även om den tidigare processen kan startas.

SS 12000:2024 utgåva 4/OpenAPI 2.1.0: stabila skol-, organisations- och klass-ID:n, giltighet och källansvar bevaras. APL-underlaget är internt; ingen extern standardexport eller faktisk elev-/arbetsplatsanslutning verifieras här.
