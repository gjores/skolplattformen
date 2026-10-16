---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-11
type: execute
wave: 8
depends_on: ["TJANST-10"]
files_modified: ["web/app/tjanst-fordelning.tsx", "web/app/tjanst-uppdrag-dialog.tsx", "web/app/tjanst-fordelning.css", "web/e2e/fixtures/tjanst-fordelning-preview.tsx", "web/e2e/tjanst-fordelning.spec.ts"]
autonomous: true
status: planned
local_acceptance: [TJ1-03, TJ1-04, TJ1-09, TJ1-10]
must_haves:
  truths: ["Rektor kan fördela undervisning per klass, ämnesnivå, lärare, termin och exakt timplanskälla samt återöppna samma fördelning.", "Mentorskap och andra uppdrag ingår i den enskilda lärarens ram utan att räknas en gång till genom sina etiketter eller gruppkopplingar.", "Samläsning visar gemensam aktivitet och varje lärares eget deltagande; elevtimmar och lärartimmar blandas inte.", "Underlag från schema och utfall saknas ännu och visas därför inte som noll procent eller färdig tidsuppföljning."]
  artifacts: ["web/app/tjanst-fordelning.tsx", "web/app/tjanst-uppdrag-dialog.tsx", "web/e2e/tjanst-fordelning.spec.ts"]
  key_links: ["Klass/läsår → explicit fastställd timplansversion → källrader → tjänsteuppdrag", "Gemensam aktivitet → separata lärardeltaganden → personens budget en gång", "plan/kommando → kvitto/status → ny plan/lasa → samma sparade period och revision"]
---

<objective>
Gör tjänstefördelningen till en användbar arbetsyta ovanpå den gemensamma tids- och avtalsmodellen. Första funktionella området är Gy25-gymnasiets bevarade klass–timplanskopplingar. Användaren ska kunna planera hela uppdraget och förstå vad som räknas, med efterföljande individuell bedömning i 12.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-03-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-10-SUMMARY.md
@web/lib/tjanst-plan.ts
@web/lib/class-timplan.ts
@web/lib/planning-year-contract.ts
@web/app/protected-gym-timplan-workspace.tsx
@web/app/tjanst-workspace.tsx
</context>

<tasks>
<task type="auto">
<name>1. Bygg fördelningslistan med synlig källa och personens hela ram</name>
<files>web/app/tjanst-fordelning.tsx; web/app/tjanst-fordelning.css</files>
<action>Bygg en sökbar/filterbar lista för skola/läsår med växling mellan klass, ämne och lärare utan separata kopior av uppdragen. Visa klass/grupp, Gy25-nivå/kod, lärare, källans exakta timplansnamn/version, HT/VT-minuter, uppgiftstyp, tidsform och status. Visa obemannat behov, kvar att fördela, överfördelat och saknat underlag separat. Källans elevtimmar är en jämförelse, ingen automatisk lärarbudget. Tidsvisning använder timmar och minuter, modellen heltalsminuter. Personens totalsammanställning visar avsatt inom reglerad respektive förtroendetid och avtalets individuella ram för samma period; återstående budget får inte benämnas ledig personal om den redan är avsatt på annan skola. Flera anställningar kan granskas sida vid sida men får inte slås ihop genom namn. Visa dataunderlag för gruppstorlek/antal elever som känt, delvis eller saknat; tjänstefördelning får börja utan elevregister. Visa källa ändrad och kontrollera före fortsatt spara/bedömning. Schema/utfall är Underlag saknas; inga förläggningsprocent eller skenbart genomförda timmar skapas i T1/T2.</action>
<verify>Prova minst två klasser med olika namngivna timplaner och två läsår; ändrat källunderlag får inte byta rätt planversion i tysthet. Fördelningen läses genom plan/lasa och inga demo-/namnrelationer används. Samma aktivitet syns identiskt i klass-, ämnes- och lärarfilter. Från web/: npx tsc --noEmit och npx oxlint app lib.</verify>
<done>Rektor kan se årets behov, bemanning och personens utrymme med källor och osäkerheter som går att följa.</done>
</task>

<task type="auto">
<name>2. Gör undervisning, samläsning och övriga uppdrag redigerbara</name>
<files>web/app/tjanst-uppdrag-dialog.tsx; web/app/tjanst-fordelning.tsx</files>
<action>Inför Skapa uppdrag/Ändra uppdrag med val av befintlig person/anställning/skoluppdrag, termin eller giltighetsperiod, källrad, arbetsuppgift, tidsform och minuter. Eget specialuppdrag kräver ingen falsk kurs/klass. Erbjud elevmentorskap, mentorskap för ny kollega, programansvar, specialpedagogiskt uppdrag, APL-besök/resor/uppföljning och egen benämning; etikett ger ingen extra tid eller automatisk lagklassificering. För mentorskap visas omfattning, elevantal när belagt, delat ansvar, period och konkret innehåll. Samläsning är en uttrycklig relation till gemensam aktivitet med gruppkopplingar och lärardeltaganden: två samlästa grupper × samma lärare × 60 minuter ger 60 lärarminuter; två deltagande lärare ger 60 vardera. Blandade uppgifter delas i minuter med en summa som inte överskrider ursprunget. Rader kan tas bort ur utkast med konsekvensgranskning, historik bevaras. Använd plan/{kommando,status}, exakt journal och serverresultat; neka stale source, CASkonflikt och kapacitetsöverskridande enligt kontraktet. APL-elevveckor eller poäng får aldrig fylla lärarens minuter.</action>
<verify>Prova 60 minuter samläsning, två lärare, delat mentorsansvar, blandat möte 30+30, 80 timmars mentorsbudget utan nytt budgettillägg från relationen, frånvarande timplanskälla och APL-elevtid. Bekräfta sparad plan efter reload. Två konkurrerande redaktörer ska få ett uttryckligt nytt granskningsbehov, ingen dold last-write-wins.</verify>
<done>Undervisnings- och övriga uppdrag sparas i samma tidsmodell och kan ändras med synliga konsekvenser utan dubbelräkning.</done>
</task>

<task type="auto">
<name>3. Verifiera hela fördelningsarbetet på dator och telefon</name>
<files>web/e2e/fixtures/tjanst-fordelning-preview.tsx; web/e2e/tjanst-fordelning.spec.ts</files>
<action>Bygg en egen fixturemodul under 10:s harness med två skolor, två avtalsprofiler, namngivna timplaner, obemannad rad, samläsning och lärare utan konto. Kör skapa/ändra/ta bort/spara/återöppna samt filtrering och länk till kommande individuell bedömning. Vid schemaingången visas bara paketets kontrollerade budgetreferens och att schema saknas; ingen schemakod ändras. Dator får jämförbar tabell; telefon får samma uppgifter i kort eller kontrollerat horisontellt område med tydliga rubriker, inga dolda primära handlingar.</action>
<verify>Från web/: npx playwright test -c playwright.tjanst-preview.config.ts tjanst-fordelning.spec.ts. Båda skärmar: tangentbord, fokus efter dialog, minst44×44, bevarad skola/år/person, 409, MFA, tappat svar, reload, förbjuden kund/skola och indraget mandat. Visuell kontroll av skärmbilder. Bevis är simuleradAPI; 17 prövar verklig Worker/SQL.</verify>
<done>Rektor kan genomföra ett helt fördelningsvarv på båda skärmarna, med förklarade avvikelser och samma minuter i alla vyer.</done>
</task>
</tasks>

<verification>
Pröva gemensam individuell undervisnings-/PU-ram över skolor enligt SharedAssessmentBasis: tak500 och300+300undervisning ska neka trots tillräcklig totalbudget;300+200 kräver minst600PU utan dubbel förtroendetidsallokering.03A definierar modellen,06 lagrar/prövar gemensam grund och12 låter berörda rektorer bekräfta sina delar. Huvudmannen fastställer inte.
Följ kontraktets reservationslivscykel: max(gällande publicerad budget, godkänd aktiv utkastreservation) per skolbeslut/anställningssegment, historik belastar inte. Prova100→utkast100=100,100→utkast80=100 fram till confirm,100→120=120 endast med tillgängligt20, avbryt120→100 och konkurrerande annan skola före/efter fastställd minskning. Fastställande/flytt uppdaterar hela reservationen atomärt.
TJANST-01/02/03 och TID-01/03/04/09. SS12000:2024/OpenAPI2.1.0: Person/Duty/Activity/DutyAssignment/Group refereras med stabila ID:n; aktivitetsminuter och lärarminuter skiljs åt. Samläsning bevarar flera grupprelationer utan att ändra elevernas medlemskap eller klass–timplanskoppling. T3:s faktiska kalenderräkning och T4:s utfall återstår.
</verification>

<success_criteria>
- Tjänsterader går att skapa, ändra, ta bort i utkast och återläsa med exakt timplanskälla.
- Samläsning, två lärare, mentorskap och blandade uppgifter räknas enligt samma modell i alla vyer.
- Okända källor, kapacitet och framtida schema/utfall är synliga och kan inte misstolkas som noll eller verifierat stöd.
</success_criteria>

<output>
Skriv 05-TJANST-11-SUMMARY.md med granskade beräkningspresentationer, UI-/APIprovnivå och slot-gränssnitt till16. Samordnaren hanterar commit/push.
</output>
