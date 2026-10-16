---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-06
type: execute
wave: 4
depends_on: ["TJANST-03A", "TJANST-04A", "TJANST-05"]
files_modified: ["supabase/migrations/20261016134000_tjanst_assessment.sql", "work/pilot/verify-tjanst-assessment.mjs"]
autonomous: true
status: planned
gap: TJANST-T1T2
must_haves:
  truths: ["Endast aktuell rektor kan fastställa och publicera rätt skolas tjänstefördelning.", "En lärare kan läsa sin publicerade plan och lämna eget initiativ utan att få åtkomst till kollegor eller elever.", "Om underlaget ändras bevaras beslutet historiskt och ny bedömning krävs."]
  artifacts: ["supabase/migrations/20261016134000_tjanst_assessment.sql", "work/pilot/verify-tjanst-assessment.mjs"]
  key_links: ["Personallokering + aktuella profiler/källor → bedömningshash → rektors confirm/publicering", "04A:s verifierade self-bindning → endast egenplan/egen händelse", "Fördelningsversion + initiativ + mandat efter lås → atomiskt beslut och kvitto"]
---

<objective>
Implementera stängd SQL för individuell bedömning, rektors atomiska fastställande/publicering och lärarens egen läsning/dialog. Ingen huvudmanna-approve och ingen återanvändning av programplanens beslutskedja.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/CONCERNS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@web/lib/tjanst-bedomning.ts
@supabase/migrations/20261016132000_tjanst_plan.sql
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-04A-SUMMARY.md
</context>

<tasks>
<task type="auto">
<name>1. Lagra bedömningsfakta och implementera atomiskt rektorsbeslut</name>
<files>supabase/migrations/20261016134000_tjanst_assessment.sql</files>
<action>Skapa SharedAssessmentBasis med gemensam individuell ram, skolornas delramar, aktuella rektorsbekräftelser och versionshistorik enligt kontraktet. Utöka05:s tjanst_plan_read i denna migration med faktisk bedömnings-/samordningsstatus efter att tabellerna skapats; neutral pending i05 ersätts här. Skapa tjanst_-lagring för individuella bedömningar, sammanfattade faktaunderlag/källtäckning, innehållsbundna rättsliga undantag, samtals-/samverkanshändelser och historiska beslut. Implementera tjanst_assessment_read/command/status(jsonb). Bedömningsfakta hålls nödvändiga och sammanfattade; inga elevlistor, diagnoser eller privata HR-anteckningar lagras. Första etappen anger grupp-/elevantal och stödbehov manuellt med källa, datum och täckning. Ingen automatisk läsning av elevärenden/elevlistor eller verifierad elevdeduplicering ingår; uppskattning och saknad uppgift märks uttryckligt. confirm kontrollerar rektors levande skolmandat, exakt skolplansrevision, alla relevanta bedömningars aktuella hash, kapacitet och tillämplig granskad avtals-/regelprofil efter05:s gemensamma lås. Okänd/blandad regeltillämpning, ej verifierad profil och olöst konflikt blockerar confirm men tillåter tydligt ofullständigt utkast. Publicera samma revision atomärt med beslutshändelse/audit/kvitto. Inga HM-signaturer eller separata publiceringsskick. Ändring av verksamhetsinnehåll skapar omprövningsbehov; gammal publicerad version förblir läsbar som historik. Håll03A:s hashidentitet portabel mot SQL och oberoende av rena läskvitton.</action>
<verify>SQL-prov i separat schema-only-mål: giltig rektorconfirm, HM/admin/lärare nekade, stale underlag, ändrad avtalsversion/omfattning, budgetbrist, saknade bedömningar, obemannat behov synligt och auditfel utan delpublicering. Jämför kanonisk SQL-hash med03A:s TS-vektorer.</verify>
<done>Endast rektor kan atomiskt fastställa/publicera aktuellt underlag; historik och blockerare bevaras.</done>
</task>

<task type="auto">
<name>2. Begränsa egenåtkomst och bevisa lärarinitiativets ursprung</name>
<files>supabase/migrations/20261016134000_tjanst_assessment.sql; work/pilot/verify-tjanst-assessment.mjs</files>
<action>Implementera tjanst_self_read/command/status(jsonb) med04A:s uttryckliga personbindning och self-scope. Härled egen person från aktuell session; klientens person-ID får inte välja en kollega. Läsning ger endast kontraktets egen publicerade plan, beslut och egna synpunkter/initiativ samt en uttryckligt delad dialogversion före fastställande. Rektors delning binder en exakt versionshash; andra utkast och allmän personal-/elevlista nekas. Läraren kan initiera 11 § punkt 1 mot den delade hashversionen före beslut. Registrera received/comment/initiative som skilda händelser, med initiativets aktuella verksamhetsunderlag, omfattning, giltighet och aktör från servern.11§punkt1 kräver belagt lärarinitiativ; rektor kan inte imitera det genom assessment eller direkt SQL. Punkterna2/3 har separata motiverade grunder och får inte felaktigt kräva lärarinitiativ. Undantag begränsas till stödda3–8§§ och tar inte bort minuter; återkallat/ändrat initiativ gör fortsatt beslutsunderlag inaktuellt. Prova frånkopplad egenidentitet och återkallat mandat vid read/status/replay. Alla sex nya entrypoints och helperfunktioner förblir stängda tills09. Runnern prövar verklig konkurrens confirm/save, confirm/profilechange, confirm/initiativewithdraw och två confirm med samma request.</action>
<verify>node work/pilot/verify-tjanst-assessment.mjs mot validerat isolerat mål. Bevisa egen positiv läsning även utan undervisningsgrupp, initiativ från delad dialogversion före beslut och negativ annanperson/annan kund/elevlista/odelat utkast; rektors falska initiativ nekas. Två riktiga anslutningar visar låsöverlapp och endast ett sammanhängande beslut. Immutable kvitto ska vara identiskt efter replay, med färsk mandatkontroll.</verify>
<done>Läraren kan följa och kommentera sin plan; initiativets person, tid och underlag kan verifieras utan bredare skolåtkomst.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
Pröva gemensam individuell undervisnings-/PU-ram över skolor enligt SharedAssessmentBasis: tak500 och300+300undervisning ska neka trots tillräcklig totalbudget;300+200 kräver minst600PU utan dubbel förtroendetidsallokering.03A definierar modellen,06 lagrar/prövar gemensam grund och12 låter berörda rektorer bekräfta sina delar. Huvudmannen fastställer inte.
Följ kontraktets reservationslivscykel: max(gällande publicerad budget, godkänd aktiv utkastreservation) per skolbeslut/anställningssegment, historik belastar inte. Prova100→utkast100=100,100→utkast80=100 fram till confirm,100→120=120 endast med tillgängligt20, avbryt120→100 och konkurrerande annan skola före/efter fastställd minskning. Fastställande/flytt uppdaterar hela reservationen atomärt. Prova dessutom dimensionerna separat: total1000/reglerad800→total1000/reglerad900 måste reservera ytterligare100 reglerade minuter; PU-minimum kontrolleras utan additiv dubbelräkning.
Följ kontraktets två hashvärden: initiativ binder initiativeBasisHash utan sin egen händelse eller senare prövning; decisionHash inkluderar slutlig prövning och referens till giltigt initiativ. Prova positivt delning→eget initiativ→rektors prövning→fastställande utan självogiltigförklaring, samt negativt ändrad faktisk tjänst/undantagsvillkor och återkallat initiativ.
Lokal kravspårning: TJ1-05/06/07/09.
Behöver:03A:s tillståndsmodell,04A:s egenbindning/scope och05:s skolplan/låsning. Skapar: sex stängda entrypoints för08/09. TID-05/06/07 har riktiga SQL-bevis. Åtkomst och rättsligt undantag härleds aldrig från SS12000-roll eller CalendarEvent.teacherExceptions; det senare hör till schema, inte11§.
</verification>

<success_criteria>
- Fastställande/publicering är atomiskt och utförs enbart av aktuell rektor.
- Egenläsning och initiativ är personbundna även utan grupptillhörighet.
- Gamla beslut och oförändrade kvitton bevaras vid ny bedömning och återförsök.
</success_criteria>

<output>
Skriv 05-TJANST-06-SUMMARY.md med besluts-/selfmatris, hashparitet, samtidighet och kvarstående HTTP-bevis. Samordnaren hanterar commit/push.
</output>
