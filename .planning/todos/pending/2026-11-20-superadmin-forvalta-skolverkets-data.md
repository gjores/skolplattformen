---
created: 2026-11-20
title: Superadmin förvaltar data från Skolverket
area: integration
status: pending
phase: "05.2 för provkatalogen. Övriga källor fasplaceras vid planering."
requirements: [SCHEMA-01, SCHEMA-02, SCHEMA-07]
---

Superadmin ska kunna förvalta de uppgifter som plattformen hämtar från Skolverket. Det gäller till exempel nationella provdatum, ämnen, nivåer och kurser från läroplans-API:et samt uppgifter från Skolenhetsregistret. Kartlägg vilka uppgifter plattformen använder, deras källa och var de påverkar arbetet.

- Återanvänd befintliga uppslag och importer med källans identifierare och giltighetstider. Låt superadmin jämföra nya uppgifter med dem som används i plattformen, granska ändringarna och publicera en ny version där källan används som ett versionsbundet underlag.
- Kontrollera varje källa återkommande. Visa senaste kontroll, senaste lyckade uppdatering, upptäckta ändringar och eventuella hämtningsfel i superadminvyn.
- Visa vilka skolor, planer och bokningar som berörs när en källändring påverkar ett sparat underlag. Till exempel ska ett nytt fast provdatum synas i provkatalogen och ge berörda skolor besked om vilka bokningar de behöver granska i läsårsplaneringen.

[Plan för provkatalogen](../../phases/05.2-schemamodul/05.2-SM-UXF-53-KATALOG-PLAN.md) · [Läroplansdata](../../../docs/oppna-api-skolverket.md) · [Underlag för Skolenhetsregistret](../../phases/05-bevarade-utbildnings-och-klassfloden/05-SCHOOL-REGISTRY-CONTEXT.md)
