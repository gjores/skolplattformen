---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-12
type: execute
wave: 9
depends_on: ["TJANST-10A", "TJANST-11"]
files_modified: ["web/app/tjanst-bedomning.tsx", "web/app/tjanst-beslut.tsx", "web/app/tjanst-bedomning.css", "web/e2e/fixtures/tjanst-bedomning-preview.tsx", "web/e2e/tjanst-bedomning.spec.ts"]
autonomous: true
status: superseded
superseded_on: 2026-10-19
superseded_by: "Fas 05.1 (tjänstefördelning) eller repot tjanstebedomning (tjänstebedömning); se ../05.1-tjanstefordelning/05.1-SPLIT-DECISION.md"
local_acceptance: [TJ1-05, TJ1-06, TJ1-07, TJ1-09, TJ1-10]
must_haves:
  truths: ["Rektor bedömer varje tjänst med synligt faktaunderlag, individuellt undervisningstak, planeringstid och egen motivering.", "Rektor fastställer den granskade fördelningen och gör den synlig atomiskt; huvudmannen har inget godkännandesteg.", "Nya arbetsuppgifter eller ändrad avtals-/källversion gör behovet av omprövning synligt utan att skriva om tidigare beslut.", "Lärarens synpunkt, läskvittens, rektorsbeslut och facklig samverkan är olika händelser."]
  artifacts: ["web/app/tjanst-bedomning.tsx", "web/app/tjanst-beslut.tsx", "web/e2e/tjanst-bedomning.spec.ts"]
  key_links: ["Aktuell plan/personal/avtals-/regelrevision → bedomning/lasa → faktaunderlag och konkreta ändringar", "Sparad individuell bedömning → innehållsbunden rektorsbekräftelse → atomiskt fastställd/synlig revision", "Ändrad källa → ny jämförelse och omprövning; historiskt kvitto → oförändrat beslut"]
---

<objective>
Ge rektor ett kort men fullständigt arbetsflöde för individuell tjänstebedömning och fastställande. Beslutet ska kunna förstås och omprövas. Det nya tjänstebeslutet har egen ansvarskedja: rektor fastställer, huvudmannen följer upp. Befintliga program-/timplaners huvudmannagodkännande ändras inte.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/research/LARARTID-OCH-TJANSTEBEDOMNING-2026-10-16.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-11-SUMMARY.md
@web/app/plan-decision-panel.tsx
@web/lib/tjanst-plan.ts
@web/lib/tjanst-journal.ts
</context>

<tasks>
<task type="auto">
<name>1. Bygg rektors guidade individuella bedömning</name>
<files>web/app/tjanst-bedomning.tsx; web/app/tjanst-bedomning.css</files>
<action>Bygg stegen Förutsättningar → Hela uppdraget → Min bedömning → Dialog och nästa avstämning. Visa period, anställning, skolandel, avtals-/regelversion och faktakällornas datum. Separera faktisk undervisningskategori från funktion och bedömningsförutsättningar; programnamn klassificerar aldrig läraren som yrkeslärare. Första etappen använder manuellt dokumenterade aggregerade gruppstorlekar, unika elever, stödbehovets arbetsbelastning och andra förutsättningar med källa/datum; förifyll bara tidigare sparade uppgifter från samma bedömning. Visa täckning och aktualitet. Läs inga elevärenden och hämta inga elevlistor för denna funktion. Summera inte gruppernas elevantal till påstått antal unika elever. Efterfråga relevanta förberedelser, erfarenhet av ämne/nivå, bedömningsbelastning, mentorskap, APL/resor och andra uppdrag utan diagnoser, elevlistor eller privata HR-anteckningar. Rektor anger heltidsbedömt individuellt tak, korrekt periodiserat individuellt tak, avsatt planering/uppföljning och varför förutsättningarna lett till denna tid. Använd serverns beräknade konsekvenser; sätt inte högsta tak/lägsta planering som generellt förval. Framtidsregeln från2027-07-01 ska tydligt skiljas från aktuell tillämpning. Den granskade gymnasieprofilens 500undervisning→600planering och60% av500→300tak/360planering visas korrekt, utan andra deltidsavdrag. Spara utkast även vid saknat underlag, men skilj serverns blockerare från varningar; blandad/okänd regeltillämpning eller ej verifierat avtal kan inte fastställas.</action>
<verify>Pröva saknade gruppstorlekar, separat manuellt dokumenterat unikt elevantal och antalgrupper utan automatisk summering, matematik på yrkesprogram, faktisk yrkeskaraktär, blandat undervisningsuppdrag, delår/tjänstebyte, otillräcklig planering och individuell gräns500 med520fördelat. Spara motivering, lämna vyn och återläs samma värden och faktakälla. Från web/: npx tsc --noEmit och npx oxlint app lib.</verify>
<done>Rektor kan formulera en individuell bedömning och se dess konsekvenser utan automatisk poänggradering eller osynliga schabloner.</done>
</task>

<task type="auto">
<name>2. Skilj dialog, undantag och rektors fastställande</name>
<files>web/app/tjanst-beslut.tsx; web/app/tjanst-bedomning.tsx</files>
<action>Lägg till samordning av SharedAssessmentBasis för person med flera skoluppdrag: visa gemensam ram och endast nödvändiga delramar/status, låt aktuell rektor föreslå och bekräfta sin skoldel, och visa vem som återstår innan fastställande utan att exponera andra skolors anteckningar. Bygg en egen tjänstebeslutspanel mot bedomning/{lasa,kommando,status}; återanvänd spar-/dialogprimitiver men inte program-/timplanens submit→HM-approve-state-machine. Presentera sparad motivering, omfattade personer/perioder, avtal/regel/källrevision, blockerare och vad som ändrats sedan förra beslutet. Rektor granskar varje tjänst och bekräftar exakt innehåll; skolans samlade Fastställ tjänstefördelningen kontrollerar aktuella individuella bedömningar och publicerar atomiskt enligt kontraktet. Ingen separat HM-knapp eller senare dold publicering. Ändring av fastställd plan börjar en ny version/omprövning, gamla händelser visas oförändrade. Ge rektor en uttrycklig Dela för dialog-handling som låser vilken individuell versionshash läraren får läsa före fastställande; visa delad dialogversion som sådan och tillåt återkallelse med historik. Ändringar kräver en ny uttrycklig delning; andra utkast blir aldrig synliga. Spara dialogdatum och rektors redogörelse separat från lärarens egna inlägg och facklig samverkan; ingen läskvittens räknas som samtycke. Lärare utan konto kan ha en bedömd tjänst och dokumenterad extern dialog men visas aldrig ha signerat/loggat in. För11§ visar panelen grunderna separat; punkt1 kräver serverbelagt eget initiativ från13, kan inte skapas av rektor. Övriga grunder kräver kontraktets särskilda villkor/motivering; 9–10§ får ingen undantagsväg. Saknad identitet/underlag medför blockerare, inte rektors imitation. Redovisa fortfarande verkliga minuter och kvarstående avvikelse vid ett tillåtet undantag. Alla beslut följer exakt journal, CAS, MFA, servermandat och bekräftande omläsning; även redan öppen dialog spärras vid dirty/unknown eller ändrad källa.</action>
<verify>Verifiera nytt utkast→sparad bedömning→rektors fastställande/synlighet, återöppnad historik, ny version efter ändring och stalehash i öppen dialog. Huvudman/admin/lärare får inga rektorsbeslutsknappar. Lärare utan konto registreras inte som initiativtagare. Framtida profil, blandad profil, saknat avtal och felaktigt11§-underlag spärras enligt serverns blockers/actions. Punkt1 utan lärares händelse nekas även vid klientmanipulation i09/17.</verify>
<done>Rektors bedömning och fastställande har en tydlig egen beslutskedja, ett granskningsbart underlag och rätt aktör för varje händelse.</done>
</task>

<task type="auto">
<name>3. Pröva bedömning och beslut som sammanhängande användarbeteende</name>
<files>web/e2e/fixtures/tjanst-bedomning-preview.tsx; web/e2e/tjanst-bedomning.spec.ts</files>
<action>Skapa browserfall med rektor som bedömer två olika tjänster, rättar avvikelse, dokumenterar dialog, fastställer, jämför äldre version och omprövar efter ändrat uppdrag. Lägg till lärare utan konto, simulerat legitimt lärarinitiativ från13 samt felaktig rektorsregistrering som servern nekar. Visa korta anvisningar, öppningsbar förklaring till mått och tydliga rättningslänkar. Huvudmannen visas endast som uppföljande part. Använd inbyggd dialog med fokushantering, mobilanpassade faktakort och ingen stor obligatorisk checklista som upprepar samma information.</action>
<verify>Från web/: npx playwright test -c playwright.tjanst-preview.config.ts tjanst-bedomning.spec.ts. Dator/telefon, minst44×44, keyboard/fokus, normalflöde, samtidighetskonflikt, MFA-retur, tappat svar efter commit, reload, år-/personbyte och återkallat mandat. Granska skärmbilder för skillnaden beslut/kvittens/samverkan och framtida/aktuell regel. SimuleradAPI är skild från17:s faktiska kedja.</verify>
<done>Rektor kan genomföra en individuellt motiverad och begriplig fastställelse på båda skärmarna; inga gamla huvudmannasteg eller falska lärarsigneringar finns.</done>
</task>
</tasks>

<verification>
Pröva gemensam individuell undervisnings-/PU-ram över skolor enligt SharedAssessmentBasis: tak500 och300+300undervisning ska neka trots tillräcklig totalbudget;300+200 kräver minst600PU utan dubbel förtroendetidsallokering.03A definierar modellen,06 lagrar/prövar gemensam grund och12 låter berörda rektorer bekräfta sina delar. Huvudmannen fastställer inte.
Följ kontraktets två hashvärden: initiativ binder initiativeBasisHash utan sin egen händelse eller senare prövning; decisionHash inkluderar slutlig prövning och referens till giltigt initiativ. Prova positivt delning→eget initiativ→rektors prövning→fastställande utan självogiltigförklaring, samt negativt ändrad faktisk tjänst/undantagsvillkor och återkallat initiativ.
TJANST-04 enligt användarens beslut2026-10-16 ersätter äldre HM-godkännandeförslag; TID-02/04/05/06/09. SS12000:2024/OpenAPI2.1.0 bevarar Person/Duty/Activity/Group och daterade källrelationer. Bedömning, samverkan, rektorsbeslut och rättsligt11§-undantag är egna objekt; inget CalendarEvent.teacherExceptions-fält bevisar ett sådant undantag. Faktiskt fullgjord förhandling eller rättslig efterlevnad intygas inte av ett UI-kvitto.
</verification>

<success_criteria>
- Varje fastställd tjänst har aktuellt obligatoriskt underlag, motivering, rätt beslutsaktör och bevarad historik.
- Rektor fastställer och gör aktuellt innehåll synligt utan huvudmannagodkännande.
- Ändrade förutsättningar, okända profiler och saknat lärarinitiativ kan inte döljas av en generell grön status.
</success_criteria>

<output>
Skriv 05-TJANST-12-SUMMARY.md med faktisk decision-state-machine, provade felvägar, begränsningar och underlag till16/17. Samordnaren hanterar avgränsad commit/push.
</output>
