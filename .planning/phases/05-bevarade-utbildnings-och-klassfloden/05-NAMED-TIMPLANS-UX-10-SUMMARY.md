---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-10
status: prepared_ui_mock_verified
subsystem: planning-context-and-named-overview
completed: 2026-10-15
---

# Namngivna timplaner 10 – tydliga listor och årsöverblick

Gemensam skola/läsår ligger kvar inom räckhåll. Listan visar namngivna timplaner separat, och programplanraden visar alla returnerade skolreferenser med uttryckligt val av exakt plan och version. Årsöverblicken grupperar skola, utbildning, kull och relativ årskurs med timmar och klassantal per planversion. Klasser-genvägen vid en fastställd eller ersatt plan öppnar och fokuserar klasskortet utan att återställa markering eller kommandokö.

Detta är verifierade rena navigationskontrakt och syntetiska produktkomponentprov. Plan 11:s faktiska server-/SQL-/OIDC-kedja samt lokal leverans och mänsklig begriplighetsbedömning återstår. Ingen fullfasacceptans anges.

## Genomförande och avgränsning

- Provider, requestChange, mandat, scope och navigationsspärrar återanvänds. Ingen konkurrerande årsstate eller ändring av elevregisteråret.
- URL bygger på exakt plan-ID, skola, utbildning och version, aldrig namn eller största versionsnummer. Äldre klassbundna versioner och två separata version 1 kan öppnas var för sig.
- Programplanens flera schoolTimplans visas med egna namn/status/källversioner. Ingen implicit index 0-väljare. Äldre explicit legacyformat stöds fortfarande av befintlig kontraktsväg.
- Årsunderlaget visar variantspecifika årstimmar; delvis okända timmar och prognos förblir tydliga. Programramens poäng dedupliceras på källa. Totalsformen bevaras, med exakt etikett **Summa i de visade timplanerna**. Klassantal multiplicerar inte timmarna; summan påstås inte vara bemanningsbehov.
- Samordnarens uttryckliga avgränsning: årsreaden har klass-ID:n och ämnesnycklar, inte namn eller ämnesdetaljer. Ingen ny lazy detaljläsning eller kontraktsutökning har lagts till. Årsraden visar verifierat klassantal och timmar per namngiven version; **Öppna timplan** leder till ämnesraderna och den smala **Klasser**-genvägen. Jämförelse av själva matematikraden görs i respektive plan, inte som påstått ämnesmått i årsöverblicken.
- Mobil har kompakt sammanfattning och utfällbara filter/källa/summor. Tryckmål, tangentfokus och 150 procent textstorlek har kontrollerats med faktisk viewportbredd.
- GR årsbindning/kolumn och IM veckomått bibehålls. Inga nya GR-/IM-regler.

## Ändrade filer för denna leverans

- `web/app/planning-context.tsx`, `web/app/planning-context.css`
- `web/app/protected-plan-list.tsx`, `web/app/protected-plan-list.css`
- `web/app/protected-programplan-list.tsx`
- `web/app/protected-planning-overview.tsx`
- `web/app/protected-home.tsx` – smal onOpen-inkoppling till befintlig navigation.
- `web/lib/protected-plan-location.ts`, `web/lib/protected-plan-location.test.mjs`
- `web/app/protected-gym-timplan-workspace.tsx`, `web/app/protected-class-timplans.tsx` – efter samordning med 08/09: endast Klasser-genvägens request/fokus/öppning, ingen remount eller ny kö.
- `web/e2e/named-planning-overview.spec.ts`
- `web/e2e/fixtures/named-planning-preview.html`, `web/e2e/fixtures/named-planning-preview.tsx`
- `web/playwright.named-planning.config.ts`
- `web/e2e/usability.spec.ts` – anpassade pluralnamn samt två tidigare källbytesfall till 08:s namngivna kontrakt och Granska/Bekräfta-flöde.

Handbokens avslutande översyn och dokumentationsbygge hör till plan 12 och lämnas separat. Övriga parallella ändringar ägs inte av detta delarbete.

## Slutlig verifiering

Kommandon i `web/`. Mockserver endast port 5194. Användarens aktiva appar och data har inte muterats eller startats om.

- `node --test lib/protected-plan-location.test.mjs`: **35/35 PASS**. Exakt ID trots lika namn/versioner, årsbevarande och GY/GR/IM-roundtrip.
- `npx --no-install tsc --noEmit`: **PASS**.
- `npx --no-install oxlint app/planning-context.tsx app/protected-plan-list.tsx app/protected-programplan-list.tsx app/protected-planning-overview.tsx app/protected-class-timplans.tsx app/protected-gym-timplan-workspace.tsx app/protected-home.tsx lib/protected-plan-location.ts e2e/named-planning-overview.spec.ts e2e/fixtures/named-planning-preview.tsx e2e/usability.spec.ts`: **PASS**.
- `npx --no-install playwright test --config=playwright.named-planning.config.ts`: **22/22 PASS**, Desktop Chrome och iPhone 13/WebKit. Flera varianter, äldre klassbunden version, 80 rader/sök/sort/sidor, Back/reload, år/vårstart/tomtår, okänd data, konflikt, uppdragsbyte, okändskrivningsspärr, mått/fokus/zoom, GR/IM samt Klasser-genväg med bevarad markering och noll skrivningar.
- `npx --no-install playwright test e2e/usability.spec.ts --config=playwright.usability.config.ts --output=/private/tmp/named-planning-regression-final`: **42/42 PASS** efter uppdatering av äldre 08-fixturer.
- `npx --no-install playwright test --config=playwright.named-class-links.config.ts --output=/private/tmp/named-planning-class-regression`: **32/32 PASS efter slutlig produktkod**, inklusive genvägstillägg och tidigare selecthöjd. Kö/MFA/reload/delvis sparat/mandat/lagringsfel/44px återprövade.
- Desktop-, telefon- och zoomskärmbilder lästa visuellt. Fullsidesskärmbilder placerar sticky-kontexten vid det aktuella scrolläget; detta är inte en layoutskiss eller bevis för faktisk integration. Slutligt zoomprov jämför document.scrollWidth med fast viewportbredd, inte innerWidth som WebKit kan utvidga.

## Faktisk felhistorik

1. Första utbyggda 16-provskörning gav 11 PASS: vårstartsmock saknade obligatorisk diagnos, årsselectens selector träffade även pilknappar och mobil zoom avslöjade överströmning. Mock/selector rättades. Långa svenska etiketter fick overflow-wrap; strikt viewportmätning lades till. Efterföljande 20/20 och slutliga 22/22 passerade. En tidigare svagare innerWidth-kontroll betraktas inte som bevis för frånvaro av overflow.
2. Ett kallstartsprov översteg standardväntan 5 sekunder medan transformering pågick. Den isolerade konfigurationens expect-timeout sattes till 15 sekunder. Ingen produktändring gjordes för detta.
3. Första 22-provet gav 20 PASS: nya genvägens mock saknade parallell `/api/planering/lista`-läsning. Komplett tomt listread-svar gav slutliga 22/22.
4. Första breda usabilitykörningen gav 38/42: två äldre källbytesfall per enhet använde borttagna 08-knappar och saknade namnmetadata. Uppdaterade kontrakt och verkliga Granska/Bekräfta-steg gav 42/42. Förslagsfallets frånvaroassertion i denna regression är svag utan separat sidredoassertion; 08:s egna tester är det starkare beviset för detta beteende. Det bevisar ingen separat servermutation.
5. Ingen initial TDD-RED påstås. Nodeprovets första assertion jämförde rå URL-parser med normaliserat urval; normaliserad roundtrip rättades och 35/35 passerade.

## Råbevis

- `/private/tmp/named-planning-pass-22.json`, SHA-256 `4fd60c0c75173e69a999fd777e780229ab773d230ef2b3e7d07371ec6497e0bd`.
- `/private/tmp/named-planning-regression-pass-42.json`, SHA-256 `93ec220d5b1382da3b95c256f19fc05415897a2b12f0dcc48853e798dab1876c`.
- `/private/tmp/named-planning-class-regression-pass-32.json` och `/private/tmp/named-planning-class-regression/`.
- Historik: `/private/tmp/named-planning-first-fail-16.json`, `/private/tmp/named-planning-first-20of22.json`, `/private/tmp/named-planning-regression-first-38of42.json`.
- Slutliga bilder: `/private/tmp/named-planning/` med `annual-variants.png` och `annual-zoom.png` under respektive desktop-/phonefall.

## SS 12000 och kvarstående gräns

SS 12000:2024/OpenAPI 2.1.0 enligt paketets mappning. Stabil klass-/organisationsidentitet, giltighet och medlemskap ändras inte. Timplansserie och årsöverblick är interna planeringsbegrepp. Inget verifierat informationsutbyte påstås. Root hanterar granskning, commit/push, faktisk 11-verifiering och leverans. Utföraren har inte committat eller ändrat godkännandestatus.
