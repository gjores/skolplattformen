---
phase: 03-mandat-och-skyddade-datavagar
plan: "07"
subsystem: mandatbrowser, fasgrind, användarprov och handbok
tags: [mandat, audit, browserprov, fasgrind, engangskod, support, handbok, lokal-syntetisk]
status: complete
completed: true
requirements_completed: []
updated: 2026-09-27
requires: ["03-06"]
provides: ["mandatbrowser i protected-desktop, protected-phone och protected-built (web/e2e/phase3-mandates.spec.ts)", "färsk fasgrind verify:phase3 PASS på 278f235 med alla sex krav PASS (lokalt, syntetiskt)", "verifiering med engångskod inifrån dialogerna", "engångskod vid inloggning för konton med registrerad kod", "tidsbegränsad support för en elev eller en eller flera grupper", "handbok för mandatflöden, inloggningsmetoder och regler", "godkänt syntetiskt användarprov 2026-09-27"]
affects: ["fasverifiering fas 3 (gsd-verify-work)", "fas 4", "fas 6"]
key-files:
  created: [web/e2e/phase3-mandates.spec.ts, web/app/mfa-step-up.tsx, work/pilot/idp-realm-sync.mjs, work/pilot/phase2-otp-fixtures.mjs, supabase/migrations/20260927090000_phase3_support_groups.sql, docs/pilot/phase3-mandates.md]
  modified: [web/playwright.protected.config.ts, web/scripts/verify-phase3.mjs, web/scripts/verify-phase3.test.mjs, web/app/mandate-grant-dialog.tsx, web/app/mandate-workspace.tsx, web/app/logg-workspace.tsx, web/app/protected-home.tsx, web/app/pupil-probe-workspace.tsx, web/app/api/auth/callback/route.ts, web/lib/server/oidc.ts, web/lib/mandate-policy.ts, web/lib/mandate-policy.test.mjs, web/lib/pupil-probe-model.ts, web/lib/unsaved-changes.tsx, web/e2e/helpers/keycloak.ts, web/e2e/phase2-access.spec.ts, work/pilot/idp/realm-template.json, work/pilot/phase3-browser-fixtures.mjs, work/pilot/verify-access.mjs, work/pilot/verify-mandates.mjs, supabase/tests/phase3_mandates.test.sql, supabase/tests/phase3_policy.test.sql, docs/handbok/anvandning.md, docs/handbok/inloggningsmetoder.md, docs/handbok/mandat.md, docs/handbok/regler.md, docs/handbok/sakerhetslogg.md, work/pilot/results/phase3-summary.json, .planning/phases/03-mandat-och-skyddade-datavagar/03-VALIDATION.md, .planning/phases/03-mandat-och-skyddade-datavagar/deferred-items.md]
decisions:
  - "Användarbeslut 2026-09-27: engångskod anges vid inloggningen för den som har registrerad kod; övriga loggar in med lösenord. Beviset gäller 8 h som tidigare; step-up är reserv"
  - "Användarbeslut 2026-09-27: tidsbegränsad support kan gälla en namngiven elev eller en eller flera grupper på en skola; övrigt oförändrat (högst 60 minuter, angivet syfte, godkänt av rektor, ingen export)"
  - "IdP:n tvingar inte fram registrering av engångskod; registrering för administrativa konton utan kod i piloten är ett öppet beslut"
  - "Fas 2:s OTP-fixtur registrerar om de fem syntetiska fas 2-kontona före fas2-browser i grinden; MFA-kravet är oförändrat"
  - "Grindens regressionsbrowser godtar bara redovisade projekthopp"
  - "Användarprovet 2026-09-27 godkänt som syntetiskt användarprov; det godkänner inte verklig drift, verklig IdP eller kommunanslutning"
metrics:
  duration: "ca 1 h 2026-09-26 (uppgift 1) samt ca 2 h 2026-09-27 (rättning av avvikelser och ny grind); användarprov utöver det"
  completed: 2026-09-27
actuals:
  tokens: 63558
  tasks: 2
  commits: 14
plan_head_before: 86c1f5834ceca0c649d08d094e7491c31174a1e8
---

# 03-07 — mandatflöden på dator och telefon, fasgrind och användarprov

Rektor, huvudman, lärare, elevhälsa, IT, support och granskare har provats i den skyddade arbetsytan på dator och telefon med riktig lokal OIDC-inloggning mot syntetiska data. Den färska fasgrinden `npm run verify:phase3` gav **PASS** på revision `278f235` 2026-09-27 (11:43–12:13 UTC), med alla steg och alla sex fas 3-krav PASS lokalt och syntetiskt. Användaren godkände det förnyade användarprovet 2026-09-27 ("allt verkar funka bra").

Detta är genomförande, automatiskt bevis mot syntetiska data och ett godkänt syntetiskt användarprov. Det är inte fasverifiering (gsd-verify-work återstår), inte verklig drift och ingen verklig IdP- eller kommunanslutning. Inga krav är markerade som verifierade i REQUIREMENTS.md.

## Uppgift 1 — mandatbrowser, grind och handbok (2026-09-26)

- **Mandatbrowsern** `web/e2e/phase3-mandates.spec.ts` upptäcks av toppnivåns testMatch och av protected-desktop, protected-phone och protected-built. Den provar att huvudman utser rektor, att rektor ger och avslutar läraruppdrag, skol-/elev-/ärendeavgränsad elevhälsa, supportens godkännande och utgång, IT utan elevinsyn och att granskaren följer elevläsning, export och nekanden. Proven omfattar tangentbord, fel, pekytor, flikrensning och nätverksinnehåll. Första körningen: 12 flöden × 3 projekt = 36 PASS (e243b4a).
- **Rättade fel som proven hittade** (7b10da7, 2cf7f38): fas 2:s OTP-fixtur (TOTP-uppgiften för `anna.admin` matchade inte sparad hemlighet), grinden godtar bara redovisade hopp, dialogfokus i tilldelningsdialogen, loggvyns svarsordning och hängande sessionskontroll vid återkomst.
- **Handboken** (7d4ec8d): mandat, användning, säkerhetslogg och regler. Endast användarinstruktioner och regler, enligt användarens avgränsning 2026-09-23. Teknisk rapport i `docs/pilot/phase3-mandates.md`.
- **Grind** på 7d4ec8d: PASS (0338c7c). Planen stannade vid användarcheckpointen (be144f0).

## Uppgift 2 — användarens granskning (checkpoint)

### Första provet 2026-09-26/27: inte godkänt

Användaren rapporterade tre avvikelser (ec7b7ae). De rättades inom 03-07:

| Avvikelse | Typ | Rättning | Commit |
|---|---|---|---|
| Knappen *Verifiera med engångskod* låg bakom den modala dialogen; rektor kom inte vidare vid tilldelning av lärare och support | Fel | Tilldelnings- och avslutsdialogen visar egen verifieringsruta (`web/app/mfa-step-up.tsx`). Proven gör step-up inifrån dialogen med tangentbord respektive pekskärm | 43c6b79 |
| Engångskoden ska frågas vid inloggning, inte vid åtgärd | Användarbeslut | Nivå 2-flödet har villkoret `conditional-user-configured` och varje inloggning begär `acr_values=2`. Konto med kod: lösenord + kod ger acr 2. Konto utan kod: lösenord ger acr 1. Serverns beviskontroll är oförändrad. Körande IdP uppdaterad med `idp-realm-sync.mjs` | d9499dc |
| Support ska kunna ges för grupper | Användarbeslut | Migration 20260927090000: exakt en skola, minst en grupp, ingen elev och inga ärenden. Övriga villkor oförändrade. Tillämpad lokalt utan reset | 2d17d4c |

Handboken beskriver engångskod vid inloggning och support för grupper (4fb5773). docs:build PASS.

### Grind efter rättningarna

- **4fb5773: FAIL.** access-api fick HTTP 500 i fallet `mfa-kravs` och därefter `fetch failed` när provets Worker slutade svara. Fristående körning direkt efteråt gav 16/16. Körningen står kvar som FAIL. Orsaken är **inte fastställd** (deferred-items punkt 2, 6 och 7). Workerns utskrift sparas nu privat i `work/pilot/targets/protected/logs/verify-access-worker.log` (gitignorerad) för nästa gång felet uppträder (278f235).
- **278f235: PASS**, alla 25 steg och inga valideringsfel (f3a42b6). Rapport: `work/pilot/results/phase3-summary.json`.

| Krav | Bevissteg | Resultat |
|---|---|---|
| ACL-02 | sql (565), access-api (16), mandat-api (26/139), fas3-arbetsyta-browser (18), fas3-mandat-browser (45) | PASS |
| ACL-03 | som ACL-02 | PASS |
| ACL-04 | modeller (305), sql, mandat-api, fas3-arbetsyta-browser, fas3-mandat-browser | PASS |
| ACL-05 | som ACL-04, inklusive support för grupper | PASS |
| AUDIT-02 | sql, access-api, mandat-api, källbevis (4 vägar, 3 avbrott), båda fas 3-browsersviterna | PASS |
| AUDIT-03 | sql, mandat-api, källbevis, fas3-mandat-browser | PASS |

Regressioner i samma körning: baslinje-db PASS (gymnasiets utbildningar och kurs-/nivåtillägg, kullkopiering, klass–timplan, grundskolans timplan), fas 1-browser 26 PASS (1 redovisat hopp), fas 2-browser 37 PASS (19 redovisade hopp).

### Förnyat prov 2026-09-27: godkänt

Användaren provade på dator i den byggda protected-previewn (http://127.0.0.1:3000, bygget från 278f235):

- p3.rektor loggar in med lösenord och engångskod (nytt beteende) och tilldelar lärare utan någon extra verifieringsfråga.
- Rektor ger tidsbegränsad support för grupper och för en namngiven elev.
- p3.support ser det som supporten ger.
- p3.larare loggar in med enbart lösenord.
- p3.huvudman loggar in med engångskod.

Inga avvikelser rapporterades. Elevhälsoavgränsning, IT:s pausa/aktivera och loggfelssituationen nämndes inte uttryckligen i svaret; för dem är beviset mandatbrowsern i grinden (03-VALIDATION.md). Svaret registreras som **godkänt 2026-09-27 (syntetiskt användarprov, dator; telefon i enhetsläge/automatiskt WebKit)**. En fysisk telefon användes inte, eftersom den skyddade stacken bara nås på localhost. Telefonbeviset är mandatbrowserns WebKit i iPhone-storlek.

## Avvikelser från planen

1. **Tre avvikelser från användarprovet** rättades inom planen (tabellen ovan). Två av dem är användarbeslut som ändrar beteende: engångskod vid inloggning och support för grupper.
2. **Filer utöver planens lista:** webbens dialoger och OIDC-flöde, migrationen för gruppsupport, IdP-mallen och `idp-realm-sync.mjs`, fas 2:s OTP-fixtur, SQL-prov, fler handbokssidor och resultatfiler. Alla följer av avvikelserna eller av fel som proven hittade.
3. **Hela grinden kördes tre gånger i planen** (7d4ec8d PASS, 4fb5773 FAIL, 278f235 PASS). Den senaste PASS-körningen är den som gäller.
4. **Commits på master** enligt projektets praxis (`branching_strategy: none`).
5. **Uppmätt antal commits** `git rev-list --count 86c1f58..HEAD` = 14 före denna SUMMARY-commit. Av dem är aa5c0f8 orkestrerarens todo-commit, inte en 03-07-ändring; 13 commits hör till planen.

## Öppna verksamhetsbeslut

- **Elevhälsoansvarigs egen elevinsyn.** Funktionen har nu ingen egen elevläsning och ser inga elever i tilldelningsurvalet.
- **Osparad tilldelning efter verifiering.** Formuläret återställs inte efter step-up-omdirigeringen; dialogen säger det. Med engångskod vid inloggning behövs step-up normalt först efter 8 timmar.
- **Felkod för support före starttid.** Ger `assignment_expired` i stället för `assignment_upcoming` (deferred-items punkt 1). Behörigheten är rätt; webbens tilldelning startar alltid support "från nu", så fallet uppstår inte i UI:t.
- **Administrativa konton utan engångskod.** De får beskedet att koden saknas men kan inte registrera en kod från plattformen (deferred-items punkt 8). Hur de får en kod i piloten, i kommunens IdP, är inte beslutat.
- **Fysisk telefon.** Den lokala miljön är bunden till den här datorn. Att göra den nåbar, till exempel med Keycloak på LAN, kräver ett separat beslut.
- **Verklig support, lagringstid och kommunanslutning.** Supportens syfte är i provmiljön fast `synthetic-troubleshooting`. Verkliga syften, tidsgränser, lagringstid (syntetiskt 30 dygn) och kommunanslutning är inte beslutade eller prövade.

## Uppföljning och uppskjutet

- **Leverantörens systemadministration i gränssnittet** (todo `.planning/todos/pending/2026-09-27-leverant-rens-systemadministration-skapa-kunder-och-f-rsta-i.md`, aa5c0f8). Användaren saknar en "supersystemadmin" för att sätta upp kunder och huvudmän i gränssnittet. Det är inte en avvikelse i fas 3. I dag skapas en ny kund och dess första kundadministratör med en personbunden inbjudan via CLI (fas 2 D-04), och fas 2 D-12 utesluter en generell adminvy för leverantören. En sådan funktion kräver ett uttryckligt beslut som preciserar D-12 och hör till fas 6 eller en egen fas. Den är inte genomförd här.
- **Workern som stannar i access-regressionen** (deferred-items punkt 2, 6 och 7). Tre gånger oförklarat, alltid reproducerbart grönt vid omkörning. Utskriften sparas nu privat för felsökning.
- **Fasverifiering.** Nästa steg är gsd-verify-work för fas 3. Kraven ACL-02–05 och AUDIT-02–03 markeras som verifierade först av gsd-verifier.

## Known Stubs

Inga nya. Supportsyftet `synthetic-troubleshooting` är ett avsiktligt fast provvärde och redovisas som öppet beslut ovan.

## Self-Check: PASSED

- Filerna finns: `web/e2e/phase3-mandates.spec.ts`, `web/app/mfa-step-up.tsx`, `work/pilot/idp-realm-sync.mjs`, `work/pilot/phase2-otp-fixtures.mjs`, `supabase/migrations/20260927090000_phase3_support_groups.sql`, `docs/pilot/phase3-mandates.md`, `work/pilot/results/phase3-summary.json`.
- Commits 7b10da7, 2cf7f38, e243b4a, 7d4ec8d, 0338c7c, be144f0, ec7b7ae, 43c6b79, d9499dc, 2d17d4c, 4fb5773, 278f235 och f3a42b6 finns i git log.
- `phase3-summary.json`: status PASS, gitRevision 278f235, scope local-synthetic-only, alla 25 steg PASS.
