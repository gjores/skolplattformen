---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TIMPLAN-AUTO
part: UI
status: verified_component_preview
completed: 2026-10-16
---

# Autofördelning – dialog, användarflöde och handbok

## Levererat

`protected-gym-timplan-distribution.tsx` öppnas från **Autofördela timmar** i timtabellen. Modalens första steg frågar efter total undervisningstid för hela planen och visar känd GUT, marginal eller underskott, med förklaring och länk till Skolverket. Känd profil kommer från den gemensamma hjälpfunktionen och det frysta underlaget; okänd profil får ingen antagen GUT. Förvalet är det högsta av befintlig total och känd GUT. Det globala årsvalet begränsar inte förslaget.

Förval **Fyll bara tomma celler** bevarar angivna värden inklusive noll. **Fördela om alla timmar** är ett uttryckligt alternativ. Samma rena modell som servern ger förslaget. Sparad APL-tid ingår i totalen och reserveras som miniminivå, varefter återstående tid följer poängen. Dialogen förklarar att ändrad undervisningstid kan kräva ny APL-bekräftelse. Inga APL-perioder eller innehåll skrivs av dialogen.

**Granska fördelning** visar total, valt fördelningssätt, ändrade rader, bevarade timmar samt sex terminer grupperade i tre årskurser. Inmatningsfält döljs i granskningen och återkommer via **Ändra förslag**. **Spara fördelning** gör en enda atomisk begäran. Därefter kontrolleras svar mot granskade timmar och förväntad revision; den aktuella planen läses tillbaka. Nyare ändringar visas för ny granskning och skrivs inte över av det äldre svaret.

Vid öppning hämtas senaste gymnasietimplan och, för yrkeskod, strukturerat APL-underlag. Revisionerna måste överensstämma. Osparade inlineceller, pågående skrivningar och befintliga APL-/beslutslås hindrar öppning. Öppen dialog registrerar aktivitet och navigeringsspärr så att andra skrivningar inte konkurrerar. Dialogen stängs inte under pågående eller oklar skrivning. Ett initialt läsfel kan däremot avbrytas.

Konflikt eller okänt sparresultat kräver **Läs aktuell timplan** och ett nytt granskat förslag; ingen skrivbegäran skickas om automatiskt. MFA visas genom befintligt uttryckligt verifieringsflöde. Session-/mandatfel skickas till förälderns säkerhetshantering. Handboken beskriver hela flödet och begränsningarna.

## Verifiering

- `npx playwright test --config playwright.timplan-distribution.config.ts`: **24/24 PASS**, Chromium dator och WebKit iPhone, inga retries. Mockad API, separat Vite-port5197. Detta är komponent-/användarflödesbevis, inte faktisk databas-/Workerintegration.
- Prov: total+GUT, alla sex terminer trots filtrerad årskurs, uttrycklig omfördelning, underskott under GUT, konflikt och förlorat svar med manuell läsning, MFA utan återutsändning, avbryt/fokus/aktivitet, initialt läsfel, okänd profil, bevarad nolla, felaktigt revisionssvar, senare ändring efter lyckad skrivning och osparad inlinecell.
- Ingen horisontell sidspillning, dialogknappar minst44px. Desktop- och telefonbilder visuellt granskade. Telefonmodalen rullas vertikalt; slutlig granskningsbild visar totalsumman, tre årskurskort och tillgänglig sparknapp.
- `npx tsc --noEmit`: PASS.
- `npx oxlint app/protected-gym-timplan-distribution.tsx app/protected-gym-timplan-hours.tsx`: PASS.
- `npm run docs:build`: PASS, statiska filer genererade. Docusaurus updater kunde inte skriva sin lokala uppdateringscache; dokumentationsbygget lyckades. Ingen publicering.
- `git diff --check` för ägda befintliga filer: PASS.

Lokala råbevis: `/private/tmp/timplan-distribution-ui-final.json`, `/private/tmp/timplan-distribution-ui-final.log`, `/private/tmp/timplan-auto-ui-types-final.log`, `/private/tmp/timplan-auto-ui-lint-final.log`, `/private/tmp/timplan-auto-docs.log`. Bilder under `/private/tmp/timplan-distribution-ui-final/timplan-distribution-total-9a5aa-arar-timmar-sparar-atomiskt-{desktop,phone}/distribution-review.png`.

Tidigare prov bevarade: första omgången6/12 PASS använde en600-poängs testplan som felaktigt väntades ge nationell GUT; fixture rättades till känd2500-poängsram utan ändrad GUT-produktregel. Andra omgången22/24 PASS: initialt läsfelsprov förväntade råservertext, medan API-klienten korrekt visade kodens säkra feltext. Assert ändrades till synligt fel och avbryt utan skrivning. Första lintomgångens React-effekt/ref- och semantikfynd rättades före slutlig kontroll. Fullständiga tidigare rapporter finns som `timplan-distribution-ui-first.json` och `timplan-distribution-ui-second.json` i samma privata tempkatalog.

## Gränser

Ingen aktiv databas eller port3012 ändrad av denna deluppgift. Faktisk Worker/OIDC-verifiering, kandidatbygge, release och push hanteras av huvudagenten. Ingen användaracceptans antas av automatiska prov. SS12000-mappningen i huvudplanen gäller: internt timplansförslag, inga kalenderhändelser, placeringar eller närvaroposter, oförändrade identifierare och klasskopplingar.
