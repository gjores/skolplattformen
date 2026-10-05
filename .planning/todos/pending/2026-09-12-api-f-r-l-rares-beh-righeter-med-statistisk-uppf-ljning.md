---
created: 2026-09-12T13:20:16.326Z
title: API för lokala läraruppdrag med statistisk uppföljning
area: api
files:
  - supabase/migrations/20260905120000_huvudman.sql:111
  - supabase/migrations/20260908170000_principal_teacher_assignments.sql
  - docs/kommunintegration-och-sakerhet.md
---

## Problem

Denna uppgift avser lokala läraruppdrag och statistisk uppföljning, inte Skolverkets legitimation och undervisningsbehörighet. Den senare frågan har ett [eget planeringsspår](2026-10-05-integrera-skolverkets-lararbehorigheter.md).

Ursprunglig lucka 2026-09-12 var ett läsbart API med giltighet och historik. Aktuell kodgranskning 2026-10-05 visar att fas 3 har tillfört personbundna mandat och ett skyddat, auditerat GET `/api/kund/mandat` för den lokala syntetiska miljön. `phase3_list_mandates` visar giltiga/kommande direkta underuppdrag; detta är inte ett komplett historiskt statistikunderlag eller ett godkänt externt kommun-API. Några nya körprov gjordes inte i denna översyn.

Kvarstående frågor: hur många lärare har uppdrag per skolenhet, skolform eller läsår; hur många uppdrag har avslutats, förlängts eller ändrats över tid; vilka uppdrag saknar slutdatum; hur kan en behörig kommunintegration konsumera avgränsade uppgifter? Population, giltighet vid valt datum, källa och historik behöver preciseras för statistiken.

Behörighetsmodellen i `docs/kommunintegration-och-sakerhet.md` avsnitt 2 (identitet → medlemskap → uppdrag → rättigheter, med giltighet, källa och beslutsfattare) är förutsättningen: ett API på dagens `assignments` utan giltighet, källa och historik ger felaktig statistik.

## Solution

TBD. Riktning:
- Läs-API (serverlager, inte direkt klientåtkomst) för uppdrag per person och per skolenhet, med filter på roll, skolenhet, giltighet vid datum, och källa (kommunens personalregister vs rektorsbeslut i appen).
- Aggregat för uppföljning: antal aktiva uppdrag per skolenhet/roll/period, förändringar per period, uppdrag utan slutdatum, uppdrag som löpt ut men inte avslutats.
- Återanvänd fas 3:s personbundna giltighet, mandat och audit, och verifiera vilka historiska händelser som faktiskt kan användas för statistik. Huvudman utser rektor och rektor tilldelar läraruppdrag inom sitt mandat. Lokala uppdrag är inte myndighetsbevis för rätt att undervisa i ett visst ämne.
- Behörighet till statistiken följer samma modell: HM ser hela huvudmannen, rektor sina skolenheter; inga individuppgifter i aggregat under små tal.
- Överväg SS 12000-objekten för uppdrag/tjänstgöring som yttre format om kommunen ska hämta det.
