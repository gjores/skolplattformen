---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-UX-01
status: complete
completed: 2026-10-16
subsystem: apl-model-storage
requires: [APL-09]
provides: [persistent-preliminary-term-intent, backwards-compatible-apl-hashes]
affects: [APL-UX-02, APL-UX-03]
---

# APL-UX-01: beständig preliminär termin

En APL-period kan bära endast ett uttryckligt terminsval, utan namn, datum, veckotal, ämnen eller tidsfördelning. `plannedTermIndex` är valfritt och tar heltal 0–5; frånvaro bevarar den gamla representationen. Null, undefined, getters, extra nycklar och ogiltiga tal nekas. Det befintliga datumkravet för rektorsbekräftelse består.

Alla tre deluppgifter är genomförda. UI, faktisk HTTP/OIDC, handbok och leverans hör till efterföljande planer. Ingen aktiv databasinstallation eller ändring av 3012 är gjord här. Commit/push samordnas av huvudagenten; inga andra ändringar har versionshanterats av denna executor.

## Kontrakt och exakt delta

`web/lib/apl-plan.ts` behåller `structured_v1`. Bara ett uttryckligt terminsval lägger till periodpayloadens nionde komponent `['planned_term_v1', index]`. Tidigare åttafältsarrayer och journalernas ordnade requestbytes är exakt oförändrade. Ändrat terminsval ändrar innehållshashen och gör en tidigare rektorsbekräftelse inaktuell; den gamla bekräftelsehändelsen bevaras.

Ny framåtriktad migration `supabase/migrations/20261016130000_apl_term_intent.sql`:

- En nullable `smallint`-kolumn `apl_plan_periods.planned_term_index`, utan default eller backfill.
- En CHECK `apl_plan_periods_planned_term_index_check` för 0–5.
- Exakt fem ersatta funktionskroppar: `phase5_apl_plan_parse`, `phase5_apl_plan_value`, `phase5_apl_hash_payload`, `phase5_apl_plan_command`, `phase5_apl_copy_structure`.
- Befintliga kolumner, funktionernas metadata, grants, RLS, index, triggers och övriga constraints bevaras. Sparvägen och kopieringens separata INSERT inkluderar fältet. SQL-null utelämnar JSON-nyckeln.

Funktionsdiffen är avgränsad till optional validering, villkorlig JSON-/hashutökning och två INSERT-kolumner/värden. Alla mandat-, lås-, CAS-, replay-, permit-, audit- och bekräftelsegrenar består. Rootens `assertStructureTransition` har separat passerat mot de faktiska före-/efterstrukturerna.

Migrationens SHA-256: `d34d97c7ca58d5692c884dada2c4bbe297499e9510302bc8f90d0091c20ee8dc`.

## Verifiering

Modell/journal: RED 41/44, tre nya avsedda fel före implementation; GREEN **44/44**. `node --test lib/*apl*.test.mjs` passerar också 44/44. Typkontroll och riktad oxlint passerade. Gamla fasta värden mättes före kodändring och verifieras nu som regression:

- Canonical planhash: `sha256:24d0575aafd111a9e5703d8686269ee0ca92ca709c94d237500f985c84f30d60`.
- Innehållshash: `sha256:712b6f8b5c78706128cda90bcb56d3d5c9fa11329d38f5073f3c9d574a371907`.
- Journalrequesthash: `sha256:dbbd0f5333475bc55ac67b8f49de2292112452ddd66a81d4c3dcf4258979b544`.

Ny runner `work/pilot/verify-apl-term-intent.mjs` använder en ägd schema-only-databas från den redan installerade APL-basen. De tre äldre APL-migrationerna återinstalleras inte. Gemensamma `apl-ux-fixtures.mjs` skapar en syntetisk BF-utbildning, godkänd programplan och timplansutkast. Äldre fullständig APL, rektorsbekräftelse samt huvudmannens submit/approve-kvitton skapas genom verkliga RPC före deltamigrationen.

Slutlig faktisk PostgreSQL-körning: **PASS 22 kontroller**, en observerad tvåsessionskonkurrens, full cleanup och 72 oförändrade källhashar. Följande är verifierat:

- DDL-rollback återställer exakt basstruktur, ACL och originalrader innan den ägda installationen.
- 74 originaltabellers projektion av samtliga tidigare kolumner och 199 syntetiska originalrader, inklusive tider, historik och kvitton, är oförändrade av migrationen.
- Gammalt read-svar, contentHash och aktuell bekräftelse samt exakt replay av save-, confirm- och beslutskvitton består.
- Tom namnlös terminsperiod sparas/återläses utan fabricerade datum, läsår, innehåll eller minuter. Alla sex index godtas; ogiltiga index nekas utan delskrivningar.
- TypeScript och faktisk SQL ger identiska canonical bytes, inklusive vårstartsprojektion. Terminsindex flyttas inte.
- Oförändrat innehåll ger no-op; ändrat val ändrar hash/revision. Datum saknas fortsatt som blockerare för bekräftelse.
- Stale CAS, huvudman utan skrivrätt och rektor från annan skola nekas. Framtvingat auditfel efter skrivning återställer rader, revision och kvitto.
- Namngiven kopia och ny version bevarar avsikten med nya period-ID:n och utan ärvd bekräftelse.
- Flera perioder och en exakt period över höst/vår bevarar tidsfördelningen i båda terminerna. Preliminär avsikt blir ingen ny generell förläggningsregel.
- Ett ändrat terminsval gör en tidigare aktuell rektorsbekräftelse inaktuell och behåller dess oförändrade händelse.
- Två verkliga skrivare överlappar på observerat PostgreSQL-lås. Vinnaren sparar sitt val; förloraren får `40001`, utan kvitto eller förlorad uppdatering.

Privat slutrapport: `/private/tmp/apl-term-intent-fourth.json`, SHA-256 `371b2caee1a5f8da7a11fe9c773c62f81ff753961d677b7b7a21570fb3fb9a2d`.

Schemafingerprint före: `5721a82c8d241d8854b855e17064d7ea9301a0a65a22803a104c7f8226ec101a`; efter: `a2dffcfe42f2930b16ee9b70ec48a452a45ef7f6018e35e22538d1095364b216`.

## Tidigare fel och begränsningar

De första rapporterna är bevarade, alla med full ägd cleanup:

1. `apl-term-intent-first.json`: testet återanvände ett tidigare period-ID i en annan plan och fick korrekt `23505`. Endast fixturen rättades till ett nytt ID.
2. `apl-term-intent-second.json`: tillagt test försökte skapa en ogiltig null-startkontext. Nuvarande frysta GymTimplan kräver verifierad katalog och startdatum. Null-källa går inte igenom AplContext och stödet har inte luckrats upp. Vårstart provas; okänd källas presentation hör till UI-projektionen och får inte påstås som ett sparbart SQL-underlag här.
3. `apl-term-intent-third.json`: efter 20 kontroller gav PostgreSQL internt `XX000`, ”cannot find parent statement on pldbgapi2 call stack”, i befintlig källvalidering. Fjärde körningen använde exakt samma runner och migration och passerade. Ingen produktändring eller inställningsändring gjordes för detta; orsaken till det interna miljöfelet är inte fastställd.

SQL-körningen använder riktiga syntetiska appmandat genom databasägaren. Den är inte bevis för Workerrollen, HTTP/OIDC eller mänsklig begriplighet. Dessa prov görs separat i UX-03. Gammal app kan inte tolka det nya optionalfältet när det väl skrivits, så installation och byte till testad app behöver samordnas.

## SS 12000

Avgränsningen följer paketkontextens SS 12000:2024 utgåva 4 / publicerat OpenAPI 2.1.0. Terminsavsikt är intern planering och producerar inga `CalendarEvent`, `Placement`, `Attendance`, externa ID:n eller verkliga giltighetstider. Befintliga stabila plan-/period-ID:n, skola/utbildning och skrivansvar bevaras. Ingen ny extern anslutning eller verifierad standardefterlevnad påstås.
