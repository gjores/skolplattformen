---
created: 2026-09-27T12:40:00.000Z
title: Leverantörens systemadministration: skapa kunder och första inbjudan i gränssnittet
area: auth
files:
  - .planning/phases/02-verifierad-konto-tkomst/02-CONTEXT.md
  - docs/kommunintegration-och-sakerhet.md
  - docs/handbok/kundadministration.md
---

## Problem

Efter godkänt användarprov i 03-07 (2026-09-27) saknar användaren "någon typ av supersystemadmin som kan sätta upp huvudmän och sånt".

Det som finns i dag:
- **Kundadministratören** sätter upp huvudmän, skolenheter, utser rektor, bjuder in och spärrar — men bara inom sin egen kund.
- **En ny kund och dess första kundadministratör** skapas av leverantören med en personbunden engångsinbjudan via ett CLI utanför appen (fas 2 D-04).
- Fas 2 D-12: leverantören kan agera på kundens begäran endast via en loggad nödrutin utanför appens vanliga väg, **aldrig via en generell adminvy i appen**. Säkerhetsdokumentet §2: leverantörens support ska vara tidsbegränsad, motiverad och spårbar, utan generell elevåtkomst.

Det som saknas är ett gränssnitt för leverantörens egen systemadministration.

## Solution

TBD — kräver ett uttryckligt användarbeslut som ersätter/preciserar D-12. Riktning:
- Egen funktion (t.ex. `leverantorsadmin`) utanför kundernas medlemskap; kan lista kunder, skapa kund, utfärda/återkalla första kundadmin-inbjudan, se etableringsstatus.
- **Ingen** elev-, verksamhets- eller logginnehållsinsyn i kunderna; bara uppbyggnad och status.
- Engångskod krävs; varje åtgärd skrivs till en separat leverantörslogg som kunden kan få insyn i för sina egna poster.
- Hör till fas 6 (spårbarhet/drift) enligt färdplanens avgränsning av leverantörens åtkomstväg, eller en egen fas; relaterar till RACI-todon (2026-09-13).
