---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: PLANNING-FLOW-UX-01
status: implemented_component_verified
completed: 2026-10-18
requirements: [FLOW-01]
---
# PLANNING-FLOW-UX-01 — programplanens tabell och enklare åtgärder

Programplanen visar tabellen före beslut och klassförberedelse. **Gå till timplan** är den primära nästa åtgärden och **Kontrollera planen** ersätter Analys. Kopiering, namn, skolor, uppdatering, arkivering och borttagning nås via **Fler alternativ**. Kopieringen heter **Kopiera till nästa kull**. Befintlig sparning, mandat och livscykel använder samma villkor och anrop som tidigare.

## Genomfört

- Tillgänglig native `details`/`summary` samlar sekundära åtgärder; Enter öppnar/stänger och touchmålen är minst44px. På telefon visas alternativen i en kolumn. Historik/katalog/revision finns kvar i den redan separata detaljöppningen.
- Tabellens sparstatus, fel och konfliktåterhämtning är kvar. Gemensam besluts- och klasskomponent flyttas efter tabellen; respektive komponentkontrakt ändras inte av denna delplan. Frivillig automatisk klassöppning efter ny utbildning består.
- Arbetsmomenten är Programplan→Timplan, med APL-perioder som senare steg endast för verifierad yrkesprofil. Ingen APL-etikett visas för högskoleförberedande program.
- Förklaringen vid skapande använder enklare verksamhetsord och tydliggör utkast, timplan, senare klasser och huvudmannens separata godkännande. Okända sparsvar, säkerhetsfel och ändrade underlag är fortsatt synliga.
- Ämnes-/nivåtillägg, valblock, autofördelning och terminscellsparning ändras inte i denna UI-del.

## Färska kontroller

| Kontroll | Resultat | Underlag |
|---|---|---|
| Programplanskopiering och ny UI-arbetsgång, dator/telefon | **26/26 PASS**, retries0 | `/private/tmp/program-flow-copy-ui-02.log`; `/private/tmp/program-flow-ui-evidence/report.json` |
| Klassflöde i full programplansarbetsyta, dator/telefon | **12/12 PASS**, retries0 | `/private/tmp/program-flow-class-ui.log` |
| Riktad oxlint för de ändrade komponenterna och copy-fixturen/provet | **PASS** | körd2026-10-18 |
| Full TypeScript under parallell integration | **Ej slutligt godkänd** | `/private/tmp/program-flow-ui-tsc-02.log`, `-03.log`: endast pågående andra filägares `process`-prop respektive APL `revisionScope`-typ; inga fel i delplanens filer |
| Bildgranskning | **4 bilder granskade** | `/private/tmp/program-flow-ui-evidence/{desktop,phone}/programplan-{table-first,options-open}.png` |

Copy-proven omfattar komplett kopia, tappade/okända svar med samma kommando, audit-/konfliktnekande, återläsningsfel, senare startdatum, tangentfokus, administratör utan skapande/skolhantering samt rektor som kopierar delad ram till egen sekundär skola. Det nya beteendeprovet öppnar/stänger alternativ med tangentbord, kontrollerar synlig sparstatus och tabell före klasser, använder Kontrollera planen/tillbaka och navigerar med exakt programplans-ID till timplan.

Klassproven omfattar huvudmannens läsning, administratörens skapande, ny utbildning för huvudman/rektor med frivilligt klasssteg, samma klass-ID:n efter ny programplansversion och tom klasstruktur i nästa kull. Sidans bredd kontrolleras även på telefon; själva tabellen får skrolla horisontellt.

Första browserstarten stoppades av sandboxens lokala portspärr (`EPERM5195`), innan testkörning. Samma kommando kördes med avgränsad lokal testbehörighet och passerade; inga testvillkor försvagades. Första typkontrollen startades från fel paketrot och avbröts; följande kontroller kördes från `web/` med lokal compiler.

## Filer och avgränsning

Produkt: `web/app/protected-programplan-workspace.tsx`, `protected-programplan-flow.tsx`, `protected-programplan.css`.
Prov: `web/e2e/programplan-copy.spec.ts`, `web/e2e/fixtures/programplan-copy-preview.tsx`, två selectoranpassningar i `web/e2e/class-cohort.spec.ts`.

Ändringen påverkar inga databasobjekt, stabila ID:n eller SS12000-relationer. Klass-ID-/versionsfallen ger avgränsat internt bevis; extern standardöverföring eller genomförd APL påstås inte.

Root ansvarar för slutlig typkontroll efter integration, den gemensamma beslutspanelen, kandidatbygge, faktisk API/OIDC, bredare nivå-/valblocksregression och lokal leverans. Dessa komponentprov använder syntetiska API-svar och bevisar inte aktiv3012-leverans eller användarens begriplighetsacceptans. Andra historiska browserprov med gamla `Analys`, `Kopiera`, `Läs om`, `Timplan` eller direktöppnade `Skolor`-selectors behöver anpassas när de används i paketets samlade verifiering. Ingen commit/push gjord av subagenten; root samordnar delad arbetskopia.


## Tillägg: handbok och APL-handledning

På roots fortsatta uppdrag uppdaterades `docs/handbok/programplaner.md`, `timplaner.md`, `apl-planering.md` och `planering.md` till Programplan→Timplan→separat APL-planering. Huvudmannen godkänner tabellen först; endast aktuell fastställd timplan öppnar senare APL-redigering. Rektor bekräftar förläggningen och huvudmannen granskar den separat. Ämnen/år/års-APL återanvänds, medan termin och datum preciseras senare. Fullt centralt innehåll saknas i katalogen: manuell arbetsmomentsbeskrivning med ämnesplanen som stöd anges uttryckligt. Arbetsplatser, handledare och genomförande beskrivs som skolans senare arbete utanför nuvarande arbetsyta.

Appens `protected-apl-guide.tsx` fick samma arbetsgång och beskrivning av centralt innehåll. Endast text/uppmaning i `AplDecisionEvidence` i gemensamma `plan-decision-panel.tsx` ändrades av subagenten; roots övriga samtidiga komponentändringar lämnades orörda. Äldre text som krävde APL-perioder före timplansbeslut togs bort. Juridiska fakta/källor från16okt behåller tidigare kontrolldatum och är inte nyresearchade här.

Handboksbygge `npm run docs:build` PASS; rapport `/private/tmp/planning-flow-docs-build-final.log`. Docusaurus visade endast att dess egen uppdateringskontroll saknade skrivåtkomst till användarkonfigurationen; statiska sidor genererades och processen avslutades med0. Riktad lint för guide/beslutsfil PASS från rätt paketrot (`web/`). Ingen handbokspublicering eller aktiv appombyggnad utförd. Samlad produkt-/browserverifiering av nya APL-kontrakt och slutlig leverans ligger fortsatt hos root.
