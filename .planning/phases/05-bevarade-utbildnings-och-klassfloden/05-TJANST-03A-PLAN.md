---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-03A
type: tdd
wave: 3
depends_on: ["TJANST-03"]
files_modified: ["web/lib/tjanst-bedomning.ts", "web/lib/tjanst-bedomning.test.mjs"]
autonomous: true
status: planned
gap: TJANST-T1T2
must_haves:
  truths: ["Rektor bedömer varje tjänst och fastställer/publicerar skolans fördelning; huvudmannen följer upp.", "Bedömningen förklarar undervisningstak, planeringstid och hela uppdragets förutsättningar.", "Lärarens initiativ och synpunkter kan inte ersättas av rektors kryssruta eller läskvittens."]
  artifacts: ["web/lib/tjanst-bedomning.ts", "web/lib/tjanst-bedomning.test.mjs"]
  key_links: ["Aktuella tjänsterader + period/avtal/regler + underlag → bedömningens innehållshash", "Rektors confirm → oföränderligt beslut och samma publicerade revision", "Verifierad egenidentitet → självinitierat undantag/synpunkt utan beslutsrätt"]
---

<objective>
Frys rektors tjänstebedömning, beslut och lärardialog som egen tillståndsmodell. Befintligt huvudmannagodkännande för program-/timplaner ska inte återanvändas för tjänstefördelningen.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/TESTING.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@web/lib/tjanst-plan.ts
@web/lib/tjanst-avtal.ts
@web/lib/plan-decision.ts
</context>

<tasks>
<task type="auto">
<name>1. Lås bedömningens innehåll och beslutsgränser i RED-prov</name>
<files>web/lib/tjanst-bedomning.test.mjs</files>
<action>Testa utkast, komplett/ofullständig bedömning, fastställande/publicering på exakt samma revision, ändrat underlag, ny version och historisk läsning. Bedömningen innehåller gruppstorlek, antal regelbundet mötta unika elever, sammanfattat stödbehov, andra relevanta omständigheter, källornas täckning/datum, individuellt tak, avsatt planeringstid, motivering och nästa avstämning. Testa manuellt dokumenterat antal unika elever med källreferens och täckning separat från summan av gruppstorlekar; saknat underlag ska inte bli 0. Första etappen läser inga elevärenden eller elevlistor och gör ingen automatisk elevdeduplicering. Känsliga elevlistor/diagnoser ska inte ingå i kontraktet. Ändrade rader, omfattning, avtals-/lagversion, kategori eller relevanta gruppfakta gör bedömningen inaktuell; enbart läskvittens gör inte det. Rektor kanconfirm, huvudman/admin/lärare kan inte. Pröva11§punkt1 utan belagt lärarinitiativ, förfalskad aktör, återkallat initiativ och nytt innehåll; punkterna2/3 har egna grunder utan felaktigt krav på lärarinitiativ. Ingen grund får dölja faktiska minuter eller utvidgas till9–10§§. Läskvittens, lärarsynpunkt, samtal och samverkan är separata händelser. Testa också uttrycklig delning av dialogversion före fastställande, initiativ bundet till denna hash och nekad läsning av andra utkast.</action>
<verify>Från web: node --test lib/tjanst-bedomning.test.mjs. Visa relevanta RED-resultat för beslut, aktualitet och initiativ.</verify>
<done>Beslutsmatrisen kan upptäcka huvudmannagodkännande som felaktigt krav, gamla bedömningar och imiterade lärarinitiativ.</done>
</task>

<task type="auto">
<name>2. Implementera förklarbar bedömning och kanoniskt beslutsunderlag</name>
<files>web/lib/tjanst-bedomning.ts; web/lib/tjanst-bedomning.test.mjs</files>
<action>Definiera SharedAssessmentBasis enligt kontraktet med gemensam ram, delramar och varje berörd rektors versionsbundna bekräftelse; prova överbeläggning och PU-deduplicering över skolor. Implementera strikta assessment/self-read/command/status/reply-kontrakt och ren state machine. Rektor kan uttryckligen dela en dialogversion med berörd lärare före fastställande; delningen binder en oföränderlig versionshash och ger inte tillgång till andra utkast. Lärarens initiativ kan skapas mot den delade hashversionen innan rektorsbeslut. Dela beräknade gränser, individuell bedömningsstatus, fördelningsbeslut, schema saknas och utfall saknas i separata besked; ingen allmän följer-lagenflagga. Regeringsreglernas golv/tak och rektors högre planeringsbehov ska gå att följa till källa/motivering, ingen automatisk poängmodell. confirm kräver färska bedömningar för aktuella personallokeringar, komplett avtals-/periodgrund och kontraktets kapacitets-/regelvillkor. Obemannade behov redovisas uttryckligt i skolbeslutet och får inte försvinna genom fastställandet. Fastställande och publicering är atomiskt samma innehåll, ingen HM-approve. En ändring skapar nytt arbetsunderlag och gör beroende bedömningar inaktuella; historisk publicerad version består. Kanonisk hash inkluderar verksamhetsbärande källor, budget, klassificering, motivering och beslutsrelevanta undantag men inte läskvitton, listordning eller tekniska läsrevisioner. Frys exakta SQL-paritetsvektorer, undantagens underlag, initiativets innehållsbundenhet och tillåtna övergångar i03A-SUMMARY. Samverkan dokumenteras som uppgift/händelse och påstås inte juridiskt fullgjord enbart genom en kvittens.</action>
<verify>Prov till GREEN, node --test lib/tjanst-plan.test.mjs lib/tjanst-avtal.test.mjs samt npx tsc --noEmit. Verifiera semantiskt samma innehåll i olika listordning ger samma hash och faktisk förändring ger annan hash.</verify>
<done>Bedömning och skolbeslut kan implementeras i SQL/UI med samma mandat, aktualitet och historik.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
Pröva gemensam individuell undervisnings-/PU-ram över skolor enligt SharedAssessmentBasis: tak500 och300+300undervisning ska neka trots tillräcklig totalbudget;300+200 kräver minst600PU utan dubbel förtroendetidsallokering.03A definierar modellen,06 lagrar/prövar gemensam grund och12 låter berörda rektorer bekräfta sina delar. Huvudmannen fastställer inte.
Följ kontraktets två hashvärden: initiativ binder initiativeBasisHash utan sin egen händelse eller senare prövning; decisionHash inkluderar slutlig prövning och referens till giltigt initiativ. Prova positivt delning→eget initiativ→rektors prövning→fastställande utan självogiltigförklaring, samt negativt ändrad faktisk tjänst/undantagsvillkor och återkallat initiativ.
Lokal kravspårning: TJ1-05/06/07.
Behöver:03:s innehåll/period/källkontrakt. Skapar: bedömnings-/besluts-/egenläskontrakt för06/08/12/13. TID-05/06 och beslutsdelen av TID-07. Avtal, motivering och rättsligt undantag är egna objekt; SS12000 TeacherException är ett kalenderundantag och används inte här.
</verification>

<success_criteria>
- Rektor fastställer och publicerar; huvudmannen behöver inte godkänna.
- Gamla beslut och nya kompletteringsbehov kan visas samtidigt utan att historik skrivs om.
- Lärarinitiativ, synpunkter och kvittenser har skild betydelse och behörighet.
</success_criteria>

<output>
Skriv 05-TJANST-03A-SUMMARY.md med tillstånds-/hashkontrakt, verifieringsfall och återstående serverbevis. Samordnaren hanterar commit/push.
</output>
