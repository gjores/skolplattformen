# Programplan före gymnasietimplan

## Användarbeslut och avgränsning

2026-10-12 beställde användaren borttagning av planer utan koppling och fastslog att programplanen kommer först. Förtydligandet var: **”Ja, gymnasiet; behåll programplaner under arbete.”** Det ändrar inte grundskolans timplaner eller introduktionsprogrammens veckoramar. Befintliga gymnasieflöden, versioner och explicita klasskopplingar ska bevaras.

Avgränsad rättning inom fas 5:s planeringsflöde, inte ett nytt fullständigt krav-/fasgodkännande. Tidigare krav- och fasstatus består.

## Inventering och genomförande

- 20 programplaner i lokala protected-målet: alla har utbildning och skola. De ska bevaras, även när timplan ännu saknas.
- Tre gymnasietimplaner har programplanskälla och ska bevaras.
- En äldre syntetisk gymnasietimplan, Karantän SA v1, saknar programplanskälla. Den har en timcell och inga klasskopplingar, historikrader eller skapandekvitton.
- Två grundskoletimplaner och en IM-timplan använder avsedda andra underlag och ska bevaras.

`work/pilot/prune-unlinked-gym-timplan.mjs` är avgränsad till exakt den inventerade syntetiska planens ID och lokala protected-målet. Den vägrar ändrat urval eller nytillkomna klasskopplingar, historik eller kvitton. `--verify` kör rensning/migration/prov med yttre rollback. `--apply` skriver först en privat återställningskopia av planen och timcellen, raderar endast dessa, installerar migrationen samt registrerar den i migrationsjournalen. Snapshotjämförelse av tio verksamhetstabeller före/efter och efter transaktionen skyddar övrigt innehåll. Skriptet är avsiktligt engångsinriktat och vägrar upprepad tillämpning.

Migration `20261012130000_gym_timplan_requires_programplan.sql` vägrar installation vid ogranskade fristående gymnasietimplaner. Den spärrar därefter INSERT/UPDATE utan programplanskälla och byte till gymnasieform med befintliga okopplade timplaner. Befintlig FK och fryst källvalidering gäller fortsatt. Ingen klient kan ge undantag. Programplaner utan timplan tillåts.

Timplanevyn förklarar ordningen programplan → skolans timplan. En årsrad med **Ingen timplan skapad** är ett saknat underlag, inte en sparad fristående timplan. Årsvyn behåller dessa luckor så att de går att arbeta vidare med. **Välj programplan** öppnar valet av sparad programversion; frånvaron av en timplan säger inte längre felaktigt att programplan saknas.

## Verifiering och leverans

- `--verify`: exit 0 med sex databasprober, yttre rollback och bevarandekontroll efter rollback.
- `--apply`: exit 0, commit bekräftad och post-commit-jämförelse PASS. Exakt en timplan och en timcell borttagna. 20 programplaner, tre kopplade gymnasietimplaner samt övriga verksamhetsrader i tio tabeller bevarade. Migration registrerad i lokal journal.
- Proberna täcker installation med ogranskad data (nekas), återinförande utan programplan (nekas), GR/IM:s andra underlag (tillåts), bortkoppling av befintlig källa (nekas) och borttagning av använd programplan (nekas).
- 24/24 modell-/serverprov för gymnasietimplan passerar. Typkontroll, lint, appbygge i separat katalog och handboksbygge passerar.
- Lokal återställningskopia: `web/outputs/unlinked-gym-backup-1791801405993.json` med filrättighet 0600. Kvitton: `unlinked-gym-verify.json` och `unlinked-gym-apply.json`. Kända before/after-hashar finns i kvittot; före-hasharna skiljer sig mellan verify/apply eftersom arbetsdatabasen är aktiv. Varje transaktions egna bevarandekontroll passerade.
- Historiska fullfasprover är inte omkörda. Äldre testfixturer som avsiktligt skapar fristående gymnasietimplaner behöver anpassas till detta nya användarbeslut före framtida omkörning. Det tidigare fasprovet bevisar inte den nya databasregeln.

Lokal provdata och kvitton ligger i ignorerade `web/outputs/`; ingen verklig kommun-/elevkälla ingår. Uppdatering av den lokala appens vägledning och läsande browserprov redovisas i följande leveransnotering.


### Slutleverans

Den lokala appen på 3012 kör produktbygge `d7c3988c7243d611457dfb0f25eafcbcb4a4f086`. 179 byggfiler verifierades före installation; den tidigare appen och äldre hashade klientfiler behölls. Nycklar hanterades enbart av befintligt startskript. Faktisk lokal OIDC med syntetisk rektor → gymnasiets timplanslista på dator och telefon passerade med exit 0, rätt ny vägledning, fylld lista, ingen sidövergripande horisontell rullning och noll sidfel. Datorbild granskad. Lokal rapport: `web/outputs/gym-link-live-verification.json`.

Separat läsande slutkontroll efter installation: **0** gymnasietimplaner utan koppling, **3** kopplade gymnasietimplaner, **20** programplaner med utbildnings-/skolkoppling, **2** grundskoletimplaner och **1** IM-timplan. Ingen ny timplan skapades av browserprovet. Migrationsregel och rensning är tillämpade endast i lokala protected-provmålet; ingen extern driftsättning.


Slutlig texträttning är därefter levererad som lokalt produktbygge **a5a5d05e880cbcdb6a8effac5b8423751bd2dceb**, med samma kontroll av 179 byggfiler och separat gammal byggkopia. Ny faktisk browserkörning exit 0 kontrollerar även **Ingen timplan skapad** och **Välj programplan för …** på befintliga syntetiska utbildningar. Dator/telefon, fylld lista, noll sidfel och skärmbreddskontroll PASS. DB-regeln från d7c3988 är oförändrad.
