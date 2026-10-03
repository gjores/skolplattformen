---
created: 2026-10-03
title: Skapa timplaner från programplaner med redigering för rektor och skoladministratör
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

Användaren vill kunna nå möjligheten att skapa timplaner direkt från programplanerna. Timplanen ska baseras på den valda programplanen och kunna redigeras av rektor eller skoladministratör för den berörda skolan. Detta är nästa önskade flöde efter programplansarbetet och ska beaktas i återstående fas 5-planering.

## Solution

- Lägg en tydlig handling ”Skapa timplan” i programplansvyn. Utgå från vald programplan och visa vilket underlag som används innan timplansutkastet skapas.
- För över programmets relevanta ämnen/nivåer och bevara en beständig koppling till exakt programplansversion och utbildning. Precisera vilka programplanstillstånd som får användas vid planeringen.
- Låt rektor och skoladministratör redigera undervisningstid och dess fördelning inom sitt aktuella skolmandat. Programplanens poäng och timplanens undervisningstid ska visas som skilda mått; en omräkningsregel får inte antas utan beslutat underlag.
- Visa och öppna tillhörande timplaner från programplanen. En ändrad programplan får inte tyst skriva om tidigare timplaner; planera uttrycklig hantering av nya versioner och avvikelser.
- Kontrollera skapande och redigering på servern även vid direkta anrop, med skol-/kundgräns, aktuell behörighet, revision och obligatorisk audit. Skilj redigeringsrätt från fastställande och bevara explicita klass–timplanskopplingar.
- Samordna med [delegation av programplansarbete](2026-10-03-huvudmannen-delegerar-programplansarbete-till-skolorna.md) och schemadelprojektets versioner, ID:n och tidsenheter. Uppdatera handboken vid genomförandet.

## Verification

- Från en programplan skapar behörig personal ett timplansutkast med rätt ämnen/nivåer och exakt källversion. Utkastet kan återfinnas och öppnas från programplanen efter omläsning.
- Både rektor och skoladministratör kan redigera och spara timplanen för sin skola. Annan skola/kund och återkallat uppdrag nekas även genom direkta API-anrop.
- Programplansändring bevarar äldre timplaner och klasskopplingar. Konkurrerande ändringar ger begriplig konflikt; auditfel stoppar ändringen.
- Prova hela programplan → skapa timplan → redigera → spara → öppna igen på dator och telefon, inklusive mänskligt begriplighetsprov.

Status: **pending**. Användarbeställt behov; genomförande och verifiering återstår.
