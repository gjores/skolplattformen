---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-15
type: tdd
wave: 7
depends_on: ["TJANST-09"]
files_modified: ["web/lib/tjanst-overforing.ts", "web/lib/tjanst-overforing.test.mjs"]
autonomous: true
status: planned
local_acceptance: [TJ1-08, TJ1-09]
must_haves:
  truths: ["Årsöverföring ger en entydig förhandsvisning av nya utkast och behåller gamla beslut/initiativ i källhistoriken.", "Flytt och massregistrering har explicit omfattning, stabila målidentiteter och en kanonisk granskningshash."]
  artifacts: ["web/lib/tjanst-overforing.ts", "web/lib/tjanst-overforing.test.mjs"]
  key_links: ["Exakt käll-/måldata → ren previewfunktion → förväntade rader/blockerare/hash", "Samma vektorer → kommandeSQL15B → framtidaUI15A"]
---

<objective>
Definiera och testa årsöverföring, flytt mellan personer och massregistrering som rena transformationer. Detta är en avgränsad TDD-plan;15B implementerar transaktionen och15C API. Ingen produktfunktion påstås färdig av modellproven.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-05-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-09-SUMMARY.md
@web/lib/tjanst-plan.ts
@web/lib/tjanst-personal.ts
@web/lib/server/class-cohort.ts
@work/pilot/verify-target.mjs

</context>

<tasks>
<task type="auto">
<name>1. RED/GREEN/REFACTOR: definiera förhandsvisning, identiteter och bevarande för års-/massarbete</name>
<files>web/lib/tjanst-overforing.ts; web/lib/tjanst-overforing.test.mjs</files>
<action>Börja med kontraktsfallen som röda tester, implementera minsta rena modell och refaktorera med oförändrade gröna vektorer. Ingen SQL eller API skrivs i denna plan. Definiera strikta modeller/parsers för copyYear, moveAllocations och bulkCreate med vald exakt omfattning, källplaner/revisioner, målläsår/period, målperson/anställning/skoluppdrag och källmappning. Preview returnerar radvisa före/efter, blockerare/varningar, berörd kapacitet, giltig/okänd avtalsgrund, saknade klass–timplansbindningar samt kanonisk hash. ID:n och skol-/periodrelationer är nycklar, aldrig namn; nyårets ämnes-/klassmappning måste bekräftas mot faktiska målbindningar. Årskopia skapar nya stabila allokerings-ID:n och källa-till-kopiarelation; alla personbedömningar, motiveringar som utgör gamla beslut, undantag, lärarinitiativ, dialogdelningar, kvittenser och fastställanden lämnas kvar i originalhistoriken. Endast uppdragsstruktur, uttryckliga tidsförslag och tillåtna lokala planeringsetiketter kan följa med som utkast. Nya perioder/avtalsramar räknas om och får ingen tyst framtidsförlängning. Flytt byter arbetsfördelning mellan uttryckligt valda giltiga personer, inte anställningsägare eller löneuppgifter; fryst käll-/målplan måste få efterföljande utkast. Definiera maxantal, payloadstorlek och heloperationens atomiska semantik. Massregistrering är strukturerad inmatning av uppdragsrader, ingen PlanDigital-/löneimport eller automatisk personmatchning.</action>
<verify>Från web/: node --test lib/tjanst-overforing.test.mjs. Bevisa nya ID:n, inga kopierade händelser/bedömningar, exakt källmappning, delad tjänst/avtal, saknat målavtal/klass, vårstart/delår, tvålärare/samläsning och annan person/kund. Semantiskt lika ordning ger samma hash; innehållsskillnad ger annan. Identifiera och testa gränser innan SQL skrivs.</verify>
<done>Preview/kommando/statuskontrakt och fasta hash-/beräkningsvektorer är entydiga; SQL och UI kan implementeras utan att gissa kopieringsregler.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
TJ1-08/09, TJANST-06. SS12000:2024/OpenAPI2.1.0: stabila käll-ID:n och giltigheter bevaras, nya lokala allokerings-ID:n skapas för kopior. Inga elevmedlemskap, externa identifierare eller juridiska beslut kopieras som nya fakta. TDD-planens enda uppgift omfattar RED/GREEN/REFACTOR; faktisk SQL/API återstår.
</verification>

<success_criteria>
- Modell, parser och fasta hash-/beräkningsvektorer är tydliga och gröna.
- Nya utkast innehåller aldrig kopierade giltiga bedömningar, initiativ eller beslut.
</success_criteria>

<output>
Skriv05-TJANST-15-SUMMARY.md med exakta shapes, begränsningar och fasta vektorer för15B. Samordnaren hanterar avgränsad commit/push.
</output>
