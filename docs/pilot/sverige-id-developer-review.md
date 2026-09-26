# Sverige-id: tekniskt underlag för utvecklare

Granskat 2026-09-26. Avgränsad dokument- och kodgranskning, ingen anslutning eller fullständig kompatibilitetsverifiering. Underlaget hör till intern utvecklingsdokumentation.

## Officiella ingångar

- [Polisen: anslutning](https://polisen.se/samverkan/sverige-id-forlitande-parter/sa-har-ansluter-ni/) anger Sweden Connect och OpenID Connect som inledande anslutningsväg. Auktorisationssystemet är för närvarande avsett för offentliga aktörer, inte privata.
- [Polisen: tekniska frågor](https://polisen.se/samverkan/sverige-id-forlitande-parter/kontakt-och-vanliga-fragor/) anger att anslutning i nuläget är möjlig för myndigheter från 1 december och att något pilotprojekt inte erbjuds. Appkraven anges till Android 12 eller iOS 16 och senare. Detta fastställer inte vår eller en viss kunds anslutningsrätt.
- [OpenID Connect Profile for Sweden Connect](https://docs.swedenconnect.se/technical-framework/latest/OpenID_Connect_Profile_for_Sweden_Connect.html), version 1.0, 2024-12-04, är den tekniska profil som Polisen länkar till. Profilen bygger också på The Swedish OpenID Connect Profile; dess underliggande krav måste granskas separat.

## Konkreta profilkrav

Enligt Sweden Connect-profilens avsnitt 2.3.1 tillåts `private_key_jwt` eller, efter bilateralt avtal, mTLS som klientautentisering. En vanlig klienthemlighet räcker alltså inte vid direkt anslutning.

Avsnitt 3 rekommenderar `prompt=login` och signerade Request Objects. Klientmetadata ska innehålla kontaktadress, klientnamn på svenska och engelska samt HTTPS-adresser till logotyp och webbplats.

Avsnitt 2.2 begränsar återanvändning av inloggning mellan tjänster; IdP-sessionens gräns på 60 minuter är inte automatiskt appens sessionsgräns. Avsnitt 2.3 begränsar personinformation i access tokens och utlämnande av identitetsattribut.

Profilversionen specificerar inte metadataförmedling eller signaturtjänster. Den är därför inte ensam ett komplett driftsättningskontrakt.

## Jämförelse med befintlig kod

Granskad fil: `web/lib/server/oidc.ts`.

| Observation i appen | Utvecklingsarbete att planera |
| --- | --- |
| `oidcConfig()` använder `ClientSecretPost` | Välj direkt anslutning med stödd nyckelautentisering eller en förmedlare som uppfyller profilen på den externa sidan. En förmedlare är ett förslag, inte verifierad Sverige-id-kompatibilitet. |
| Kodflöde med PKCE S256, state och nonce finns | Återanvänd grunden men kör full profilgranskning och negativa protokollprov. |
| En konfigurerad utfärdare och lokal tillitsprofil används | Bestäm kundvis förmedling eller separata utfärdarprofiler. Ingen generell tillit till valfri extern IdP. |
| `prompt=login`, `max_age=0` och begärd ACR används vid extra verifiering | Definiera vanlig inloggning och extra verifiering för den nya leverantören, inklusive färskhetskontroll och avvisande av otillräcklig tillit. |
| `iss`, `sub`, `acr`, `amr` och `auth_time` tas emot; scopes är `openid profile email` | Fastställ exakt attributkontrakt och verifierad identitetskoppling. Befintliga fält visar beredskap, inte att Sverige-id redan fungerar. |

## Arbetslista inför implementation

1. Fastställ vem som är förlitande part: kommun, annan behörig kund eller leverantör. Bekräfta avtalsväg även för fristående huvudmän innan tekniskt alternativ väljs.
2. Begär eller lokalisera godkända test- och produktionsmetadata: issuer, discovery, registrering, redirect-adresser, nycklar och rotationsrutiner. Inga adresser eller testkonton har verifierats i denna granskning.
3. Gör en kravmatris för både Sweden Connect-profilen och dess underliggande profil: MUST/SHOULD, kodställe, konfiguration och provresultat. Kontrollera särskilt algoritmer, tokenkryptering, klientnycklar, begärda attribut och felhantering; detta underlag avgör inte de ännu ogranskade detaljerna.
4. Utforma kontolänkning med verifierad identitet och rätt utfärdare. E-post eller namn får inte ensamt länka konton. Sverige-id ska aldrig automatiskt skapa skolmandat eller vårdnadshavarrelationer.
5. Prova felaktig issuer/audience, utgångna och återspelade svar, fel state/nonce, nekad inloggning, för låg tillit, gammal autentisering och nyckelrotation. Vid förmedling ska tillit och ursprung bevaras utan att lokala standardvärden höjer tillitsnivån.
6. Prova telefon och dator, återgång från e-legitimationsappen, avbrott och alternativ inloggning. Undvik råa tokens och personuppgifter i felsökningsloggar.

## Preliminär bedömning

Appens befintliga OIDC-flöde ger en relevant grund. Direktanslutning kräver åtminstone ändrad klientautentisering och en leverantörsspecifik tillits- och attributprofil. Utvärdera anslutning genom kundens identitetsförmedlare parallellt med direktanslutning. Valet beror på anslutningsrätt och verifierat tekniskt kontrakt, inte bara protokollnamnet OIDC.

Ingen implementation, verklig anslutning eller godkänd testmiljö följer av denna granskning. Följ upp via `.planning/todos/pending/2026-09-26-utred-sverige-id-och-integration.md`.
