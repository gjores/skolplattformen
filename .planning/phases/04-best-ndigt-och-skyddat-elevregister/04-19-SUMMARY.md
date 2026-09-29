---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "19"
wave: 12
status: complete
completed: 2026-09-29
requirements-addressed: [STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02]
requirements-finally-verified: []
commits: [87d32e2, 6091162]
---

# Fas 4 plan 19: Hela elevflödet i webbläsare

Planens 13 namngivna fall kördes utan hopp mot det isolerade lokala `protected`-målet med syntetiska elever och riktig Keycloak-inloggning. **39/39 PASS** i desktop Chromium (1440×900), iPhone 13/WebKit-enhetsläge (390×844 samt 320×740 med ändrad viewport) och byggd protected-Worker i Chromium. Planens separata telefonkommando gav **13/13 PASS**. WebKit-enhetsläge är inte prov på fysisk telefon.

## Ändring och verifierat beteende

- Ett sammanhållet `phase4-register.spec.ts` använder samma fall i alla tre projekt. Det prövar återfinnande efter ny inloggning, två namnlika elever, säkert urval och lagring, elevkort, datumstyrda klass-/utbildnings-/hemkommunsändringar, ursprung, historik, avslutat skrivskydd, båda val vid simulerad källavvikelse, två olika administratörer med separat session och fält-/periodkonflikt, huvudmannens skyddsbeviljande/återkallelse och anonym rad, uttrycklig personnummerläsning och CSV-export, loggfel samt fördröjda 409-/CSV-svar efter utloggning i annan flik. Tillfälliga elevkopior städas med markör och målskydd. En andra syntetisk administratör med engångskod tillkom för samtidighetsprovet.
- Elevinnehåll och sökord kontrolleras mot URL, historiktillstånd och lokal/sessionlagring. Obehörig skyddssökning kontrolleras även i synlig text och `title`-/`aria`-/`data`-attribut; grundlistans anonyma rad finns kvar enligt D-19. Nätverksstatus och beständiga databas-/säkerhetsloggrader kontrolleras vid ändring, personnummer och export. Skärmbilder med endast syntetiska uppgifter sparas i gitignorerat testresultat.
- Responsivitet mättes i lista, kort och dialog vid 1440, 390 och 320 pixlar: ingen sidledsrullning och relevanta pekytor minst 44 px. Fokus återgår efter stängning, konfliktens rubrik får fokus, sökknappen kan nås med tangentbord i desktop/built och fokuseras i WebKit-enhetsläge; fel behåller inmatning. Det är automatiserad tillgänglighetskontroll, inte ett mänskligt användarprov.
- Ett nytt prov upptäckte att ett redan hämtat CSV-svar kunde starta nedladdning efter utloggning i annan flik. `clearSession` ogiltigförklarar nu väntande API-svar direkt. Verkligt fördröjd CSV och 409 återför därefter varken fil/Blob eller elevfält efter lås. Supportens specifika sluttidstext visas först efter serverbekräftad `assignment_expired`; två befintliga supportflöden skärptes till exakt text och passerade separat i desktop.

## Krav till prov

| Krav | Färskt lokalt bevis |
|---|---|
| STU-01, STU-05 | Namnlika elever, ny inloggning, stabilt ID, sökning utan beständigt sökord samt avslutad historisk placering i läsläge. |
| STU-02, STU-03 | Placering och klass över tid samt separata datumstyrda klass- och utbildningsbyten med databas- och historikkontroll. |
| STU-04, STU-06 | Hemkommun och ursprung; lokal rättelse mot simulerad källleverans med båda explicita val; två administratörers fält- och periodkonflikter utan tyst överskrivning. |
| DATA-01 | Huvudmannens beviljande och återkallelse, anonym projektion, nekad skyddssökning, personnummer endast efter tillåtet aktivt val, rensning vid lås och efter läsning. |
| DATA-02 | Uttryckligt urval och CSV i riktig webbläsare; loggrad före bekräftelse; loggfel stoppar ändring utan att förlora inmatning; sent CSV-/konfliktsvar stoppas efter utloggning. |

## Kontroller och gräns

`npx tsc --noEmit`, `npx oxlint app lib` med berörda e2e-filer, `node --test lib/*.test.mjs` (**334/334**) och `npm run build:protected` passerade. Den första fulla browserkörningen gav 38/39 när den lokala byggda förhandsvisningsservern tillfälligt stängdes före sista fallet; de två sista byggda fallen passerade tillsammans vid omprov, och därefter passerade hela matrisen sammanhängande **39/39**. WebKits utvecklingsserver skrev återkommande modulimportvarningar utan underkända fall; detta är inget bevis för fysisk telefonstabilitet.

Detta verifierar lokal syntetisk funktion. Plan 04-20:s samlade kravgrind, 04-21:s handbok/slutgrind, 04-22:s mänskliga användarprov och separat fasverifiering återstår. Ingen verklig kommunanslutning eller pilotdrift är godkänd; kraven markeras inte slutverifierade här.
