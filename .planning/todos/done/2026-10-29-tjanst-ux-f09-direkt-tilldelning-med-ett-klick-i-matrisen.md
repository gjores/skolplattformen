---
created: 2026-10-29
title: "Tilldela lärare med ett klick i matrisen"
area: tjanstefordelning
status: completed
completed: 2026-10-29
verification: synthetic_ui_and_owned_worker_oidc
deployment: not_installed
phase: "05.1"
report_id: F09
priority: P2
related_requirements: [TJANST-01, TJANST-03, TJANST-04]
files:
  - web/app/tjanst-matrix.tsx
  - web/app/tjanst-workspace.tsx
  - web/app/tjanst-dialogs.tsx
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Problem

Användaren önskar 2026-10-29 att klicket på läraren i matrisen ska räcka för tilldelning och att modal/pop-up används för mer avancerade val. Användaren bad därefter att få detta i rapporten och som todo.

Källa: [UX-rapport F09](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Önskad riktning: klick i tom lärarcell tilldelar återstående känt HT/VT-behov till läraren i kolumnen; inget extra lärarval i dialog. Föreslagna detaljer att konkretisera: sparåterkoppling och ångra, detaljer vid befintlig tilldelning, dialog för avancerade val. Okänd tid anges först; täckt behov får ingen automatisk extratid. Bevara nödvändig fråga om delning och betygsansvar. Klicket är ett aktivt personval; dokumentera förhållandet till D-25–D-30 i planen utan att ändra tidigare beslut i efterhand.

## Verifiering och klart-kriterier

Pröva ofördelat och delvis fördelat behov, noll/okänd tid, flerlärare, samläsning, dubbelklick, sparfel, osäkert svar och samtidig ändring. Kontrollera servermandat, revisionskontroll, fokus och att eventuellt ångra bara återtar den avsedda ändringen. Ingen mobilredigering införs genom denna todo.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** completed — genomförd i 05.1-37, UI240 och isolerat faktiskt Worker/OIDC/PostgreSQL-prov PASS. Ingen installation eller ny krav-/fasacceptans. [Resultat och begränsningar](../../phases/05.1-tjanstefordelning/05.1-37-SUMMARY.md). [Samlad uppföljning](../../research/TJANST-UX-2026-10-29-TODOS.md).
