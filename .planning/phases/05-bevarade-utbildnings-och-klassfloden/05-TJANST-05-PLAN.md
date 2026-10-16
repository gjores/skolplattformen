---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-05
type: execute
wave: 3
depends_on: ["TJANST-03", "TJANST-04"]
files_modified: ["supabase/migrations/20261016132000_tjanst_plan.sql", "work/pilot/verify-tjanst-plan-commands.mjs"]
autonomous: true
status: planned
gap: TJANST-T1T2
must_haves:
  truths: ["Rektor kan spara klassernas undervisningsbehov, obemannade rader och hela läraruppdrag.", "Samtidigt arbete på två skolor kan inte använda samma personkapacitet två gånger.", "Huvudmannen kan följa samlade brister och dokumentera resursåtgärder utan att fastställa tjänstefördelningen."]
  artifacts: ["supabase/migrations/20261016132000_tjanst_plan.sql", "work/pilot/verify-tjanst-plan-commands.mjs"]
  key_links: ["Klassbindning/källversion → fryst behovssnapshot → uttrycklig källförändring", "Aktivitetens deltagare → gemensam employment-period-låsning → unik kapacitetsreservation", "Skolplanens aggregerade brister → HM-resursåtgärd utan individmotivering"]
---

<objective>
Skapa tjänsteplanens stängda SQL och gemensamma kapacitetskontroll. Alla skolor delar samma anställningsbudget; huvudmannens uppföljning får ingen beslutsknapp för tjänstefördelningen.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/CONCERNS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@web/lib/tjanst-plan.ts
@web/lib/class-timplan.ts
@supabase/migrations/20261016130000_tjanst_personal_avtal.sql
@supabase/migrations/20261015201000_named_timplan_commands.sql
</context>

<tasks>

Ordning före06: plan_read returnerar ett uttryckligt typat assessmentPending/notAvailable för bedömningsdelen och får inte referera ännu saknade bedömningstabeller.06 kompletterar denna projektion med faktiska aktuella/ofullständiga bedömningar; UI aktiveras först därefter.
<task type="auto">
<name>1. Lagra spårbara behov, tjänsterader och unika kapacitetsreservationer</name>
<files>supabase/migrations/20261016132000_tjanst_plan.sql</files>
<action>Skapa tjanst_-tabeller för skolplan/version, behovsreferens/snapshot, aktivitet, deltagande, uppgiftsallokering, kapacitetsreservation, resursåtgärd och requestkvitto. Använd03:s identiteter och portabla minutregler. Behov binds till klass-ID, klasskopplingsrevision, namngiven planserie/version, rowKey, term och explicit år; verifiera ägarskap och Gy25-källa på servern. Aktivitetens elevbehov och varje lärares minuter hålls isär. En rad får sakna lärare men ska fortsätta räknas som obemannat behov. Budgetreservationer räknas en gång per kanonisk deltagandeallokering och använder anställningsperiodens gemensamma kapacitet. Snapshot/aktuell källa jämförs vid läsning och beslut utan att källändring skriver om tjänsteplanen. Gamla originalobjekt och deras triggers bevaras; nya tjänstobjekt har egen revisionskedja. Dokumentera stabil låsordning för kund, anställningsperioder och skolplaner sorterade per ID; alla senare skrivvägar inklusive15 måste använda samma lås. Inga Worker-, direkt-tabell- eller helpergrants här.</action>
<verify>DDL och constraints provas i isolerad schema-only-databas. Kontrollera att samma klassnamn i annan skola inte kan knytas in, samma aktivitet inte dubblas via flera klasskällor och flera skolor verkligen delar samma budget-ID.</verify>
<done>SQL kan bära samläsning, delbemanning och gemensam kapacitet utan ogrundad omräkning av källans timmar.</done>
</task>

<task type="auto">
<name>2. Implementera plan-/kapacitetskommandon och huvudmannens åtgärder</name>
<files>supabase/migrations/20261016132000_tjanst_plan.sql; work/pilot/verify-tjanst-plan-commands.mjs</files>
<action>Implementera public.tjanst_plan_read/command/status(jsonb) enligt03:s kontrakt. Rektor/admin bereder inom uttryckligt skolmandat; huvudman får aggregerad uppföljning och egen lagrad resursåtgärd med ansvarig, beslut/åtgärd, måldatum och status, ingen undervisningsallokering eller confirm. Begränsa andraskolors/personers projektion till nödvändig reserverad kapacitet och brister; returnera inte motiveringar eller elevunderlag. Läsning ger avtalstäckning, neutral assessmentPending/notAvailable tills06 kompletterar med ofullständiga/inaktuella bedömningar, obemannat och tid per tidsform utan ett missvisande blandat tjänsteprocenttal. Lås samtliga berörda anställningsperioder i stabil ordning och kontrollera efter lås; avvisa teknisk dubbelbokning av samma kapacitet. Utkast får redovisa tidsbrist enligt kontraktet, men får inte markeras kapacitetsklar. Använd CAS, requestbundet immutable kvitto och atomisk säkerhetsaudit. En HM-resursåtgärd ändrar inte tjänstebeslutets hash; ändring av faktisk resursram gör underlaget inaktuellt. Implementera riktade riktiga SQL-prov och bevisad samtidighet med två anslutningar.</action>
<verify>node work/pilot/verify-tjanst-plan-commands.mjs mot validerat isolerat mål:60min samläsning, två lärare, obemannad rad,30+30blanduppgift, mentorbudget, två skolor samma person, HM-read/åtgärd, HM nekad radändring, annan kund, återkallelse, stale CAS, samma ID annat payload, auditfel och källa ändrad mellan läs/spara. Två transaktioner får inte båda konsumera samma återstående kapacitet; bevisa väntelås och slutresultat.</verify>
<done>Tjänsteplan och kapacitet har riktiga transaktionsbevis; HM-uppföljning läcker inga individuella bedömningar.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
I denna tidiga plan prövas endast tillgänglig ren tidsmatematik och kapacitetsdata med syntetiska vektorer. Den fulla SharedAssessmentBasis-kedjan genomförs i03A/06 och verifieras först i09/17, inte som krav på ännu oskapade tabeller här. Senare integrationsfall: gemensam individuell undervisnings-/PU-ram över skolor: tak500 och300+300undervisning ska neka trots tillräcklig totalbudget;300+200 kräver minst600PU utan dubbel förtroendetidsallokering.03A definierar modellen,06 lagrar/prövar gemensam grund och12 låter berörda rektorer bekräfta sina delar. Huvudmannen fastställer inte.
Följ kontraktets reservationslivscykel: max(gällande publicerad budget, godkänd aktiv utkastreservation) per skolbeslut/anställningssegment, historik belastar inte. Prova100→utkast100=100,100→utkast80=100 fram till confirm,100→120=120 endast med tillgängligt20, avbryt120→100 och konkurrerande annan skola före/efter fastställd minskning. Fastställande/flytt uppdaterar hela reservationen atomärt. Prova dessutom dimensionerna separat: total1000/reglerad800→total1000/reglerad900 måste reservera ytterligare100 reglerade minuter; PU-minimum kontrolleras utan additiv dubbelräkning.
Lokal kravspårning: TJ1-02/03/04/09.
Behöver:03:s behovskontrakt och04:s personal-/avtalstabeller. Skapar: tre stängda entrypoints och låsgrund för06/08/15. TID-01/03/07/09 och budgetdelen avTID-10. Kalenderförläggning/schemaandel/utfall är null/ej anslutet; APL:s elevtimmar får inte bli lärartid. SS12000 Activity/DutyAssignment bevarar olika tidsmått.
</verification>

<success_criteria>
- Exakt behovskälla och unik lärarallokering kan återläsas.
- Samtidiga skolplaner kan inte ge dubbel godkänd kapacitet.
- Huvudmannens åtgärder lagras separat från rektors fastställande.
</success_criteria>

<output>
Skriv 05-TJANST-05-SUMMARY.md med lås-/källkontrakt, SQL-resultat och kapacitetsfall. Samordnaren hanterar commit/push.
</output>
