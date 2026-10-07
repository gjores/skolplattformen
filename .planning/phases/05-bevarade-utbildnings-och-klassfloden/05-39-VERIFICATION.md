---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "39"
status: passed
scope: local-synthetic-only
score: 3/3 must-have truths verified
source_revision: 07737baee91a32307e07a703be9b6befae91c20a
build_revision: 07737baee91a32307e07a703be9b6befae91c20a
actual_report_sha256: 18c51291b70a3c0308ead8e38e6183f0afe3e27ef5c09309eb2e2cc7ae7d8345
human_comprehension: pending after 05-43
previous_draft_sha256: d66a67ce6712e1dd3326ef912b6cef599dd294c20abf7837ce61c2e36f961755
---

# 05-39 — oberoende avgränsad verifiering

**PASS: 3/3 observerbara sanningar för plan 05-39.** Verifieringen gäller gemensam planeringsskola/läsår, elevregistrets separata urval och säker rensning vid uppdrags-/sessionsbyte. Källkopplingarna och roots färska faktiska C01–C08 på dator och telefon styrker målet. Detta är lokal syntetisk verifiering; hela PLANERING-01–05, fas 5 och mänsklig begriplighet är fortsatt öppna.

GSD-verifierarens mål→artefakt→koppling-metod har använts. Verifieraren har läst källor, Git-bytes, redan skapade JSON-rapporter och bildbilagor. Inga nya DB-/API-/browseranrop, provsviter, byggen eller produktändringar har utförts. Endast denna nya fil i /private/tmp skrivs; tidigare utkast och bevis förblir orörda.

## Målets tre sanningar

| Sanning ur planen | Substantiell artefakt och faktisk koppling | Färska faktiska fall | Resultat |
| --- | --- | --- | --- |
| Gemensam planeringsskola/läsår följer planvyer och finns kvar vid retur. | ProtectedShell äger planningLocationRef/history; PlanningContextProvider hämtar verkligt GET /api/planering/urval, strikt parsernormaliserar mot läsbart setup och gatear writers före render. planningFor/transitionPlanning och separata planeringsparametrar bevarar år/skola mellan program- och timvyer. | C01 återgång/reload; C02 HM, skola/år, Back/reload och främmande URL; C04 relativårsindex/all, år/skola/vy/Back/uppdrag/utloggning spärrade under verklig skrivning och tillåtna efter återläsning. Alla tre ×2 PASS. | VERIFIED |
| Elevregistrets egna läsår och filter påverkas inte av planering i 2027/28. | currentRegisterSelection/rememberRegister bevarar hela register-Selection under full säkerhetsnyckel. lasar/skola/utbildning/status tillhör registret; planeringslasar/planeringsskola tillhör planering. Registerintern Back bibehålls; shell stoppar områdeskorsning innan registerlistener normaliserar URL. PUPIL_FUNCTIONS är separata från PLANNING_FUNCTIONS. | C01 två registerfilter och eget registerår före/efter planering2027; C02 HM utan elevscope/elevknapp och utan /api/elever-anrop. Båda ×2 PASS. | VERIFIED |
| Uppdrags-/sessionsbyte rensar innehåll och sparat urval, även sena svar. | epoch+customerId+assignmentId styr provider/key och writer-callbacks. clearSession rensar synkront session/location/register/plantargetrefs. Generation/current/cancelled/AbortController avvisar gamla svar. Faktisk401/403 eller indraget tidigare verifierat skolmandat rensar före navigationsspärr; första ogiltiga URL normaliseras utan falsk mandatgaranti. | C03 gammalt och nytt verkligt setup/audit efter uppdragsbyte; gammalt svar återför inga skolor. C08 accepterad write, faktisk sessionsutgång401, innehåll/urval bort och ny scoped rektorssession utan gammal plan. C08 avslutar med faktisk lista200/full strikt parser/no-store/audit och färdig listvy. Båda ×2 PASS. | VERIFIED |

C05–C07 ×2 PASS kompletterar med accepterad timskrivning följd av transport-/återläsningsfel, parent-spärr efter child-unmount och okänt skapande med faktisk status/parent-återläsning. Bilagorna styrker en write, riktig kvittens/readback, bevarad källa/andra skolan samt exakt en ny plan. Positiva svar kommer från verkligt route.fetch och egna DB/Worker-auditpar; negativa browserfel injiceras efter faktiskt serverutfall. Ingen positiv mock eller automatisk omkörning används.

## Faktisk matris och käll-/byggbindning

MAIN och runtime har byteidentisk phase5-39-context-actual-ninth-20261007.json, raw SHA256 **18c51291b70a3c0308ead8e38e6183f0afe3e27ef5c09309eb2e2cc7ae7d8345**. Rapporten startar 2026-10-07T20:36:04.356Z och varar 376258.315 ms. Exakt C01–C08 en gång per planning-year-desktop/Chromium och planning-year-phone/WebKit: expected16, unexpected0, skipped0, flaky0; samtliga expectedStatuspassed och ett passed-resultat/retry0, inga globala eller resultatfel.

workers=1, maxFailures=1, fullyParallel=false och retries=0 binds av config samt beforeAll före fixturecreate. Chromium använder 1440×1000; WebKit iPhone13/390px. Svenska locale och Europe/Stockholm, traceoff och befintliga tidsgränser består.

Båda projekten har source-build med sourceRevision=buildRevision **07737baee91a32307e07a703be9b6befae91c20a**. Runtime web/dist-protected/build-mode.json är faktiskt läst: modeprotected, samma077revision, builtAt2026-10-07T20:33:38.135Z. MAINs äldre d59-markör används inte som bevis. Nio explicita sourceHashes matchar077Git samt MAIN/runtime; rapportens46 protected-poster/44 unika sökvägar expanderas till 49 filer och samtliga bytes matchar samma träd. Fixturens tre guardlager, verify-target och Keycloak-helper är också bytebundna. De faktiska beforeAll-grindarna kräver rent träd, byggrevisionens anor och oförändrad runtimekod samt verklig workerd/skolplattform_worker-health. Senare prep-WT:s05-40/41/42kod används inte.

## Avslut, audit och bevarande

Alla 16 cleanup-bilagor har fem mandatory bevarandeflaggortrue. before/after/originalBusiness/finalBusiness är exakt lika för 15 hela tabeller med count+SHA; ingen ny tyst baseline. originalAuditHash=finalAuditHash och originalIdentityHash=finalIdentityHash. Varje fall bevarar hela retained audit- och auditerade identitetsmängden med identiska före/eftercount+SHA. Ägda verksamhets-/sessions-/receipt-/trigger-/funktionsrader är0; främmande offering/offering_units/session0, främmande kvarhållna auditankare är korrekt förankrade. Dialogbilagan är[] för alla 16. Inga cleanup-deferred/failure eller okända completionbilagor finns.

Källordningen styrker varför dessa är avslutsbevis: sticky ownedNode omsluter creation/setup/mutation/readback/session; verklig fetch och full body spåras separat från browserfulfill. Hållna svar släpps, page/context-routes och egna faktiska jobb awaitas, sidan stoppar nya producenter och context stängs före cleanup. Ofullständigt node/browser/API-avslut stoppar nya fixturer och ger deferred med tidigare15baseline, utan ny snapshot eller cleanup. page.close/requestfailed räknas inte som DB-kvittens.

Fjärde återhämtningen är separat faktisk PASS, inte rekonstruerad fixture-/matris-PASS. Preflight raw **dbaf8a55262d04843635944730a3af641004c8549892c04188e4d87787accfbd**, apply raw **dfa255dba5b33665820e44ce8d6baa6cc0881841cc2b0c7c8f1db46530202a68**, båda binds till embeddedscript98924ca855561067629860b2dd1a8fb6d317dba8ba133a0e568bb496eb47d31b och exakt helper/historykedja. Preflight är read-only/noownedMutation, låser 14 egna sessioner och apply binds till dess hash. 14 sessioner med fördelning4/4/3/2/1 blir0 under exactownFORUPDATE. Fullcatalog/rawACL/ursprungliga15/allaudit/alla äldre identiteter/retained egna identiteter/tre tidigare mandatgrafer matchar före/efter; postcommitPreservation och historiska inneslutna delmängder ärtrue, commitOutcomeUnknownfalse. Original942fullFAIL står fortsattFAIL/notFullPlanProof. Ingen generell reset eller sänkt historisk SHA används.

## Sparstatus, mobilgeometri och bildgränser

useUnsavedChanges registrerar via useLayoutEffect med sammaID/dirty/dependencies/cleanup. Den renderade busy/unknown- och färdiga statusen uppdaterar registry före följande händelse. Shell, provider och uppdragsbyte prövar navigation-block före generell bortkastningsdialog; verklig säkerhetsrensning går före båda. C04–C08 med dialog=[] och verkliga accepterade writes/återläsningar styrker denna koppling på dator och telefon.

Mobil-WebKitselect får nu enbart explicit height:44px i befintlig planning-context.css; width100%, nativepil, labels/fokus, borderbox, min/maxbredd och wrap består. C0bf-hashen binds till077bygget. Föregående mobil23pxFAIL541f består. Ny boundedC08×2raw3662d9383ee94b886eeb4d26660823224c7281079b270710b76f3214e0baf0e9 har båda selects44px och fullcleanup.

Alla 16geometri-bilagor saknar dokumentöverflöde (1440/390px) och alla synliga planeringsknappar/selects är minst44px höga. Alla 16original-PNG finns. Verifieraren har läst pixels för C01/C04/C08 på dator/telefon samt boundedC08:s mobilöversida: rätt skola,2027/all respektive2028/B och aktuellt2026, bevarad nativepil och kontroller inom bredden. Telefonens långa C08fullbild skalas kraftigt i verktyget; mobilöversidan granskas därför separat. Detta är inte en genomgång av varje tabellcell.

C01/C04bilder är tagna efter årbyte medan barnlistan laddar; de bevisar kontextrad, inte färdig årsmatris. C04 har kvar tidigare spärrnotiser efter kvittens/tillåtet årbyte, och den gula ramen radbryts ojämnt på telefon. Det är en kvarvarande visuell/presentationsbegränsning; provet visar ingen fortsatt beteendespärr eller confirm. Samlad slutprodukt, mobilårsknappar, begriplighet och handbok bedöms senare i05-43.

## Bevarad historik


Första/andra C01-avvikelser rör registerformat respektive avslutsbevis; egna recoveries bevaras. Fullmatrisens C03-avvikelse rättades med explicit navigation efter faktisk context200 och enabled nytt uppdrag. C04 label-match följer faktisk nestad label. Femte C04:s synkrona Back-URL-assert ändrades till awaitad exakt toHaveURL före heldrelease med oförändrad input/Sparar/writekontroll. Sjätte C04 hade alla body- och cleanupasserts gröna men dialogconfirm gav FAIL; det utlöste den enda produktfixen i shared registry. Sjunde bounded PASS ersätter inget av dessa historiska FAIL.

Tredje recovery-preflight stoppade före mutation på hashavvikelse: ORDER BY id på textprojekterat bigint-ID valde lexikografisk prefixmängd. V2 kvalificerar numeriskt e.id; mandatory gamla hash/countkrav behölls. Både ursprungligt read-only FAIL och separat v2preflight/recoveryPASS är kvar.

| Bevarad rapport | Raw SHA256 | Lästa resultat |
| --- | --- | --- |
| phase5-39-context-actual-first-20261007.json | 327d78587fe2b0c2491e2f904e1eebbdb8480152547339aeadc0f65ec66dfd8a | FAIL |
| phase5-39-context-actual-second-20261007.json | 55612b19ba5863c71e3e7ab822839a955f3aead4750d98dfd6810b9d8eb8ded2 | FAIL |
| phase5-39-context-actual-third-20261007.json | 8e899a025ed46dd6ee81a725cef80156d84ab7fd1f69ad21bd5ff867f0625f8f | FAIL |
| phase5-39-context-actual-fourth-20261007.json | 38aaf139ce38bff916f5ebe122f2d4c1b8f8b9964dcd1d01943d1be123f0b39d | FAIL |
| phase5-39-context-bounded-writes-fifth-20261007.json | 156e99f63d59b2ba575122b138fc0532b9597821962f20a054d7086aed3708c8 | FAIL |
| phase5-39-context-bounded-back-sixth-20261007.json | 4c4317714e4cea384a8d2e5ddd4d5e748a6f3fce0c4ab8a8338f277d5075ae92 | FAIL |
| phase5-39-first-context-recovery-20261007.json | caccdc550198fdfd17ce316e2dbb7dcaef8ab3a66a520fac2159554e4fbf65d7 | PASS |
| phase5-39-second-context-recovery-20261007.json | 904359d7d44387186fc169c7919fbc48172fca84983bde88b40e0d5d7265974f | PASS |
| phase5-39-third-context-recovery-preflight-20261007.json | c32c9cdb1ae3da6084b7d0c28e6f6b43ef228110fc9aeac01e4467a2a0b42955 | FAIL |
| phase5-39-third-context-recovery-v2-preflight-20261007.json | 1bd4718002fb19cc1e6c4ef6e9722055f82937df2f0575a3c36dec7941cb0ca2 | PASS |
| phase5-39-third-context-recovery-v2-20261007.json | b8d0c8c42b77c3231b422e067d0914afa7344674313cad159e705c63d9f8d68c | PASS |
| phase5-39-context-actual-seventh-20261007.json | 94268766a57c4dc472d2a2eb8f2ece4c616c6abafe70c10bcdfdd9cc9d947f6d | FAIL — expected7/unexpected1/skipped8 |
| phase5-39-context-bounded-session-eighth-20261007.json | 541f18a66b42d8be3da5cbe72ae4a86b324ec035212e48c0df48e3784ac46b74 | FAIL — mobilselect23px; båda cleanup PASS |
| phase5-39-fourth-context-recovery-preflight-20261007.json | dbaf8a55262d04843635944730a3af641004c8549892c04188e4d87787accfbd | PASS — read-only, inga ägda mutationer |
| phase5-39-fourth-context-recovery-20261007.json | dfa255dba5b33665820e44ce8d6baa6cc0881841cc2b0c7c8f1db46530202a68 | PASS — separat ägd återhämtning |
| phase5-39-context-bounded-session-ninth-20261007.json | 3662d9383ee94b886eeb4d26660823224c7281079b270710b76f3214e0baf0e9 | PASS — C08 ×2, båda cleanup PASS |
| phase5-39-context-actual-ninth-20261007.json | 18c51291b70a3c0308ead8e38e6183f0afe3e27ef5c09309eb2e2cc7ae7d8345 | PASS — C01–C08 ×2, 16 cleanup PASS |

## Fryst källinventering för077


| Fil | SHA256 |
| --- | --- |
| web/lib/unsaved-changes.tsx | 584189e8bb01612a6a00aaf819e5a4c2983ef7deb08d71e555a97b63a577be6e |
| web/lib/protected-plan-location.ts | 98580972068ead354ccb8e7f9e6881215d644d072f5774f582b7f19e8c26e93f |
| web/lib/protected-plan-location.test.mjs | b3a88530892579e0cf5fcf918f70b5a54331169f058cc03df2b2906d34beb6c8 |
| web/app/planning-context.tsx | 7305de150c51a0cbd18e7a58731575db6f08432a3fe9c61a2e548b7aadda5019 |
| web/app/planning-context.css | c0bfa0a65cef4d5cca7decaf5e6289162615b2f309aa8f41599d5bc7b5113659 |
| web/app/protected-home.tsx | 8d37ba2ec0e2ca7becd3bcaf8daac4e6cfffc849db98e16c6da9d944d7413b4b |
| web/app/protected-gym-timplan-hours.tsx | 68534ba5ce8d52fb1e698e5e53cedfcf2d4345db965960ad09773e2aab5a5747 |
| web/app/protected-gym-timplan-workspace.tsx | d1982d0723e62e2469cde256943ff25705420f0ca00b61d26512c0dff7fb32aa |
| web/app/protected-programplan-board.tsx | 708113c420e1f72c83f37df60f9786a3d7ec6674eb45e39513891ae218cd226c |
| web/app/protected-programplan-workspace.tsx | db35bd169f4507cea2231656eefa75d58adb44ccf59b61de120b918f2bad2834 |
| web/app/protected-programplan-flow.tsx | b04a99c2bbf871d1ded50cb2d4fb5e0e0d712e772d37d5376cd49cf533b5195e |
| web/app/protected-programplan-lifecycle.tsx | 7a818bc0cbc884452302fd0e4dd90e3c65daae35d55396d6dc512f30d16667fc |
| web/app/protected-timplan-workspace.tsx | fd3ed84f43a7d66dbae01642604556cf4b709f46dfc63d41332dc8f0cf39621b |
| web/app/context-switch.tsx | 446da8d316ba9f47dc5e82c39bab35a775750362d98ddf6f2857e8bb1b89021f |
| web/e2e/phase5-planning-year-context.spec.ts | 8cf4d94a979758da4734f47fd4d0059e23efdd54509f38523b617438e61fe807 |
| web/playwright.phase5-planning-year.config.ts | 3af7aeb13ae2e3fb0372b6ab0ad42364022ba5c91dca26ab38e6e92e6f7b6d52 |


## Kvarstående användar-/kravgränser

3/3 gäller endast plan39:s mekaniska kontext-/register-/säkerhetsmål i lokal syntetisk miljö. Full samlad PLANERING-01–05-status,05-40årslistor/överblick,05-41GY-årsmatris,05-42GR/IM och05-43slutrelease/handbok/modulkontrakt återstår. Mänsklig begriplighet och användarens sammanhängande prov efter05-43 är pending och får inte markeras godkända av denna rapport.

Årsval skapar inga elever, klasser, kalender- eller årsbindningar och etablerar inga mandat. URLskola är en begäran som verkligt setup begränsar. Rektors färdigmarkering/huvudmannagodkännande tillhör separat livscykelomfattning. Ingen verklig kommun-/IdP-/pilotanslutning är verifierad; tidigare ADMIN-/fas5-/nationella regelgränser består.
