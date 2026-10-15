---
phase: 05-bevarade-utbildnings-och-klassfloden
gap: CLASS-COHORT-UX-01
status: open_design_requested
created: 2026-10-15
requirements: [ADMIN-04, PLANERING-04, PLANERING-05]
---

# Öppen användbarhetslucka: skapa klasser och koppla till timplan

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

1. Använd [Claude Design-prompten](05-CLASS-COHORT-CLAUDE-DESIGN-PROMPT.md) tillsammans med skärmdumpar. Designförslag är underlag, inte beslutad implementation.
2. Granska förslaget och skriv en avgränsad GSD-plan med berörda komponenter, API-behov, handbokssidor och SS 12000-avstämning. Återöppna inte redan godkända orelaterade flöden.
3. Implementera och verifiera på dator och telefon. Prova två olika klasser till samma timplan och samma läsår, återläsning, befintlig koppling, versionsbyte för enbart vald klass/valt år samt avbrott med osäker sparstatus. Säkerställ oförändrade mandat och skydd.
4. Ett nytt avgränsat begriplighetsprov ska visa att användaren utan muntlig/chattbaserad stegledning kan skapa två klasser, förstå att de är sparade, koppla båda och identifiera resultatet. Dokumentera faktiskt provad enhet och resultat. Gapet stängs först efter detta, inte efter enbart mockup eller gröna tekniska tester.

## SS 12000 och säkerhet

Utgå från befintlig [mappning mot SS 12000:2024/OpenAPI 2.1.0](05-CLASS-COHORT-SS12000.md). Klassens stabila ID, organisation och giltighet samt elevens medlemskap ska bevaras. Klass är skild från undervisningsgrupp; timplansversion/läsår är en intern relation, inte klassidentitet. Designarbetet ändrar inga kontrakt och innebär inget verifierat standardutbyte. Om förslaget kräver nya skrivvägar ska käll-/skrivansvar, servermandat, MFA, konfliktkontroll och återhämtning planeras före implementation.

Samordnas med [samlad UI-genomgång](../../todos/pending/2026-09-29-genomgang-av-ui-pa-dator-och-telefon.md). Det är ett konkret gap inom fas 5, inte en ny beslutad helombyggnad eller en ändring av genomförda paketplansantal.
