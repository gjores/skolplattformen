---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "16"
wave: 10
status: complete
completed: 2026-09-29
requirements-addressed: [STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02]
requirements-finally-verified: []
commits: [0487441, abb531d]
---

# Fas 4 plan 16: Syntetiska registerprov

Planen är genomförd i det isolerade `protected`-målet. Full API-körning gav **18/18 PASS** (`work/pilot/results/phase4-api.json`, gitignorerad). Ett riktat webbläsarprov med lokal Keycloak gav **1/1 PASS**: två separata inloggningar med engångskod hittade samma två namnlika elever, och den andra laddade ned en CSV med just dem. Detta är lokala syntetiska prov, inte kommunanslutning eller godkänd pilotdrift.

## Ändringar och faktisk verifiering

- `phase4-fixtures.sql` och `phase4-browser-fixtures.mjs` skapar fasta syntetiska elev-ID, två namnlika elever, skyddad elev, framtida/avslutad placering, klass- och kommunscenario samt 55 rader för paginering. De ger separata provkonton för skyddad och vanlig administratör, lärare, annan skola/kund, huvudman, rektor och support. Skyddsbehörigheten ges med huvudmannens riktiga kontrollväg. Körning mot skyddat mål PASS; upprepad körning är idempotent. Privata provlösenord ligger i ignorerad fil med läsrätt för ägaren. Commit `0487441`.
- `verify-register.mjs` kräver `assertTarget`, byggd protected-Worker och alla 18 namngivna fall. Varje fall har både svarskontroll och beständig databas-/loggkontroll. Tillfälliga ändringsfall klonar egna syntetiska elever och städar bara dessa. Rapporten innehåller inga personnummer eller råa elevvärden. `--case` ger `PARTIAL`; okänt fall eller saknat bevis kan inte ge `PASS`. Tre Node-kontraktstester PASS. Commit `abb531d`.
- Direktprov nekades för rollerna `anon` och `authenticated` på nio nya tabeller och nio registerfunktioner per roll. Ett nekat HTTP-RPC-anrop korrelerades med serverns ID till fas 3-insamlarens faktiska minimerade Kong-logg; den innehöll inte de syntetiska fältvärdena.
- Webbläsarprovet i `phase4-register-evidence.spec.ts` använder riktig lokal OIDC/engångskod och en riktig CSV-nedladdning. Typkontroll och oxlint PASS. Appens produktkod ändrades inte i denna plan; provet kördes mot tidigare byggd protected-Worker, revision `2ddc0bd`.

## Krav till prov

| Krav | Namngivna prov |
|---|---|
| STU-01 | register-reload, search-filter, retired-probe, webbläsarens nya inloggning |
| STU-02 | placement-change, class-change, concurrent-edit |
| STU-03 | source-discrepancy med båda uttryckliga källval |
| STU-04 | historical-readonly, audit-register-read-fail |
| STU-05 | protected-admin, protected-teacher, protected-unauthorized, protected-direct, protected-grant-revoke |
| STU-06 | export-selection, export-direct-denied, export-personnummer, riktig CSV-nedladdning |
| DATA-01 | beständiga placeringar/historik, direkt-ACL och retired-probe |
| DATA-02 | objektloggar, källkorrelation, loggfel och återkallad session/behörighet |

Fullkörningen omfattar även att en skyddad namnkonflikt ger auditerat 409 för behörig administratör, att obehörig inte får namnet, och att loggfel döljer uppgifter och rullar tillbaka mutation. Förhandsgranskning följd av återkallad session respektive skyddsbehörighet ger ingen CSV. Personnummerexport prövas med enbart syntetiskt nummer.

## Gräns och nästa steg

De äldre fas 3-API-/browserproven mot avvecklat elevprov är fortfarande övergångsröda och ägs av 04-18. Hela UI-flödet på dator och telefon återstår i 04-19; den samlade kravgrinden i 04-20, handbok/slutgrind i 04-21 och mänskligt användarprov i 04-22 återstår. Inget av de åtta kraven markeras slutverifierat av denna plan. Provets lokalt mintade API-sessioner använder testrealmens bevisprofil; bara det riktade browserprovet använder verklig interaktiv Keycloak-inloggning. Webbläsarprovet kördes på desktop, inte på fysisk telefon.
