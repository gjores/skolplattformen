# Phase 4: Beständigt och skyddat elevregister - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-27
**Phase:** 04-best-ndigt-och-skyddat-elevregister
**Areas discussed:** Elevens uppgifter och skyddad identitet, Placering och klasshistorik, Källa/rättelse/konflikter, Sökning/urval/export, Fakturering (tillagt av användaren)

## Todos
Vikt: Läsårslins (Plan Digital). Övriga granskade och kvar i kön.

## Fakturering till hemkommuner (användarens tillägg)
| Option | Selected |
|---|---|
| Underlaget i fas 4, faktureringen egen fas | ✓ |
| Ta med faktureringen i fas 4 | |
| Bara en todo, inget underlag nu | |

## Elevens uppgifter och skyddad identitet
- Personnummer: **lagras, visas maskerat** ✓ (alt: bara födelsedatum+ID; fullt för administratör)
- Skyddade personuppgifter: **döljs utom för namngiven behörig** ✓ (alt: samma som andra men märkt)
- Basuppgifter: **minimal** ✓ (alt: + adress och kontakt)

## Placering och klasshistorik
- Placering: **en aktiv åt gången, daterad historik** ✓ (alt: flera samtidiga)
- Klassbyte: **ny daterad tillhörighet, utbildningen oförändrad** ✓ (alt: klassbyte för med utbildningen)
- Läsårslins: **läsårsväljare + härledd årskurs** ✓ (alt: hela linsen; bara filter)
- Hemkommun: **daterad uppgift med källa** ✓ (alt: enkelt fält)

## Källa, rättelse och konflikter
- Skrivansvar: **appen äger, varje fält märkt med källa** ✓ (alt: förbered låsta registerfält)
- Lokal rättelse vs källa: **rättelsen står kvar, avvikelsen visas** ✓ (alt: källan vinner)
- Samtidighet: **konflikt med båda värdena** ✓ (alt: neka och ladda om)
- Historik: **per elev, per fält, för administratör** ✓ (alt: bara säkerhetsloggen)

## Sökning, urval och export
- Hitta elever: **lista per läsår + sökfält + filter** ✓ (alt: endast sökning)
- Namnlika: **födelsedatum + klass + skola** ✓ (alt: maskerat personnummer)
- Återgå till urval: **urvalet i adressen** ✓ (alt: sparade urval) — orkestratorn preciserade att fritextsökordet inte läggs i adressen (namn/personnummer hamnar annars i historik och åtkomstloggar).
- Export: **välj fält ur tillåten lista** ✓ (alt: fast format)

## Claude's Discretion
Tabellmodell och migrering från fas 3:s elevprov; versionsmekanism; maskeringsformat; sidindelning; simulerad extern källa.

## Deferred Ideas
Fakturering till hemkommuner (egen fas); vårdnadshavare/adress/kontakt; resten av läsårslinsen; sparade urval.
