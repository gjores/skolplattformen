---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-04A
type: execute
wave: 4
depends_on: ["APL-01", "APL-03"]
files_modified: ["web/lib/plan-decision.ts", "web/lib/plan-decision.test.mjs", "web/lib/server/plan-decision.ts", "web/lib/server/plan-decision.test.mjs", "web/lib/apl-plan-journal.ts", "web/lib/apl-plan-journal.test.mjs"]
autonomous: true
status: complete
gap: APL-01
must_haves:
  truths: ["Historiska beslutskvitton kan återhämtas utan omtolkning enligt nya APL-regler.", "Nya beslutsunderlag kan inte använda legacy som klientvald genväg.", "Ett osäkert APL-sparförsök kan återupptas med samma scope och request."]
  artifacts: ["web/lib/plan-decision.ts", "web/lib/server/plan-decision.ts", "web/lib/apl-plan-journal.ts"]
  key_links: ["Betrott lagrat kontrakt → rätt legacy/structured projektion", "APL-underlag → oberoende decisionblockerare", "Scopebunden journal → exakt status/replay"]
---

<objective>
Inför versionsmedveten beslutstolkning och en strikt återhämtningsjournal som två avgränsade säkerhetsdelar. Filerna överlappar inte 04:s nya APL-API. Båda planerna utgår från 01:s färdiga typer/hash och 03:s SQL-kontrakt.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-IMPLEMENTATION.md
@web/lib/plan-decision.ts
@web/lib/server/plan-decision.ts
@web/lib/named-timplan-journal.ts
</context>

<tasks>
<task type="auto">
<name>1. Bevara gamla beslut och validera nya APL-underlag oberoende</name>
<files>web/lib/plan-decision.ts; web/lib/plan-decision.test.mjs; web/lib/server/plan-decision.ts; web/lib/server/plan-decision.test.mjs</files>
<action>Utöka decision detail/items/page och serverproject med kontraktets APL-underlag, capabiliteter och versionshantering. Programplanschecklistan och övriga profiler bevaras. Nya strukturerade timplanssvar kräver korrekt APL-data/minutmatris, aktuell innehållsbunden rektorshändelse och samma blockerare som SQL. Gamla receipt.result verifieras mot sin lagrade äldre form utan dagens APL-checks; håll replay av redan utförd submit/approve åtskild från ett nytt ännu ej utfört anrop. Dispatch väljs från betrott DB/kvitto, aldrig klientens schemaVersion. Ta bort ingen befintlig skyddad kontroll av fryst katalog, poäng, yrkesregler eller 2028-gränsen. Låt felaktig projektion rulla tillbaka transaktionen.</action>
<verify>Från web node --test lib/plan-decision.test.mjs lib/server/plan-decision.test.mjs. Prova historisk approved/submitted replay, nytt approve av äldre ärende stoppat, return/withdraw, forcerad legacyform/förfalskad version och borttagna APL-fält i nya svar, felaktiga minutallokeringar och godkännande av programplan före APL. Jämför installerade SQL-svar från 03 och kravchecklistor; använd inte dagens regler på historiska kvitton.</verify>
<done>Gamla redan utförda beslut återhämtas intakta, nya beslut använder full APL-kontroll och ingen legacygenväg finns.</done>
</task>
<task type="auto">
<name>2. Säkra klientens återupptagning av APL-kommandon</name>
<files>web/lib/apl-plan-journal.ts; web/lib/apl-plan-journal.test.mjs</files>
<action>Journal binds till identitet/kund/uppdrag/skola/exakt planversion och kontraktets request. Bevara commandId, payload och hash före anrop; ingen ny request skapas vid okänt utfall. Återladdning kan fråga status/replay, men fel scope, föråldrat mandat eller ändrat payload måste avvisas. Ett gammalt lyckat kvitto kan visa historisk framgång medan levande plan ändrats; visa konflikt och återläs, skriv aldrig kvittots innehåll tillbaka. Misslyckad lokal journalpersistens får inte leda till ospårad mutation. Ändrad CAS eller nyinmatning kräver ny granskning och eget kommando.</action>
<verify>Från web node --test lib/apl-plan-journal.test.mjs. Prova reload, förlorat svar, lagringsfel, annan identitet/skola/plan, ändrad request, ett redan utfört kvitto följt av senare planändring och oförändrat replay. npx tsc --noEmit och npx oxlint app lib.</verify>
<done>UI får en entydig återhämtningsmodell och behöver inte gissa om sparning genomförts.</done>
</task>
</tasks>

<verification>
APL1-04/05/06. Modell-/serverprov och installerad SQL-paritet är skilda bevis; faktisk Worker/OIDC sker 08. Samma timplans-ID och historiska käll-/klassrelationer bevaras enligt SS 12000-avstämningen; ingen extern integration ingår.
</verification>

<success_criteria>
- Historiska replayresultat bevaras och nya beslut kan inte passera med förfalskad legacyform.
- Idempotent återhämtning stöds utan scopeförväxling eller automatisk överskrivning.
</success_criteria>

<output>
Skriv 05-APL-04A-SUMMARY.md med kontraktsmatris, provnivå, bevarande och avvikelser. Samordnaren gör avgränsad commit/push.
</output>
