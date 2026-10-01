---
created: 2026-10-01
title: Utvärdera automatisk schemaläggning och fristående Rusttjänst
area: schema
files:
  - .planning/research/SCHEMALAGGNING-2026-10-01.md
  - web/lib/server/db.ts
  - web/lib/admin-model.ts
---

## Problem

Användaren vill ha automatisk schemaläggning som framtida USP, undersöka språkbaserat beslutsstöd och bedöma stegvis introduktion av Rust i backenden. Royal Schedule / SchoolSoft AI Schema kan bli tillgängligt för provning genom användaren.

## Solution

- Använd produktjämförelsen och provfallen i [researchunderlaget](../../research/SCHEMALAGGNING-2026-10-01.md).
- Prova Royal i en isolerad provorganisation med syntetiska uppgifter. Dokumentera produktvariant och vilka funktioner som faktiskt finns på kontot.
- Bedöm obligatoriska regler, önskemål, undervisningsminuter, kalenderperioder, valgrupper, manuella ändringar och hur mycket ett befintligt schema behöver ändras vid nya förutsättningar.
- Bekräfta möjligheten att använda schemaberäkningen genom partner-API. Ett SS12000-API för schemadata är inte i sig ett beräknings-API.
- Jämför extern produkt med en egen fristående motor, exempelvis CP-SAT eller FET, med samma underlag och verksamhetsmått. Utred integration och licens innan motorval.
- Bedöm Rust genom en avgränsad tjänst/prototyp och uppmätta resultat. Planera ingen hel backendomskrivning utan ett separat beslut.
- Bevara gymnasiets program-/nivåflöden, klass–timplanskopplingar samt plattformens mandat och säkerhetslogg.

## Status

Offentlig research och provplan färdiga 2026-10-01. Ingen inloggad produktprovning, motorprototyp eller verklig integration genomförd. Framtida planeringspunkt; pågående fas 5 och godkänd färdplan ändras inte. Testinloggning är ännu inte tillgänglig i denna uppgift.
