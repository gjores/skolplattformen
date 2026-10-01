---
created: 2026-10-01
updated: 2026-10-01
title: Sammanhängande schemamoduler med Rust och AI-stöd
area: schema
files:
  - .planning/research/SCHEMALAGGNING-2026-10-01.md
  - .planning/research/SCHEMAMODUL-PROJEKT.md
  - .planning/REQUIREMENTS.md
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CONTEXT.md
  - web/lib/server/db.ts
  - web/lib/admin-model.ts
---

## Problem

Användaren vill utveckla schemaläggning som ett sammanhängande delprojekt med programplaner, timplaner, individuella studieplaner, grupper och kalender. Roller, regler och gemensamma kontrakt behöver förberedas redan nu. Rust och Jev eller liknande AI ska ingå i själva schemamodulen. Det ska gå att kombinera valda delar av olika interna och externa moduler. Royal Schedule / SchoolSoft AI Schema kan bli tillgängligt för provning genom användaren.

## Solution

- Följ [delprojektets inriktning, krav och planeringssteg](../../research/SCHEMAMODUL-PROJEKT.md). Första steg S1 tar fram gemensamt informations-/modulkontrakt, operationsbundna mandat, uttrycklig regelmodell och syntetiska acceptansfall.
- Beakta versionsbundna planreferenser, stabila ID:n och informationsansvar i återstående fas 5-planering; bygg ingen separat konkurrerande program-/tim-/studieplansmodell för schemat.
- Prova Rust genom en körbar avgränsad komponent och AI genom konfliktprioritering/åtgärdsval inne i schemaberäkningen. Jämför med/utan Jev och med annat relevant AI-alternativ. Detta avser inte enbart researchgranskning.
- Definiera och pröva valbara delar för planunderlag, regler, motor, AI, redigering, publicering och adapter. Dokumentera faktisk förmåga och nekad användning vid oförenliga kontrakt.
- Använd produktjämförelsen och provfallen i [researchunderlaget](../../research/SCHEMALAGGNING-2026-10-01.md).
- Prova Royal i en isolerad provorganisation med syntetiska uppgifter. Dokumentera produktvariant och vilka funktioner som faktiskt finns på kontot.
- Bedöm obligatoriska regler, önskemål, undervisningsminuter, kalenderperioder, valgrupper, manuella ändringar och hur mycket ett befintligt schema behöver ändras vid nya förutsättningar.
- Bekräfta möjligheten att använda schemaberäkningen genom partner-API. Ett SS12000-API för schemadata är inte i sig ett beräknings-API.
- Jämför extern produkt med en egen fristående motor, exempelvis CP-SAT eller FET, med samma underlag och verksamhetsmått. Utred integration och licens innan motorval.
- Bedöm Rust genom en avgränsad tjänst/prototyp och uppmätta resultat. Planera ingen hel backendomskrivning utan ett separat beslut.
- Bevara gymnasiets program-/nivåflöden, klass–timplanskopplingar samt plattformens mandat och säkerhetslogg.

## Status

Offentlig research, Royal-provplan och sammanhängande projektinriktning dokumenterade 2026-10-01. SCHEMA-01–08 är registrerade som framtida produktkrav med ansvar i S1–S4 och ännu ej provade verifieringsmål. Ingen inloggad produktprovning, Rust-/motor-/AI-prototyp eller verklig integration genomförd. Fas 5 ska beakta kompatibilitetsgränserna nu; pilotens åtta faser och 42 v1-krav behålls. Testinloggning är ännu inte tillgänglig i denna uppgift.
