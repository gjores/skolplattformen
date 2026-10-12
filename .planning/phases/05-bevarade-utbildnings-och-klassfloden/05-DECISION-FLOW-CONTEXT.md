# Beslutsflöde för programplan och gymnasietimplan

Datum: 2026-10-12. Status: beställt och planerat; inga nya genomförande- eller testbevis följer av detta dokument.

## Beställning och avgränsning

Användaren beställer att hela kedjan från utkast till godkänd programplan och timplan ska fungera och vara tydlig, följt av en granskning av kvarstående luckor. Detta är ett genomförandebeslut. Tidigare klargörande avgränsar programplan–timplan-kedjan till gymnasiet. GR/IM:s befintliga data och funktioner ska bevaras; individuella IM-beslut, kommunanslutning och full fasacceptans följer inte av detta.

## Redan beslutade regler

- Huvudmannen fastställer programplanen. Godkänd är fastställd, inte ytterligare en påhittad programstatus. Utkast får sparas trots ofullständigt underlag. Granskning av inskickad/återsänd programplan lagras separat från point_plans.status, med egen workflowrevision. HM kan fastställa direkt efter granskning av utkast eller efter skolans inskickning. Inskickat innehåll är låst även genom direkt befintlig utkast-RPC; återsändning återöppnar det.
- Programplanen kan delas av flera skolor. Beslut och skrivning måste pröva levande mandat och samtliga berörda skolor enligt befintlig scope/livscykel, även efter låsväntan.
- Komplett sparad programplan, även utkast, får skapa skolans timutkast. Den möjligheten får inte tas bort när fastställande tillkommer.
- Timplanen är skolbunden. Rektor/skoladministratör planerar och lämnar förslag. Huvudmannen granskar, återsänder eller fastställer; ingen administratör får egen beslutsrätt. Återsänd plan blir redigerbar och får lämnas igen. Fastställda och ersatta versioner är läsbara och låsta.
- Programplanens låsning vid kullstart består. Samma datumlås ska inte införas för timplanen: fortsatt planering sker i en ny version, med bevarad beslutshistorik.
- Paket och blockhantering är borttagna ur programarbetsytan. Källans befintliga alternativa ämnen, blockramar och poängfördelning består; paket får inte återinföras som beslutskrav.
- Timplanslistan visar bara skapade timplaner. Programplaner visar skolvis timplansstatus och Skapa/Öppna timplan med exakt källa och skola.
- Ny version eller nytt beslut flyttar aldrig befintliga klass–timplanskopplingar. Samma skola/läsår/årskurs och explicita version följer med mellan listor och arbetsytor.

## Verifierad kodbild vid planering

Läst: PROJECT/STATE, REQUIREMENTS, codebase/ARCHITECTURE och äldre 05-25/26/32/33. Arkitekturkartan beskriver även äldre demo och är inte aktuell skyddad beslutsimplementation. Äldre beslutplaner har replan_required och innehåller föråldrade paketkrav/migrationsnummer; detta ersätter deras genomförandeordning för denna beställning utan att skriva om historiska bevis.

`programplan-analysis.ts` analyserar poäng och terminer, men dess `ready` kan bli sann trots okänd yrkesram. Den får inte ensam auktorisera beslut. `programplan-catalog.ts` och befintliga utkastkontrakt anger med avsikt `decisionReady:false`; skapa separat beslutsunderlag, ändra inte dessa flaggor globalt.

`gym-timplan.ts` har redan fem statusvärden, men `gymTimplanCanEdit`, SQL:s gym_guard, cellskrivning och canPlan begränsar till utkast. Beslutsövergångar måste ändra dessa samstämmigt. Nuvarande create/kvittomodell, fryst gym_basis, sex terminer, null för ofördelat och explicit nolltid ska återanvändas.

`sourceChanged` jämför källans id/version/revision. Programfastställande kan öka revision utan innehållsändring. Flödet får därför inte fastna när timutkast skapats före programbeslut. Bevara originalsnapshot. Serverberäkna ett kanoniskt innehållsfingeravtryck som omfattar relevant exakt katalog/programbas, rader, poängterminer och utbildningsuppgifter, men utesluter beslutets status/revision/datum. Samma oförändrade källinnehåll får fortsatt användas när källan fastställts. Annat innehåll kräver synlig jämförelse och explicit ny timversion med bevarade oförändrade radnycklar. Godtyckliga revisionsskillnader får inte likställas med oförändrat innehåll.

## Nationella regler utan gissningar

Ny primärkällskontroll ska utföras före aktivering av en beslutsprofil. Äldre research TIMPLAN-ARBETSYTA-OCH-ANALYS-2026-10-04.md är en ingång till Skolverket och författningstext, inte färskt bevis. Dokumentera faktisk källa, granskningsdatum, gäller-från/till, Gy25/programkod/kategori och kullstart. Verifiera programram, individuellt val/gymnasiearbete och minsta undervisningstid samt vilken tid som får räknas. Elevens individuella avvikelser och faktiskt genomförd tid får inte påstås vara verifierade genom en gemensam plan.

Separera deterministiska fel, obligatoriska sakgranskningar, lokala risker och allmän information. Okänd regelprofil eller oidentifierad programram blockerar fastställande med konkret orsak; en checkbox får inte ersätta saknad regel. Riktiga lokala/manuella kontroller får kvitteras av behörig beslutsfattare för exakt revision och profil. Utred yrkesprofiler inom beställningen; stoppa inte allt arbete för att det äldre plannumret 05-17 saknar SUMMARY. Om någon kategori inte kan verifieras ska övriga belagda profiler genomföras och den verkliga kvarvarande begränsningen redovisas, utan att hela kedjan kallas färdig för den kategorin.

## Säkerhet och återhämtning

Slutna kommandon/replies; aktör/datum/mandat kommer från server. CAS för plan, källa och analys; commandId med exakt payloadbundet kvitto och auditerad statusåterläsning. Mutation, historik, kvitto och obligatorisk audit är atomiska. Samma kommando får återläsas utan dubbelt beslut, men payloadbyte nekas. Återkallat mandat nekar även återläsning/replay. SQL-rättigheter och triggers måste hindra direkta genvägar.

## Slutgranskningens särskilda frågor

1. Fungerar timutkast före programfastställande hela vägen till fastställd timplan?
2. Kan återsänt förslag rättas och lämnas igen utan förlorade timmar?
3. Går historik och exakt beslutskälla att återfinna efter omladdning och ny version?
4. Spärras dubbla flikar, fel skola, återkallat mandat, osparad rad och tappat svar begripligt?
5. Bevaras äldre år/klasser/fastställda versioner samt GR/IM?
6. Finns någon programkategori som ännu saknar belagd regelprofil? Redovisa den ärligt och separat från tekniskt fungerande beslut.
