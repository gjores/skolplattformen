---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "OPERATIONAL-05"
status: completed-local-approved-archive
requirements: [ADMIN-02, ADMIN-04]
completed: 2026-10-12
---

# Inventerat och arkiverat exakt sex godkända testutbildningar

Skrivskyddad inventering identifierade flera olika slags lokala provdata. Root presenterade ett konkret urval och användaren valde uttryckligen att arkivera sex gamla, isolerade testutbildningar. Den avgränsade arkiveringen är genomförd och verifierad. Inga rader har raderats.

## Verifierad inventering

- 24 kunder: 2 aktuella rollexempelkunder, 9 huvud-fixturemarkörer och 13 initialt okända kundgrafer.
- 8 huvud-fixturegrafer är avsiktligt bevarade i avslutade återställningsrapporter. Av de 13 initialt okända är 8 främmande årsplaneringskunder med bevarad audit, 2 fasta fas 2-kunder och 3 utan verifierat ägarskap.
- Den återstående huvudfixturen har 6 utbildningar, 3 programplansutkast och 1 fastställd programplan, äldre planhistorik och 29 säkerhetshändelser. Arkivering bevarar samtliga dessa planer och händelser.
- 17 programplaner saknar timplan och har uttryckligen bevarats. Inga gymtimplaner utan programplanskälla eller brutna planreferenser hittades.
- De beständiga rollexemplen har 26 utbildningar, varav 22 har plan/klass/elevplacering. De fyra återstående är inte bevisade testrester och ingick inte i åtgärden.
- 201 466 säkerhetshändelser noterades; 191 857 gäller bortstädade provkunder. 5 426 identiteter utan medlemskap har fortfarande auditreferenser. Alla bevarades.
- 117 utgångna/återkallade sessioner noterades, utan automatisk gallring.

## Genomförande och kontroll

`inventory-protected-cleanup.mjs` och `trace-protected-cleanup.mjs` använder `assertTarget('protected')`, skrivskyddad anslutning och `REPEATABLE READ READ ONLY` med korta timeouter. Verkliga read-only-körningar passerade. De läste endast det lokala skyddade målet.

`archive-approved-fixture-educations.mjs` källgranskades av root före körning. Ingen giltig appsession fanns i den gamla testkunden; root valde därför ett uttryckligt lokalt administratörsunderhåll med privat verifierbar underhållsrapport. Ingen identitet/session imiterades, inget mandat skapades och inga skyddstriggers/constraints stängdes av.

- Privat prepare-backup: PASS, noll ändrade rader, exakt sex fullständiga utbildningsrader och bevarandehashar. Filrättighet 0600 kontrollerad.
- SERIALIZABLE rollback-prov: PASS, exakt sex arkivändringar i transaktionen, full återställning verifierad efter rollback.
- Apply: PASS med känd exitkod 0 och separat postcommit-läsning. Exakt sex utbildningsrader ändrades, endast `archived_at`, `lifecycle_revision + 1` och normal triggerstyrd `updated_at`.
- Fullradshashar för 59 publika tabeller: alla andra kolumner/rader bevarade, inklusive alla planer, mandat, beslut och säkerhets-/planhistorik.
- Tabellrättigheter, triggers, constraints och migrationsnivå: oförändrade.
- Inga giltiga sessioner i målgrafen eller andra öppna databastransaktioner accepterades vid åtgärdens förkontroll. DB-slot samordnades med övriga agenter och frigavs efter PASS.
- `node --check`: PASS för samtliga tre nya skript. Ogiltigt arkiveringskommando vägrades före DB-anslutning med generiskt felmeddelande. Drivrutinsfel, anslutningsdetaljer och privata identifierare skrivs inte till stdout/stderr.

## Evidens

Privata rapporter, inte för Git:

- `/private/tmp/protected-cleanup-inventory-20261012-a.json`
- `/private/tmp/protected-cleanup-trace-20261012-a.json`
- `/private/tmp/protected-cleanup-trace-20261012-b.json`
- `/private/tmp/approved-fixture-archive-backup-20261012.json`
- `/private/tmp/approved-fixture-archive-verify-20261012.json`
- `/private/tmp/approved-fixture-archive-apply-20261012.json`

Arkiveringsskriptets SHA-256 i alla tre körbevis: `a519131f1648b5c86acd2e5ecac5420b93e9112371c1f1511f4963a2b12c9eb2`. Backupens SHA-256 i verify/apply: `877f7a142073c3985768ee1f94f218e90b8c070c4beef71c48b7761be590757d`.

## Gränser

`05-OPERATIONAL-CLEANUP-INVENTORY.md` beskriver grupperna, beroenden, stoppvillkor och privat återställningsplan. Inga sessionstoken eller identitetshemligheter exporterades. Ingen fysisk radering, återställning eller bred automatisk gallring är gjord. Den arkiverade grafen ligger utanför användarens två aktuella rollexempelkunder och ändrar inte deras utbildningslistor.

Andra okända eller avsiktligt bevarade datagrafer omfattas inte av användarens avgränsade beslut. Inga ADMIN-02/ADMIN-04-helkrav eller verkliga kommunanslutningar är slutgodkända genom detta arbete.
