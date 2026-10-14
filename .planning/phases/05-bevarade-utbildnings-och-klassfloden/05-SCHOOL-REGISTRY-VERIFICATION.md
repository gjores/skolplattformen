---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: SCHOOL-REGISTRY
requirements: [ADMIN-01]
status: passed_bounded_local
human_result: awaiting_user
verified: 2026-10-14
worker_build_revision: 970782fbf82c74e7e804eb61c7cba2a17f1becf4
---

# Verifiering av skolimport och registeruppdatering

ADMIN-01:s skyddade huvudmannaflöde är implementerat och automatiskt prövat i lokal skyddad miljö. Mänsklig användbarhetsbedömning återstår. [Bevisindex](../../../work/pilot/results/school-registry-delivery-20261014.json) innehåller rårapporternas SHA256, produktkällornas hashvärden och det levererade byggmanifestet. Rårapporter och bilder finns privat under `/private/tmp/`; de ska inte tolkas som beständig extern arkivering.

| Kontroll | Resultat och omfattning |
| --- | --- |
| SQL rollback | 62/62 PASS. Import/update/status/replay, levande mandat/identitet, ändrad källa/revision, RLS/grants och atomär rollback. Fulla ursprungliga rader i 60 tabeller samt funktioner, rättigheter och migrationsjournal bevarade. |
| Node | 23/23 PASS: gemensamt kontrakt, server, registertransport och befintliga registerreducerare. Inkluderar timeout, storleksgräns, felaktigt svar och avvisad omdirigering. |
| UI | 24/24 PASS, inga skips/omprov/flaky. 12 Chromium dator och 12 WebKit telefon. Mockade transportfel/status, kontextbyte, granskning, bevarade lokala uppgifter och faktisk fristående manualfixture utan API-nätanrop. |
| Verktyg | 4/4 PASS: felaktigt/inaktuellt bevis avvisas, exakt aktivering och begränsade sökvägar. |
| Workerpreflight | 25/25 PASS genom byggd app på 3062. Två tillfälliga funktionsgrants återställda exakt efter provet. |
| Grund och aktivering | Verifiering med rollback och sedan apply PASS. Grund `20261014120000`, aktivering `20261014121000`. Endast två entrypoints öppnade för Worker; hjälpfunktioner/tabell och klientroller förblir stängda. |
| Slutleverans | 197 byteidentiska filer, byggrevision `970782f`, frisk workerd/DB-health på 3012. Fullt nytt Workerprov 25/25 PASS på den levererade appen. |
| Ordinarie återläsning | 5/5 PASS efter verklig lokal OIDC-inloggning som huvudman: skolmenyn, befintligt organisationsnummerläge, programplanslista, timplanslista och oförändrade verksamhetstabeller. Endast läsning av verksamhetsdata. |
| Statisk kontroll/byggen | `npx tsc --noEmit`, `npx oxlint app lib`, skyddat appbygge och `npm run docs:build` PASS. Ingen publicering. |

## Vad den faktiska vägen visar

`verify-school-registry-api.mjs` anropar den byggda Workerns riktiga routes med serverlagrade provsessioner. Det är ingen ny OIDC-inloggning i själva skrivprovet. Skolverkets publika tjänst används för organisationssökning och detaljerat koduppslag; positiva import- och uppdateringsanrop går alltså genom riktig HTTP-route och publik upstream. All lokal skrivning tillhör en separat syntetisk kund som städas efteråt. En publik registerträff bevisar inte rätt att företräda huvudmannen eller en kommunanslutning.

Provet visar bland annat två samtidiga identiska importer till en skola/ett kvitto, status utan skapande, exakt replay, uppdatering nekad utan skolmandat, därefter uttryckligt testmandat, bevarad rektor/GR-årskurser/elevregisterkälla, revisions- och källkonflikt samt komplett rollback vid Worker-auditfel. Dator och telefon använder samma byggda app för granskning, uppdatering och omladdning. Inga sidfel eller horisontell sidöverströmning i dessa prov. ROOT granskade dator-/telefonbilderna.

Alla 58 ursprungliga verksamhetstabeller är identiska efter båda lyckade Workerproven. Ursprungliga audit-, identitets- och sessionsrader är separat jämförda; inga gamla rader ändrades och **noll nya saknade identitetsankare** tillkom. Tillkommande loggankare för provets audit bevaras. Historiska 1 827 saknade ankare är inte reparerade eller omklassificerade. Aktiveringen bevarade samtliga 61 tabellers rader och alla orelaterade rättigheter/funktionsdefinitioner.

Byggmanifestets SHA256 är `0b3b01a2dd008cdfde1f24b7c0767bb52b81126b74af1f2d647e194a65b8a107`. Hemlighetsfiler ingår inte i artefaktöverföringen eller manifestet. Tidigare bygge är privat säkerhetskopierat. Slutrapporten heter `/private/tmp/school-registry-api-final-3012.json`, SHA256 `752fabbafb5f6c68a81d23c24f6e76797fe88502f493d55623907096a7bd7c1d`.

## Bevarade första fel

- `school-registry-sql-first.json`: FAIL efter tre kontroller, lokal SQL-variabel felkvalificerad. Kod rättad.
- `school-registry-sql-second.json`: FAIL efter 55 kontroller, testets blockerade medlemskap saknade obligatoriska fält. Fixture rättad utan att försvaga mandatkravet. Tredje SQL-prov 62 PASS.
- `school-registry-ui-first-20261014.json`: första telefonfel för osynliga radioalternativ; rättning verifierad i slutliga 24 prov. Slutlig UI-rapport SHA256 `6e43463e645e942597eb8fdea435963edca0d6099004dd49acfd98556dac827c`.
- `school-registry-api-preflight-first.json`: FAIL med HTTP503 eftersom workerd inte stödjer `redirect: error`. Gamla rader/ACL/DDL och cleanup passerade även denna gång. Ny adapter använder `manual`, avvisar 3xx och följer ingen redirect. Nytt bygge och andra preflight/slutprov passerar. Den äldre kundadminadaptern omfattas inte av rättningen.

Alla nämnda rårapporter finns under `/private/tmp/`. Första fel ersätts inte av PASS-rapporten.

Oberoende läsande slutgranskning av `verify-school-registry-api.mjs`, `activate-school-registry.mjs` och aktiveringsproven hittade ingen blockerare: cleanup är bunden till egen testkund, okänt HTTP-utfall spärrar cleanup och aktiveringen begränsas till två funktioner med bevarande av andra ACL:er, data och journal.

## Kvarstående acceptans

[Användarprovet](05-SCHOOL-REGISTRY-USER-TRIAL.md) kör samma komponent med simulerade skolor och lagring enbart i fliken. Det mäter begriplighet och bevarade lokala uppgifter; mänskligt resultat är **awaiting_user**. Skolor i den ordinarie appen kräver verkligt konfigurerat organisationsnummer och aktuellt mandat. Provet fyller inte i eller ändrar den ordinarie huvudmannens organisationsnummer.

Full ADMIN-01/fas 5 godkänns inte automatiskt. Historiska metadataavvikelser i 05-22, tidigare auditankargap, övriga öppna krav och backloggens långsamma program-/timplansläsning består. Ingen riktig kommunanslutning, driftsättning eller nytt mänskligt godkännande påstås.
