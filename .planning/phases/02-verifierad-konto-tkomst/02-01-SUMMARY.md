---
phase: 02-verifierad-konto-tkomst
plan: 01
subsystem: auth-infra
tags: [keycloak, oidc, totp, supabase-local, vinext, wrangler, protected-runtime]

# Dependency graph
requires:
  - phase: 01-baslinje-och-avskild-pilotmilj
    provides: "Avskilda lokala Supabase-mål, karantänmigration och backendfritt exempelläge"
provides:
  - "Lokal Keycloak 26.7.3-realm med tio syntetiska identiteter och fem TOTP-fixturer"
  - "Protected-mål med GoTrue Keycloak-konfiguration, privata genererade hemligheter och målskyddad SQL-körare"
  - "Separata dev-, build- och preview-flöden för protected med privat serverkonfiguration"
affects: [02-02, 02-03, 02-04, 02-09, 02-11, fas-7-identitetsanslutning]

# Tech tracking
tech-stack:
  added: ["openid-client 6.8.8", "postgres 3.4.9", "otpauth 9.5.2", "Keycloak 26.7.3"]
  patterns:
    - "Hemligheter genereras i gitignorerat 0600-manifest och förs till Worker via kortlivad .dev.vars"
    - "Protected-bygget ligger i dist-protected och kan inte ersätta exempellagets dist"
    - "Målskydd körs före lokala SQL-prov och vägrar molnvariabler eller fjärrmål"

key-files:
  created:
    - work/pilot/idp/realm-template.json
    - work/pilot/idp-otp.mjs
    - work/pilot/run-sql-tests.mjs
  modified:
    - work/pilot/prepare-local.mjs
    - work/pilot/verify-target.mjs
    - web/scripts/run-mode.mjs
    - web/lib/runtime-mode.ts
    - web/lib/runtime-mode.test.mjs
    - web/package.json
    - web/package-lock.json
    - web/.gitignore
    - docs/pilot/README.md

key-decisions:
  - "Realmens browser-loa-flöde importerades utan reservväg; faktisk acr/amr-tokenprofil måste fortfarande bevisas i spiket 02-03/02-04"
  - "En exklusiv .dev.vars.lock används eftersom Wrangler kräver ett fast filnamn men parallella processer inte får dela hemlighetsfil"
  - "Protected och example får separata byggkataloger och klientmiljön får alltid tomma NEXT_PUBLIC_SUPABASE-värden"

patterns-established:
  - "Serverhemligheter: läs verifierat lokalt manifest, validera loopback-mål, skriv 0600, städa vid exit/SIGINT/SIGTERM"
  - "Lokala databasprov: assertTarget före kopiering eller CLI, inga lösenord i processargument"

requirements-completed: [IAM-01, IAM-04]

# Metrics
duration: 28min
completed: 2026-09-14
---

# Fas 2 Plan 01: Lokal testidentitet och protected-körläge Summary

**Keycloak 26.7.3 med tio syntetiska identiteter kör mot det avskilda protected-målet, medan Vinext startar och bygger ett separat protected-läge med privata serverhemligheter som aldrig bäddas in i klientpaketet.**

## Performance

- **Duration:** cirka 28 min från registrerad fasstart, inklusive fortsättningen efter hosts-checkpointen
- **Started:** 2026-09-14T19:07:28Z
- **Completed:** 2026-09-14T19:35:42Z
- **Tasks:** 3 av 3
- **Files modified:** 12 produkt-, verktygs- och dokumentationsfiler

## Accomplishments

- `prepare-local --target protected --with-idp` startade Keycloak och det avskilda Supabase-målet. Discovery gav exakt issuer `http://host.docker.internal:8180/realms/skolplattform-test`; Admin API bekräftade tio importerade användare och manifestet anger fem TOTP-personer.
- Genererade IdP-, Worker- och sessionshemligheter ligger endast i ignorerade filer med läge 0600. SQL-köraren verifierar målet före filkopiering och körning; pgTAP gav 52/52 godkända prov.
- `dev:protected`, `build:protected` och `preview:protected` fungerar. Dev och preview svarade med HTTP 200, privata `.dev.vars` hade 0600 och togs bort med sina lås efter stopp.
- Protected-klientpaketet innehåller inga `supabase.co`-värden. Exempelbygget är fortsatt märkt `example`, och telefonvägen vägrar ett bygge märkt `protected`.

## Task Commits

1. **Task 1: Realm-mall, hosts-kontroll och Keycloak-start** — `bd14984` (feat)
2. **Task 2: Protected i runtime och körskript** — `ff52579` (feat)
3. **Task 3: Startanvisning för skyddad provmiljö** — `f5fe97f` (docs)

**Plan metadata:** denna SUMMARY och uppskjutna fynd committas separat efter självkontroll.

## Files Created/Modified

- `work/pilot/idp/realm-template.json` — svensk Keycloak-realm med låst klient, browser-loa, fasta syntetiska subjects och TOTP-fixturer.
- `work/pilot/prepare-local.mjs` — hosts-kontroll, Keycloak-livscykel, lokal GoTrue-konfiguration, privata hemligheter och säkra psql-anrop.
- `work/pilot/verify-target.mjs` — valfri verifiering av körande lokal IdP och exakt issuer.
- `work/pilot/idp-otp.mjs` — skriver endast aktuell sexsiffrig kod för en TOTP-testperson.
- `work/pilot/run-sql-tests.mjs` — målskyddad pgTAP-körare utan reset eller lösenord i argv.
- `web/scripts/run-mode.mjs` — protected dev/build/preview, separat byggkatalog och exklusiv hemlighetsfillåsning.
- `web/lib/runtime-mode.ts`, `web/lib/runtime-mode.test.mjs` — öppnar endast exakt läge `protected` och beskriver det utan anslutningsvärden.
- `web/package.json`, `web/package-lock.json` — exakt låsta OIDC-, Postgres- och TOTP-paket samt fyra protected-kommandon.
- `web/.gitignore` — ignorerar `.dev.vars*` och `dist-protected/`.
- `docs/pilot/README.md` — engångsförberedelse, start, tio testpersoner, bygge och avgränsning mot verklig kommun-IdP.

## Decisions Made

- Realmimporten accepterade planens `browser-loa`-flöde, så reservvägen med inbyggt browserflöde aktiverades inte. Detta bevisar import och discovery; tokenens `acr`/`amr` bevisas först i 02-03/02-04.
- `.dev.vars` får ett exklusivt lås. En andra server rapporterar BLOCKED i stället för att ersätta eller radera en annan process privata fil.
- Protected-servern får endast bindas till `localhost` eller `127.0.0.1`. Manifestet måste peka API och Worker-databas mot loopback innan hemlighetsfilen skapas.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Säkrade felkod när protected-bygget saknar Wrangler-konfiguration**
- **Found during:** Task 2
- **Issue:** Den första implementationens felgren kunde returnera exit 0 om Vinext avslutade 0 men `dist/server/wrangler.json` saknades.
- **Fix:** Felgrenen omvandlar nu ett sådant tillstånd till exit 1 och återställer ett bevarat exempelbygge.
- **Files modified:** `web/scripts/run-mode.mjs`
- **Verification:** protected- och example-byggen passerade; de negativa markeringsproven gav exit 2.
- **Committed in:** `ff52579`

**2. [Rule 2 - Missing Critical] Städade lås även om privat konfigurationsfil inte kan skrivas**
- **Found during:** Task 2
- **Issue:** Ett skrivfel efter taget exklusivt lås kunde lämna en låsfil som blockerade framtida lokala starter.
- **Fix:** Skrivning och chmod ligger i en skyddad gren som tar bort det egna låset vid fel.
- **Files modified:** `web/scripts/run-mode.mjs`
- **Verification:** dev och preview skapade 0600-filer och tog bort både fil och lås efter SIGINT.
- **Committed in:** `ff52579`

---

**Total deviations:** 2 auto-fixade (1 Rule 1, 1 Rule 2)
**Impact on plan:** Båda rättningarna stärker planens fel- och hemlighetskontrakt utan ny arkitektur eller utökad produktomfattning.

## Issues Encountered

- Den godkända `/etc/hosts`-raden verifierades före fortsatt körning. Inget projektskript ändrade filen.
- Docker var först otillgängligt från sandlådan trots att Docker Desktop körde. Lokal Dockeråtkomst godkändes och hela förberedelsen kördes därefter framgångsrikt.
- Den första npm-installationen väntade utan nätåtkomst. Samma exakt avgränsade installation kördes med godkänd nätåtkomst och slutfördes.
- `npm audit` rapporterar fyra höga varningar i den befintliga Cloudflare/Wrangler/Miniflare/Sharp-kedjan. De nya tre paketen orsakar dem inte; fyndet finns i `deferred-items.md` för separat beroendeunderhåll.

## User Setup Required

Den enda engångsåtgärden, raden `127.0.0.1 host.docker.internal` i `/etc/hosts`, är genomförd och verifierad. Docker Desktop måste vara igång när den skyddade lokala miljön används.

## Known Stubs

- `work/pilot/prepare-local.mjs:372` fortsätter uttryckligen när `work/pilot/sql/phase2-fixtures.sql` saknas. Filen och medlemskaps-/uppdragsfixturerna ägs av plan 02-02; frånvaron hindrar inte denna plans IdP- och körmiljömål.

## Verification

- Modelltester: 108/108 PASS med Node 25.9.0.
- `npx tsc --noEmit` och `npx oxlint app lib scripts`: PASS.
- pgTAP i verifierat protected-mål: 52/52, `All tests successful`.
- Keycloak: discovery PASS, 10 användare, stoppad container gav BLOCKED och omstart återställde PASS.
- Protected dev och byggd preview: HTTP 200; privata filer 0600 under körning och borta efter stopp.
- `build:example` och `build:protected`: PASS med separata korrekta markörer; protected-klienten innehåller 0 träffar på `supabase.co`.

## Next Phase Readiness

- 02-02 kan lägga kund-, identitets-, medlemskaps- och uppdragsmodellen samt de saknade phase2-fixturerna i det nu körbara protected-målet.
- 02-03/02-04 måste fortfarande bevisa Worker-OIDC, PKCE/nonce, GoTrue-registrering och de faktiska `acr`/`amr`-anspråken. Denna plan påstår ingen färdig inloggning eller kommunanslutning.
- IAM-01 och IAM-04 har här fått sin lokala identitets- och körgrund; kraven markeras inte som slutverifierade förrän fasens återstående planer och fasgrind har passerat.

## Self-Check: PASSED

Kontrollerat 2026-09-14: samtliga 12 ändrade produkt-/verktygsfiler finns; commits `bd14984`, `ff52579` och `f5fe97f` finns i Git; Keycloak- och protected-målen svarar; inga `.dev.vars`- eller låsfiler ligger kvar.

---
*Phase: 02-verifierad-konto-tkomst*
*Completed: 2026-09-14*
