---
created: 2026-10-03
title: Ange årskurser och terminer för programplanens poäng
area: programplaner
status: implemented
plan: 05-18
human_result: awaiting_user
implementation_completed: 2026-10-04
verification: passed_local_synthetic
files:
  - web/app/protected-programplan-workspace.tsx
  - web/app/protected-programplan-sheet.tsx
  - web/app/protected-programplan-terms.tsx
  - web/lib/programplan-terms.ts
  - web/lib/programplan-terms-contract.ts
  - supabase/migrations/20261003120000_phase5_programplan_terms.sql
  - web/lib/server/programplan-planning.ts
  - docs/handbok/programplaner.md
---

## Problem

Användaren saknar möjligheten att i programplanen skriva in i vilka årskurser och terminer ämnenas/nivåernas poäng ska läsas. Fördelningen ska vara del av programplanen och fungera som underlag när en godkänd och fastställd programplan används för att skapa en timplan.

## Solution

- Lägg till tydlig inmatning av årskurs och termin per ämne/nivå i programplansarbetet, exempelvis åk 1 HT och åk 1 VT. Visa vilka poäng som planeras när, med översikt per årskurs och termin.
- Precisera hur en nivå som läses över flera terminer representeras och hur poängen fördelas. Bevara nivåns totala poäng utan dubbelräkning eller tyst omfördelning; skilj poäng från undervisningstimmar.
- Spara fördelningen beständigt med programplansversionen. Ändringar i fastställd plan ska följa beslutat versions-/ändringsflöde och bevara historik.
- Låt huvudmannen och behörig rektor/skoladministratör arbeta med fördelningen enligt [programplansdelegationen](2026-10-03-huvudmannen-delegerar-programplansarbete-till-skolorna.md). Kontrollera mandat, giltiga värden, konflikter och audit på servern.
- Använd fördelningen vid [skapande av timplan från godkänd och fastställd programplan](2026-10-03-skapa-timplaner-fran-programplaner.md). Beakta utbildningsstart, elevkull och schemadelprojektets tids-/versionskontrakt. Uppdatera handboken vid genomförandet.

## Verification

- Behörig användare anger årskurs och termin för flera ämnen/nivåer, sparar och läser om samma fördelning. Översiktens poängsummor stämmer med programplanens innehåll.
- Pröva nivåer över flera terminer, ogiltiga värden, saknad fördelning och avvikande poängsumma enligt den beslutade modellen; avvikelser visas begripligt.
- En timplan skapad från den godkända och fastställda versionen får rätt årskurs-/terminsunderlag. Äldre planversioner och timplaner förändras inte av senare redigering.
- Obehörig ändring och tyst överskrivning nekas. Prova inmatning och översikt på dator och telefon, inklusive mänskligt begriplighetsprov.

Status 2026-10-04: **implementerad i 05-18 — automatiskt verifierad lokalt, mänskligt prov väntar**. Inmatning, versionbunden lagring, årskurs-/terminsöversikt, radvalidering, konflikt-/mandat-/auditgränser och dator-/telefonlayout är genomförda. Läs [05-18-SUMMARY](../../phases/05-bevarade-utbildnings-och-klassfloden/05-18-SUMMARY.md) och [aktuellt mänskligt prov](../../phases/05-bevarade-utbildnings-och-klassfloden/05-PROGRAMPLAN-USER-TRIAL.md).

Fördelningens användning vid timplansskapande ligger fortsatt i den separata timplans-todon. Administratörsmandatet följer den separata delegations-todon; nuvarande huvudmanna-/rektorsmandat gäller tills den är genomförd. Alternativ/oprecisa nivåer väljs inte automatiskt. Individuellt val är en ram, inte färdiga elevval. Ny versionskopia bevarar fördelningen; kopia till en helt ny utbildning gör det ännu inte.

Todon ligger kvar under pending för mänskligt begriplighetsprov och de uttryckligen separata beroendena; detta betyder inte att terminsinmatningen saknas.
