---
phase: 05-bevarade-utbildnings-och-klassfloden
package: CLASS-COHORT
status: scope_confirmed_plan_checked
date: 2026-10-15
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
---

# Tidigare klassorganisation — beslutad avgränsning

## Beställning och beslut

Användaren beställer nästa GSD-steg efter avslutad research och godkänt kopieringsprov. Nästa dokumenterade steg är en genomförbar plan för klass-/kullförbättringen. På omfattningsfrågan svarar användaren 2026-10-15: **”Följ förslaget med oförändrade mandat”**. Alternativen att utöka huvudmannens mandat eller ta med klasser från andra utbildningar valdes inte.

1. Rektor och skoladministratör med aktuellt skolmandat får förbereda tomma klasser inom samma skola, utbildning och kull. Huvudmannen kan läsa behörigt underlag och fortsätta programplansarbetet, utan ny rätt att skapa klasser.
2. Klassorganisation erbjuds när utbildning, skola och verifierat startdatum finns, före fastställd timplan. Visa befintliga klasser, erbjud namngivna tomma klasser med granskning före sparande och **Gör senare**. En tom lista får aldrig skapa något automatiskt.
3. Befintlig klass betyder en redan tillhörande klass. Urvalet är inget nytt medlemskap i utbildningen och får inte skriva om `offering_id`. En ny program-/timplansversion ska visa samma klasser. En kopierad kull ska börja utan originalets klasser, elever och länkar.
4. Koppling till fastställd timplan förblir en separat bekräftad operation med klass-ID, tillämpningsläsår, exakt version och årskolumn. Tidig klassbildning fastställer ingenting och placerar inga elever.
5. Visa utbildningens exakta startdatum, första läsår och aktuellt planeringsår som olika begrepp. Ett ärvt år utanför planens intervall ska förklaras utan att se ut som en tillåten koppling. Höst-/vårstart ska följa befintlig juli-gräns.

## Kodkontroll inför planeringen

Källor granskade på `bc26c07` den 2026-10-15; ingen databas eller provserver ändrad. Äldre `.planning/codebase/` är orientering, inte aktuellt körbevis.

| Källa | Bekräftat förhållande | Konsekvens för planen |
| --- | --- | --- |
| `web/app/protected-class-timplans.tsx` | Årsval förenar ärvt år med tre planår. Klasspanelen visas först för fastställd/ersatt timplan. | Separera begripligt årsval från tidigt klassflöde. |
| `web/lib/class-timplan.ts` | Strikta begärans-/svarskontrakt och requestbundet omförsök. | Ny funktion får eget kontrakt; bevara befintliga kvitton. |
| `20261012210000_class_timplan_flow.sql` | Skrivscope kräver fastställd plan; samma kund/skola/utbildning och fryst år prövas. | Nytt klasskommando ska använda aktuellt skolmandat utan timplanskravet; länkkommandots beslutsspärr består. |
| `20261012240000_class_start_calendar.sql` | Utbildningens kalenderstartår skiljs från första läsår. | Vårstart får inte ge falsk kullkonflikt. |
| `20260929100000_phase4_register_schema.sql` | En skolklass har stabilt UUID, utbildning och startår men saknar eget giltighetsdatum. Medlemskap har separata datum. | Utöka befintlig klassmodell additivt; ingen parallell planeringsklass. |
| `20261004140000_phase5_offering_unit_linkage.sql` | Senare FK går via utbildningens skolkopplingar; elevregistrets medlemskapsväg bevarar separata placeringsperioder. | Behåll stöd för flera skolor och säkra giltighetskontrollen även i befintliga medlemskapsvägar. |
| `20260908120000_cohorts_classes.sql`, `web/lib/cohort-store.ts` | Äldre länkar använder skola/klassnamn/läsår som nyckel. | Identitet och namn får inte förväxlas; se avgränsningen nedan. |

## Tekniska val för första etappen

Detta är genomförandeval inom beslutad omfattning, inte nya användarbeslut:

- Identifierade klasslänkar läses med klass-ID först. Äldre namnnyckel bevaras. Om två olika klass-ID:n med samma namn vill använda samma skolas/läsårs namnnyckel ska operationen avvisas begripligt med konflikt, utan adoption eller överskrivning. Namnbyte och full migrering av äldre nycklar är separat arbete. Prov ska visa både tillåten namnlikhet i olika kullar och denna begränsning vid överlappande länkår.
- Klassregistret har dessutom unik nyckel för skola/namn/startläsår. Samma namn kan användas vid olika startläsår, men samma skola/namn/startläsår avvisas även om utbildningarna skiljer sig. Första etappen bevarar denna namngräns och visar konflikten före en ny begäran.
- Nya klassers giltighetsstart är lika med exakt verifierad utbildningsstart och lagras på klassen med proveniens. Datumet visas före sparning; datumredigering är inte en ny funktion i denna etapp. Slutdatum lämnas okänt; härled inte ett slutdatum automatiskt från tre planår. Befintliga klassers okända datum ska inte fyllas med ett gissat datum. Ingen SS 12000-export av ofullständigt historiskt underlag påstås.
- Elevregistrets befintliga medlemskapsväg måste respektera nya kända klassdatum: medlemskap före klassens giltighetsstart ska avvisas på servern. Befintliga medlemskap och äldre okända klassdatum bevaras. Detta är en integritetskontroll för den nya klassmodellen, inte ett nytt elevplaceringsflöde.
- En klass ska inte flyttas när startdatum ändras i ett programplansutkast. Startändring efter klassbildning måste därför spärras i berörda servervägar, med besked att annan kullstart kräver en ny utbildning/kull. Ny planversion med oförändrad start ska fungera. Kontrollerna ska bevara befintliga klasser, medlemskap, skolkopplingar och beslut.
- Gruppskapning sker atomärt med serverkontroller, revisionskontroll, audit och requestbundet kvitto. Ett osäkert svar återhämtas med samma begäran. Nytt läs-/skrivkommando får inte ge direkta tabellrättigheter eller förlita sig på klientens rollval.
- Befintligt timplansbundet klasskapande måste följa samma regler för nya klassers datum/proveniens; historiska kvitton ska kunna återläsas oförändrade. Befintlig uttrycklig adoption av en entydig äldre namnkoppling bevaras med exakt föregående plan/revision. Tyst eller tvetydig adoption är fortsatt förbjuden.

## Utanför paketet

Import/matchning av externa klasser, klasser från andra utbildningar, blandade utbildningar i samma klass, flytt/delning/sammanslagning, nytt huvudmannamandat, automatisk överlämningsuppgift, elevplacering och schema ingår inte. Käll-/ID-konflikter ska visas, inte lösas genom namnmatchning. Läs [SS 12000-mappningen](05-CLASS-COHORT-SS12000.md) före implementation.

Kopierings-, skol-, års-, besluts- och versionsprovens tidigare godkännanden består och ska inte begäras igen. Nya automatiska bevarandeprov är tillåtna och nödvändiga där funktionerna berörs. Ett framtida mänskligt prov ska avse just det nya klassflödets begriplighet.

## Spårning och acceptans

ADMIN-04/PLANERING-04 gäller korrekt klass-/års-/versionskoppling; ADMIN-03 är bevarandekrav för kullkopiering; PLANERING-05 gäller nya faktiska skyddade prov och handbok. Planpaketet ska visa uppgift, verifieringsfall och resultat för dessa krav. Historiska 88/100 och 3/8 räknas inte om genom att nya planer skrivs. Fas 5:s slutacceptans, fas 4:s checkpoint, äldre integritetsavvikelser, prestandabacklogg och verklig kommunanslutning är separata.

Nästa steg efter planering och plancheck är `gsd-execute-phase` för endast [CLASS-COHORT-paketet](05-CLASS-COHORT-IMPLEMENTATION.md), i dess beroendeordning. Äldre fasplaner med samma vågnummer ska inte startas.
