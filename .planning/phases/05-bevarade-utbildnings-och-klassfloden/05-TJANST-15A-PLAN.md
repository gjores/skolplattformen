---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-15A
type: execute
wave: 10
depends_on: ["TJANST-11", "TJANST-15C"]
files_modified: ["web/app/tjanst-overforing.tsx", "web/app/tjanst-overforing.css", "web/e2e/fixtures/tjanst-overforing-preview.tsx", "web/e2e/tjanst-overforing.spec.ts"]
autonomous: true
status: planned
local_acceptance: [TJ1-08, TJ1-09, TJ1-10]
must_haves:
  truths: ["Rektor kan föra över uppdragsstruktur till ett nytt läsår och ser vilka avtal, personer och klasskällor som behöver kontrolleras på nytt.", "Flytt mellan personer och massregistrering visar exakta före-/efterrader och kapacitetskonsekvenser före sparning.", "UI rapporterar aldrig delvis batch som färdig och kopierar aldrig tidigare beslut, undantag eller lärarinitiativ till ett nytt giltigt underlag."]
  artifacts: ["web/app/tjanst-overforing.tsx", "web/e2e/tjanst-overforing.spec.ts"]
  key_links: ["Exakt urval → overforing/lasa → granskad previewhash → overforing/kommando", "Förlorat svar → samma begärans status → verifierad målplan → nytt utkast med nästa bedömningssteg", "Tjänstefördelningens valda skola/läsår → samma kontrollerade källurval och återväg"]
---

<objective>
Gör årsöverföring, flytt och massregistrering användbara efter15C:s faktiska backendprov. Arbetsflödet ska ge rektor en snabb start och samtidigt visa vilka nya bedömningar som återstår. Det här är manuellt granskade massåtgärder, inte en import av PlanDigital eller ett automatiskt beslut för nästa år.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-11-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-15C-SUMMARY.md
@web/lib/tjanst-overforing.ts
@web/lib/tjanst-journal.ts
@web/app/tjanst-workspace.tsx
</context>

<tasks>
<task type="auto">
<name>1. Bygg ett gemensamt granskningsflöde för års- och massåtgärder</name>
<files>web/app/tjanst-overforing.tsx; web/app/tjanst-overforing.css</files>
<action>Bygg tre tydliga ingångar Förbered nästa läsår, Flytta valda uppdrag och Registrera flera uppdrag. Använd samma steg Välj → Kontrollera förslaget → Spara → Öppna nya utkast. Nyår visar käll-/målläsår, valda tjänster, befintliga målplaner, giltiga skol-/klass-/timplanskopplingar, avtalsgiltighet och vakanta uppdrag. Matcha inga namn eller automatiskt nya klasser; använd uttryckliga målID:n och15:s preview. Flytt väljer befintlig mottagande person/anställning/skoluppdrag och period och visar bådas före/efterkapacitet; bevara frysta original och visa att nya utkast kräver nya bedömningar. Massregistrering gör strukturerade rader med återanvändbara gemensamma fält men explicit radval, minuter och personID; inga löner/personnummer eller uppladdade exporter. Förhandsvisningen visar radfel, blockerare, varningar och antal; felrader måste rättas eller uttryckligen tas ur urvalet före en ny preview. Ingen automatisk partiell tillämpning. Spara via overforing/{kommando,status} med samma hash/revision/commandId, gemensam journal och verifierad omläsning. Visa vilka bedömningar/initiativ/beslut som inte har förts över som nya giltiga uppgifter. Framgång visar faktiskt skapade målutkast och rätt nästa steg.</action>
<verify>Årskopia med nytt avtal, saknad målklass, två namngivna timplaner, avslutad anställning och delad samläsning; flytt som skulle överbelägga mottagaren; masslista med ett fel bland giltiga rader. Ingen skrivknapp före en helt granskad preview utan blockerare. Från web/: npx tsc --noEmit och npx oxlint app lib.</verify>
<done>Rektor kan granska konsekvenserna före hela operationen och öppna rätt målutkast med tydligt återstående bedömningsarbete.</done>
</task>

<task type="auto">
<name>2. Pröva batchens avbrott, konkurrens och mobilgranskning</name>
<files>web/e2e/fixtures/tjanst-overforing-preview.tsx; web/e2e/tjanst-overforing.spec.ts</files>
<action>Skapa browserfall för tre normalflöden och fel mitt i batchen som servern har rullat tillbaka. Visa att förlorat svar efter commit går till status/återläsning och inte ny operation. Ändrad källa/kapacitet efter preview kräver ny granskning med synliga skillnader; inga redan granskade siffror används som aktuellt beslut. Preview av många rader ska vara läsbar med antal/val och kontrollerad paginering; på telefon ska blockerare och spara vara åtkomliga utan oöverskådlig bred matris. Bevara skol-/årskontext, fokusera första fel och ge säker återväg till fördelningen. Använd egna syntetiska fixtures och journalharness, inga aktiva tjänster.</action>
<verify>Från web/: npx playwright test -c playwright.tjanst-preview.config.ts tjanst-overforing.spec.ts. Dator/telefon: kopiera/flytta/massregistrera, avbryt före spara, serverrollback,409, två flikar, tappat svar, reload, MFA, annan kund/skola och återkallat mandat. Efter varje scenario kontrollera antal målutkast och att gamla händelser saknar kopior. Granska skärmbilder, keyboard/fokus och minst44×44.15B/15C ger faktisk backend;17 prövar slutligen produktUI mot samma samlade kandidat.</verify>
<done>Hela operationens status och konsekvenser är begripliga även efter avbrott; mobilgranskningen ger samma kontroll som datorn.</done>
</task>
</tasks>

<verification>
TJ1-08/09/10 och TJANST-06. SS12000:2024/OpenAPI2.1.0: visa oförändrade källidentiteter, nya lokala måluppdrag, rätt giltighet och explicit källansvar. Inga nya klass-/gruppmedlemskap eller externa anslutningspåståenden skapas genom överföringsUI.
</verification>

<success_criteria>
- Alla tre massflöden visar exakta före/efter och skapar bara kontrollerade utkast.
- Ingen felrad, konflikt eller avbruten begäran kan presenteras som helt genomförd utan serverbevis.
- Kopior kräver ny individuell bedömning och bär inga gamla beslut/initiativ som giltiga för den nya perioden.
</success_criteria>

<output>
Skriv05-TJANST-15A-SUMMARY.md med provade massflöden, fel-/återhämtningsbevis och slotgränssnitt till16. Samordnaren hanterar commit/push.
</output>
