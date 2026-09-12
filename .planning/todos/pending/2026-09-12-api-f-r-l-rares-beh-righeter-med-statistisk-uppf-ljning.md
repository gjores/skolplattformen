---
created: 2026-09-12T13:20:16.326Z
title: API för lärares behörigheter med statistisk uppföljning
area: api
files:
  - supabase/migrations/20260905120000_huvudman.sql:111
  - supabase/migrations/20260908170000_principal_teacher_assignments.sql
  - docs/kommunintegration-och-sakerhet.md
---

## Problem

Lärares behörigheter finns i dag bara som rader i `assignments`/`assignment_units` (rektor tilldelar lärare inom huvudmannen) och saknar ett läsbart API. Det går därför inte att svara på frågor som: vilka uppdrag har en lärare just nu, vid vilka skolenheter, sedan när och med vilken giltighet; hur många lärare har uppdrag per skolenhet, per skolform eller per läsår; hur många uppdrag har avslutats, förlängts eller ändrats över tid; vilka behörigheter saknar giltighetstid. Huvudman och rektor behöver kunna följa upp detta statistiskt (tjänstefördelning, tillsyn, avvikelser) och kommunens system behöver kunna hämta det maskinellt.

Behörighetsmodellen i `docs/kommunintegration-och-sakerhet.md` avsnitt 2 (identitet → medlemskap → uppdrag → rättigheter, med giltighet, källa och beslutsfattare) är förutsättningen: ett API på dagens `assignments` utan giltighet, källa och historik ger felaktig statistik.

## Solution

TBD. Riktning:
- Läs-API (serverlager, inte direkt klientåtkomst) för uppdrag per person och per skolenhet, med filter på roll, skolenhet, giltighet vid datum, och källa (kommunens personalregister vs rektorsbeslut i appen).
- Aggregat för uppföljning: antal aktiva uppdrag per skolenhet/roll/period, förändringar per period, uppdrag utan slutdatum, uppdrag som löpt ut men inte avslutats.
- Kräver att uppdrag får start-/slutdatum, källa och beslutsfattare (fas 3 enligt färdplanen: huvudman utser rektor, rektor tilldelar läraruppdrag inom sitt mandat) och att ändringar loggas på servern så att historiken går att räkna på.
- Behörighet till statistiken följer samma modell: HM ser hela huvudmannen, rektor sina skolenheter; inga individuppgifter i aggregat under små tal.
- Överväg SS 12000-objekten för uppdrag/tjänstgöring som yttre format om kommunen ska hämta det.
