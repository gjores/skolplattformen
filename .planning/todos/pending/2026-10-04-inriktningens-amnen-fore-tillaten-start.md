---
created: 2026-10-04
title: Analysen ska fånga inriktningens nivåer före inriktningens tillåtna start
area: programplan
files:
  - web/lib/programplan-analysis.ts
  - web/lib/programplan-terms.ts
---

## Problem

Användarfynd 2026-10-04: I en programplan för samhällsvetenskapsprogrammet (inriktning Samhällsvetenskap) ligger Geografi nivå 1 i Åk 1 HT/VT. Analysen säger inget om det.

Regel (verifierad mot författningstext 2026-10-03, rkrattsbaser.gov.se): **Gymnasieförordningen 4 kap. 2 §** anger att de nationella inriktningarna inom estetiska programmet, frisör- och stylistprogrammet, industritekniska programmet och naturbruksprogrammet får börja det första läsåret. Övriga inriktningar får börja det andra eller tredje läsåret. Enligt 7 kap. 6 § fördelas eleverna på dessa inriktningar inför det andra eller tredje läsåret.

## Solution

- I `programplan-analysis.ts` ska rader med `part: 'orientation'` som har poäng i Åk 1 HT/VT ge en avvikelse, utom när programmet är ES, FR, IN eller NB. Avvikelsen ska ange regeln, nivåerna som berörs och åtgärden ”Flytta till åk 2 eller 3”.
- Förslag: kategori `fel`, så att planen inte kan markeras som klar för beslut. Regeln är uttrycklig. Användaren bestämmer kategorin i diskussionen inför planen.
- Regeln gäller bara inriktningens del. Samma ämne i en annan del, till exempel gymnasiegemensam Historia, påverkas inte. Raderna skiljs redan åt med `part`.
- Programkoderna ska ligga i en regeltabell med källhänvisning, samma mönster som för yrkesprogrammens poängsumma (05-17).
- Prov: ett modellprov för SA med en inriktningsnivå i åk 1 (avvikelse), ES med samma placering (ingen avvikelse) och SA med placering i åk 2 (ingen avvikelse). Handbokssidan om programplanens analys ska uppdateras.

Öppet: Det är inte undersökt om Skolverket i praxis godtar att en skola med bara en inriktning lägger inriktningsämnen i åk 1. Förordningstexten ger inget sådant undantag.

Status: gap fångat. Inget är genomfört. Kan planeras tillsammans med 05-17 efter 05-19.
