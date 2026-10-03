---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "18"
reviewed: 2026-10-04
status: human_needed
score: 6/6 automatic truths supported
scope: independent_code_and_evidence_review
runtime_status: verified_local_synthetic_with_documented_setup_reruns
human_status: awaiting_user
gaps: []
re_review: four_navigation_contract_orphan_findings_closed
---

# 05-18 — Oberoende slutgranskning

**Slutsats:** terminsfördelning är substantiellt implementerad, inkopplad och automatiskt verifierad lokalt med syntetiska uppgifter. Inga kända kodblockerare kvarstår efter rättningarna. Användarens begriplighetsbedömning återstår. Timplanens regressionsmatris har alla 20 beteenden godkända över 19 + 1 prov; det är inte ett rent PASS från en enda fullkörning.

Granskningen följer `gsd-verifier`. Granskaren har läst kod, rårapporter, resultatsammanställningar, källhashar och skärmbilder. Inga egna fixturer/runtimeprov kördes parallellt med huvudagentens prov.

## Källor och byggrevisioner

- Terminsbrowser 16/16 och programbrowser 40/40: källa/bygge `d1f34ca12f157a4ef116b634b021dce5d8b62a94`.
- Timplansmatris 19 + 1 och kompletterat termins-API 31/31: källa/bygge `d37f566b3575623171e07ef3150f16d55c6f14ed`.
- Gitdiff `d1f34ca..d37f566` omfattar endast timplansspec och API-provharness. Diffen för `web/app`, `web/lib` och `supabase/migrations` är tom. De gröna termins-/programsviterna gäller därför samma produktkällor.
- Tidigare backendförprov/slutprov 31 + 31 och äldre API 48 använder `cdf29c92c6e4114800bbf015562642037addca33`; alla sju styrda app-/server-/migrationshashar i terminsrapporterna matchar aktuella filer. Senare produktändringar är UI/CSS.

## Observerbara mål

| Mål från planen | Status | Konkret bevis |
| --- | --- | --- |
| HM/rektor kan fördela en nivå över åk 1–3 HT/VT och läsa om samma fördelning | Verifierat automatiskt | Riktig Worker-write/read och browser-save/reload; sex positionsbundna heltal, partiell fördelning och 50/50 över två terminer. |
| Termin-/årskurssummor räknar fördelade/kvarvarande poäng och väljer inte alternativ automatiskt | Verifierat automatiskt | TS-helper, faktisk TS/SQL-paritet på pinad SA25-fixtur, browseröversikt och underlagsnotering. Optional/saknade nivåer är inte skrivbara rader; två ramrader är egna nycklar. |
| Överfördelning stoppas och partiellt utkast kan sparas | Verifierat automatiskt | Slutet TS/API/SQL-kontrakt, felnyckel/version/dubblett/decimal/överfördelning nekas; verkligt partial-draft PASS och markerad rad/låst save i browser. |
| Låsta versioner bevaras och klon får självständig kopia | Verifierat automatiskt | Fastställd/ersatt skrivning nekas och läsning fungerar. Release-API ändrar klonen, läser den med egen revision/audit och bevisar oförändrad källrad/fördelning/verksamhetshistorik. |
| Revision, osäkert svar, audit och mandat skyddar sparat/osparat | Verifierat automatiskt | Två sessioner ger en CAS-vinnare; DB-/Worker-auditfel rullar tillbaka. Browser jämför konflikt, återläser efter verklig commit med tappat svar, låser omsparande vid okänd status, bevarar input vid MFA/auditfel och rensar vid säkerhetsstopp. |
| Sammanhängande dator-/telefonvy bevarar befintligt utbildningsarbete | Verifierat automatiskt; mänskligt prov återstår | Terminsbrowser 16, programbrowser 40 och timplan 20 beteenden på samma produktkälla. Fyra terminsbilder granskade. Inga nya admin-/timplansskapanderättigheter öppnas. |

## Rättade fynd och inkoppling

| Fynd | Rättning och omgranskning |
| --- | --- |
| Versionspaginering kunde förlora osparad terminsedit | `openEducation` skyddar nu global `hasUnsaved`, även pagineringsingången. Headerns versions-/kopierings-/fördjupningshandlingar låses under terminsedit. |
| Planen föreskrev rader i readreply men implementationen hade separat katalogprojektion | Planen är uttryckligen uppdaterad till slutet `{planId,revision,status,distribution}`. UI kräver kompatibel pin/nivålista och samma aktuella ID/revision/status i programplansläsningen; SQL validerar auktoritativa rader och separat faktisk TS/SQL-paritet finns. |
| Orphanhjälpen missade sparade nollrader och namngav inte nivån | Preflight jämför alla lagrade specialiseringskeys och namnger nivå + fördelad poängsumma. SQL nekar orphan. Release-API rensar exakt en vald rad och bevisar att andra rader bevaras genom nivåborttagningen. |
| Bannerns andra analysingång kunde unmounta osparad terminsedit | Båda `AnalysisBanner`-branches får `disabled={termsActive}`. Slutligt terminsprov 02 passerar på dator/telefon: banner/header låsta medan 50 finns kvar, sedan upplåst efter uttryckligt avbryt. |

UI → separata routes → obligatorisk skyddad route → stängda SQL-entrypoints är verifierat i kod. SQL återanvänder session → kund → offering → plan och förnyad mandatkontroll efter låsväntan. Mutationen kräver aktuellt HM-/rektorsmandat, MFA, CSRF, revision och obligatorisk dubbel audit. Helpers/tabeller är inte direkt klientskrivbara; endast två nya Worker-entrypoints tillkommer, totalt exakt 15.

## Granskade automatiska resultat

| Resultat | Utfall och gräns |
| --- | --- |
| Fem SQL-resultatfiler | PASS/exitCode 0. Backendrapporten sammanräknar 29 + 108 + 31 + 18 + 50 = 236 TAP-kontroller. Små JSON-filer lagrar status/exitkod, inte varje enskild TAP-assertion. |
| Tidigare termins-API-förprov och slutprov | 31/31 vardera, complete/cleanup/businesspreservation PASS; förprovets exakta ACL återställd. |
| Kompletterat release-API | 31/31 på d37, complete/cleanup/businesspreservation PASS. Alla sju sourcehashar jämförda mot aktuella filer. Initialt försök 29/31 med transporttimeout följt av snapshotavvikelse är bevarat separat och har inte räknats som PASS. Färsk Worker-omkörning passerar partial/CAS och alla nya bevarandeprov utan ändrade provvillkor. |
| Äldre programplans-API | 48/48, complete/cleanup/businesspreservation PASS. |
| Terminsbrowser | 16/16 i en fullkörning på d1; 0 skips/oväntade/flaky. Alla 16 cleanup-attachments har 0 egna verksamhetsrader/feltriggers. |
| Programbrowser | 40/40 i en fullkörning på d1; 0 skips/oväntade/flaky. Alla 40 cleanup-attachments har 0 egna verksamhetsrader/feltriggers. |
| Timplansbrowser | `PASS_WITH_SETUP_FAILURES`: exakt 20 beteenden, 19 från fullkörningen och phone09 från riktat omprov, 20 rena cleanupbevis och samma d37-källa/bygge. `completeSingleRun: false`. |

Release-API bevisar identiska businesshashar före/efter och 0 egna kunder/sessioner/planer/kvitton/utbildningshändelser/utbildningar/uppdrag/extrasessioner/feltriggers/felfunktioner i båda fixturerna. Auditankare och append-only händelser bevaras avsiktligt.

Timplanens två externa förberedelsefel inträffade i `beforeEach` före UI-prov, först phone01 och sedan phone09. Efter respektive avslutad process gjorde huvudagenten en verklig, målskyddad databasläsning och fann 0 kunder med fixturens markör; ingen reparationsradering gjordes. Riktat phone09-omprov passerade på 4,4 sekunder. Exakt orsak till setupstoppet är inte fastställd; målvalideringen innehåller synkrona CLI-anrop utan timeout. Detta ska inte beskrivas som ett rent 20/20 PASS från en enda fullkörning.

Bevisfiler finns under `work/pilot/results/phase5-18-*`, särskilt `terms-api-release.json`, `terms-browser.json`, `programplan-browser.json` och `timplan-browser.json`. Initiala misslyckade försök är bevarade i egna filer.

## Visuell och mänsklig kontroll

Desktop-/telefonbilder för öppen och sparad terminsfördelning har granskats. De tre årskurskorten, grupperade HT/VT-fält, ämnesnamn, nivåer, radtotaler och kvarvarande poäng är läsbara. Mobilens extra tomma gruppkolumner är borttagna; terminsfält/årskursknappar har minst 44px höjd. Hela 100 visas efter rättad input-padding. Browser prövar dokumentoverflow och faktisk textbredd för tre siffror.

**Mänskligt prov: awaiting_user.** På vanlig lokal preview 3012: öppna en bunden programplansversion, välj **Fördela poäng**, skriv 50 i åk 1 HT och 50 i åk 1 VT för en 100-poängsnivå. Kontrollera rad/årskurssumma, spara, återöppna och pröva samma arbete på telefon. Bedöm om placering, återstående poäng och sparandet känns tydliga och snygga.

TS/SQL-paritetsprovet gäller SA25-fixturen och är inte ett uttömmande prov av varje katalogprogram. Telefonprov är WebKit-emulation, inte ett mänskligt prov på fysisk telefon. Framgångswrite använder verklig Worker/SQL; vissa transportfel injiceras efter verklig commit och är redovisade som transportprov. Syntetiska sessionscookies är inget interaktivt IdP-/pilotbevis.

Full fas 5 och ADMIN-02 är fortsatt öppna. HM-delegation till skoladministratör, nationellt godkännande/fastställande och skapande av timplan från godkänd/fastställd programplan är separata pending behov. Ingen verklig kommunanslutning eller pilotdrift godkänns av denna granskning.
