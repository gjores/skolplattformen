---
created: 2026-10-29
title: "Förtydliga mobilens läsläge och verksamhetsspråk"
area: tjanstefordelning
status: pending
on_hold: true
review_before_execution: true
phase: "05.1"
report_id: F07
priority: P2
related_requirements: [TJANST-01, TJANST-07]
files:
  - web/app/tjanst-workspace.tsx
  - web/app/tjanst-views.tsx
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Aktuell prioritering2026-10-30

**Vilande före ny beställning.** Användaren upplever tjänstefördelningen som i stort klar. Stäm av denna äldre punkt mot vad som redan levererats och [det avslutande användarprovet](../../phases/05.1-tjanstefordelning/05.1-CLOSING-USER-TRIAL.md) innan något mer genomförs. Pending nedan är historisk backloggstatus, inte ett besked om att hela problemet fortfarande finns. Nytt finputs bestäms efter provet; nästa prioritering är klassorganisation inför schema.

## Problem

Mobilen erbjuder Fördela som endast är en läslista. Per lärare visar internt Personal-ID och tomma kolumner kan sakna begriplig tomstatus.

Källa: [UX-rapport F07](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Pröva Ofördelade behov eller Läslista på telefon, flytta tekniskt ID till detaljer och visa Inga tomma kolumner. Behåll säker personidentifiering och beslutet om redigering på dator.

## Verifiering och klart-kriterier

Pröva 390 och 320 px, långa och lika namn, tomma listor, åtkomst till ID vid behov och samtliga läsvyer utan yttre sidledsrullning.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** pending — registrerat för avgränsad planering i fas 05.1. Ingen ny krav-/fasacceptans eller installation. [Samlad uppföljning](../../research/TJANST-UX-2026-10-29-TODOS.md).

**Avstämning efter42, 2026-10-30:** Per lärare har staplade tidskort, sökbart läsval och sekundära tekniska detaljer även på telefon. Övergripande mobilt språk/arbetsflöde återstår; fortsatt pending. UI298 och faktiskt88/88 samt installation6692919 PASS. Nytt användarprov återstår. [Resultat](../../phases/05.1-tjanstefordelning/05.1-42-SUMMARY.md).
