---
created: 2026-10-06
title: Tabellöversikter med sökning, filtrering och sortering för programplaner och timplaner
area: planering
status: pending
phase: "05"
requirements: [ADMIN-02, ADMIN-04, PLANERING-03]
files:
  - web/app/protected-programplan-list.tsx
  - web/app/protected-gym-timplan-workspace.tsx
  - web/app/protected-gym-timplan.css
  - web/app/protected-timplan-workspace.tsx
  - docs/handbok/programplaner.md
  - docs/handbok/timplaner.md
---

## Användarbeslut och nuläge

Användaren beställde 2026-10-06 att timplaner ska presenteras i en tabell som programplanerna och att båda tabellerna ska stödja sökning, filtrering och sortering. Beställningen ska registreras som todo för senare genomförande.

Skärmbilden visar gymnasiets startlista på `/?vy=timplaner`, där utbildningar/programramar visas som stora kort. Aktuell kod i `protected-gym-timplan-workspace.tsx` bekräftar kortlistan med sidindelning. Programplanernas översikt har redan tabell, fritextsökning, skolfilter och visning av arkiverade utbildningar, men endast en fast namnordning. Uppgiften gäller översikterna där användaren hittar och öppnar planer; de öppnade planernas poäng- och timmatriser är separata vyer.

## Samordnad GSD-plan 2026-10-06

Det senare röstbeslutet gör läsår och skola till ett gemensamt urval inom planeringen, med separat elevregisterår. Tabellerna ska därför genomföras i [05-36–43](../../phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-IMPLEMENTATION.md), särskilt 05-40, utifrån samma verkliga års-/kull-/skolunderlag. [Läsårslins-todon](2026-09-12-l-s-rslins-st-lla-sig-i-ett-l-s-r-som-i-plan-digital.md) samordnas utan dubbla listimplementationer. Befintliga terminsmatriser/radvis sparning återanvänds. Läs [kontext](../../phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-CONTEXT.md) och [färsk kodinventering](../../phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-DISCOVERY.md).

Status är fortsatt pending: planen är skriven, tabell-/sök-/filter-/sorteringsförändringen är inte implementerad eller användarprovad.

## Planerad förändring

- Ge timplanernas översikt samma tabellprincip som programplanerna. Användaren ska kunna hitta och öppna rätt timplan för rätt skola och elevkull. Skilj tydligt mellan tillgänglig programram, ännu inte skapad timplan och befintlig timplansversion.
- Samordna sökning, filter och valbar sortering i båda planöversikterna. Utgå vid planeringen från namn/utbildning, program/inriktning, skola, elevkull, status och version; bestäm relevanta kolumner och filter utifrån respektive plans underlag.
- Låt sökning och filter kombineras och återställas. Visa antal träffar och ett begripligt tomt resultat. Sortering ska kunna växlas i stigande/fallande ordning med tydlig vald sortering.
- Säkerställ att sökning och sortering omfattar hela det behöriga urvalet, även över sidgränser. Bevara mandat, explicita skol-/plan-/versionsidentiteter, tidigare versioner och befintliga öppnings-/returflöden.
- Anpassa tabellerna för dator och telefon och uppdatera berörd handbok när beteendet implementeras. Samordna gymnasiet och grundskola/introduktionsprogram där det är relevant.

## Verifieringsmål, ännu inte genomförda

- Rätt programplan och timplan kan hittas och öppnas via respektive tabell, även när flera skolor/elevkullar har samma utbildningsnamn.
- Fritext, kombinerade filter, återställning, stigande/fallande sortering och tomma träffar fungerar på dator och telefon.
- Ett urval större än en sida ger samma korrekta sök-/filter-/sorteringsresultat över hela urvalet. Planer utanför aktuellt mandat visas inte.
- Äldre versioner, frysta programplansunderlag och klasskopplingar bevaras. En programram visas inte som en redan skapad timplan.

Relaterat: [samlad UI-genomgång](2026-09-29-genomgang-av-ui-pa-dator-och-telefon.md), [genomförd programplan–timplan-övergång](../../phases/05-bevarade-utbildnings-och-klassfloden/05-PROGRAMPLAN-TIMPLAN-TRANSITION-SUMMARY.md) och [timplanernas omplaneringsunderlag](../../phases/05-bevarade-utbildnings-och-klassfloden/05-TIMPLAN-IMPLEMENTATION.md).

Status: registrerad användarbeställning, **inte implementerad**. Genomförande och användarprov återstår enligt den samordnade planen; fulla huvudkrav och fasstatus är fortsatt öppna.

## Tekniskt verifierat och levererat i05-43

40:s fullL36 och42:s fullO36 verifierar verkliga mandatbundna tabeller, kod-/namnsökning/filter/sort/50+2 och exakta versioner på dator/telefon.43:s slutC/release/3012 med18 före/efter är levererade. Tekniskt verifierad implementation; mänskligt tabellprov awaiting_user. Äldre status ovan är historik. Fulla ADMIN-/PLANERING-krav kvarstår. Se [slutredovisning](../../phases/05-bevarade-utbildnings-och-klassfloden/05-43-SUMMARY.md).

## Användarsvar2026-10-09

Användaren godkände det presenterade samlade årsplaneringsprovet med ”allt fnukar”. Enskilda sök-/filter-/sorteringssteg och enhet särredovisades inte; godkännandet är inget separat fullständigt tabellprov. Tekniska bevis och kvarstående fullkravsgränser består.
