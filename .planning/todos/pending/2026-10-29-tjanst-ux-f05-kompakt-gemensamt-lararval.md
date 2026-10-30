---
created: 2026-10-29
title: "Gör lärarvalet kompakt och enhetligt"
area: tjanstefordelning
status: pending
on_hold: true
review_before_execution: true
disposition: optional_polish_after_accepted_user_trial
phase: "05.1"
report_id: F05
priority: P2
related_requirements: [TJANST-01, TJANST-06, TJANST-07]
files:
  - web/app/tjanst-teacher-picker.tsx
  - web/app/tjanst-dialogs.tsx
  - web/app/tjanst-allocation.tsx
  - docs/handbok/tjanstefordelning.md
  - work/ux-review-2026-10-29/rapport.html

---

## Aktuell prioritering 2026-10-30

**Vilande, frivilligt finputs.** Användaren har godkänt samtliga U1–U8 i [det avslutande användarprovet](../../phases/05.1-tjanstefordelning/05.1-CLOSING-USER-TRIAL.md). Inget strul eller blockerande problem rapporterades. Den äldre problemformuleringen nedan är historik och bevisar inte att problemet fortfarande finns. Punkten innebär ingen ny utvecklingsbeställning och stänger inte automatiskt alla föreslagna tekniska delmål som implementerade. Ta bara upp den igen vid konkret återkoppling eller ny beställning. Klassorganisation inför schema prioriteras nu.

## Problem

Samma lärare visas som historiskt förslag och i hela listan. Dialogen upprepar identiska förslagsskäl; andel och behörighetsförklaringar tar stor plats.

Källa: [UX-rapport F05](../../../work/ux-review-2026-10-29/rapport.html). B-fynden är reproducerade mot syntetiska komponentdata, inte verifierade i inloggad 3012 eller mot verklig databas. F-punkterna är förbättringsbehov; ingen implementation följer av registreringen.

## Solution

Pröva gemensam sökbar lista med märkta förslag, korta unika skäl och detaljer vid behov. Bevara undervisning före/efter och skillnaden mellan okänd ämnesbehörighet och giltigt skoluppdrag. Samordna B03 och F09.

## Verifiering och klart-kriterier

Kontrollera dubbletter, unika skäl, sökning, långa och lika namn, del av läsår, aktivt val och synligt sparbeteende. Läraren får inte väljas automatiskt.

Planera berörda dator-/telefonflöden, meningsfulla regressioner och relevanta faktiska serverprov om skrivbeteende påverkas. Uppdatera berörd handbok och kör dokumentationsbygget vid ändrat användarbeteende. Redovisa resultat och återstående begränsningar i GSD innan todon avslutas; tidigare komponentbevis ersätter inte prov av nya ändringar.

## SS 12000 och avgränsning

Avsikten är att bevara person-, klass-, timplans- och samläsningsidentiteter, externa ID:n, giltighetstider och käll-/skrivansvar. Presentationen i sig är intern och bevisar inget standardstöd. GSD-planen ska ange tillämplig specifikationsversion och berörda objekt/relationer, eller motivera varför ändringen ligger utanför informationsutbytet. Synliggör modellkonflikter före implementation.

**Status:** pending — registrerat för avgränsad planering i fas 05.1. Ingen ny krav-/fasacceptans eller installation. [Samlad uppföljning](../../research/TJANST-UX-2026-10-29-TODOS.md).

**Avstämning30 oktober:** delvis hanterad, fortsatt pending. Sökningen rättades i36 och befintligt lärarbyte förenklades i40, med uttryckligt Spara. Den fulla väljaren för nya behov har fortfarande separata historiska förslag/manuella kandidater och upprepade skäl; en gemensam lista och unikare förklaringar återstår. [Senaste leverans](../../phases/05.1-tjanstefordelning/05.1-41-SUMMARY.md).

**Avstämning efter42, 2026-10-30:** Per lärare har sökbar, tillgänglig väljare med aktivt listval och nya tidskort. Gemensamt kandidatval i alla redigeringsflöden kvarstår; fortsatt pending. UI298 och faktiskt88/88 samt installation6692919 PASS. Nytt användarprov återstår. [Resultat](../../phases/05.1-tjanstefordelning/05.1-42-SUMMARY.md).
