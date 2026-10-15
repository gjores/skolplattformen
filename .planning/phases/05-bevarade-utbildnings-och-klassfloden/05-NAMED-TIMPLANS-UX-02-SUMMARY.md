---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-02
status: complete_isolated_sql
completed: 2026-10-15
subsystem: database
gap: CLASS-COHORT-UX-01
requires: []
provides:
  - Additiv serieidentitet med bevarad gammal kedja och stängd metadata
  - Schema-only-provdatabas utan export av användarrader
  - 112 SQL-kontroller med full rollback
key_files:
  - supabase/migrations/20261015200000_named_timplan_series.sql
  - supabase/tests/phase5_named_timplan_series.test.sql
  - work/pilot/verify-named-timplan-series.mjs
  - work/pilot/named-timplan-snapshot.mjs
---

# NAMED-TIMPLANS-UX-02: additiv serieidentitet

Timplansversioner får en stabil serie per tidigare utbildning/skola. Alla gamla unika begränsningar består; parallella timplaner aktiveras först med de senare serieavgränsade kommandona och besluten.

## Genomförande

- `timplan_series` har kundanknytning via huvudman, sammansatt utbildnings-/skol-FK, namn, normaliserat namn, revision och en uttrycklig `legacy_default` per utbildning/skola. Tabellen har tvingad RLS och inga direkta klient-/Workergrants.
- `timplans.series_id` backfylls utan att ändra gamla kolumner. Den nya serien benämns Grundfördelning; befintliga `name_at_creation` förblir NULL eftersom historiska namn saknas. Serieobjektets nya tidsstämplar beskriver införandet, inte gamla planers tillkomst.
- Backfill hanterar endast tre namngivna triggers och återställer deras exakta tidigare aktivering. Gamla definitioner, alla gamla index och gamla versions-/beslutsspärrar består.
- Gamla inserts utan serie-ID finner eller skapar uttrycklig defaultserie. En annan namngiven serie väljs aldrig godtyckligt. Ny version får en oföränderlig namnögonblicksbild. Versionsbyte lämnar klassens tidigare länk kvar.
- Namn tillåter 1–80 Unicodekodpunkter, endast U+0020 trimgränser, inga Cc/Cf/Cs, ingen NFC eller kollaps av inre blanksteg. SQL `lower(name)` styr unikhet inom utbildning/skola; klienten behöver inte efterlikna PostgreSQLs gemenhantering.

## Verifiering

`node work/pilot/verify-named-timplan-series.mjs --out /private/tmp/named-timplan-series-02-schema-tenth.json` gav **PASS, 112 kontroller**. `node --check` passerade för båda nya MJS-filerna.

- 54 schema-/migrerings-/namn-/behörighetskontroller, inklusive 294 faktiska SQL/Node Unicodeprober och skilda PostgreSQL-avslag för ensamma surrogater respektive NUL.
- 29 befintliga klass-/beslutsregressioner för SA25 och 29 för BF25. Gamla skapa–skicka in–fastställa–koppla–byta version-flöden provades efter den additiva migrationen.
- Alla gamla kolumner i **62 publictabeller** var exakt oförändrade över själva migrationen i den syntetiska fixturen. Tomma, enkla och flerledade kedjor samt GY/GR/IM ingick. Original-ID:n, beslut, celler, länkar och tidsstämplar ingår i projektionen.
- Full rollback återställde samtliga 62 tabeller, schema, ACL, triggers, index och migrationsjournal i provdatabasen. 57 källfiler hashbundna före/efter. Faktiska DB-roller anon, authenticated, service_role och skolplattform_worker nekades direkt läsning/skrivning/anrop till de nya privata objekten.
- Privat provdatabas och dump raderades. Låsen hölls 37 567 ms i **den separata provdatabasen**, inte i användarens aktiva mål. Inga processtarter/-stopp, IdP-åtgärder eller användarklassmutationer gjordes.

Rapportens SHA256: `a0d518afb0970b62fea9d5f5f3f74b64e9daf75ee8e1eadd8548928f6a9e57a7`.
Privat proveniens-/cleanupjournal: `/private/tmp/named-timplan-snapshot-YEWuIu/journal.json`.

## Provets proveniens och begränsningar

Provet använder PostgreSQL 17.6 och en separat lokalt namngiven databas. `assertTarget('protected')` verifierar källa och localhost. En läsande konsekvent snapshot exporterar **enbart struktur**, avgränsat till public/auth/supabase_migrations/extensions. Inga verksamhets-, identitets-, sessions-, token- eller journalrader exporteras. Alla återställda public- och auth-tabeller kontrolleras tomma innan det publika katalogseedet från repot och de granskade syntetiska fixturerna används.

Befintliga publika tabeller, funktioner, ägare, kolumner, constraints, index, triggers, policyer och ACL jämförs semantiskt mot källan. Endast ägarens implicita/explicita standard-ACL och exakt två historiska associativa AND-uttryck normaliseras. Auth-definitionerna ägs av den lokala provdatabasägaren; framtida standardprivilegier för andra DB-ägare utelämnas eftersom lokala postgres inte får anta Supabase-adminrollen. Detta är inte ett bevis för full klusterlikhet, auth/OIDC eller verklig kommunanslutning.

Ingen permanent migration har installerats. Ingen fysisk flersessionskonkurrens påstås. Slutkontroll av migrationen över användarens befintliga rader, faktiskt Worker/API/browserprov och kontrollerad lokal leverans återstår i paketets slutverifiering. Slutprovet bevisar bevarande av **syntetiska fixturrader**, inte att en migration redan har gjorts över användardata.

## Avvikelser och tidigare utfall

1. Första direktprovet mot det aktiva målet fick förändrade app_sessions/security_events när den öppna appen samtidigt gjorde läsningar. Det är ett inkonklusivt bevarandeprov; schemafingeravtrycket återställdes. Rapporten `named-timplan-series-02-first.json` behålls.
2. Ett tidsbegränsat låsprov avbröts med PostgreSQL 40P01 under DDL. Full originaltabell-/schema-/ACL-/journalrollback verifierades, låstid 21 739 ms. Rapporten `named-timplan-series-02-locked.json` behålls. Inga ytterligare låstunga prov görs mot det aktiva målet.
3. Automatisk godkännandegranskning avvisade en fullständig datakopia eftersom en sådan export kunde exponera känsliga uppgifter och saknade uttryckligt användargodkännande. Kommandot kördes aldrig. Lösningen ersattes med schema-only-export och repots syntetiska data; ingen full dataexport genomfördes och inget sådant tillstånd antas.
4. De första schema-only-körningarna rättade återställningsmiljön (ägare, tomt publicschema, tillägg och främmande ägares standard-ACL), snäv schemakanonisering samt testharnessens Result-array/NUL-felkod. Samtliga tidigare FAIL-rapporter finns kvar; samtliga egna provdatabaser/dumpar städades. Migrationen behövde inte kringgå produktens guards eller rättigheter för att passera.

## SS 12000 och nästa steg

SS 12000:2024/OpenAPI 2.1.0 enligt paketets mappning: den namngivna serien är intern planeringsmetadata. Klass-ID, organisation, giltighet, elevrelationer och skrivansvar ändras inte. Ingen timplansserie anges som verifierat standardobjekt eller nytt standardutbyte.

Plan03 kan bygga seriekommandon på det additiva schemat. Plan04 måste ändra skapande, beslut och index tillsammans innan parallellitet aktiveras. Commit/push och övergripande STATE sköts av samordnaren. Inga fulla krav eller hela fas 5 stängs genom denna plan.
