---
status: resolved
trigger: "Lokal OTP-knapp fyller sex siffror för rätt provkonto men IdP återvänder inte"
created: 2026-10-02
updated: 2026-10-02
scope: isolated local synthetic IdP; read-only diagnosis by debugger, repair and actual verification by root
---

## Current Focus

hypothesis: Saknad lokal seedbindning och tyst manifestfallback orsakade rektorns nekade kod. IT saknade dessutom sin första OTP-credential och hade CONFIGURE_TOTP kvar; detta var ett separat initialt enrollmentläge.
test: Read-only diagnos följdes av roots avgränsade additiva lokala reparation och fyra verkliga browserprov genom ordinarie OIDC/MFA.
expecting: Uppnått: desktop Rektor/Huvudman och phone Rektor/IT passerar med rätt identitet, MFA-bevis, utloggning och utan horisontellt overflow.
next_action: Ingen ytterligare browserkörning från debugger. Root versionshanterar diagnosen tillsammans med hjälparändringarna. Detta löser det lokala syntetiska testhjälpmedlet och innebär inte mänskligt andrafaktorprov eller produktionsverifiering.

## Symptoms

expected: Provkodsknappen fyller aktuell lokal TOTP och vanlig OTP-submit går genom OIDC-callback till skyddad app med verkligt MFA-bevis.
actual: Root rapporterar tre FAIL desktop-Rektor-callback/idp_did_not_return efter sex siffror och rätt hjälparkonto.
errors: idp_did_not_return; lokal IdP-loginlogg visar LOGIN_ERROR/invalid_user_credentials.
reproduction: Lokal3012Worker c320041, IdP8180 och helper8181; root/UI-agent samordnar browserfönster.
started: Efter lokal OTP-knapp infördes; policy och clockdelta rapporterade som korrekt av root.

## Eliminated

- hypothesis: Knappen fyller ett annat fält eller POST skickar annan kod.
  evidence: Eget faktisk Chromiumprov visar en enda otp-input, name=otp/type=text, enabled/readWrite, form POST till lokal /realms/skolplattform-test/login-actions/authenticate. Helperstatus200, begärt provkonto korrekt, helperkod=input=verkligt POST-otp (endast booljämförelser). Exakt ett otp-fält skickas.
- hypothesis: Helperns reservkod avviker från den aktuella manifest-TOTP-perioden eller fylls i för sent.
  evidence: Andra verkliga försöket validerade koden internt mot aktuell manifest-TOTP med window=0; över fyra sekunder återstod och helper=input=POST. IdP avvisade fortfarande försöket. Root hade separat observerat en sekunds clockdelta.

## Evidence

- checked: Ursprungliga idp-otp-helper/idp-test-buttons/verify-local-login-helpers/idp-otp källor före reparation.
  found: Knapp hämtar helperns kod, sätter input.value och skickar input/change. Helper använder enrolerad privat seed eller privat manifestreserv; SHA1/digits6/period30 och undviker sen period samt tidigare utfärdad/senast använd kod. Vanlig IdP-submit används separat.
  implication: Ingen authflowgenväg införs; här krävs diagnos av faktisk IdP-post och svaret.
- checked: Eget avgränsat verkligt Chromiumprov efter rootnotification.
  found: assertTarget protected/requireIdp och Workerhealth PASS. Konto/input/helper/POST-matchningar PASS. Efter submit kvar på IdP authenticate-path, ej appretur. Ett fel-element finns; känd första klassificering gav other_present utan råtextutskrift. Ingen appsession skapad, browsercontext avslutad.
  implication: Problemet är reproducerat bakom rätt formfält. Inga koder/seeds/tokens/cookies/passwords/pagebody/rawqueries skrevs ut; ingen DB-/credential-/enrollmentmutation gjordes.
- checked: Privat enrollmentfil, med enbart booleskt förekomstresultat.
  found: Rektor enrolledStringSeedPresent=false; Huvudman=true; IT=false. Manifestreserv finns för alla tre. Inga seedvärden lämnas här.
  implication: Rektors aktuella helperkälla är manifestreserven. IT saknar också privat bindning men har inte genomgått ett eget avvisningsprov i denna diagnos; Huvudmans bindning ska bevaras.
- checked: Vanlig lokal admin-GET för exakt rektorskonto; endast antal och booleska metadatajämförelser.
  found: Ett exakt konto, en OTP-credential och en lösenordscredential. OTP-metadata matchar SHA1/six digits/30-second period, men secretData är inte tillgängligt i GET-svaret.
  implication: Samma algoritm innebär inte samma secret. Faktisk skillnad mellan manifestseed och IdP:s seed är inte direkt verifierad; ingen credentialexport eller DB-läsning användes.
- checked: Enrollmentkod i work/pilot/phase3-browser-fixtures.mjs:118 och web/e2e/helpers/keycloak.ts:66,176; helperns dåvarande källval före reparation.
  found: Phase3-konton får CONFIGURE_TOTP. Vanlig browserenrollment läser IdP:s nygenererade seed och sparar användarens bindning i privat totp-users.json. Helper väljer annars manifestseed utan att verifiera dess koppling till kontots credential.
  implication: En generell manifestreserv är inte auktoritativ för individuellt registrerade phase3-konton. Saknad sparad bindning ska vara ett tydligt lokalt hjälparfel.
- checked: Filtrerad lokal IdP-loginlogg och avslutning av egna browserkontexter.
  found: Tre offentliga LOGIN_ERROR/invalid_user_credentials-händelser; inga råa loggar skrivna. Inget eget appinloggningstillfälle lyckades och ingen egen appsession skapades. Kontext/browser stängda efter varje försök.
  implication: Vanligt MFA-flöde är bevarat. Root kan ta runtimefönstret utan kvarvarande browserprov från denna agent.
- checked: Roots separat insamlade read-only kontoguard efter ett avvisat mutationsförsök.
  found: ID/username/email matchade för alla tre syntetiska konton. Rektor hade två OTP-credentials efter det redan delvis genomförda additiva försöket: den äldre och hjälpens nya. IT hade noll OTP-credentials och CONFIGURE_TOTP kvar. Den tidigare debuggerkontrollen av en OTP-credential avsåg endast Rektor och får inte överföras till IT.
  implication: Guarden behövde stödja både befintlig OTP och explicit första enrollment; inget konto identifierades genom klientrollval.
- checked: Automatisk approval review och roots omprövning.
  found: Ett tidigare diagnostiskt mutationsförsök avvisades på grund av account_mismatch. Root samlade därefter separat läsbevis, rättade guarden och fick omprövningen godkänd. Avgränsad setup gav PASS med bevarande av tidigare credentials och profiler.
  implication: Avslaget kringgicks inte; nytt kontobevis och rättad begränsning låg till grund för den godkända omprövningen. Detta anges inte som ett nytt manuellt användargodkännande.
- checked: Roots reparation och aktuell källkod i work/pilot/idp-test-otp-setup.mjs, idp-otp-helper.mjs och idp-test-buttons.mjs.
  found: Additiv separat helper-OTP skapades för Rektor medan dess gamla OTP och lösenord bevarades. IT fick sin första OTP och dess fullgjorda CONFIGURE_TOTP avslutades. Huvudmans befintliga privata kodbindning bevarades. Helper avvisar saknad privat seed med enrollment_required och har ingen manifestfallback. Temat är begränsat till exakta lokala IdP-origins och väljer helperns faktiska credential när flera finns.
  implication: Reparationen återvinner inte gammal seed och raderar inga tidigare credentials. Vanligt OIDC/MFA används fortsatt; mandat och verksamhetsdatabas ändrades inte.
- checked: Roots mobilprov och CSS-rättning i det lokala temat.
  found: Tooltip gav tidigare 539 px innehållsbredd i 390 px viewport. Lokal CSS med right:0, left:auto och begränsad bredd rättade detta. Slutrapporten anger noHorizontalOverflow=true och touchTarget=true för samtliga fall.
  implication: De lokala kodknapparna går att använda även i telefonemuleringen.
- checked: work/pilot/results/local-login-helpers.json, avläst efter roots slutkörning.
  found: PASS 4/4: desktop Rektor, desktop Huvudman, phone Rektor och phone IT. Alla anger actualOidc=true och mfaProof=true; root verifierade rätt identitet. Cleanup anger faktisk apputloggning som återkallar varje egen browsersession och bevarad säkerhetsaudit.
  implication: Det rapporterade lokala inloggningsfelet är åtgärdat och verifierat. Phone använder iPhone/WebKit-emulering; automatiskt ifylld verklig lokal OTP är inte ett mänskligt andrafaktorprov.

## Resolution

root_cause: Rektors användarbundna seed saknades; helper skickade i stället aktuell men ogiltig manifestkod. IT saknade både privat seed och sin första OTP-credential, med CONFIGURE_TOTP kvar. Huvudman hade giltig befintlig privat bindning. Faktisk historisk IdP-seed kunde inte läsas via vanlig admin-GET och någon direkt hemlighetsjämförelse påstås inte.
fix: Root införde avgränsad additiv lokal helperregistrering genom idp-test-otp-setup.mjs, bevarade gamla credentials och Huvudmansbindning, tog bort manifestfallback, låste lokala origins, valde faktisk helpercredential och rättade mobil tooltip. Den genomförda additiva setupen ersätter diagnosens tidigare förslag om browseromregistrering; inloggningsflödet använder fortfarande ordinarie OIDC/MFA.
verification: Resolved enligt roots färska verkliga 4/4 browserprov i work/pilot/results/local-login-helpers.json med giltigt MFA, rätt identitet, logout och mobilkontroller. Setupens bevarandekontroller PASS. Debugger gjorde endast read-only diagnos och denna dokumentuppdatering; root utförde reparation och slutprov. Inga gamla credentials raderades och inga mandat eller verksamhetsdatabasregler ändrades.
files_changed: debugger: [.planning/debug/local-otp-button.md]; root owns helper/setup/theme/verification sources and result
