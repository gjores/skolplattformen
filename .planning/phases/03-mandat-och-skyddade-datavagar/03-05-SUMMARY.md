---
phase: 03-mandat-och-skyddade-datavagar
plan: "05"
subsystem: mandat-arbetsyta och syntetiskt elevprov
tags: [mandat, elevprov, audit, ui, oidc, lokal-syntetisk]
status: complete
completed: true
requirements_completed: []
updated: 2026-09-26
requires: ["03-04"]
provides: ["tilldelningsformulär med behörigt urval", "auditerat syntetiskt elevprov (lista, elev-ID, ärende, export)", "distinkt audit_unavailable", "browserprov med riktig OIDC på dator och telefon"]
affects: ["03-06", "03-07"]
key-files:
  created: [web/lib/pupil-probe-model.ts, web/lib/pupil-probe-model.test.mjs, web/lib/server/pupil-probe.ts, web/app/api/prov/elev/route.ts, web/app/api/prov/export/route.ts, web/app/api/kund/mandat/urval/route.ts, web/app/mandate-grant-dialog.tsx, web/app/pupil-probe-workspace.tsx, supabase/migrations/20260926090000_phase3_workspace_options.sql, supabase/migrations/20260926100000_phase3_pupil_probe_worker_read.sql, supabase/migrations/20260926110000_phase3_list_current_mandates.sql, web/e2e/phase3-workspace.spec.ts, web/playwright.phase3.config.ts, work/pilot/phase3-browser-fixtures.mjs, work/pilot/results/phase3-pupils-api.json, work/pilot/results/phase3-workspace-browser.json]
  modified: [web/app/mandate-workspace.tsx, web/app/protected-home.tsx, web/app/globals.css, web/lib/server/authz.ts, web/lib/server/audit-details.ts, web/lib/server/http.ts, web/lib/session-channel.ts, web/e2e/fixtures/mandate-preview.tsx, supabase/tests/phase3_policy.test.sql, work/pilot/verify-access.mjs]
decisions:
  - "Worker fick EXECUTE på phase3_read_pupils först efter API-provet phase3-pupils (27/27) på återskapad stack; separat migration 20260926100000"
  - "Loggfel ger koden audit_unavailable med HTTP 500 (inte 503) så att befintliga API-prov och klientflöden behåller statuskontrakt"
  - "Elev- och ärendeurval i tilldelningsformuläret erbjuds endast rektor, som redan har skolans elevläsning; elevhälsoansvarig får skolscope i formuläret"
  - "Browserkonton för fas 3 skapas i lokal Keycloak med slumpade lösenord i gitignorerad målkatalog, inte i realm-mallen"
metrics:
  duration: "delar 2026-09-24 samt ca 27 min 2026-09-26 (12:19–12:46 UTC)"
  completed: 2026-09-26
actuals:
  tasks: 2
  commits: 5
plan_head_before: 9b75bae7180f66318440a0e66e0fab2fe88b6e18
---

# 03-05 — mandatvy och syntetiskt elevprov

Rektor kan tilldela, se och avsluta uppdrag i ett formulär som bara erbjuder det serverns aktuella mandat tillåter. Personal med elevläsning (rektor, lärare, skoladministratör, elevhälsa och support) kan pröva sin läsning mot syntetiska elever. Varje läsning och export ger en committad säkerhetshändelse innan svaret lämnar servern, och ett loggfel stoppar läsningen utan innehåll. Allt är verifierat mot den återskapade lokala stacken med syntetiska data och riktig OIDC-inloggning, på dator och telefon.

## Genomfört tidigare (2026-09-24)

Mandatkort med avslut, IT-vy med skolval, paus/aktivering och syntetiskt test, migration 22 (metadata) samt ett isolerat UI-harness med mockade svar. Commits 83d2698 och 38b5079.

## Genomfört 2026-09-26

**Uppgift 1 — läsning, export och urval (86e6550)**
- `GET /api/prov/elev` stöder tre läsformer: lista, `?elev=` (direkt elev-ID) och `?arende=` (exakt ärende). Varje form kräver audit.
- `GET /api/prov/export` ger en buffrad CSV och är öppen bara för skoladministratör. SQL nekar också övriga roller.
- Svaren har en explicit fältlista (`id`, `displayName`, `unitId`, `groupIds`) och `no-store`. Främmande, okända och andra skolors elever ger samma 404, utan antal.
- `GET /api/kund/mandat/urval` ger mottagare (aktiv personal hos kunden, inte en själv), egna skolor och delegerbara funktioner. För rektor ingår också grupper, elever och ärenden inom egen skola. Läsningen är auditerad.
- Migration 20260926090000 lägger till `phase3_mandate_options()` och `phase3_probe_scope()`. Den senare ger scope, skolor, egna ärende-ID, godkännare, syfte, sluttid och exporträtt.
- `audit_unavailable` finns nu som egen felkod när en obligatorisk händelse eller ett nekande inte kan skrivas.

**Uppgift 2 — vyer (13f3a36)**
- Tilldelningsdialogen har uppdrag, mottagare, omfattning, skolor/grupper/elever/ärenden, grupproll och giltighet. För support finns varaktighet (15/30/60 min) och fast syfte.
- Fel visas vid fältet och i en läsbar felregion. Inmatningen bevaras och osparad-varningen gäller. Mandatkorten visar supportens syfte och godkännare.
- Vyn "Syntetiskt elevprov" visar scope, godkännare, syfte och exakt sluttid. Den har läsning per elev, val av tilldelat ärende och export för skoladministratör.
- Innehållet töms vid sluttiden och när vyn avmonteras (kontextbyte, utloggning, spärr och andra flikar via befintlig sessionskanal).
- Navigeringen visar provet för rätt funktioner.

**Öppning och bevis (6608317)**
- API-fallet `phase3-pupils` i `verify-access.mjs` kördes först med stängd läsväg. Alla läsningar gav då 403 och loggade nekanden.
- Därefter tillämpades migration 20260926100000 (`EXECUTE` för Workern). Samma fall gav 27/27 PASS mot byggd protected-Worker.

**Rättning (2c27916)**
- `uuid[]` nådde klienten som sträng, så gruppantalet visades som 38. Nu levereras en JSON-lista.
- Mandatlistan visade utgångna men inte avslutade uppdrag som "Giltigt". Rättat med migration 20260926110000.

**Browserprov (7dcd1cd)**
- `phase3-browser-fixtures.mjs` och `phase3-workspace.spec.ts` kördes mot byggd Worker med inloggning via Keycloak.

## Elevläsningen öppnades, och på vilket bevis

`phase3_read_pupils` öppnades för Workern först efter att följande visats på den återskapade stacken (`work/pilot/results/phase3-pupils-api.json`, status PASS, local-synthetic-only):
- Lista, elev-ID, ärende och export gav vardera exakt en `ok`-händelse med samma korrelation som svaret. Händelsen innehöll antal och läsform, inga elevnamn.
- Med `INSERT` på `security_events` återkallat från Workern gav alla sex vägarna 500/`audit_unavailable`: lista, ID, ärende, export, nekad export och urval. Inget svar hade elevinnehåll eller CSV, och ingen `ok`-händelse fanns.
- När rättigheten återställdes fungerade läsningen igen.

Händelsen skrivs i samma transaktion som läsningen och committas före svaret. Data lämnar alltså aldrig servern utan committad logg. Klient- och anonym roll saknar fortsatt `EXECUTE` (SQL-prov).

## Körda kontroller 2026-09-26 (lokal syntetisk stack, riktiga svar)

- **SQL:** alla 10 filer PASS, 540 prov. Policyfilen har nu 73 prov: urval, scope, ärende-ID, utgånget supportuppdrag och `EXECUTE`-rättigheter.
- **Modell/server:** `node --test lib/*.test.mjs lib/server/*.test.mjs` gav 281 PASS. `npx tsc --noEmit` och `npx oxlint app lib` PASS. Oxlint för `work/pilot`-skripten PASS.
- **Bygge:** `npm run build:protected` vid revision 2c27916.
- **API mot byggd Worker:** `phase3-pupils` 27/27, `phase3-mandates` 24/24 och `audit-rollback` 2/2 PASS.
- **Browser mot byggd Worker (port 3012), OIDC via lokal Keycloak:** 18/18 PASS, 9 flöden × Desktop Chrome 1440×900 och iPhone 13 (WebKit). Resultat i `work/pilot/results/phase3-workspace-browser.json`.
  - **Rektor:**
    - Dialogen öppnas med tangentbord.
    - Fältfel och `aria-invalid` visas.
    - Mottagarlistan saknar en själv.
    - Tilldelning och bekräftat avslut av lärare fungerar.
    - På telefon finns ingen horisontell scroll, dialogen ryms i vyn och pekytorna är minst 44 px.
  - **Rektor godkänner support:** Endast det pågående uppdraget listas.
  - **Support:**
    - Ser godkännare, syfte, sluttid och en elev.
    - Efter att sluttiden kortats i databasen töms vyn med meddelande.
    - API:t ger därefter 403 utan innehåll.
  - **Lärare:**
    - Ser bara egen grupp ("1 grupp").
    - Ingen främmande elev finns i DOM eller nätverk.
    - Vid loggfel visas "Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig." med referens, och inget innehåll.
    - Läsningen återhämtar sig.
  - **Elevhälsa med ärendescope:** Tom lista tills ett tilldelat ärende väljs, därefter bara ärendets elev.
  - **Skoladministratör:** Nedladdad CSV innehåller bara egen skolas elev.
  - **IT:** Pausa/aktivera och syntetiskt test fungerar. Menyn saknar elevprov och ingen elevtext finns i DOM eller nätverk.
  - **Huvudman:** Ser rektorsmandatet och kan bara välja funktionen Rektor.
  - **Utloggning i en flik:** Låser och rensar den andra fliken.
- **Isolerat UI-harness** (mockat, historiskt komplement): 4/4 PASS.
- Skärmbilder från telefon och dator är granskade.
- **Byggd protected-preview:** omstartad på localhost:3000 med det nya bygget. Hälsokontroll `skolplattform_worker` OK, oinloggad elevläsning 401.

## Avvikelser

1. **[Regel 1 – fel] `uuid[]` tolkades som sträng i Workerns databasklient.** `groupIds` blev en teckenlista och CSV:n fick tecken. Nu `to_jsonb` i SQL-anropet. Modellen godtar bara listor. Prov i API och modell (2c27916).
2. **[Regel 1 – fel] Utgångna men inte avslutade mandat visades som "Giltigt"** i `phase3_list_mandates` från migration 22. Rättat med ny migration 20260926110000 och SQL-prov (2c27916). Tidigare tillämpade migrationer är oförändrade.
3. **[Regel 2/3] Filer utöver planens lista:**
   - behörigt urval (`/api/kund/mandat/urval` och SQL-funktioner), som krävdes för tilldelningsformulärets "mottagare ur tillåtet urval"
   - separat dialogkomponent och elevprovsvy
   - ren modellfil för testbarhet
   - fixturskript och Playwright-konfiguration för riktig OIDC.
4. **[Regel 3] Den gamla previewn på port 3000** höll `dist-protected` och hindrade ombygget. Den stoppades och startades om med nytt bygge. Ett avbrutet Playwright-webServer lämnade en privat `.dev.vars` med lås. Den togs bort, och konfigurationen fick `gracefulShutdown`.
5. **Egen, ännu ej committad migration 20260926090000 ändrades en gång efter lokal tillämpning** (tillägg av ärende-ID i scope). Den togs bort och tillämpades om i det lokala målet innan den committades. Ingen committad migration har ändrats.
6. **Planen lade dator-/telefonflöden i 03-07.** Enligt uppdraget kördes riktiga browserprov redan här. 03-07:s samlade grind och användarprov kvarstår.
7. **Commits på master** enligt projektets praxis (`branching_strategy: none`, `use_worktrees: false`).

## Kvarstående gränser

- Steg-upp med engångskod sker genom omdirigering. Öppen, osparad tilldelning skyddas av osparad-varningen men återställs inte efter omdirigeringen.
- Elevhälsoansvarig får bara skolscope i formuläret. Elev- och ärendeurval för elevhälsoansvarig kräver beslut om vilken elevinsyn den rollen får (öppet beslut i 03-CONTEXT).
- `groupIds` för support och elevhälsa följer SQL-kontraktet (elevens grupper). Bara lärarscope filtrerar grupperna.
- Kongs auditminimering försvinner vid Kong-omstart (03-04). Kong startades inte om i denna plan.
- 03-06 ska köra den samlade Worker-auditen på nya stacken (nekandeflod, felinjektion och alla API-fall). 03-07 ska köra fasgrinden, användarprovet och handboken.
- Inga fas 3-krav är markerade som verifierade. ACL-04, ACL-05, AUDIT-02 och AUDIT-03 avgörs i 03-07.

## Self-Check: PASSED

- Filerna i key-files finns.
- Commits 86e6550, 13f3a36, 6608317, 2c27916 och 7dcd1cd finns i git log.
- Uppmätt `git rev-list --count 9b75bae..HEAD` = 5 före SUMMARY-commit.
- Resultatfilerna innehåller inga lösenord, tokens eller cookies (kontrollerat med grep).
