---
created: 2026-09-13T08:27:53.469Z
title: Planera stark identitetskontroll och BankID
area: auth
files:
  - .planning/REQUIREMENTS.md
  - .planning/phases/02-verifierad-konto-tkomst/02-CONTEXT.md
  - docs/kommunintegration-och-sakerhet.md
---

## Problem

Plattformen ska kunna hantera särskilt känsliga personuppgifter och viktiga myndighetsbeslut. Användaren vill att federerad inloggning kompletteras med planerat stöd för stark identitetskontroll, inklusive BankID. Detta är ett utrednings- och planeringsönskemål, inte verifierade lagkrav, ett beslut om viss tillitsnivå eller beställning av implementation i aktuell fas 2.

## Solution

- Kartlägg känsliga uppgifter och beslutsflöden.
- Bedöm identitetskrav per åtgärd tillsammans med ansvariga funktioner.
- Förbered stöd för BankID vid inloggning eller extra verifiering inför en viss åtgärd.
- Håll identitetskontroll separat från roll, behörighet och beslutsmandat. Styrkt identitet tilldelar inte automatiskt något uppdrag.
- Utred elektronisk underskrift separat från inloggning och extra identitetskontroll.
- Säkerställ skyddad spårbarhet för aktör, tidpunkt och det beslutsunderlag som användes, med avgränsad åtkomst och utan onödiga känsliga uppgifter i loggen.
- Planera alternativ för personer utan BankID och vid driftavbrott.
- Granska upplägget med verksamhet, dataskydd och säkerhet; planera och testa ett helt känsligt beslutsflöde med syntetiska uppgifter innan verklig användning.

Utredningen ska mynna ut i dokumenterade krav, alternativ, beroenden och provfall. Samordna med fas 2:s identitetsmodell, fas 3:s mandat samt fas 7–8:s faktiska anslutnings- och driftbeslut. Utöka inte deras godkända omfattning utan ett uttryckligt planeringsbeslut.
