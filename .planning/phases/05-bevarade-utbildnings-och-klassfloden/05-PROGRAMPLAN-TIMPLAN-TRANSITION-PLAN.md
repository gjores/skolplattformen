---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: programplan-timplan-transition
status: completed
completed: 2026-10-06
type: execute
created: 2026-10-05
wave: 1
depends_on: []
requirements: [ADMIN-02, ADMIN-04]
autonomous: true
scope: "Avgränsad övergång till skolans gymnasietimutkast; inga nya beslutskommandon"
files_modified:
  - web/lib/gym-timplan.ts
  - web/lib/gym-timplan.test.mjs
  - web/lib/server/gym-timplan.ts
  - web/lib/server/gym-timplan.test.mjs
  - web/app/api/timplaner/gym/underlag/route.ts
  - web/app/api/timplaner/gym/skapa/route.ts
  - web/app/api/timplaner/gym/lasa/route.ts
  - web/app/api/timplaner/gym/rad/route.ts
  - web/app/protected-gym-timplan-workspace.tsx
  - web/app/protected-programplan-workspace.tsx
  - web/app/protected-home.tsx
  - web/app/protected-gym-timplan.css
  - web/lib/protected-plan-location.ts
  - web/lib/protected-plan-location.test.mjs
  - web/lib/server/http.ts
  - web/lib/server/audit-details.ts
  - web/lib/session-channel.ts
  - supabase/migrations/20261005110000_phase5_gym_timplan_transition.sql
  - supabase/migrations/20261005111000_phase5_worker_gym_timplan_transition.sql
  - supabase/tests/phase5_program_timplan_transition.test.sql
  - work/pilot/apply-gym-timplan-migration.mjs
  - work/pilot/apply-gym-timplan-migration.test.mjs
  - work/pilot/verify-gym-timplan-foundation.mjs
  - work/pilot/verify-gym-timplan-foundation.test.mjs
  - work/pilot/verify-gym-timplan-api.test.mjs
  - web/e2e/phase5-timplan.spec.ts
  - work/pilot/verify-gym-timplan-api.mjs
  - work/pilot/phase5-gym-timplan-fixtures.mjs
  - web/e2e/phase5-gym-timplan.spec.ts
  - web/playwright.phase5-gym-timplan.config.ts
  - docs/handbok/programplaner.md
  - docs/handbok/timplaner.md
must_haves:
  truths:
    - "Användaren fortsätter från en färdig sparad programram till rätt skolas riktiga redigerbara timutkast."
    - "Programutkast kan användas som planeringsunderlag utan att källan eller timmarna påstås fastställda."
    - "Programramens poäng, fasta rader, alternativ och valblock kopieras exakt; timmar fylls separat."
    - "Samma programram kan ge olika skolors timmar och ingen klasskoppling flyttas."
    - "Ändrat programunderlag kräver ett uttryckligt nytt timutkast; gamla timmar och källversioner bevaras."
  artifacts:
    - path: web/lib/gym-timplan.ts
      provides: "Sluten fryst källmodell, verklig utkastberedskap och separata timmar"
    - path: web/app/protected-gym-timplan-workspace.tsx
      provides: "Skolans sexterminstabell med spara, versionsbyte och retur till källplan"
    - path: supabase/migrations/20261005110000_phase5_gym_timplan_transition.sql
      provides: "Auditerad skolavgränsad skapa/läsa/spara/nyversion utan juridiskt beslut"
  key_links:
    - from: "Programplanens exakta sparade ID och revision"
      to: "Skolans frysta timutkast och aktuella revision"
      via: "Serverkontrollerad snapshot, commandId, kvittens och återläsning"
    - from: "Timraden och skolans mandat"
      to: "Hela timraden i rätt planrevision"
      via: "CAS, MFA/CSRF, levande mandat och atomisk audit"
---

# Programplan → skolans timutkast

**Status: avgränsad övergång genomförd och automatiskt verifierad 2026-10-06.** Användarens beställning 2026-10-05 har levererats på vanlig lokal 3012. Slutbygge `3ae5fe5`, 60 dator-/telefonfall, verklig Worker 11/157 och bevarande av 14 hela originaltabeller PASS. Se [SUMMARY](05-PROGRAMPLAN-TIMPLAN-TRANSITION-SUMMARY.md) och [VERIFICATION](05-PROGRAMPLAN-TIMPLAN-TRANSITION-VERIFICATION.md). Genomförandeplanen nedan beskriver den beslutade omfattningen; full fas 5, formella beslut, garantikontroll och mänsklig bedömning är fortsatt öppna.

<objective>
Användaren kan fortsätta från utbildningens kompletta sparade poäng- och terminsram till sin skolas beständiga timutkast, fylla och spara timmar samt återgå till exakt använd programversion. Tidsplanering kan förberedas parallellt med formella beslut.

Purpose: Programram, skolans timmar och senare utbud/grupporganisation hänger ihop utan att skolornas uppgifter eller beslut blandas ihop.
Output: En faktisk skapa/öppna/redigera/spara/återläsa/nyversion-kedja för skolans högskoleförberedande gymnasietimutkast. Befintliga GR/IM-vägar består. Formellt program-/timplansfastställande byggs inte här.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/codebase/ARCHITECTURE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-23-REMOVE-PACKAGES-PLAN.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-23-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TIMPLAN-IMPLEMENTATION.md
@.planning/research/PAKETENS-PLATS-I-UTBILDNINGSFLODET-2026-10-05.md
@web/lib/programplan-terms.ts
@web/lib/programplan-analysis.ts
@web/lib/programplan-lifecycle.ts
@web/lib/protected-timplan.ts
@web/lib/server/timplan-planning.ts
@web/app/protected-programplan-workspace.tsx
@web/app/protected-timplan-workspace.tsx
@web/app/protected-home.tsx
@supabase/migrations/20261004141000_phase5_timplan_units.sql
</context>

## Vald verksamhetslösning

**Programplan → skolans timutkast → senare beslut och skolorganisation.** Programplanen anger poäng, fasta nivåer, Svenska/SvA-alternativ, valbara blocks poäng och sexterminsram. Timplanen anger en viss skolas planerade timmar. Paket, elevval, språkgruppers dagar och bemanning hör till senare skolutbud/organisation och återinförs inte i programplanen.

En färdig sparad programram kan användas även om status fortfarande är **Utkast**. Timplanens rubrik visar **Timutkast** och källversionens verkliga status. Detta är förberedande planering; varken en nationell beslutsberedskap, fastställd utbildning eller garanterad tid för en viss elev påstås.

Källan måste vara aktuellt serverläst, versionsbunden och ha färdig poäng-/termfördelning utan strukturfel. Första leveransen stöder känd högskoleförberedande poängram med katalogkategori `PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION`. Ofullständig ram visar en konkret orsak och en fungerande länk tillbaka till rätt programplan. Yrkesprofil, obunden legacygrund och okänd totalram får inte en gissad ram. Det här är en faktisk förberedelsegrind i SQL/Worker och klient, inte klientens `ready` som behörighetsbevis.

1. En lågmäld handling **Timplan** visas i programplanen. Finns ett skolbundet timutkast öppnas det; saknas det kan behörig rektor/skoladministratör välja skola och **Skapa timutkast** efter en kort källsammanfattning. Upprepade klick öppnar samma plan.
2. Skapande fryser exakt sparad programversion/revision, rader, block och poängterminer. Sex separata timfält börjar ofördelade. Poäng är läsbara i källkolumnen; timmar fylls utan automatisk kvot.
3. Rektor/skoladministratör arbetar bara med den valda skolan. HM läser underlag och timmar men får inte skolans timredigering implicit. Administrator får ny gymnasietimredigering inom mandat, men ingen GR/IM-skrivning genom denna förändring och ingen programramredigering.
4. **Programplan vN** i timplanens rubrik öppnar exakt källversion. Retur till timplanen behåller skola, plan-ID, vald årskurs och osparat arbete enligt bytestskyddet. Timplanslistan hittar den nya gymnasieplanen efter sidomladdning.
5. Har underlaget ändrats visas jämförelse med fryst källa. **Skapa nytt timutkast från den här versionen** är uttryckligt: tidigare eget öppet timutkast bevaras som ersatt utkast i samma transaktion; nytt utkast får nytt ID/version. Bara identiska `sourceRowKey + points + pointTerms` får timvärden/tilldelningsmask återanvända. Nya/ändrade rader börjar blankt. Inget klass-ID eller elev-ID flyttas.

Läsbara källpoäng, redigerbara timmar och sparstatus ska vara tydliga i tabellen på dator och telefon. Rubrik/skola/kull/version räcker som sammanhang; inga flera stora informationrutor läggs ovanför tabellen. Underlag/versioner öppnas vid behov.

## Medveten avvikelse från historiska 05-25–35

Äldre planpaket kräver **fastställd-only** som källa till ny gymnasietimplan. Den grinden bevaras för framtida formellt beslutsflöde men ersätts här av **färdig sparad ram → förberedande skolutkast**. Användarens senaste beställning ger mandat att utforma den praktiskt bästa övergången; detta undviker att fabricera en juridisk beslutslösning för att kunna planera timmar.

05-25/26:s programfastställande, 05-32/33:s timplansbeslut och full 05-23/E är fortsatt öppna. ADMIN-02/03/04 är inte färdiga. 05-17:s yrkesprofil får ingen tyst leverans. Äldre audit-FAIL och 05-22:s historiska metadata-PARTIAL består. Nya riktade bevis skiljs från dessa historiska resultat.

Inga `submit`, `return`, `decide` eller generella programbeslut byggs. Utkastkällan räknas inte om till fastställd. Programplanens datumlås är inte automatiskt timutkastets skrivlås: redan skapade timmar kan planeras inom gällande skolmandat, men nytt underlag tas alltid in uttryckligt och arkiverad utbildning får läsas utan ny skrivning.

Kullkopiering behåller dagens programram/terminer/skolor och följer inte med timutkast automatiskt. Samma utbildning/elevkull kan ha flera skolor och egna timversioner; skapa inte kopior av utbildningen för att särskilja skolors timmar.

## Aktuell kod och verkliga beroendegap

- Programramens exakta rader/block och sex poängterminer finns i `programplanTermRows`; ramens analys laddar inga paket. Svenska/SvA är redan en alternativ ramrad och får inte dubblas i timplanen.
- `offering_units`, `timplans.unit_id`, unik version och högst en öppen/fastställd plan per utbildning/skola finns i 05-22. Återanvänd dem och pröva bevarande av hela originalrader, inklusive tidsstämplar.
- Skyddad timplanslista, kontrakt och UI stöder idag bara GR/IM. Gymrader/kolumner ger tomt; gamla read kan bära godtycklig äldre gymmatris utan fryst underlag. Nytt sexkolumnsformat måste få en egen sluten läs-/skrivväg.
- Timplansmenyn/mount tillåter bara HM/rektor. Administrator har redan läsande Programplaner/Utbildningar. Bevara det och öppna endast nya skolvisa gymtimplansförmågor. Äldre cell-API:s rektor/GR/IM-scope består.
- Gammal gymklasskoppling använder `ar1/ar2/ar3` och viss fastställd version. Nytt timutkast får inga klasslänkar. Klassrader ändras aldrig vid skapa/spara/ersätta; historiska trekolumnsplaner blir inte nya verifierade sexkolumnsplaner.
- 05-24:s GR/IM-analys finns som ren motor men är inte kopplad till workspace och ger ingen gymbeslutsberedskap. Övergångens kontroll gäller källramens fullständighet och timdata, inte nationell tids-/APL-/examensgaranti.

Discovery har utförts genom aktuell intern kod, planpaket och tidigare användarbeslut. Inga externa bibliotek behövs. Någon ny rättslig tidsnorm byggs inte här och ingen profil eller APL-beräkning gissas.

## Slutet käll- och timkontrakt

Snapshot innehåller `sourcePlanId`, `sourceRevision`, `sourceVersion`, källans verkliga `sourceStatus`, `offeringId`, `unitId`, `catalogId`, exakt `programRef`, `orientationCode`, elevkull/startdatum, fryst totalram och exakta rader. Rad-ID mappar till `sourceRowKey` med radtyp, del, namn, ämnes-/nivåreferens eller block-ID, totalpoäng och sex `pointTerms`. `expectedPackageRevision`, paketval och paketbibliotek ingår inte.

Varje ny timrad har sex heltal och sex booleanvärden. `allocated=false` kräver `hours=0` och visas som blankt; `allocated=true, hours=0` är explicit noll. Saknad/ogiltig rad är underlagsfel och får inte presenteras som noll. Slutna parsers kontrollerar källa, radidentitet, exakta fält, bredd, revision och replyens relation till begäran.

Källgrinden räknas från faktisk sparad plan och oföränderligt katalogunderlag: säker binding, aktuell v2-blockmodell, känd högskoleförberedande totalram, korrekt IV/block/fasta poäng, samtliga rader exakt poängfördelade och ingen felaktig nivåordning. Fel och ofullständighet returnerar konkret orsak. Både SQL och TS verifierar samma deterministiska strukturfall; klienten kan inte leverera eget radschema eller `ready=true`.

Första skapa binds till `commandId`, aktör, skola, källa/revision och förväntad senaste timplansversion. Identisk replay ger samma plan-ID; ändrad payload med samma commandId nekas. Tappat svar går via auditerad statusläsning. En öppen äldre plan skapas inte över eller ersätts utan uttrycklig begäran. HM är read-only även genom direkta anrop.

Ny version binds dessutom till exakt tidigare timplans-ID/revision och aktuell sparad källa. Lås skola/utbildning/version/mandat i samma ordning. Pröva gällande mandat/session igen efter låsväntan. Ersätt tidigare **eget utkast** atomiskt med bevarade timrader och skapa ny version; fastställd eller historisk plan ersätts inte som genväg. Källsnapshot är oföränderlig. Klasslänkar och tidigare beslut är orörda.

Namn får aldrig användas för att matcha tidsrader. Gamla `/lista`, `/lasa`, `/cell` kan inte kringgå den nya gymgrundens schema/tilldelningsmask/CAS. Bevara dokumenterade GR/IM-kontrakt och neka äldre write till nytt gymformat. Legacygym visar historik/avgränsning, inte en verifierad övergång.

## Tre kontrollerbara delsteg

Samordnade RPC-gränser: underlag(uuid), create(uuid,uuid,integer,integer,uuid,uuid,integer), read(uuid) och write_row(uuid,integer,text,jsonb). Underlag binds till en programplansversion; create binder skola, källplan/revision, senaste skolversion, commandId och eventuell uttryckligt ersatt timplan/revision. JSON-radpayload innehåller endast verifierad helrad med timmar/tilldelningsmask. Exakta funktionsnamn/parameterordning dokumenteras i SQL och serverkontrakt innan preflight.

Detta scope går över befintliga SQL/API/UI-gränser. Gemensamma filer ändras sekventiellt; SQL/API/browserprov på samma databas och helradshashar körs sekventiellt. Kontrakts-/UIarbete kan ske med exklusiva filägare; ingen färdig handling exponeras innan hela vertikalen fungerar.

<tasks>
<task type="auto">
  <name>1. Skyddad fryst programgrund och skolvis timutkast</name>
  <files>supabase/migrations/20261005110000_phase5_gym_timplan_transition.sql, supabase/tests/phase5_program_timplan_transition.test.sql, web/lib/gym-timplan.ts, web/lib/gym-timplan.test.mjs, work/pilot/apply-gym-timplan-migration.mjs</files>
  <action>Inför skolbundet immutable källunderlag, separata sextermstimmar/tilldelningsmask, sluten källfullständighetsgrind, auditerad läsa/skapa/spara/nyversion och commandkvittens. Återanvänd offering/unit-versionering; klient skriver aldrig tables eller status. Levande R/administrator-mandat för rätt GY-skola kontrolleras efter låsväntan, HM läser. Ny version bevarar gammalt eget utkast, kopierar endast exakt identiska ramar och rör inga klasslänkar. SQL/helpers stängda för PUBLIC/anon/authenticated/Worker före verklig API-preflight. Granskat migrationsverktyg inventerar nuvarande journal/functiondefs/ACL och tillåter endast egna filer/hashes; inga reset-/remote-mål.</action>
  <verify>Riktade SQL/kontraktsprov med faktisk TS/SQL-paritet för färdig/ofullständig källa, okänd totalram, Svenska/SvA/IV-block, fel skolemandat, create/replay, samtidighet, CAS, auditrollback och bevarade originalrader. Inga nya grants förrän Worker-preflight.</verify>
  <done>Ny gymtimplan finns faktiskt i rätt skola med exakt fryst sparad ram och tomma separata timmar; ny version bevarar tidigare hela timmar/källa.</done>
</task>
<task type="auto">
  <name>2. Verkliga slutna Worker-vägar och sammanhängande UI</name>
  <files>web/lib/server/gym-timplan.ts, web/lib/server/gym-timplan.test.mjs, web/app/api/timplaner/gym/underlag/route.ts, web/app/api/timplaner/gym/skapa/route.ts, web/app/api/timplaner/gym/lasa/route.ts, web/app/api/timplaner/gym/rad/route.ts, web/lib/server/audit-details.ts, web/lib/session-channel.ts, web/app/protected-gym-timplan-workspace.tsx, web/app/protected-programplan-workspace.tsx, web/app/protected-home.tsx, web/app/protected-gym-timplan.css, web/lib/protected-plan-location.ts, web/lib/protected-plan-location.test.mjs, web/lib/server/http.ts, supabase/migrations/20261005111000_phase5_worker_gym_timplan_transition.sql, work/pilot/verify-gym-timplan-api.mjs, work/pilot/phase5-gym-timplan-fixtures.mjs</files>
  <action>Koppla fyra slutna POST-vägar: `/gym/underlag` och `/gym/lasa` är auditerad läsning; `/gym/skapa` (inklusive uttrycklig nyversion från eget utkast) och `/gym/rad` är mutating R/admin med MFA/CSRF och required audit. CommandId-status/replay styrks genom create-kvittens och sluten auditerad återläsning; om separat statusväg behövs samordnas den före grant. Kommandoegna fält och reply verifieras mot begäran. Gör verklig byggd Worker-preflight med tillfälliga grants och finally-återställd ACL före exakt permanent grant. Programplanens Timplan öppnar befintligt skolutkast före ny skapandemöjlighet; öppna befintlig timplan direkt när endast en skola finns och källrevisionen stämmer, visa skolval vid flera skolor och concrete fullständighetsorsak om källan saknar ram. Timmar går att redigera, spara och återläsa i sex terminer. Spara hela timraden uttryckligt med Spara timmar, bevara edit-under-flight, visa conflict/unknown med säker reread och skydda session-/contextbyte. Source-return och timplanslistan använder exakta server-ID:n. Sparad källrevision visas i separat underlagsdialog; återgång till samma programversion visar dess aktuella revision. Källa/status/egen timrevision är läsbara och ny källram tas bara in genom explicit nytt timutkast. HM läser; admin skriver bara nya GY-utkast. Bygg inga beslut eller paket-/bemanningsmoduler.</action>
  <verify>Meningsfulla serverprov; tsc/oxlint; riktad verklig Worker-matris med positiva/negativa mandatsfall, source/CAS/replay/audit/MFA/CSRF och fullradshashar. Current admin/R/HM och gamla GR/IM-kontrakt verifieras konkret.</verify>
  <done>Handlingen leder till ett faktiskt sparat och redigerbart skolutkast, inte unsupported vy; HM/read-only och admin/GYgränser gäller även direkt anrop.</done>
</task>
<task type="auto">
  <name>3. Verifiera övergången på dator/telefon och leverera med bevarad användarmiljö</name>
  <files>web/e2e/phase5-gym-timplan.spec.ts, web/playwright.phase5-gym-timplan.config.ts, docs/handbok/programplaner.md, docs/handbok/timplaner.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PROGRAMPLAN-TIMPLAN-TRANSITION-SUMMARY.md, .planning/STATE.md, .planning/ROADMAP.md</files>
  <action>Prova färdig utkastkälla→skola→skapa/öppna→HT/VT-timmar→spara→reload samma ID→exakt källplan och retur; två skolor olika timmar; källa ändrad→uttrycklig ny version med identiska rader återanvända/ändrade blankt; ofullständig källa visar åtgärd; HM läser och admin/GYskriver; gamla klasslänkar och GR/IM består. Granska bilder, fokus och mobilår. Beskriv verifierat utkastscope i byggd handbok. Kör aktuella berörda regressioner efter sista produktändring; bevara första FAIL och städa bara ägda fixturer. Bygg i ägd isolerad runtime, byt vanlig 3012 till verifierad artefakt utan reset och med gamla klientfiler bevarade/privata vars undantagna. Kontrollera hela originaltabeller före/efter och läs bevarade användarscenarier. Scoped commits/push enligt AGENTS. Äldre grindar och mänskligt prov är fortfarande öppna, inte nya krav på att stoppa implementering för godkännande.</action>
  <verify>Node/model/server, tsc/lint/skyddat bygge, verklig Worker/SQL, dator-/telefonbrowser och docs:build. Användarens 3012 läses endast för bevarande; alla städningsbilagor styrker noll egna verksamhetsrader och audit bevaras. Origin är avsedd commit.</verify>
  <done>Den beställda förberedande övergången är faktiskt tillgänglig och spårbart verifierad; scope/resultat/öppna beslut är ärligt dokumenterade.</done>
</task>
</tasks>

## Verifieringsmatris och tydliga gränser

- Sparad färdig högskoleförberedande utkastkälla är tillåten. Samma färdiga fastställda källa kan användas om aktuell/verifierad, utan att legacydecision omskrivs. Ofullständig/obunden/ersatt/okänd-total/yrkesprofil eller fel revision ger konkret diagnos, inte en gissad 2 500p-ram.
- Samma programram kan användas av två skolor med olika timmar. Rektor för en skola behöver endast mandat för sin timplan; delad programredigering behåller befintligt starkare mandat för alla kopplade skolor.
- Create-replay/kvittens och samtidiga klick ger ett ID; ny version kräver uttrycklig handling, aktuell gammal timrevision och aktuell källrevision. Tappat svar leder inte till blint extra skapande.
- Blank≠explicit0≠saknad rad. Hela timraden sparas atomiskt. CAS-konflikt, återkallat mandat under låsväntan, sessionfailure och auditfel kan inte ändra timmar/utkaststatus. Poäng och källversion är oförändrade.
- Identiska rowKey+points+pointTerms kan bära timmar till nytt utkast; ändrad terminsram, borttagen/ny nivå eller block börjar blankt. Source-snapshot och äldre timmar bevaras och tidigare eget utkast visas som ersatt utkast, aldrig som nytt HM-beslut.
- Blocktid räknas en gång i planeringsramen. Den säger inte att alla alternativ läses eller att en elev fått faktisk garanterad tid. Svenska/SvA alternativ dubblas inte. Ingen 0,9kvot, veckonorm, APL-rättsregel eller examensgaranti byggs in.
- Legacygym/GR/IM kan inte nå nya gymceller genom gamla writekontrakt. Administrator får ingen GR/IM-redigering eller programplansändring. HM får ingen timredigering. Aktuella klass-/timplan-/utbildningshelrader består.
- Programplanernas paketUI/API-laddning återkommer inte. Äldre paket-/skolutbudrader varken krävs eller ändras och deras beroendeskydd består.
- UI-proven körs på samma skyddade bygge för dator och telefon; källpoäng/timmar, bevarat årval vid retur, fokus, sparstatus och retur till exakt programversion är begripliga. Det automatiska provet är inget påhittat mänskligt godkännande.

<verification>
Alla `node work/pilot/...` och `npm run docs:build` från projektroten. Node-modell/serverprov, tsc/oxlint, skyddat bygge och Playwright från `web/`. Databasprov och globala helradshashar körs sekventiellt. Exakt Worker-grant följer verklig preflight med ACL-återställning. Kända historiska avvikelser bevaras separat från denna leverans; planeringsfilen är inget provresultat.
</verification>

<success_criteria>
En riktig skolvis timutkastövergång fungerar från exakt färdig sparad programram, även innan formellt programbeslut. Rätt aktör kan fylla och återläsa timmar, gå till källversionen och skapa uttryckligt nytt utkast vid ändrad källa. Poäng, timmar, paket och skolorganisation blandas inte ihop. Tidigare verksamhetsrader/klasskopplingar och GR/IMförmågor består. Beslutsfunktioner, nationell tids-/examensgaranti, yrkesprofil, full05-23/E och verklig kommunanslutning förblir öppna.
</success_criteria>

<output>
Efter faktisk genomförande: separat `05-PROGRAMPLAN-TIMPLAN-TRANSITION-SUMMARY.md` med verklig kod/build, riktade bevis, aktuellt levererat scope och kvarstående gränser. STATE/ROADMAP länkar denna avgränsade utkastleverans utan att markera 05-25–35 eller hela fas 5 genomförda. Handboken byggs; scoped commits pushas till aktuell origin-gren och fjärrcommit kontrolleras.
</output>
