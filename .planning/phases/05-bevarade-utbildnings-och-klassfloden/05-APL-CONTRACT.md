---
phase: 05-bevarade-utbildnings-och-klassfloden
package: APL
stage: 1
status: planned_contract
date: 2026-10-16
source_revision: af70fb1a3993d1361e2c39b81961c3a255a1db16
---

# APL etapp 1 – gemensamt genomförandekontrakt

Detta är ett planeringskontrakt, ingen implementerad funktion. [Kontext](05-APL-CONTEXT.md) och [research med rättskällor](../../research/APL-PLANERING-OCH-GENOMFORANDE-2026-10-16.md) styr avgränsningen. Ingen ny extern teknik behövs. Septemberkartorna i `.planning/codebase/` ger orientering; aktuell skyddad kod och migrationskedja har granskats på af70fb1.

## 1. Identitet, omfattning och lagring

En APL-plan tillhör **en exakt timplansversion**: stabilt plan-ID, kund, skola, utbildning, timplansserie och fryst programkälla. Ingen separat allmän klasslista eller elevplacering skapas. Klassernas giltiga befintliga versions-/läsårskopplingar visas som sammanhang; klassantal multiplicerar aldrig timmarna.

Använd additiva, privata skyddade APL-tabeller för planunderlag, perioder, innehållsrelationer, timfördelning, rektorshändelser och requestbundna kvitton. Föreslagen uppdelning är underlag → period → innehållskoppling respektive allokering; ett fryst kvitto behöver även hela verifierbara svarskontraktet. Befintliga tabeller får ingen härledd omräkning vid installation. RLS, explicita grants och serververifiering ska hindra direkt klientåtkomst till hjälpobjekten.

Underlag har avtalsversion `structured_v1`; frånvaro av underlag betyder **äldre/ej strukturerat**, aldrig noll APL eller automatiskt skolförlagd form. Utbildningsform väljs som skolförlagd, lärling eller ännu okänd. Delvis arbetsplatsförlagd vecka är dessutom en egenskap hos periodens beräkningsunderlag; form och veckoberäkning får inte blandas ihop.

Varje period har nytt stabilt UUID, begripligt namn, planerad start/slut, en eller flera innehållskopplingar och uttrycklig omfattningsgrund. Ofullständig period kan sparas som utkast. Kalenderdatumen måste vara giltiga och ordnade. Fördelningen över befintliga sex terminer använder samma frysta start och årsprojektion som `projectGymTimplanYear`, inklusive vårstartens granskningsbehov. Juli-/januarigränser är projektion för visning, inte en faktisk läsårskalender eller APL-veckoregel.

Innehållskopplingen refererar befintlig fryst `rowKey`/nivå och beskriver vilken del som avses. Lås inte in lokala beskrivningar som nya katalogkoder. Ofullständigt valbart block kan få sparat planeringsunderlag, men får inte räknas som en verifierad ämnesnivåkoppling. En period kan bidra till flera nivåer utan att dess tid dupliceras.

## 2. Tidsmått och validering

Befintliga `timplan_cells.hours` är fortsatt totaler med heltal/null och samma sparsemantik. Separata APL-allokeringar är **varav**, lagrade som heltals-GUT-minuter, per period + fryst rowKey + terminsindex. Samma tuple får inte förekomma två gånger. Innehållskoppling utan tid är tillåten när hela tidsandelen redan ligger på andra berörda rader.

För den stödda skolförlagda profilen gäller vid granskning:
- Uppgiven omfattning är ett positivt helt antal hela APL-veckor som rektor granskar. Periodens allokering summerar exakt till veckotal × 23 × 60 GUT-minuter och visas som timmar/minuter. Den samlade granskade planeringen omfattar minst 15 veckor, utan dubbelräknade eller samtidiga perioder för samma planeringsgrupp.
- Allokering är icke-negativ och avser aktiva terminsfält med relevant programinnehåll. Summan APL-minuter per cell får inte överstiga cellens sparade totaltimmar × 60. En för liten total rättas i den vanliga timplanen, aldrig genom tyst höjning vid APL-sparande. Att spara en allokering mot null/ofördelad total eller över totalen nekas med begripligt besked; period/innehåll kan sparas utan färdig allokering. En senare timcellsminskning under befintlig APL-andel nekas atomiskt och hänvisar till att först justera APL-fördelningen. Läsaren ska aldrig behöva acceptera en strukturellt oläsbar sparad matris.
- Okänd eller ofullständig fördelning kan sparas som utkast med uttryckliga brister. Endast en komplett, granskad fördelning får ge total = skolförlagd + varav APL. Äldre ospecificerad tid får inte kallas skoltid före granskningen.
- Datum räknas aldrig automatiskt om via dagar/5, timmar/40 eller antal kalenderveckor. Datum-/terminskonflikt, överlapp eller en uppenbart oförenlig uppgiven omfattning ska synliggöras och hindra ett färdiggranskat underlag tills det lösts. Den tekniska övre rimlighetsgränsen är antalet olika ISO-kalenderveckor som det inklusive datumintervallet berör. Uppgivet helt veckotal får inte överstiga denna gräns. Detta beräknar inte faktisk APL-omfattning och ger aldrig i sig granskad status. Automatiska rimlighetskontroller är inte nationella definitioner av full APL-vecka.
- Del-/blandvecka och osäker omfattning har `needs_review` med motivering och utan schablonberäknad GUT/uppfyllelse. Sådant utkast får sparas men kan inte bli godkänt strukturerat APL-underlag i etapp 1. Ingen knapp för godtycklig override införs.

Minutprecisionen gäller fördelning av en känd GUT-omfattning mellan innehåll och terminer, exempelvis 11 h 30 min per nivå. Den tillåter inte en obestyrkt omräkning av delveckor. Använd heltalsaritmetik utan flyttalsavrundning; UI visar timmar/minuter, medan befintliga totalceller behåller hela timmar. Arbetsplatstid, elevnärvaro och lärartid beräknas inte från GUT och registreras inte här. Osäker beräkningsgrund ska förbli synlig.

## 3. Roller, samtidighet och beslut

Befintlig kod tillåter rektor/skoladministratör att bereda gymnasietimplan och huvudman att läsa/fastställa. Bevara detta. Server och DB avgör aktuellt kund-/skolmandat; APL-utkast, rektorsbekräftelse, kvitto/statusläsning och replay har varsin verifierad kontroll. APL-bekräftelse kräver faktisk rektor med rätt skola, inte bara `canPlan` eller klientroll.

APL-skrivning, radtimskrivning och förläggningsbekräftelse tar samma timplanslås och CAS-revision. Varje verklig APL-innehållsändring ökar timplansrevisionen en gång och har atomisk obligatorisk audit. Request-ID + aktör + uppdrag + exakt payload ger idempotens; auditfel rullar tillbaka både innehåll och kvitto. Statusläsning kräver samma requestidentitet och färskt mandat. Ingen tyst mutation efter ett felaktigt UI-svar.

Rektors bekräftelse är en egen oföränderlig ansvarshändelse med aktör, uppdrag, tid och **innehållshash** för APL, timceller, fryst källa och relevant innehållsfördelning. Den kopplas inte enbart till timplansrevision: submit/approve höjer också revision utan att ändra innehållet. Ny relevant innehållsändring gör bekräftelsen inaktuell. Skoladministratör kan bereda men kan inte ersätta rektors bekräftelse. Huvudmannens timplansbeslut förblir separat.

Bekräftelse av tillräckligt underlag kräver giltig periodförläggning, ämneskoppling, granskat helt veckotal, full timklassificering och stödd profil. Ingen kombination av frontendknappar får hoppa över DB-kontrollen. `phase5_plan_decision_detail`/command och serverns `projectPlanDecision` behöver samma regler och frysta APL-data; klientberäknad totalsumma eller hash godtas inte som bevis.

## 4. Äldre ärenden, kvitton och versionskopiering

| Situation | Avsedd hantering |
| --- | --- |
| Fastställd/ersatt äldre plan | Läsbar som historiskt underlag med okänd strukturerad APL-fördelning. Ingen omräkning, statusändring eller ny bekräftelse. Ny planering görs i ny version. |
| Äldre utkast/återsänd yrkesplan | Kan redigeras; APL aktiveras uttryckligt i samma planversion. Ny submit kräver aktuellt APL-underlag. |
| Redan inskickad äldre yrkesplan | Nya approve-anrop blockeras för komplettering. Återkalla/återsänd fungerar, sedan aktivering och ny granskning. Migration skriver inte om status/revision eller gör ett tyst nytt beslut. |
| Gammalt requestbundet beslutskvitto | Samma lagrade result/request/hash återges efter färskt mandat. Servern använder legacyverifiering för gamla svar; dagens APL-fält/checks får inte injiceras i historiska svar eller hindra legitim återhämtning av ett redan utfört beslut. |
| Ny timplansversion | Kopiera planeringsstruktur endast enligt den uttryckliga versionshandlingen; nya period-ID:n, inget gällande rektorsbeslut. Ändrad källa ger synliga omatchade kopplingar/granskningsbehov, aldrig borttappad tid. |
| Ny namngiven plan från annan | Samma explicit valda strukturella kopiering, utan giltighetsbeslut eller klassomflyttning. Tom ny plan får inget härlett APL-veckotal. |
| Ny elevkull | Befintlig skyddad kopiering av programplan fortsätter utan timplaner/elever/klasser. Lägg inte till implicit APL-kopiering i denna etapp. |

Nuvarande beslutshash inkluderar revision/status. Behåll dess CAS-skydd men inkludera versionsmedvetet APL-underlag när strukturerad modell gäller. Rektors innehållshash är en separat funktion. Programplanens befintliga APL-checklista och icke-yrkesplaners beslut ska inte ändras av denna timplansutökning. SQL, strikt svarstolkning, inkorg och faktisk Worker-replay behöver gemensamma kompatibilitetsfall.

## 5. Användarflöde

APL visas i den öppna namngivna timplanen med aktuell skola/kull och samma årsval. Sammanfattningen visar perioder, uppgiven och granskad omfattning samt varav APL. Handlingarna är **Planera APL**, **Spara APL-plan**, **Bekräfta förläggningen** för rektor och en tydlig länk till befintligt inskickande/beslut. Sparande och bekräftelse ger olika, begripliga kvitton. Ingen beteckning säger att APL är genomförd.

Vid gamla timmar visas före/efter med oförändrad total och återstående ospecificerad fördelning. Vid konflikt visas vad som ändrats och kräver ett uttryckligt nytt sparförsök. Osparat-/pågående-skrivskydd samordnas med befintlig radvis autosparning före APL-bekräftelse eller beslutsövergång. Byte av kontext rensar rätt underlag och sena svar kan inte läcka in i nästa plan.

Perioder för olika klassvarianter hanteras i deras namngivna planer. Etapp 1 gör ingen individuell APL-placering och har inte flera parallella elevgruppers omfattningsräknare inom en plan; sådana behov ska visas som senare omfattning, inte summeras som om alla elever deltog i alla perioder.

## 6. SS 12000 och lokala acceptanskriterier

Avstämningen gäller SS 12000:2024, utgåva 4, publicerat OpenAPI 2.1.0. Researchen innehåller primärkällor, hämtningstid och hash. Interna APL-planobjekt har ingen verifierad full extern motsvarighet. Person/Group/GroupMembership och Activity/CalendarEvent/Attendance är möjliga framtida delprojektioner; ingen export byggs här. APL-perioder får inte bli Placement eller faktisk Attendance genom antagande. Stabil identitet, skolrelation, giltighet och skrivansvar måste bevaras i tester.

| ID | Observerbart resultat som planpaketet ska bevisa |
| --- | --- |
| APL1-01 | Uttrycklig rätt utbildningsform och regelprofil; okänt/lärling/delveckor ger inget falskt uppfyllelsebesked. |
| APL1-02 | Perioder, datum, år och flera relevanta innehållskopplingar kan sparas/öppnas med beständiga ID:n. |
| APL1-03 | Total/varav APL stämmer utan dubblering; äldre ospecificerade timmar och flera ämneskopplingar hanteras säkert. |
| APL1-04 | Rektors innehållsbundna bekräftelse och huvudmannens beslut är separata; ändringar och gamla inskickade ärenden hanteras uttryckligt. |
| APL1-05 | Aktuellt mandat, CAS, idempotens, MFA/CSRF, auditrollback och avbrottsåterhämtning håller genom faktisk SQL och API. |
| APL1-06 | Parallella namngivna planer, nya versioner, historiska kvitton och exakta klasskopplingar bevaras. |
| APL1-07 | Begripligt spara/granska/besluta på dator och telefon; handboken beskriver verifierat beteende och bygger. |
| APL1-08 | Faktiska SQL-/Worker-/OIDC-/browserprov, databevarande och exakt lokal leverans särredovisas från simulering och mänsklig acceptans. |

## 7. Kontroll av planerna före start

Granska hela senaste funktionsdefinitionen, inte endast första migrationen där namnet förekom. Särskilt: radtimskrivning, `phase5_named_timplan_create`, `phase5_create_gym_timplan`, deras gemensamma copy_rows, beslutsdetail/command/items/page och serverns historiska svarsprojektion. Kontroller ska omfatta återkallat mandat, simultan APL-/timskrivning, semantisk hash mot ren revisionsändring, gamla submitted/approved-kvitton, byte av programkälla, vårstart och två klassvarianter.

Befintliga originalrader, timmar, datum, ACL och beslutshistorik ska jämföras före/efter migration och efter cleanup i isolerad syntetisk testmiljö. Lägg inte verkliga elevdata, sessioner eller hemligheter i repo. Daterade testbevis och verifierat nytt bygge krävs först vid implementation; denna kontraktstext är inte ett sådant bevis.
