# Användbarhetsgenomgång 2026-10-12

## Beställning och avgränsning

Användaren upplever att appen inte är enkel och logisk och har beställt direkta rättningar av lågt hängande frukter samt förslag på större förändringar. Detta är en avgränsad rättning och genomgång, inte genomförande av en ny fas. De 42 godkända kraven, fasernas verifieringsstatus och tidigare användargodkännanden ändras inte.

Utgångspunkt: kodkartan och aktuella PROJECT/STATE, därefter färsk kodgranskning av det skyddade skalet, planeringsöverblick, programplanslista och arbetsyta, timplaner, elevregister, mandat, kundadministration, säkerhetslogg och exempelmiljöns meny. Webbläsargranskningen gäller planeringslistor, läsårsöverblick och det gemensamma skalet, med syntetiska API-svar och tomma listor. Övriga vyer är källgranskade, inte fullständigt genomprovade i denna genomgång.

## Bedömning

Appen har fungerande delar men visar ofta organisationen av data före användarens arbetsuppgift. Många val, statusar och tekniska förklaringar konkurrerar om uppmärksamheten. Det märks särskilt på telefon, där sidhuvud, skol-/årsval och filter kommer före resultatet. Enbart nya färger eller kortare texter löser inte detta.

## Genomförda rättningar

1. **En menyingång per planeringsvy.** Den extra knappen Utbildningar öppnade exakt samma vy som Programplaner och kunde aldrig bli aktiv. Den tas bort. Utbildningarna och skapandeflödet finns fortsatt under Programplaner.
2. **Tydligt nästa steg i överblicken.** Rubriken får samma visuella tyngd som andra arbetsytor. Knappen Visa och öppna planerna flyttas till sidans början. Underlag, skola, läsår och befintliga navigationsspärrar följer samma kodväg som tidigare.
3. **Val som syns.** Valt planeringsunderlag och valt kullfilter markeras med färg och aria-pressed. En andra tryckning på valt kullfilter återgår till det befintliga standardurvalet nya/fortsättande/okänd start. Övriga filter behålls.
4. **Enklare och enhetligare språk.** Överblickens ingång heter Programplaner, precis som menyn. Resultat räknas som träffar. Programplanslistan beskriver ämnen och poäng samt att versionen hör till vald skola och valt läsår.
5. **Förklaring vid behov.** Den längre beskrivningen av hur överblicken summerar fälls ut under Så räknas överblicken. Skillnaden mellan poäng, timmar och bemanning samt varningar om saknade uppgifter är fortsatt synliga.
6. **Kompaktare telefonhuvud.** Uppdraget placeras efter knappraden även när användaren bara har ett uppdrag. Hjälp och utloggning får minst 44 × 44 pixels tryckyta.

Planeringens handbok är uppdaterad. Två befintliga browserförväntningar är uppdaterade för den nya resultattexten; inga databaskontrakt, mandatregler eller sparflöden ändras.

## Prioriterade förslag vid den första genomgången

**Uppföljning samma dag:** Användaren beställde därefter en omarbetning. Startvy, filter och mobilkort är genomförda i källan enligt [separat redovisning](anvandbarhet-omarbete-2026-10-12.md). Tabellen nedan bevarar ursprungsförslagen; övriga punkter och användarprov återstår.

| Prioritet | Problem och belägg | Föreslagen förändring | Hur förbättringen prövas |
| --- | --- | --- | --- |
| 1 | Huvudmannen landar i Mandat, medan rektor landar i Elever. Ingen gemensam start hjälper användaren vidare till dagens uppgift (`protected-home.tsx`, `startView`). | En enkel uppdragsanpassad startsida med exempelvis Hitta elev, Planera läsår och Hantera uppdrag. Visa vald skola och läsår samt en tydlig fortsättning till senast öppnad arbetsyta inom det giltiga uppdraget. | Låt en ny användare hitta rätt uppgift utan muntlig vägledning. Kontrollera också byte av uppdrag och att tidigare innehåll rensas. |
| 1 | Planeringens många filter ligger före resultatet. I telefonprovet krävs rullning innan man ser träffarna. Elevregistret har ett liknande stort filterområde. | Behåll sökning och de viktigaste valen synliga. Samla övriga under Fler filter, visa aktiva filter som korta etiketter och erbjud Rensa. Låt skol-/årsvalet visa en kompakt sammanfattning på telefon. | Jämför tid och antal tryckningar för att hitta samma elev/utbildning. Pröva aktiva filter, direktlänk, Tillbaka och återställning; inget dolt filter får överraska användaren. |
| 1 | Programplanen samlar många likvärdiga åtgärder: Analys, Timplan, Kopiera, Läs om, Ändra uppgifter, Skolor, Arkivera och Ta bort (`protected-programplan-workspace.tsx`). | Gör nästa huvudsakliga arbetsmoment tydligt: utbildning → ämnen och poäng → skolans timmar → klasskoppling. Flytta sällan använda åtgärder till Fler åtgärder. Visa källa och version nära rätt steg. | Genomför befintligt gymnasieflöde inklusive kurs-/nivåtillägg, ny kull och uttrycklig klass–timplanskoppling. Ingen klasskoppling eller ny timversion får skapas tyst. |
| 2 | Planeringslistans tabell har många kolumner och Öppna längst till höger. På telefon krävs sidledsrullning (`protected-plan-list.tsx`). Elevregistret har redan en separat kortlista. | Inför kort även för planeringslistor på telefon: utbildning, skola, kull, status och en synlig Öppna-knapp; övriga uppgifter kan fällas ut. Behåll tabellen för jämförelser på dator. | Öppna rätt skola och exakt rätt planversion utan sidledsrullning. Jämför information och åtgärder med datortabellen. |
| 2 | Produkttexter visar ofta tekniska begrepp: årsrad, revision, katalogreferens och råa åtgärdskoder i säkerhetsloggen. | Skriv först vad uppgiften betyder och vad användaren kan göra. Samla tekniska referenser under Underlag och historik. Ge loggåtgärder verksamhetsnamn och behåll originalkoden i detaljerna. | Användaren ska kunna förklara planens status och nästa steg. Granskaren ska fortfarande kunna hitta exakt version, källa och händelse. |
| 2 | Sparning sker på olika sätt i olika vyer: radvis autospar av timmar, sparknapp i andra formulär och särskild hantering av okänd sparstatus. | Ett gemensamt synligt sparbesked: Sparar, Sparat, Osparade ändringar eller Sparstatus okänd. Kort hjälp vid det första redigerbara fältet för när sparningen sker. | Pröva långsamt svar, fel, samtidiga ändringar, byte av skola/år och Tillbaka. Behåll spärren när sparutfallet är okänt. |
| 3 | Exempelmiljön visar fler arbetsområden och benämningen Poängplaner; den skyddade miljön använder Programplaner och ett smalare utbud (`page.tsx`, `protected-home.tsx`). | Harmoniera begreppen och visa tydligt vilka funktioner som bara är demonstration. Utgå från den skyddade miljön när nästa produktflöde utformas. | Kontrollera att användaren kan skilja provfunktioner från tillgängliga skyddade arbetsflöden och att länkar leder till rätt instruktion. |

Rekommenderad nästa avgränsning: förenkla filter och mobilens innehållsprioritering först, och diskutera därefter startsidan och det sammanhängande utbildningsflödet inom GSD. Genomgången beslutar inte om nya moduler, formell färdigmarkering eller huvudmannens godkännande.

## Verifiering

- Dator 1440 × 1000 och telefonprofil iPhone 13 (390 × 844), Chromium med syntetiska, avlyssnade API-svar: meny/vald sida, underlagsbyte, kullfilter på/av, tangentbord för utfällning, vidare till timplanslista och Tillbaka med samma skola/läsår/skolform passerar.
- Berörda knappar är minst 44 × 44 px; ingen sidövergripande horisontell overflow i dessa prov. Före-/efterbilder av lista och överblick granskade. Inga browserfel eller oväntade API-anrop i slutprovet.
- 74 befintliga modell-/kontrakts-/URL-prov för planeringsår och planlänkar passerar. Typkontroll och `oxlint app lib` passerar.
- Handboken bygger. Appen bygger med skyddat klientläge i en separat temporär källkopia, med samma berörda produktfiler. Ingen omstart eller ersättning av ordinarie 3012-bygge ingår.
- Första bildprovet avbröts av felaktig förväntan på läsårstexten 2026/2027 (appen visar 2026/27). Första isolerade byggförsöket saknade katalogen hooks i källkopian. Båda kontrolluppläggen korrigerades; produktkoden ändrades inte för dessa fel.
- Lokala bilder och kontrollutdata finns under `web/outputs/usability-*`; byggloggar under `/private/tmp/skolplattform-usability-*`. Dessa är arbetsmaterial, inte versionshanterade bevis för verklig integration.

**Begränsning:** Detta är en avgränsad UI-kontroll och kodgranskning. Ingen full fas-5-svit, inloggning mot IdP, databasskrivning, verklig kommunanslutning, fysisk telefon eller mänskligt användarprov är genomförd här. Förbättrad begriplighet behöver följas upp med användaren.
