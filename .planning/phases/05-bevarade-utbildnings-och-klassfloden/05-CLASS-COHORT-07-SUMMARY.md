---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: CLASS-COHORT-07
status: completed
completed: 2026-10-15
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
verification_scope: synthetic_component_browser
---

# Frivilligt klasssteg i programplansarbetsytan

Den gemensamma panelen **Klasser för utbildningen** visar befintliga klasser med deras giltighet, tillåter rektor/skoladministratör att granska och skapa 1–20 uttryckligt namngivna tomma klasser och erbjuder **Gör senare** med återöppning. Huvudmannen läser utan nya skrivrättigheter. Utbildningsstart, första läsår och klassgiltighet visas separat; timplanskoppling görs fortfarande i det befintliga flödet.

Panelen monteras för den verifierade utbildningen och valda skolan. Ny utbildning öppnar klasssteget först efter bekräftad sparning och skyddad återläsning av programplanen. Ett separat klassfel kan inte ändra den bekräftade utbildningssparningen. Samma utbildning återanvänder klass-ID:n vid ny programplansversion; kopierad ny kull visar en tom klasslista.

## Begäran och återhämtning

En versionsmärkt fliksjournal sparar den strikt parsade begäran före första POST. Den binds till kund, medlemskap, uppdrag, epok, utbildning och skola. Lagringsfel stoppar före mutation. Inga credentials, elevfält eller begärandedata läggs i returadressen.

Okänt utfall, felaktigt kvitto, hårdomladdning och återkomst från MFA leder till requestbunden statusläsning, aldrig automatiskt omskick. Ett verifierat `not_found` kan erbjuda samma commandId/request igen först efter aktuell källkontroll. Källändring kräver ny granskning. Känt kvitto kräver verifierad återläsning av samma klass-ID:n och giltighet innan journalen rensas; misslyckad efterläsning kan inte skapa klasserna på nytt. MFA efter återställning får inte nedgradera ett tidigare känt kvitto.

Komponentens nyckel omfattar hela scopet, och generation/abort hindrar gamla svar från att fylla en annan skola eller ett annat uppdrag. Journalen är flik- och scopebunden, inte bevis på behörighet eller en exakt inloggningssession. Nuvarande sessions-API saknar ett separat opaque sessions-ID; varje återupptagning prövas därför med skyddad status-/underlagsläsning. Trasig journal spärrar fortsatt skrivning i det berörda scopet.

Klassredigering/okänt klassutfall spärrar programplanens syskonredigering och beslut. Omvänt spärrar pågående planarbete klassens nya skrivning. Klassens egen läsåterhämtning förblir tillgänglig. Granskning, återkoppling och Gör senare har verifierat tangentbordsfokus.

## Kontroller mot frysta källor

| Kommando från `web/` | Faktiskt resultat |
| --- | --- |
| `npx playwright test --config playwright.usability.config.ts class-cohort.spec.ts` | PASS, exit 0: 48/48, 24 scenarier vardera på desktop och iPhone/WebKit; 0 skips, 0 retries. |
| `npx playwright test --config playwright.usability.config.ts class-cohort.spec.ts operational-class-timplan.spec.ts` | Första kombinerade körningen var **FAIL**, exit 1: 88 PASS/2 FAIL. Exakt de 42 raderna från `operational-class-timplan.spec.ts` är verifierade PASS med 0 skips/retries. De två felen låg i den nya specens simulerade MFA-retur. |
| `npx playwright test --config playwright.programplan-copy.config.ts` | PASS, exit 0: 18/18 befintliga kopieringsprov på desktop/telefon, 0 skips/retries. |
| `node --test lib/class-cohort.test.mjs lib/class-timplan.test.mjs` | PASS, exit 0: 18/18, 0 skips. |
| `npx tsc --noEmit` | PASS, exit 0. |
| `npx oxlint app lib` | PASS, exit 0, hela produktområdet. |
| `git diff --check` | PASS, exit 0. |

WebKit tillåter inte `route.fulfill` med HTTP 302. Endast den nya specens mock ändrades till ett syntetiskt HTML-dokument som navigerar tillbaka med `location.replace`. Både före och efter rättningen sker full dokumentnavigering; journalen återställs från sessionStorage. Den färska 48-körningen prövar båda MFA-kedjorna på båda webbläsarna. De sju övriga produkt-/harnessfilerna har identiska hashvärden mellan första och sista körningen. De 42+18 regressionerna gäller därmed samma produktkod; den misslyckade 90-körningen beskrivs inte som PASS.

Privat slutrapport: `/private/tmp/class-cohort-07-final/evidence.json`, SHA256 `3b8a8bf32bc3288d5f0be5f28630c35282291680fd7cb5d91cef0d85dbd9b500`. Den binder samtliga åtta plankällor före/efter, rårapporter med SHA256, exakt utvalda provrader/status/retry och 16 bildhashar. Slutrapportens nya spec-SHA256 är `698fed88a85272e665e0f6efce75eb60ff737022fe6125acf2603868fd7b1f71`.

Första kombinerade FAIL-rapporten, båda telefontraces, kopieringsrapporten och bilderna bevaras i `/private/tmp/class-cohort-07-first-browser-run/`. Tidigare utvecklingsfel dokumenteras i `/private/tmp/class-cohort-07-development-diagnostics.json`; dessa tidiga temporära Playwright-mappar hade redan ersatts av senare fokuskörningar och utges inte för bevarade råtraces.

## Bild- och kodgranskning

Root granskade `single-class-review.png` på dator och telefon samt `full-administrator.png` på dator och telefon. Klassdatum/läsår, befintliga klasser, granskning och knappar är läsbara utan avklippning; inga visuella blockerare. Motsvarande privat kopierade filer och deras SHA256 finns i rapportens `rootReviewedImages`. Egen granskning omfattade granskningspanelen på dator och telefon, inklusive fokusmarkering, radbrytning och touchkontroller.

Oberoende kodgranskning ledde till rättningar av kvittots bevarande över upprepad MFA, spärr efter misslyckad omläsning, ny granskning vid ändrad källa, säker autoöppning efter ny utbildning samt spärr för syskonbeslut/planredigering. Samtliga kedjor har egna browserprov. Full arbetsyta provas för nytt utbildningsflöde, huvudmannens läsläge, administratörens klasskapande, syskonspärr, ny version och kopierad kull; panelharness kompletterar sena svar, okänd mutation och scopebyten.

## Omfattning och återstående gräns

Exakt planens åtta produkt-/provfiler ändrades. De tre harnessfilerna ingår enligt planens dokumenterade undantag. Inga generiska sessions-/MFA-hjälpare ändrades. Root äger gemensam planeringsstatus och push.

Detta är komponent- och browserbevis med syntetiska API-svar. Ingen databas, riktig IdP, beständig runtime eller lokal 3012 ändrades. Produktionsbygge och verklig lokal OIDC/MFA/Worker/databas återstår till plan08; handbok och lokal leverans följer plan09. Här bevisas inte verklig kommunanslutning.

SS 12000:2024/OpenAPI 2.1.0: stabil klassidentitet och separat giltighet visas utan att blandas ihop med elevmedlemskap eller års-/versionsbunden timplanskoppling. Intern en-utbildning-per-klass och äldre okänd giltighet kvarstår som dokumenterade begränsningar. Ingen standardexport implementeras eller verifieras i denna plan.

## Versionshantering

- `6cce205`: sammanhållet frivilligt klasssteg, fliksjournal och säker återhämtning (fyra produktfiler).
- `448c53f`: 24 browserfall på två enheter och avgränsade harnessändringar (fyra provfiler).

Panelens två planuppgifter delar samma tillståndsmaskin och granskades tillsammans; produkt och browserbevis versionshanteras separat utan att skapa ett osäkert mellanläge.
