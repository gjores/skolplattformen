---
phase: 05-bevarade-utbildnings-och-klassfloden
topic: planning-year
created: 2026-10-06
status: source_inspected
source_revision: 892eaf65f4a48073b6e9c967462c5ae1032ccf0a
worker_build_revision: 5dd7baf0fc0bd92d7b61f07e01020cef791e0908
scope: repository_discovery_only
---

# Färsk inventering inför läsårsstyrd planering

Kod och migrationskällor har lästs 2026-10-06. Detta är design-/kodinventering, inte en ny databas-, integrations- eller användarverifiering. Kodkartan i `.planning/codebase/` är från 2026-09-11 och beskriver delvis den gamla demovägen; nya skyddade datavägar nedan är kontrollerade i aktuell källa. Den befintliga prövade appservern ändras inte av planeringen.

## Befintliga byggstenar och luckor

| Område | Verifierad källa | Vad som finns och behöver göras |
| --- | --- | --- |
| Skyddad navigation | `web/app/protected-home.tsx` | Separata planvyer finns. `schoolYear` laddas från elevregistrets setup och läsårsväljaren är uttryckligen dold i program-/timplansvyer. Ny planeringskontext får inte ta över detta registerstate eller kräva elevregisteråtkomst. |
| Läsårsberäkning | `web/lib/pupil-register-model.ts` | `schoolYearRange` och `currentSchoolYear` använder 1 juli. `gradeForSchoolYear` räknar relativår från startår men saknar en särskild planprojektion. Årval behöver en separat parser/semantik för planering, inklusive okända startuppgifter. |
| Årväljare | `web/app/school-year-picker.tsx` | Pilar/select och aktuellt-år-markering kan återanvändas visuellt. Props är i dag registersetup och bara dess år. Planeringsväljaren måste fungera utan register-/kalenderposter. |
| URL och retur | `web/lib/protected-plan-location.ts` | Server-ID:n för utbildning, programplan, timplan och fryst underlag finns. Serialisering skapar ett nytt query utan planeringskontext. Kontraktet måste bevara separata planeringsparametrar, rätt skol-/årsval och säker back/reload. |
| Programplanslista | `web/app/protected-programplan-list.tsx`, `web/lib/programplan-workspace-contract.ts` | Listan hämtar i dag alla serverns 50-raderssidor och filtrerar lokalt. Request är bara `{page}`. Samordna servernär sök/filter/sortering/pagination och låt planeringsåret styra urvalet. |
| Gymnasiets timplanslista | `web/app/protected-gym-timplan-workspace.tsx` | Stora kort över programutbildningar och efterföljande skol-/versionsval. Ny tabell måste skilja programram, saknad timplan och verklig timversion; en knapp får inte se ut som en befintlig plan innan den har skapats. |
| Gymnasiets underlag | `web/lib/gym-timplan.ts`, `web/lib/server/gym-timplan.ts` | Skolvis beständig timversion med fryst källa, startdatum, poängterminer, sex timmar och allocated-mask. `source.startedOn` är användbart för exakt årsprojektion. Källa får inte bytas mot aktuell mutable utbildningsmetadata. |
| Aktuell inmatning | `web/app/protected-gym-timplan-hours.tsx`, `web/app/protected-programplan-board.tsx` | Gymtimmar sparas atomiskt över sex terminer per rad med kö, CAS och återläsning; `PlanGrid` i programplansbrädan har poängmatris och eget årskursval. Ett nytt synligt år måste styra visningen och lämna underliggande terminsindex/ID:n orörda. |
| Grundskola och IM | `web/app/protected-timplan-workspace.tsx`, `web/lib/server/timplan-planning.ts`, `supabase/migrations/20261004141000_phase5_timplan_units.sql` | Mandatbunden läsning/celländring av GR-/IM-planer finns. `phase5_read_timplan` bygger GR-kolumner från dagens `offerings.grades`, medan `timplan_cells` är positionsbundna; en fryst originalkolumnkarta saknas. Explicit klasskoppling anger årsversion/årskurs men bevisar inte originalpositionen. IM:s veckotid får inte räknas om till årstimmar utan faktisk kalender/undervisningsprofil. |
| Utbildningsstart och lås | `web/lib/programplan-lifecycle.ts`, `supabase/migrations/20261004120000_phase5_programplan_lifecycle.sql` | Faktiskt startdatum och status vid dagens datum finns. Äldre `start_year` kan vara kalenderår eller saknas. Valt planeringsår är separat från datumlås och rätt att ändra. |
| Klasskoppling | `web/lib/cohort-model.ts`, `supabase/migrations/20260908120000_cohorts_classes.sql` | `class_timplans.start_year` används som läsårets startår; `column_id` som planens årskurs. `classesWithBindings` filtrerar explicit på valt år. Tabellen har äldre namnnyckel som behöver kontrollerad klass-ID-resolver, inte automatisk omskrivning. |
| Beständiga klasser | `supabase/migrations/20260929100000_phase4_register_schema.sql`, `supabase/migrations/20261004140000_phase5_offering_unit_linkage.sql` | Klassens `start_year` och utbildningsrelation finns; inget generellt startårskursfält. Årskurs får inte gissas från klassens skapandeår eller namn. Skolkopplingar och befintliga placerings-/medlemskapsrelationer ska bestå. |
| Befintliga prov | `web/e2e/phase5-gym-timplan.spec.ts`, `work/pilot/phase5-gym-timplan-fixtures.mjs` | Bygg-/källguard, verklig Worker/Postgres, dator/telefon och helradsstädning finns. Års-/kontextproven behöver egna scenarier, inklusive fördröjda svar och registrering i annan kontext. |

## Designval och prövade alternativ

**Ett globalt läsår för hela appen** skulle läcka framtida urval till elevregistret. Det strider mot det senaste uttryckliga användarbeslutet och används inte.

**Ett lokalt år i varje planvy** behåller dagens splittring och tappar år/skola vid retur. Det uppfyller inte den sammanhängande planeringen.

**En separat planeringskontext över planvyerna** uppfyller beslutet och låter dagens elevregister behålla sitt urval. Detta väljs. Den får egna URL-fält, exempelvis `planeringslasar` och `planeringsskola`; de befintliga registerfälten `lasar`/`skola` används fortsatt bara av registret. URL normaliseras inom dagens uppdrag och är aldrig mandatbevis. Inga elevfilter eller personuppgifter kopieras till planeringsadresser.

Årsväljaren använder en explicit dokumenterad årsräckvidd, föreslagen 2000–2100 för kompatibilitet med befintliga klasskopplingar, och serverns aktuella läsår som default. Det är en produktmässig urvalsgräns, inte ett nationellt regelkrav. Att ett kalenderår ännu saknas ger `Kalender saknas` där den behövs och kräver inte en ny kalenderpost.

## Särskilda risker som planen måste täcka

1. `start_year` skapas i flera nuvarande utbildningskommandon med `extract(year from startedOn)`. En januaristart får därför inte direkt tolkas som HT-start samma år. Härled akademiskt startår från verifierat datum och håll oklart legacyunderlag synligt. Ingen backfill från `cohort`-text.
2. Relativ åk 1–3 är en normal kullprojektion, inte bevis för varje elevs progression eller en generell IM-modell. Omläsning/förlängd studiegång får inte döljas eller få nya relationer genom årsurvalet.
3. En äldre klasskopplad timversion måste kunna synas även om ett senare utkast finns. Utan årsbundet tillämpningsbevis ska vyn visa planeringsunderlag, inte historiskt beslut. Aktuellt planstatus och läsårets planeringsrelation visas som skilda uppgifter.
4. Gemensam programram kan ha flera skolor. Summering får inte dubblera ramar/alternativ; timmar följer skolans exakta timversion. Summa kulltimmar är inte lärartjänst utan grupper och samläsning.
5. Byte av år/skola/flik medan en rad sparas kan låta sent svar skriva in fel kontext. Befintlig osparatregistrering, epoch/generation och serialiserad sparning behöver ingå i årsnavigationen; dolda terminsvärden behålls.
6. HM och vissa planadministratörer saknar elevregistermandat. Planeringssetup/läsunderlag behöver egna avgränsade vägar och ska inte returnera elevpersonuppgifter. Att välja historiskt år får inte aktivera en historisk roll.
7. Nya läsvägar ska följa befintligt required-audit och exakt RPC-grantflöde. Klientfilter eller rena mockar bevisar ingen skolavgränsning. SQL-fixturer/Worker-/browserprov körs sekventiellt med egen städning; ingen reset.
8. Gamla 05-25–35 är omplaneringsmarkerade. Tabellen och autospar finns delvis i nyare kod. Inventera återstående del och migrationsjournal innan genomförande; kopiera inte gamla reserverade SQL-nummer eller återbygg redan levererad övergång.
9. Grundskolans årsbindning räcker inte för att välja rätt position i äldre timceller. `phase5_read_timplan` i `20261004141000_phase5_timplan_units.sql` använder föränderliga `offerings.grades`. Verifiera originalkolumnkartans källa, inklusive omordning med oförändrad bredd (`[7,8,9]` till `[8,7,9]`). Vid obevisbar karta ska årsbindningen fortfarande synas, medan årstimmarna blir okända och osäkra cellskrivningar spärras. Ingen gissad backfill krävs för första leveransen.

## Gräns för framtida moduler

S1/S3 ska kunna konsumera `kund + skola + planeringsläsår + period + exakta källreferenser`. Studieplan äger elevens konkreta studierader, timplan äger undervisningsbehov och schema äger tillfällen; planeringskontext äger urvalet. Underlag ändrar inte ägare genom att visas i en årsöversikt.

Faktiska tjänste-/schema-/studieplansfunktioner kräver egna planer och mandat. Här planeras bara kontrakt och anslutningspunkter, med synliga begränsningar för saknad kalender, elevplacering, grupporganisation och resursdata. Inga nya bibliotek, externa API:er, regelvärden, betalningsflöden eller personregisterintegrationer väljs av denna inventering.

Utförande och verifiering återstår enligt [genomförandestegen](05-PLANNING-YEAR-IMPLEMENTATION.md). [Samtalsbesluten](05-PLANNING-YEAR-CONTEXT.md) har företräde framför äldre förslag. Ingen SUMMARY/PASS för användarbeteende skapas av att planen är skriven.
