# Samlat användarprov: programplaner och timplanshandledning

Status 2026-10-02: **användaren har rapporterat en allvarlig begriplighetsbrist — UI-rättning pågår**. Gäller lokal skyddad provmiljö och syntetiska uppgifter. De automatiska proven redovisas separat i 05-11/05-12-SUMMARY. Detta godkänner inte fullständiga nationella beslutsregler, verklig kommunanslutning eller pilotdrift.

## Börja här

Ladda om http://127.0.0.1:3012/ för att få det aktuella bygget. Välj rektorns rollprovknapp på inloggningssidan, **Fyll i provkod** och **Logga in**. Välj uppdraget för **Syntetisk skola 11**. Huvudmannens rollprov kan också arbeta med programplansutkasten. Inga inloggningsuppgifter eller engångskoder lagras i denna fil.

Välj **Programplaner**. De fyra befintliga provutbildningarna ska vara synliga:

| Utbildning | Vad du prövar |
| --- | --- |
| Användarprov – programplan, skapa | Skapa första utkastet med uttryckligt katalog- och startdatumval. |
| Användarprov – programplan, äldre utkast | Läs äldre val och bind dem till känt underlag utan bortfall. |
| Användarprov – programplan, bundet utkast | Ändra programfördjupning och kontrollera beständig sparning. |
| Användarprov – programplan, ny version | Läs låst version och skapa en kopia som nytt utkast. |

Alla exempel använder **SA25**, programversion **4**, inriktning **SASAP** och känd syntetisk utbildningsstart **2026-08-17**. Välj katalogen hämtad **2026-09-05**. Startdatum ska anges aktivt i formuläret; kulltext och startår är inte datumbevis. Ett tidigare sparat exempel lämnas kvar vid omkörning av förberedelsen.

## Prova programplanerna

Börja med att öppna en utbildning och säg vad som ingår och vad du kan ändra. Planen ska visas direkt. Beskriv om **Ingår enligt underlaget**, **Dina sparade fördjupningsval** och **Nästa steg** hjälper dig att förstå utbildningen. Tekniska källor och äldre versioner kan sedan öppnas under **Underlag och tidigare versioner**.

Använd de kvarvarande exemplen; en tidigare sparad eller ändrad plan ska ligga kvar. Följ den åtgärd som faktiskt visas. Skapa inte om en plan för att försöka återställa en tidigare provbild.

1. Öppna **skapa**. Om utbildningen fortfarande saknar plan: välj **Skapa programplan**, välj aktivt underlaget hämtat 2026-09-05 och **Fortsätt till startdatum och val**. Ange 2026-08-17, välj en fördjupningsnivå och **Spara utkast**. Om ett utkast redan finns, läs dess sparade val och gå vidare via **Ändra fördjupning**. Ladda om: samma utkast och val ska ligga kvar. Det ska framgå att sparningen inte fastställer planen.
2. Öppna **äldre utkast**. Om det fortfarande är obundet ska äldre råval, exempelvis **ANIM1000X**, visas utan gissade namn. Välj **Gör utkastet redo för ändring**, aktivt underlag, **Fortsätt till startdatum och val**, startdatum 2026-08-17 och bekräftelsen att hela den äldre valmängden bevaras i samma ordning. Spara. Därefter ska nivånamn och poäng kunna läsas. Om planen redan är bunden, granska de bevarade valen och det bundna underlaget i stället för att binda igen.
3. Öppna **bundet utkast**. Välj **Ändra fördjupning**, lägg till en nivå och pröva flytta/ta bort. Spara och ladda om. Namn, poäng och ordning ska bestå; katalog och startdatum är bundna. Ändra något igen och välj **Avbryt**: bekräftelsen ska låta dig behålla eller lämna dina osparade ändringar. Pröva samma väg på telefon.
4. Öppna **ny version**. Om den låsta källan fortfarande är aktuell och inget utkast finns: välj **Skapa ny version**, aktivt underlag, **Fortsätt till startdatum och val**, startdatum 2026-08-17 och bekräftelsen för äldre val. Spara. Den nya versionen ska vara utkast. Om ett utkast redan skapats visas det direkt; läs det och öppna sedan den äldre låsta versionen i **Underlag och tidigare versioner**. Den låsta källans status och beslutsdatum ska bestå.
5. Bedöm om du förstår nästa handling utan att börja med de tekniska källuppgifterna. Skiljer vyn tydligt sparade val från alternativ eller saknade nivåuppgifter i referensunderlaget? Prova också på telefon: nås alla val och knappar, fungerar dialogens rullning och syns resultat/fel där du förväntar dig?

Den låsta provkällan har lagts in privilegierat som syntetisk provsetup; fastställande är ännu inte en levererad användaråtgärd. Katalogreferenser kan lösas utan att hela utbildningens nationella ram, alternativ, nivåföljd eller undervisningstid är kontrollerad. Ingen generell poängram eller omräkning till schematimmar ska visas som godkänd regelkontroll.

## Bedöm timplanshandledningen

Öppna **Timplaner**, först grundskoleprovet och sedan introduktionsprogrammet. Läs **Innan du ändrar undervisningstiden** och öppna regelinformationen. Bedöm om rektorns och huvudmannens ansvar är tydligt, om timmarna och undervisningstiden förklaras, och om texten hjälper dig före en ändring. Kontrollera samma vägledning i ändringsdialogen. Tidigare timplansfunktionsprov är rapporterade som fungerande; här återstår mänsklig bedömning av den nya texten.

## Rapportera resultat

Skriv vilka moment du provade och om du använde dator, telefon eller båda. Beskriv eventuella otydliga texter, fel eller saknade val. Mänskligt resultat för programplansflödet och timplanshandledningen registreras först efter din återkoppling. Fas 4:s separata checkpoint och hela fas 5:s återstående krav hålls fortsatt öppna.

## Teknisk förberedelse

Ägarskyddad, additiv förberedelse: `work/pilot/prepare-programplan-user-trial.mjs`, reserverat prefix 55100110. Exakta syntetiska kund-/skolnamn och organizerrelation måste finnas. Scriptet ändrar inte mandat eller befintliga planer och bevarar användarens tidigare ändringar. Tillfälliga egna SQL-sessioner provar befintliga rektors-/huvudmannamandat och obligatorisk DB-loggning; detta är inte interaktiv IdP eller Worker/browserbevis. Första förberedelse och omkörning PASS: alla sju tidigare provrader samt en uttryckligt ändrad egen kulltext bevarades. Den egna textändringen återställdes efter detta avgränsade bevarandeprov. Se phase5-11-user-trial-preparation.json.

Vanlig skyddad app på 3012 kör bygge c320041 utan diagnostisk preload. Startsida och Worker/DB-hälsa PASS. Verify-programplan-user-trial.mjs läste därefter alla fyra initiala exempel och de tre förberedda planerna för både befintlig rektor och huvudman genom faktisk Worker: 16 auditerade läsningar med rätt DB-/Worker-par. Egna tillfälliga sessionsrader städades; säkerhetsloggar bevarades. Se phase5-11-user-trial-worker.json och phase5-11-root-verification.json. Detta använder lokalt mintade sessionsbevis och är inte interaktiv IdP eller ett mänskligt resultat.

Programbrowser 30/30 och timplansregression 20/20 PASS mot samma bygge, på dator och iPhone/WebKit. Två tidigare avbrutna previewomgångar sparas som FAIL; deras rotorsak är fortsatt öppen i .planning/debug/phase5-preview-exit.md. De nya fulla gröna proven och frisk 3012 förbereder användarprovet utan att påstå en verifierad orsaksfix.

## Användarresultat 2026-10-02

Användaren rapporterar: ”programplanerdelen är ju fullständigt obegripligt UI. fattar noll.” Detta registreras som ett misslyckat begriplighetsprov, inte som godkänd programplansvy. Enheter och enskilda sparsteg särredovisades inte. 05-13 förbereder en ämnes-/nivå-/poängvy med tydliga verksamhetsåtgärder och guidad skapa/binda/klona; tekniska referenser flyttas under Underlag. Färska automatiska UI-prov och ett nytt mänskligt prov krävs efter rättning. Befintlig backend, versioner och användarändringar ska bevaras.
