---
status: resolved
trigger: "Användaren kommer från analysens åtgärdslänkar till en vy där riskerna inte går att åtgärda."
created: 2026-10-05
updated: 2026-10-05
---

# Analysens åtgärdslänkar i programplanen

Användarprov 2026-10-05 är FAIL för åtgärdslänkarna. Automatiska tidigare tabellprov täckte sparning och analysvisning men inte övergången från analysradens åtgärd till faktisk redigering.

## Verifierad orsak

`AnalysisView` skickade samma callback utan identifierad analysrad. Arbetsytans callback körde `nextAction()`, vilket för ett bundet utkast öppnade `replace`-formuläret. Dess `LocalPlanBoard` hade tom fördelning och låsta terminsfält. Vyn visade därför 0 poäng och gav inget sätt att rätta terminsriskerna. Inga skrivningar gjordes av länkklicket.

## Rättning

- Analysraderna har uttryckliga mål för rad, programfördjupning, årskurskort, datum och inriktning.
- Sparade utkast behåller den aktiva `ProgramplanBoard`, fördelningen och sparstatus. Raden markeras och får tangentbordsfokus; telefonen väljer rätt årskurs. Filtret för enbart ofördelade rader slås av så att den berörda raden kan visas.
- Lägg till går till sökfältet; ta bort går till ett faktiskt radkryss. Jämna ut går till årskurskorten. Datum går till datumfältet eller den nödvändiga underlagsförberedelsen.
- Skrivskydd, låst version och äldre osparat underlag förklaras i åtgärdskolumnen. Inriktningen är låst i den befintliga utbildningen och får ingen felaktig redigeringslänk.
- Handboken beskriver faktisk navigation. Ingen fördelning eller nationell regel ändras automatiskt.

## Följdfynd i telefonprovet

Det nya nivåflyttningsprovet hittade en separat sparlucka. `commit()` ignorerade radlämning när ett tidigare svar fortfarande sparades, trots att `save()` redan hade en kö för följdändringar. En snabb flytt mellan årskurser kunde därför lämna sista ändringen osparad. Radlämning under `saving` går nu också genom kön. Provet håller ett verkligt lyckat Worker-svar efter DB-commit och ändrar raden igen innan svaret släpps; slutlig fördelning läses från Worker/SQL och efter omladdning. Inga lyckade svar simuleras.

Den första omgången på `5a7d822` är FAIL: 11 PASS, 5 FAIL och 10 som inte kördes. Tre hämt-/förkontrollfel på dator och ett planhämtfel på telefon var tidsgränser, medan telefonens nya nivåflyttning upptäckte sparluckan. Rårapport och felbilder finns lokalt i `web/test-results/programplan-analysis-actions-first/`. För lokal stack har terminsprovets förväntningsgräns höjts från 5 till 20 sekunder och hälsokontrollens gräns från 10 till 30 sekunder. Inga automatiska retries eller ändrade resultatförväntningar har införts.

## Verifiering

**PASS:** full terminsomgång 25/25 körda prov, plus ett avsiktligt hoppat datorfall som bara gäller telefon. De fem nya åtgärdsfallen 09–13 passerar på båda profilerna (10/10), utan retries. Samtliga 26 egna fixturer är städade med verksamhetsrader/sessioner/triggers = 0; säkerhetsloggar och auditankare är bevarade. Byggd lokal Worker/SQL, endast egna syntetiska uppgifter. Slutlig byggrevision `db5fb9bf58f7fda2ae394584b10146c6c5e22c11`. Node 571/571, TypeScript, oxlint, skyddat bygge och handboksbygge PASS. Första breda UI-omgångens tidsfel i list-/planhämtning och förkontroll redovisas separat; de räknas inte som godkända produktprov.

Nytt mänskligt prov efter rättning är awaiting_user. 05-22/23, ADMIN-02/03 och full fas 5 förblir öppna. Befintliga användarutkast ska bevaras.

Vanlig 3012 kör det testade bygget. Färsk käll-/bygg-/Worker-/DB-kontroll PASS efter installation. Äldre klientfiler har behållits så att en redan öppen flik fungerar tills användaren själv laddar om. Inget befintligt användarutkast återställs eller skrivs av denna rättning. Datorns nivåflyttningsbild, telefonens nivåflyttning och skrivskyddsbilden är visuellt granskade. Se `work/pilot/results/programplan-analysis-actions.json`; rårapporter/bilder finns lokalt i `web/test-results/programplan-analysis-actions-final/`.
