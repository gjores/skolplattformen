---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "07"
subsystem: secure-client-transport
tags: [typescript, tdd, context-epoch, data-minimization]
requires: [04-01]
provides: [minimerade SQL-fel, typade konfliktuppgifter, avbrutna gamla svar, POST-exporttransport]
affects: [04-05, 04-10, 04-13]
tech-stack:
  added: []
  patterns: [gemensam generationskontroll för JSON och Blob]
key-files:
  created: [web/lib/server-client.test.mjs]
  modified: [web/lib/server-client.ts, web/lib/server/mandates.ts, web/lib/server/mandate-route.ts, web/lib/server/mandates.test.mjs]
completed: 2026-09-28
requirements-completed: []
---

# Fas 4 plan 07: Säkra fel och transportgränser

SQL-fel lämnar endast generisk kod/status. Klienten avbryter gamla JSON-svar, konfliktuppgifter och exportfiler både före behandling av svarshuvud och efter asynkron kroppsläsning.

## Genomförande

- 04-07-01: `23P01` mappas till befintligt svenskt `bad_request`/400. `40001` och `23505` behåller `conflict`/409. Inga SQL-detail/query/constraintvärden kopieras till `Deny`. Lokalt målskydd bevarat. RED `e43192b`, GREEN `d92dc50`.
- 04-07-02: `ApiError.details` använder befintligt `ConflictDetails` och den stängda runtime-parsern. Uppgifterna ges bara för aktuell `conflict`/409, aldrig för tekniska/spärrfel eller ändrad serverkontext. Ingen ny SQL-exceptionväg med elevdata.
- JSON, befintlig GET-nedladdning och nya `api.downloadPost` delar transport. POST-urval ligger i kroppen, med `no-store`, samma-origin credentials, epoch och abortsignal. Klienten inför ingen lagring av personnummer eller konfliktuppgifter i gemensam state.
- Gamla svar får inte ens uppdatera epoch. Kontextbyte under JSON-/Blob-läsning avbryter även när testtransporten ignorerar AbortSignal. Avsiktligt kontextbyte accepteras när fortfarande aktuellt. Oväntad ny serverepoch behåller spärravisering och lämnar inget lyckat innehåll. `context_changed`, medlemskapsspärr och avslutade/utgångna uppdrag behåller aviseringen; vanlig konflikt låser inte sessionen.
- Klient-RED `116cd87` belade 13 röda beteendeprov före ändrat transportbeteende. GREEN `69024c6` omfattar 16 godkända klientprov inklusive extra 401-/export-/felkroppsregression.

## Verifiering och kravspårning

Node 25.9.0 via `/opt/homebrew/opt/node@25/bin`.

| Kontroll | Faktiskt resultat | Delbevis |
|---|---|---|
| SQL-felmodell RED | 5 PASS / 1 avsiktligt FAIL | Minimerad periodfelväg saknades |
| Klient RED | 13 avsiktligt FAIL | Sena fel, Blob, epoch och typade detaljer |
| Klient och mandat GREEN | 22/22 PASS (16 klient + 6 mandat) | STU-06, DATA-01, DATA-02 |
| Befintlig session-channel/access-rules/pupil-register-model | 51/51 PASS | Oförändrade sessions-/modellregler |
| `npx oxlint app lib` | PASS | Statisk kompatibilitet |

Typkontroll `npx tsc --noEmit` PASS (exit 0). `git diff --check` på egna filer PASS.

## Avvikelser och begränsningar

- Befintliga TypeScript-parameter properties i `ApiError` stöds inte av Node strip-mode. De ersattes med likvärdiga explicita fält innan beteendeproven kördes RED; ingen ny körmiljö eller dependency behövdes.
- En gemensam request-funktion ersätter dubblerad JSON/GET-exportkod så att samma avbrottsgräns gäller alla transporter. Även null-/icke-objektfel behandlas generiskt.
- Riktig registerkonflikt med mandatprojektion och logg före svar implementeras/verifieras i 04-05 och 04-10. Denna plan förbereder transporten och testar syntetiska fetch-svar; den belägger inte en auditerad databastransaktion, exportmandat eller verklig HTTP-registerväg.
- Ingen UI ändrad. Databas-/browserprov, full grind i 04-21 och separat fasverifiering återstår. Kraven slutmarkeras inte av dessa delprov. Ingen verklig drift eller kommunanslutning godkänns.
- STATE/ROADMAP uppdateras av orkestratorn.
