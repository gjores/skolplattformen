# Fas 3 — mandatflöden, skyddade datavägar och fasgrind (lokalt, syntetiskt)

Intern teknisk dokumentation från plan 03-07. Detta är inte användarhandbok (den finns i `docs/handbok/`). Dokumentet är heller inget godkännande av verklig drift, av en verklig IdP eller av någon kommunanslutning.

Allt nedan gäller den återskapade lokala provmiljön: protected-målet `skolplattform-pilot-protected` (API 127.0.0.1:56321) med lokal Keycloak (`http://host.docker.internal:8180/realms/skolplattform-test`) och baseline-målet `skolplattform-pilot-baseline`. Endast syntetiska data och syntetiska testkonton används.

## Status i klartext

| Nivå | Status |
|---|---|
| Implementation | Klar för fasens sex krav (ACL-02–05, AUDIT-02–03) i lokal provmiljö |
| Automatiskt syntetiskt bevis | Fasgrinden `verify:phase3` gav **PASS** 2026-09-27 11:43–12:13 UTC på revision `278f235`, efter rättning av användarprovets tre avvikelser. En körning före denna, på `4fb5773`, gav FAIL i access-api (se nedan) |
| Användarens granskning (checkpoint 03-07) | Första provet 2026-09-26/27 godkändes inte (tre avvikelser, rättade). Förnyat prov godkänt 2026-09-27 (syntetiskt användarprov, dator; telefon i enhetsläge/automatiskt WebKit, ingen fysisk telefon eftersom stacken bara nås på localhost) |
| Fasverifiering (`gsd-verify-work`) | Återstår. Kraven är inte markerade som verifierade i REQUIREMENTS.md |
| Verklig drift, verklig IdP, kommunanslutning, verklig lagringstid | Inte prövat och inte påstått |

## Fasgrinden

Kommando: `cd web && npm run verify:phase3` (Node 25). Rapport: `work/pilot/results/phase3-summary.json`.

- Revision `278f235bd8c915d5a33fab26e2f4f1a9f6f970bb`
- Källfingeravtryck `sha256:33ac730e55fe…4123`, oförändrat under körningen
- Totalstatus **PASS**, inga valideringsfel

Körningen före, på `4fb5773` (11:13–11:42 UTC), gav **FAIL**. Steget access-api fick HTTP 500 i fallet `mfa-kravs`. Därefter gav alla följande fall `fetch failed`, eftersom provets egen Worker på port 3013 slutade svara. Samma prov fristående direkt efteråt gav 16/16. Felet ändrade ingen kod. access-api sparar nu Workerns utskrift privat i `work/pilot/targets/protected/logs/` (278f235), och i nästa hela körning var steget PASS. Orsaken till stoppet är inte fastställd (deferred-items punkt 2 och 6).

| Steg | Resultat |
|---|---|
| node25, mål-protected, mål-baseline, preview-lås | PASS |
| modeller | PASS, 305 modell-/serverprov |
| grind-unit | PASS, 39 prov (grind, fas 2-grind, collect-denials) |
| typkontroll, lint, lint-pilot | PASS |
| normalt-bygge, protected-bygge | PASS. Det skyddade bygget är märkt med revisionen ovan |
| docs-bygge | PASS |
| sql | PASS, 10 filer och 565 prov |
| api-isolering | PASS |
| baslinje-db | PASS: utbildning och kurs-/nivåtillägg, kullkopiering, klass–timplan med fast version, grundskolans timplan |
| access-api | PASS, 16 fall |
| mandat-api | PASS, 26 fall och 139 kontroller (nytt fall `support-groups`) |
| källbevis | PASS: REST, RPC, Storage och direkt SQL; avbrott för Kong, Storage och Postgres; 10 källhändelser |
| fas1-browser | PASS, 26 fall. 1 avsiktligt hopp: pekytor mäts bara i telefonprojektet |
| fas2-fixturer | PASS (TOTP-återställning, se nedan) |
| fas2-browser | PASS, 37 fall. 19 avsiktliga projekthopp |
| fas3-fixturer | PASS |
| fas3-arbetsyta-browser | PASS, 9 flöden × dator och telefon = 18 |
| fas3-mandat-browser | PASS, 15 flöden × protected-desktop, protected-phone och protected-built = 45 |
| källstabilitet | PASS |

Kravtabellen i rapporten: ACL-02, ACL-03, ACL-04, ACL-05, AUDIT-02 och AUDIT-03 är PASS. Det betyder att kravets egna bevissteg och hela grinden var PASS i samma körning. Det är syntetiskt automatiskt bevis, inte fasverifiering.

### Ändrad hoppregel för regressionsbrowsern

Fas 1- och fas 2-specarna hoppar avsiktligt över vissa fall i vissa projekt, till exempel devfall i byggd Worker. Grindens tidigare krav på noll hopp gick därför aldrig att uppfylla. `validateRegressionReport` godtar nu bara hopp med ett redovisat skäl ur `DESIGNED_SKIPS`. Ett fall som inte kördes efter ett fel (seriellt beroende) saknar skäl och ger FAIL. Antalet hopp stäms av mot rapportens statistik. Fas 3-mandatspecen får inga hopp alls.

## Mandatbrowsern (`web/e2e/phase3-mandates.spec.ts`)

Körs i de befintliga protected-projekten: protected-desktop (1440×900) och protected-phone (iPhone 13) mot protected-devservern, samt protected-built mot byggd Worker. Specen använder riktig OIDC-inloggning mot den lokala Keycloak. Konton med registrerad engångskod anger koden vid inloggningen; inloggningshjälparen redovisar vilka Keycloak-steg som faktiskt visades. Grinden kör specen separat med JSON-rapport via `PLAYWRIGHT_JSON_OUTPUT_NAME` och räknar titel × projekt, inte bara exitkoden.

| Flöde | Bevis utöver skärmen |
|---|---|
| huvudman utser rektor | Bara rektor erbjuds. Utnämning för skola 12 och avslut. `principal_appointed` och `assignment_ended` är committade. Inga elevnamn i nätverket |
| rektor ger och avslutar läraruppdrag | Inloggningen visade lösenord och engångskod. Sessionen har acr 2, amr [pwd, otp] och bevis. Tilldelningen gjordes utan någon navigering till step-up. Rektor finns inte bland mottagarna. `mandate_granted`/`assignment_ended` committade, och mottagaren har inget giltigt mandat efter avslutet |
| lärare loggar in utan engångskod | Keycloak visade bara lösenordssteget (ingen kod, ingen registrering). acr 1, amr [pwd], inget bevis. Elevprovet fungerar |
| elevhälsa med skolscope | Skolans två elever, ingen export (403). Främmande elev ger 404 |
| elevhälsa med elevscope | Exakt den tilldelade eleven. Annan elev i samma skola ger 404 och syns inte i nätverket |
| elevhälsa med ärendescope | Ingen lista, elev endast via ärendet. Direkt elev-ID och annat ärende ger 404 |
| rektor godkänner support som upphör vid sluttid | Godkännare, syfte och sluttid (±2 min från 15 minuter). Kortad sluttid i databasen ger tömd vy och 403, och kortet försvinner hos rektor |
| rektor ger support till grupper som upphör vid sluttid | Omfattningen "En eller flera grupper på en skola". Tom gruppselektion nekas i formuläret. Två grupper i skola 11 (varav en tillfällig) ger lagrat gruppscope `group\|2\|0\|1`. Supporten ser gruppernas elever och grupperna i scoperutan. När eleven tas ur gruppen syns den inte längre och ger 404. Ingen export (403). Sluttiden tömmer vyn och ger 403 |
| IT pausar och provar anslutning utan elevinsyn | Pausa, test nekat vid paus, aktivera och test. `connection_update`/`connection_test` committade. Elevvägar ger 403, och elevprovet saknas i menyn |
| granskaren följer elevläsning, export och nekande | Lärarens läsning (korrelation från svarshuvudet), nekad främmande elev och administratörens export syns i loggvyn. CSV-exporten innehåller båda korrelationerna men inga elevnamn. `log_exported` committad |
| tangentbord och fältfel i tilldelningen | Fokus flyttas in i dialogen och stannar där vid Tab. Fält får `aria-invalid`/`aria-describedby`. Beviset görs 9 h gammalt i databasen. Kravet på engångskod visas i dialogen med knappen *Verifiera med engångskod*, och inmatningen finns kvar. Knappen nås med Tab inom fokusfällan och aktiveras med Enter. Därefter lösenord och kod hos Keycloak, utan lämna-sidan-fråga. Tillbaka i arbetsytan görs tilldelningen om med tangentbordet och lyckas. Esc återför fokus till knappen |
| verifiering nås med pekskärm i avslutsdialogen | Telefonkontext med tap. Beviset görs 9 h gammalt. Avslutsdialogen visar kravet och knappen, och pekytorna är minst 44 px. Efter verifieringen finns uppdraget kvar tills det avslutas igen, och avslutet lyckas då |
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

### Avvikelser från användarprovet 2026-09-27 (rättade inom 03-07)

6. **Återvändsgränd vid engångskod (fel).** Knappen *Verifiera med engångskod* låg på sidan bakom den modala dialogen och gick inte att nå. Nu visar tilldelnings- och avslutsdialogen egen ruta med knappen (`web/app/mfa-step-up.tsx`). Kundadministrationens dialoger stängs redan vid `mfa_required`. Commit 43c6b79.

   Varför den tidigare sviten (36/36) missade felet:
   - Provet kontrollerade bara att sidans text var *synlig* och stängde sedan dialogen med Esc.
   - Övriga prov verifierade i förväg genom direkt navigering till `/api/auth/login?step_up=1`.

   Nu genomför proven verifieringen inifrån dialogen med tangentbord och pekskärm.
7. **Engångskod vid inloggning (användarbeslut).** Nivå 2-flödet `loa-2-otp` i `work/pilot/idp/realm-template.json` har villkoret `conditional-user-configured`, och varje inloggning begär `acr_values=2` (frivilligt). Resultatet:
   - Konto med registrerad kod: lösenord och kod ger acr 2 och amr [pwd, otp].
   - Konto utan kod: bara lösenord ger acr 1 och amr [pwd]. Ingen tvingad registrering.

   Serverns prövning (`hasMfaProof`) är oförändrad. Step-up (`prompt=login`, `max_age=0`) är reserv. En step-up utan registrerad kod ger inget bevis; användaren kommer tillbaka med `?verifiering=saknar-engangskod` och ett besked. Commit d9499dc.

   Den körande IdP:n uppdaterades på plats med `node work/pilot/idp-realm-sync.mjs --target protected`, som bygger om flödet från mallen utan att röra användare eller registrerade koder. `--check` jämför bara. Keycloak döljer amr-referensvärdena i admin-API:t, så de prövades med verklig inloggning. Verklig inloggning mot realmen efter uppdateringen:
   - p3.larare: steg [lösenord], acr 1, amr [pwd].
   - p3.rektor: steg [lösenord, engångskod], acr 2, amr [pwd, otp].

   Kontrollen gjordes i ett försök i en separat realm före ändringen och i browserproven.
8. **Support för grupper (användarbeslut).** Migration `20260927090000_phase3_support_groups.sql` (ny, efter 20260926110000) tillåter support med gruppscope. Kraven är exakt en skola, minst en grupp, ingen elev och inga ärenden. Övriga villkor är oförändrade. `phase3_probe_scope` visar egna grupper. TS-policyn har samma formregel. Commit 2d17d4c. Migrationen är tillämpad lokalt med `supabase migration up --local`, utan reset.

## Avgränsningar och öppna beslut

- **Elevhälsoansvarigs egen elevinsyn** är ett öppet verksamhetsbeslut. Nu har funktionen ingen egen elevläsning och ser inga elever i tilldelningsurvalet.
- **Osparad tilldelning efter verifiering.** En osparad tilldelning återställs inte efter step-up-omdirigeringen; rutan i dialogen säger det. Med engångskod vid inloggningen behövs step-up normalt först efter 8 timmar. Om formuläret ska återställas är ett öppet beslut.
- **Konto utan registrerad engångskod som behöver administrativ åtgärd.** Kontot får beskedet att koden saknas men kan inte registrera en kod från plattformen. Registreringen sköts av den som administrerar inloggningen (i provmiljön Keycloaks `CONFIGURE_TOTP`). Även det gamla flödet gav inget godkänt bevis vid registrering under step-up: registreringen ger amr [pwd]. Det är prövat i en separat realm.
- **Registrering vid första inloggning.** Ett konto som registrerar sin engångskod vid inloggningen får inget bevis vid just den inloggningen (amr [pwd]). Nästa administrativa åtgärd kräver då step-up med koden.
- **Felkod för support före starttid.** Support före starttid får felkoden `assignment_expired` (deferred-items punkt 1). Behörigheten är rätt, men meddelandet är missvisande. Webbens tilldelning startar alltid support "från nu", så fallet uppstår inte i UI:t.
- **Syfte för support.** Supportens syfte är i provmiljön fast `synthetic-troubleshooting`. Verkliga syften och tidsgränser är inte beslutade.
- **Telefon.** Telefonbeviset är WebKit i iPhone-storlek i Playwright. En fysisk telefon når inte den lokala miljön, eftersom issuer och preview är bundna till den här datorn. Att göra den nåbar kräver ett separat beslut, till exempel om Keycloak på LAN.
- **Sessionsbevis i API-proven** mintas lokalt. Den riktiga OIDC-kedjan visas bara av browserproven mot den lokala test-IdP:n.
- **Lagringstid.** Den syntetiska gallringen är 30 dygn. Verklig lagringstid är ett kundbeslut.
