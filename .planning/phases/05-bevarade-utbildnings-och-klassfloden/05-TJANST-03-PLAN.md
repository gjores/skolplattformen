---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-03
type: tdd
wave: 2
depends_on: ["TJANST-01", "TJANST-02"]
files_modified: ["web/lib/tjanst-plan.ts", "web/lib/tjanst-plan.test.mjs"]
autonomous: true
status: planned
gap: TJANST-T1T2
must_haves:
  truths: ["Rektor kan se undervisningsbehov och tjänsterader även innan en lärare är utsedd.", "Samläsning förbrukar lärartid en gång medan två deltagande lärare får varsin tid.", "Ändrad timplanskälla ändrar inte sparad tjänstefördelning i bakgrunden."]
  artifacts: ["web/lib/tjanst-plan.ts", "web/lib/tjanst-plan.test.mjs"]
  key_links: ["Klass-ID + bindningsrevision + planserie/version + rowKey/term → spårbart behov", "Unik aktivitet + lärardeltagande → personminuter", "Budgetallokering × tidsform → anställningens gemensamma kapacitet"]
---

<objective>
Skapa tjänstefördelningens rena behovs-, aktivitets- och allokeringsmodell. Den avser planerat arbete; schema och rapporterat utfall byggs i senare etapper.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@web/lib/class-timplan.ts
@web/lib/planning-year-contract.ts
@web/lib/gym-timplan.ts
@web/lib/tjanst-personal.ts
@web/lib/tjanst-avtal.ts
</context>

<tasks>
<task type="auto">
<name>1. Beskriv undervisningsbehov och unik tidsförbrukning i RED-prov</name>
<files>web/lib/tjanst-plan.test.mjs</files>
<action>Testa behov från två klasser med samma planversion och två klasser med olika namngivna planer: klassens behov är separat även när källan är gemensam; samläsning kräver uttrycklig gemensam aktivitet. Behovet binder stabilt klass-ID, exakt klass–timplansrevision, serie/version, rowKey, termin, läsår och enhet. Prova lärare null, delbemanning, flera lärare, mentorskap elev/kollega, specialuppdrag och APL-uppföljning.6000 budgetminuter mentorskap plus3600 framtida schemaminuter får fortfarande bli6000 budgetminuter; schemafält är null/ej anslutet i denna etapp. Två klasser samläses60min av samma lärare ger60personminuter; två lärare ger60vardera, inte delning till30. Prova deltagandeandelar, partiell samläsning, överallokering, identiska aktivitets-ID:n i flera vyer, samma person med två skolandelar, blandat möte30+30 och förtroendetid utan dubbel total. Källa ändras, raderas, är ofullständig/okänd eller inte Gy25: behovsunderlaget blir inaktuellt/ostött och skrivs inte om tyst.</action>
<verify>Från web: node --test lib/tjanst-plan.test.mjs. Kontrollera RED för identitet, minuträkning och källförändring.</verify>
<done>Provmatrisen skiljer elevbehov, aktivitet, lärardeltagande, kapacitet och framtida schema.</done>
</task>

<task type="auto">
<name>2. Implementera behov, tjänsterader och spårbara jämförelser</name>
<files>web/lib/tjanst-plan.ts; web/lib/tjanst-plan.test.mjs</files>
<action>Implementera kontraktets rena underlag och strikta plan/read/command/status/reply-parsers. Behov läses från uttryckliga klasskopplingar och vald faktisk Gy25-källa; planning-year-summary eller poängtal får inte summeras som lärartid. En unik aktivitet bär egen omfattning, ämnes-/klasskällor och separat lärardeltagande; allokeringar pekar på samma anställningsperiodbudget. Arbetsuppgift och tidsform är två dimensioner. Behåll obemannade rader som behov och visa deras obemannade minuter separat från redan använda personminuter. Spara stabila rad-/aktivitets-ID:n och källsnapshot, jämför med aktuell källa och ge uttrycklig omprövning. Data från andra skolor är endast kapacitetsreservationer, aldrig motiveringar eller elevuppgifter. Returnera separata mått för totalt avsatt, per tidsform, känt kvarvarande, okänd ram och saknad källtäckning. Schemaandel och utfall är ej anslutna/null, aldrig0procent eller fri kapacitet. Frys canonical source-/contentpayload och portabla testvektorer som03A och SQL använder. SS12000 Activity.minutesPlanned och teachers[].minutesPlanned hålls isär via DutyAssignment; intern behovsreferens är inte standardutbyte.</action>
<verify>Prov till GREEN; kör node --test lib/class-timplan.test.mjs lib/planning-year-model.test.mjs lib/tjanst-personal.test.mjs lib/tjanst-avtal.test.mjs och npx tsc --noEmit.</verify>
<done>Tjänsteplanen kan summeras utan dubbelräkning och visar källförändringar, obemannat och okänt som olika tillstånd.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
I denna tidiga plan prövas endast tillgänglig ren tidsmatematik och kapacitetsdata med syntetiska vektorer. Den fulla SharedAssessmentBasis-kedjan genomförs i03A/06 och verifieras först i09/17, inte som krav på ännu oskapade tabeller här. Senare integrationsfall: gemensam individuell undervisnings-/PU-ram över skolor: tak500 och300+300undervisning ska neka trots tillräcklig totalbudget;300+200 kräver minst600PU utan dubbel förtroendetidsallokering.03A definierar modellen,06 lagrar/prövar gemensam grund och12 låter berörda rektorer bekräfta sina delar. Huvudmannen fastställer inte.
Följ kontraktets reservationslivscykel: max(gällande publicerad budget, godkänd aktiv utkastreservation) per skolbeslut/anställningssegment, historik belastar inte. Prova100→utkast100=100,100→utkast80=100 fram till confirm,100→120=120 endast med tillgängligt20, avbryt120→100 och konkurrerande annan skola före/efter fastställd minskning. Fastställande/flytt uppdaterar hela reservationen atomärt. Prova dessutom dimensionerna separat: total1000/reglerad800→total1000/reglerad900 måste reservera ytterligare100 reglerade minuter; PU-minimum kontrolleras utan additiv dubbelräkning.
Lokal kravspårning: TJ1-03/04.
Behöver:01:s personalperioder och02:s tidsformer/beräkning. Skapar: behovs-, aktivitets-, kapacitets- och kontraktsgrund för03A/05/08. TID-01/03/07/09 samt TID-10:s budgetdel prövas; verklig schemaandel och kalenderkollisioner är T3, utfallet T4.
</verification>

<success_criteria>
- Tjänsterader utan lärare och uttrycklig samläsning representeras utan falska kapacitetstal.
- Ändrat källunderlag markeras och gamla beslut kan återskapas.
- Alla summeringar kan härledas till unik aktivitet, personperiod och tidsform.
</success_criteria>

<output>
Skriv 05-TJANST-03-SUMMARY.md med exportkontrakt, hash-/summevektorer, verifiering och integrationsgräns. Samordnaren hanterar commit/push.
</output>
