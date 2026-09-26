---
phase: 03-mandat-och-skyddade-datavagar
plan: "04"
subsystem: audit
tags: [audit, kong, storage, postgres, gallring, lokal-syntetisk]
status: complete
completed: true
requirements_completed: []
updated: 2026-09-26
requires: ["03-03"]
provides: ["obligatorisk Worker-audit", "separat gallring synthetic-v1", "källbevis för stängda direktvägar i lokal stack"]
affects: ["03-06", "03-07"]
key-files:
  created: []
  modified: [work/pilot/configure-audit-source.mjs, work/pilot/collect-denials.mjs, work/pilot/collect-denials.test.mjs, work/pilot/results/phase3-denials.json, docs/pilot/audit-sources.md, docs/pilot/loggpolicy.md]
decisions:
  - "Storage korreleras genom att Kong tvingar sitt request-id som X-Client-Trace-Id (Storage allowlistar headern); ingen Storage-omkonfiguration krävs"
  - "Postgres-källan konfigureras med ALTER SYSTEM endast i lokalt protected-mål: prefix med SQLSTATE/PID/session/rad/inloggningsroll, ingen statement-/DETAIL-text"
  - "Kong-konfigurationsförlust efter omstart godtas lokalt som rapporterad lucka, inte förhindrad; automatisk omkonfigurering är inte byggd"
metrics:
  duration: "delar 2026-09-23–24 samt ca 20 min 2026-09-26"
  completed: 2026-09-26
actuals:
  tasks: 2
  commits: 3
plan_head_before: 00980d3e4d1b63bfaca494bbc06190dbe934efd0
---

# 03-04 — obligatorisk loggning och källinsamling

Worker kräver händelse före svar och commit. Gallringen är separat och serverberäknad. Stängda direktvägar (REST, RPC, Storage-upstream, direkt SQL) har nu individuella, minimerade källbevis från Kong-, Storage- och Postgres-loggar. Källavbrott, omstart och återhämtning är provade på den återskapade syntetiska stacken.

## Genomfört tidigare (2026-09-23–24, föregående miljö)

- Worker kräver händelse för mutation och för läsrutter med audit=required. Mandatlistningen använder detta läsläge. Commit föregår svaret. Elevvägen är fortfarande stängd och saknar Worker-EXECUTE.
- Varje nekande får en egen beständig händelse och serverkorrelation, och undertryckningen efter 20 försök är borttagen. Ett loggfel ger generiskt serverfel.
- Detaljvärden har slutna scheman. Fri orsak, klientproof och URL-suffix/query kastas.
- Separat NOLOGIN-underhållsroll och `purge_synthetic_audit` finns, med serverberäknad 30-dygnsgräns. Ingen befintlig kund har aktiverats eller gallrats. Migrationerna heter 20260924200000 och 20260924210000.
- Commits: db8a894 (gallring), 707fbb1 (Worker), bbc5ddf (första Kong-delen).

API-regressionen för Worker-audit (30 nekanden → 30 händelser, loggfel vid läsning/export/nekande/rollback) kördes i den **föregående** miljön. Den räknas inte som bevis för den återskapade stacken. Plan 03-06 kör om den med felinjektion, enligt planens egen fördelning.

## Genomfört 2026-09-26 på återskapad stack

**Källkonfiguration (ec47457)**
- Kong tvingar servergenererat request-id som `X-Client-Trace-Id` mot upstream och skriver över klientens värde.
- En reload räknas aktiv först när alla gamla workers har avslutats. En faktisk kapplöpning observerades: ett prov hanterades av en gammal worker i okonfigurerat format.
- Postgres får prefixet `phase3pg|%m|%p|%c|%l|%u|%e|`, `log_min_error_statement=panic`, `log_error_verbosity=terse` och `log_statement=none`. Effektiva värden och avsaknad av roll-/databasöverstyrning kontrolleras.
- Kollektorn har allowlist-normalisering för Storage och Postgres, individuell korrelation per prov, fönsterkontinuitet (samma containerkörning, ingen rotation, aktiv konfiguration, inga omnimerade/ospårade rader) och ett avbrottsprov per källa.

**Källbevis (5cff981)** — `node work/pilot/collect-denials.mjs --probe --outage storage,kong,db --out work/pilot/results/phase3-denials.json` gav status PASS och exit 0 (räckvidd local-synthetic-only):
- direct-rest 401 och direct-rpc 401 har vardera exakt en Kong-händelse med samma servergenererade id.
- direct-storage gav 400 i Kong och ett Storage-nekande (RLS) med samma gateway-id. Storage har själv verifierat rollen `anon`.
- direct-sql gav 3 försök och 3 × 42501 i exakt den serverrapporterade sessionen. Inloggningsrollen var `authenticator`.
- Kontinuiteten i provfönstret är PASS för alla tre källorna.
- Avbrotten är PASS för alla tre:
  - Storage: kollektorn blockerar, Kong ger och loggar 502, och händelserna före och efter finns.
  - Kong: anslutningen nekas. Konfigurationsförlusten efter omstart rapporteras som lucka och återställs.
  - Postgres: inloggning nekas under avbrottet. Konfigurationen ligger kvar efter omstart.
- Rapporten innehåller inga SQL-texter, nycklar, URL:er eller felmeddelanden (kontrollerat med grep).

**Dokumentation (862ebb3):** `docs/pilot/audit-sources.md` är omskriven med verifierat läge och kvarvarande gränser. Statusraden och källavsnittet i `docs/pilot/loggpolicy.md` är uppdaterade. Docusaurus ändrades inte.

## Körda kontroller 2026-09-26

- `node --test work/pilot/collect-denials.test.mjs`: 19 PASS.
- `node work/pilot/run-sql-tests.mjs --file phase3_audit.test.sql --out work/pilot/results/phase3-sql-audit.json`: PASS, 13 tester (gallring före/vid/efter gräns, rättigheter).
- Övriga 9 SQL-filer kördes efter Postgres-omstarten: alla PASS.
- `cd web && node --test lib/*.test.mjs lib/server/*.test.mjs`: 277 PASS. `node --test lib/server/events.test.mjs`: 5 PASS.
- `npx tsc --noEmit` och `npx oxlint app lib`: PASS. oxlint för de tre work/pilot-filerna: PASS.
- Källprovet ovan kördes två gånger. Första körningen märkte felaktigt ett Storage-avbrott som `refused`, fast det var klient-timeout med Kong-status 499. Felklassningen rättades, och andra körningen gav loggat 502. Endast den andra körningen ligger i rapporten.

## Avvikelser

1. **[Regel 1 – fel] Reload-kapplöpning i Kong-konfiguratorn.** Configure returnerade innan gamla workers stängts, så ett prov loggades i standardformat med rå URL. Konfiguratorn väntar nu tills alla workers från före reload är borta (ec47457).
2. **[Regel 1 – fel] Tidigare dokumentation påstod att direktproven nekades vid gatewayn.** I den återskapade stackens Kong-konfiguration finns ingen nyckelkontroll för REST/Storage, så anropen når PostgREST/Storage/Postgres, som nekar. Dokumentet är rättat.
3. **[Regel 1 – fel] Felaktig avbrottsklassning.** Se ovan. Rättad innan rapporten committades.
4. **Commits på master.** GSD-verktygets skydd klassar `master` som skyddad gren. Projektet har bara `master`, `branching_strategy: none` och `use_worktrees: false`, och alla tidigare fas 3-commits ligger där. Commits gjordes därför på master enligt orkestratorns uppdrag.

## Kvarstående gränser (inte blockerande för 03-04, men för drift)

- Kong omkonfigureras inte automatiskt efter omstart. Luckan upptäcks och rapporteras men förhindras inte.
- Det finns ingen beständig cursor mellan separata insamlingskörningar. Varje körning bevisar bara sitt fönster.
- PostgREST-orsakade Postgres-fel sker i poolade sessioner och korreleras inte individuellt. REST/RPC-beviset kommer från Kong.
- Kollektorn är asynkron och lokal och ger ingen synkron driftsgaranti. Verklig ingress, verklig lagringstid och kommunanslutning omfattas inte.
- Worker-audit på den nya stacken (inklusive 25+ nekanden och felinjektion) körs i 03-06. AUDIT-02/03 är inte markerade som verifierade. Det avgörs i den samlade fasgrinden (03-07).

## Self-Check: PASSED

- Filer finns: work/pilot/configure-audit-source.mjs, work/pilot/collect-denials.mjs, work/pilot/collect-denials.test.mjs, work/pilot/results/phase3-denials.json, docs/pilot/audit-sources.md, docs/pilot/loggpolicy.md.
- Commits finns i git log: ec47457, 5cff981, 862ebb3. Uppmätt `git rev-list --count 00980d3..HEAD` = 3 före SUMMARY-commit.
