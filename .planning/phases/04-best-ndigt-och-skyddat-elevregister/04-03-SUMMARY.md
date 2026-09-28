---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "03"
subsystem: database-authorization
status: complete
completed: 2026-09-28
duration: ca 15 minuter
tags: [postgresql, pgtap, pupil-register, protected-identity, live-mandates]
requires: [04-02]
provides:
  - Stabil elev- och klassidentitet med bevarade provmandat och stängd gammal Worker-läsning
  - Slutna skolbundna skyddsbehörigheter från huvudman till giltigt administratörsuppdrag
  - Verklig rollback-fixtur som återspelar exakt versionshanterad migration
  - Levande givar- och mottagarkedjor samt omedelbar återkallelse
  - Redovisad övergångsröd full SQL-svit
affects: [04-04, 04-11, 04-14, 04-15, 04-17, 04-21]
key-files:
  created:
    - supabase/migrations/20260929110000_phase4_register_migrate_probe.sql
    - supabase/migrations/20260929130000_phase4_protected_permission.sql
    - supabase/tests/phase4_protected.test.sql
    - work/pilot/sql-test-source.mjs
    - work/pilot/sql-test-source.test.mjs
  modified:
    - supabase/tests/phase4_register.test.sql
    - supabase/tests/phase4_periods.test.sql
    - work/pilot/run-sql-tests.mjs
requirements-addressed: [STU-01, DATA-01]
requirements-finally-verified: []
---

# Fas 4 plan 03: stabila provrelationer och huvudmannens skyddsbehörighet

**Provregistret har samma elev-/klass-UUID och mandat efter migrering; endast ett uttryckligt beslut från en levande huvudmannakedja ger ett bestämt administratörsuppdrag skyddsbehörighet på en bestämd skola.**

## Leverans

- Fyra befintliga syntetiska provelever migrerades i det avsedda lokala protected-målet. Elev- och grupp-ID bevaras; placeringar, klassmedlemskap och tydligt syntetiska utbildningar får deterministiska UUID med giltig version/variant. Dateringen utgår från läsåret vid `app_today()`.
- `mandate_pupils` refererar beständig elev med kund; `mandate_groups` refererar beständig klass med kund/skola. Ärendet behåller sitt eget skolscope och kontrolleras mot elevens kund och huvudman. Skolbyte ändrar inte elev-ID och flyttar inte gamla mandat eller ärenden. Tvetydig gammal flergruppstillhörighet avbryter migreringen i stället för att kasta bort en relation.
- Före ändring inventerades fem FK i `pg_constraint` till probe-elever/grupper samt katalogberoenden och äldre funktionskällor. Tre FK pekades om; gamla `phase3_probe_group_members` behåller övergångskällan. Ingen `CASCADE`, ingen radering av historiska säkerhetshändelser och inga ändringar i redan tillämpade migrationer.
- Worker/PUBLIC/anon/authenticated har ingen exekveringsrätt på `phase3_read_pupils` och ingen direkt tabellrätt till probe-källorna. Gamla elevvägen är avsiktligt stängd under mellanläget. `phase3_mandate_options` och `phase3_probe_scope` läser ännu den gamla **syntetiska** övergångskällan; de har inte kopplats till de beständiga/skyddsmarkerade registerraderna.
- Ny FORCE-RLS-tabell `protected_identity_permissions` binder kund, huvudman, skola, mottagarens adminuppdrag och givarens huvudmannauppdrag. Båda kedjorna prövas levande, inklusive giltighetstid, avslut, personalspärr, föräldramandat och skolscope. Rättigheten följer inte personen till ett annat adminuppdrag eller eleven till en annan skola.
- Grant/revoke/list använder `phase3_actor()` och befintligt kundlås. Endast `huvudman` med rätt organisations- och skolscope får besluta. Rektor, administratör, IT och support nekas; huvudmannen får ingen elevinsyn genom att ge behörigheten. Återkallad/ogiltig givarkedja återupplivas aldrig av ett nytt beslut; den gamla raden bevaras som återkallad historik.
- `phase3_mandate_shape` behöver ingen ny flagga: administratören har fortsatt ett vanligt skolmandat och rektorn kan aldrig välja skyddsbehörighet via vanlig mandatpayload.

## Verifiering 2026-09-28

Alla databasoperationer föregicks av `assertTarget('protected')`. Inga reset-/prepare-skript användes, ingen verklig anslutning prövades.

| Kontroll | Faktiskt resultat |
|---|---|
| RED register, före migrering | 3 av 81 assertions röda: gammal Worker-läsning öppen samt två gamla FK |
| RED skyddsbehörighet | Saknad entrypoint och saknad tabell, förväntat före migration |
| `node work/pilot/run-sql-tests.mjs --file phase4_register.test.sql --out work/pilot/results/phase4-migration.json` | **PASS 100/100** |
| `node work/pilot/run-sql-tests.mjs --file phase4_protected.test.sql --out work/pilot/results/phase4-permission.json` | **PASS 69/69** |
| `node work/pilot/run-sql-tests.mjs --file phase4_periods.test.sql --out work/pilot/results/phase4-wave3-periods.json` | **PASS 43/43** |
| `node --test work/pilot/sql-test-source.test.mjs` | **PASS 4/4** |
| `node work/pilot/run-sql-tests.mjs --out work/pilot/results/phase4-wave3-full-sql.json` | **FAIL: 13 filer, 363 exekverade assertions godkända, sex äldre filer avbrutna före assertions** |

Före/efter-fixturen återställer tre gamla FK och den tidigare triggerfria ärendeformen **inne i en rollback-transaktion**, lägger in probe-elev/grupp/medlemskap och mandat, och kör exakt den nya migrationsfilen. Den bevisar identiska UUID, symmetriskt oförändrade mandatrader, bevarad giltighet för existerande uppdrag, oförändrad säkerhetshistorik, giltiga genererade UUID samt faktisk nekad Worker-läsning. Den prövar därefter skolbyte utan flytt av gammalt scope, kundgräns och annan huvudman inom samma kund.

Skyddsproven omfattar faktiskt givar-/mottagarbyte, flera adminuppdrag för samma person, skolgränser, historisk/faktisk placering, spärr/utgång/avslut i båda kedjorna, administratörens föräldrauppdrag, revokering följd av nästa `phase4_can_read_protected`-anrop, omgrant och separat givarkedja. Listan innehåller endast personal-/skolfält. Alla nya funktioner och tabellen är fortsatt stängda för externa roller.

### Övergångsröd fullsvit — inte PASS

Följande äldre fixturer försöker skapa ärenden endast mot den gamla probe-eleven, utan motsvarande beständig registerelev. De stoppas med `Case school scope denied` före någon assertion:

| Fil | Rad | Exekverade assertions |
|---|---:|---:|
| `phase3_boundaries.test.sql` | 16 | 0 |
| `phase3_connections.test.sql` | 16 | 0 |
| `phase3_mandates.test.sql` | 17 | 0 |
| `phase3_matrix.test.sql` | 16 | 0 |
| `phase3_policy.test.sql` | 16 | 0 |
| `phase3_temporal.test.sql` | 16 | 0 |

Portningen ägs av 04-14/04-15 och måste vara grön före 04-21. Inga filer hoppas över eller räknas som godkända. De sju helt gröna filerna är phase1_isolation, phase2_access, phase2_audit, phase3_audit och de tre phase4-filerna. Tidigare vågs 686 godkända SQL-prov är historik; **den nuvarande fullsviten är röd**.

## Avvikelser som rättats

1. **Rule 3, provkörarhinder:** pg_prove monterar testfiler utan bredvidliggande migrationsfiler, så psql `\ir` kunde inte läsa migrationen. Provköraren expanderar nu endast ett strikt tillåtet versionshanterat migrationsnamn, efter målskyddet, och använder absoluta kopierade provsökvägar även för fullsviten. Traversering, andra include-varianter, nästlade inkluder och saknad fil nekas. Fyra snabbprov bevisar kontraktet. Ingen testkopia av migrationslogiken skapas i källorna.
2. **Rule 1, testisolering:** periodprovets sju negativa UPDATE saknade WHERE och träffade efter migreringen även befintliga provelever. Ett prov fick då överlappningsfel före avsett FK-fel. Mutationerna begränsades till testkundens egna rader; samtliga strikta förväntade SQLSTATE bevarades. 43/43 godkända efter rättningen.
3. Två samtidiga Supabase-provstarter kolliderade vid pgTAP-extensionens initiering. Fortsatta och slutliga databasprov kördes sekventiellt. Testfixturernas saknade `cohort` respektive `blocked_at` rättades utan ändring av domänregler eller tillämpad migration.

## Krav och nästa steg

- **STU-01 →** migrationens före/efter-bevis, stabilt elev-ID och bevarade placeringar/mandat. Kravet är inte slutverifierat; CRUD/API/gränssnitt återstår.
- **DATA-01/D-17 →** 69 SQL-prov av uttrycklig skolrätt och levande kedja. Fullständig maskering, sökning, fältprojektion och användarprov återstår.
- Funktionerna `phase4_grant_protected_permission(uuid,uuid)`, `phase4_revoke_protected_permission(uuid)` och `phase4_list_protected_permissions()` förblir **utan Worker-GRANT** tills 04-11 har en MFA-/same-origin-skyddad route och bevis för loggning i samma transaktion. 04-11 använder separat ny migration `20260929131000_phase4_permission_worker.sql`; tillämpad 04-03 får inte redigeras. Auditfel ska återställa själva behörighetsändringen. Nuvarande prov för slutna entrypoints behöver samordnas vid denna avsiktliga öppning.
- `phase4_has_protected_permission(assignment_id,unit_id)` är intern livekontroll. `phase4_can_read_protected(pupil_id,unit_id,at_date)` börjar med faktisk aktör och prövar placering på angivet datum. Kommande läsår-/historikprojektion i 04-04 måste använda rätt datum/överlapp enligt D-18; dagens datum är inte en universell historikregel.
- Behörighetslistan ger `{assignmentId,membershipId,displayName,unitId,schoolName,permissionId}` per giltig admin/skola inom huvudmannens scope. Inga elevfält. Ingen ny elevinsyn för huvudmannen.
- Detta är lokal syntetisk databasverifiering; inget användargränssnitt, verkligt elevregister, verklig IdP eller verklig kommunanslutning godkänns här. Slutgrind 04-21, mänskligt prov 04-22 och separat fasverifiering återstår.

## Commits

- `fd0469a` — RED: stabil migrering och stängd gammal läsning.
- `6c10661` — RED: uttryckliga levande skolrättigheter.
- `161a543` — provköraren återspelar exakt migrationskälla inom testets rollback.
- `f8aad2a` — uppgift 04-03-01: migrering och stängd gammal Worker-läsning.
- `7bc1879` — uppgift 04-03-02: skolbundna skyddsbehörigheter.
- `3fba141` — isolerade negativa periodfixturer.

Global STATE/ROADMAP/VALIDATION uppdateras av orkestratorn; inga samtidiga eller orelaterade ändringar ingår i dessa commits.
