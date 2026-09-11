# Codebase Concerns

**Analysis Date:** 2026-09-11

Kartläggningen beskriver kodbelägg och demoavgränsningar i arbetskopian. **Hög** prioritet avser sådant som behöver hanteras före skyddad pilotdrift eller kan förlora administrativa ändringar. Åtgärderna är förslag till fortsatt arbete, inte beslutade faser.

Underlaget är statisk läsning av `web/app/`, `web/lib/` och `supabase/migrations/`. Ansluten databas, nättrafik och webbläsarbeteende är inte verifierade i denna genomgång. `docs/granskning-2026-09-07.md` ger reproduktionsunderlag; rapportens test- och byggresultat är inte bevis för dagens drift. Modelltesternas aktuella resultat och avgränsning redovisas i `.planning/codebase/TESTING.md`.

## Tech Debt

**Sammanhängande skrivningar saknar gemensam transaktion — hög:**
- Problem: `decidePointPlan` ersätter den gällande versionen innan den nya fastställs och innan händelserna skrivs. Timplaner och läsår sparar också innehåll, status och historik med flera fristående anrop.
- Filer: `web/lib/organisation-store.ts:489`, `web/lib/planning-store.ts:161`, `web/lib/planning-store.ts:388`.
- Utlösare: ett senare anrop misslyckas efter att ett tidigare har lyckats, exempelvis vid nätfel, konflikt eller avvisad skrivning.
- Effekt: poängplanen kan sakna gällande version, eller innehåll/status och händelser kan motsäga varandra. Omläsning återger delresultatet men återställer inte transaktionen.
- Åtgärd: använd avgränsade databasfunktioner med mandatkontroll och transaktion för sammanhängande beslut.
- Befintligt mönster: kullkopiering är transaktionell och använder låsning i `supabase/migrations/20260908120000_cohorts_classes.sql:2`; skolimport och rektorsutnämning använder databasfunktioner i `supabase/migrations/20260908150000_school_import.sql:4` och `supabase/migrations/20260908150000_school_import.sql:28`.

**Läsning skapar exempeldata och kan göra bred återställning — hög inför pilot:**
- Problem: `loadOrganisation`, `loadTimplans` och `loadSchoolYears` skapar exempeldata när resultatet är tomt. Läsvägarna förutsätter skrivbehörighet och en demomiljö.
- Filer: `web/lib/organisation-store.ts:246`, `web/lib/planning-store.ts:88`, `web/lib/planning-store.ts:244`.
- Effekt: tomma verksamhetsobjekt fylls med exempeldata. Vid misslyckad organisationsseedning raderas alla skolor och uppdrag för huvudmannen, utan avgränsning till rader skapade av just anropet, i `web/lib/organisation-store.ts:263`.
- Samtidighetsrisk: två laddningar kan båda se ett tomt resultat; den ena laddningens felstädning kan träffa den andras rader. Detta är kodhärlett, inte ett genomfört samtidighetsprov.
- Åtgärd: håll seedning i en uttrycklig, isolerad demoväg. Låt pilotens läsfunktioner vara rena läsningar och samla eventuell testseedning i en transaktion.

**Tysta fel i sekundära skrivningar — medel:**
- Problem: `logEvent` inväntar logginsättningen men kontrollerar inte Supabase-resultatets `error`. `saveGrades` kontrollerar skolformens uppdatering men inte uppdateringen av utbildningarnas årskurser.
- Filer: `web/lib/organisation-store.ts:318`, `web/lib/organisation-store.ts:352`.
- Effekt: lyckat resultat kan visas trots utebliven historik eller olika årskurser på skolenhet och utbildning.
- Åtgärd: behandla varje felresultat uttryckligen; använd transaktion när skrivningarna ska lyckas tillsammans.

**Appens källor saknar spårad Git-baslinje — medel:**
- Problem: appkod, migrationer och arbetsverktyg är ospårade i arbetskopian; planeringsdokumenten har en separat spårad baslinje.
- Filer: `web/app/page.tsx`, `web/lib/planning-store.ts`, `supabase/migrations/`, `work/supabase/`, `.planning/codebase/CONCERNS.md`.
- Effekt: Git-diff och återställning kan inte avgränsa appändringar mot en incheckad implementation.
- Åtgärd: skapa en genomgången källkodsbaslinje i separat versionshanteringsarbete, utan lokal konfiguration eller personuppgifter.

## Known Bugs

**Äldre timplanssparning kan vinna över sista inmatningen — hög, belagt i kod:**
- Symtom: sist inmatat värde behöver inte bli det värde som visas efter omläsning eller finns kvar i databasen.
- Filer: `web/app/timplan-view.tsx:227`, `web/app/organisation-workspace.tsx:393`, `web/lib/planning-store.ts:136`, `web/lib/planning-store.ts:161`.
- Utlösare: ändra samma öppna fält flera gånger innan första skrivningen är färdig, exempelvis från 20 till 200, medan svarstiderna varierar.
- Mekanism: varje `onChange` startar en egen asynkron sparning. `writeCells` använder `upsert` utan versionsvillkor. En tidigare skrivning som slutförs sist kan skriva tillbaka ett äldre värde.
- Klienteffekt: varje avslutad omläsning kör ovillkorligt `setTp`. Kö, generationskontroll och kontroll mot osparade ändringar saknas. `saving` skickas inte som redigeringsspärr till `TimplanView` i `web/app/organisation-workspace.tsx:719`.
- Omfattning: `runLasar` använder motsvarande parallella sparning och ovillkorliga omläsning per skolenhet i `web/app/organisation-workspace.tsx:361` och `web/lib/planning-store.ts:388`.
- Verifieringsgräns: mekanismen är bekräftad genom kodläsning; en ny körning med fördröjda svar ingår inte. `docs/granskning-2026-09-07.md:11` innehåller ett isolerat reproduktionsscenario.
- Tillfällig begränsning: invänta sparning före nästa ändring; detta garanterar inte korrekt resultat vid flera användare eller flikar.
- Åtgärd: serialisera eller slå ihop väntande ändringar per plan/läsår, jämför mot senast bekräftade tillstånd, ignorera äldre lässvar och använd databasens versionskontroll för samtidiga klienter. Enbart fördröjd inmatning garanterar inte ordningen.

**Redigering direkt efter skapande kan använda lokalt id — hög, kodhärlett felvillkor:**
- Symtom: en ändring före första omläsningen kan riktas till ett id som databasen inte känner till.
- Filer: `web/lib/planning-store.ts:126`, `web/lib/planning-store.ts:167`, `web/lib/planning-store.ts:398`, `web/app/organisation-workspace.tsx:402`.
- Utlösare: skapa en timplansversion eller ett läsår och ändra det medan första sparningen pågår.
- Mekanism: infogning använder databasgenererat id, medan optimistiskt klienttillstånd behåller modellens id fram till omläsning. Ett följande diffanrop kan behandla lokalt id som redan sparat.
- Effekt: felaktig referens, avvisad skrivning eller förlorad ändring; inget separat körprov av utfallen ingår.
- Åtgärd: låt samma kö hantera skapande och följdändringar; applicera id-mappningen innan nästa skrivning till objektet.

## Security Considerations

**Anonym demobesökare får huvudmannaprofil — hög inför skyddad drift:**
- Risk: gemensam demoåtkomst är oförenlig med verkliga elevuppgifter eller skyddad pilotdrift.
- Filer: `web/lib/supabase.ts:24`, `supabase/migrations/20260905130000_demo_bootstrap.sql:14`, `web/lib/organisation-store.ts:250`, `web/lib/planning-store.ts:94`, `web/lib/planning-store.ts:247`.
- Mekanism: `signInDemo` använder `signInAnonymously` när session saknas. Inloggad användare utan profil kan sedan få rollen `huvudman` hos gemensam demohuvudman genom en `security definer`-funktion.
- Precisering: en befintlig profils roll uppgraderas inte vid id-konflikt; endast namnet uppdateras. Risken gäller tilldelningen till nya demobesökare och att vägen anropas vid vanlig dataladdning.
- Befintlig begränsning: RPC är spärrat för databassrollerna `public` och `anon` men tillåtet för `authenticated`; anonym autentisering skapar en autentiserad session. UI visar demo och exempelroll i `web/app/page.tsx:209`.
- Åtgärd: separera demo från skyddad drift, inför identifierad användare och serverutfärdat mandat och återkalla eller avlägsna bootstrapfunktionens rättigheter med en migration. Att ta bort migrationsfilen avlägsnar inte en installerad funktion.

**Rektorsmandat avgränsas till huvudman, inte egna aktuella skolor — hög:**
- Risk: databasprofil med rollen `rektor` kan lägga till och ta bort lärarkopplingar vid andra skolor inom samma huvudman.
- Filer: `supabase/migrations/20260908170000_principal_teacher_assignments.sql:5`, `supabase/migrations/20260905120000_huvudman.sql:41`, `supabase/migrations/20260905120000_huvudman.sql:111`.
- Mekanism: policyerna kräver läraruppdrag och skola hos samma huvudman men kontrollerar inte att `auth.uid()` leder skolan. Rollen läses från en ensam profilroll via `current_app_role`.
- Schemaprecisering: `assignments.profile_id` finns som valfri FK. Uppdragsmodellen och inläsningen använder id, namn, roll och skol-id:n; profilkopplingen används inte av lärarpolicyerna för eget skolmandat. Giltighetsperiod saknas i uppdragstabellen. Se `web/lib/organisation-model.ts:152` och `web/lib/organisation-store.ts:300`.
- Huvudmannens väg: `assignment_units_write` tillåter fortfarande huvudmannen att ändra lärarkopplingar i `supabase/migrations/20260905120000_huvudman.sql:280`. UI-begränsningen tar inte bort denna rätt; demoundantaget är beskrivet i `docs/skolimport-och-rektor.md:24`.
- Närliggande scope: öppna poängplaner, timplaner, läsår och klasskopplingar använder också huvudmannatillhörighet/roll, utan eget rektorsuppdrag, i `supabase/migrations/20260905120000_huvudman.sql:294`, `supabase/migrations/20260905170000_timplan_lasar.sql:236` och `supabase/migrations/20260908120000_cohorts_classes.sql:59`.
- Befintligt skydd: rektor kan inte ändra rektorsuppdrag genom de tillagda lärarpolicyerna. Rektorsutnämning kontrollerar huvudmannaroll och skol-/uppdragstillhörighet i `supabase/migrations/20260908150000_school_import.sql:4`.
- Åtgärd: koppla autentiserad person till aktuellt uppdrag, kontrollera skolenheten i alla berörda datavägar och ersätt breda överlappande policyer. Prova nekad åtkomst med separata identiteter i isolerad databas.

**Relationsnycklar garanterar inte genomgående samma huvudman — hög:**
- Risk: en rad med godkänd egen `organizer_id` kan få en främmande föräldrareferens om klienten skickar ett känt id. FK garanterar existens, inte samma huvudman.
- Filer: `supabase/migrations/20260905120000_huvudman.sql:119`, `supabase/migrations/20260905120000_huvudman.sql:128`, `supabase/migrations/20260905120000_huvudman.sql:151`, `supabase/migrations/20260905120000_huvudman.sql:173`, `supabase/migrations/20260905170000_timplan_lasar.sql:31`, `supabase/migrations/20260905170000_timplan_lasar.sql:87`.
- Konkreta villkor: huvudmannens `assignment_units_write` kontrollerar uppdragets huvudman men inte skolans. Skrivpolicyerna för `offerings`, `permits`, `point_plans`, `timplans` och `school_years` kontrollerar radens huvudman utan motsvarande kontroll mot föräldern.
- Policybelägg: `supabase/migrations/20260905120000_huvudman.sql:280`, `supabase/migrations/20260905120000_huvudman.sql:285`, `supabase/migrations/20260905120000_huvudman.sql:289`, `supabase/migrations/20260905120000_huvudman.sql:295`, `supabase/migrations/20260905170000_timplan_lasar.sql:237`, `supabase/migrations/20260905170000_timplan_lasar.sql:261`.
- Effekt: relationsintegritet över kundgränser saknar genomgående databasgaranti. Detta bevisar inte utläsning av annan huvudmans uppgifter; inget angreppsprov mot drift ingår.
- Befintligt undantag: klass–timplan har en trigger som kräver fastställd plan, samma skolenhet och giltig kolumn i `supabase/migrations/20260908120000_cohorts_classes.sql:62`. Den relationen är alltså inte helt oskyddad.
- Åtgärd: använd sammansatta nycklar/FK-villkor eller explicita databasvalideringar och testa direkta skrivningar med fel föräldratillhörighet.

**Händelsehistoriken är inte en serverstyrd säkerhetslogg — hög:**
- Risk: klienten kan ange händelseroll, åtgärdstext och kommentar utan att motsvarande åtgärd utförts.
- Filer: `web/lib/organisation-store.ts:478`, `web/lib/planning-store.ts:153`, `web/lib/planning-store.ts:380`, `web/app/organisation-workspace.tsx:1490`.
- Mekanism: händelsepolicyerna kräver eget `actor = auth.uid()` och huvudmannatillhörighet, men binder inte `actor_role` till aktuell roll eller `action` till en ändring. Se `supabase/migrations/20260905120000_huvudman.sql:307`, `supabase/migrations/20260905120000_huvudman.sql:311`, `supabase/migrations/20260905170000_timplan_lasar.sql:256` och `supabase/migrations/20260905170000_timplan_lasar.sql:292`.
- Effekt: historiken kan inte ensam bevisa mandat vid beslut. Fristående klientloggning kan också utebli efter lyckad verksamhetsskrivning.
- Befintligt skydd: aktörens id binds till autentiserad användare. Skolimport, rektorsutnämning och kullkopiering skapar sina händelser inne i databasfunktioner.
- Åtgärd: skapa revisionshändelsen med ändringen på servern, härled aktör/mandat där och skilj användarkommentarer från auktoritativa verksamhetshändelser.

## Performance Bottlenecks

**Full omläsning efter små ändringar — medel, ingen lastmätning:**
- Problem: organisationsändring läser om hela huvudmannens grund och triggar ny timplansladdning eftersom effekten beror på hela `org`. Timplanscellens ändring leder till omläsning av alla synliga planer, celler och händelser.
- Filer: `web/app/organisation-workspace.tsx:244`, `web/app/organisation-workspace.tsx:337`, `web/app/organisation-workspace.tsx:415`, `web/lib/organisation-store.ts:277`, `web/lib/planning-store.ts:92`.
- Orsak: relationer hämtas som listor och filtreras på klienten; `toTimplan` går igenom celler/händelser för varje plan i `web/lib/planning-store.ts:62`.
- Effekt: fler API-anrop och större svar när skolor, planer och historik växer. Exakt tidsåtgång är inte uppmätt.
- Förbättring: begränsa frågor till berörd skola/plan, gruppera relationer efter id en gång och paginera historik. Samordna med skyddet mot konkurrerande sparningar.

**Registeruppslag saknar applikationsstyrd tidsgräns — medel:**
- Problem: proxyn använder `fetch` utan egen abortsignal, explicit tidsgräns eller återförsöksstrategi. Skoluppslag kan invänta ett andra anrop för huvudmannauppgifter.
- Filer: `web/app/api/skolenhet/route.ts:96`, `web/app/api/skolenhet/route.ts:104`, `web/app/api/skolenhet/route.ts:124`.
- Effekt: väntetid vid långsamt svar styrs av underliggande driftmiljö; dess gränser är inte verifierade här.
- Befintligt skydd: klientens `lookupGeneration` hindrar inaktuellt uppslag från att ersätta ett senare val i `web/app/organisation-workspace.tsx:424`.
- Förbättring: inför uttrycklig tidsgräns och testbart felkontrakt; mät uppslagstider innan cache eller återförsök dimensioneras.

## Fragile Areas

**Stora vyer kombinerar formulär, domänändringar och asynkron lagring:**
- Filer: `web/app/admin-workspace.tsx` (1 986 rader), `web/app/organisation-workspace.tsx` (1 558 rader), `web/app/lasar-view.tsx` (1 173 rader), `web/app/workspace-views.tsx` (967 rader).
- Varför skört: organisationsvyn äger laddning, optimistiskt tillstånd, rollstyrning, import, beslut och presentation. Gemensamma statevariabler påverkar flera vyer och effekter.
- Säker ändring: bryt ut ett sammanhängande beteende i taget; behåll modellerna i `web/lib/organisation-model.ts`, `web/lib/timplan-model.ts` och `web/lib/lasar-model.ts` som gemensamma verksamhetsregler.
- Skydd att bevara: aktiv skola behålls vid omläsning i `web/app/organisation-workspace.tsx:339`; klasskopplingens skol-/kolumnvillkor finns i `supabase/migrations/20260908120000_cohorts_classes.sql:62`. Gymnasiets kurs-/nivåinnehåll och fristående kullkopior prövas i `web/lib/cohort-model.test.mjs:12`.
- Testlucka: modelltester i `web/lib/timplan-model.test.mjs` och `web/lib/lasar-model.test.mjs` fångar inte automatiskt React-effekternas svarordning eller datalagrets delvis lyckade anrop.

**Klassidentitet bygger på sessionsdata och namn:**
- Filer: `web/lib/admin-model.ts:295`, `web/app/page.tsx:383`, `web/app/organisation-workspace.tsx:720`, `supabase/migrations/20260908120000_cohorts_classes.sql:47`.
- Varför skört: `deriveClasses` grupperar på klassnamn och returnerar ingen skolenhetsidentitet, trots att `Pupil` har `unitId`. Namnet används för att härleda årskurs och kull; databasens uttryckliga koppling använder skolenhet, klassnamn och läsår.
- Utlösare vid utökning: samma klassnamn på flera skolor eller namn som inte följer exempelmönstret. Klientens klassreferens räcker då inte för att särskilja dem.
- Status: integrationsrisk i modellkontraktet; ingen felaktig verklig elevkoppling är påvisad.
- Säker ändring: inför beständiga klass-id:n, skolenhet och giltighetsperiod; bevara uttrycklig klass–timplanskoppling och dess databasvalideringar.
- Testlucka: `web/lib/cohort-model.test.mjs:98` prövar uttrycklig koppling per läsår, men inte ett komplett beständigt register med identiska klassnamn på olika skolor.

## Scaling Limits

**Listladdning utan uttrycklig paginering:**
- Nuvarande kapacitet: ingen lastmätt produktionskapacitet är fastställd för `web/lib/organisation-store.ts:261` eller `web/lib/planning-store.ts:95`.
- Gräns: anrop använder `select('*')` utan sidindelning. Ansluten Supabases servergräns är inte kontrollerad; stora datamängder kan ge ofullständiga modeller om svaret begränsas.
- Filer: `web/lib/organisation-store.ts:277`, `web/lib/planning-store.ts:102`, `web/lib/planning-store.ts:257`.
- Skalningsväg: avgränsa frågor, paginera explicit och upptäck ofullständiga resultat. Organisationsloggen har ett uttryckligt urval på 50 händelser i `web/lib/organisation-store.ts:285`; behandla det inte som full revisionshistorik.

**Elevadministrationen har demodata, ingen verifierad registerkapacitet:**
- Nuvarande omfattning: 20 syntetiska elever skapas ur lokal namnlista. Detta är fixturestorlek, inte kapacitetsgräns.
- Filer: `web/lib/admin-model.ts:109`, `web/lib/admin-model.ts:317`, `web/app/page.tsx:244`.
- Gräns: beständig lagring, serverbaserad sökning, synk och fleranvändarhantering för `AdminState` saknas i dessa vägar.
- Skalningsväg: definiera identiteter och läs-/skrivkontrakt före import eller lastprov med stora elevregister.

## Dependencies at Risk

**Vinext och byggkedjans versionskoppling:**
- Risk: manifestet anger betaberoendet `vinext: ^1.0.0-beta.9` tillsammans med Vite, React Server Components och Cloudflare-pluginer.
- Filer: `web/package.json:36`, `web/package.json:39`, `web/package.json:47`, `web/vite.config.ts:45`, `web/package-lock.json`.
- Effekt: kompatibilitetsändringar vid uppgradering kan påverka serverrendering och paketering även om modelltester passerar.
- Hantering: använd låsfilen och avgränsade uppgraderingar med typkontroll, bygge och relevant körprov. Ingen alternativ plattform eller migration är beslutad här.
- Sårbarhetsstatus: ingen nätbaserad säkerhetskontroll eller ny paketrevision ingår. `docs/dependency-audit.json` är en rapportfil och används inte som bevis för aktuell sårbarhetsfrihet.

## Missing Critical Features

**Beständigt elevregister och kommunal registeranslutning — hög inför verkliga elevflöden:**
- Problem: elever, studieplaner, undervisningsgrupper, schema och administrationens historik lever i lokalt initierat `AdminState`. Omladdning skapar exempeldata igen.
- Filer: `web/app/page.tsx:244`, `web/lib/admin-model.ts:92`, `web/lib/admin-model.ts:317`, `supabase/migrations/20260905120000_huvudman.sql:12`.
- Blockerar: beständiga elevändringar, gemensamt arbete över sessioner, verklig elevsynk och databasvaliderade elev-/grupprelationer.
- Integrationsgräns: `web/app/api/skolenhet/route.ts:79` hämtar skol-/huvudmannauppgifter. `web/lib/organisation-model.ts:379` anger att elevregister inte är kopplat. Uppslag är inte kommunal elevregisteranslutning eller verifiering av företrädarmandat.
- Fortsatt underlag: definiera källansvar, behörighet, beständiga id:n, datakontrakt, synkfel och skyddad testmiljö. Ett syntetiskt integrationstest innebär inte godkänd verklig anslutning.

**Beständig lagring av bifogade tillståndsbeslut:**
- Problem: formuläret tar emot filval men sparar bara namn, storlek och typ; detta är uttryckligt märkt som exempelbegränsning.
- Filer: `web/app/organisation-workspace.tsx:1128`, `web/lib/organisation-store.ts:417`.
- Blockerar: att öppna eller återskapa själva beslutsfilen efter sparning.
- Befintlig grund: privat bucket och huvudmannapolicyer finns i `supabase/migrations/20260905120000_huvudman.sql:315`; klientvägen laddar inte upp filinnehåll.
- Åtgärd: om bilagor ingår i godkänd omfattning, implementera uppladdning, filreferens och läsning samt hantering av delvis lyckad fil-/databassparning.

## Test Coverage Gaps

**Samtidig autosparning och redigering efter skapande — hög:**
- Saknas: körbart prov med varierad ordning på skriv-/lässvar som kontrollerar både klienttillstånd och sparat värde.
- Filer: `web/app/organisation-workspace.tsx:361`, `web/app/organisation-workspace.tsx:393`, `web/lib/planning-store.ts:161`, `web/lib/planning-store.ts:388`.
- Risk: modelltesterna i `web/lib/timplan-model.test.mjs` och `web/lib/lasar-model.test.mjs` kan passera medan lagringskopplingen tappar ändringar.
- Provupplägg: isolerad datalagerstub med styrbar ordning; samma rad, olika rader, nytt objekt, misslyckad skrivning och inaktuellt omläsningssvar.

**RLS med olika identiteter och egna skolmandat — hög:**
- Saknas: automatiserad behörighetsmatris med separata huvudmän, två rektorer hos samma huvudman, uppdrag utan profilkoppling och avslutat mandat.
- Filer: `supabase/migrations/20260908170000_principal_teacher_assignments.sql`, `work/supabase/verify-school-import.mjs:5`, `work/supabase/verify-cohorts.mjs:6`, `web/lib/registry-address.test.mjs:61`.
- Befintlig täckning: modelltester prövar rollsträngar/skolval; arbetsverktygen använder `signInDemo`. Dessa syntetiska databasflöden provar inte verkligt separerade identiteter.
- Risk: UI-rollbyten i `web/app/page.tsx:221` kan se ut som testad behörighet medan demoprofilen behåller samma databasroll.
- Provupplägg: positiva och negativa direkta API-/SQL-fall i isolerad databas; kontrollera föräldrarelationer och skolmandat, inte bara radens huvudman.

**Beslut, återställning och säkerhetshistorik — hög:**
- Saknas: avbrott i varje delskrivning där gällande version, innehåll och auktoritativ historik antingen alla ändras eller alla bevaras.
- Filer: `web/lib/organisation-store.ts:489`, `web/lib/organisation-store.ts:318`, `web/lib/planning-store.ts:153`, `supabase/migrations/20260905120000_huvudman.sql:307`.
- Risk: delvis sparat beslut, utebliven logg eller falsk roll-/åtgärdsuppgift upptäcks inte av modelltesterna.
- Provupplägg: felinjektion mellan skrivningar och negativa försök att ange annan roll eller skapa beslutshändelse utan beslut.

**API-kontrakt och sammansatta webbläsarflöden — medel:**
- Saknas: körbar testuppsättning för proxyns timeout/fel, importens databas-id:n och användarflöden på dator/telefon.
- Filer: `web/app/api/skolenhet/route.ts`, `web/app/organisation-workspace.tsx`, `web/app/timplan-view.tsx`, `web/package.json`.
- Befintlig täckning: `web/lib/registry-address.test.mjs` testar dataomvandling och modellimport/uppdrag; `docs/elevkullar-och-klasskopplingar.md:37` beskriver UI-kontroller. Rapporttext är inte en körbar regressionssvit.
- Risk: skolval, synliga förslag, laddning och tabellrullning kan påverkas när vyerna ändras. Ingen av dessa UI-funktioner klassas här som pågående fel utan nytt belägg.
- Provupplägg: bevara skolval genom sparning/import, pröva kurs-/nivåtillägg och kullkopiering, redigera timplan och kontrollera klasskoppling med samtliga kolumner åtkomliga på mobil.

**Elevregister med flera skolenheter — hög när beständig elevlagring införs:**
- Saknas: fullständigt prov av identiska klassnamn på olika skolor, ändrad tillhörighet och giltighetsperiod tillsammans med uttrycklig timplanskoppling.
- Filer: `web/lib/admin-model.ts:295`, `web/lib/cohort-model.test.mjs:98`, `web/app/page.tsx:383`.
- Risk: namnbaserade sessionsobjekt behandlas som beständiga skolenhetsbundna identiteter.
- Provupplägg: syntetiska kontraktsfall med stabila id:n och separata skolor; faktisk kommunanslutning verifieras separat när sådant uppdrag är godkänt.

---

*Concerns audit: 2026-09-11*
