# Fas 3 — mandatflöden, skyddade datavägar och fasgrind (lokalt, syntetiskt)

Intern teknisk dokumentation från plan 03-07. Detta är inte användarhandbok (den finns i `docs/handbok/`). Dokumentet är heller inget godkännande av verklig drift, av en verklig IdP eller av någon kommunanslutning.

Allt nedan gäller den återskapade lokala provmiljön: protected-målet `skolplattform-pilot-protected` (API 127.0.0.1:56321) med lokal Keycloak (`http://host.docker.internal:8180/realms/skolplattform-test`) och baseline-målet `skolplattform-pilot-baseline`. Endast syntetiska data och syntetiska testkonton används.

## Status i klartext

| Nivå | Status |
|---|---|
| Implementation | Klar för fasens sex krav (ACL-02–05, AUDIT-02–03) i lokal provmiljö |
| Automatiskt syntetiskt bevis | Fasgrinden `verify:phase3` gav **PASS** 2026-09-26 14:42–14:58 UTC på revision `7d4ec8d` |
| Användarens granskning (checkpoint 03-07) | Återstår |
| Fasverifiering (`gsd-verify-work`) | Återstår. Kraven är inte markerade som verifierade i REQUIREMENTS.md |
| Verklig drift, verklig IdP, kommunanslutning, verklig lagringstid | Inte prövat och inte påstått |

## Fasgrinden

Kommando: `cd web && npm run verify:phase3` (Node 25). Rapport: `work/pilot/results/phase3-summary.json`.

- Revision `7d4ec8db7495db53f0b288ad1dc4582aeea7202e`
- Källfingeravtryck `sha256:9cdfec5b6dfe…0a9`, oförändrat under körningen
- Totalstatus **PASS**, inga valideringsfel

| Steg | Resultat |
|---|---|
| node25, mål-protected, mål-baseline, preview-lås | PASS |
| modeller | PASS, 281 modell-/serverprov |
| grind-unit | PASS, 39 prov (grind, fas 2-grind, collect-denials) |
| typkontroll, lint, lint-pilot | PASS |
| normalt-bygge, protected-bygge | PASS. Det skyddade bygget är märkt med revisionen ovan |
| docs-bygge | PASS |
| sql | PASS, 10 filer och 540 prov |
| api-isolering | PASS |
| baslinje-db | PASS: utbildning och kurs-/nivåtillägg, kullkopiering, klass–timplan med fast version, grundskolans timplan |
| access-api | PASS, 16 fall |
| mandat-api | PASS, 25 fall och 130 kontroller |
| källbevis | PASS: REST, RPC, Storage och direkt SQL; avbrott för Kong, Storage och Postgres; 10 källhändelser |
| fas1-browser | PASS, 26 fall. 1 avsiktligt hopp: pekytor mäts bara i telefonprojektet |
| fas2-fixturer | PASS (TOTP-återställning, se nedan) |
| fas2-browser | PASS, 37 fall. 19 avsiktliga projekthopp |
| fas3-fixturer | PASS |
| fas3-arbetsyta-browser | PASS, 9 flöden × dator och telefon = 18 |
| fas3-mandat-browser | PASS, 12 flöden × protected-desktop, protected-phone och protected-built = 36 |
| källstabilitet | PASS |

Kravtabellen i rapporten: ACL-02, ACL-03, ACL-04, ACL-05, AUDIT-02 och AUDIT-03 är PASS. Det betyder att kravets egna bevissteg och hela grinden var PASS i samma körning. Det är syntetiskt automatiskt bevis, inte fasverifiering.

### Ändrad hoppregel för regressionsbrowsern

Fas 1- och fas 2-specarna hoppar avsiktligt över vissa fall i vissa projekt, till exempel devfall i byggd Worker. Grindens tidigare krav på noll hopp gick därför aldrig att uppfylla. `validateRegressionReport` godtar nu bara hopp med ett redovisat skäl ur `DESIGNED_SKIPS`. Ett fall som inte kördes efter ett fel (seriellt beroende) saknar skäl och ger FAIL. Antalet hopp stäms av mot rapportens statistik. Fas 3-mandatspecen får inga hopp alls.

## Mandatbrowsern (`web/e2e/phase3-mandates.spec.ts`)

Körs i de befintliga protected-projekten: protected-desktop (1440×900) och protected-phone (iPhone 13) mot protected-devservern, samt protected-built mot byggd Worker. Specen använder riktig OIDC-inloggning mot den lokala Keycloak, med engångskod där servern kräver den. Grinden kör specen separat med JSON-rapport via `PLAYWRIGHT_JSON_OUTPUT_NAME` och räknar titel × projekt, inte bara exitkoden.

| Flöde | Bevis utöver skärmen |
|---|---|
| huvudman utser rektor | Bara rektor erbjuds. Utnämning för skola 12 och avslut. `principal_appointed` och `assignment_ended` är committade. Inga elevnamn i nätverket |
| rektor ger och avslutar läraruppdrag | Rektor finns inte bland mottagarna. `mandate_granted`/`assignment_ended` committade, och mottagaren har inget giltigt mandat efter avslutet |
| elevhälsa med skolscope | Skolans två elever, ingen export (403). Främmande elev ger 404 |
| elevhälsa med elevscope | Exakt den tilldelade eleven. Annan elev i samma skola ger 404 och syns inte i nätverket |
| elevhälsa med ärendescope | Ingen lista, elev endast via ärendet. Direkt elev-ID och annat ärende ger 404 |
| rektor godkänner support som upphör vid sluttid | Godkännare, syfte och sluttid (±2 min från 15 minuter). Kortad sluttid i databasen ger tömd vy och 403, och kortet försvinner hos rektor |
| IT pausar och provar anslutning utan elevinsyn | Pausa, test nekat vid paus, aktivera och test. `connection_update`/`connection_test` committade. Elevvägar ger 403, och elevprovet saknas i menyn |
| granskaren följer elevläsning, export och nekande | Lärarens läsning (korrelation från svarshuvudet), nekad främmande elev och administratörens export syns i loggvyn. CSV-exporten innehåller båda korrelationerna men inga elevnamn. `log_exported` committad |
| tangentbord och fältfel i tilldelningen | Fokus flyttas in i dialogen och stannar där vid Tab. Fält får `aria-invalid`/`aria-describedby`. Serverns krav på engångskod visas utan att inmatningen tappas. Esc återför fokus till knappen |
| pekytor är minst 44 px på telefon | Mandatlista, tilldelnings- och avslutsdialog samt lärarens elevprov i telefonkontext, efter öppningsanimationen. Ingen sidledes rullning |
| utloggning rensar andra flikar | Andra fliken låses och töms. Session och elevväg ger 401 |
| nätverkssvar innehåller inga främmande elever | Lärare, administratör och elevhälsa (elev och ärende) med direkta anrop mot främmande ID. Administratörens CSV och rektorns tilldelningsurval |

Fixturer: `node work/pilot/phase3-browser-fixtures.mjs --target protected`. För 03-07 tillkom kontona `p3.elevhalsa.skola`, `p3.elevhalsa.elev` och `p3.granskare`. Lösenorden slumpas och ligger bara i `work/pilot/targets/protected/idp/phase3-users.json` (gitignorerad, 0600).

Specen skapar tillfälligt en elev utan grupp och ärende i skola 11 och tar bort den efteråt. Mottagarens (Pia Provmottagare) kvarvarande uppdrag avslutas före och efter körningen.

## Rättade fel som proven hittade

1. **Fas 2:s OTP-inloggning.** Fas 2:s OTP-inloggning fastnade med "Autentiseringskoden är ogiltig". `anna.admin` hade en TOTP-uppgift i den återskapade IdP:n (skapad 2026-09-25 15:02 UTC, utan etikett, alltså inte av browserhjälparen). Den sparade hemligheten i `totp-users.json` hörde till en tidigare registrering.

   `work/pilot/phase2-otp-fixtures.mjs --target protected` tar bort TOTP-uppgifterna för de fem syntetiska fas 2-kontona (`anna.admin`, `bertil.granskare`, `david.admin-b`, `erik.utan`, `hanna.tva`). Skriptet sätter `CONFIGURE_TOTP`, loggar ut deras IdP-sessioner och tar bort deras sparade hemligheter. Browserprovet registrerar sedan en ny hemlighet. Realmens OTP-policy, step-up-flödet och serverns MFA-krav är oförändrade. Grinden kör fixturen före `fas2-browser`.

   Följd: den som manuellt har registrerat `anna.admin` i en autentiseringsapp måste registrera om kontot.
2. **Tilldelningsdialogens fokus.** Fokus blev kvar på knappen bakom dialogen. Standardfokus var stängknappen, som döljs medan urvalet hämtas. Nu flyttas fokus till dialogen med `initialFocus`.
3. **Säkerhetsloggens svarsordning.** Loggvyn hämtade om vid varje omritning och visade svaret från den hämtning som råkade bli klar sist. Ett äldre svar för ett annat filter kunde därför skriva över listan, och exportbekräftelsen försvann. Nu visas bara svaret på den senast startade hämtningen.
4. **Sessionskontroll vid återkomst.** En annan begäran som fick 401 eller ny epok avbröt sessionskontrollen, och vyn blev kvar i *Öppnar arbetsytan*. Felet var intermittent: 2 av 3 körningar på dator före rättelsen. Kontrollen görs nu om, högst tre gånger. Därefter visas inloggningen.
5. **Fas 2-provet för verifieringsrutan** väljer nu rutan med knappen. Två annonserade rutor gav en krock i strikt läge.

## Avgränsningar och öppna beslut

- **Elevhälsoansvarigs egen elevinsyn** är ett öppet verksamhetsbeslut. Nu har funktionen ingen egen elevläsning och ser inga elever i tilldelningsurvalet.
- **Osparad tilldelning efter verifiering.** En osparad tilldelning återställs inte efter step-up-omdirigeringen. Handboken ber användaren verifiera först. Om formuläret ska återställas är ett öppet beslut.
- **Felkod för support före starttid.** Support före starttid får felkoden `assignment_expired` (deferred-items punkt 1). Behörigheten är rätt, men meddelandet är missvisande. Webbens tilldelning startar alltid support "från nu", så fallet uppstår inte i UI:t.
- **Syfte för support.** Supportens syfte är i provmiljön fast `synthetic-troubleshooting`. Verkliga syften och tidsgränser är inte beslutade.
- **Telefon.** Telefonbeviset är WebKit i iPhone-storlek i Playwright. En fysisk telefon når inte den lokala miljön, eftersom issuer och preview är bundna till den här datorn. Att göra den nåbar kräver ett separat beslut, till exempel om Keycloak på LAN.
- **Sessionsbevis i API-proven** mintas lokalt. Den riktiga OIDC-kedjan visas bara av browserproven mot den lokala test-IdP:n.
- **Lagringstid.** Den syntetiska gallringen är 30 dygn. Verklig lagringstid är ett kundbeslut.
