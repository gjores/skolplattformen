---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "25"
subsystem: worker-deny-path
status: complete
completed: 2026-09-28
tags: [worker, wrangler, workerd, deny, audit, stability, probe]
requires: [04-23]
provides:
  - Fastställd och åtgärdad orsak till lokala Worker-avbrott på nekade anrop
  - denyResponse läser en oläst begärandekropp till slut (högst 1 MiB, ingen buffring) efter loggning och före svaret
  - Körskript för upprepade Worker-prov och nekandeflöden som aldrig gör ett avbrott till PASS
  - Regressionsprov för nekandevägens klientlivscykel, commit före svar och fail-closed
affects: [04-16, 04-17, 04-18, 04-19, 04-20, 04-21, 04-24]
requirements: [DATA-01, DATA-02]
requirements-addressed: [DATA-01, DATA-02]
requirements-finally-verified: []
tech-stack:
  added: []
  patterns:
    - "Nekandesvar: logga och committa först, läs sedan en oläst kropp till slut och kasta den, svara sist"
    - "Stabilitetsgrind: klassa PASS/FAIL/AVBROTT/BLOCKED ur anropsspår; baslinje ger MEASURED"
key-files:
  created:
    - work/pilot/phase4-worker-stability.mjs
    - work/pilot/phase4-worker-stability.test.mjs
    - web/lib/server/deny-path.test.mjs
  modified:
    - work/pilot/phase4-worker-execute-probe.mjs
    - web/lib/server/authz.ts
    - .planning/phases/04-best-ndigt-och-skyddat-elevregister/deferred-items.md
key-decisions:
  - "Orsaken är nekande med oläst begärandekropp. Den lokala Workern kan då inte återanvända anslutningen, wranglers ProxyWorker tappar nästa anrop och wrangler avslutas. Rättningen görs i denyResponse, som är gemensam för alla nekandevägar."
  - "Kroppen läses till slut och kastas (cancel räcker inte, A/B 5/5 avbrott). Läsningen stannar vid 1 MiB så att ett nekat anrop aldrig buffrar stora kroppar."
  - "Nekandet loggas och committas före kroppsläsningen, så att en långsam klient aldrig fördröjer eller hindrar nekandeloggen."
  - "Ingen grindrutin i run-mode.mjs och inget beroendebyte. Orsaken ligger i appens nekandeväg; wranglers fatala hantering redovisas som kvarstående risk."
actuals:
  tokens: 17000
  tasks: 3
  commits: 3
plan_head_before: 84ce7fbe82497a04215e9d64c36e9ef085d98142
duration: ca 50min
---

# Fas 4 plan 25: Worker-avbrott på nekade anrop – orsak och åtgärd

**Nekade anrop fäller inte längre den lokala protected-Workern. Orsaken var att nekandet svarade innan begärans kropp var läst. Wranglers lokala proxy tappade då nästa anrop på samma anslutning och avslutades. `denyResponse` loggar nu nekandet, läser en oläst kropp till slut och svarar sist. Före rättningen avbröts 16 av 25 körningar, efter rättningen 0 av 25. Allt är prövat lokalt med syntetiska data.**

## Baslinje (oförändrad kod, bygge `84ce7fb`)

`phase4-25-baseline.json`, status MEASURED:

| Körningar | Avbrott |
|---|---|
| 20 provkörningar (9 fall) | 11 (55 %) |
| 5 nekandeflöden à 200 anrop | 5 (100 %) |
| Totalt | 16 av 25 |

- Varje avbrott hade samma signatur. Anropet fick 500 utan kod och utan `X-Correlation-Id` på 2–4 ms och nådde aldrig appen (ingen rad i Workerns anropslogg).
- Samtliga 16 avbrott kom direkt efter ett **nekande med oläst kropp**: 14 `forbidden` (rektor) och 2 `mfa_required` (personnummer utan MFA). Inget avbrott kom efter ett 404 (kroppen läst i handlern) eller efter ett tillåtet anrop.
- Vid nästa anrop var wrangler död i 16 av 16 fall. Båda workerd-processerna levde med samma pid som vid start.
- Wranglers debuglogg (tillfälligt skriven till en 0600-fil) visade `Error inside ProxyWorker` med orsaken `Network connection lost.`. Därefter avslutades wrangler med ett tomt `✘ [ERROR]`.

## Prövade hypoteser (A/B, en variabel i taget)

| Hypotes | Prov | Resultat | Slutsats |
|---|---|---|---|
| H6 (ny): nekande med oläst kropp | Rektorns nekanden, bara flöde, samma bygge: med kropp / utan kropp | 5/5 avbrott (inom 6–19 anrop) / 0/5 på 1 500 anrop | **Slår av och på avbrottet** |
| H6 i appen | Tillfälligt bygge som läser kroppen före nekandesvar / som bara avbryter (`cancel`) den | 0/10 körningar / 5/5 avbrott | Kroppen måste vara **färdigläst** |
| H6, rättningen | Bygge med rättningen (`ee00e31`), samma flöden | 0/10 flöden (2 500 nekanden, alla loggade) | Bekräftad |
| Kontroll: tillåtna anrop | Lika många tillåtna anrop (kroppen läses) | 0/5 på 1 000 anrop | Tillåtna anrop påverkas inte |
| H1: händelser från stängda klienter fäller isolatet | Processläge vid avbrott; inspektör ansluten direkt till användar-Workern före första anropet | workerd lever utan omstart; 3/3 avbrott med 0 `Runtime.exceptionThrown` och 0 `console.error` | Avfärdad |
| H2: ROLLBACK mot tvingad stängning | Samma databaslivscykel med läst eller saknad kropp | 0 avbrott | Avfärdad |
| H3: ohanterat avslag | Tillfällig loggning av `unhandledrejection`/`error` (konstruktornamn) | Ett avslag (`Error`, avbruten ström) per postgres-klient: 3 per tillåtet och 4 per nekat anrop; 4/8 avbrott | Avslagen finns men styr inte avbrottet; separat fynd |
| H4: anslutningsgräns per anrop | Som H2 | 0 avbrott med oförändrat antal klienter | Avfärdad |
| H5: wrangler oberoende av appkod | Minimal Worker i tmp: oläst kropp, postgres-mönster (commit/rollback, 4 klienter), kloning, omslag, fördröjning, `waitUntil`, assets, observability | 0 avbrott på drygt 15 000 anrop | Utlösaren kräver appens nekandeväg; wrangler gör felet fatalt |
| `WRANGLER_LOG=debug` (04-23) | Körskriptet med `--wrangler-debug` | 8/13 avbrott | Maskerar inte; 04-23:s iakttagelse var en slump |

**Fastställd orsak:** Ett nekande före handlern svarade medan kroppen var oläst: `requireFunction`/`requireMfa` i `protectedRoute`, samt `no_session`/`csrf` i routes som använder `denyResponse`. Användar-Workern kunde då inte återanvända HTTP-anslutningen. Wranglers ProxyWorker skickade nästa anrop på den stängda anslutningen och fick `Network connection lost`. Det gav 500 utan kod, och wrangler behandlar felet som fatalt och avslutas. Utlösaren finns i appkoden och det fatala beteendet i wrangler 4.129.0.

## Åtgärd

- **`web/lib/server/authz.ts`:** `denyResponse` gör nu tre saker i ordning:
  1. Loggar och committar nekandet eller felet som tidigare (ny intern `deniedOrFailed`).
  2. Läser en oläst begärandekropp till slut med `discardUnreadBody`. Kroppen läses del för del och kastas, buffras aldrig och tolkas eller loggas aldrig. Över 1 MiB avbryts läsningen, och ett klientavbrott ignoreras.
  3. Lämnar svaret med kod och `X-Correlation-Id`.
- Rättningen täcker alla vägar via `denyResponse`: `protectedRoute`, `api/context` och `api/inbjudan/losen`.
- **Oförändrat:**
  - Mandat, MFA, same-origin och epoch prövas som tidigare.
  - Klientlivscykeln i `db.ts` och `events.ts` är orörd.
  - Loggfel ger fortfarande `audit_unavailable` (500) utan data.
- Ingen ändring i `run-mode.mjs` och inget versionsbyte.

## Regressionsprov RED → GREEN

`web/lib/server/deny-path.test.mjs` kör den riktiga `db.ts`, `authz.ts`, `events.ts` och tre routes. Bara `postgres`, `session.ts` och `env.ts` ersätts med `registerHooks`. Deny-konstruktorns parameteregenskaper i `db.ts` skrivs om i kroken, eftersom Node inte kan typstrippa dem.

Provet registrerar klienters livscykel (skapad, begin, commit/rollback, end), nekandeloggen och när kroppen är färdigläst i förhållande till svaret. Det kräver att:

- varje klient stängs innan nästa skapas och före svaret,
- sessionskontexten rullas tillbaka och stängs innan nekandeloggen öppnar en ny klient,
- nekandet committas före svaret,
- svaret har kod och korrelation, utan kroppsinnehåll i svar eller logg,
- ett loggfel ger 500 `audit_unavailable` med bara `{code, correlationId}`,
- kroppen är färdigläst före svaret, även för `context` utan session,
- en kropp på 2 MiB avbryts vid gränsen utan att buffras.

| | Resultat |
|---|---|
| Före rättningen (`84ce7fb`) | **RED 0/5.** Alla fem fallerade enbart på kroppsegenskapen; livscykel, commit före svar, kod, korrelation och `audit_unavailable` höll redan. |
| Efter rättningen (`ee00e31`) | **GREEN 5/5** |

Körskriptet står för regressionsbeviset i den verkliga körningsmiljön: 16/25 avbrott före och 0/25 efter.

## Stabilitetskörning

| Kontroll | Resultat |
|---|---|
| `node --test work/pilot/phase4-worker-stability.test.mjs` | PASS 7/7 |
| `phase4-worker-stability.mjs --runs 20 --flood-runs 5 --flood-calls 200` (bygge `ee00e31`) | **PASS 25/25**: 20 provkörningar à 9/9 och 5 nekandeflöden à 200/200 med 200/200 loggade nekanden, **0 avbrott** |
| Avbrottsfrekvens | Före: 55 % per provkörning och 100 % per flöde. Efter: 0 av 20 och 0 av 5. |
| 04-23:s prob oförändrad (`phase4-25-worker-probe.json`) | PASS 9/9 |
| `node --test lib/*.test.mjs lib/server/*.test.mjs` | PASS 394/394 |
| Uppgift 2:s fem filer | PASS 49/49 |
| `npx tsc --noEmit`, `npx oxlint app lib`, `npm run build` | Utan fel |

0 avbrott på 20 körningar är starkt stöd men inget matematiskt bevis. Med baslinjens sannolikhet på 0,55 per körning är chansen till 20 felfria körningar av en slump ungefär 1,2·10⁻⁷.

## Verktyg (uppgift 1)

- **`work/pilot/phase4-worker-stability.mjs`:**
  - Förkontrollerar målet med `assertTarget('protected')` och kräver samma bygge och migration som proben, annars BLOCKED.
  - Kör proben oförändrad N gånger, med egen Worker, port och rapport per körning.
  - Klassar varje körning som PASS, FAIL, AVBROTT eller BLOCKED och registrerar för avbrott anropets ordning, fall, route, förväntan, tid sedan föregående anrop och om wrangler/workerd lever.
  - Sparar Worker-utdata i 0600-filer i en 0700-katalog i tmp.
  - `--baseline` ger MEASURED och aldrig PASS.
- **`phase4-worker-execute-probe.mjs`:** har fått valfria `--deny-flood N`, `--flood-kind denied|allowed`, `--trace` och `--worker-log`. Allt är avstängt som standard. Fallistan, rapportformatet (ingen `flood`-nyckel utan flöde) och 04-23:s kommando är oförändrade.

## Avvikelser från planen

1. **[Regel 1, provlogik] Kontrollflödet med tillåtna anrop** underkände legitima personnummersvar, eftersom läckkontrollen matchade det syntetiska numret. Flödet kräver nu att numret finns i just den tillåtna visningen. Ändringen hittades och rättades före commit, i `e830d75`.
2. **Hypotes utanför planens lista.** Orsaken, nekande med oläst kropp (H6), fanns inte bland H1–H5. Alla fem prövades ändå och redovisas ovan.
3. **Kontrollflöden via ocommittad experimentkopia.** Isolerade flöden (bara flöde, valda anropstyper, utan kropp, väntan på inspektör) kördes med en ocommittad kopia av proben som togs bort efteråt. Alla tillfälliga ändringar återställdes före commit: diagnosloggen i `run-mode.mjs`, experimentbyggen av `authz.ts` och `unhandledrejection`-loggningen. De formella baslinje- och stabilitetskörningarna använder den committade proben.
4. **Grenskydd.** `gsd-tools` klassar `master` som skyddad gren. Projektet har `branching_strategy: none`, och orkestratorn angav sekventiell körning med vanliga commits i huvudarbetskopian. Commits gjordes därför på `master` som i tidigare planer, utan omskrivning av historik.
5. **`npm run build`** lämnar `web/dist` utan exempelmärkning. Därför kördes `npm run build:example` efteråt, så att `preview:example` fungerar som före planen.

## Kvarstående begränsningar

- Ett nekande med kropp över 1 MiB avbryter läsningen och kan fortfarande fälla den lokala wranglern. Våra klienter skickar inte sådana kroppar. I Cloudflares drift finns ingen ProxyWorker.
- Svar utanför `denyResponse` som lämnas med oläst kropp har inte prövats, till exempel `auth/logout` vid csrf. Alla POST-handlers via `protectedRoute` läser kroppen på den tillåtna vägen.
- Wrangler 4.129.0 behandlar fortfarande ett ProxyWorker-fel som fatalt (4.143.0 finns). Versionsbyte har inte gjorts och föreslås som separat beslut.
- **Separat fynd:** varje postgres-klient i Workern ger ett ohanterat avslag. Det påverkade inte avbrotten. Se `deferred-items.md`.
- Fas 3:s punkt 2, 6 och 7 har samma signatur och förklaras troligen av samma orsak. Det är inte verifierat i efterhand. Den avvisade kakan efter 17 h förklaras inte.
- Grindarna 04-16 och 04-18–04-21 ska använda körskriptet eller dess klassning. Ett avbrott blir aldrig PASS och kräver ny utredning.
- DATA-01 och DATA-02 är inte slutverifierade här. Syntetiska lokala prov godkänner varken verklig drift, IdP- eller kommunanslutning.

## Hotregister

- **T-04-25-01:** Obehöriga anrop kan inte längre fälla den lokala tjänsten. Beviset är 0 avbrott i 25 körningar, varav 1 000 nekanden i flöden.
- **T-04-25-02:** Nekandet committas före svaret och loggfel ger `audit_unavailable`. Det prövas i deny-path och i probens `persistent-audit`.
- **T-04-25-03:** Worker-loggar finns bara i 0600-filer i tmp. Rapporterna i `work/pilot/results` (gitignorerade) har granskats: 0 träffar på anslutningssträngar, tokens, sessionskakor, personnummer eller elevnamn.
- **T-04-25-04:** `--baseline` ger MEASURED, och AVBROTT, BLOCKED och ofullständiga körningar ger aldrig PASS. Det låses av nodprovet.

## Commits

- `e830d75`: körskript, nodprov och probens valfria flöden.
- `ee00e31`: rättning i `denyResponse` och regressionsprov.
- `b6bac10`: orsak, åtgärd och bevis i `deferred-items.md`.

## Self-Check: PASSED

- FOUND: work/pilot/phase4-worker-stability.mjs, work/pilot/phase4-worker-stability.test.mjs, work/pilot/phase4-worker-execute-probe.mjs, web/lib/server/authz.ts, web/lib/server/deny-path.test.mjs, deferred-items.md
- FOUND: e830d75, ee00e31, b6bac10 (3 commits uppmätta från `84ce7fb`)
