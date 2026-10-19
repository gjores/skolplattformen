---
created: 2026-10-07
updated: 2026-10-16
title: Stöd för lärares arbetstid och rektors tjänstebedömning
area: tjanstefordelning
status: moved
moved_on: 2026-10-19
moved_to: "repot tjanstebedomning (/Users/petter.gjores/dev/tjanstebedomning)"
proposed_requirements: [TID-01, TID-02, TID-03, TID-04, TID-05, TID-06, TID-07, TID-08, TID-09, TID-10, TID-11, TID-12]
related_requirements: [GROUP-01, SCHEMA-01, SCHEMA-03, SCHEMA-07, SCHEMA-08, LLEG-03, PLANERING-05, ACL-02, ACL-04]
phase: "ingen — utflyttad ur Skolplattformen 2026-10-19"
files:
  - .planning/research/LARARTID-OCH-TJANSTEBEDOMNING-2026-10-16.md
  - .planning/research/LARARES-TID-SFS-2026-1487-2026-10-07.md
---

**Flyttad 2026-10-19.** Användaren: tjänstebedömningen är ”en helt annan grej som bara råkade hamna i det här projektet. Det ska ha flyttats ut helt.” T1–T4 och TID-01–12 hör nu till repot `tjanstebedomning`. Tjänstefördelningen (TJANST-01–07) ligger kvar i Skolplattformen som fas 05.1. Se [beslutsdokumentet](../../phases/05.1-tjanstefordelning/05.1-SPLIT-DECISION.md). Texten nedan är historik.

## Beställning som består och ny research

**Senaste beslut 2026-10-16:** Användaren beställer en samlad GSD-plan för avtal, rektors bedömning och tjänstefördelning. [Planpaketet](../../phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md) konkretiserar T1–T2 och TJANST-01–06. **Rektor fastställer; huvudmannen följer upp. Huvudmannen väljer olika kollektivavtal.** Beslutskedjan ska inte frågas om igen. Aktuella källor och lokala tillämpningar granskas när profiler bereds; inget enskilt avtal låses för alla huvudmän. Planering är inte implementation eller leveransacceptans.

2026-10-07: Appen ska redovisa undervisningstid samt planering/uppföljning och stödja rektor och huvudman i att följa SFS 2026:1487. En timme är 60 minuter och regler ska vara versionsbundna data. Behovet ingår i den tidigare beställda ersättningen av Plan Digital; detta ska inte efterfrågas igen.

2026-10-16: Användaren beställer research om val av olika kollektivavtal, individuell tjänstebedömning och motivering, lärarkategorier, arbetstid/förtroendetid, mentorskap, uppföljning, undvikande av dubbelräkning och hur stor andel av tiden som förläggs i schema.

[Researchen](../../research/LARARTID-OCH-TJANSTEBEDOMNING-2026-10-16.md) är klar och innehåller rekommenderat flöde, avtalskällor, räkneexempel, färsk kodinventering, SS 12000-avstämning och framtida verifieringsfall. Föreslagna funktioner och etapper är inte genomförda eller godkända som leverans.

## Rättad regelgrund

Förordningen träder i kraft 2027-07-01. Gymnasiets grundnivå för planering/uppföljning är **120 procent**, alltså 600 timmar vid 500 undervisningstimmar. Kravet på lärarens eget initiativ gäller **11 § första stycket punkt 1**, inte alla undantag; undantagsregeln gäller endast 3–8 §§. Det äldre underlaget är rättat med hänvisning till originalen.

Tillämpningsperiod och framtidsscenario ska vara synliga. Klassificera faktisk undervisning och arbetsuppgifter, inte enbart programnamn. Avtalsprofil, rättslig regelprofil och rektors bedömning är separata underlag.

## Föreslagna mål och etapper

| Etapp | Mål | Status |
| --- | --- | --- |
| T1 Avtal och tidsgrund | TID-01 tidslägen, TID-02 regelprofiler, TID-03 klassificering, TID-04 gränser/deltid, TID-08 avtalsval. | Planerad i 05-TJANST; ej implementerad eller verifierad. |
| T2 Rektors bedömning | TID-05 motivering/dialog/beslut, TID-06 särskilda undantagsflöden, TID-07 huvudmannens översikt, TID-09 hela uppdraget inklusive mentorskap. | Planerad i 05-TJANST; ej implementerad eller verifierad. |
| T3 Schemakoppling | TID-10 ingen dubbelräkning, TID-11 tydlig schemaandel och kvar att förlägga. | Föreslagen; ej implementerad eller verifierad. |
| T4 Uppföljning | TID-12 utfall, avvikelser, prognos, åtgärd och nästa avstämning. | Föreslagen; ej implementerad eller verifierad. |

Den fulla mål-/provmatrisen finns i researchen. T1–T2 är planerade tillsammans med tjänstefördelningen och T3–T4 med schemadelprojektet. Inga nya pilotfaser införs och pågående APL-arbete ändras inte.

## Avstämningar inför genomförandeplan

- Den första huvudmannens faktiska centrala/lokala avtal och avtalsversion för respektive period, särskilt 2027/28.
- Dokumenterad tillämpning för blandade tjänster och sambandet mellan reglerad tid, förtroendetid och förordningens planeringskvot. Ingen automatisk avräkning av hela förtroendepotten.
- Beslutskedjan är vald: rektor fastställer och huvudmannen följer upp. Huvudmannen hanterar avtal och gemensam personalgrund, skoladministratören bereder och läraren läser egen plan. Lokalt samverkans-/förhandlingsunderlag och faktisk avtalsgiltighet ska dokumenteras utan att läskvittens utges för förhandling.
- Källa och skrivansvar för personaluppgifter, kalender och utfall. Dataimport och SS 12000 kräver egna kontraktsprov.

**Status: pending.** Daterad primärkällsresearch och kodgranskning är gjorda. Avtalsprofiler, implementation, dator-/telefonprov, handbok och faktisk integrationsverifiering återstår.
