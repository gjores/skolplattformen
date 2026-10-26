---
created: 2026-10-07
title: Migrera från Plan Digital och ersätt exporterna (BIA, SCB, Skolinspektionen)
area: integration
status: pending
proposed_requirements: [MIGR-01, MIGR-02, MIGR-03]
related_requirements: [INT-03, MODUL-03, OPS-04]
phase: "förslag: ny fas efter 05"
files:
  - .planning/research/PLAN-DIGITAL-ERSATTNING-2026-10-07.md
---

## Användarbeslut

2026-10-07: Skolplattformen ska helt ersätta Plan Digital. Schemat ska ligga i appen, så exporterna till Skola24 Schema och Royal Schedule behövs inte. Exporterna används i dag för BIA och för schemaläggning. Gy11 släpps, och Skolplattformen börjar med läsår 27/28 (förslag, se nedan).

## Förslag på krav

- **MIGR-01**: Skolplattformen kan läsa Plan Digitals exporter (tjänstefördelningsöverblick, matris lärare–klass–kurs, tjänsteanalys) med granskning, radfel och omkörning enligt samma princip som INT-03. Lärarens signatur är nyckel; personnummer läses inte in.
- **MIGR-02**: Appen kan exportera de uppgifter som BIA behöver. Fälten är inte kartlagda och måste fastställas med mottagaren. SCB- och Skolinspektionsrapporterna ersätts bara om de används i dag.
- **MIGR-03**: Historik (arkiverade timplaner, tidigare års tjänstefördelning) migreras eller arkiveras som export enligt beslut.

## Övergång i tre steg (förslag)

1. Plan Digital är källsystem. Skolplattformen läser exporterna för analys och som migreringsunderlag.
2. Läsår 27/28 planeras i Skolplattformen. Läsår 26/27 ligger kvar i Plan Digital. 2024-kullen läser Gy11 under 26/27 (slutsats ur kurskoderna, inte kontrollerad mot Skolverket) och är klar i juni 2027.
3. Plan Digital stängs när exporterna och schemat i appen fungerar.

## Öppna frågor

- Vem i AcadeMedia beslutar om Plan Digital och berör ett byte fler enheter än LBS? När går avtalet ut?
- Vilka fält behöver BIA? Används SCB- och Skolinspektionsrapporterna?
- Behöver historik flyttas med?
- Plan Digitals inställningar Tid och räknesätt gick inte att läsa. Exportera eller fotografera dem.
- Personal- och behörighetsuppgifter i migreringen kräver rättslig grund och skydd. Rådgör med dataskyddsombud före import.

**Status: pending.** Ingen import eller export är byggd eller provad.
