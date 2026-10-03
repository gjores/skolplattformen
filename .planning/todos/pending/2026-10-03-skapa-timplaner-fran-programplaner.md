---
created: 2026-10-03
title: Skapa timplaner från godkända och fastställda programplaner
area: timplaner
files:
  - web/app/protected-programplan-workspace.tsx
  - web/app/protected-timplan-workspace.tsx
  - web/lib/timplan-model.ts
  - web/lib/server/timplan-planning.ts
  - docs/handbok/programplaner.md
  - docs/handbok/timplaner.md
---

## Problem

Användaren vill kunna nå möjligheten att skapa timplaner direkt från programplanerna. Användaren preciserade 2026-10-03 att underlaget ska vara en **godkänd och fastställd programplan**. Timplanen ska baseras på den valda programplansversionen och kunna redigeras av rektor eller skoladministratör för den berörda skolan. Detta är nästa önskade flöde efter programplansarbetet och ska beaktas i återstående fas 5-planering.

## Solution

- Lägg en tydlig handling ”Skapa timplan” för en godkänd och fastställd programplan. Visa vilket underlag som används innan timplansutkastet skapas. Kontrollera även på servern att källversionen är godkänd och fastställd; ett utkast får inte användas som underlag för skapandet.
- För över programmets relevanta ämnen/nivåer och deras planerade årskurser/terminer, och bevara en beständig koppling till exakt fastställd programplansversion och utbildning. Samordna med [poängens årskurs- och terminsfördelning](2026-10-03-fordela-programplanens-poang-pa-arskurser-och-terminer.md).
- Låt rektor och skoladministratör redigera undervisningstid och dess fördelning inom sitt aktuella skolmandat. Programplanens poäng och timplanens undervisningstid ska visas som skilda mått; en omräkningsregel får inte antas utan beslutat underlag.
- Visa och öppna tillhörande timplaner från programplanen. En ändrad programplan får inte tyst skriva om tidigare timplaner; planera uttrycklig hantering av nya versioner och avvikelser.
- Kontrollera skapande och redigering på servern även vid direkta anrop, med skol-/kundgräns, aktuell behörighet, revision och obligatorisk audit. Skilj redigeringsrätt från fastställande och bevara explicita klass–timplanskopplingar.
- Samordna med [delegation av programplansarbete](2026-10-03-huvudmannen-delegerar-programplansarbete-till-skolorna.md) och schemadelprojektets versioner, ID:n och tidsenheter. Uppdatera handboken vid genomförandet.

## Verification

- Från en godkänd och fastställd programplan skapar behörig personal ett timplansutkast med rätt ämnen/nivåer, planerade årskurser/terminer och exakt källversion. Utkastet kan återfinnas och öppnas från programplanen efter omläsning. Skapande från en programplan som inte är godkänd och fastställd nekas även genom direkt API-anrop.
- Både rektor och skoladministratör kan redigera och spara timplanen för sin skola. Annan skola/kund och återkallat uppdrag nekas även genom direkta API-anrop.
- Programplansändring bevarar äldre timplaner och klasskopplingar. Konkurrerande ändringar ger begriplig konflikt; auditfel stoppar ändringen.
- Prova hela programplan → skapa timplan → redigera → spara → öppna igen på dator och telefon, inklusive mänskligt begriplighetsprov.

Status: **pending**. Användarbeställt behov; genomförande och verifiering återstår.
