---
created: 2026-10-21
title: Timplaner för IM säger att kalendern saknas trots fastställd kalender
area: timplaner
status: done
phase: "05.1.1"
resolved_by: 05.1.1-14
files:
  - web/app/protected-timplan-workspace.tsx
  - supabase/migrations/20261020120000_tjanst_plan.sql
---

## Problem

Fynd från det faktiska provet i 05.1-09: för en IM-klass med fastställd kalender visar Timplaner fortfarande ”Veckoram. Kalender och individuell fördelning saknas; inga årstimmar beräknas.” (`protected-timplan-workspace.tsx:328`). Tjänstefördelning räknar samtidigt IM-behovet ur kalendern (timmar per vecka × skoldagar). De två vyerna säger alltså olika saker om samma klass.

Texten är från fas 5 och skrevs innan IM-behov kunde räknas ur kalendern. Den är inte ändrad i 05.1.

## Solution

- Avgör vad texten ska säga när kalendern är fastställd: att årstimmarna räknas ur kalendern (och var de syns), eller bara att den individuella fördelningen saknas.
- Visa den gamla texten bara när kalendern verkligen saknas. Ange inte siffror som Timplaner inte själv räknar.
- Kontrollera att texten stämmer med Tjänstefördelning och med handboken `docs/handbok/timplaner.md`.
- Lägg till ett prov för IM med och utan fastställd kalender.

Status: gap fångat. Ingen kod är ändrad.

## Löst i 05.1.1-14 (2026-11-11)

Timplaner läser kalenderns sammanfattning (`/api/lasar/sammanfattning`, plan 13) i `web/app/lasar-im-weekly-note.tsx` och visar texten ur `lasarImWeeklyText`, samma version och skoldagar som tjänstefördelningens IM-behov räknar med:

- med fastställd kalender: ”Veckoram. Läsårskalendern {läsår} är fastställd (version {n}, {skoldagar} skoldagar). Individuell fördelning visas inte här.”
- utan fastställd kalender: ”Veckoram. Läsårskalendern för {läsår} är inte fastställd. Inga årstimmar beräknas.”
- vid läsfel: ”Veckoram. Läsårskalendern kunde inte läsas.” utan siffror.

Timplaner räknar fortfarande inga årstimmar för IM. Prov: `web/e2e/lasar-basis.spec.ts` (simulerat, fyra bredder). Handboken `docs/handbok/timplaner.md` uppdateras i plan 15. Inget är installerat; den faktiska kedjan provas i plan 15 och installationen sker i plan 16.
