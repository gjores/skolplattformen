---
phase: 05-bevarade-utbildnings-och-klassfloden
package: CLASS-COHORT
status: passed
checked: 2026-10-15
scope: planning_only
implementation: not_started
---

# Plancheck — tidigare klassorganisation

**PASS för planeringen**, inte för implementation eller verksamhetsprov. Användaren har bekräftat oförändrade mandat. En GSD-planerare har skrivit elva planer och en oberoende GSD-plancheckare har granskat dem mot aktuell kod, beslutad omfattning och SS 12000-mappningen. ROOT har läst planerna och kontrollerat struktur, referenser och körväg.

## Utförda kontroller

- Elva planer i nio vågor. Beroenden finns och leder från tidigare våg; 03A/04/05 har skilda filer i våg 4 och 06 beror på alla tre.
- Två uppgifter per plan, högst fem produkt-/provfiler, verifieringsvillkor samt `truths`, `artifacts` och `key_links`. Mänsklig checkpoint har konkret prov och återupptagningssignal efter automatiserat arbete/lokal leverans.
- Samtliga planernas `@`-referenser och paketets relativa Markdown-länkar finns. Planerade nya produktfiler är deklarerade som framtida leveranser.
- Maskinell YAML-/struktur-/beroende-/länkkontroll: PASS, 11 planer, 9 vågor, inga fynd. Råresultat tillfälligt i `/private/tmp/class-cohort-plan-structure.json`.
- Den inbäddade SQL-körvägens JavaScript syntaxkontrollerad med `node --check`: exit 0. Importerade namngivna helpers finns. Körvägen har **inte körts mot databas** i planeringssteget.
- Officiell OpenAPI 2.1.0 hämtad och hashkontrollerad; schemainspektion bekräftar gruppens obligatoriska startdatum, valfria slutdatum, typen Klass och separat Meta/medlemskap. Se [källor och begränsningar](05-CLASS-COHORT-SS12000.md).
- `git diff --check` passerar för de kontrollerade planeringsändringarna.

## Fynd som rättats i planerna

1. Den gamla klasskapningsvägen måste också ge nya lokala gymnasieklasser verifierade datum/proveniens. Historiska kvitton och äldre okända datum bevaras; icke-gymnasieflöden får inte kräva Gy25-underlag.
2. Befintligt elevregister skriver medlemskap även vid utbildningsbyte. Gemensamt server-/DB-skydd ska täcka samtliga tillåtna skrivvägar och bevara historiska medlemskap.
3. Datum får inte hämtas från en hjälpares min-värde eller läsårsfallback. Paketet har ett entydigt revisionsbundet datumunderlag och gemensamt internt kontrakt.
4. Identifierade länkar använder klass-ID först. Gammal namnnyckel och uttrycklig entydig adoption bevaras; skola/namn/startläsår samt överlappande namn/tillämpningsår har dokumenterade konflikter.
5. Nya felbesked behöver hela kedjan för felkod, audit, servermappning och klienttext. Den har fått separat plan 03A.
6. Befintligt SQL-skript återinstallerar annars redan tillämpad migration. Plan01 anger nytt uttryckligt applied-läge och privat output; plan02–04 har separat rollback-körväg före permanent runner.
7. Tidig rollback med en anslutning bevisar inte verklig samtidighet. Sådana prov måste köras med separata anslutningar efter isolerad apply i plan08 och redovisas separat.

## Kvarstående genomförande

Ingen appkod, databas, lokal provserver eller handbok har ändrats i detta steg. Inga nya SQL-, API- eller browserresultat finns. Vid genomförande behöver planernas käll-/målkontroller och faktiska prov utföras; tidigare PASS ersätter dem inte. Fulla krav, fasacceptans, historiska integritetsavvikelser och verklig kommunanslutning förblir separata.

Nästa steg är [CLASS-COHORT-01](05-CLASS-COHORT-01-PLAN.md), följt av [paketets beroendeordning](05-CLASS-COHORT-IMPLEMENTATION.md). Inget nytt omfattningsgodkännande behövs.
