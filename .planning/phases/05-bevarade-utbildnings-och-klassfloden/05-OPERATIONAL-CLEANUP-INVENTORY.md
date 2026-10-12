# Underlag inför lokal datarensning, 12 oktober 2026

Användaren har begärt rensning av oönskade data. Detta underlag gäller endast det verifierade lokala målet `protected`. Själva inventeringen ändrade inga rader. Efter ett senare uttryckligt användarbeslut har exakt sex gamla testutbildningar arkiverats med full bevarandekontroll (se sista avsnittet). Inga rader har raderats.

## Utförd kontroll

`inventory-protected-cleanup.mjs` använder målskydd, skrivskyddad anslutning och en `REPEATABLE READ READ ONLY`-transaktion. `trace-protected-cleanup.mjs` korsar samma kund-ID:n mot strukturerade historiska rapportfält och fixturekällor. Båda har korta fråge-/låstimeouter och skriver detaljrapporter exklusivt, med filrättighet 0600, under `/private/tmp`. Standardutdata innehåller endast aggregat.

Inventeringen och den efterföljande proveniensläsningen passerade. Inga andra öppna databastransaktioner eller innehavare av rådgivande lås fanns vid proveniensläsningen. Detta är en ögonblicksbild, inte bevis för att ett gammalt test aldrig ska fortsättas.

## Resultat och avgränsning

| Grupp | Antal | Bedömning |
| --- | ---: | --- |
| Beständiga kunder för lokala rollprov | 2 | Bevara; innehåller användarens aktuella provmiljö. |
| Huvud-fixturegrafer med avslutade återställningsrapporter | 8 | Bevara; rapporterna har uttryckligen lämnat kund-/mandatgrafer för revisionshistoriken. Inga utbildningar eller planer finns kvar i dessa grafer. |
| Främmande årsplaneringskunder | 8 | Bevara; cleanup-koden behåller kund-/mandatankare när säkerhetshistorik finns. Inga utbildningar eller planer finns kvar. |
| Fasta kunder för fas 2:s behörighetsprov | 2 | Bevara; tillhör den konfigurerade testmiljön. |
| Gammal programplansfixtur utan exakt avslutsbevis | 1 | Separat granskning; innehåller 6 utbildningar och 4 programplaner. Senaste sparade sessionsaktivitet är 3 oktober. Ingen aktiv session, men datumet bevisar inte att grafen får raderas. |
| Kunder utan verifierad proveniens | 3 | Bevara tills ägarskapet är klarlagt; en av dem har 1 utbildning och 1 programplan. |

De två beständiga rollexemplen har sammanlagt 26 utbildningar. Av dessa har 22 plan, klass eller elevplacering. De fyra återstående gäller NA25, TE25, ES25 och VO25 och saknar syntetiska namnmarkörer. De kan vara avsiktligt förberedda utbildningar; de är inte ett säkert raderingsurval.

Totalt saknar 17 programplaner en timplan. Dessa ska uttryckligen bevaras enligt användarens beslut att programplaner får ligga under arbete. Det finns inga gymnasietimplaner utan programplanskälla, brutna programplansreferenser eller klasslänkar utan matchande registrerad skola/klassnamn/utbildning. Klassens kullår jämförs inte direkt med klasslänkens läsår.

## Historik och lagring

Den största tabellen är säkerhetshistoriken: 201 466 rader, cirka 80,6 MiB inklusive index. 191 857 rader gäller tidigare bortstädade provkunder. 5 426 identiteter utan medlemskap är fortfarande refererade som auditankare. Dessa är avsiktligt bevarade revisionsbevis, inte föräldralösa verksamhetsrader.

117 sessioner är utgångna eller återkallade. Inventeringen gör ingen gallring och ingen generell beslutad gallringsregel har verifierats. Index-/radstatistik är diagnostik och motiverar inte i sig att data eller index raderas.

## Konkreta nästa steg

1. Klargör om den gamla fixturens 6 utbildningar/4 programplaner och de tre opåvisade kundgraferna ska finnas kvar. Använd privata exakta ID:n och beroendelistor; välj aldrig efter en lös namnmatchning.
2. För ett uttryckligen valt urval: ta privat återställningsunderlag och bind en torrkörning till exakta ID:n, fullständiga radhashar och verifierat oförändrade beroenden. Läs aktiva sessioner/transaktioner på nytt precis före åtgärd.
3. Bevara pågående programplaner, fastställda versioner, klass-/elevkopplingar, identiteter, mandat och all säkerhets-/beslutshistorik om inte just den datakategorin omfattas av ett separat granskat beslut.

Nuvarande säkra automatiska raderingsurval är tomt. Ingen fysisk rensning, återställningskopiering av hemligheter eller uppmjukning av databasens skydd har utförts.

Privata körbevis: `/private/tmp/protected-cleanup-inventory-20261012-a.json` och `/private/tmp/protected-cleanup-trace-20261012-a.json`. De ska inte versionshanteras eller delas som rådata.

## Återställningsplan för den enda gamla grafen med verksamhetsdata

Den kompletterande skrivskyddade läsningen ändrar inte raderingsurvalet. Grafen har 6 utbildningar, 6 skolkopplingar, 3 programplansutkast, 1 fastställd programplan, 1 äldre programplanshändelse och 1 historisk formuppgraderingsrad. Därtill finns kund, huvudman, 2 skolor, 2 skolformrader, 4 medlemskap, 4 moderna mandat, 5 mandat–skolkopplingar, 2 äldre uppdrag, 2 äldre uppdrag–skolkopplingar, 2 personalbindningar och 4 utgångna sessioner. De 29 säkerhetshändelserna och identitetsankarna ska bevaras. Inga timplaner, klasser, elevplaceringar eller nya beslutsrader hittades för grafen.

Antal och serverberäknade SHA-256-hashar för de berörda tabellurvalen finns i `/private/tmp/protected-cleanup-trace-20261012-b.json`. Detta är ett jämförelseunderlag, **inte** en återställningskopia. Denna graf ligger utanför de två beständiga rollexempelkunderna; städning av den gör inte automatiskt deras listor kortare.

Före någon skrivning:

1. Bind urvalet till den privata kundidentiteten, dess huvudman och exakta utbildnings-/plan-ID:n. Kontrollera 6/4-antalen, alla radhashar och oförändrad schemaversion. Läs aktuella inkommande främmande nycklar från `pg_constraint`, inte bara de historiska definitionsfilerna. Följ även logiska referenser utan främmande nyckel: formuppgraderingar, versionskällor, kvittensernas JSON-referenser och säkerhetshändelsernas objekt-ID:n.
2. Klassificera varje beroende som bevara, arkivera eller separat föreslagen åtgärd. Alla identiteter, kund-/mandatankare, katalogsnapshots, säkerhets- och beslutsbevis är bevara. Den fastställda programplanen och den äldre programplanshändelsen får inte ingå i en generell radering. Inte heller de tre utkasten får tas bort enbart för att de saknar timplan.
3. Kontrollera på nytt att inget aktivt lokalt test äger grafen: ingen giltig session, ingen transaktion/advisory lock som berör den och ingen identifierad testprocess som använder dess run-ID. Inventeringens tidigare tomma aktivitetslista räcker inte som ett permanent låsbevis. Matcha eventuell PID tillsammans med starttid och kommando; stoppa inte okända processer.
4. Om användaren väljer **arkivering**, använd den etablerade livscykelfunktionens mandat-, revisions-, datums- och auditkontroller. Verifiera först i en separat isolerad kopia att även utbildningen med en äldre fastställd plan får arkiveras. Arkivering håller samtliga programplaner och historik kvar. Om funktionen inte tillåter åtgärden ska den vägras, inte ersättas med direkt SQL som kringgår kontrollen.
5. Skapa före eventuell godkänd fysisk rensning en privat datakopia av exakt de ändrade verksamhetsraderna med alla kolumner, versionsnummer, tidsstämplar och referenser. Exporten ska ha 0600-rättighet och ett separat manifest med antal, hash per tabell, källschema och urval. Exportera inte sessionstoken, identitetsuppgifter eller andra kunders rader. Alla kvarvarande FK-mål dokumenteras med ID och hash; de är förutsättningar för återställningen, inte extra raderingsobjekt.
6. Återläs kopian i ett separat disponibelt lokalt återställningsmål med samma migrationsnivå och nödvändiga bevarade referenser. Jämför hela rader inklusive metadata mot exportens hash. Återställ först utbildningar, därefter skolkopplingar och programplaner, sist tillåtna beroenderader enligt den aktuella FK-grafen. Inga audit-/beslutsrader ska återskapas som nya beslut. Om återställningen kräver avstängda säkerhets-/historiktriggers är planen inte godkänd; välj arkivering eller utred en särskild restore-funktion.
7. En eventuell slutlig skrivning ska vara atomär med låsta exakta urval, färsk hashkontroll och postcommit-verifiering. Alla övriga kunders verksamhetsrader, samtliga 17 programplaner utan timplan och all historik ska ha samma hash efteråt, om inte ett senare uttryckligt användarbeslut anger ett exakt undantag.

Stoppa vid ändrat urval, nya beroenden, aktiv ägare, korsreferens från annan kund, ändrad katalog/schemaversion, export-/hashfel, återställningsprov som inte passerar, skyddstrigger som förbjuder åtgärden eller okänt commitutfall. Ingen raderings-SQL eller körbar restore med avstängda skydd har producerats. Återställningsprovet och eventuell export återstår tills ett konkret ändringsurval är beslutat.

## Senare användarbeslut: arkivera de sex testutbildningarna

Användaren har uttryckligen valt att arkivera just de sex gamla, isolerade testutbildningarna. Det är ingen radering av deras fyra programplaner eller historik och omfattar inte de två aktuella rollexempelkundernas utbildningar.

Den gamla testkunden har ingen giltig appsession. Root har därför valt och källgranskat ett smalt lokalt administratörsunderhåll i `work/pilot/archive-approved-fixture-educations.mjs`, utan att skapa eller imitera en användaridentitet, session eller ett mandat. Endast de sex utbildningsradernas `archived_at`, `lifecycle_revision` och vanliga triggerstyrda `updated_at` får ändras. Alla triggers, constraints och övriga rader inklusive samtliga planer och audit ska vara oförändrade. Åtgärden dokumenteras som underhåll i privat verifierbar rapport, inte som en påhittad appanvändarhändelse.

Skriptets `--prepare` tar privat exakt kopia av de sex utbildningsraderna, bevarandehashar för alla publika tabeller och fingerprint av tabellrättigheter, triggers, constraints och migrationsnivå. `--verify` måste bevisa samma uppdatering med full rollback. `--apply` accepterar endast source- och backupbundna PASS-bevis och kontrollerar känt commitutfall med en ny läsning. För återställning krävs färskt beslut och jämförelse mot arkiveringsrapportens exakta efterrader; bara arkivmarkeringen återställs och revisionen ökas igen, aldrig tillbaka till ett äldre nummer.


## Genomförd godkänd arkivering

`--prepare`, `--verify` och `--apply` passerade med känd exitkod 0 den 12 oktober. Backupen innehåller exakt de sex utbildningsraderna och har verifierad rättighet 0600. Rollback-provet ändrade inga beständiga rader. Apply arkiverade exakt sex rader och en separat läsning verifierade känt commitutfall.

Fullradshashar för 59 publika tabeller visar att alla rader är oförändrade utom de sex utbildningarnas uttryckligen tillåtna tre fält. Samtliga programplaner (inklusive de 17 utan timplan), fastställda planer, beslut, äldre planhändelser, behörigheter och säkerhetshistorik är bevarade. Tabellrättigheter, triggers, constraints och migrationsnivå är oförändrade. Ingen användarsession eller påhittad användarhändelse skapades.

Privata exakta bevis (inte för Git):

- `/private/tmp/approved-fixture-archive-backup-20261012.json`
- `/private/tmp/approved-fixture-archive-verify-20261012.json`
- `/private/tmp/approved-fixture-archive-apply-20261012.json`

Återställningsplanen finns i backupen och ovan. Ingen återställning har begärts eller genomförts. Ingen ytterligare rensning är automatiskt godkänd genom detta avgränsade beslut.
