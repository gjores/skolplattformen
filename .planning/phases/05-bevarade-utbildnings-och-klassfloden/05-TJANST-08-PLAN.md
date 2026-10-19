---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-08
type: execute
wave: 5
depends_on: ["TJANST-04A", "TJANST-06", "TJANST-07"]
files_modified: ["web/lib/server/tjanst-plan.ts", "web/lib/server/tjanst-plan.test.mjs", "web/app/api/tjanst/plan/lasa/route.ts", "web/app/api/tjanst/plan/kommando/route.ts", "web/app/api/tjanst/plan/status/route.ts", "web/lib/server/tjanst-bedomning.ts", "web/lib/server/tjanst-bedomning.test.mjs", "web/app/api/tjanst/bedomning/lasa/route.ts", "web/app/api/tjanst/bedomning/kommando/route.ts", "web/app/api/tjanst/bedomning/status/route.ts", "web/lib/server/tjanst-egen.ts", "web/lib/server/tjanst-egen.test.mjs", "web/app/api/tjanst/egen/lasa/route.ts", "web/app/api/tjanst/egen/kommando/route.ts", "web/app/api/tjanst/egen/status/route.ts"]
autonomous: true
status: superseded
superseded_on: 2026-10-19
superseded_by: "Fas 05.1 (tjänstefördelning) eller repot tjanstebedomning (tjänstebedömning); se ../05.1-tjanstefordelning/05.1-SPLIT-DECISION.md"
gap: TJANST-T1T2
must_haves:
  truths: ["Rektor kan bereda och fastställa sin tjänstefördelning utan huvudmannagodkännande.", "Huvudmannen får resursbild och åtgärder; läraren får endast sin publicerade eller uttryckligt delade dialogversion.", "Samtidiga källändringar, förlorade svar och förfalskade lärarinitiativ ger säkra besked."]
  artifacts: ["web/lib/server/tjanst-plan.ts", "web/lib/server/tjanst-bedomning.ts", "web/lib/server/tjanst-egen.ts"]
  key_links: ["Planroute → exakt behovskälla/kapacitet → SQL/TSparitet", "Bedömningsroute → rektorsmandat + samma revision/hash → atomiskt confirm", "Egenroute → verifierad StaffIdentityBinding och self/groupmandat → egen publicerad/dialogversion"]
---

<objective>
Koppla nio tjänste-/bedömnings-/egenroutes till skyddad SQL med oberoende kontraktskontroll. Aktivering görs samlat i09, utan bredare medlemskaps- eller elevåtkomst.
Omfattningsskäl: tre separata serverfamiljer använder redan färdiga SQL- och domänkontrakt. Varje task äger en adapter, dess testfil och tre tunna route-wrappers, exakt fem filer. Ingen ny verksamhetsalgoritm eller migrationskod utvecklas i denna plan.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@web/lib/server/authz.ts
@web/lib/server/db.ts
@web/lib/tjanst-plan.ts
@web/lib/tjanst-bedomning.ts
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-04A-SUMMARY.md
</context>

<tasks>
<task type="auto">
<name>1. Exponera tjänsteplan, kapacitetsbild och huvudmannens resursåtgärd</name>
<files>web/lib/server/tjanst-plan.ts; web/lib/server/tjanst-plan.test.mjs; web/app/api/tjanst/plan/lasa/route.ts; web/app/api/tjanst/plan/kommando/route.ts; web/app/api/tjanst/plan/status/route.ts</files>
<action>Implementera POSTfamiljen mot tjanst_plan_read/command/status(jsonb) med protectedRoute, MFA, CSRF vid mutation och required audit. Validera03:s fulla projektion före commit: klassbindning/källa, aktivitet/deltagande, unika personminuter, periodram och kapacitetsreservation. Rektor/admin bereder enligt skolmandat; HM-läsning är aggregerad och HM-kommando begränsas till resursåtgärd. Avvisa försök att använda samma commandroute som generell HM-redigering/confirm. Lärare får inte planlista. Dölj andra skolors anteckningar och individuella bedömningsfakta i rektors-/HMprojektion. Status/replay använder historiskt kvitto och färskt mandat; aktuell plan återläses separat. Schema/utfall förblir explicit unavailable/null.</action>
<verify>Från web: node --test lib/server/tjanst-plan.test.mjs. Positiva roller/operationer, HM förbjuden radändring, annan skola/kund, selflärare nekad planlista, dubblerad SQLsumma, felaktig källhash, stale revision, audit/MFA/CSRF, requeststorlek och samma commandId annat payload. Installerade05svar måste passera03parser.</verify>
<done>Tjänsteplanens API bevarar rätt tidsmått och ger endast operationer som mandatet medger.</done>
</task>

<task type="auto">
<name>2. Exponera rektors bedömning och atomiska fastställande</name>
<files>web/lib/server/tjanst-bedomning.ts; web/lib/server/tjanst-bedomning.test.mjs; web/app/api/tjanst/bedomning/lasa/route.ts; web/app/api/tjanst/bedomning/kommando/route.ts; web/app/api/tjanst/bedomning/status/route.ts</files>
<action>Implementera POSTfamiljen mot tjanst_assessment_read/command/status. Pröva operation för faktisk aktuell rektor; administrator får bara explicit beredning, ingen undantagsprövning eller confirm. HM får inte individbedömnings-/confirmvägen. Validera03A:s hash, tillstånd, undantagsgrund, källversioner, publicerad revision och blockerare med verkliga parsers innan commit; klientens actions/canConfirm är aldrig bevis. Bekräftelse ska ge exakt samma fastställda/publicerade version i kvittot. Säkra status/replay efter mandatändring, historiskt kvitto efter ny version och atomiskt rollback vid ogiltigt svar/auditfel. Inga elevuppgifter, motiveringar eller detaljerad initiativtext i generell säkerhetsaudit.</action>
<verify>node --test lib/server/tjanst-bedomning.test.mjs: rektorconfirm, HM/admin/lärare nekad confirm, gammalhash/avtalslucka/okändblandkategori, falskt publiceringsresultat, ändrat initiativ, auditfel, requestreplay samt felinjicerad SQLprojektion. Kör genom installerade06svar och03A:s riktiga parser.</verify>
<done>API:t kan inte separera publicering från fastställande eller godkänna ett annat underlag än rektorn granskat.</done>
</task>

<task type="auto">
<name>3. Exponera snäv egenvy och lärarinitierad dialog</name>
<files>web/lib/server/tjanst-egen.ts; web/lib/server/tjanst-egen.test.mjs; web/app/api/tjanst/egen/lasa/route.ts; web/app/api/tjanst/egen/kommando/route.ts; web/app/api/tjanst/egen/status/route.ts</files>
<action>Implementera POSTfamiljen mot tjanst_self_read/command/status. Person härleds från04A:s verifierade egenbindning i låst session; inga godtyckliga personval eller breda medlemskapsläsningar. Stöd både snävt selfuppdrag och befintligt gruppmandat när egenbindningen stämmer. Returnera egen publicerad version och endast uttryckligt delad dialogversion före beslut; inget annat utkast. Lärare ska kunna initiera11§1 från den delade versionshashen före fastställande, kommentera och lämna separat läskvittens. Rektor/admin/HM nekas imiterat egeninitiativ även med förfalskat actor/personfält. Läsning och återhämtning nekar vid återkallad bindning/uppdrag eller främmande mål. Granska09behovet av session/context från07A/07B; lägg inga parallella egen-scopeimplementationer i denna modul.</action>
<verify>node --test lib/server/tjanst-egen.test.mjs samt samtliga tre nya serverfiler, npx tsc --noEmit och npx oxlint app lib. Testa positiv egen åtkomst utan undervisningsgrupper, dialog föreconfirm, dold annat utkast, annan person/kund, falskt initiativ, återkallelse under write/status/replay och SQLsvar som läcker en kollega. Faktisk HTTP och direkta elevnekanden verifieras09.</verify>
<done>Lärarens egenvy och initiativ fungerar utan att ge allmän skol-, personal- eller elevåtkomst.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
Behöver:04A:s bindning/scope,06:s beslut/selfSQL och07:s servermönster. Skapar: nio APIroutes för UI11–14/09. TJ1-03/04/05/06/07/09 har serverbevis; riktiga Worker-/identitetsbevis återstår09. Egna roller och undantag är inte SS12000-behörighet eller CalendarEvent.teacherExceptions.
</verification>

<success_criteria>
- Nio routes matchar exakt SQLfamiljer och strikta parserkontrakt.
- Reaktiverade/gamla klienter kan inte övertrumfa återkallat mandat eller ändrat underlag.
- Lärare ser egen publicerad/dialogversion och kan inte läsa kollegor eller elever genom dessa vägar.
</success_criteria>

<output>
Skriv 05-TJANST-08-SUMMARY.md med API-/funktionsinventering, nekandematris och faktisk provnivå. Samordnaren hanterar commit/push.
</output>
