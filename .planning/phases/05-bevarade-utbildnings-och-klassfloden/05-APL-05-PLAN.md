---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-05
type: execute
wave: 5
depends_on: ["APL-04", "APL-04A"]
files_modified: ["web/app/protected-apl-plan.tsx", "web/app/protected-apl-plan.css", "web/app/protected-gym-timplan-workspace.tsx", "web/app/protected-gym-timplan-hours.tsx", "web/e2e/apl-plan.spec.ts", "web/playwright.apl-preview.config.ts", "web/e2e/fixtures/apl-plan-preview.tsx", "web/e2e/fixtures/apl-plan-preview.html"]
autonomous: true
status: planned
gap: APL-01
must_haves:
  truths: ["Rektor kan planera APL från rätt namngivna timplan och se vad som saknas.", "Total undervisningstid och varav APL kan granskas före sparande.", "Flera ämneskopplingar skapar inte dubbla timmar och okänt underlag visas tydligt."]
  artifacts: ["web/app/protected-apl-plan.tsx", "web/app/protected-apl-plan.css", "web/e2e/apl-plan.spec.ts", "web/playwright.apl-preview.config.ts", "web/e2e/fixtures/apl-plan-preview.tsx", "web/e2e/fixtures/apl-plan-preview.html"]
  key_links: ["Aktiv plan/skola/läsår → APL-read → redigeringsunderlag", "Granskat före/efter → journalfört kommando → kvitto + återläst plan", "APL dirty/unknown → arbetsytans befintliga navigationsskydd"]
---

<objective>
Bygg det avgränsade APL-flödet i timplanen med verksamhetsspråk och få tydliga åtgärder. UI använder serverkontraktet och låtsas inte kunna visa elevplatser eller genomförande.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/TESTING.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-IMPLEMENTATION.md
@web/app/protected-gym-timplan-workspace.tsx
@web/app/protected-gym-timplan-hours.tsx
@web/app/named-timplan-actions.tsx
@web/lib/apl-plan.ts
@web/lib/apl-plan-journal.ts
</context>

<tasks>

<task type="auto">
<name>1. Visa och redigera perioder, innehåll och inkluderad tidsfördelning</name>
<files>web/app/protected-apl-plan.tsx; web/app/protected-apl-plan.css; web/app/protected-gym-timplan-workspace.tsx; web/app/protected-gym-timplan-hours.tsx; web/e2e/apl-plan.spec.ts; web/playwright.apl-preview.config.ts; web/e2e/fixtures/apl-plan-preview.tsx; web/e2e/fixtures/apl-plan-preview.html</files>
<action>Skapa först planens separata browserharness, previewfixtur och spec så denna uppgifts verifiering går att köra självständigt. Lägg APL-kortet i den öppnade timplanen med skola, kull, namn och version som befintlig kontext. Visa explicit utbildningsform, planerade granskade veckor per läsår, motsvarande GUT och kompletteringsbehov. Periodredigering väljer datum/läsår, deklarerad omfattning, befintliga ämnesnivåer/delar och separat timfördelning med timmar/minuter. Ett ofullständigt valbart block kan sparas för planering men ger inte verifierad ämnesnivåkoppling. Perioder inom samma plan avser samma planeringsgrupp; överlapp och uppenbart oförenlig omfattning hindrar granskad status. Olika klassvarianter använder namngivna planer, inga parallella elevgruppsräknare införs. Förklara att datum inte beräknar veckotal. Behåll totalhours som total; visa varav APL och återstående/oklassificerat endast när granskningen stöder etiketten. Inga tekniska UUID/hashar i huvudflödet, ingen APL-rad med gymnasiepoäng. Använd Planera APL, Visa vad som saknas, Visa underlag och Spara APL-plan. Timplansrader som inte kan rymma allokering visar konkret rättningsväg. Fastställd version är läsbar och hänvisar till ny version. Övriga utbildningsformer kan sparas som granskningsunderlag men får inget uppfyllelsebesked.</action>
<verify>Riktade browserprov på dator och telefon för legacy, tomt, 14/15 hela veckor, del-/blandvecka, flera ämnen, rowKey-/terminfel, total/varav och två olika namngivna planer. Inspektera skärmbilder och tangentbordsordning; knappar minst 44 px där befintlig standard kräver och inga klippta formulär. Kör npx playwright test -c playwright.apl-preview.config.ts. Konfiguration/fixtur skapas i denna plan, matchar bara apl-plan.spec.ts och har egen previewport. Dessa simulerade UI-prov märks simulerade.</verify>
<done>Användaren kan förstå APL-planens omfattning och ändra den utan att timplanens total omräknas automatiskt.</done>
</task>

<task type="auto">
<name>2. Koppla tydlig sparning, konflikt och återhämtning till arbetsytan</name>
<files>web/app/protected-apl-plan.tsx; web/app/protected-gym-timplan-workspace.tsx; web/e2e/apl-plan.spec.ts; web/playwright.apl-preview.config.ts; web/e2e/fixtures/apl-plan-preview.tsx; web/e2e/fixtures/apl-plan-preview.html</files>
<action>Visa en före/eftergranskning för total, varav APL, tidigare okänd klassificering och innehåll innan nytt kommando skapas. Återanvänd journalens låsta request vid okänt svar och ge Läsa sparstatus/fortsatt rättningsväg. Återläs både timplan och APL efter kvitto så CAS blir gemensam; sent svar från annan skola/plan får inte uppdatera aktuell vy. Koppla APL dirty/unknown till befintligt leave/Back/URL-/skol-/årsbyte, timredigering och skapande av version. Samordna även timcellernas autosparande dirty/inflight före APL-granskning, rektorsbekräftelse och submit; en gammal sparad timmatris får inte bekräftas medan nyare inmatning väntar. Ägarskap: denna plan implementerar Bekräfta förläggningen i protected-apl-plan och all APL-journal/återhämtning där;06 visar bara rektorshändelsens resultat och kompletteringsväg i beslutspanelen. Parent05 samordnar tim-/APL busy/dirty/unknown och skickar den samlade spärren via PlanDecisionPanel:s befintliga disabled-prop. APL-komponenten får samma spärr och onChanged som återläser timplan/APL/revision; inga beslut får gå före inflight radskrivning. Sparad plan, rektorsbeslut och huvudmannens fastställande får olika besked; rita inte genomförande- eller platsprogress utan data. Visa underlag saknas eller etappens begränsning utan döda framtidsknappar.</action>
<verify>Dator/telefon: spara→reload, förlorat svar→status→exakt replay, CAS-konflikt, nekat mandat under sparning, skolbyte, Back och återgång. En redan sparad nyare plan får inte skrivas över av gammalt kvitto. Prova befintlig timsparning och två klasser till samma plan; npx tsc --noEmit och npx oxlint app lib.</verify>
<done>Besked följer serverns resultat och osparat eller okänt läge kan inte tyst tappas bort.</done>
</task>

</tasks>

<verification>
APL1-01/02/03/05/06/07 är användbara i simulerat UI. Faktiska klient/Worker/SQL-flödet verifieras i 08; ingen ny runtimeacceptans hävdas här.
Inventera aktuella definitioner vid start; äldre kodkartor och tidigare PASS är bakgrund. Läs kontraktets SS 12000-avstämning och bevara stabila skol-/klass-ID:n, giltighet och källansvar; inget externt standardutbyte verifieras av denna plan.
</verification>

<success_criteria>
- Rektor kan planera APL från rätt namngivna timplan och se vad som saknas.
- Total undervisningstid och varav APL kan granskas före sparande.
- Flera ämneskopplingar skapar inte dubbla timmar och okänt underlag visas tydligt.
- Uppgifternas verifiering är redovisad på faktisk provnivå; avvikelser och första fel döljs inte.
</success_criteria>

<output>
Skriv 05-APL-05-SUMMARY.md i samma katalog med ändrade filer, utförda kontroller, bevarande, avvikelser och nästa beroende. Samordnaren hanterar avgränsad commit/push och paketstatus.
</output>
