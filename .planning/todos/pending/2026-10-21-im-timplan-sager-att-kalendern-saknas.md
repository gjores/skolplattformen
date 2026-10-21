---
created: 2026-10-21
title: Timplaner för IM säger att kalendern saknas trots fastställd kalender
area: timplaner
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
