---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "23"
step: E
status: passed
verified: 2026-10-06
requirements: [ADMIN-02, ADMIN-03]
requirements-finally-verified: []
scope: local-synthetic-only
---

# 05-23/E — aktuell full regression

E är avslutad 2026-10-06 enligt senare användarbeslut. Hela aktuella matrisen är PASS på samma separata byggartefakt. Grundflödet är användarrapporterat godkänt; ADMIN-02/03/04 och hela fas 5 är fortsatt Pending.

## Reviderad omfattning

Senare användarbeslut går före historiska paket-/blockeditorinstruktioner i A–D. Aktuellt programplansarbete innehåller fasta nivåer, sparade blockramar, poäng, terminer, analys och kopiering utan skolans paketval. Övergången till skolvis timutkast, direkt timinmatning och återöppning ingår i regressionen. Bevarade backendvägar för paket/block prövas separat; deras äldre UI räknas inte som aktuell leverans.

Användarens ”detta funkar!” är registrerat som `user_reported_pass_current_basic_flow` 2026-10-06. Enheter, roller och exakt provbygge angavs inte separat. Rektorns uttryckliga färdigmarkering/HM-godkännande och mobilens årskursknappar är pending-gapen, utanför E. Yrkesram 05-17, formella beslut/garantiprövning, 05-25–35:s omplanering, årsplanering 05-36–43 och fas 4-checkpoint består.

## Bevarad felhistorik och rättningar

- Första fulla SQL-omgången: 13 FAIL av 2 512 kontroller i 35 filer. Åtta historiska ACL-profiler lämnade fyra senare gymfunktioner aktiva. De kompletterades med exakt dessa fyra rollback-only revokes; ursprungliga asserts/antal är oförändrade. Dagens faktiska 25-signaturs-ACL verifieras i API-matrisen. Auditprov 13 i phase2 matchade ett gammalt meddelande; nu krävs aktuell SQLSTATE `42501` och exakt `History denied`. Färsk full SQL: 2 512/2 512 PASS. Första rapporten består.
- Programplansbrowser 12 hade en gammal förväntan utan plan-ID i URL. Återöppning använder uttryckligen skyddad planlänk. Provet kontrollerar nu exakt vy/utbildning/plan, inga plan-ID i local/sessionStorage, osparatskydd, sena svar, sessionsrensning och faktisk 401 efter utloggning. Äldre felresultat skrivs inte om.
- Första separata byggartefakten saknade Tailwinds utilityklasser: index CSS 109 126 byte och 0 skannade komponentfiler. Datorns blockprov 3 PASS, telefonens 3 FAIL och 6 skips sparas. Samma artefakts API 170 PASS är historik, inte slutbevis. En lokal projektgräns i byggkopian gav rätt avsökning (60 komponentfiler/2 295 kandidater). Korrigerad CSS `index.Dao54_T5.css`, 294 459 byte, har flex/hidden/fixed. Ingen produktkälla ändrades för denna byggmiljörättning; hela slutmatrisen körs om.
- Därefter gav programplanssviten 39/40: telefonfall 13 raderade sina egna planer och laddade om den raderade planens nya återöppningslänk. Provet avser tomt urval och går nu uttryckligen till startsidan efter fixturraderingen. Alla tidigare moment, osparatprov och sista tom-lista-besked består. Verklig 403-rensning är kvar och prövas av session-/mandatfallen och API-matrisen. Felomgången och dess städning bevaras. Endast testet ändras (`9d66cb2`); det nya byggets interna bundle-ID:n skiljer sig, så hela slutmatrisen körs om på samma nya artefakt.
- 05-22:s fyra tidigare `updated_at`-avvikelser är fortsatt historiskt bevarande PARTIAL. E återställer eller godkänner inte dem.

## Bygg- och datagräns

Alla slutliga API-/browserprov riktas seriellt mot separat workerd på `http://127.0.0.1:3059`, källa `e9ca1e7faa9c0a3ba51e3a430fc46c6e3b4a2a15`. Den korrigerade artefakten har 174 filer och SHA256 `fab8d1bcca6ddce94adcd7d64eb583d53bb8dee6e704d2286cd17aa292264d82`. 357 versionshanterade webb-källfiler i kopian är byteidentiska med arbetsroten. Privata miljöfiler undantas från artefaktmanifestet.

`/api/health/db` visar workerd och `skolplattform_worker`, inte byggrevision. Revision/artefakt binds därför genom kontrollerad start från den ägda kopian, manifest och oförändrade filhashar. Några äldre kontrollnamn nämner historiska funktionsantal; exakta signaturlistor och hela ACL-jämförelsen avgör resultatet.

Ordinarie 3012:s artefakt är fortfarande `5dd7baf`, utan byte/reset. Servern svarade först inte vid efterläsningens inledande health-kontroll (ECONNREFUSED). Läsande process-/cwd-kontroll visade att ingen levande root-provmiljö ägde de privata låsfilerna. Endast två ignorerade privata restfiler togs bort, och samma bevarade bygge återstartades på 3012. Därefter passerade exakt samma 18 scenarier och 44 auditpar; första otillgängligheten bevaras. Muterande prov använder egna syntetiska kunder med ägarskapskontroll och städning. Obligatorisk säkerhetsaudit och dess ankare består. Före/efter jämförs hela rader inklusive tidsstämplar i 14 verksamhetstabeller, ACL och migrations-/funktionsfingeravtryck. Befintliga användarscenarier läses via current-läge, utan omförberedelse.

## Slutresultat 2026-10-06

**PASS för aktuell 05-23/E, lokalt med syntetiska uppgifter.** [Samlad rapport](../../../work/pilot/results/phase5-23-e-final.json), [bildgranskning](../../../work/pilot/results/phase5-23-e-resume-visual.json) och [sömnkorrelation](../../../work/pilot/results/phase5-23-e-resume-sleep-diagnosis.json).

| Kontroll | Slutresultat |
|---|---|
| Modell/server och fixturhjälpare | 674/674 och 19/19 PASS på identiska källor |
| TypeScript, lint, skyddat bygge, handbok | PASS; inga nya produkt- eller handboksändringar vid återupptagandet |
| Full SQL | 35 filer, 2 512/2 512 PASS |
| Faktisk Worker/API, åtta grupper | 170/170 fall, 1 077/1 077 kontroller PASS |
| Dator/Chromium och telefon/WebKit | Block 6, ram 10, livscykel 20, program 40, terminer 25, GR/IM-timplan 22, gymtimplan 26: 149/149 PASS |
| Uttryckliga skips | Sex borttagna paketeditorfall; ett telefonlayoutfall på dator |
| Städning | 150 bilagor, noll egna verksamhetsrader; obligatorisk säkerhetsaudit och ankare bevarade |
| Bevarande efter samtliga muterande prov | 14 hela tabellmängder inklusive tidsstämplar, exakt 25-signaturs-ACL och migrations-/funktionsfingeravtryck PASS |
| Befintliga användarscenarier före/efter | Samma 18 scenarier och 44 auditerade läsningar per omgång, utan omförberedelse |
| Artefakter | Samma 174 testade filer och ordinarie 3012:s 719 kvarhållna filer oförändrade |

Återupptagandet körde oförändrade programplans-, GR/IM- och gymtimplansprov samt alla åtta API-grupper. De fyra redan godkända browsergrupperna och statiska kontrollerna återanvänds från samma artefakt/identiska källor. Ingen testförväntan eller tidsgräns vidgades. Telefonlayoutfallet som runtime-skippas på dator skapar en fixtur; därför finns 150 städningsbilagor för 149 körda beteendefall. Varje grupps rapport och hash finns i slutrapporten.

De tidigare nio programfelen överlappar faktisk Sleep→Wake enligt värddatorns strömlogg. 29 godkända fall hade ingen överlapp; två avslutades inom cirka 1,5 sekunder från en sömnövergång. Den oförändrade återkörningen på samma artefakt gav 40/40 på 3,9 minuter med vila pausad under körningen. Första 31/40-omgången och dess städningsavvikelse bevaras. Detta belägger miljöpåverkan; inga separata produktfel reproducerades i de nio fallen.

En separat kodobservation: fördjupningens `working` styr `aria-busy`, medan ”Allt sparat” speglar terminsfördelningens state. Det kan ge en tillfälligt missvisande status under fördjupningsändring. Observationen är inte separat reproducerad som orsak till de nio felen; den räknas inte som rättad av återkörningen. Sparningens revisions-, avstämnings- och dubbelwrite-skydd passerar aktuella prov.

Dator-/telefonbilder för fasta nivåer, full poängram, terminsåtgärder, delad skrivskyddad plan, administratörsvy och skolvis direkt timinmatning är tekniskt granskade. Granskade filer binds med SHA256 och byggrevision i bildrapporten. Grundflödets mänskliga godkännande består; övriga uttryckligen oprövade användarmoment godkänns inte retroaktivt.

Vanlig 3012 behåller sitt befintliga `5dd7baf`-bygge; fokusfixen är verifierad i den separata artefakten. Ingen reset, omförberedelse, verklig kommunanslutning, ny interaktiv IdP-verifiering eller publicering utfördes. ADMIN-02/03/04, hela fas 5, yrkesram, beslut/garantiprövning, omplanering 05-25–35, båda nya gapen, 05-22 metadata PARTIAL och fas 4-checkpoint består. Nästa plan 05-36 är inte startad.

**Oberoende GSD-granskning:** [PASS utan blockerare](../../../work/pilot/results/phase5-23-e-independent-review.json). Granskningen kontrollerade rapport-/källhashar, råbilagor, faktiskt fallantal, båda artefakterna, full databevaring och ärlig krav-/gapstatus.

## Historiskt mellanläge före återupptagen körning

**INCOMPLETE — inget slutligt E-PASS.** Se [minimerat mellanläge](../../../work/pilot/results/phase5-23-e-progress.json).

| Kontroll | Faktiskt resultat |
|---|---|
| Modell/server, fixturhjälpare | 674/674 respektive 19/19 PASS |
| Full SQL | 35 filer, 2 512/2 512 PASS |
| TypeScript, lint, skyddat bygge, handboksbygge | PASS efter fokusfix |
| Terms på rättat bygge | 25/25 PASS, ett avsiktligt runtime-skip på dator |
| Block / ram / livscykel på rättat bygge | 6 / 10 / 20 PASS, sex historiska paket-UI-skips |
| Programplaner på rättat bygge | 31/40: nio FAIL med tidsgränser och väntelägen. Orsaken är inte färdigutredd |
| Aktuell browsermatris hittills | 92 PASS, 9 FAIL, 7 uttryckliga skips; GR/IM och gym återstår på rättat bygge |
| Slutlig API-matris | Åtta grupper återstår på rättat bygge; äldre 170 PASS gällde första CSS-bristande artefakten |
| Städning | 100 automatiska bilagor visar noll egna rader; en avbruten egen fixtur har kompletterande städningsbevis |
| Slutlig fullradsbevaring | 14 hela ursprungliga tabeller inklusive tidsstämplar, ACL och migrations-/funktionsfingeravtryck PASS |
| Artefakter | Rättat byggets 174 filer och ordinarie byggets 719 filer oförändrade |
| Befintliga scenarier | Före: 18 scenarier/44 auditerade läsningar PASS. Efter: 18 scenarier/44 läsningar PASS efter återstart, exakt samma scenarier och bevarade verksamhetsrader. Första otillgänglighet före sessionsmintning bevaras |

Första terms09 gav 24/25: ofördeladfiltret dolde den fullt fördelade målraden. Två RAF garanterade inte att React hade visat den innan fokus markerades hanterat. Oförändrat separat diagnosprov passerade; det räknas som historik. Produktfixen inväntar ny rendering med rätt årskurs/återställt filter och bekräftar verkligt fokus på synlig kontroll. Hela terms på rättat bygge passerade utan att försvaga fokuskravet. Typ/lint, 674 modellprov och handboksbygge passerade; handbokens avsedda åtgärdsbeteende består.

Den äldre gymomgångens källskydd stoppade två uppsättningar medan produktkoden ändrades; 24 ej körda fall är inte gymbevis. Efter nytt bygge kördes aktuell matris seriellt, men stoppade vid programplanssvitens nio FAIL. Första felrapporter och historiska revisionsbundna PASS bevaras.

En afterEach-tidsgräns lämnade en egen kundgraf. Den binds till exakt syntetiskt UUID/markör och skapades 124 ms efter programplan-desktop02:s start. Kanonisk fixturstädning återupptogs enbart för den grafen; äldre fixtur från 2026-10-03 lämnades kvar. Den första bevarandekontrollens FAIL sparas. [Städningsbeviset](../../../work/pilot/results/phase5-23-e-residue-cleanup.json) visar noll egna verksamhets-/sessionsrader och att exakt alla ursprungliga 14 helradsmängder återfinns efter städningen. Säkerhetsaudit och identitetsankare består. En felaktig exportsökväg efter DB-städningen rättades; separata läskontroller ger det sparade slutbeviset.

På rättat bygge granskades terminsåtgärdens fokus före/efter samt mobilfokus, desktop poängram, mobilanalys och skrivskyddad administratörsvy. Gymtimmar och full aktuell bildgranskning återstår. Ingen ny interaktiv IdP, kommunanslutning eller pilotdrift är verifierad.

Nästa E-arbete är att utreda de nio programplansfallen, återköra hela aktuella matrisen/API på samma artefakt, slutföra bild-/bevarandeverifiering inklusive ny efterläsning efter återstående slutmatris. 05-23 förblir in_progress; 05-36 är nästa planerade genomförandesteg efter E, ännu inte påbörjat. Rektorns färdigmarkering/HM-godkännande och mobilens årskursknappar är pending. ADMIN-02/03/04, hela fas 5, 05-17, beslut/garantikontroll, 05-25–35:s omplanering, 05-22 metadata PARTIAL och fas 4-checkpoint består.
