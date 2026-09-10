# Arkitektur för en stegvis säker ombyggnad

**Projekt:** Skolplattformen, v1.0 — säker administration inför pilot  
**Undersökt:** 2026-09-10  
**Tillförlitlighet:** MEDEL — förslaget bygger på aktuell kodkartläggning och verifierad teknikresearch; pilotkund, identitetsanslutning, registerkontrakt och drift är ännu öppna. Inga nya körprov ingår här.

## Rekommenderad riktning

Vidareutveckla den befintliga appen som en gemensam applikation med tydliga moduler. Behåll React-vyerna, domänmodellerna och Postgres. Lägg verifierad identitet, aktuella uppdrag, avgränsade serveroperationer och beständig elevlagring bakom befintliga arbetsflöden. Gymnasiets utbildningar, innehållstillägg, planversioner och kopiering till nästa elevkull är utgångspunkt för regressionsprov. [Projektbeslut](../PROJECT.md), [teknikval](STACK.md)

Gå igenom appen per arbetsuppgift: dokumentera dagens beteende, markera vad som fungerar respektive saknar lagring eller skydd, och ersätt den berörda datavägen i en sammanhängande leverans. Varje sådan leverans omfattar vy, behörighet, lagring och prov. Undvik en separat total omskrivning av gränssnittet innan säkerhets- och datamodellen fungerar.

## Nuläge och förändringsgränser

Nuläget återges från [kodkartläggningen](../codebase/ARCHITECTURE.md) och [riskbilden](../codebase/CONCERNS.md). Filreferenserna anger integrationspunkter, inte en fullständig ny kodrevision.

| Del | Hantering i milstolpen | Konkret förändring och bevarande |
|---|---|---|
| Utbildningar, poängplaner, timplaner, läsår och kullkopiering | **Bevara arbetsflöde; anpassa åtkomst** | Behåll modeller, versioner, stabila ID:n och klasskopplingar. Pröva samma gymnasieuppgift efter varje berörd förändring. Kullkopiering skapar upplägg och utkast; den flyttar inga elever. |
| `organisation-workspace.tsx`, `timplan-view.tsx`, `lasar-view.tsx` | **Återanvänd vyer** | Ersätt klientvald auktoritet med verifierad arbetskontext. Ändra bara presentation där nya tillstånd, fel eller rättigheter kräver det. |
| `page.tsx` och `AdminState` | **Refaktorera ansvar stegvis** | Behåll navigation, urval och formulärutkast. Flytta elevregistrets sanningskälla till beständig lagring; demodata får en uttrycklig separat väg. |
| `organisation-store.ts`, `planning-store.ts`, `cohort-store.ts` | **Anpassa lagringsgräns** | Behåll användbara kontrakt mot vyerna. Flytta operationer som behöver atomiska ändringar eller säkerhetslogg till avgränsade kommandon. Undvik dubbel skrivning under övergången. |
| `supabase.ts`, `signInDemo`, `profiles` och befintliga policyer | **Bygg om säkerhetsgrunden** | Separera demoetablering från pilot; inför verifierad session, medlemskap, uppdrag och spärr. Migrera faktiskt installerade funktioner och rättigheter. |
| Skolverkets skoluppslag | **Bevara separat adapter** | Uppdatera skolfakta enligt källa och bevara lokalt rektorsuppdrag. Ett uppslag bevisar varken kundföreträdarskap eller elevregisteranslutning. |
| Elevlagring, källreferenser, importkörningar och säkerhetslogg | **Nya komponenter** | Inför relationer med giltighet, kontrollerade skrivregler och spårbar behandling. Koppla till den befintliga adminvyn. |
| Undervisnings- och ärendeexempel utanför piloten | **Bevara avskild demonstration** | Märk deras status tydligt; sessionsdata får inte framstå som sparade pilotuppgifter. |

## Komponentgränser

```text
Kommunens identitetskälla → Auth-anslutning → verifierad användarsession
                                               ↓
React-arbetsytor → klientadapter → skyddade Worker-rutter
                                      ↓
                           identitet + aktuellt uppdrag
                                      ↓
                  avgränsade läsningar/verksamhetskommandon
                                      ↓
              Postgres: rättigheter, relationer, transaktioner, audit
                                      ↑
Elevkälla → serveradapter → validering → avstämning → importkommando
```

Befintliga direkta Supabase-anrop är en ytterligare ingång under ombyggnaden. Alla kvarvarande ingångar ska följa samma behörighetsregler; ingen får ge mer data eller kringgå obligatorisk loggning.

| Komponent | Äger | Kommunikation och gräns |
|---|---|---|
| Presentation och klientadapter | Navigation, skolval, urval, utkast, spar-/felstatus | Hämtar endast tillåtna data och uppdrag. Ett valt kund- eller skol-ID är en begäran om arbetskontext. |
| Identitet och kontolivscykel | Godkänd anslutning, kontokoppling, spärr och sessionskontroll | Supabase Auth enligt [STACK.md](STACK.md); katalogprovisionering hålls skild från elevimport. Ingen ny allmän identitetsplattform krävs. |
| Behörighetsmodul | Aktuellt medlemskap, uppdrag, skola, tillåten handling och relevant relation | Samma specificerade tillåt/neka-matris styr API, DB-operationer och deras prov. Ingen klientskriven roll används som bevis. |
| Organisations- och planeringsmodul | Huvudman, skola, utbildningsupplägg, planer, läsår och klasser | Återanvänder befintliga modeller och ID:n. Huvudman utser rektor; behörig rektor tilldelar lärare på sin skola. |
| Elevmodul | Elev/person inom kundgränsen, placering, klasstillhörighet, källa och visningsregler | Samma validerade verksamhetsoperationer används av adminflöde och integration; aktör och skrivansvar kan skilja. |
| Integrationsmodul | En vald anslutning, externa ID:n, körningsstatus och avstämning | Hämtar servervägen; validerar före ändring. Maskinidentitet får avgränsat mandat för anslutningens kund och objekt. |
| Spårbarhet och drift | Verksamhetshistorik, säkerhetshändelser, återställnings- och avvecklingsunderlag | Loggarnas åtkomst och livscykel är egna rättigheter. Verksamhetsadmin får inte automatiskt incidentutredarens åtkomst. |

Lägg nya HTTP-rutter under befintliga `web/app/api/`. Samla serverkod för exempelvis behörighet, elever, integration och audit under en tydlig serverkatalog, exempelvis `web/lib/server/`; den får inte följa med i klientpaketet. Behåll användbara `*-model.ts` som rena domänfunktioner och klientadaptrar i nuvarande struktur. Detta är föreslagna moduler, inga mappar har skapats. Schemaändringar fortsätter i befintlig migrationskedja.

## Identitet och informationsmodell

Begreppen nedan är en rekommenderad logisk modell; tabellnamn låses vid fasplanering.

| Begrepp | Betydelse och avgränsning |
|---|---|
| Kundmiljö, `tenant` | Plattformens åtkomst- och anslutningsgräns. En pilot kan mappa en kund till en huvudman, men det gör inte kund-ID till organisationsnummer, skol-ID eller IdP-tenant. |
| Huvudman/ansvarig organisation | Verksamhetsorganisation med identifierad ansvarsfördelning. Befintliga `organizer_id` behöver en uttrycklig koppling till kundmiljön vid migrering. |
| Skolenhet | Verksamhetsenhet under huvudman, med internt ID och extern skolenhetskod. Skolans registeruppgifter skapar inga konton eller uppdrag. |
| Användarkonto och extern identitet | Internt konto kopplat till godkänd anslutning, utfärdare och stabilt subjekt. E-post och namn är attribut. Kontolänkning och byte av IdP behöver egna verifierade regler. |
| Medlemskap och uppdrag | Kopplar konto till kund/organisation och ett tidsbegränsat verksamhetsmandat, ofta vid viss skola. Stöd flera uppdrag utan att slå ihop deras befogenheter. |
| Elev/person | Beständig verksamhetsidentitet skild från personalens inloggningskonto. Bevara intern identitet vid skolbyte inom kundgränsen; skapa ingen global personkatalog som automatiskt förenar olika kunder. |
| Placering och klasstillhörighet | Egna relationer med start, slut och källa. Elevens personpost upphör inte för att en placering avslutas. Klass, läsår, årskurs och utbildningskull har olika betydelser. |
| Extern källreferens | Kund + anslutning/källsystem + objekttyp + externt ID → internt objekt. Personnummer eller e-post ska inte vara enda matchningsnyckel. |

Databasen ska förhindra relationer över fel kundgräns och fel skolkontext, även vid felaktigt integrationskommando. En klasstillhörighet måste exempelvis referera till tillåten elevplacering och klass vid samma skola. Modellera giltighet och explicit tillåtna undantag innan importer skrivs. Fältens exakta skydd och skoladministratörens/lärarens mandat beslutas i rättighetsmatrisen. [Funktionslandskap](FEATURES.md)

**Skrivansvar är ett eget kontrakt:** ange auktoritativ källa per objekt/fält, möjlig lokal rättelse, konfliktregel och betydelsen av borttagning. Källstyrda fält visas som sådana i adminvyn; en lokal korrigering får inte tyst förloras i nästa import. Skyddsmarkering och ursprung ska följa behandlingen. Osäker matchning eller skyddstolkning går till avvikelsehantering.

## Skydd som måste gälla vid varje ingång

Rekommendera användarens verifierade session även i API:ts DB-anrop, enligt [STACK.md](STACK.md). Kontrollera aktuellt medlemskap, spärr, giltigt uppdrag och målobjektets kund/skola vid skyddade operationer. Skapa serverklient per begäran. Återkallning ska prövas med gammal token; mät källans leveransfördröjning separat från appens lokala spärr.

Grants, RLS, vyer och körbara SQL-funktioner måste granskas tillsammans. Supabase dokumenterar att grants och radpolicyer har olika uppgifter, att vyer kan kringgå RLS och att privilegierad tjänsteåtkomst kan göra detsamma. En anonymt inloggad demoanvändare använder dessutom rollen `authenticated`; att bara neka databasrollen `anon` stänger därför inte demoåtkomsten. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

**Föreslaget pilotmönster:** avgränsade databasoperationer för elevläsning och ändring, med samma behörighet, minimerade svar och obligatorisk audit även om de anropas direkt via Supabase. Råa elevtabeller och alternativa vyer får ingen direkt API-väg som kringgår detta. Det första vertikala provet ska fastställa schemaexponering, grants och funktionsägarskap. Om likvärdigt skydd inte kan visas ska elevvägen göras serverexklusiv med avgränsad serveridentitet före fortsatt leverans. En generell tjänstenyckel för all användartrafik är inget godkänt substitut.

Använd `security invoker` där det räcker. En eventuell `security definer`-funktion kräver begränsad ägare och körbehörighet, säker `search_path` samt explicit kontroll av verklig aktör och målobjekt. RLS får inte antas skydda ett anrop som körs med förbikopplande rättigheter. Skyddet måste gälla även direkta funktionsanrop med manipulerade parametrar. [Supabase databasfunktioner](https://supabase.com/docs/guides/database/functions)

Krav på helt serverlagrad session är ett separat teknikbeslut: enligt [STACK.md](STACK.md) skulle det också flytta kvarvarande direkta klientanrop bakom servern. Undvik delad cache för elevsvar; rensa relevant klienttillstånd vid utloggning och kontextbyte. Prova sökning, räknare, export och eventuella filer som delar av samma informationsgräns.

## Tre centrala dataflöden

### 1. Personal arbetar med en elev

1. Godkänd identitetsanslutning identifierar personen; appen hämtar aktuella medlemskap och uppdrag.
2. Personen väljer skola. Servern verifierar valet och returnerar endast tillåtet elevurval och tillåten visningsidentitet.
3. Elevkortet visar källa, giltighet och sparstatus. Ändring erbjuds bara där appen har skrivansvar.
4. Ett kommando validerar identitet, uppdrag, målobjekt, indata och förväntad version. Verksamhetsändring och tillhörande ändringshändelse sparas atomiskt; versionskonflikt ger ett begripligt besked.
5. Vyn visar det faktiskt sparade resultatet. Sessionsutkast får inte ersätta misslyckad lagring med skenbar framgång.

### 2. En registerleverans blir avstämd elevinformation

```text
Kundbunden anslutning → hämta leverans → validera fullständighet/format
  → normalisera och matcha → jämför med beslutat skrivansvar
  → visa/stanna vid avvikelse → tillämpa kontrollerade ändringar
  → avstäm resultat → markera senaste lyckade körning
```

Beständig körningsstatus ska omfatta källa, kontraktsversion, leverans-/körnings-ID, position, fel och resultat. Säkerställ upprepbar tillämpning med idempotensnycklar och hantering av äldre leveranser. En ofullständig eller oväntat tom leverans får inte radera elevbeståndet. Återstart ska kunna skilja redan genomförda ändringar från återstående arbete. Rådata minimeras och får beslutad lagringstid.

Börja med en läsande adapter och de objekt/fält piloten väljer. Skolverkets skoluppslag, personalens kontoprovisionering och elevregistret är tre skilda flöden med olika auktoritet. Testleverantören använder samma normaliserade kontrakt som den kommande riktiga adaptern. **Ett godkänt syntetiskt kontraktsprov visar intern funktion; verklig kommunacceptans kräver vald motpart, tilldelad åtkomst och prov mot dess faktiska leverans.**

### 3. En händelse går att utreda

Härled aktör, uppdrag, kund, objekt, handling, tid och resultat i betrodd exekvering; ta inte klientens `actor_role` som fakta. Håll verksamhetshistorik, säkerhetshändelser och importstatus åtskilda med gemensamma referenser. Logga nödvändiga läsningar/exporter vid den kontrollerade datautlämningen, även för tillåtna direkta RPC-anrop.

Lyckad ändring och ändringshändelse hör ihop i transaktionen. Nekade eller misslyckade försök behöver en loggväg som överlever att verksamhetstransaktionen avbryts; pröva detta också för direkta databasförsök. Ange när loggfel ska stoppa utlämning och hur loggbortfall upptäcks. Adminvyn visar begriplig historik och integrationsstatus inom användarens mandat; råa elevpayloads hör inte hemma i allmän felloggning. [Risker och loggkrav](PITFALLS.md)

## Byggordning och bevis

Ordningen avser rekommenderade arbetsområden, inte redan beslutade fasnummer.

| Ordning | Leverans | Beroende och bevis |
|---|---|---|
| 1 | **Gå igenom befintliga arbetsflöden och sätt pilotgränsen** | Dokumentera bevara/ändra/senare per arbetsuppgift. Kör aktuella grundprov och gymnasiets referensflöde. Ange pilotens öppna kundbeslut, informationsansvar och syntetiska provfall. |
| 2 | **Verifierad identitet, uppdrag och en skyddad operation** | Ersätt demoetableringen på pilotvägen. Prova två kunder, två skolor, giltighet, lokal spärr, manipulerade ID:n och direkta DB-anrop. Bevara rektors-/läraransvaret. Loggning ingår från denna leverans. |
| 3 | **Beständigt elevregister i befintlig adminvy** | Kräver säkerhetsgrunden och beslutad intern modell. Leverera först sökning → elevkort → tillåten ändring → omläsning, därefter placering och klassrelation. Bevisa skyddat elevfall, källa, historik och samtidighetskonflikt. |
| 4 | **En avstämd registerintegration** | Kräver stabila ID:n, skrivansvar och elevoperationer. Prova dubblettleverans, radfel, tom leverans, delvis fel, återstart, skolbyte och avslut. Leverantörens verkliga prov återstår om endast simulator finns. |
| 5 | **Sammanhängande pilotberedskap** | Prova adminarbete på dator/telefon, återkallning, incidentutredning, återställning inklusive spärrar, kundexport och avveckling. Kundens informationshantering, drift och avtal behöver vara beslutade före verklig användning. |

Kontakt med pilotkund, IdP och registerleverantör kan löpa parallellt från början. Ett tidigt kompatibilitetsprov i byggd Worker avgör om valt authspår fungerar; hela elevmilstolpen ska inte byggas på ett obevisat sessionsantagande. Befintliga utbildnings-, plan-, kull- och klassflöden provas vid varje berörd övergång.

För varje förändrat arbetsflöde bör GSD-planen innehålla aktuellt nuläge, önskat beteende, berörda datavägar, migrering, återgång och användarprov. Lägg till nya strukturer först, mappa befintliga ID:n, stäm av resultat, växla en dataväg och avveckla den gamla efter bevis. Återgång får inte öppna demoåtkomst eller gamla överbehörigheter. Detta gör ombyggnaden möjlig att granska och använda fortlöpande.

## Drift, avgränsningar och fortsatt research

Pilotvolymen motiverar gemensam kodbas, Postgres och beständiga importjobb. Mät paginerad elevsökning, behörighetskontroller, transaktionstid och importavstämning mot överenskommen volym. Lägg till separat jobbkonsument eller större driftkapacitet när mätningen kräver det; använd inte hypotetiska användarantal som skäl för mikrotjänster.

Separat databas per kund är ett möjligt driftbeslut, men skol- och uppdragskontroller behövs ändå. Provad återställning måste omfatta relationer, eventuella filer, rättigheter och integrationsposition. Pilotens informationshantering kan ansluta till befintligt diarium eller fastställd överlämning. En publik diarietjänst eller automatisk registrering av varje appstatus ingår inte som generellt arkitekturkrav; se den primärkällsgranskade bedömningen i [PITFALLS.md](PITFALLS.md).

Fördjupa vid fasplanering: faktisk IdP och kontolänkning; direkt DB-åtkomst kontra audit; kundens rättighetsmatris och skyddsfall; första elevkällans ID-/raderingssemantik; driftens återställning och spärrfördröjning. Dessa är öppna kontrakt och verifieringsfrågor, inte redan lösta leverantörsfunktioner.

## Källor och tillförlitlighet

| Underlag | Användning och säkerhet |
|---|---|
| [PROJECT.md](../PROJECT.md), 2026-09-10 | HÖG för dokumenterade användarbeslut och omfattning. |
| [Kodarkitektur](../codebase/ARCHITECTURE.md), [kodrisker](../codebase/CONCERNS.md), 2026-09-10 | MEDEL för återanvänt nuläge; riktade kod- och körprov krävs i respektive fas. |
| [STACK.md](STACK.md), [FEATURES.md](FEATURES.md), [PITFALLS.md](PITFALLS.md), 2026-09-10 | Återanvänder deras primärkällor och avgränsningar. MEDEL för projektets designförslag; skilj dokumenterat leverantörsstöd från oprövad integration. |
| [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) och [databasfunktioner](https://supabase.com/docs/guides/database/functions), återlästa 2026-09-10 | HÖG för uttryckligen dokumenterade säkerhetsmekanismer. Verifierar grants/policyer, anonym autentisering, förbikoppling och funktionsprivilegier; bevisar inte appens nuvarande skydd. |

Arkitekturen ovan är en projektrekommendation med MEDEL tillförlitlighet. Inga nya paket, appändringar, anslutningar eller produktionsbesked har skapats i denna research.
