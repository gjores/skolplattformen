# Teknikval för säker administration inför pilot

**Projekt:** Skolplattformen, befintlig React/Supabase-app  
**Undersökt:** 2026-09-10  
**Samlad tillförlitlighet:** MEDEL — nuläge och dokumenterade funktioner är verifierade; kommun, IdP, avtal, produktionsdrift och anslutningsprov är öppna.

## Rekommenderat huvudspår

Behåll React, TypeScript, befintliga modellfunktioner och Supabase/Postgres. Inför en godkänd identitetsanslutning genom Supabase Auth, aktuella medlemskap/uppdrag i databasen och ett smalt serverlager i befintliga Worker-rutter för elevadministration, integrationer, exporter och säkerhetshändelser. Det bevarar utbildningsflödena och undviker en parallell dataplattform.

Välj protokoll efter pilotens faktiska IdP. Prova direkt OIDC om kommunen erbjuder detta; använd direkt SAML om kommunen kräver SAML och provningen godkänns. Inför en extern identitetsförmedlare först när ett konkret krav inte kan uppfyllas direkt. Supabase har numera egna OIDC-leverantörer: förslaget får inte bygga på den äldre föreställningen att endast inbyggda sociala leverantörer och SAML finns. [Supabase OIDC](https://supabase.com/docs/guides/auth/custom-oauth-providers)

Detta är en rekommendation för nästa implementation. Inga paket installerades, inga tjänster anslöts och inga befintliga molninställningar verifierades genom inloggning.

## Verifierad befintlig stack

Versionerna nedan är både låsta i `web/package-lock.json` och närvarande i `web/node_modules` vid undersökningen. De är **inte** påståenden om senaste eller säkerhetsgodkänd version.

| Teknik | Installerat/låst | Rekommendation för milstolpen |
|---|---|---|
| React, React DOM, React Server DOM Webpack | 19.2.8 | Behåll tillsammans; bevara fungerande vyer och modeller. |
| Vinext | 1.0.0-beta.9 | Behåll för utvecklingen; pröva auth, routing, cookies och cache i byggd Worker före pilot. |
| Vite | 8.2.2 | Behåll låsfilens kombination med Vinext. |
| TypeScript | 5.9.3 | Behåll; komplettera genererade DB-typer med validering av externa indata. |
| `@supabase/supabase-js` | 2.115.0 | Behåll; installerad Auth-klient innehåller `custom:`-leverantörer och PKCE i `signInWithSSO`. |
| Cloudflare Vite-plugin / Wrangler | 1.54.4 / 4.129.0 | Återanvänd befintlig Worker-miljö för HTTP-gränser. |
| Supabase Auth, Postgres, Storage | Molntjänster; serverversion ej fastställd | Behåll som kandidater. Lås faktisk miljökonfiguration och DB-version i pilotens driftbeslut. |
| Node.js | Paketkrav `>=22.13.0` | Byggverktygets krav; Workers är appens runtime. Detta bevisar inte att Node-specifika bibliotek fungerar i Workers. |

`web/lib/supabase.ts` har idag en klient med beständiga sessioner och automatisk förnyelse. `signInDemo` använder anonym autentisering och `bootstrap_demo_profile`. Inför en explicit demogräns och ta bort produktionsanropbar självutdelning av huvudmannarättigheter. Att bara radera en gammal migrationsfil tar inte bort en redan skapad funktion: produktionsvägen behöver verifierad migration, rättighetsindragning och miljökonfiguration.

Vinexts aktuella officiella README beskriver produktions- och kompatibilitetsluckor. Att appen importerar `next/*` betyder därför inte att varje Next.js-authrecept fungerar oförändrat. Kör kompatibilitetsprovet på de faktiskt låsta versionerna; en generell ramverksmigration ingår inte i detta förslag. [Vinext](https://github.com/cloudflare/vinext)

## Identitetsalternativ och beslutskriterier

| Alternativ | Dokumenterat stöd | Bedömning för denna app |
|---|---|---|
| Supabase Custom OIDC | Discovery via issuer-URL och `custom:`-identifierare. | **Förstahandsprov när kommunen har OIDC.** Minst ingrepp i befintlig Auth/UUID/RLS-kedja. Lås godkänd issuer och anslutning; verifiera stabil identitet och kontolänkning. [OIDC](https://supabase.com/docs/guides/auth/custom-oauth-providers) |
| Supabase Azure-leverantör | Kommunens specifika Entra-tenant kan konfigureras; standarden `common` är bredare. Giltig e-post och `email`-scope krävs. | Bra för en uttryckligen vald Entra-pilot. Tillåt rätt tenant och applikation, inte alla Microsoft-konton. [Azure](https://supabase.com/docs/guides/auth/social-login/auth-azure) |
| Supabase SAML 2.0 | Projekt-SSO på Pro och högre; e-post krävs; SAML-konton identitetslänkas inte. SLO stöds enligt aktuell dokumentation inte. | **Förstahandsprov när SAML krävs.** Använd explicit provider-ID. Avsaknad av e-post eller krav på federerad utloggning kan fälla valet. SSO för Supabase-dashboarden är en annan funktion. [SAML](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml) |
| WorkOS + Supabase | Supabase har uttrycklig tredjepartsintegration; Directory Sync levererar katalogändringar genom händelser/webhooks. | Reservval när hanterad kundanslutning och flera katalogleverantörer motiverar ytterligare tjänst och avtal. Identiteter och befintliga UUID-relationer kräver en migrationsanalys; behandla inte externa `sub` som givna Supabase-UUID:n. [Supabase/WorkOS](https://supabase.com/docs/guides/auth/third-party/workos), [Directory Sync](https://workos.com/docs/directory-sync) |
| Keycloak som broker framför Supabase OIDC | SAML/OIDC-brokering finns. Dokumentationskatalogen visar 26.7.3; SCIM infördes som preview i 26.7. | Reservval vid krav på egen drift eller särskild federation. Kräver separat driftansvar och prov av hela sessionskedjan. Basera inte pilotens kritiska avveckling på SCIM-preview. [Keycloak](https://www.keycloak.org/docs/latest/server_admin/index.html), [versioner](https://www.keycloak.org/documentation), [SCIM-status](https://www.keycloak.org/docs/26.7.0/release_notes/) |

**HÖG tillförlitlighet för dokumenterade funktioner; MEDEL för valet mellan dem.** Ett framtida brokerbeslut omfattar även support, nyckelrotation, användarmigrering och drift, inte bara en inloggningsknapp.

Skolfederation kräver ett eget anslutningsarbete. Följ tjänsteleverantörens anslutningsprocess och aktuell teknisk profil; pröva metadata, tillit, attribut, certifikatbyte och testmiljö. Ett lyckat SAML-anrop till Supabase bevisar inte Skolfederationskompatibilitet. Äldre formulering i `docs/backend-supabase.md` om att nästa steg är Skolfederation eftersom Supabase stöder SAML ska inte användas som ett färdigt integrationsbesked. [Skolfederation för tjänsteleverantörer](https://skolfederation.se/kom-i-gang-for-tjansteleverantorer/)

## Servergräns och sessioner

**Rekommenderad första implementation:** behåll Supabase-klientens användarsession och skicka användarens access-token till appens skyddade API. API:t verifierar identiteten, kontrollerar aktuellt medlemskap/uppdrag och använder användarens behörighet vid databasåtkomst. Skapa serverklient per anrop; återanvänd inte den befintliga modulglobala klienten för flera användares sessioner.

| Gräns | Konkret regel |
|---|---|
| Webbläsare | Bara publik projektadress/nyckel och användarens session. Rollväljare och `getSession()` är inte behörighetsbevis. Ingen integrationshemlighet. |
| Worker-API | Verifierad token, avgränsad åtgärd, aktuell DB-behörighet, validerade indata och serverhärledd aktör. Låt inte klienten bestämma tenant eller loggens aktör. |
| Postgres/RLS | Läs aktuella medlemskap och tidsbegränsade uppdrag. Kontrollera skolenhet/relation och kundgräns även vid direkta API-anrop. JWT-signaturens giltighet ersätter inte denna kontroll. |
| Privilegierad integration | Separat maskinidentitet och serverhemlighet per anslutning. Använd avgränsade operationer. En tjänstenyckel som kringgår RLS är inte vanlig användaråtkomst. |

RLS och grants ska införas tillsammans. Känsliga läsningar som måste loggas eller transformeras genom API:t får inte samtidigt ha en direkt klientväg som kringgår detta. Välj uttryckligen mellan likvärdigt skydd på alla vägar och en serverexklusiv dataväg; en ny endpoint stänger inte den gamla vägen. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

**Återkallning:** Supabase-sessioner är som standard långlivade, och utloggning gör inte en redan utfärdad JWT kryptografiskt ogiltig före dess utgång. Inför serverlagrad spärr och kontroll av aktuella medlemskap vid varje skyddad operation. Vid utloggning/sessionindragning behöver även sessionens status kontrolleras där omedelbar indragning krävs. Prova samma gamla token efter spärr, avslutat uppdrag och utloggning. Kortare tokenliv är ett komplement. Sätt kundens tidsgränser efter krav, inte genom ett godtyckligt tal i roadmapen. [Sessioner](https://supabase.com/docs/guides/auth/sessions), [signOut](https://supabase.com/docs/reference/javascript/auth-signout)

**Kontokoppling:** Supabase dokumenterar automatisk OAuth-länkning på samma e-postadress. Därför kräver OIDC-spåret ett explicit prov av kollisioner, alternativ inloggningsmetod och issuerbyte. Modellera extern identitet som godkänd anslutning + utfärdare + stabilt subject, kopplad till appens interna person och medlemskap. Kräv verifierad koppling till aktuell inloggningsväg; förekomst av en tidigare länkad identitet räcker inte. Stäng övriga inloggningsvägar i den avgränsade pilotmiljön. [Identitetslänkning](https://supabase.com/docs/guides/auth/auth-identity-linking)

### När helt serverlagrad session behövs

Om kundens krav utesluter läsbara access-/refresh-token i webbläsaren: välj en BFF med ogenomskinlig `HttpOnly`, `Secure`-cookie och serverlagrad session. Då måste även befintliga direkta Supabase-anrop flyttas bakom servern. Det är en faktisk utökning av arbetet med sessionslager, CSRF-skydd, förnyelse och transportadapter; UI/modellfunktioner kan behållas.

`@supabase/ssr` är **inte installerat** och är inget krav för rekommenderat första spår. Välj det bara om delad cookie-session/SSR behövs. Dess standardmönster gör inte automatiskt token otillgängliga för webbläsaren. Aktuell dokumentation beskriver cachehuvuden från version 0.10.0; använd en verifierad version med detta stöd och bevara huvudena. Pröva `Set-Cookie`, förnyelse och två samtidiga användare mot faktisk CDN/Worker; autentiserade svar ska inte delas i cache. [SSR-guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide)

## Provisionering och en registerintegration

SCIM 2.0 är en **separat serverintegration för kontolivscykel**, inte ett inloggningsprotokoll eller elevregister. Börja med en intern provisioneringsfunktion för skapa, ändra, spärra och återaktivera medlemskap. Kör syntetiska leveranser mot den tills pilotens katalogval är känt. Om kunden använder Entra SCIM implementeras och prövas dess dokumenterade profil: stabila externa ID:n, sökning/filter, `PATCH`, paginering, `active=false`, återleverans och eventuella grupper. Använd WorkOS Directory Sync om flera leverantörsvarianter motiverar en köpt adapter. [Microsoft SCIM](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups)

Microsoft anger normalt omkring 40 minuter mellan inkrementella provisioneringscykler. Skilj därför mellan **spärr i appen stoppar nästa anrop** och **tid från källkatalogens ändring till appens spärr**. Avtala och mät den senare; lägg en lokal administrativ spärrväg för brådskande indragning. Kataloggrupp får bara ge en på förhand godkänd behörighetsmappning, inte fritt huvudmannauppdrag. [Microsoft SCIM](https://learn.microsoft.com/en-us/entra/identity/app-provisioning/use-scim-to-provision-users-and-groups)

För elevregistret: använd en serveradapter med validering, ursprungs-ID, explicit skrivansvar, beständig importstatus och avstämning. Välj SS 12000 där motparten stöder rätt delmängd. SIS anger 2024 som senaste utgåva, med informativ användarstödsbilaga som ändring från föregående utgåva. Läs leverantörens faktiska kontrakt innan typer eller klient genereras; ett versionsnummer bevisar inte vilka resurser leverantören stödjer. [SIS](https://www.sis.se/delta-och-paverka/tksidor/tk400499/sistk450/ss-12000/)

## Begränsade tillägg och verktyg

| Tillägg | Version/status | Användning |
|---|---|---|
| Zod | Rekommenderad huvudversion 4; exakt patch låses vid implementation | Validera egna API-kontrakt och normaliserade importobjekt. Dokumentationen kräver TypeScript 5.5+ och strict mode; projektets TS-version räcker. Ersätter inte granskning av leverantörens schema. [Zod](https://zod.dev/) |
| Supabase-migrationer + genererade DB-typer | Finns redan | En ägare av schemaändringar; behåll SQL och befintliga typflöden. Inför ingen ORM i denna milstolpe. |
| pgTAP via Supabase CLI | Föreslaget teststöd; installerad CLI/extension ej verifierad | Tillåt/neka-matris för kund, skolenhet, uppdrag och spärr; kör i isolerad syntetisk testdatabas. [RLS-testning](https://supabase.com/docs/guides/database/postgres/row-level-security) |
| Beständig importkö | Börja med Postgres-jobbtabell; Supabase Queues/PGMQ är ett senare alternativ | Spara jobbstatus och idempotens i databasen. Lägg separat konsument när asynkrona importer behövs; en kö ersätter inte idempotenta verksamhetsskrivningar. [Supabase Queues](https://supabase.com/docs/guides/queues) |

Inga installationskommandon körs i researchen. Nästa fas låser tillagda paketversioner i en granskad ändring efter kompatibilitetsprov; ingen allmän uppgradering av nuvarande paket behövs för att påbörja identitetsarbetet.

## Vad som inte ska införas nu

| Undvik | Använd i stället |
|---|---|
| Egen SAML-parser, signaturvaliderare eller hemmabyggd JWT-översättning | Dokumenterad Auth-provider/broker och verifierad sessionskedja. |
| Ny authleverantör enbart för att appen behöver OIDC | Prova befintliga Supabase-funktioner först. |
| Behörighet i redigerbar metadata, e-postdomän eller UI-roll | Serverhanterade medlemskap, uppdrag och verifierad extern identitet. |
| Generell `service_role` för all API-trafik | Användarens kontext och RLS, avgränsade serveroperationer för systemarbete. |
| Redis/BullMQ, mikrotjänster eller extra databas för en enda registerimport | Befintlig Postgres, avgränsad adapter och beständig jobbhantering. |
| Helt egen kommunal drift som implicit följd av öppen källkod | Separat driftprov och ansvarsfördelning om kunden kräver det. |

## Avgränsat teknikprov före slutligt val

1. **Kontrakt:** dokumentera en vald eller syntetisk IdP, förväntade attribut, stabila identiteter, MFA-krav, sessionsregler och kontots avvecklingskälla. Utan kund finns endast ett simulerat kontrakt, ingen verifierad kommunanslutning.
2. **Vertikalt authprov:** en tillåten identitet, en otillåten och två identiteter med samma e-post. Pröva återinloggning, tokenförnyelse, fel issuer/tenant, gammal token efter spärr och certifikat-/nyckelbyte. MFA i kommunens IdP får inte antas motsvara Supabase `aal2` utan belägg i just den använda kedjan.
3. **Serverprov:** visa att en rektor når rätt skolenhet, nekas annan skolenhet och förlorar åtkomst när uppdraget avslutas, både genom UI och direkta anrop. Kör två användare samtidigt i byggd Worker och verifiera att sessioner och cache inte blandas.
4. **Integrationsprov:** repetera en syntetisk registerleverans, ändra och spärra ett konto, leverera en avvikande tom fil samt avbryt och återuppta import. Mät fördröjning och visa avstämningsresultat.
5. **Beslutsresultat:** godkänn direkt Supabase-spår eller ange exakt blockerande krav och valt reservspår. Dokumentera testbevis, kvarvarande kundberoenden, tillkommande driftkostnader och återställningsplan. Detta gör identitetsvalet till en avgränsad tidig aktivitet, inte ett eget obegränsat plattformsprojekt.

## Källvärdering och återstående osäkerhet

- **HÖG:** lokala paket, klientkod och konfiguration; dokumenterade protokollfunktioner från Supabase, Microsoft, Keycloak och Skolfederation.
- **MEDEL:** rekommenderad kombination och beräknad enkelhet; inga nya körprov ingick i denna research.
- **ÖPPET:** kommun/IdP, Skolfederationsanslutning, anslutningsattribut, upstream-spärrfördröjning, registerkontrakt, support-/driftavtal, produktionsregioner och acceptabel tokenlagring.

Primärkällorna ovan lästes 2026-09-10. Supabases lanseringsartikel är daterad 2026-04-08; dess äldre gräns på tre egna providers skiljer sig från aktuell dokumentation (tre på Free, obegränsat på Pro+). Aktuell produktdokumentation har företräde. [Lanseringsartikel](https://supabase.com/blog/custom-oauth-oidc-providers)

Context7-verktyg och lokal `ctx7` saknades. Förbudet mot paketinstallation behölls; dokumentationen kontrollerades direkt hos leverantörerna. Underlaget återanvänder `.planning/PROJECT.md`, `web/package.json`, `web/package-lock.json`, `web/lib/supabase.ts`, `web/vite.config.ts`, `docs/kommunintegration-och-sakerhet.md` och `docs/backend-supabase.md`. Äldre rättsliga designpåståenden i underlagsdokumenten används inte som grund för teknikval här.
