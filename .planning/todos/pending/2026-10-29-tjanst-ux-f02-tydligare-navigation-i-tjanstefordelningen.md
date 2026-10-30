---
created: 2026-10-29
title: "Gör huvudarbetsflödet lättare att hitta"
area: tjanstefordelning
status: pending
on_hold: true
review_before_execution: true
phase: "05.1"
report_id: F02
priority: P2
related_requirements: [TJANST-01, TJANST-02, TJANST-03, TJANST-04]
files:
  - web/app/tjanst-workspace.tsx
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Aktuell prioritering2026-10-30

**Vilande före ny beställning.** Användaren upplever tjänstefördelningen som i stort klar. Stäm av denna äldre punkt mot vad som redan levererats och [det avslutande användarprovet](../../phases/05.1-tjanstefordelning/05.1-CLOSING-USER-TRIAL.md) innan något mer genomförs. Pending nedan är historisk backloggstatus, inte ett besked om att hela problemet fortfarande finns. Nytt finputs bestäms efter provet; nästa prioritering är klassorganisation inför schema.

## Problem

Sex likvärdiga flikar blandar fördelning, granskning och administration. Rapportens föreslagna navigation är ännu inte användarprovad.

Källa: [UX-rapport F02](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Pröva Fördela som ingång för pågående arbete, Matris som direkt tillgänglig expertvy och samlad granskning per klass/lärare/kurs/uppdrag. Bevara senaste vy och funktionernas åtkomlighet.

## Verifiering och klart-kriterier

Låt rektor fördela vakant kurs, hitta lärares uppdrag, skapa samläsning, flytta uppdrag och förstå publiceringshinder. Jämför tid, felval och hjälpbehov före/efter på dator/telefon.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** pending — registrerat för avgränsad planering i fas 05.1. Ingen ny krav-/fasacceptans eller installation. [Samlad uppföljning](../../research/TJANST-UX-2026-10-29-TODOS.md).
