# Kommunintegration och säkerhet

2026-09-10. Arkitekturförslag grundat på befintlig kod och aktuella primärkällor. Detta är ett beslutsunderlag, inte genomförda säkerhetsåtgärder eller en fullständig säkerhetsrevision. Inga kommunanslutningar eller produktionsinställningar har ändrats.

**Kompletterat vid GSD-initieringen 2026-09-10:** Läs förslaget tillsammans med [projektets bekräftade omfattning](../.planning/PROJECT.md) och [granskningen av risker och rättsliga antaganden](../.planning/research/PITFALLS.md). Granskningen preciserar avsnitt 6 om övergångsregler, registrering, webbpublicering och anonymitet. Förslagen nedan om ett generellt publikt register och automatisk registrering från dokumentstatus är inte fastställda pilotkrav. Den ursprungliga förslagstexten bevaras här för spårbarhet.

## Rekommenderad riktning

Bygg en gemensam produkt som kan anslutas till varje kommuns identiteter, informationskällor och säkerhetsrutiner genom konfiguration och avgränsade anslutningar. Säkerhetsgränserna behöver omfatta kund, ansvarig organisation, skolenhet, uppdrag och informationens skyddsbehov.

Kommunens inloggning styr vem personen är. Appens behörighetsmodell avgör vilka handlingar personen får utföra på vilka objekt. Anställning, rektorsuppdrag och undervisningsrelation är olika saker. Ett fungerande kommunalt konto ger inte i sig åtkomst till skolans elevuppgifter.

Prioritera verklig identitet, avgränsade uppdrag och återkallad åtkomst före import av verkliga elevregister. Prova sedan en komplett anslutning med en pilotkommun och syntetiska data.

En förutsättning har ändrats sedan tidigare underlag: från 1 januari 2027 gäller offentlighetsprincipen även enskilda huvudmän. Registret över allmänna handlingar och utlämnandeflödet är därmed grundfunktioner för varje kund, inte en anpassning för kommunala kunder. Avsnitt 6 utvecklar vad det innebär för modellen.

## Vad som finns i appen idag

| Observation i koden | Konsekvens för nästa steg |
|---|---|
| `web/lib/supabase.ts`, `signInDemo`, använder anonym inloggning och `bootstrap_demo_profile`. | Besökare kopplas till samma demohuvudman med databasrollen huvudman. Det är en demokonstruktion. Produktionsmiljön behöver sakna den vägen helt. |
| `web/app/page.tsx` låter användaren välja roll i komponentens tillstånd. | Valet visar olika arbetsflöden men bevisar inte behörighet. Produktion ska härleda tillåtna arbetsroller från serververifierade uppdrag. |
| `profiles` har en huvudman och en roll per användare. | Modellen behöver flera medlemskap och uppdrag, exempelvis en person som arbetar på två skolor eller åt flera huvudmän. |
| Databasen använder radnivåskydd, huvudsakligen utifrån `organizer_id`. | En användbar grund, men många läsvägar omfattar hela huvudmannen. Elevåtkomst behöver snävare relationer. |
| Migrationen `20260908170000_principal_teacher_assignments.sql` ger rektor lärartilldelning inom huvudmannen. | Den kontrollerar inte att rektorn leder den berörda skolenheten. HM:s äldre skrivpolicy finns dessutom kvar. Föregående ändring gav rätt arbetsflöde i gränssnittet, inte en färdig produktionsgräns mellan HM och rektor. |
| Flera händelser och `actor_role` skrivs från klienten, exempelvis `savePointPlanEvent`. | Händelsehistoriken är inte en fullständig, servergenererad säkerhetslogg. Roll och händelse ska härledas ur den genomförda åtgärden. Läsningar och exporter behöver en egen loggningsstrategi. |
| Elevadministrationen använder exempeldata i gränssnittets tillstånd. | Kopplingen till verkliga elevregister behöver utformas tillsammans med informationsansvar och behörigheter. |

Underlag: `web/lib/supabase.ts`, `web/app/page.tsx`, `web/lib/organisation-store.ts`, `supabase/migrations/20260905120000_huvudman.sql`, `20260905130000_demo_bootstrap.sql`, `20260905170000_timplan_lasar.sql` och `20260908170000_principal_teacher_assignments.sql`. Befintligt produktunderlag om originalkällor och åtkomst finns i `docs/produktunderlag/12-informationsmodell-och-designkontrakt.md`.

## 1. Kommunens inloggning och kontolivscykel

Stöd OIDC och SAML genom en etablerad identitetskomponent. Anslut den identitetsleverantör kommunen faktiskt använder, exempelvis Entra ID eller en federationsanslutning. Skolfederation använder SAML 2.0; en fungerande SAML-inloggning är dock inte bevis för att federationens samtliga anslutningskrav är uppfyllda. Attribut, tillit, metadata och certifikat behöver verifieras i en anslutningsprovning. [Skolfederation](https://skolfederation.se/support/kom-igang/)

Föreslagna krav:

- Varje kommun har godkända identitetsanslutningar. Skapa aldrig medlemskap enbart utifrån e-postdomän eller ett organisationsnummer användaren anger.
- Identifiera externa konton med utfärdare och stabilt konto-ID. Sammanfoga inte personer automatiskt för att namn eller e-post råkar överensstämma.
- Kommunens krav på flerfaktorsinloggning ska kunna upprätthållas och prövas i appen. Administrativa åtgärder och särskilt skyddsvärd åtkomst kan kräva ny autentisering.
- Konton och medlemskap behöver kunna tilldelas och avvecklas, exempelvis genom SCIM. Verksamhetsuppdrag kan komma från andra källor. SCIM är ett separat flöde från inloggning. [Microsofts SCIM-dokumentation](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups)
- När ett medlemskap spärras i appen ska nästa skyddade serveranrop nekas, även med en tidigare utfärdad session. Fastställ och testa också maximal fördröjning från kommunens källsystem till spärren; katalogsynk är inte automatiskt omedelbar.
- Avslutade uppdrag ger inte fortsatt åtkomst bara för att personen fortfarande är anställd. Vikariat har start- och slutdatum.

Personalens arbetsinloggning och framtida vårdnadshavarinloggning behöver olika anslutningsflöden. E-legitimering identifierar vårdnadshavaren; en separat, verifierad relation avgör vilka elevuppgifter som får visas. Sweden Connect är relevant att utvärdera för e-legitimering. Dess nuvarande ramverk bygger på SAML medan OIDC införs; anta inte att alla anslutningssätt är färdiga eller utbytbara. [Sweden Connect](https://www.swedenconnect.se/teknisk-dokumentation/tekniskt-ramverk)

## 2. Behörighet följer uppdrag och sammanhang

En möjlig modell är `identity → memberships → assignments → permissions`. Ett uppdrag bär kund, ansvarig organisation, eventuell skolenhet/grupp, funktion, giltighet, källa och vem som beslutat tilldelningen. Behörigheten kontrolleras mot den aktuella handlingen och informationen, inte bara ett rollnamn.

| Funktion | Föreslagen avgränsning |
|---|---|
| Huvudman | Organisationsstruktur, tillsättning av rektor och behörig uppföljning. Funktionen ger inte automatiskt insyn i alla elevärenden. |
| Rektor | Läraruppdrag och beslut på de skolenheter personen faktiskt leder. |
| Lärare | Undervisning och elevinformation som behövs för personens aktuella undervisningsuppdrag. |
| Skoladministratör | Namngivna administrativa rättigheter inom tilldelad omfattning. |
| Kommunens IT-administratör | Identitetsanslutning, teknisk konfiguration och felsökning. Elevinnehåll kräver separat behörighet. |
| Leverantörens support | Tidsbegränsad, motiverad och spårbar åtkomst enligt avtalad rutin; ingen generell elevåtkomst som standard. |

Grundregeln är att saknad rättighet nekar åtkomst. Samma beslut ska gälla detaljvyer, sökning, antal i rapporter, filer, exporter, aviseringar och integrationer. En dold knapp räcker inte. Behörigheten måste kontrolleras på servern och i datalagrets relevanta åtkomstvägar. [OWASP om behörighetskontroll](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

Att slå upp en skolenhet i Skolverkets register verifierar skolans uppgifter. Det verifierar inte att användaren företräder huvudmannen eller får tilldela rektor. Första behöriga företrädaren behöver en separat verifierad etableringsprocess.

## 3. Isolering mellan kommuner och verksamheter

Skilj kundmiljö från huvudman och personuppgiftsansvarig organisation. Ett organisationsnummer är inte en universell säkerhetsgräns; olika nämnder eller verksamheter kan behöva egna ansvars- och åtkomstgränser. IMY anger exempelvis att en utbildningsnämnd kan vara personuppgiftsansvarig i kommunal skola. [IMY om personuppgifter i skolan](https://www.imy.se/verksamhet/dataskydd/dataskydd-pa-olika-omraden/skola-och-forskola/)

Två driftsätt kan använda samma applikationskod:

| Alternativ | Fördel | Kostnad och begränsning |
|---|---|---|
| Gemensam databas med strikt kundavgränsning | Enklare gemensam drift och uppgraderingar. | Högre krav på bevisad isolering i varje fråga, relation, kö, fil, export och återställning. |
| Separat databas/projekt per kund | Minskar omfattningen av många fel och underlättar kundspecifik återställning och avveckling. | Fler miljöer att övervaka och uppgradera. Skyddar inte automatiskt mot fel i gemensam applikation eller supportåtkomst. |

Min rekommendation är att modellen alltid stöder tydliga kundgränser och att separat databas övervägs för första kommunpiloten. Slutligt driftval bör följa pilotkommunens klassning, volymer och avtal. Egen kommunal drift bör erbjudas först när installation, uppgraderingar, övervakning och incidentansvar är provade.

## 4. Integrationer med tydligt informationsansvar

Utgå från SS 12000 för skoladministrativt informationsutbyte där båda systemen stöder de aktuella objekten. SIS anger SS 12000:2024 som senaste utgåva; den tillför en informativ användarstödsbilaga. Välj faktisk specifikationsversion och testa leverantörernas delmängder. Standarden ersätter inte behörighetskontroll eller avtal. [SIS om SS 12000](https://www.sis.se/delta-och-paverka/tksidor/tk400499/sistk450/ss-12000/)

För varje anslutning dokumenteras vilka objekt/fält som överförs, originalkälla, skrivansvar, stabila externa ID:n, giltighet, konfliktregel och hantering av borttagningar. Exempel: kommunens personalregister kan vara källa för anställning medan rektorns beslut i appen är källa för ett undervisningsuppdrag. Vilken källa som gäller måste väljas, inte gissas.

Föreslagen teknisk avgränsning:

- En egen maskinidentitet per kommun och integration, med minsta nödvändiga rättigheter och roterbara hemligheter. Ingen delad administratörsnyckel och ingen nyckel i webbläsaren.
- Krypterad transport och överenskommen maskinautentisering, exempelvis OAuth-klientautentisering; klientcertifikat om kommunen kräver det.
- Integrationer körs på servern och kan stoppas var för sig. Kommunala nät kan behöva tillåten utgående anslutning eller en särskild integrationskomponent.
- Validering och förhandsgranskning av förändringar. En avvikande tom leverans får inte tyst radera hela elevregistret.
- Upprepade leveranser ska inte skapa dubletter. Fel köas för kontrollerat omförsök och avstämning, med tydlig källa och senaste lyckade synk.
- Importerade grupper ger aldrig obegränsade administratörsrättigheter utan en uttrycklig, granskad behörighetsmappning.

## 5. Skyddsvärda uppgifter, loggar och mobil användning

Skyddade personuppgifter behöver ett genomgående arbetssätt, inte bara en symbol på elevkortet. Minimering och åtkomstbegränsning måste även gälla sökträffar, exportfiler, felmeddelanden, integrationsköer och aviseringar. IMY beskriver den särskilt höga skaderisken vid röjande. [IMY](https://www.imy.se/verksamhet/dataskydd/dataskydd-pa-olika-omraden/skola-och-forskola/)

Elevhälsans medicinska journaler bör hållas utanför den vanliga administrationens datamängd och behörighetsmodell. Eventuella framtida kopplingar behöver ett eget utrett informationsflöde; rektorsrollen ska inte automatiskt öppna journalinnehåll. Underlaget för den frågan, inklusive vad ett eget medicinskt uppdrag skulle kräva, finns i [Det medicinska uppdraget och andra känsliga delar](medicinska-uppdraget-och-kansliga-delar.md).

Skapa säkerhetshändelser på servern: vem, vilket objekt, vilken åtgärd, vilket uppdrag, tid, resultat och korrelations-ID. Händelser ska inte kunna redigeras av vanliga verksamhetsanvändare. Skydda loggarna separat och erbjud avgränsad export till kommunens säkerhetsövervakning. Bestäm vilka läsningar som loggas utifrån informationsklassning; kopiera inte hela elevhandlingar till loggen.

För telefonen föreslås säker webbinloggning, kommunens tillämpliga enhetsregler, begränsad session och inga elevuppgifter i aviseringarnas förhandsvisning. Börja utan lagring av känsligt elevinnehåll för offlinebruk. Skydda webbsessionen mot skriptangrepp och förfalskade anrop. Filåtkomst behöver samma återkallningsregler som appen; redan nedladdade kopior kan inte dras tillbaka genom utloggning.

## 6. Offentlighetsregistret och allmänna handlingar

Riksdagen beslutade den 26 maj 2026 att offentlighetsprincipen ska gälla även enskilda huvudmän i skolväsendet. Reglerna träder i kraft **1 januari 2027**; arkivlagens regler för enskilda huvudmän träder i kraft 1 januari 2029. Under 2027–2028 får samtliga enskilda huvudmän tillämpa lättnadsregler; därefter bara mindre huvudmän, med gränsen högst 450 barn eller elever (högst 100 barn för huvudman som bara driver förskola, koncern sammanräknad). Lättnaderna gäller handläggningen — svarstid, skyldigheten att hålla handlingar ordnade, och ett bevarandekrav på minst sju år i stället för arkivlagens ordning — inte vilka handlingar som ska lämnas ut. [Prop. 2025/26:191](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/proposition/offentlighetsprincipen-med-lattnadsregler-for_hd03191/html/), [bet. 2025/26:UbU20](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/offentlighetsprincipen-med-lattnadsregler-for_hd01ubu20/)

Det ändrar produktens utgångspunkt. Registret över allmänna handlingar är inte en kommunfunktion som byggs för en pilotkommun, utan en grundfunktion som varje kund kommer att behöva. `organizers.type` ska därför inte avgöra **om** registret finns, bara vilka frister och bevaranderegler som gäller. Storleksgränsen är dessutom rörlig: den kan härledas ur elevregistret, den kan passeras under löpande år, och den ändrar innebörd vid årsskiftet 2028/2029. En hårdkodad inställning per kund kommer att bli fel.

Appen har ingen kund i drift, så januaridatumet är ingen efterlevnadsskyldighet för oss. Det är den tidpunkt då en pilot med enskild huvudman inte längre kan genomföras utan den här funktionen.

### Registerposten är i sig en allmän handling

Allmänna handlingar ska registreras så snart de kommit in eller upprättats, med undantag för handlingar utan sekretess som hålls ordnade och för handlingar av uppenbart ringa betydelse (OSL 5 kap. 1 §). Registret ska visa datum, diarienummer, avsändare eller mottagare, och i korthet vad handlingen rör. Avgörande för konstruktionen är andra stycket: uppgift om motpart och innehåll **ska utelämnas eller särskiljas** när det behövs för att registret i övrigt ska kunna hållas tillgängligt för allmänheten (OSL 5 kap. 2 §).

Registerposten ska alltså kunna visas utan prövning i varje enskilt fall. Den kan därför inte vara en rad med en sekretessflagga, eftersom en sådan rad måste passera en bedömning innan den visas. Posten behöver två skilda uppsättningar fält från början: en offentlig beskrivning som är skriven för att kunna publiceras, och en skyddad beskrivning som aldrig ingår i den publika läsvägen. För elevärenden är särskiljandet normalläget, inte undantaget — en publik post som lyder "Anmälan om kränkande behandling, elev NN, Exempelskolan" är i sig ett röjande.

| Objekt | Innehåll | Läsväg |
|---|---|---|
| Handling | Stabilt ID, typ, originalformat, verklig ankomst- eller upprättandetid, fångsttid, kontrollsumma, filreferens | Intern, enligt uppdrag |
| Registerpost | Datum, diarienummer, offentlig beskrivning, offentlig motpart | Publik |
| Skyddad del av registerposten | Skyddad beskrivning, skyddad motpart, bestämmelse, vem som bedömt | Intern, egen behörighet |
| Ärende | Diarienummerserie, ansvarig funktion, status, avslut | Intern; ärendets identitet publik |
| Begäran om utlämnande | Vad som begärs, mottagningstid, frist, handläggare | Intern, utan sökandens identitet |
| Beslut om utlämnande | Helt, delvis eller avslag, bestämmelse, maskerad kopia, besked och besvärshänvisning | Intern, med publik registrering |
| Handlingstyp | Allmän handling ja/nej, registreras eller hålls ordnad, sekretessprövning, bevarande och gallring | Intern, fastställd version |

### Vad som ska registreras avgörs per typ, inte per objekt

En skolplattform producerar mer material än något diarium kan bära. Lektionsplaneringar, återkopplingar och interna kommentarer är inte handlingar som ska registreras var för sig. Bedömningen måste därför göras i förväg per handlingstyp och fastställas av huvudmannen, inte improviseras av en lärare vid varje sparning.

Den tabellen är en informationshanteringsplan, och den har exakt samma form som beslut appen redan hanterar: versionerad, med utkast, fastställd och ersatt version, händelselogg och åtskillnad mellan den som utformar och den som fastställer. Mönstret finns i `point_plans` och `timplans` och kan återanvändas i stället för att uppfinnas. Ändring i planen får inte tyst byta klassning på redan registrerade handlingar.

### Registreringen ska följa av åtgärden, inte av en extra arbetsuppgift

En handling är upprättad när den expedierats, eller — om den inte expedieras — när ärendet slutbehandlats eller handlingen justerats (TF 2 kap. 10 §). En handling är inkommen när den anlänt till huvudmannen eller nått behörig befattningshavare (TF 2 kap. 9 §).

Det motsvarar tillstånd appen redan har. En poängplan eller timplan som får status `faststalld` är en upprättad handling. Ett fastställt läsår är en upprättad handling. Ett avslutat ärende är en upprättad handling. Registrering bör därför utlösas av den befintliga tillståndsövergången och inte vara ett eget moment som kan glömmas. Utkast registreras inte.

Detta gör serverlagret i avsnitt 7 till ett krav i stället för ett alternativ. Ett diarium vars datum och aktörer skrivs från klienten är inte ett diarium. Att `actor_role` i dag sätts av webbläsaren, som avsnittet *Vad som finns i appen idag* noterar, är en olägenhet för spårbarheten men ett hinder för registreringen.

### Utlämnandet

Den som begär en allmän handling ska få del av den genast eller så snart det är möjligt (TF 2 kap. 15 §), och en begäran om kopia ska behandlas skyndsamt (TF 2 kap. 16 §). Lättnadsregeln ger enskilda huvudmän längre tid — enligt propositionen en rimlig handläggningstid i stället för skyndsam, i storleksordningen en vecka. Den exakta lydelsen behöver läsas i den beslutade författningstexten innan den byggs in som en frist.

Två egenskaper i flödet är ovanliga jämfört med resten av produkten och styr konstruktionen:

- **Sökanden får vara anonym.** Huvudmannen får inte efterforska vem som begär en handling eller varför, utöver vad som behövs för sekretessprövningen (TF 2 kap. 18 §). Mottagningen av en begäran måste därför fungera utan konto, och sökandens identitet får inte lagras som en sökbar uppgift. Kontaktväg lagras bara när sökanden själv lämnat den för leveransen.
- **Sekretessprövningen görs vid begäran, inte i förväg.** En lagrad sekretessmarkering är ingen prövning; den är ett skäl att styra ärendet till någon som får pröva. Modellen får aldrig låta ett sparat `sekretess: true` bli svaret på en begäran.

Ett delvis utlämnande innebär en maskerad kopia. Maskningen måste ske genom omrendrering så att originaltexten inte finns kvar i filens lager eller metadata; en svart ruta ovanpå en PDF är inte en maskning. Den maskerade kopian är en egen handling med egen spårbarhet. Ett avslag ska ge ett skriftligt besked med tillämpad bestämmelse och upplysning om hur beslutet prövas vidare (OSL 6 kap.). Beslutsvägen skiljer sig mellan kommunal och enskild huvudman och behöver kontrolleras mot de nya skollagsreglerna innan flödet byggs.

### Följder för behörighetsmodellen

Registret blir den enda publika läsvägen i hela produkten. I dag kräver varje policy i databasen en inloggad användare, vilket är rätt utgångsläge. Den publika registervyn och mottagningen av en begäran blir två avgränsade undantag, och de behöver prövas som undantag: att de skyddade kolumnerna inte kan nås den vägen är ett testfall, inte en förutsättning.

Rätten att pröva ett utlämnande är den känsligaste behörigheten i systemet, eftersom den som prövar måste kunna se det skyddade innehållet för att kunna avgöra frågan. Den ska vara en egen, namngiven rättighet med egen loggning — inte något som följer med rektorsuppdraget.

Efterforskningsförbudet ger två loggar med olika ändamål. Handläggningsloggen visar vem hos huvudmannen som gjorde vad med ärendet. Den får inte innehålla uppgifter som identifierar sökanden.

### Bevarande

För enskilda huvudmän gäller ett bevarandekrav på minst sju år under lättnadsperioden, och arkivlagen från 2029. För kommunala huvudmän gäller arkivmyndighetens beslut redan i dag. Gemensamt är att bevarande är huvudregeln och gallring ett beslut. En generell raderingsfunktion efter ett visst antal dagar är därför fel konstruktion, och den kan stå i direkt konflikt med en begäran om radering enligt dataskyddsförordningen. Handlingstypstabellen är rätt plats för regeln, och den behöver kunna ange att en handling inte får gallras.

Enskilda huvudmän ska redan i dag lämna över slutbetyg och examensbevis till kommunen, där handlingarna blir allmänna (skollagen 29 kap. 18 §). Den skyldigheten finns kvar och är ett eget exportflöde med krav på fullständighet.

## 7. Supabase och driftvalet

Supabase/Postgres kan vara kvar som kandidat. Supabase dokumenterar SAML för flera identitetsleverantörer och uppmärksammar att e-post inte ska användas som unik användaridentitet. Dokumentationen kräver också e-post i SAML-intyget; detta måste provas mot kommunens attribututlämning, särskilt för elever. Detta verifierar inte i sig full Skolfederationskompatibilitet. [Supabase SAML](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml)

Föreslagen utvecklingsriktning är ett serverlager för kommunanslutningar, skyddsvärda arbetsflöden, exporter och säkerhetsloggning, med fortsatt radnivåskydd i databasen. Direkt klientåtkomst kan vara säker med rätt policyer; ett nytt serverlager hjälper bara om alternativa åtkomstvägar också följer reglerna. Breda tjänstenycklar får inte bli en genväg runt kundisoleringen.

Egen drift är möjlig för Supabase men flyttar driftsansvaret till oss eller kommunen. Det är ett alternativ att utvärdera, inte en redan färdig leveransform. [Supabase om egen drift](https://supabase.com/docs/guides/self-hosting)

Databasregionen är bara en del av behandlingen. Granska också applikationsdrift, filer, säkerhetskopior, övervakning, support, underleverantörer och åtkomst från andra länder. EU-lagring är inte i sig ett besked om att alla dataskyddsfrågor är lösta. Personuppgiftsbiträdesavtal, eventuella tredjelandsöverföringar och skyddsåtgärder behöver bedömas för den faktiska leveransen. [GDPR, bland annat artiklarna 28, 32 och kapitel V](https://eur-lex.europa.eu/eli/reg/2016/679/oj/swe)

Före verklig användning behövs kommunens informationsklassning och bedömning av behovet av konsekvensbedömning. IMY anger att konsekvensbedömning krävs vid sannolik hög risk och normalt ska göras före behandlingen. Planera för en sådan bedömning här, med kommunen som ansvarig för beslutet. Bevarande och gallring behöver följa beslutade regler, inte en generell radera-efter-X-dagar-funktion. [IMY om konsekvensbedömning](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/konsekvensbedomning/nar-ska-en-konsekvensbedomning-genomforas/)

Driftunderlaget behöver även ange incidentkontakter, återställningstid, högsta accepterade dataförlust, provade säkerhetskopior, hantering av sårbarheter och export/avveckling vid avtalslut. Säkerhetskrav på leverantören behöver kunna visas med testresultat och rutiner.

## Föreslagen genomförandeordning

1. **Kartlägg en pilotkommun:** identitetsleverantör, register och schema, integrationernas dokumentation, informationsägare, skyddskrav och driftkrav. Bestäm första begränsade användningsfall.
2. **Bygg säkerhetsgrunden:** separera demo från produktion, verifierad etablering av kund, riktiga identiteter, flera medlemskap, tidsbegränsade uppdrag, serverkontroller och avgränsning till rätt skolenhet.
3. **Prova hela kontolivscykeln:** inloggning, tilldelning, ändring, spärr och gamla sessioner. Lägg till säkerhetsloggning och driftövervakning.
4. **Anslut ett registerflöde med syntetiska data:** börja med läsning, jämför resultat, pröva fel och återhämtning. Lägg till skrivning först när informationsansvaret är fastställt.
5. **Bygg registret över allmänna handlingar:** handlingstyper som fastställt beslut, registrering ur befintliga tillståndsövergångar, publik registervy, mottagning av begäran utan konto och handläggning med frist och beslut. Klart före 1 januari 2027 om en enskild huvudman ska kunna vara pilot.
6. **Pröva pilotberedskapen:** dataskyddsunderlag, avtal, behörighetsgranskning, återställningsprov och oberoende säkerhetstest. Besluta om verkliga data utifrån resultaten.

## Acceptansfall som gör kraven prövbara

| Försök eller händelse | Förväntat resultat |
|---|---|
| Rektor på skola A försöker tilldela lärare på skola B utan uppdrag där. | Nekas via både gränssnittets väg och ett direkt API-anrop. |
| HM försöker använda lärartilldelning utan separat mandat. | Nekas enligt ansvarsfördelningen; tekniska undantag är uttryckliga och spårbara. |
| Användare från kommun A anger ett känt objekt-ID från kommun B. | Innehåll, filer, sökträffar och existensuppgifter lämnas inte ut. |
| Ett uppdrag löper ut under en redan öppen session. | Nästa skyddade anrop nekas; även export och filhämtning prövas. |
| Kommunen spärrar kontot. | Åtkomst upphör inom överenskommen och uppmätt tidsgräns, inklusive gamla sessioner. |
| Någon skriver en annan skolas organisationsnummer i registreringsflödet. | Ingen rätt att företräda organisationen uppstår. |
| En skyddad elev ingår i en sökning eller export utan rätt behörighet. | Skyddade uppgifter och röjande metadata lämnas inte ut. |
| Samma personnamn/e-post förekommer hos två kommuner. | Ingen automatisk kontosammanslagning eller överföring av rättigheter. |
| En synk körs två gånger eller levererar oväntat noll elever. | Inga dubletter eller tysta massraderingar; avvikelsen blir synlig. |
| Ett integrationscertifikat byts eller en integration stängs av. | Kontrollerad rotation respektive stopp utan påverkan på andra kommuner. |
| Kunden återställs från säkerhetskopia. | Data, rättigheter och efterföljande spärrar återställs säkert och prövas före öppning. |
| En poängplan eller timplan fastställs. | En registerpost skapas med beslutets datum och ett diarienummer; ett utkast skapar ingen post. |
| Den publika registervyn läses utan inloggning, direkt mot datalagret. | Datum, diarienummer och offentlig beskrivning lämnas ut; skyddad beskrivning, skyddad motpart och underliggande handlingar kan inte nås den vägen. |
| En begäran om utlämnande lämnas av någon utan konto. | Begäran tas emot, får frist och handläggs utan att sökandens identitet lagras eller efterfrågas utöver sekretessprövningen. |
| En handling med sekretessmarkering begärs ut. | Markeringen styr ärendet till prövning; den är i sig inget avslag. |
| Ett delvis utlämnande beslutas. | Maskningen är omrendrerad så att originaltexten inte kan återvinnas ur filen, och den maskerade kopian registreras som egen handling. |
| Ett avslag beslutas. | Skriftligt besked med tillämpad bestämmelse och upplysning om hur beslutet prövas vidare. |
| En elevärendepost registreras. | Datum och diarienummer visas publikt; elevens namn och ärendets innehåll särskiljs enligt OSL 5 kap. 2 § andra stycket. |
| En enskild huvudman passerar 450 elever, eller året blir 2029. | Fristerna och bevarandereglerna byter profil av sig själva; ingen kundinställning behöver ändras för hand. |
| Diarienummer tilldelas vid samtidiga skrivningar och efter återställning från säkerhetskopia. | Serien är obruten per huvudman och år, utan dubbletter eller luckor. |

Det viktigaste att inhämta härnäst är namnet på en pilothuvudman och kontakt med dess verksamhetsansvariga och IT-/säkerhetsfunktion. Det gör att vi kan bygga mot en verklig anslutningsprofil utan att hårdkoda produkten för bara den kunden. Valet av kommunal eller enskild huvudman styr ordningen: en enskild huvudman har ett bestämt datum att förhålla sig till, en kommun har en färdig arkiv- och utlämnandeorganisation att bygga mot.
