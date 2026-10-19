---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-10A
type: execute
wave: 8
depends_on: ["TJANST-10"]
files_modified: ["web/app/tjanst-avtal.tsx", "web/app/tjanst-avtal.css", "web/e2e/fixtures/tjanst-avtal-preview.tsx", "web/e2e/tjanst-avtal.spec.ts"]
autonomous: true
status: superseded
superseded_on: 2026-10-19
superseded_by: "Fas 05.1 (tjänstefördelning) eller repot tjanstebedomning (tjänstebedömning); se ../05.1-tjanstefordelning/05.1-SPLIT-DECISION.md"
local_acceptance: [TJ1-01, TJ1-09, TJ1-10]
must_haves:
  truths: ["Huvudmannen kan välja flera tillämpliga kollektivavtal och se deras skilda versioner, giltigheter och tjänsteformer.", "En lokal överenskommelse har synlig omfattning och källa; ett mallnamn är inte bevis för att avtalet gäller.", "Rektor ser vilka profiler huvudmannen har gjort tillgängliga men kan inte ändra deras regler eller förlänga giltigheten i det tysta."]
  artifacts: ["web/app/tjanst-avtal.tsx", "web/e2e/tjanst-avtal.spec.ts"]
  key_links: ["Huvudmannens avtalsval → avtal/kommando → versionsbundet beständigt tillämpningsunderlag", "Individuell anställning → exakt tillgänglig avtalsversion och lokal överenskommelse", "Ändrad mall/giltighet → konsekvenslista och omprövningsbehov; gamla beslut bevaras"]
---

<objective>
Ge huvudmannen ett eget, tydligt val av flera kollektivavtal och lokala överenskommelser. Avtalsvalet ska beskriva faktiskt gällande villkor, med spårbara versioner och tillämpningsbegränsningar. Första implementationen använder de granskade profilerna från 02; den hårdkodar inte LBS till ett visst avtal.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-02-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-10-SUMMARY.md
@web/lib/tjanst-avtal.ts
@web/lib/tjanst-journal.ts
@web/app/tjanst-workspace.tsx
</context>

<tasks>
<task type="auto">
<name>1. Bygg huvudmannens avtalsbibliotek och tillämpning</name>
<files>web/app/tjanst-avtal.tsx; web/app/tjanst-avtal.css</files>
<action>Skapa flödet Välj avtal → Kontrollera giltighet och omfattning → Lägg till lokal överenskommelse vid behov → Granska → Spara. Tillåt flera aktiva avtalsfamiljer och samtidiga versioner för olika perioder/anställningar. Visa parter, källreferens, dokument-/regelversion, granskad tillämpning, ferie/semester, års-/vecko-/beräkningsperiod, reglerad/förtroendetid och modellens kända begränsningar. Skilj kollektivgenomsnitt från individuell ram och rättsligt tak från planeringsmål. Visa framtidsregler som framtida från deras datum; efter slutdatum krävs belagd fortsatt giltighet eller ny version enligt kontraktet. Lokal överenskommelse ska innehålla källa, omfattning, datum och vilka tillåtna fält den ändrar. Skapa ny version vid ändring av använd profil; visa berörda tjänster, saknat underlag och omprövningsbehov innan aktivering. Använd avtal/{lasa,kommando,status} och journalen; servercapabilities styr om huvudmannen får skapa/tillämpa/avsluta. Rektor får läsvy och kan föreslå komplettering till huvudmannen. Huvudmannen tilldelar avtal på anställningens period i personaldelen; rektor ändrar varken detta eller centrala regler. Visa inga generella gröna efterlevnadstecken enbart för att en profil sparats.</action>
<verify>Minst två granskade profiler med olika beräkningsramar, lokal ändring med korrekt omfattning, ferie och semester, ogiltig total kontra delar, okänd individuell ram, versionsbyte och avtalsperiod som inte täcker ett helt läsår. Kontrollera via omläsning att historiskt beslutsunderlag är oförändrat. Från web/: npx tsc --noEmit och npx oxlint app lib.</verify>
<done>Huvudmannen kan välja flera avtal och hantera tillämpningens giltighet utan att gamla individuella beslut skrivs om eller osäker tillämpning blir verifierad.</done>
</task>

<task type="auto">
<name>2. Pröva avtalsval och rollskillnader på dator och telefon</name>
<files>web/e2e/fixtures/tjanst-avtal-preview.tsx; web/e2e/tjanst-avtal.spec.ts</files>
<action>Anslut avtalskomponenten till 10:s syntetiska harness genom separat fixturemodul. Prova huvudmannens hela val-/lokaltillägg-/versionsflöde och rektors läsning/kompletteringsväg. Lägg särskild vikt vid ord som granskat, giltigt, framtida, saknas och kollektivgenomsnitt. Återanvänd en enda skal-/journalmekanism. Visa relevanta konsekvenser nära ändringen och förklara varför ett avtalsval inte kan fastställas. Provdata innehåller inga verkliga anställningar eller avtalspåståenden för LBS.</action>
<verify>Från web/: npx playwright test -c playwright.tjanst-preview.config.ts tjanst-avtal.spec.ts. Dator/telefon inklusive 409, förlorat svar, reload, MFA, uppdragsbyte, utgånget mandat och annan kund. Granska skärmbilder, tangentbord och minst 44×44 px kontroller. Falsk klientroll eller manipulerad aktivering testas på server i 09/17; dold knapp är inget behörighetsbevis.</verify>
<done>Avtalsvalets betydelse och begränsningar går att förstå på båda skärmarna, och återhämtning behåller exakt samma avtalsbegäran.</done>
</task>
</tasks>

<verification>
TID-02/08. Avtalsprofiler och lokala överenskommelser ligger utanför SS 12000:s fulla avtalsmodell; kopplingen till Person/Duty och giltighet bevaras enligt SS 12000:2024/OpenAPI 2.1.0. Regler eller källor som inte är granskade i 02 ger inget produktionsbesked genom UI. Produktinkoppling i 16, faktisk helkedja i 17.
</verification>

<success_criteria>
- Flera kollektivavtal kan väljas med källa, version, giltighet och tillämpliga anställningar.
- Rektors skoluppdrag och huvudmannens person-/anställnings-/avtalsansvar är tydligt skilda.
- Dator-/telefonprov visar ingen automatisk avtalsförlängning, generell årsram eller falsk regeluppfyllelse.
</success_criteria>

<output>
Skriv 05-TJANST-10A-SUMMARY.md med provade avtalsprofiler, rollskillnader, återstående tillämpningsluckor och inkopplingsgränssnitt för 16. Samordnaren hanterar commit/push.
</output>
