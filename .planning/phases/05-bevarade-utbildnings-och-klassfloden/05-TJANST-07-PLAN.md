---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-07
type: execute
wave: 4
depends_on: ["TJANST-01A", "TJANST-04", "TJANST-04A"]
files_modified: ["web/lib/server/tjanst-personal.ts", "web/lib/server/tjanst-personal.test.mjs", "web/app/api/tjanst/personal/lasa/route.ts", "web/app/api/tjanst/personal/kommando/route.ts", "web/app/api/tjanst/personal/status/route.ts", "web/lib/server/tjanst-avtal.ts", "web/lib/server/tjanst-avtal.test.mjs", "web/app/api/tjanst/avtal/lasa/route.ts", "web/app/api/tjanst/avtal/kommando/route.ts", "web/app/api/tjanst/avtal/status/route.ts"]
autonomous: true
status: planned
gap: TJANST-T1T2
must_haves:
  truths: ["Huvudmannens avtalsval och personalgrund kan användas från ett skyddat API.", "Rektor får endast de skoluppgifter och avtal som aktuellt mandat medger.", "Ogiltiga SQL-svar, återkallade mandat och osäkra skrivutfall ger inget falskt sparatbesked."]
  artifacts: ["web/lib/server/tjanst-personal.ts", "web/lib/server/tjanst-avtal.ts", "web/app/api/tjanst/avtal/kommando/route.ts"]
  key_links: ["POSTroute → protectedRoute/MFA/CSRF → låst session/aktuellt mandat → SQL", "SQLresultat → oberoende strikt TSprojektion före commit", "Exakt request/status → historiskt kvitto och separat aktuell omläsning"]
---

<objective>
Exponera de sex personal-/avtalsentrypointsen genom skyddade serveradaptrar.09 äger Workergrants och verklig HTTP-grind; denna plan ändrar inte generella medlemskapsrättigheter eller egenmandat.
Omfattningsskäl: två oberoende serverfamiljer, vardera en adapter med kontraktsprov och tre tunna route-wrappers. Varje implementationstask äger fem filer; ingen affärslogik dupliceras i routes. Tredje uppgiften verifierar samma adaptrar och lägger inga nya datamodeller.
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
@web/lib/server/class-cohort.ts
@web/lib/tjanst-personal.ts
@web/lib/tjanst-avtal.ts
</context>

<tasks>

Personbindningens bind/unbind-operationer ska använda01A:s strikta parser från web/lib/tjanst-self-access.ts och04A:s kompletterade personal_command/status. Bindningen får ingen separat öppen RPC.
<task type="auto">
<name>1. Koppla personalens läsning, kommando och status till skyddad serverväg</name>
<files>web/lib/server/tjanst-personal.ts; web/lib/server/tjanst-personal.test.mjs; web/app/api/tjanst/personal/lasa/route.ts; web/app/api/tjanst/personal/kommando/route.ts; web/app/api/tjanst/personal/status/route.ts</files>
<action>Skapa POSTroutes mot public.tjanst_personal_read/command/status(jsonb). Använd befintlig protectedRoute, MFA, required audit och CSRF för mutationer; kund, aktör och uppdrag kommer från aktuell låst session. HM hanterar gemensam person-/anställningsgrund, rektor sina skoluppdrag och förslag enligt kontraktet, admin endast uttrycklig beredning. Inget läsmandat för lärare/personallista. Parsning är strikt och bounded; person-ID/filter ska inte hamna i URL eller generell audittext. Kontrollera SQLresultatets fulla identitet, perioder, skolscope, revisioner och immutable kvitto med01-parser före commit. Ett felaktigt svar ska orsaka rollback/AuditUnavailable; returnera ingen legacyfallback. Använd befintliga väl definierade400/403/409/503-/auditfel och kontraktets safe blockerfält utan nya oförankrade felkoder. Status/replay återprövar aktuellt mandat och får inte återställa en gammal projektion som dagens data.</action>
<verify>Från web: node --test lib/server/tjanst-personal.test.mjs. Positiv HMgrund/rektorsskoluppdrag, fel kund/skola, lärare nekad lista, återkallat mandat, CSRF/MFA, extra fält, översized request, fel SQLscope/profil/revision, auditfel och okänt skrivutfall. Prov med stubbat SQL benämns serverprov, inte faktisk Worker.</verify>
<done>Personal-API:t använder färskt mandat och validerat underlag utan breda nya rättigheter.</done>
</task>

<task type="auto">
<name>2. Koppla avtalsval och versionsgranskning till skyddad serverväg</name>
<files>web/lib/server/tjanst-avtal.ts; web/lib/server/tjanst-avtal.test.mjs; web/app/api/tjanst/avtal/lasa/route.ts; web/app/api/tjanst/avtal/kommando/route.ts; web/app/api/tjanst/avtal/status/route.ts</files>
<action>Skapa motsvarande POSTfamilj mot tjanst_avtal_read/command/status. Endast aktuell HM kan tillgängliggöra/aktivera versioner och lokala tillägg; rektor/admin kan läsa de profiler som behövs för tillåtna skoluppdrag utan att välja ogrundad tillämpning. Använd02:s parser och oberoende beräkningskontroll av källversion, giltighet, profilstatus, tidsform och ram; trasiga eller motsägelsefulla projektioner får inte bli produktionsklara. Inga dokumentuppladdningar eller privata avtalsbilagor införs här; använd tillåtna käll-/dokumentreferenser. Replays är historiska kvitton, versionändring skapar nytt objekt och kan inte skriva över beslutskällor. Samma säkerhets-/storleksgränser som personalfamiljen, utan en generell rollbaserad mutationstunnel.</action>
<verify>node --test lib/server/tjanst-avtal.test.mjs från web: två olika profiler, lokal version, aktivering, ofullständig källa, utgången period, rektor nekad profilskrivning, HM från annan kund, CSRF/MFA, CAS/replay/auditfel och felinjicerade SQLsvar som nekas före commit.</verify>
<done>Huvudmannen kan använda flera avtal genom ett strikt serverkontrakt; inga profiler aktiveras av klientens egen etikett.</done>
</task>

<task type="auto">
<name>3. Kontrollera installerad kontraktsparitet före API-aktivering</name>
<files>web/lib/server/tjanst-personal.ts; web/lib/server/tjanst-personal.test.mjs; web/lib/server/tjanst-avtal.ts; web/lib/server/tjanst-avtal.test.mjs</files>
<action>Kör04:s installerade syntetiska SQLsvar genom verkliga01/02parsers och adaptrar. Falskt scope, saknat fält, ogrundat beräknat värde och oförenlig receiptversion ska neka hela transaktionen. Dokumentera exakt sex RPC-signaturer som09 senare aktiverar. Kontrollera att routes kräver rätt operation, att nya moduler inte ändrar db.ts/mandate-policy/access_assignments och att inga självfunktioner eller membershipgenvägar smugit in. Slutlig faktisk HTTP kommer09; denna kontroll är kontraktsparitet.</action>
<verify>node --test lib/server/tjanst-personal.test.mjs lib/server/tjanst-avtal.test.mjs lib/server/deny-path.test.mjs, npx tsc --noEmit och npx oxlint app lib. Jämför sexfamiljens signaturer mot04; ingen Workergrant ska ha införts.</verify>
<done>Person-/avtalsadaptrar har strikt SQL/TSparitet och är redo för09:s samlade aktivering.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
Behöver:04:s faktiska SQLkontrakt. Skapar: sex APIroutes för10/10A och09. TJ1-01/02/09 samt TID-04/08 har serverbevis; ingen verklig inloggning eller kommunanslutning påstås. SS12000-identitet/källa bevaras genom parsers; inga nya standardanrop görs.
</verification>

<success_criteria>
- Alla sex routes använder låst aktuell session och strikt resultatkontroll.
- Personuppgifter ligger inte i URL eller generell audittext.
- Felaktiga projektioner eller nekade mandat ger inga delskrivningar.
</success_criteria>

<output>
Skriv 05-TJANST-07-SUMMARY.md med API-/RPCinventering, faktisk provnivå och nästa beroenden. Samordnaren hanterar commit/push.
</output>
