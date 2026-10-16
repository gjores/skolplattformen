---
phase: 05-bevarade-utbildnings-och-klassfloden
gap: CLASS-COHORT-UX-01
status: open_awaiting_user
created: 2026-10-15
requirements: [ADMIN-04, PLANERING-04, PLANERING-05]
---

# Öppen användbarhetslucka: skapa klasser och koppla till timplan

## Aktuellt2026-10-16

Godkänd mockupriktning är implementerad och lokalt levererad i NAMED-TIMPLANS-UX01–12: synliga sparade klasser, granskning och flerval, separata namngivna timplansserier, egna versioner/beslut och årsöverblick. Faktisk isolerad verifiering 38/38 PASS på dator/telefon med riktiga lokala OIDC-/SQL-kedjor. Efter uttryckligt användargodkännande är fem migrationer installerade och samma testade bygge kör på 3012; läsande OIDC och bevarandekontroller passerar. [Verifiering](05-NAMED-TIMPLANS-UX-VERIFICATION.md) och [leveransresultat](05-NAMED-TIMPLANS-UX-12-SUMMARY.md). [Begriplighetsprovet](05-NAMED-TIMPLANS-UX-USER-TRIAL.md) är `awaiting_user`. Gapet kvarstår tills användaren har bedömt tydligheten. Modell-/kodbeskrivningen nedan är ursprunglig felhistorik, inte dagens implementation.

## Underlag och avgränsning

Användaren behövde först hjälp att hitta sparningen av nya klasser. Därefter tolkades rullistan **Befintliga klasser** i programplanens klasspanel som valet för timplanskoppling: ”det är bara en drop down så jag kan bara välja en”. Skärmbilden visar två sparade klasser och en lista som endast väljer vilken klass uppgifter visas för. Efter vägledning till timplanens separata kopplingsflöde svarade användaren ”så nu fuunkar det”. Detta registreras som användarrapporterat fungerande två-klasser-till-en-timplan-flöde efter handledning. Ingen ny databasinspektion eller separat automatisk tvåklassverifiering har gjorts som följd av svaret.

Användaren begär därefter uttryckligen ett gap eftersom flödet fortfarande är otydligt, och en detaljerad prompt till Claude Design att använda med skärmdumpar. Funktionen är inte rapporterad trasig; begripligheten är inte godkänd. Tidigare funktionellt godkännande behålls med denna uttryckliga begränsning.

Kodkontroll: `web/app/protected-class-cohorts.tsx` visar en klass i taget utan att ändra koppling. `web/app/protected-class-timplans.tsx` sparar en klasskoppling åt gången, behåller valet efter sparning och inaktiverar knappen för redan kopplad klass. Datamodellen tillåter flera klasser per timplan. Det befintliga faktiska A01-provet skapar två klasser men kopplar endast en; automatiskt två-till-en-prov behöver ingå vid rättning.

## Önskat resultat

- Skillnaden mellan sparad klass, vald klass och koppling till timplan framgår utan chattinstruktioner.
- Användaren hittar spara och nästa steg mellan programplan, klasser och timplan.
- Flera klasser och deras status är synliga samtidigt. Gemensamt val och koppling av flera klasser ska utforskas i designen; transaktionsbeteende är ännu inte beslutat eller implementerat.
- Skola, utbildning, tillämpningsläsår och fastställd timplansversion är begripliga och granskningsbara.
- Återhämtning och tekniska statusåtgärder visas i relevant situation, utan att viktiga fel eller osäkra sparningar döljs.

## Nästa steg och stängningskriterier

### Utökat användarbehov: namngivna parallella timplaner

Användaren preciserar 2026-10-15 att timplanerna måste kunna benämnas tydligt och att A-klassen kan behöva betydligt mer matematik än B-klassen, trots samma programplan. Behovet omfattar därför självständiga timfördelningar för samma utbildning och skola, med begripliga namn och synlig klasskoppling. Detta är ett beställt funktionsbehov, ännu inte implementerat. Modellutökningen ska planeras separat från rena presentationsändringar inom gapet.

- Exempel på benämningar att pröva: **SAM 2028 – grundfördelning** och **SAM 2028 – utökad matematik**. Namn är användarvalda; klass, läsår, version och beslutsstatus visas som separata uppgifter. En plan kan delas av flera klasser och ska inte vara låst till ett klassnamn.
- Skilj **ny separat timplan** från **ny version av samma timplan**. Varje separat timplan behöver egen stabil identitet, versionshistorik och beslutskedja. Att fastställa en av dem ska inte ersätta den andra. Dagens modell har en aktuell fastställd version per utbildning/skola och behöver därför ändras; äldre ersatta versioner ska inte användas som lösning för parallella planer.
- Användaren ska kunna utgå från en befintlig fördelning, namnge en separat plan och ändra matematiktiden för den. Extra timmar ändrar inte automatiskt programplanens poäng eller andra ämnens timmar. Tillämpliga timkrav och kontroller behöver hanteras i genomförandeplanen.
- Visa vilka klasser som använder varje plan för valt läsår samt skillnader i ämnestimmar och total tid. Omdöpning får inte ändra kopplingar eller identiteter; hantering av lika namn och historisk namnpresentation ska bestämmas före implementation.
- Verifiera två samtidigt fastställda namngivna planer från samma programunderlag på samma skola: A använder planen med fler matematiktimmar, B använder grundfördelningen. Ny version eller ändrat namn för A:s plan får inte ändra B:s plan, klasskoppling eller andra läsår. Bevara även stöd för flera klasser på samma plan och explicit granskning vid byte.

SS 12000-avstämningen ska omfatta den nya interna timplansidentiteten och bevarade klass-/organisationsrelationer enligt befintlig mappning. Ingen direkt standardmappning för namngivna timplansvarianter antas. Käll-/skrivansvar, migrering av befintlig versionskedja och beslut, servermandat och verifieringsfall kräver en genomförbar modell-/API-plan innan kod ändras.

### Genomförande och verifiering

1. Använd [Claude Design-prompten](05-CLASS-COHORT-CLAUDE-DESIGN-PROMPT.md) tillsammans med skärmdumpar. Designförslag är underlag, inte beslutad implementation.
2. Granska förslaget och skriv en avgränsad GSD-plan med berörda komponenter, API-behov, handbokssidor och SS 12000-avstämning. Återöppna inte redan godkända orelaterade flöden.
3. Implementera och verifiera på dator och telefon. Prova två olika klasser till samma timplan och samma läsår, återläsning, befintlig koppling, versionsbyte för enbart vald klass/valt år samt avbrott med osäker sparstatus. Säkerställ oförändrade mandat och skydd.
4. Ett nytt avgränsat begriplighetsprov ska visa att användaren utan muntlig/chattbaserad stegledning kan skapa två klasser, förstå att de är sparade, koppla båda och identifiera resultatet. Dokumentera faktiskt provad enhet och resultat. Gapet stängs först efter detta, inte efter enbart mockup eller gröna tekniska tester.

## SS 12000 och säkerhet

Utgå från befintlig [mappning mot SS 12000:2024/OpenAPI 2.1.0](05-CLASS-COHORT-SS12000.md). Klassens stabila ID, organisation och giltighet samt elevens medlemskap ska bevaras. Klass är skild från undervisningsgrupp; timplansversion/läsår är en intern relation, inte klassidentitet. Designarbetet ändrar inga kontrakt och innebär inget verifierat standardutbyte. Om förslaget kräver nya skrivvägar ska käll-/skrivansvar, servermandat, MFA, konfliktkontroll och återhämtning planeras före implementation.

Samordnas med [samlad UI-genomgång](../../todos/pending/2026-09-29-genomgang-av-ui-pa-dator-och-telefon.md). Det är ett konkret gap inom fas 5, inte en ny beslutad helombyggnad eller en ändring av genomförda paketplansantal.
