---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-GUIDE-DATES
status: delivered_verified
---

# Handledning och kalender — samlad verifiering

## Omfattning

Användarens beställning av regelhandledning och bättre datumväljare genomförs som ett eget kodpaket. Den senare referensbildens årsvisa APL-kolumner är en separat förändring av tidsmodellen. Detta paket inför inte årsbudgetar och byter inte betydelse på sparade HT-/VT-timmar. Guiden beskriver befintligt beteende fram till den förändringen.

## Produkt och kontroller

- Regelhandledning finns direkt i APL-vyn, även i läsläge, och i den granskade handboken. Lagregel, appens begränsade planeringskontroll och skolans ansvar för genomförandet hålls isär. Primärkällor och avgränsning redovisas i `05-APL-GUIDE-RESEARCH.md`.
- Gemensam svensk datumkomponent används i samtliga 19 inventerade datumpositioner. ISO-veckor, år/månad, tangentbord och datumgränser ingår. Exakta kalenderdatum och giltighetstider behålls; veckonummer beräknar inte APL-omfattning.
- Guide: 60/60 befintliga/utökade APL-previewprov och 4/4 riktade återprov passerar. Datum: 3/3 hjälpfunktionsprov i tre tidszoner, 6/6 dator-/telefonprov samt 24/24 programplankopieringsprov passerar. Typkontroll, full app/lib-lint och handboksbygge passerar. Det är komponent-/simulationsbevis, inte en verklig kommunanslutning.
- Grundcommit `2b383dc914ec0ae8c5d193d2425df3d40055c661` är pushad. Separat skyddat bygge med 210 filer, SHA-256 `2686baeba66eeffcfdb1650558c106925ca6737bfebf683943539c144daa20da`, byggdes från en privat källkopia. Aktiv artefakt på 3012 lämnades oförändrad.
- Kodleveransverktygets kombinerade 98 tester passerar; det utökade paketets egen svit har dessutom körts separat med 29/29 PASS. Paketen hålls isär, faktiska bevis/hashar binds och ingen databasinstallation simuleras.

## Första faktiska provet

Privat rapport `/private/tmp/apl-guide-dates-actual-01.json` är FAIL efter en passerad guidekontroll. Provets referensberäkning för ISO-veckor använde kl. 12 tillsammans med avrundning uppåt och väntade felaktigt vecka 53 för 1 januari 2028. Produktkalendern visade korrekt vecka 52. Detta är ett provfel; originalrapporten bevaras och ersätts inte med PASS. All egen OIDC-, Worker- och databascleanup är verifierat complete. Inga produktfiler ändrades under körningen.

Rootgranskningen identifierade dessutom fyra datumfält i logg/mandat där kalenderknappar fortfarande låg inuti etiketten. Separata etiketter och kontrollbehållare rättades. Utökade tangentbordsprov hittade därefter instabil återgång av fokus efter Escape i dialog. Orsaken var den interna portalens konflikt med yttre dialogens fokusåterställning. Standardportalen med explicit fokusmål löser detta; en avgränsad observer bevarar dynamiskt native fieldset-lås även när kalendern är öppen. Slutliga 10/10 riktade dator-/telefonprov, typkontroll och full app/lib-lint passerar. APL-fälten hade redan separata etiketter.

## Slutkandidat och andra försöket

Rättningscommit `c02e6000b7b2d27654adec67668932acc4f8ef12` är pushad. Slutkandidaten har 210 filer och artefakthash `118a34b275c3101565bd32a80e6c796465bc7050fdd8cb00edbb939e3271e390`; separat bygge och aktiv artefakts oförändring PASS. Byggbevis: `/private/tmp/apl-guide-dates-candidate-build-02.json`.

`/private/tmp/apl-guide-dates-actual-02.json` bevaras som FAIL efter en guidekontroll. Kalenderns datumval passerade, men scenariot använde exakt `getByLabel` för en befintlig omslutande selectetikett och hittade inte läsårsfältet. En minimal faktisk DOM-kontroll visade att rollens exakta tillgängliga namn fungerar; tre läsårs-/omfattningsassertioner ändrades till samma rollselektorer som produktens befintliga APL-prov. Ingen produktändring gjordes. OIDC, runtime och snapshot är complete även i detta försök. Tredje faktiska försöket använder oförändrad slutkandidat och rättat prov.

## Tredje försöket och navigeringsdiagnos

`/private/tmp/apl-guide-dates-actual-03.json` bevaras som FAIL trots 8/8 passerade verksamhetskontroller och granskade bilder. WebKit registrerade ett globalt `/api/session`-fel om access control; alla motsvarande Worker-anrop hade HTTP 200, men felet saknade fasbindning. Därför används rapporten inte som godkänt leveransbevis. OIDC, runtime och snapshot städades fullständigt. Scenariot kompletteras med fasbunden felregistrering samt väntan på synlig arbetsyta och avslutade anrop före avsiktliga sidbyten. Felgrinden behålls strikt; ingen allowlist eller bortfiltrering införs. Produkt och kandidat är oförändrade.

## Fjärde försöket och lokal leverans

`/private/tmp/apl-guide-dates-actual-04.json` passerar 8/8 faktiska verksamhetskontroller på dator och telefon, utan omprov eller ignorerade webbläsarfel. Väntan på färdig arbetsyta och avslutade anrop före scenariots avsiktliga navigering passerar med oförändrad produkt. Det bevisar ett fungerande slutprov; tredje försökets exakta felorsak är inte fastställd. Alla 14 bilder är granskade. Originalrapportens SHA är `513ab87be1bbaffc064ff3b011bc6a630d9853c0e182a6d1008aa1ae05ef027a`; separat granskningskopia `/private/tmp/apl-guide-dates-actual-04-reviewed.json` har SHA `7b19ace26ad7392f481b63cd9b46b66410f7e411cb08778141b49c3670c0cc7f`.

Åtta OIDC-callbackar verifierades. OIDC-, runtime- och snapshotcleanup är complete. Källor, slutartefakt och schema är oförändrade genom provet. Endast schemat kopierades; testdata var syntetiska. Inga verkliga verksamhetsrader exporterades.

Läsande förkontroll `/private/tmp/apl-guide-dates-delivery-verify.json` PASS, SHA `6d273725d4c8c33bb800daa97b681f7563fee43c9ab119a3e36076a330553fad`. Kodleverans `/private/tmp/apl-guide-dates-delivered.json` PASS, applied=true, stage=completed, SHA `908e579e17091134712dfdfccbc1d77a6d19a41ffe446a8b0dd65eb8a9e760c2`.

Exakt c02e600-kandidat med 210 filer och artefakthash ovan kör nu på 3012. Databasens schema, privat konfiguration samt antal och innehållshash i 71 verksamhetstabeller är bevarade. Läsande riktig rektors-OIDC/MFA och egna sessioners cleanup passerar; äldre sessioner och audit bevarades. Ingen migration utfördes.

## Kvarstående avgränsning

Mänsklig begriplighetsbedömning av handledning och kalender kvarstår. Årsvis APL enligt referensbilderna är planerad i `05-APL-ANNUAL-PLAN.md` men inte implementerad. Full fasacceptans och verifierat SS 12000-informationsutbyte följer inte av UI-ändringen. Historiska pilotantal 88/100 och 3/8 ändras inte.
