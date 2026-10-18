---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TIMPLAN-HOURS-CHECK
type: execute
status: delivered-awaiting-user
depends_on: [PLANNING-FLOW-UX-06]
autonomous: true
files_modified:
  - web/lib/timplan-budget.ts
  - web/app/protected-timplan-budget.tsx
  - web/app/protected-gym-timplan-time.tsx
  - web/app/protected-gym-timplan-hours.tsx
  - web/lib/server/plan-decision.ts
  - supabase/migrations/
  - web/e2e/timplan-hours-check.spec.ts
  - web/playwright.timplan-hours-check.config.ts
  - docs/handbok/timplaner.md
  - docs/handbok/apl-planering.md
must_haves:
  truths:
    - Tabellen visar miniminivå, planerat och återstående för hela utbildningens GUT och yrkes-APL.
    - Kontrollen räknar om medan användaren skriver och gör osparad status tydlig.
    - Ofullständiga timutkast kan sparas, men otillräckliga ramar kan inte skickas eller godkännas.
    - Högskoleförberedande program har ingen APL-kontroll eller APL-inmatning.
  artifacts:
    - web/lib/timplan-budget.ts
    - web/app/protected-timplan-budget.tsx
    - web/e2e/timplan-hours-check.spec.ts
  key_links:
    - UI räknar på synliga utkast; server och SQL räknar självständigt på aktuell sparad plan.
    - GUT-profilen härleds från stödd fryst källa och programomfattning.
---

<objective>
Täta den upptäckta luckan efter att periodplanering flyttats: redan timtabellen ska visa om tillräcklig total undervisningstid och års-APL har reserverats. Perioder är fortfarande ett senare moment.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/STRUCTURE.md
@.planning/codebase/TESTING.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-VERIFICATION.md
@web/lib/programplan-profile.ts
@web/lib/gym-timplan-distribution.ts
@web/lib/timplan-time.ts
@web/e2e/fixtures/planning-flow-data.ts
</context>

## Avgränsning och regelgrund

Beställt av användaren 2026-10-18: tillräckliga timmar måste kontrolleras redan när tabellen planeras. Basleveransen 3a2edf3 på 3012 och dokumentationshuvudet 3c798e7 är tidigare bevis, inte bevis för denna ändring.

GUT hämtas från den befintliga verifierbara programprofilen; ingen generell nivå antas för okänd källa eller avvikande poängomfattning. Yrkesprogrammens grundläggande APL-ram är 15 × 23 = 345 undervisningstimmar för hela utbildningen. Det är en budgetkontroll, inte ett intyg om 15 faktiskt genomförda eller korrekt förlagda veckor. Lärling, undantag, individuella rättigheter, arbetsmiljö och genomförande kan inte avgöras av summan. Källor: [Skolverkets stöd om att organisera APL](https://www.skolverket.se/larande-och-trygghet/elevens-fortsatta-studier-och-arbetsliv/yrkesutbildning-och-arbetsplatsforlagt-larande-apl/organisera-arbetsplatsforlagt-larande-apl) och [gymnasieförordningen 4 kap. 12 och 14 §§](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/gymnasieforordning-20102039_sfs-2010-2039/). Root ansvarar för aktuell officiell källkontroll i leveransbeviset.

Inget minimiantal timmar per ämne, kurs, nivå, termin eller årskurs införs. APL räknas inom totalen, inte ovanpå. Högskoleförberedande program får ingen APL-ruta. Ingen historisk godkänd timplan eller äldre kvittosnapshot skrivs om.

## SS 12000

Avstämning mot SS 12000:2024 utgåva 4 och OpenAPI 2.1.0 enligt projektets genomgående baslinje. Interna timbudgetar och beslutsblockerare är inte Attendance, Placement eller intyg om genomförd undervisning. Ingen ny extern objektmappning tillkommer. Stabil plan-, skolenhets-, utbildnings- och versionsidentitet samt fryst källa och källansvar bevaras. Ingen implicit klasskoppling eller medlemskapsändring får ske. UI-prov mot syntetiskt API bevisar inte ett faktiskt standardutbyte.

<tasks>
<task type="auto">
<name>1. Synlig timkontroll i tabellen och oberoende beslutsspärr</name>
<files>web/lib/timplan-budget.ts, web/app/protected-timplan-budget.tsx, web/app/protected-gym-timplan-time.tsx, web/app/protected-gym-timplan-hours.tsx, web/lib/server/plan-decision.ts, supabase/migrations/</files>
<action>Root inför gemensam ren budgetberäkning och regionen Kontroll av planerade timmar. Visa miniminivå, planerat, återstår/saknas separat för total GUT och års-APL. Använd synliga osparade celler i båda tidsmodellerna, utan att göra osparade värden till sparat beslutsunderlag. Backend inför oberoende kontroll vid submit och approve, även direkt RPC, men blockerar inte vanlig rad-/utkastssparning under minimum. Bevara mandat, CAS, historiska beslut, replay och samtidighetskontroller. Behåll perioder och rektorsbekräftelse utanför tabellbeslutet.</action>
<verify>Modellfall: exakt gräns, en minut under, över, otillräcklig GUT med tillräcklig APL och tvärtom, okänd källa, båda tidsmodeller. Server/SQL: direkta submit/approve under gräns nekas, utkastsspar tillåts, aktuell sparad revision avgör, kvitton och klass-/källidentiteter bevaras.</verify>
<done>För låg ram syns vid inmatning och kan inte godkännas genom att kringgå UI. Tillräcklig budget presenteras utan påstående om full rättslig beredskap.</done>
</task>
<task type="auto">
<name>2. Verifiera beteendet, uppdatera handbok och förbered exakt leverans</name>
<files>web/e2e/timplan-hours-check.spec.ts, web/playwright.timplan-hours-check.config.ts, docs/handbok/timplaner.md, docs/handbok/apl-planering.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TIMPLAN-HOURS-CHECK-SUMMARY.md</files>
<action>UI-agent använder verklig skyddad React-arbetsyta med tydligt simulerade API-svar på dator och telefon. Prova yrkesplan med tillräcklig GUT men för låg APL, under-GUT på yrkes- och högskoleförberedande program, liveberäkning innan blur/sparanrop, samt att utkast fortfarande sparas under gränsen. Root uppdaterar handbokens besked om tabellkontroll kontra senare perioder och bygger dokumentationen. Sammanför nya modell/server/SQL/UI-bevis och relevant regression. Förbered och verifiera kandidat separat innan eventuell lokal installation; inget automatiskt byte från denna plan.</action>
<verify>Ny Playwright-svit dator/telefon, relevanta tidigare planeringsprov, tsc, lint, skyddat appbygge och docs:build. Granska färska bilder. SQL och verklig OIDC-kandidat redovisas skilt från simulerat API. Lokalt byte ska avse exakt verifierad kandidat och bevara befintliga data.</verify>
<done>Resultatet är reproducerbart dokumenterat med kvarstående begränsningar. Äldre gröna prov har inte ändrats för att dölja nytt beteende.</done>
</task>
</tasks>

<success_criteria>Timplanens budget är tydlig medan användaren arbetar; utkast kan sparas; submit och approve kräver tillräcklig total och yrkes-APL. Ingen ny kurs-/årskursregel, ingen APL på högskoleförberedande program, ingen falsk uppgift om genomförande.</success_criteria>
<output>Skriv 05-TIMPLAN-HOURS-CHECK-SUMMARY.md med separat status för UI, server/SQL och eventuell exakt lokal leverans.</output>

## Slutresultat

Implementerat, verifierat och levererat2026-10-18. [Samlad verifiering och lokal leverans](05-TIMPLAN-HOURS-CHECK-VERIFICATION.md). Mänsklig tydlighetsbedömning återstår.
