---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-05
status: complete
subsystem: apl-planning-ui
requires: [APL-04, APL-04A]
affects: [APL-08, APL-10]
---

# APL-05 – perioder, varavtid och säker återhämtning

Yrkesprogrammets timplan har en egen APL-arbetsyta med periodnamn, datum, läsår, uttryckligt veckounderlag, ämnesinnehåll och heltalsminuter. Sammanfattningen skiljer total undervisningstid, varav APL, granskade hela veckor och återstående skolförlagd tid. Okänt underlag blir inte noll. Granskning visar före/efter utan att ändra totaltiden. Sparat underlag, rektors innehållsbundna bekräftelse och huvudmannens fastställande är olika steg.

## Genomförande

- `protected-apl-plan.tsx/css` äger APL-utkast och explicit sparning/bekräftelse. Kontrollerna härleds från strikt verifierad aktuell timplan och APL-läsning; ett historiskt kvitto ersätter aldrig aktuell plan.
- Journalen lagras och återläses i flikens sessionslagring före mutation. Den binds till stabil identitet, kund, medlemskap, uppdrag, skola, plan och version. `protected-home` tillför en hash av verifierad issuer/subject utan tokens. Återhämtning kräver uttrycklig statusläsning och vid behov exakt omsändning.
- Timceller, APL, klasskoppling och beslutsdel använder samordnade spärrar. Pågående/oklart sparande hindrar navigation; vanligt osparat utkast kräver uttryckligt kassationsval. Plan-/uppdragsbyte får inte återanvända ett annat underlag.
- Fastställd eller ersatt timplan erbjuder nästa version även när den gamla versionens `canPlan` är false. Funktionen återläser och kontrollerar skolans aktuella `unit.canPlan` innan fortsättningen. Detta utvidgar inte servermandatet.
- Befintliga browserfixturer för klassorganisation, programplanskopiering och årsöversikt använder det versionsmärkta beslutskontraktet. Ett separat äldre beslutsharness är uttryckligen markerat `legacy`.

## Verifiering

Slutkörning `/private/tmp/apl05-browser-final.txt` och `/private/tmp/apl-plan-ui-results.json`: **44/44 PASS**, 22 scenarier vardera i Chromium på dator och WebKit på telefon, retries 0. Alla verksamhetssvar är syntetiska i denna svit; det är inte faktisk databas/OIDC-verifiering.

Proven omfattar 14/15 veckor, blandveckor, minutprecision och dubbelräkning, överallokering, explicit datum/läsår, sparning/status/replay, senare revision efter gammalt kvitto, lagringsfel före mutation, indraget mandat, skola/uppdrag/namngiven plan, låsta timceller/beslut, skol-/läsårs-/Tillbaka-navigation och ny versions mandatkontroll. En återfunnen journal följd av nätfel håller fortsatt andra skrivningar spärrade.

Samordnarens slutkontroll: **91/91** modell-, journal-, APL-server- och beslutsprov, `npx tsc --noEmit` och full `npx oxlint app lib`: PASS. Oberoende kodgranskning och granskade dator-/telefonbilder visar läsbara periodfält, sammanfattningar och separata ansvarssteg. Handbokens knappar och flöde i `docs/handbok/timplaner.md` stämmer; byggd/bildgranskad handbok redovisas i APL-06.

Före de sista avgränsade UI-rättningarna passerade dessutom **150/150** befintliga dator-/telefonprov: usability/klassorganisation104, programplanskopiering24, namngiven årsöversikt22. Dessa rapporteras som förefixbevis. De nya rättningarna prövas av slutkörningens44 och slutlig typ/lint ovan; ingen onödig full omkörning påstås.

## Upptäckta fel och rättningar

Tidiga körningar hade HMR-störning och inexakta select-lokatorer. Lokatorerna korrigerades och produktfilerna frystes inför slutkörningen. Därefter upptäcktes ett lagringsfelbesked bakom granskningsdialogen: dialogen stängs nu vid utebliven journalpersistens medan utkastet bevaras. Journalen aktiveras direkt efter verifierad lagringsläsning, före nätanrop, och okontrollerbar lagring spärrar fortsatt skrivning. En WebKit-fixture väntar nu på aktiverad statusknapp före nästa händelse. Nyversionsvillkoret rättades enligt ovan. Först efter dessa rättningar passerade alla44.

## Bevarande och kvarstående arbete

Ingen aktiv databas, IdP eller3012 ändrades. Stabil skol-/planidentitet, giltighet och mandat beaktas enligt SS12000:2024 utgåva4/OpenAPI2.1.0 i APL-kontraktet. Inget externt utbyte, elevplacering eller faktisk närvaro införs. APL-08 ska verifiera samma byggda produkt med faktisk Worker/OIDC. APL-09 installation och APL-10 mänsklig begriplighet återstår; inget av dem följer automatiskt av komponentproven.
