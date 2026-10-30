---
created: 2026-10-29
title: "Mät och förbättra matrisen för många lärare"
area: tjanstefordelning
status: pending
on_hold: true
review_before_execution: true
disposition: optional_polish_after_accepted_user_trial
phase: "05.1"
report_id: F08
priority: P3
related_requirements: [TJANST-01]
files:
  - web/app/tjanst-matrix.tsx
  - web/app/tjanst-workspace.tsx
  - web/app/tjanst.css
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Aktuell prioritering 2026-10-30

**Vilande, frivilligt finputs.** Användaren har godkänt samtliga U1–U8 i [det avslutande användarprovet](../../phases/05.1-tjanstefordelning/05.1-CLOSING-USER-TRIAL.md). Inget strul eller blockerande problem rapporterades. Den äldre problemformuleringen nedan är historik och bevisar inte att problemet fortfarande finns. Punkten innebär ingen ny utvecklingsbeställning och stänger inte automatiskt alla föreslagna tekniska delmål som implementerade. Ta bara upp den igen vid konkret återkoppling eller ny beställning. Klassorganisation inför schema prioriteras nu.

## Problem

40 lärare och 300 behov gav 12 640 knappar och cirka 5 440 px tabellbredd i 1 406 px rullyta. Detta är en skalningsobservation, inte uppmätt långsamhet.

Källa: [UX-rapport F08](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Prioritera relevanta och fästa kolumner samt klass/kursurval. Mät rendering, scrollning och tangentbordsarbete innan eventuell virtualisering väljs.

## Verifiering och klart-kriterier

Dokumentera mätmetod och före/efter på stora syntetiska underlag. Kontrollera fokus, tabellsemantik, skärmläsaråtkomst, fästa kolumner och korrekt tidssummering.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** pending — registrerat för avgränsad planering i fas 05.1. Ingen ny krav-/fasacceptans eller installation. [Samlad uppföljning](../../research/TJANST-UX-2026-10-29-TODOS.md).
