---
created: 2026-10-01
title: Handledning för rektor om timplanens regelverk
area: timplaner
files:
  - web/app/protected-timplan-workspace.tsx
  - web/lib/timplan-model.ts
  - docs/handbok/timplaner.md
---

## Problem

Användaren betonar 2026-10-01 att rektor behöver tydlig handledning om regelverket kring timplanen. Den skyddade vyn visar timmar och tillåter celländringar, men ger ännu ingen samlad regelvägledning. Handboken beskriver redan att cellkontrollen inte kontrollerar hela undervisningsramen. Ett sparat värde får inte uppfattas som ett bevis på att planen uppfyller regelverket.

## Solution

- Ge handledning direkt i timplansvyn och vid ändring, med fördjupning i handboken. Förklara vad tiden avser, vilka ramar som gäller och vad ändringen innebär för den valda planen.
- Skilj grundskolans timmar per ämne och stadium från introduktionsprogrammets undervisningstid per vecka och individuella studieplan. Gymnasiets programplan och poäng behöver egen vägledning; poäng är inte timmar.
- För grundskolan: förklara garanterad undervisningstid, stadie- och ämnesgruppsramar samt skolans val, inklusive begränsningar och undantag. Kontrollera aktuell författning, övergångsregler och vilken elevkull reglerna gäller innan regelvärden införs.
- Förklara ansvar och beslut med verifierat rättsligt stöd. Skilj rektors lagstadgade ansvar från appens arbetsflöde med utkast, förslag och huvudmannens beslut; nuvarande behörighetsmodell är inte en rättskälla.
- Visa begriplig konsekvens vid ändring: berörd ram, eventuell avvikelse, återstående underlag och nästa åtgärd. Skilj sparat utkast, kontrollerad plan och fastställd version. Visa tydligt när en regel ännu inte kontrolleras.
- Datera och versionshantera regelunderlag med länkar till Skolverket och relevanta författningar. Syntetiska användarprov är inte godkända nationella timplansfördelningar.
- Planera serverkontroll av de regler som införs, inklusive fastställande, så att en klientvarning inte blir enda skyddet. Dokumentera uttryckligt vilka regler som automatiseras och vilka som kräver bedömning.

## Verification

- Rektor kan på dator och telefon hitta tillämpliga regler och förklara en ändrings konsekvens utan att lämnas att tolka enbart siffror.
- Pröva giltig fördelning, underskriden ram, skolans val med tillämpliga undantag, saknat underlag och fel regelversion/elevkull. Prova introduktionsprogram separat.
- Kontrollera att text, regelberäkningar, serverbesked och handbok stämmer överens; kör dokumentationsbygge vid genomförande. Registrera användarprov och kvarstående begränsningar i GSD.

## Sources

Kontrollerade som primära utgångspunkter 2026-10-01; detaljer och författningshänvisningar behöver granskas i genomförandeplanen:

- [Skolverket: Timplan för grundskolan](https://www.skolverket.se/undervisning/grundskolan/timplan-for-grundskolan).
- [Skolverket: Anordna skolans val](https://www.skolverket.se/styrning-och-ansvar/anordna-utbildning/anordna-utbildning-pa-grundskoleniva/anordna-skolans-val).
- [Skolverket: Undervisningstid, lärotider och schema](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/undervisningstid-larotider-och-schema).

Status: användarbeställd vägledning fångad för planering. Genomförande, fullständig rättslig granskning och verifiering återstår. Ingen ändring av mandat eller utökad automatisk regelkontroll är genomförd.
