---
created: 2026-09-12T16:40:00.000Z
title: Läsårslins: ställa sig i ett läsår som i Plan Digital
area: planering
status: pending
phase: "05"
requirements: [PLANERING-01, PLANERING-02, PLANERING-04, PLANERING-05]
files:
  - docs/plan-digital-lasarsmodell.md
  - web/app/organisation-workspace.tsx
  - web/app/timplan-view.tsx
  - web/lib/timplan-model.ts
  - supabase/migrations/20260905120000_huvudman.sql:138
  - supabase/migrations/20260908120000_cohorts_classes.sql
---

## Senare beslut och genomförandeplan 2026-10-06

Användaren har beställt en GSD-plan efter förtydligandet att valt läsår ska följa med inom **planeringen**, medan elevregister/löpande administration behåller sitt eget urval. Nya och fortsättande kullar ska ses tillsammans för valt år. [Besluten](../../phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-CONTEXT.md), [färsk inventering](../../phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-DISCOVERY.md) och [05-36–43](../../phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-IMPLEMENTATION.md) ersätter de äldre genomförandeförslagen nedan.

Automatiska klasskopplingar, backfill från fritext och ett globalt appår med gemensam statusmaskin ingår inte. Befintliga klass–läsår–timplanskopplingar och aktuella planlås bevaras. Individuella studieplaner, grupper/tjänst och schema får gemensamma framtida kontrakt, men byggs inte i första årsöversikten. Den separat beställda [sökbara tabellöversikten](2026-10-06-tabelloversikter-med-sokning-filter-och-sortering-for-planer.md) samordnas i samma paket.

Status: **planerad, inte genomförd**. Todon förblir pending tills faktisk leverans och dess verifiering finns. Observationerna från 2026-09-12 nedan är historik och ska inte användas som nulägesbevis.

## Historiskt problem och förslag från 2026-09-12

Användaren vill kunna "ställa sig i olika läsår" som i Plan Digital: ett globalt läsårsval (`‹ 26/27 ›`) med status och lås per år, där varje timplan är en kull-matris (startår, sex terminskolumner HT26/VT27 … märkta *Pågående läsår, åk 1 | Nästa läsår, åk 2 | Framtida år, åk 3*), årskursen härleds (läsår − startår + 1), listor delas i Aktuella/Framtida/Arkiverade, klasser kopplas till timplan automatiskt ur sitt startår, och tjänstefördelningen är snittet läsår × kull.

Appen har i dag ingen läsårslins: `offerings.cohort` är fritext, timplanen har `ar1/ar2/ar3` utan HT/VT, `class_timplans` kopplas för hand, status `planerad/aktiv/avvecklas` sätts för hand och tjänsterader saknas helt. Kullkopieringen (`Kopiera till ny elevkull`, provad och godkänd i fas 1-checkpointen steg 3) gör rätt sak men saknar linsen runt sig.

Fullständiga observationer och jämförelsetabell: `docs/plan-digital-lasarsmodell.md` (läsande granskning 2026-09-12 + `~/dev/playwright/plandigital-spec`).

## Historiskt lösningsförslag, ersatt av senare beslut

Sex steg i stigande storlek (se dokumentet):
1. `start_year` som heltal på utbildningen, `cohort`-text härledd; migration med återfyllning.
2. Läsårsväljare i sidhuvudet som kontext för huvudman/rektor, med läsårsstatus per skolenhet (Planering pågår → Tjänstefördelning pågår → Publicerad → Stängd → Arkiverad) som styr skrivrätt tillsammans med rollen.
3. Härledd årskurs och flikarna Aktuella/Framtida/Arkiverade.
4. Terminskolumner T1–T6 i gymnasietimplanen med läsårsmärkta rubriker, summa per termin/år och veckotid ur läsårets skoldagar (finns redan i `school_years`).
5. Automatisk klass → timplan-koppling ur startår; `class_timplans` blir override för undantag (omläsning, individuell studiegång).
6. Tjänsterader per läsår (kurs × klass × lärare, tid, behörighet, samläsning) — ny modul, beroende av uppdragsmodellen i fas 3 och todon om behörighets-API.

Steg 1–3 ger "ställa sig i ett läsår" med liten insats och bör in i färdplanen som egen fas eller som tillägg till den fas som rör timplaner. Rör inte fas 1.
