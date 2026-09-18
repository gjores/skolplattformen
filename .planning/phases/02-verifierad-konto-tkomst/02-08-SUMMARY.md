---
phase: 02-verifierad-konto-tkomst
plan: "08"
subsystem: api
tags: [postgres, rls, audit, csv, skolverket, mfa]
requires:
  - phase: 02-06
    provides: Transaktionell sessionskontroll, aktuella uppdrag och atomisk serveraudit
provides:
  - Kundavgränsad säkerhetslogg i JSON och formelsäker CSV med självloggande export
  - Skyddad administration av huvudmän och organisationsöversikter
  - Serverkontrollerad skolenhetsimport och rektorsutnämning med MFA och aktuellt mandat
affects: [02-09, 02-10, kundadministration, kommunintegration]
tech-stack:
  added: []
  patterns: [serverharledd-kontext, atomisk-audit, typad-proof-projektion, versionsmarkt-testtransport]
key-files:
  created:
    - web/app/api/kund/huvudman/route.ts
    - web/app/api/kund/skolenhet/route.ts
    - web/app/api/kund/rektor/route.ts
    - web/lib/server/skolverket.ts
  modified:
    - web/app/api/logg/route.ts
    - web/app/api/organisation/route.ts
    - web/app/api/skolenhet/route.ts
    - web/lib/server/authz.ts
    - web/lib/server/events.ts
key-decisions:
  - Organisationsnummer och registeruppslag tillför data men ger aldrig behörighet; aktuellt kunduppdrag avgör åtkomst.
  - Kundadministratören företräder huvudmannen vid etablering medan säkerhetsloggen behåller det faktiska uppdraget kundadmin.
  - Positiva registerprov använder en explicit versionsmärkt syntetisk transport när Worker-miljön inte når Skolverket; liveförsök redovisas separat.
patterns-established:
  - Beständig ändring och dess enda säkerhetshändelse ligger i samma databastransaktion.
  - Auditdetaljer exporteras genom en strikt nyckel- och typvitlista före JSON- eller CSV-svar.
requirements-completed: [AUDIT-01, ACL-01]
duration: 2h 10m active work across continuation
completed: 2026-09-18
---

# Phase 2 Plan 8: Granskarlogg och skyddade organisationsändringar Summary

**Kundavgränsad säkerhetslogg, huvudmannaadministration, registerstyrd skolenhetsimport och rektorsutnämning med serverhärledd behörighet och atomisk audit.**

## Performance

- **Duration:** 2h 10m aktivt arbete över två körningar
- **Started:** 2026-09-17T08:34:57Z
- **Completed:** 2026-09-18T05:10:39Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- Granskare kan läsa och exportera endast sin kunds säkerhetshändelser. JSON och CSV delar samma strikta allowlist, CSV neutraliserar kalkylbladsformler och varje lyckad export skapar exakt en `log_exported`-händelse i samma transaktion.
- Kundadministratören kan skapa huvudmän och läsa organisationsöversikter utan att organisationsnummer eller ett främmande objekt-ID blir ett uppslags- eller behörighetsbevis.
- Skolenheter importeras genom ett serverkontrollerat Skolverket-uppslag och rektorer utses genom databasfunktionerna med MFA, aktuellt kundmandat och serverhärledd huvudmannaroll. Auditfel rullar tillbaka verksamhetsändringen.
- Främmande och obefintliga huvudmän/skolenheter får samma svarsform. Klientfält och `X-App-Role` påverkar inte aktör eller roll.

## Task Commits

1. **Task 1: Granskarens säkerhetslogg och export** — `de5b5e8` (feat)
2. **Task 1 säkerhetsrättning: Proof-värden med fel JSON-typ filtreras** — `396d17e` (fix)
3. **Task 2: Huvudmän och kundavgränsad organisationsläsning** — `71914ce` (feat)
4. **Task 3: Skolenhetsimport och rektorsutnämning** — `f1fa7e4` (feat)

## Files Created/Modified

- `web/app/api/logg/route.ts` - Kundfilter, datum/åtgärdsfilter, strikt auditprojektion samt JSON/CSV-export.
- `web/lib/audit-export.ts` och `web/lib/audit-export.test.mjs` - Formelsäker semikolon-CSV med citat-, radbrytnings- och Unicode-prov.
- `web/app/api/kund/huvudman/route.ts` - Kundavgränsad listning och MFA-skyddat skapande av huvudman.
- `web/app/api/organisation/route.ts` - Organisationsöversikt efter explicit kundkontroll och servervald organizer-GUC.
- `web/lib/server/skolverket.ts` och `web/lib/skolverket.test.mjs` - Delad registertolkning, validerat importkontrakt och injicerbar testtransport.
- `web/app/api/kund/skolenhet/route.ts` - Registerstyrd import med servervald huvudmannakontext och atomisk audit.
- `web/app/api/kund/rektor/route.ts` - MFA-skyddad rektorsutnämning inom vald huvudman.
- `web/app/api/skolenhet/route.ts` - Den publika läsvägen återanvänder samma registertolkning.
- `web/lib/server/authz.ts`, `web/lib/server/db.ts`, `web/lib/server/events.ts` och `web/lib/server/http.ts` - Kontrollerade felorsaker och separat `error`-audit för oväntade serverfel.

## Decisions Made

- Skolverkets data verifierar skolenhetsuppgifter. Det ger inte rätt att företräda en huvudman; `protectedRoute`, aktuellt uppdrag och kundkontroll avgör behörigheten.
- Säkerhetshändelsen visar `kundadmin` som faktiskt uppdrag även när databasen tillfälligt använder `app_role=huvudman` för den etableringsåtgärd som huvudmannen ansvarar för.
- JSON-läsning av säkerhetsloggen loggas inte eftersom vyn annars fyller loggen med sina egna omläsningar. CSV-export loggas eftersom den lämnar systemet som en fil.
- Den skyddade Worker-routen gav `registry_unavailable` vid liveförsöket. Positiv helkedja bevisades därför med routekodens explicita `synthetic-registry-v1`-transport; ingen riktig kommun- eller registeranslutning påstås.

## Verification

| Kontroll | Resultat |
|---|---|
| `node --test lib/*.test.mjs` | PASS, 156/156 |
| `npx tsc --noEmit` | PASS |
| `npx oxlint app lib scripts e2e` | PASS |
| `npm run build:protected` | PASS |
| `node work/pilot/run-sql-tests.mjs` | PASS, Files=3, Tests=137 |
| `npm run e2e:protected` | PASS, 5/5 i byggd Worker |
| `git diff --check` | PASS |

Lokala API/DB-prov med syntetiska profiler verifierade dessutom:

- Granskare A såg bara kund A, granskare B bara kund B, och kundadmin nekades. Råtoken, personnummer, signaturmaterial, nästlade objekt och strängar under numeriska proof-fält lämnade varken JSON eller CSV.
- CSV-export ökade `log_exported` med exakt en. Indragen INSERT-rätt på `security_events` gav 500 utan att lämna någon export; rättigheten återställdes efter provet.
- Huvudman skapades inom kund A med exakt en audit-händelse. En global organisationsnummerkonflikt från kund B gav ett generiskt 409 utan ägaruppgift. Auditfel rullade tillbaka skapandet.
- Rektorsutnämning gav exakt en säkerhetshändelse med kundadminuppdrag och en organisationshändelse med serverrollen huvudman. Lösenordsbaserad session, granskare, främmande/skadat ID och saknad rektor nekades utan beständig ändring.
- Den skyddade skolimportrouten skapade skolenhet, skolform och registersnapshot inom rätt huvudman via den versionsmärkta testtransporten. Dubblett gav 409, register-404 och registerfel skildes åt, och auditfel rullade tillbaka hela importen.
- Liveförsök mot skolenhetskod `19207279` gav 503 från den skyddade Worker-routen medan den befintliga publika läsvägen gav 200 med samma fältmappning. Ingen 201 producerades utan ett validerat registersvar.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSON-parametern till skolimporten blev en JSON-sträng**
- **Found during:** Task 3:s verkliga route-/databasprov
- **Issue:** Vanlig interpolation av serialiserad JSON gjorde att `import_school_unit` fick en sträng och saknade `code`.
- **Fix:** Skicka både importdata och registerpayload genom `tx.json(... )::jsonb`.
- **Files modified:** `web/app/api/kund/skolenhet/route.ts`
- **Verification:** Positiv syntetisk routehelkedja skapade unit/types/snapshot och exakt en audit-rad.
- **Committed in:** `f1fa7e4`

**2. [Rule 1 - Security bug] Tillåtna proof-nycklar accepterade värden med fel typ**
- **Found during:** Task 1:s minimeringsgranskning
- **Issue:** En angripare kunde placera nästlat material under exempelvis `issuer` eller en sträng under `policyVersion`.
- **Fix:** SQL-projektionen kräver dokumenterad sträng- respektive nummertyp per nyckel.
- **Files modified:** `web/app/api/logg/route.ts`
- **Verification:** Verkligt JSON/CSV-prov med feltypade tillåtna nycklar innehöll inte markörerna.
- **Committed in:** `396d17e`

**3. [Rule 2 - Missing critical] Oväntade mutationsfel saknade korrekt error-audit och säkra verksamhetsorsaker**
- **Found during:** Task 3:s rollbackprov
- **Issue:** Oväntade serverfel loggades som nekanden och kontrollerade 400/404/503-svar kunde inte bära den avtalade säkra orsaken.
- **Fix:** Lägg till separat `logError`, valfria säkra `Deny.details` och konsekvent svarsprojektion.
- **Files modified:** `web/lib/server/authz.ts`, `web/lib/server/db.ts`, `web/lib/server/events.ts`, `web/lib/server/http.ts`
- **Verification:** Auditbortfall gav 500/error och rollback; register-404/503 samt rektorsvalidering gav endast kontrollerade orsaker.
- **Committed in:** `f1fa7e4`

**4. [Rule 2 - Data contract] Planens nullvärde strider mot databasens NOT NULL-regel**
- **Found during:** Task 3:s importkontrakt
- **Issue:** `pupil_register_source` kan inte lagras som null i den befintliga modellen.
- **Fix:** Spara den sanningsenliga statusen `Inget register kopplat`, utan att antyda en ansluten källa.
- **Files modified:** `web/lib/server/skolverket.ts`
- **Verification:** Enhetsprov för exakt importkontrakt och lyckad route-/databasimport.
- **Committed in:** `f1fa7e4`

**5. [Rule 2 - Trust boundary] Registeranrop behövde stängas vid tvetydiga svar**
- **Found during:** Task 3:s registeradapter
- **Issue:** Ett saknat tidsstopp, redirects eller ofullständiga registerfält skulle göra importgränsen tvetydig.
- **Fix:** Tio sekunders timeout, nekade redirects och kontroll av kod, namn, kommunkod, datum och eventuellt organisationsnummer.
- **Files modified:** `web/lib/server/skolverket.ts`
- **Verification:** Enhetsprov för 404, nätfel, 5xx, fel kod och ogiltigt payload.
- **Committed in:** `f1fa7e4`

---

**Total deviations:** 5 auto-fixed (2 bugs, 3 missing critical safeguards)
**Impact on plan:** Rättningarna behövdes för korrekt JSON-överföring, informationsminimering och transaktionell säkerhet. Ingen ny produktfunktion tillkom.

## Issues Encountered

- Skolverket svarade i det separata Node-liveprovet och i den publika läsvägen, men Workerns skyddade route fick nätfel och svarade 503. Planens avtalade reservväg användes för det positiva säkerhetsprovet och resultatet märktes uttryckligen syntetiskt.
- pgTAP-fixturen räknar fasta huvudmän. Den tomma syntetiska huvudman som API-provet skapade städades med exakt organisationsnummer före slutprovet; auditspåren lämnades kvar.
- Bygget var grönt med befintliga varningar om Vites framtida JSON-importkrav och stor klientchunk. De är inte orsakade av planen.

## Known Stubs

Inga stubbar eller automatiska mockdataflöden finns i de skapade produktionsvägarna. Den injicerbara registertransporten används endast av test och ett explicit lokalt routeprov.

## User Setup Required

None - inga nya externa hemligheter eller tjänstekonton krävs för den lokala piloten.

## Next Phase Readiness

- Plan 02-09 kan använda de skyddade skrivvägarna och deras auditkontrakt.
- En verklig kommun- eller registerintegration återstår som separat godkänd anslutning; denna plan bevisar lokal säkerhetskedja med syntetiska data.
- Den genererade filen `work/pilot/results/spike.json` och pågående ändringar i `.planning/STATE.md` tillhör den överordnade körningen och ingår inte i planens kodcommits.

## Self-Check: PASSED

Alla angivna käll- och testfiler finns. Task-commits `de5b5e8`, `396d17e`, `71914ce` och `f1fa7e4` finns i historiken. Hela slutkontrollmatrisen ovan kördes efter den sista kodcommitten och passerade.

---
*Phase: 02-verifierad-konto-tkomst*
*Completed: 2026-09-18*
