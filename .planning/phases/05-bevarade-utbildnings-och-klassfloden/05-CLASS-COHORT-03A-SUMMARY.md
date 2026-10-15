---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: CLASS-COHORT-03A
status: complete
completed: 2026-10-15
requirements: [ADMIN-04, PLANERING-04, PLANERING-05]
---

# Säkra och begripliga klasskonflikter

Båda planuppgifterna är genomförda. Namnkollision och låst utbildningsstart har typade felkoder, svenska klienttexter och slutna auditkoder. Den interna osäkra datumkällan använder befintlig `class_plan_not_ready`. Endast de specificerade SQL-hints med40001 mappas; andra konflikter förblir generiska och42501 avslöjar inga klassdetaljer. Auditfel blockerar fortfarande svaret.

Klasspanelen bevarar nu dessa säkra besked, stänger bekräftelsen och spärrar gammalt underlag tills användaren läst om. Det redan osäkra sparläget har fortsatt företräde. Inga nya rättigheter eller klassrelationer införs.

## Färska kontroller

- `cd web && node --test lib/server/class-timplan.test.mjs`:9 PASS, exit0. Riktig route/fail-funktion och klientens `api.post`/`ApiError` används, med simulerad SQL-anslutning. Provar de två nya koderna, källfelet, okända hints,42501, auditminimering och auditbortfall.
- `cd web && npx tsc --noEmit && npx oxlint app lib`:båda exit0.
- `cd web && npx playwright test -c playwright.usability.config.ts operational-class-timplan.spec.ts`:42 PASS, exit0,21 dator+21 telefon, inga skips/omprov/flaky. Sex nya kontroller visar de tre felbeskeden och krav på omläsning; tidigare års-/versionsflöden ingår. API-svaren är simulerade.
- Oberoende läsgranskning av alla sju filer och callers:inga blockerande fynd.
- Källbunden privat resultatreferens:`/private/tmp/class-cohort-03a-evidence-20261015.json`, SHA256 `62ad9258fb30e2f2a4a27dab9bb18af65e1078a694cb3d9ce3b46971dfbcac93`. UI-rårapport finns separat privat.

Första riktade provet visade förväntat att nya hintsen ännu blev generisk konflikt. En felaktigt för snäv auditassertion rättades efter att befintlig tillåten MFA-proveniens observerats; den slutliga assertionen kontrollerar kod, route och frånvaro av privata SQL-detaljer utan att ta bort proveniensen. Ett första skrivkommando använde fel relativ arbetskatalog och ändrade ingen fil.

## Avgränsning och nästa steg

Planens två extra UI-/provfiler är motiverade i PLAN:utan dem doldes de nya beskeden av panelens generiska409-text. Inga nya layouter införs. Inget nytt appbygge, faktisk Worker/OIDC eller byte av lokal3012 följer av dessa kontroller; faktisk lifecycle/startlås-API-kedja verifieras i08.

SS12000:2024/OpenAPI2.1.0-mappningen ändras inte av felkanalen. Ingen extern rättighet, export eller kommunanslutning verifieras. Fulla krav och fasacceptans är fortsatt öppna. Plan04/05 fortsätter samma våg före06.
