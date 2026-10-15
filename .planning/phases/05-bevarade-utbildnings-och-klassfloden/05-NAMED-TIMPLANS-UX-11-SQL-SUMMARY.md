---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-11
scope: isolated-installed-sql-and-concurrency
status: verified-synthetic-sql
---

# Installerad SQL och verklig samtidighet

SQL-delen av 11 är verifierad separat från samordnarens HTTP/OIDC/browserdel. Inga originalrader från användarens databas exporterades, installerades eller ändrades.

## Ändrade filer

- `work/pilot/verify-named-timplans.mjs` – sammanhållen 02–07 migration/rollback/apply samt åtta verkligt överlappande transaktionsfall.
- `work/pilot/named-timplan-snapshot.mjs` – additiva `connect()` och `withPrivateTarget(fn)`. Anslutningarna kan endast riktas mot helperns eget slumpmässiga databasnamn, verifieras mot databas-/serveridentitet och registreras för cleanup. Callbacken får administrativa och Worker-URL:er i minnet; endast databasens pathname ändras efter kontroll av källans host/port/databas och Worker-rollen. URL:er eller credentials journalförs inte.
- Denna SQL-delrapport; samordnaren sammanställer paketets fullständiga verifiering.

## Slutprov

`node work/pilot/verify-named-timplans.mjs --out /private/tmp/named-timplans-11-second.json`

**PASS, exit 0, 10 kontroller och åtta observerade överlapp.** Rapport SHA-256: `2467d799e8b637a73bf3de5af631140f3eea5cf16c9e30f049ee71254800dace`. Körning UTC 2026-10-15 21:40:36.058–21:41:00.258, 62 bundna källfiler. Första rapporten `/private/tmp/named-timplans-11-first.json` är också PASS med nio kontroller; slutprovet utökar explicit originalbevarande, kvittokontroller och callback-API.

Migrationspaketet applicerades först i rollback. Alla gamla syntetiska kolumner bevarades; samtliga **62** tabellers hash/count samt schema/ACL återställdes exakt. Därefter installerades samma paket endast i den privata testdatabasen med samma kolumnjämförelse.

Två separat verifierade anslutningar fick backend-PID **33670** respektive **33671**. Varje hållande transaktion genomförde sitt riktiga kommando och höll transaktionen öppen. Motpartens riktiga kommando observerades genom `pg_stat_activity` och `pg_blocking_pids`: den väntade på exakt hållande PID innan den första fick committa. Det är faktiska överlappande PostgreSQL-transaktioner, inte sekventiella anrop på en anslutning. Befintliga mandat-/enhets-/källås kan serialisera kommandona; detta är inte ett genomströmningsprov.

| Fall | Observerad väntan | Resultat |
| --- | --- | --- |
| Samma serie, nästa version | transactionid | En efterföljare; andra kommandot 40001 och inget kvitto |
| Samma namn, ny serie | transactionid | En serie; andra kommandot 40001 och inget kvitto |
| Samma commandId | transactionid | Samma stabila serie/plan återspelas, exakt ett kvitto |
| Olika serier, fastställande | transactionid | Båda fastställda, ingen ersätter den andra |
| Olika serier, nästa version | transactionid | Båda får version 2 i respektive serie |
| Namnbyte mot granskat godkännande | advisory | Namnbyte består; gammalt underlag 40001, ingen statusändring eller beslutskvitto |
| Klasskoppling mot konkurrerande ersättning | transactionid | En exakt klass/läsårslänk; gammal förväntan 40001 och inget förlorarkvitto |
| Ny programkälla mot skapande | advisory | Ny källa består; gammal källförväntan 40001, ingen partiell serie eller kvitto |

Efter fallen fanns samtliga **153** syntetiska ursprungsrader kvar. Alla var exakt oförändrade utom den avsiktligt prövade gamla programkällans fastställt→ersatt, revision+1 och updated_at; övriga kolumner i den raden jämfördes exakt. Befintliga beslut, kvitton, auditankare, identitets-/mandat-/sessionsrader och gamla timplansceller ingår i kontrollen. Installerat schema/ACL-fingeravtryck var fortsatt identiskt efter alla konkurrensfall.

Den privata callbackens administrativa och Worker-URL:er kontrollerades utan utdata; de pekade på samma egna databas. Alla helperregistrerade anslutningar stängdes, egen databas och dump togs bort. Cleanup **complete**. Privat journal: `/private/tmp/named-timplan-snapshot-eLj1dV/journal.json`.

## Bevisgräns

Schema-only-kopia, granskad offentlig katalog och syntetiska repositoryfixturer. Inga liveverksamhets-, auth-, sessions- eller journalrader exporterades. Ingen skyddad liveprocess, databas eller IdP startades om. Ingen permanent apply på användarmålet, ingen commit och ingen push utfördes av denna deluppgift.

Detta är faktisk installerad lokal SQL och faktisk samtidighet. HTTP, OIDC/MFA, Worker, dator/telefon, återhämtning i UI och ursprungliga användarraders bevarande vid eventuell liveapply måste redovisas med sina egna bevis. Ingen verklig kommunanslutning eller verifierat SS 12000-utbyte påstås; stabil klass-/organisationsidentitet och exakt läsårsrelation ingår i den interna mappningen.
