---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-01
type: tdd
wave: 1
depends_on: []
files_modified: ["web/lib/tjanst-personal.ts", "web/lib/tjanst-personal.test.mjs"]
autonomous: true
status: superseded
superseded_on: 2026-10-19
superseded_by: "Fas 05.1 (tjänstefördelning) eller repot tjanstebedomning (tjänstebedömning); se ../05.1-tjanstefordelning/05.1-SPLIT-DECISION.md"
gap: TJANST-T1T2
must_haves:
  truths: ["En lärare kan planeras utan systemkonto och behåller samma identitet vid avtals- eller skolbyte.", "Två skoluppdrag delar anställningens periodbudget och skapar inte två helårsramar.", "Anställning, undervisningsuppdrag och rätt att använda systemet är skilda uppgifter."]
  artifacts: ["web/lib/tjanst-personal.ts", "web/lib/tjanst-personal.test.mjs"]
  key_links: ["Personalresurs → anställning → daterad omfattning/avtal → skolandel", "Verifierad egenlänk → personidentitet utan automatisk namnmatchning", "Extern identitet/källa → stabilt internt UUID och giltighet"]
---

<objective>
Skapa den rena identitets-, anställnings- och periodgrunden för tjänstefördelningen. Personnummer, löner, HR-import, schemaläggning och nya åtkomstmandat ingår inte.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/CONCERNS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@web/lib/access-rules.ts
@web/lib/mandate-policy.ts
@web/lib/class-cohort.ts
</context>

<tasks>
<task type="auto">
<name>1. Lås personalidentitet och periodgränser med beteendeprov</name>
<files>web/lib/tjanst-personal.test.mjs</files>
<action>Skriv RED-prov för kontraktets stabila personalresurs, källans externa ID, anställning, sysselsättningsperiod, arbetstidsform, avtalsversionsreferens och skolandel. Prova samma namn hos olika personer, samma person på två skolor, person utan konto, flera anställningar, ändring 100 till 60 procent mitt i perioden, ferie/semester, slut-/startdag, skottår, nullslutdatum och överlappande perioder. Avvisa främmande kund-/skol-/anställningsreferenser, dubblerad kapacitetsandel, ogrundad sammanslagning via namn/e-post samt implicita identitets-/mandatkopplingar. En ny åtkomstroll ska inte uppstå när personalresursen sparas. Spara avtalets giltighetslucka som granskningsbehov, inte som automatiskt förlängt avtal. Budgeten ska ha en identitet per anställning och beräkningsperiod; skolandelar pekar dit. Saknad ram och verkligt noll måste ge olika resultat.</action>
<verify>Från web: node --test lib/tjanst-personal.test.mjs. Relevant RED ska bero på saknade regler/resultat och inte på syntaxfel.</verify>
<done>Provmatrisen kan upptäcka identitetsförväxling, dubbel helårsbudget och felaktiga giltighetsgränser.</done>
</task>

<task type="auto">
<name>2. Implementera och frys periodkontraktet</name>
<files>web/lib/tjanst-personal.ts; web/lib/tjanst-personal.test.mjs</files>
<action>Implementera strikt typade read/command/status/receipt-shapes enligt paketkontraktet och rena periodoperationer. Använd stabila UUID, ISO-datum utan lokal tidszonsförskjutning och exakt procentrepresentation; definiera inklusiva datum och normalisering enhetligt med SQL. Separera person, anställning, budgetperiod, skoluppdrag, funktion och autentiserad identitet. Avtals-/omfattningsbyten skapar daterade delperioder; de ändrar inte historiskt beslutsunderlag. Oklara frånvaro- eller delårsregler får status kräver granskning; inför ingen generell kalenderdagsproportionering. Egenlänk kräver uttrycklig verifierad identitetskoppling enligt kontraktet och är aldrig bevis för annat skolmandat. Frys exports, maxlängder, okändsemantik, serialisering och periodtestvektorer i01-SUMMARY för02–08. SS 12000:2024/OpenAPI2.1.0 mappas till Person/externalIdentifiers, Organisation och Duty med giltighet; lokal anställning/avtalsbudget har eget skrivansvar. Ingen standardanslutning skapas.</action>
<verify>Kör ovanstående prov till GREEN, node --test lib/access-rules.test.mjs lib/mandate-policy.test.mjs lib/class-cohort.test.mjs och npx tsc --noEmit. Refaktorera med samma gröna beteenden.</verify>
<done>Personalgrunden kan delas av avtal, tjänsterader och SQL utan att konto eller skolantal påverkar personens tidsram.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
Lokal kravspårning: TJ1-02/09.
Behöver: paketkontrakt och aktuell inventering av åtkomst-/klassmodeller. Skapar: personal-/periodtyper och parsers som04/07 använder. Pröva TID-01/04/07/08 på modellnivå; riktiga databas- och behörighetsprov kommer09. Inga personuppgifter i testdata eller protokoll.
</verification>

<success_criteria>
- Stabil identitet, giltighet och en gemensam periodbudget bevaras i positiva och negativa modellfall.
- Periodisering är uttrycklig; okända regler ger inget beräknat efterlevnadsbesked.
- Modellbevis skiljs från implementerad serveråtkomst och verklig integration.
</success_criteria>

<output>
Skriv 05-TJANST-01-SUMMARY.md med exportkontrakt, testresultat, avvikelser och beroenden. Samordnaren gör avgränsad commit och push efter relevanta kontroller.
</output>
