# Samlat användarprov: programplaner och timplanshandledning

## Användarfynd 2026-10-05: analysens åtgärdslänkar

**FAIL i användarprov:** användaren rapporterar att ”Flytta nivån” och sannolikt alla åtgärdslänkar leder till en vy där riskerna inte går att åtgärda. De två bilderna visar ett nivåordningsfel och därefter en tabell med 0 fördelade poäng utan redigerbara terminsfält.

Orsak verifierad i koden: alla analysrader anropade samma `nextAction()`, som öppnade fördjupningsformuläret (`replace`) även när den sparade terminstabellen redan var aktiv. Formuläret använde tom lokal terminsfördelning och låsta terminsfält. Klicket i sig raderade ingen sparad fördelning.

Rättningen ger varje åtgärd ett eget mål i den aktuella tabellen eller datumformuläret. Skrivskyddade planer visar orsaken, och en inriktning som inte kan ändras här får ingen missvisande länk. Automatiska dator-/telefonprov och nytt mänskligt prov särredovisas i `.planning/debug/programplan-analysis-actions.md`. Mänskligt resultat efter rättning är **awaiting_user**. 05-22/23 och full fas 5 är fortfarande öppna.

## Nytt prov 2026-10-05: livscykel och tabell med framtida kull

Resultat: **awaiting_user**. 05-20 låser planer vars kull har startat, så 2026-exemplen nedan kan nu bara läsas och arkiveras. Använd i stället de fyra nya utbildningarna "Användarprov framtida kull – …" (start 2027-08-17) på Syntetisk skola 11, vanlig 3012. Stegen står i 05-20-SUMMARY under Mänskligt prov. Där ingår 05-19:s tabellprov på "bundet utkast" och livscykelns Ändra uppgifter, Arkivera, Ta fram och Ta bort.

## Nytt prov 2026-10-03: poäng per årskurs och termin

05-18 lägger till **Årskurser och terminer** i en öppnad, underlagsbunden programplan. Mänskligt resultat: **awaiting_user**. Automatiska prov och bildgranskning redovisas separat i 05-18-SUMMARY och 05-18-REVIEW. Tidigare underkänd begriplighet ersätts inte av automatiska PASS.

På vanlig skyddad app `http://127.0.0.1:3012/`, med syntetiska uppgifter:

1. Som rektor eller huvudman: välj **Programplaner**, öppna en utbildning med ett bundet utkast och hitta **Årskurser och terminer**.
2. Välj **Fördela poäng**. På en namngiven nivå om 100 poäng: skriv 50 i åk 1 höst och 50 i åk 1 vår. Kontrollera att raden visar 100/100 och årskurskortet visar 100 poäng.
3. Fördela några fler poäng på en annan årskurs. Kontrollera återstående poäng; en delvis fördelad plan får sparas. Ett försök med 101 på en 100-poängsnivå ska ge radfel och hindra sparning.
4. Välj **Spara fördelning**, ladda om och öppna samma version. Poängen ska finnas kvar. På telefon väljer du en årskurs i taget; höst och vår visas bredvid ämnet.
5. Läs en fastställd äldre version om sådan finns: fördelningen ska kunna visas men inte ändras. En ny versionskopia bevarar fördelningen. Kopiering till en helt ny utbildning bevarar däremot ännu inte terminsfördelningen.

Bedöm om översikten, terminerna, återstående poäng och sparningen är begripliga på dator och telefon. Inget ämnesval görs automatiskt för alternativa eller opreciserade underlagsrader. Poäng är inte undervisningstimmar. Admin-delegation och skapande av timplan från godkänd/fastställd programplan kvarstår i separata todos.

Status 2026-10-02: **05-15/05-16 automatiskt verifierade — nytt mänskligt begriplighetsprov väntar**. Tidigare 05-14 är mänskligt underkänt. Följ aktuella uppgifter nedan; äldre provomgångar längre ner är historik.

## Fysisk telefon på samma wifi

Använd den aktuella privata åtkomstlänken eller QR-koden från chatten. Den gäller i två timmar medan datorn, appen, test-IdP:n och kodhjälpen kör. Logga in med roll- och provkodsknapparna, öppna navigationen uppe till vänster och välj Programplaner. Wifi-adressen och nyckeln sparas inte här; en omstart kräver ny länk. Automatiska LAN-/WebKit-prov är PASS men faktisk telefon och din begriplighetsbedömning är ännu oprövade.

## Aktuellt prov: samma programflöde

Öppna Programplaner på vanlig skyddad app `http://127.0.0.1:3012/`. Lokal inloggning har rollknappar och **Fyll i provkod**. Prov gäller endast syntetiska uppgifter.

1. Som rektor: kontrollera Syntetisk skola 11 och **Befintlig utbildning**. Välj först program, sedan inriktning och därefter rätt utbildning/elevkull. Läs **Programgrund och inriktning** och dina sparade fördjupningsval.
2. Välj **Ändra fördjupning** (eller skapa/gör redo enligt den faktiskt visade statusen). Sök ämne/nivå, kryssa i ett val och kontrollera vald lista. Välj **Granska utkast**, gå tillbaka och kontrollera att valen finns kvar; granska igen och spara. Läs om och kontrollera resultatet.
3. Prova ett annat program: EK → Ekonomi, NA → Naturvetenskap, TE → Informations- och medieteknik, ES → Bild och formgivning. VO har ingen inriktning. De fem extra utbildningarna och fyra tidigare SA-exemplen är bevarade; följ deras aktuella status. SA-exemplen använder Samhällsvetenskap, inte testharnessens Beteendevetenskap.
4. Som huvudman: välj **Ny utbildning** i samma UI, sedan program/inriktning. Ange ett eget tydligt provnamn, elevkull och verkligt startdatum enligt syntetiskt underlag (2026-08-17). Välj fördjupning, granska och välj **Spara utbildning och utkast**. Kontrollera att exakt den sparade utbildningen öppnas och återfinns efter omladdning. Som rektor ska den kunna läsas/ändras inom samma skola, medan Ny utbildning inte erbjuds.

Bedöm: Är ordningen självklar? Förstår du vad program/inriktning redan bestämmer och vad du själv kryssar i? Hänger nytt och befintligt ihop utan instruktioner från utvecklaren? Pröva även smal skärm. Rapportera konkret var du blir osäker; resultatet är ännu **awaiting_user**.

Gemensamma fördjupningspaket över flera programplaner är en pending todo. Ett sparat utkast är inte fastställt; full nationell regelkontroll och de andra utbildnings-/beslutsflödena kvarstår.

05-15/05-16 genomförda automatiskt på skyddat bygge `023e68b`. Samma program → inriktning → programfördjupning används för befintligt rektorsarbete och huvudmannens nya gymnasieutbildning/utkast. Fulla programbrowser 38/38 och timplan 20/20, cleanup 58/58, ny API 43/43 och 128 riktade Node-prov PASS. Typ/lint/skyddat bygge och handbok PASS; tio dator-/telefonbilder granskade. Vanlig 3012 kör direkt workerd; nio bevarade exempel för R/HM lästa med 40 auditpar och fyra verkliga lokala OIDC/MFA-inloggningar PASS. Ny mänsklig begriplighetsbedömning väntar. ADMIN-02/full fas 5, nationella beslut, paket, kullkopiering och klasskoppling är öppna.

## Äldre provomgångar — historik


Status 2026-10-02: **UI-rättning automatiskt kontrollerad — nytt mänskligt begriplighetsprov väntar**. Gäller lokal skyddad provmiljö och syntetiska uppgifter. Senaste följdändring är 05-14: separat granskning före sparning och fem extra gymnasieprogram. Proven redovisas i 05-14-SUMMARY. Det tidigare mänskliga programplansresultatet är FAIL. Detta godkänner inte fullständiga nationella beslutsregler, verklig kommunanslutning eller pilotdrift.

## Börja här

Ladda om http://127.0.0.1:3012/ för att få det aktuella bygget. Välj rektorns rollprovknapp på inloggningssidan, **Fyll i provkod** och **Logga in**. Välj uppdraget för **Syntetisk skola 11**. Huvudmannens rollprov kan också arbeta med programplansutkasten. Inga inloggningsuppgifter eller engångskoder lagras i denna fil.

Välj **Programplaner**. De fyra tidigare provutbildningarna finns kvar:

| Utbildning | Vad du prövar |
| --- | --- |
| Användarprov – programplan, skapa | Skapa första utkastet med uttryckligt katalog- och startdatumval. |
| Användarprov – programplan, äldre utkast | Läs äldre val och bind dem till känt underlag utan bortfall. |
| Användarprov – programplan, bundet utkast | Ändra programfördjupning och kontrollera beständig sparning. |
| Användarprov – programplan, ny version | Läs låst version och skapa en kopia som nytt utkast. |

De fyra tidigare exemplen använder **SA25**, programversion **4**, inriktning **SASAP** och känd syntetisk utbildningsstart **2026-08-17**. Välj katalogen hämtad **2026-09-05**. Startdatum ska anges aktivt i formuläret; kulltext och startår är inte datumbevis. Ett tidigare sparat exempel lämnas kvar vid omkörning av förberedelsen.

## Prova fler program

På **Syntetisk skola 11** finns nu också följande utbildningar. De är tillagda utan planer, så att du själv kan prova att lägga in en programplan. Om du redan har sparat något används den planen vid nästa besök.

| Utbildning | Inriktning | Exakt grund |
| --- | --- | --- |
| Ekonomiprogrammet | Ekonomi | EK25/EKEKI, programversion 4 |
| Naturvetenskapsprogrammet | Naturvetenskap | NA25/NANAP, programversion 4 |
| Teknikprogrammet | Informations- och medieteknik | TE25/TEINM, programversion 2 |
| Estetiska programmet | Bild och formgivning | ES25/ESBIF, programversion 3 |
| Vård- och omsorgsprogrammet | Ingen inriktning | VO25, programversion 4 |

1. Öppna en av utbildningarna. Välj **Skapa programplan**, underlaget hämtat **2026-09-05** och **Fortsätt till startdatum och val**.
2. Ange **2026-08-17**, det kända syntetiska startdatumet för dessa exempel. Sök ett ämne, välj en nivå och tryck **Lägg till nivå**. Kontrollera att den ligger i den valda listan.
3. Välj **Granska utkast**. Kontrollera utbildning, skola, datum och nivåer. Granskningen sparar ingenting. Pröva **Tillbaka till uppgifterna**; valen ska finnas kvar.
4. Granska igen och välj **Spara utkast**. Ladda om och öppna utbildningen igen: samma val ska bestå. Pröva både dator och telefon.

Detta är fler befintliga syntetiska utbildningar med programunderlag i den versionsbundna katalogen. Generellt skapande av nya utbildningar, uppladdning av egna externa underlag och fastställande ingår inte i denna rättning.

## Prova programplanerna

Börja med att öppna en utbildning och säg vad som ingår och vad du kan ändra. Planen ska visas direkt. Beskriv om **Ingår enligt underlaget**, **Dina sparade fördjupningsval** och **Nästa steg** hjälper dig att förstå utbildningen. Tekniska källor och äldre versioner kan sedan öppnas under **Underlag och tidigare versioner**.

Använd de kvarvarande exemplen; en tidigare sparad eller ändrad plan ska ligga kvar. Följ den åtgärd som faktiskt visas. Skapa inte om en plan för att försöka återställa en tidigare provbild.

1. Öppna **skapa**. Om utbildningen fortfarande saknar plan: välj **Skapa programplan**, välj aktivt underlaget hämtat 2026-09-05 och **Fortsätt till startdatum och val**. Ange 2026-08-17, välj en fördjupningsnivå och **Granska utkast**, kontrollera sammanfattningen och välj **Spara utkast**. Om ett utkast redan finns, läs dess sparade val och gå vidare via **Ändra fördjupning**. Ladda om: samma utkast och val ska ligga kvar. Det ska framgå att sparningen inte fastställer planen.
2. Öppna **äldre utkast**. Om det fortfarande är obundet ska äldre råval, exempelvis **ANIM1000X**, visas utan gissade namn. Välj **Gör utkastet redo för ändring**, aktivt underlag, **Fortsätt till startdatum och val**, startdatum 2026-08-17 och bekräftelsen att hela den äldre valmängden bevaras i samma ordning. Granska och spara. Därefter ska nivånamn och poäng kunna läsas. Om planen redan är bunden, granska de bevarade valen och det bundna underlaget i stället för att binda igen.
3. Öppna **bundet utkast**. Välj **Ändra fördjupning**, lägg till en nivå och pröva flytta/ta bort. Granska och spara, och ladda om. Namn, poäng och ordning ska bestå; katalog och startdatum är bundna. Ändra något igen och välj **Avbryt**: bekräftelsen ska låta dig behålla eller lämna dina osparade ändringar. Pröva samma väg på telefon.
4. Öppna **ny version**. Om den låsta källan fortfarande är aktuell och inget utkast finns: välj **Skapa ny version**, aktivt underlag, **Fortsätt till startdatum och val**, startdatum 2026-08-17 och bekräftelsen för äldre val. Granska och spara. Den nya versionen ska vara utkast. Om ett utkast redan skapats visas det direkt; läs det och öppna sedan den äldre låsta versionen i **Underlag och tidigare versioner**. Den låsta källans status och beslutsdatum ska bestå.
5. Bedöm om du förstår nästa handling utan att börja med de tekniska källuppgifterna. Skiljer vyn tydligt sparade val från alternativ eller saknade nivåuppgifter i referensunderlaget? Prova också på telefon: nås alla val och knappar, fungerar dialogens rullning och syns resultat/fel där du förväntar dig?

Den låsta provkällan har lagts in privilegierat som syntetisk provsetup; fastställande är ännu inte en levererad användaråtgärd. Katalogreferenser kan lösas utan att hela utbildningens nationella ram, alternativ, nivåföljd eller undervisningstid är kontrollerad. Ingen generell poängram eller omräkning till schematimmar ska visas som godkänd regelkontroll.

## Bedöm timplanshandledningen

Öppna **Timplaner**, först grundskoleprovet och sedan introduktionsprogrammet. Läs **Innan du ändrar undervisningstiden** och öppna regelinformationen. Bedöm om rektorns och huvudmannens ansvar är tydligt, om timmarna och undervisningstiden förklaras, och om texten hjälper dig före en ändring. Kontrollera samma vägledning i ändringsdialogen. Tidigare timplansfunktionsprov är rapporterade som fungerande; här återstår mänsklig bedömning av den nya texten.

## Rapportera resultat

Skriv vilka moment du provade och om du använde dator, telefon eller båda. Beskriv eventuella otydliga texter, fel eller saknade val. Mänskligt resultat för programplansflödet och timplanshandledningen registreras först efter din återkoppling. Fas 4:s separata checkpoint och hela fas 5:s återstående krav hålls fortsatt öppna.

## Teknisk förberedelse

Ägarskyddad, additiv förberedelse: `work/pilot/prepare-programplan-user-trial.mjs`, reserverat prefix 55100110. Exakta syntetiska kund-/skolnamn och organizerrelation måste finnas. Scriptet ändrar inte mandat eller befintliga planer och bevarar användarens tidigare ändringar. Tillfälliga egna SQL-sessioner provar befintliga rektors-/huvudmannamandat och obligatorisk DB-loggning; detta är inte interaktiv IdP eller Worker/browserbevis. Första förberedelse och omkörning PASS: alla sju tidigare provrader samt en uttryckligt ändrad egen kulltext bevarades. Den egna textändringen återställdes efter detta avgränsade bevarandeprov. Se phase5-11-user-trial-preparation.json.

Historisk kontroll före 05-14: vanlig skyddad app på 3012 körde **e077e81** utan diagnostisk preload. Startsida, faktisk Worker/DB-hälsa och lokal IdP-discovery 200. Verify-programplan-user-trial.mjs med **mode current** har läst de fyra befintliga exemplens verkliga nuvarande status/val för både rektor och huvudman: 16 auditerade läsningar med rätt DB-/Worker-par. Före-/efterbild av verksamhetsraderna identisk. Endast provets egna lässessioner städas; säkerhetsloggar bevaras. Ingen initialbild återställs. Vid denna kontroll saknar skapa-exemplet fortfarande plan, äldre utkast är obundet, bundet utkast är bundet och ny-version-exemplet har låst version utan nytt utkast. Följ alltid den faktiskt visade statusen vid ditt prov. Se phase5-13-pedagogy-user-trial.json och phase5-13-pedagogy-verification.json. Detta är lokalt mintade lässessionsbevis, inte interaktiv IdP eller mänsklig bedömning.

Föregående 0f18e9b-omgång: programbrowser **30/30** och timplansregression **20/20** PASS på samma bygge, på dator och iPhone/WebKit, utan retries/skips. Alla50 egna grafer städade, audit/ankare bevarade. Två ytterligare read-only guidebilder visar det valda källdatumet på båda profilerna; egna fixturer städade. Den omgångens riktade 25+4 Node-prov, typ/lint/skyddat bygge och handbok är historiska PASS. Senaste pedagogikbyggets kontroller redovisas nedan. Första f6f05a7-program 30PASS/tim18PASS+2FAIL är arkiverade separat; två UI-assertions synkroniseras nu mot avslutad verklig exakt planläsning. Äldre två avbrutna previewomgångar förblir FAIL med öppen orsaksdiagnos i .planning/debug/phase5-preview-exit.md.

**Fyll i provkod** är separat verifierad med fyra verkliga OIDC/MFA-inloggningar: dator rektor/huvudman och telefon rektor/IT. Den fyller den lokala test-IdP:ns aktuella kod; vanlig Logga in och faktisk serverkontroll består. Detta kördes på tidigare Worker vars serverauth är oförändrad. Ingen fast 1111-kod eller sänkt programplansbehörighet har införts. Se work/pilot/LOCAL-LOGIN-HELPERS.md och local-login-helpers.json.

## Användarresultat 2026-10-02

Användaren rapporterar: ”programplanerdelen är ju fullständigt obegripligt UI. fattar noll.” Detta registreras som ett misslyckat begriplighetsprov, inte som godkänd programplansvy. Enheter och enskilda sparsteg särredovisades inte. 05-13 har genomfört en ämnes-/nivå-/poängvy med tydliga verksamhetsåtgärder och guidad skapa/binda/klona; tekniska referenser flyttas under Underlag. Färska automatiska UI-prov har passerat; ett nytt mänskligt prov krävs efter rättning. Befintlig backend, versioner och användarändringar ska bevaras.

## Fördjupad pedagogik efter användarens förtydligande

Användaren kräver att vyn är ”extremt pedagigisk”. Läs Så börjar du och Så läser du planen. Beskriv om du förstår skillnaden mellan programunderlag, sparad fördjupning och utkast. Följ dialogens numrerade start–val–spara-delar. Bedöm särskilt om det framgår att nivåväljaren behöver följas av Lägg till nivå och att de egna valen blir sparade först med Spara utkast. Är startdatumets betydelse och nästa handling efter sparning tydliga? Nytt mänskligt godkännande väntar.

Färska 30+20 browser på e077e81, typ/lint/bygge/handbok och sex stabila instruktionsbilder PASS. Current-läsning bevarar samtliga fyra exempel för rektor/HM,16 auditpar. Se phase5-13-pedagogy-verification.json och *-user-trial.json. Första avbrutna omgången hålls som FAIL och previeworsaken förblir öppen; de gröna slutproven är inget bevis för en orsaksfix.

## Senaste provmiljö efter 05-14

05-14 ger ett separat granskningssteg, sökning och fem ytterligare program (EK/NA/TE/ES/VO). Färska 32+20 browser och 27 riktade Node-prov, typ/lint/skyddat bygge samt handbok PASS på 43c91fa. Nio exempel är bevarade och lästa för rektor/HM genom 26 auditpar på vanlig 3012. Ny mänsklig begriplighetsbedömning väntar; nationella beslutsregler och fas 4:s checkpoint är öppna. Vanlig 3012 kör byggrevision 43c91fa1bb3fd08ac44e39cc4decbc22fb3513dc utan debugnivå/preload. Nya utbildningar är redo för användarens eget första utkast; inget initialt syntetiskt provutkast har skrivits åt användaren. Färska browserprov skapade i stället egna tillfälliga utbildningar som är städade. Följ två dialogsteg: Förbered uppgifterna och Granska och spara. Hämtdatum 2026-09-05 och känd syntetisk start 2026-08-17. Tidigare provomgångar ovan är historik.

## Senaste följdprov: visuell översikt

Användaren kräver 2026-10-02 en tydlig visualisering av programplanens delar och vad som är valbart. Öppna en utbildning och läs **Programplanens delar — vad kan du välja?**. Beskriv skillnaden mellan programgrundens tre ämnesblock, skolans programfördjupningsutbud, elevens individuella val och gymnasiearbete. Är det tydligt vilken del du kan ändra här?

Tryck **Visa ämnena i underlaget** och **Visa nästa steg för fördjupningen**. Du ska nå rätt läsblock respektive den aktuella åtgärden utan att något sparas. Prova ett nytt program, särskilt Vård- och omsorgsprogrammet som saknar inriktning. Se att nivåantalet i översikten visar det faktiskt sparade utkastet, även efter omladdning.

Bedöm samma bild på telefon. Val i programgrunden, såsom svenska/svenska som andraspråk, ska inte uppfattas som automatiskt gjorda fördjupningsval. Gemensamma paket, elevens individuella val och gymnasiearbete är inte nybyggda valfunktioner. Pakettillgänglighet över flera programplaner är en separat pending GSD-todo.

## Aktuell visualiseringsversion — 2026-10-02

05-14 utökad enligt användaren med visuell karta över sex programdelar och vad som går att välja här. Skolgemensamma programfördjupningspaket över flera programplaner är en pending todo. Färska 32+20 browser, 27 Node-prov, typ/lint/skyddat bygge och handbok PASS på b4c26f3. Nio bevarade exempel lästa för rektor/HM genom 26 auditpar på vanlig 3012. Ny mänsklig begriplighetsbedömning väntar. Byggrevision b4c26f3107210ed5fd904d740d8f6a031640c4b4. Se 05-14-VISUALIZATION-SUMMARY/REVIEW och phase5-14-visualization-verification.json; äldre 43c91fa-granskningsbevis ovan är historik.

## Mänskligt resultat efter 05-14 — 2026-10-02

**FAIL: begriplighet och sammanhang.** Användaren säger att delen fungerade i förra UI:t men nu är rörig och osammanhängande. Önskat arbetsflöde: välj program, därefter inriktning och sedan programfördjupning. Samma UI ska användas både för nya utbildningar/elevkullar och för befintliga. 05-14:s automatiska 52 browserprov visar tekniska skydd och rendering, men uppfyller inte detta mänskliga krav. Ingen godkännandestatus ändras till PASS.

Historisk jämförelse finns i 05-PROGRAMFLOW-HISTORICAL-REVIEW.md. Kommande 05-15/05-16 ska koppla faktiskt skyddat skapande till samma ämnes-/fördjupningskomponent som befintlig plan, bevara huvudmannens rätt att definiera utbildningar och låsta grunduppgifter för befintliga. Paket och elevval kvarstår separat. Nytt mänskligt prov följer först efter genomförande och färska tekniska prov.
