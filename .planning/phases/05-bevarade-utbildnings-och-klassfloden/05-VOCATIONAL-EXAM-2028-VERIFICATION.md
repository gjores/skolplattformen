# Yrkesprov och gymnasiearbete för 2028-kullar

Status 2026-10-18: levererad på3012. Produkt, isolerad SQL, faktiskt Worker-/browserprov, installation och läsande efterprov PASS. Användarens beställning är stöd enligt reglerna, tydligare blockerare och möjlighet att skicka till huvudmannen. Ingen full fas- eller pilotacceptans härleds.

## Verifierat beteende

För stödda nationella yrkesprogram vars första utbildningsår börjar HT2028 eller senare krävs uttrycklig granskning av examensformen. Skolan dokumenterar yrkesprov när ett tillämpligt prov finns eller gymnasiearbete när det saknas, med officiell Skolverketkälla, beskrivning och kontrolldatum. Underlaget granskas av huvudmannen. Appen verifierar format, behörighet, versionsbindning och arbetsgång; den verifierar **inte** ett nationellt provutbud automatiskt. Ingen publicerad tillämplig2028-katalog har kunnat verifieras i researchen.

Kortet **Examensform för elevkullen → Granska examensform → Spara examensform** ersätter den tidigare generella2028-spärren. Inget alternativ är förvalt. Ny elevkull kräver ny kontroll. Ändrad start, fördjupning eller valram nollställer kontrollen; oförändrade värden behåller den. Vanliga skapa-/bindningskommandon kan inte introducera en granskning. Inskickat underlag är låst; ny version inom samma utbildning kan bevara ett granskningsbart tidigare underlag.

Den befintliga100-poängsraden behåller internnyckeln `meta:diplomaWork` och visas som Yrkesprov eller Gymnasiearbete. Vid modellbyte och kopiering till ny timplansversion blir endast den berörda radens tid ofördelad med uttrycklig kopiegranskning. Tidigare frysta planer och beslutskvitton ändras inte. GUT/års-APL kontrolleras som tidigare och timtabellen kan godkännas före periodplanering.

## Kontroller före lokal installation

- Modell- och regressionsprov:201/201 PASS (`/private/tmp/examination-all-model-tests.log`). Sju nya examensformsprov ingår, inklusive de fyra generiska inputvägarna.
- Server/route:98/98 PASS enligt backendens slutkörning. `tsc --noEmit` och `oxlint app lib` PASS.
- UI:20/20 PASS på dator/telefon, inklusive huvudmannens redigering av oskickat utkast. Separat slutlayoutprov efter ändrad innerkant. Första körningens HMR-avbrott på telefon bevaras som diagnostik och räknas inte som godkänt slutprov.
- Handbok: byggd efter sista textändringen, PASS (`/private/tmp/programplan-examination-docs-final.log`).
- Skyddat separat bygge: `7102cf828fac7006b4296538290da1bac25bdd8c`,215 filer, SHA256 `c48c4f8a246d2e73e1ea115dc10ed22681314f571fe29ff3b3e25b0a255930c6`. Aktivt bygge byggdes inte om på plats.
- SQL:25/25 PASS, riktig tvåsessionskonkurrens med observerad låsväntan, en commit och en40001. Full matrisrollback, oförändrade befintliga rättigheter och originalrader i79 tabeller; full städning. Rapport `/private/tmp/programplan-examination-sql07.json`, SHA256 `54a569b98b2df20e41f24dfd4ee2e2d25f25ccebf248aaef7e6382e98972a335`.
- Installation/överföring:9/9 kontrakttester PASS efter utökad bindning till fryst separat källcheckout. Exakt11 befintliga funktionsdefinitioner ersätts och2 nya funktioner införs; inga nya kolumner eller ändrade befintliga data. Privat helper saknar klientgrant; endast rätt Worker-ingång kan skriva. Installerat schema i isolerat prov: `af3199905a6658e6f645c70ead39bcbd9c75eb573829ee1532cb4c99d488fe8e`.

Tidigare SQL-försök avslutades på verifierarens miljö-/fixture-/assertionsfel, med städning; de märks inte om som PASS. Slutbeviset är SQL07. Ingen aktiv databas har återställts eller kopierats till test.

## Samtidigt arbete och första faktiska provet

Actual01 passerade20 funktionella kontroller (dator5, telefon5, API10) med full städning men slutstatus är **FAIL**: andra UI-ändringar kom in i den gemensamma arbetskopian under körningen. Beviset `/private/tmp/programplan-examination-actual01.json` är endast diagnostik. Inga sådana ändringar återställdes eller togs in i2028-leveransen. Separata källcheckouten7102cf8 och byggartefakten är oförändrade. Nytt slutprov binds till ren, revisionskontrollerad separat checkout med exakt Gitblob/disk-kontroll, medan verifieringsverktygens importkedja fortfarande kontrolleras i huvudkopian. Ingen historisk FAIL omklassificeras.

## Slutligt faktiskt prov och installation

Actual02: **20/20 PASS**, utan omprov inom körningen. Dator5, telefon5 och API10, riktig lokal Worker/PostgreSQL/OIDC, inga auth-/verksamhetsmockar. Båda tillåtna alternativen, komplett rektor→huvudman→timplan, giltig GUT/års-APL före perioder, fel skola/roll/origin/context, ogiltigt underlag, CAS, gammal beslutshash, auditrollback, MFA/step-up, fryst historik, nykullclear och återkallat mandat ingår. Två samtidiga sparningar gav en200 och en409. Full städning,420 produktfiler från fryst checkout samt verktyg/migration/215 byggfiler oförändrade. Tio bilder granskade med dokumenterad sticky-begränsning.

Rapport `/private/tmp/programplan-examination-actual02.json`, SHA256 `7d709f06f6dbfa4aab316f922d8cda41101b3b09964d2d20437fbb3715b43b0a`. Full `readPackageEvidence` PASS mot SQL07. Annat pågående UI-arbete är bevarat i arbetskopian och ingår inte i den här leveransen.

Aktiv installationsförkontroll och överföringsförberedelse PASS. Den enda migrationen `20261018180000_programplan_examination_review.sql` installerad atomiskt med79 originaltabeller och befintliga ACL/rättigheter exakt bevarade. Låstid före commit5844ms. Installationsbevis `/private/tmp/programplan-examination-installed.json`, SHA256 `24bc472c371e48502c4580d3a0257b495d39ced334f1244eafbca78079a31a39`. Förkontroll efter installation PASS. Exakt appbyte och läsande efterprov PASS.3012 kör7102cf8/215-filsartefakten ovan. Samtliga76 verksamhetstabeller är oförändrade vid byte/läsprov, liksom schema och privat konfiguration. Leveransbevis `/private/tmp/programplan-examination-delivered.json`, SHA256 `e5d1ddebea148e1ba43748e2db70bde2e57d0df2178aeab2c49f9377f1412599`. Inget återställningsbehov finns.

## Kvarstående gränser

Telefonens långa elementscreenshots visar den befintliga klistrade skol-/läsårspanelen ovanpå delar av examensformskortet. Alla fält och knappar kunde användas i det faktiska provet; bilderna räknas inte som visuellt felfria. Fyndet är registrerat i den bredare UI-genomgången.

Detta är gemensam planering för stödda nationella program. Individuella övergångsfall vid förlängda studier, examensbevis, betyg, komvux och anpassad gymnasieskola ingår inte. En gammal kontroll av att prov saknas är inget permanent undantag; aktuell källa och tillämplighet måste granskas inför utbildningen. Mänsklig begriplighetsbedömning återstår efter leverans.

ADMIN-02 får avgränsat nytt stöd; ADMIN-03/04 skyddas genom kopie-, versions- och identitetskontroller. Historiska88/100 planer och3/8 verifierade faser består. SS12000:2024 utgåva4/OpenAPI2.1.0: intern planegenskap och stabil100-poängsidentitet, inga fabricerade externa provID:n eller påståenden om faktiskt elevresultat/standardutbyte. Se [plan](05-VOCATIONAL-EXAM-2028-PLAN.md) och [primärkällor/regelavgränsning](../../research/VOCATIONAL-EXAM-2028-2026-10-18.md).

## Avgränsat användarprov efter lokal leverans

1. Ladda om appen och öppna ett yrkesprogramsutkast för HT2028 eller senare. Under **Examensform för elevkullen** ska **Granska examensform** visas när kontroll saknas.
2. Kontrollera det verkliga underlaget hos Skolverket. Ange rätt alternativ, källa, beskrivning och datum; bekräfta kontrollen och välj **Spara examensform**. Syntetiska testreferenser är inte verksamhetsunderlag.
3. Kontrollera att tabellens100-poängsrad har rätt namn och att övriga planeringskontroller är klara. Välj **Skicka till huvudmannen**.
4. Huvudmannen granskar det sparade källunderlaget och godkänner eller skickar tillbaka. Efter godkännande används samma frysta examensform i timplanen. Timplanens GUT-/APL-kontroll kvarstår; perioderna får planeras senare.

Användaren har beställt implementationen; ett nytt godkänt begriplighets-/verksamhetsprov antas inte innan återkoppling kommer.
