---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "18"
wave: 11
status: complete
completed: 2026-09-29
requirements-addressed: [DATA-01, DATA-02]
requirements-finally-verified: []
commits: [bb042ed, 99b9d42, 69b0a76, 92e9349]
---

# Fas 4 plan 18: Bevarade fas 3-gränser mot elevregistret

Planen är genomförd mot det isolerade `protected`-målet med syntetiska uppgifter. De tidigare fas 3-fallnamnen är bevarade, medan anrop och provdata nu använder elevregistret. **Mandat-API 26/26, access-API 16/16, arbetsyta i webbläsare 18/18 och mandatbrowser 45/45 PASS.** Källrapporten är PASS med fyra direkta nekandeprov och tre omstarts-/återhämtningsprov för Kong, Storage och Postgres. Detta är lokal regression, inte en kommunal anslutning.

## Ändringar och bevis

- `verify-mandates.mjs` behåller alla 26 fall och prövar lärare, skoladministratör, elevhälsa, support, främmande objekt, samtidiga återkallelser och loggfel genom registrets lista, kort och export. `collect-denials.mjs` använder nu stängda registertabeller och register-RPC i stället för borttagna elevprovsobjekt. Full körning skrev `phase4-mandates-regression.json` och `phase4-denials-regression.json`, båda gitignorerade. Källan bygger på faktiska minimerade Docker-loggar och serverkorrelation, inte egenproducerade händelser. Commit `69b0a76`.
- `verify-access.mjs` behåller 16 gamla fall. Dess `phase3-pupils`-fall har 28/28 kontroller för lista, kort, ärendescope, export, supportens tids- och syftesuppgifter, återkallelse och att loggfel stoppar innehåll. Full rapport `phase4-access-regression.json` är PASS. Commit `bb042ed`.
- `phase3-workspace.spec.ts` och `phase3-mandates.spec.ts` använder Elever-vyn och registrets API, med samma testtitlar, tillfälliga syntetiska registerrader och utan hoppade fall. Färsk fas 3-fixtur PASS. Planens exakta Playwright-listningar och körningar gav arbetsyta **18/18** på dator/telefon samt mandatflöden **45/45** på dator/telefon/byggd app. TypeScript och oxlint PASS. Commit `92e9349`.
- De två browserrapporterna sparades separat i gitignorerade `phase4-workspace-browser-regression.json` och `phase4-mandates-browser-regression.json`. Båda har `unexpected=0` och `skipped=0`; arbetsytan kördes dessutom om efter kodcommiten.
- `verify-phase3.mjs` skickar portade access-, mandat- och källprov till nya fas 4-resultatfiler så att historiska fas 3-rapporter inte skrivs över. Rapportvalidatorns 13 prov och källinsamlarens 19 prov PASS (32/32 tillsammans); fallnamn, rapporttyp och fullständighetskrav är oförändrade. Commit `99b9d42`.

## Krav till prov

| Krav | Prov och utfall |
|---|---|
| DATA-01 | 26/26 mandat-API, 16/16 access-API, 18/18 arbetsyta och 45/45 mandatbrowser: tilldelad elev, ärende, klass/grupp och skola ger avgränsad registerprojektion; främmande och okända objekt ger inget elevinnehåll. |
| DATA-02 | Varje prövad läsning, export och nekande kopplas till beständig logg; loggfel stoppar innehåll; direkta REST/RPC/SQL/Storage-vägar samt källavbrott har faktiska källbevis. |

## Kvarstående gräns

När ett supportuppdrag upphör låses elevuppgifterna och direktläsning nekas. Lås-dialogen kan ibland visa ”Kontexten ändrades i en annan flik” när epokhändelsen hinner före den mer specifika texten om uppdragets sluttid. UX-texten ska granskas i 04-19; åtkomstgränsen passerade. Den samlade fas 4-grinden (04-20), handbok/slutgrind (04-21) och mänskligt användarprov (04-22) återstår. DATA-01 och DATA-02 markeras inte slutverifierade här.
