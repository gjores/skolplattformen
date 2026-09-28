---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "08"
subsystem: pupil-register-audit
tags: [audit, data-minimization, transactions, conflicts]
requires: [04-01]
provides: [stängda registermetadata, objekthändelser före svar, nekad konfliktändring och tillåten konfliktläsning]
affects: [04-09, 04-10, 04-11, 04-13, 04-17, 04-21]
tech-stack:
  added: []
  patterns: [logEvent i befintlig transaktion, fail-closed AuditUnavailable, interna SQL-auditreferenser]
key-files:
  created: [web/lib/server/pupil-register-audit.ts, web/lib/server/pupil-register-audit.test.mjs]
  modified: [web/lib/server/audit-details.ts, web/lib/server/events.test.mjs]
completed: 2026-09-28
requirements-completed: []
---

# Fas 4 plan 08: Minimerad registerlogg och flera händelser i samma transaktion

Stängda metadata och en serverhjälpare för objektspårbar skyddad visning, separata personnummerhändelser samt typade konflikter utan lyckad ändringshändelse.

## Genomförande

- 04-08-01: `/api/elever` normaliseras utan elev-id, pathsegment eller sökfråga. Slutna action/field/fields/readForm-värden, heltalsläsår i modellens intervall 1–9998 och ändliga heltalsantal. Inga namn, personnummer, sökord, källvärden eller boolesk skyddsmarkör i generiska metadata. Commit `59096f3` (övre läsårsgränsen preciserad mot modellen i följande uppgift).
- 04-08-02 (commit `e51c8a7`): `auditPupilRegisterResult(tx,ctx,result,operation)` kör riktiga `logEvent` i anroparens transaktion. SQL-resultat ska ha `kind=success,body,auditRefs` eller `kind=conflict,details,auditRefs`. Varje referens är exakt `{kind,pupilId}` med kind `protected`, `personal-number` eller `personal-number-export` och giltigt UUID. Felaktiga/saknade referenser stoppas; ingen count-only-reserv finns.
- Skyddad visning dedupliceras per elev och svar (lista, kort, historik och konflikt). Personnummervisning och personnummerexport har olika objekthändelser; personnummervisning kräver motsvarande objektreferens. SQL:s mandatprövning äger vilka referenser som faktiskt får lämnas, hjälparen ger ingen egen åtkomst.
- Konflikt loggar uttrycklig ursprunglig ändringsåtgärd med `outcome=denied` och skyddad visning innan den returnerar HTTP409-underlag. Huvudhändelsen blir `pupil_conflict_read`; `protectedRoute` kan därmed skriva sin obligatoriska `outcome=ok` utan att påstå att ändringen lyckades. Body är `{code:'conflict',details}` och bevaras av den verkliga registerklientens felparser.
- Huvudhändelsen överlåts fortsatt till `protectedRoute`; ingen egen transaktion eller HTTP-retur skapas. Varje extraloggningsfel blir `AuditUnavailable` utan råa fel eller delvis publikt svar. `auditRefs` finns bara internt och tas dessutom bort rekursivt ur framgångssvarets JSON-body.

## Verifiering och kravspårning

Node 25.9.0 via `/opt/homebrew/opt/node@25/bin`. Tester skrevs före respektive funktionsändring; metadatafallet visade fel ruttkategori före implementation. Hjälpprovets första körning stoppades av ännu saknad modul. Testernas lokala laddare transformerar bara befintliga `db.ts`-konstruktorers TypeScript och ersätter Worker-bindings med tomt testobjekt. Produktionshjälparen, `logEvent`, sanitizer, `AuditUnavailable` och klientens felparser körs oförändrade.

| Kontroll | Faktiskt resultat | Krav som får delbevis |
|---|---|---|
| `node --test lib/server/events.test.mjs` | 7/7 godkända efter implementation | DATA-01, DATA-02: slutna metadata och inga värden i tillåtna nycklar |
| `node --test lib/server/pupil-register-audit.test.mjs lib/server/events.test.mjs` | 16/16 godkända | DATA-01, DATA-02: skyddad objektspårning, typad konflikt, personnummerhändelser, rensning och fail-closed |
| `npx oxlint lib/server/audit-details.ts lib/server/events.test.mjs lib/server/pupil-register-audit.ts lib/server/pupil-register-audit.test.mjs` | Godkänd | Statisk kontroll |
| `npx tsc --noEmit` | Godkänd (egen körning, exit 0) | Typkontrakt |
| `git diff --check` för planens filer | Godkänd | Ändringshygien |

Felen på första och andra extrahändelsen samt huvud-event efter två extrahändelser prövades med **simulerad transaktionsgräns**: inga rader committas och inget detaljsvar lämnas. Detta är inte bevis för rollback i PostgreSQL eller en färdig API-väg. Register-API, verklig SQL-projektion av auditRefs och PostgreSQL-rollback måste kopplas och verifieras i senare API-/grindplaner. Inget krav slutverifieras av dessa snabbprov.

## Avvikelser och preciseringar

Ingen utökad produktomfattning. Korrigerat konfliktfältet till `code` enligt befintlig klient; regressionen går från helperns body till `ApiError.details`. Begränsad testtransformering behövs eftersom Node:s strip-only inte stöder befintliga parameter properties i `db.ts`; produktionsmodulen ändras inte. Inga nya beroenden.

## Fortsättning

Anropa hjälparen enbart från `protectedRoute`-handler före retur, med SQL-prövade referenser och `audit:'required'`. Returnera hjälparens `event`, `body` och eventuella `status`; fånga inte `AuditUnavailable` som ett normalt 409-svar. Senare skrivplaner måste returnera typat konfliktsvar i samma transaktion och inte kasta `Deny` efter att konfliktdata lästs. Full fasgrind 04-21 och separat GSD-fasverifiering återstår. Orkestratorn äger STATE/ROADMAP. Verklig drift eller kommunanslutning har inte prövats.
