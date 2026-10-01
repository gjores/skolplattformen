# Samlat användarprov: programplaner och timplanshandledning

Status: **förbereds — mänskligt resultat saknas**. Gäller lokal skyddad provmiljö och syntetiska uppgifter. De automatiska proven redovisas separat i 05-11/05-12-SUMMARY. Detta godkänner inte fullständiga nationella beslutsregler, verklig kommunanslutning eller pilotdrift.

## Börja här

Öppna http://127.0.0.1:3012/ och välj rektorns provknapp på inloggningssidan. Ange aktuell engångskod när inloggningen kräver den. Välj uppdraget för **Syntetisk skola 11**. Huvudmannens provkonto kan också arbeta med programplansutkasten. Inga inloggningsuppgifter eller engångskoder lagras i denna fil.

Välj **Programplaner**. Fyra nya utbildningar ska vara synliga:

| Utbildning | Vad du prövar |
| --- | --- |
| Användarprov – programplan, skapa | Skapa första utkastet med uttryckligt katalog- och startdatumval. |
| Användarprov – programplan, äldre utkast | Läs äldre val och bind dem till känt underlag utan bortfall. |
| Användarprov – programplan, bundet utkast | Ändra programfördjupning och kontrollera beständig sparning. |
| Användarprov – programplan, ny version | Läs låst version och skapa en kopia som nytt utkast. |

Alla exempel använder **SA25**, programversion **4**, inriktning **SASAP** och känd syntetisk utbildningsstart **2026-08-17**. Välj katalogen hämtad **2026-09-05**. Startdatum ska anges aktivt i formuläret; kulltext och startår är inte datumbevis. Ett tidigare sparat exempel lämnas kvar vid omkörning av förberedelsen.

## Prova programplanerna

1. Öppna **skapa**. Välj katalog och **Skapa utkast**, ange 2026-08-17, välj en fördjupningsnivå och spara. Läs om eller ladda om sidan: samma utkast och val ska finnas kvar. Det ska framgå att sparningen inte fastställer planen.
2. Öppna **äldre utkast**, välj version 1 och katalogen. Det äldre valet **ANIM1000X** ska visas. Välj **Bind äldre utkast**, ange 2026-08-17 och bekräfta att hela den äldre valmängden bevaras i samma ordning. Efter sparning ska utbildningsstart och programversion visas, med samma äldre val.
3. Öppna **bundet utkast** och version 1. Välj **Ändra programfördjupning**, lägg till ytterligare nivå och pröva flytta/ta bort. Spara och ladda om. Val och ordning ska bestå; katalog och startdatum ska vara bundna. Ändra något igen och välj Avbryt eller en annan vy: osparade ändringar ska ge ett tydligt val.
4. Öppna **ny version** och version 1. Den låsta källan ska gå att läsa. Välj katalog, **Kopiera till nytt utkast**, ange 2026-08-17 och bekräfta äldre val. Spara. Den nya versionen ska vara utkast och den tidigare versionens status och beslutsdatum ska bestå.
5. Bedöm om skillnaden mellan version, katalogunderlag, olösta val, sparat utkast och fastställd plan är begriplig. Prova också på telefon: nås alla val och knappar, fungerar dialogens rullning och syns resultat/fel där du förväntar dig?

Den låsta provkällan har lagts in privilegierat som syntetisk provsetup; fastställande är ännu inte en levererad användaråtgärd. Katalogreferenser kan lösas utan att hela utbildningens nationella ram, alternativ, nivåföljd eller undervisningstid är kontrollerad. Ingen generell poängram eller omräkning till schematimmar ska visas som godkänd regelkontroll.

## Bedöm timplanshandledningen

Öppna **Timplaner**, först grundskoleprovet och sedan introduktionsprogrammet. Läs **Innan du ändrar undervisningstiden** och öppna regelinformationen. Bedöm om rektorns och huvudmannens ansvar är tydligt, om timmarna och undervisningstiden förklaras, och om texten hjälper dig före en ändring. Kontrollera samma vägledning i ändringsdialogen. Tidigare timplansfunktionsprov är rapporterade som fungerande; här återstår mänsklig bedömning av den nya texten.

## Rapportera resultat

Skriv vilka moment du provade och om du använde dator, telefon eller båda. Beskriv eventuella otydliga texter, fel eller saknade val. Mänskligt resultat för programplansflödet och timplanshandledningen registreras först efter din återkoppling. Fas 4:s separata checkpoint och hela fas 5:s återstående krav hålls fortsatt öppna.

## Teknisk förberedelse

Ägarskyddad, additiv förberedelse: `work/pilot/prepare-programplan-user-trial.mjs`, reserverat prefix 55100110. Exakta syntetiska kund-/skolnamn och organizerrelation måste finnas. Scriptet ändrar inte mandat eller befintliga planer och bevarar användarens tidigare ändringar. Tillfälliga egna SQL-sessioner provar befintliga rektors-/huvudmannamandat och obligatorisk DB-loggning; detta är inte interaktiv IdP eller Worker/browserbevis. Körresultat, idempotens och aktuell 3012-verifiering kompletteras när backendens slutprov har avslutats.
