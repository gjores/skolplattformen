# Beredskap för BankID inför fas 2

Datum: 2026-09-13. Status: riktad kod- och plangranskning, inte implementerad eller verifierad BankID-anslutning. Konfidens: hög för lästa kod-/planfynd; medel för framtida integrationskostnad, som beror på vald anslutning.

## Bedömning

**Fas 2 har en användbar grund. Komplettera några små servergränser och prov innan genomförandet; bygg inte BankID-integrationen nu.** Det är en rekommendation utifrån beläggen nedan. Ingen större omläggning av kund-, medlemskaps- eller uppdragsmodellen framstår som nödvändig för denna beredskap. Det är däremot inte bevisat att en framtida BankID-anslutning blir enbart ett konfigurationsbyte.

Användarens beställning gäller beredskap, inte full integration. D-01–D-18 i `02-CONTEXT.md` behålls: lokal test-IdP, Workern som OIDC-klient, Supabase som registreringsreferens och aktuellt mandat per anrop. BankID-todon omfattar också senare verksamhets-, dataskydds- och säkerhetsbeslut; dessa är inte verifierade lagkrav. [VERIFIED: `.planning/phases/02-verifierad-konto-tkomst/02-CONTEXT.md`; `.planning/todos/pending/2026-09-13-planera-stark-identitetskontroll-och-bankid.md`]

## Vad som finns, vad som är planerat

| Område | Belägg före komplettering (planbas 4cf20b8) | Bedömning |
|---|---|---|
| Befintlig fas 1 | `web/lib/supabase.ts:14` skapar ingen klient; `web/lib/runtime-mode.ts:24` stänger protected; karantänmigrationen `20260911120000_quarantine_demo_access.sql:22` återkallar klientroller. [VERIFIED: kod] | Bra avskiljning, men ingen verklig identitets-/BankID-funktion att återanvända ännu. |
| Stabil intern identitet | `02-02-PLAN.md:144` anger issuer+subject, internt UUID, separat auth_user_id-referens och unik extern identitet; medlemskap pekar på internt ID. [VERIFIED: plan] | Behåll. Inget nytt personregister eller generell länktabell behövs nu. |
| Inloggning och extra verifiering | `02-03-PLAN.md:233` binder step-up till samma externa identitet och aktiv session; task 2 lagrar acr/amr/auth_time. [VERIFIED: plan] | Bra grund; komplettera bindning till ursprunglig kontext och revisionsnummer för kontexten. |
| Aktuella rättigheter | `02-06-PLAN.md`, task 2, prövar låst session, medlemskap, uppdrag och epok i samma transaktion; `02-07` och `02-08` använder samma skydd. [VERIFIED: planer] | Bevara helt separat från identitetsbeviset. |
| Spårbarhet | `02-05`, säkerhetshändelser; `02-06`, task 2, ändring och händelse atomiskt; `02-08`, task 1, kundavgränsad logg/export. [VERIFIED: planer] | Komplettera vilken verifieringspolicy och bevisålder som faktiskt användes. |

Tabellen beskriver planinnehåll, inte körda fas 2-prov. Denna granskning körde inga app- eller databasprov.

## Minsta förberedelser nu

Alla åtgärder i tabellen är granskningsrekommendationer, härledda från angivna planfynd. De är inte nya rättsliga krav.

| Prioritet / plan | Konkret lucka | Minsta ändring och verifiering |
|---|---|---|
| 1 — 02-03 | Callbacken gör direkt GoTrue-anrop med `provider: 'keycloak'` (`02-03:287`). | Lägg leverantörsregistreringen bakom en liten serverfunktion. Endast dagens Keycloak-väg implementeras; bevara att misslyckad GoTrue-registrering nekar enligt D-16. Callbacken arbetar vidare med verifierad extern identitet och internt ID. Ingen dynamisk pluginmotor. |
| 1 — 02-06 | `MfaPolicy`/`hasMfaProof` använder globala ACR-/AMR-värden (`02-06:130`); identitetsutfärdaren ingår inte i regeln. | En betrodd lokal profil binder exakt issuer och klient/audience till tillåtna claims och policyversion. Samma sträng `2`/`otp` från annan utfärdare får inte automatiskt ge samma resultat. Pröva okänd issuer, fel audience och okänd profil. |
| 1 — 02-03/04/06 | Samma person/session räcker inte för att upptäcka kontextbyte medan verifieringen pågår. | Bind step-up-state till session, identitet, ursprunglig kund/medlemskap/uppdrag och context_epoch, inklusive null-kontext för första inbjudan. Vid callback: verifiera mot låsta aktuella värden, neka bytt/spärrad/utgången kontext; tilldela inga rättigheter. Prova byte i annan flik, replay och fel person. |
| 1 — 02-06/07/08 | `mfa: true` kan senare feltolkas som bevis på verklig identitetsnivå eller ett visst beslut. | Behåll nuvarande administrativa MFA-krav men namnge det som autentiseringskrav. Separera uppgifter om autentiseringssätt, verifieringstid och framtida styrkt identitetsnivå; den senare är inte fastställd i testmiljön. Ingen automatisk uppgradering till ”BankID-verifierad”. |
| 2 — 02-05/06/09 | Loggkontraktet visar aktör/uppdrag men inte explicit vilken verifiering som användes för den skyddade åtgärden. | Spara minimal serverhärledd evidence-/policyreferens, policyversion och verifieringstid/resultat i avgränsade loggfält. Återanvänd befintlig skyddad logg. Prova att klientpåståenden ignoreras, loggfel ger rollback och token/råclaims/personnummer inte hamnar i logg/export. |
| 2 — 02-03/09 och anslutningsdokumentation | Stabil issuer+subject betyder inte att samma person får samma nyckel efter leverantörsbyte. | Dokumentera framtida kontomigrering/länkning som separat verifierad och loggad rutin. Bevara internt ID och historik. Prova nu att samma e-post/auth_user_id eller nytt issuer+subject inte ärver medlemskap; länka inte automatiskt. |

Framtida/ogiltig `auth_time` och maxålder är **redan** uttryckligen nekade i preciseringen till `02-06`, task 1. Det är inget nytt fynd. Bevara provet och låt glidande sessionsförnyelse aldrig förnya autentiseringstid. [VERIFIED: `02-06-PLAN.md:122`; `02-03-PLAN.md`, sessionens förnyelsekontrakt]

En lyckad extra verifiering ska återföra användaren till arbetsflödet, utan att automatiskt skicka om en känslig POST. Ett nytt anrop måste fortfarande passera ordinarie aktuella mandat- och kontextkontroller. Detta är en granskningsrekommendation för det befintliga `protectedRoute`-mönstret, inte beställning av en ny generell åtgärdsmotor.

## Teknisk grund och begränsningar

OIDC anger `iss` och `sub` som stabil extern identitetskombination. `acr` beskriver autentiseringskontext, `amr` använda metoder och `auth_time` autentiseringstid. `max_age` kan begära ny autentisering och kräver då `auth_time` i ID-token. Dessa claims behöver tolkas och kontrolleras enligt överenskommet leverantörskontrakt; de ersätter inte appens uppdragskontroll. [CITED: [OpenID Connect Core, §2, §3.1.2.1, §3.1.3.7 och §5.7](https://openid.net/specs/openid-connect-core-1_0.html)]

BankID skiljer identifiering från underskrift. Den direkta identifieringsvägen har en order och status hämtas via `/collect`; det är därför ett annat integrationskontrakt än den planerade OIDC-callbacken. [CITED: [BankID auth](https://developers.bankid.com/api-references/auth--sign/auth), [BankID underskrift](https://www.bankid.com/foretag/tjansten/underskrift)]

**Arkitekturbedömning:** BankID bakom en framtida OIDC-förmedlare kan återanvända mer av nuvarande flöde om identitets-, claims-, registrerings- och utloggningskontrakten verkligen matchar. En direkt integration behöver en ny adapter och egna prov för order, avbrott, klientflöden och säker identitetskoppling. Varken stödet hos en ännu ej vald förmedlare eller dess kompatibilitet med GoTrue är verifierat här. D-01:s mål om enkelt leverantörsbyte ska inte användas som garanti för alla BankID-alternativ.

## Vad som väntar

Följande hör till fortsatt utredning/nytt beslutat leveransomfång:

- Val mellan direkt BankID och förmedlare; faktisk anslutning, test- och driftförutsättningar, avtal och certifikathantering.
- Verifierad länkning mellan befintligt personalkonto och ny extern identitet. Ingen automatisk koppling via namn, e-post eller klientinskickat personnummer.
- Bevis för en specifik känslig handling: bindning till åtgärd, objekt, beslutsunderlagets version, kund/uppdrag, kort giltighet och engångsanvändning. Nuvarande sessions-MFA är inte ett sådant beslutsbevis.
- Elektronisk underskrift, dokumentformat, verifiering och bevarande av underskriftsunderlag. Inloggning eller en vanlig säkerhetsloggrad benämns inte underskrift.
- Krav per känsligt flöde, alternativ för den som saknar BankID och avbrottshantering utan att sänka skyddet. Granska med verksamhet/dataskydd/säkerhet och prova hela flödet med syntetiskt material.

Listan är rekommenderad avgränsning som följer användarens BankID-todo. Inga nya paket, personnummerfält, BankID-knappar, BankID-adaptrar eller generella policymotorer föreslås i fas 2.

## Granskningens omfattning och överlämning

Läst: projektvägledning, PROJECT/STATE, fas 2:s CONTEXT och relevanta avsnitt i RESEARCH, plan 02/03/05/06/07/08/09, fas 1:s klient-/lägeskod och karantänmigration samt BankID-todon. Aktuella primärkällor kontrollerade 2026-09-13. BankID:s utvecklarsidor ger begränsad text vid direkt hämtning; deras officiella sökindex och officiella tjänstbeskrivning användes för de begränsade API-/begreppspåståendena. Context7 fanns inte som MCP; CLI-försöket misslyckades med DNS-felet ENOTFOUND för npm-registret. Inga biblioteksversioner eller nya paket rekommenderas här.

**Överlämning:** Planägaren bör föra in förberedelserna i berörda befintliga uppgifter och valideringskarta samt granska motsägelser i äldre pseudokod/grep-kontroller. Nya negativa kontroller ska vara körbara vid fas 2-genomförandet. Denna fil intygar ingen genomförd planändring eller godkänd körning; de redovisas separat av orkestratorn.


## Slutligt planresultat 2026-09-13

Förberedelserna är införda i plan 02-01–04 och 02-06–12 samt valideringskartan. Fyra nya filer planeras: `web/lib/server/identity-provider.ts`, `web/lib/identity-provider.test.mjs`, `web/lib/auth-assurance.ts` och `web/lib/auth-assurance.test.mjs`. Befintliga 12 planer, 32 uppgifter och 11 vågor behålls.

Oberoende gsd-plan-checker har godkänt de ändrade planerna utan kvarstående blockerare eller åtgärdskrävande varningar inom granskningsområdet. Strukturkontroller och kommandokartan passerar. Genomförandet ska behålla uppgiftsgränserna och stoppande spiken i den större planen 02-03. Resultatet är granskad beredskapsplanering; ingen ny appkod eller faktisk integration är byggd. BankID-todon är fortsatt öppen för de senare leveranserna ovan.
