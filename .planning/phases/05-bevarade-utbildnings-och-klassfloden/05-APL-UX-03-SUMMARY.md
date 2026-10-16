---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-UX-03
status: complete
updated: 2026-10-16
user_trial: awaiting_user
---

# APL-UX-03: faktisk integration och lokal leverans

Slutlig produkt är `c739bb38feadee27189cb2d44feb658ab5ee9585`, 209 filer, artefakt `db402038fc61a53d47b89ede8a799b453643ac81a21f950bd06f47b3ad42fc11`. Den byggdes i en separat privat checkout; aktiv artefakt ändrades inte av bygget. SQL och riktade modell-/API-/beslutsregressioner är redovisade i [UX-01](05-APL-UX-01-SUMMARY.md) och [verifieringen](05-APL-UX-VERIFICATION.md). Slutlig typkontroll, app/lib-lint och skyddat bygge PASS. Handboksbygge och preview redovisas i [UX-02](05-APL-UX-02-SUMMARY.md).

## Faktisk integration

**PASS 11:** tre sammanhållna användarfall på dator Chromium, samma tre på telefon WebKit och fem API-grupper med 71 faktiska HTTP-anrop. Browser kördes en gång per enhet, retries 0, utan auth-/verksamhets-/transportmock. Egen schemakopia, syntetiska data och separat Worker på 3014; inga aktiva verksamhetsrader kopierades. Följande passerade:

- Spara bara årskurs 2/vårtermin och återläs samma period-ID utan namn, datum, veckor, ämnen eller minutallokeringar. Läsåret följer den frysta utbildningsstarten trots ett annat årsfilter i vyn.
- Lägg till datum, namn, arbetsmoment och tid senare. Ändra avsikt till annan termin utan att flytta sparade datum eller minuter. Verkligt utgången MFA, ny OIDC-inloggning, sparstatus och exakt samma sparförsök via UI:s återhämtningsjournal fungerar.
- Äldre period med tid på två terminer öppnas utan påhittad terminsavsikt. Namn kan ändras medan hela periodens övriga uppgifter och alla andra perioder bevaras.
- Annan skola, huvudmannens otillåtna ändring, fel origin, gammal kontext, CAS och indraget mandat nekas. Gamla frysta kvitton/hashar och statusreplay bevaras. Ny terminsavsikt kräver förnyad rektorsbekräftelse före separat huvudmannabeslut.
- Namngiven kopia och ny version behåller avsikt med nya period-ID:n, granskning och utan ärvd giltig bekräftelse. Obligatoriskt auditfel rullar tillbaka sparande/kvitto.

15 callbackar verifierades. Samtliga 12 egna IdP-användare och de tre fixturernas sessioner städades; runtime och snapshot cleanup complete. 386 produktkällor, 56 verifieringskällor, migrationsbytes och byggartefakt var identiska före/efter. Stabilt ID används i verifieringen; SQL:s sorteringsordning tolkas inte som periodidentitet.

Råbevis `/private/tmp/apl-ux-actual-fourth.json`, SHA-256 `432471857e1e398befd9ec58a7621f41330280f940254f720e9d0b2b6bec4c3a`. Separat bildgranskad kopia `/private/tmp/apl-ux-actual-reviewed.json`, SHA-256 `a6d7ac3b0ddb6f9e8211e3c65755558749b0e844b04248f29449b597baedbad7`, binder originalets hash och samtliga bilder. Rårapporten är orörd.

Alla åtta bilder granskades. Årskurs/termin/härlett läsår är tydliga och ingen horisontell sidöverrinning finns. Datorbilden visar även sparad tid i flera terminer. Telefonbilderna fokuserar periodens övre del; senare detaljer och sparåtgärder ligger utanför just dessa bildutsnitt. Deras beteende styrks av faktiska interaktioner och separat granskade previewbilder i UX-02. Den befintliga fasta planeringsraden tar fortfarande stor plats på telefon.

## Bevarad felhistorik

Tre tidigare körningar stoppade på testverktygets antaganden. Varje körning har eget råbevis och verifierad cleanup; ingen produktändring eller filtrering av fel krävdes.

1. `/private/tmp/apl-ux-actual-first.json`: temporär fixturefunktion krockade vid nästa seedning, före runtime/OIDC. Separata ägda DB-anslutningar per seed rättade isoleringen. SHA `f87db95184445491b2db8aeb9af2fdb09fd3ab3d21580716ddb54b0581dcd72a`.
2. `/private/tmp/apl-ux-actual-second.json`: första datorfallet PASS; exakt label-selector matchade inte ämnesdropdown. Befintlig faktisk runners combobox-selector användes. SHA `12a1ab51f65718cf054c98970845d6db975f6c549da6a4b1b912d60566e7e88f`.
3. `/private/tmp/apl-ux-actual-third.json`: två datorfall PASS; testet antog fixtureordning trots SQL:s UUID-sortering och jämförde fel äldreperiod. Bindning till stabilt ID/återläst före-värde samt unika namn i kopior rättade verifieraren. SHA `85f66ad733ed36093c45ecc3409dff85657e246be7c7e1c503a24b1b6f278e98`.

## Leverans

Läsande installation/leveransförberedelser PASS. Exakt en additiv migration har installerats i en begränsad transaktion; originalkolumner/rader i 74 tabeller, tidigare journal och rättigheter bevarades. Ingen terminsbackfill. Låstiden före commit var 5901 ms, commit bekräftad och lokala migrationsfiler synkroniserade. Samma 209 filer kör nu på 3012. Appöverföring, läsande rektors-OIDC/MFA, bevarande av 71 verksamhetstabeller och egna sessionsstädningen PASS; exakta bevis redovisas i [releaseunderlaget](05-APL-UX-RELEASE.md).

Auktorisationen bedömdes från aktuell beställning av enklare UX i den lokala miljön och den nödvändiga additiva implementationen. Det äldre exakta tre-migrationsgodkännandet användes inte som generellt DDL-godkännande. Ingen extern publicering/driftsättning ingår. Tekniskt verifierad funktion och lokal leverans är separata från mänsklig begriplighet, som fortfarande väntar på användaren. SS12000-avgränsningen i UX-CONTEXT består; inget externt standardutbyte eller genomförd APL påstås.
