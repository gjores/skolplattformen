# Schemamotor (kandidat)

Fristående motor i Rust som lägger ett veckoschema ur ett underlag i JSON. Den läser och skriver inget annat och känner inte till appen. Allt underlag i katalogen är syntetiskt.

```bash
cargo test --release
cargo run --release -- gen gymnasium --out underlag.json
cargo run --release -- solve underlag.json --time 10000 --out resultat.json
cargo run --release -- validate underlag.json resultat.json
cargo run --release -- bench --time 10000 --seeds 3 --out bench/out
```

## Delar

- `crates/model` – kontraktet: underlag (`Problem`) och resultat (`Solution`), version5 med uttryckligt stöd för version4. V4 lade till det strikta kontraktet för placeringsförslag. V5 tillför aktivitetens gemensamma årsbudget. Okända fält nekas; v4 med budgetfält nekas. Alla problemsvar återger begärans version, medan hälsosvaret anger5 och `supported_problem_versions:[4,5]`.
- `crates/solve` – lösaren. Besked: `complete`, `time_limit`, `infeasible` (med bevis), `input_missing`, `cancelled`.
- `crates/validate` – fristående granskning som räknar i minuter och inte delar kod med lösaren. Bygger även för `wasm32-unknown-unknown`.
- `crates/cli` – kommandorad, syntetiska skolor och mätning.
- `crates/service` – `schemamotor-tjanst`, HTTP-tjänst för appens server: `GET /v1/health`, `POST /v1/solve[?time_ms=N]`, `POST /v1/diagnose`, `POST /v1/validate` och `POST /v1/positions` och `POST /v1/suggest` med `Authorization: Bearer`. Gränser för storlek, räknetid och samtidiga körningar; innehåll loggas inte.

I motor5 kan `activities[].time` ha `budget:"arsbudget-1"` på flera periodrader. Samma budget inom **samma aktivitet** har identiska min/max och unika, befintliga perioder. Bidragen summeras till ett gemensamt intervall, med varje rads egna `weekday_days` och bara de pass som gäller i den perioden. Ett gemensamt pass bidrar i båda terminerna, separata termpass bara i sin termin. Samma budgetsträng i en annan aktivitet är en separat budget. Compile/state/sökning/bevis använder bidrag per enhet och veckodag; den oberoende kontrollanten summerar direkt från originalraderna. Utan budget gäller tidigare separata radregler både i v4 och v5. Budget-ID är1–200 UTF8-byte utan trimavvikelse/kontrolltecken, `null` nekas, högst32 rader per budgetbärande aktivitet, dagräknare högst366 och minutgräns högst10^9; den totala interna kostnaden storlekskontrolleras före kompilering. Ingen personinformation behövs.

```sh
SCHEMAMOTOR_TOKEN=<minst 16 tecken> cargo run --release -p schemamotor-tjanst   # lyssnar på 127.0.0.1:8787
```

Övriga miljövariabler: `SCHEMAMOTOR_ADDR`, `SCHEMAMOTOR_MAX_TIME_MS`, `SCHEMAMOTOR_MAX_CONCURRENT`, `SCHEMAMOTOR_THREADS`. Appen läser `SCHEMAMOTOR_URL` och `SCHEMAMOTOR_TOKEN`.

## Regler

Hårda: ingen lärare, elev eller sal dubbelbokas; rast mellan pass; frånvaro och tillåtna tider; salens egenskaper och storlek; låsta pass; samtidiga pass (block) och pass som inte får överlappa; lunch i ett fönster; högsta undervisningstid per dag; samma ämne högst en gång per dag när det är förbjudet.

Önskemål med vikter: håltimmar för elever och lärare, sena pass, samma ämne flera gånger samma dag, och så få flyttade pass som möjligt mot ett tidigare schema (`reference`).

Elever räknas i kluster: elever som har exakt samma grupper. Två grupper krockar bara om de delar ett kluster.

## Sökning

1. Bevis före sökning: pass utan möjlig tid eller sal, låsta pass som krockar, för lite tid för en lärare, klass eller salstyp.
2. Första schema: placera svårast först och kasta ut det som står i vägen, med statistik över vad som brukar krocka.
3. Förbättring: simulerad avsvalning med flytt, byte och korta kedjor, på alla kärnor med olika frön.
4. Det som inte får plats förklaras. För en lärare eller klass med högst 40 pass prövas alla möjligheter; då är beskedet ett bevis med minsta mängd pass som inte går ihop.

`POST /v1/diagnose` tar samma `Problem` och ger `{version, problem_id, diagnoses}` utan motorsökning eller ändringar. Fynden gäller möjliga tider, salstillgång, lås, resursbelastning och aktivitetstid. Odelbar tid prövas mot exakta möjliga summor i en förenkling utan resurskrockar; om summamängden överstiger 20 000 avstår kontrollen från slutsats. Undervisning utan lärare (aktiviteter med tidskrav) ger ett uppmärksamhetsfynd med `proof:false`. Egna elevaktiviteter utan lärardeltagare ger inte detta fynd. Vakanta pass sammanfattas i ett fynd med samtliga berörda passreferenser. Förkontroll, indatafel och slutliga lösningssvar har högst 500 diagnoser; vid fler visas 499 detaljer (bevis först) och en `more_diagnoses`-notis med exakt antal återstående fynd. Begränsningen ändrar aldrig lösningens status eller gör ett olösbarhetsbevis till ett grönare besked.

`Solution.search_statistics` bär `lessons`, `bottlenecks` och `iterations`. Passlistan har högst 20 poster med `lesson`, `attempts` (prövade starttider), `moves` (utförda flyttförsök i sökningen), `backtracks` (nekade placeringsförsök och återgångar) och `ejections` (undanträngningar). Flaskhalslistan har högst 20 villkor/resurser med `code`, valfri `resource` och `count`. En orsak/resurs räknas högst en gång per placeringsförsök. Sökprov kan återgå; antalen är sökhändelser, inte antal ändringar i slutresultatet. Samplacerade pass ärver sin enhets händelser. Alla söktrådars händelser summeras och sorteras stabilt; virtuella kopplingar redovisas utan påhittade resurs-ID:n.

Med en tråd och iterationsgräns ger samma underlag och frö samma schema och sökstatistik. Körning med tidsgräns eller flera trådar ger inga motsvarande determinismlöften.

## Lokal placeringshjälp

`POST /v1/suggest` tar `{problem, placements, mode, lesson, target, depth}`. `mode` är `lesson`, `target` eller `rest`; `lesson` ska vara ett känt pass i de två första lägena och null i `rest`. `target` är `{day, start_min, rooms}` endast i `target`, annars null. Tom salslista låter motorn välja, en angiven salslista binder det valda passets sal i just förslaget. `depth` är 1–3 och räknar redan lagda blockerande **pass**, även om några är samplacerade, utöver det uttryckligt valda passet eller viloytans nya mål. Djup 1 tillåter direkt placering och tvåpassbyte; två respektive tre redan lagda blockerare kräver djup 2 respektive 3.

Svaret är `{version, problem_id, depth, timed_out, elapsed_ms, suggestions}` med högst fem unika förslag. Varje förslag har hela `placements`, en exakt `changes`-lista (`lesson`, `from: Placement|null`, `to: Placement`), `metrics_before`, `metrics_after` och `cost` som är exakt `metrics_after.cost`. `from:null` betyder ett tidigare parkerat pass. Ingen tidigare lagd rad får försvinna. Alla mål i `rest` måste vara lagda i varje kandidat; en halv viloyta presenteras aldrig som ett helt förslag. I `lesson` och `target` får andra ursprungligen parkerade pass ligga kvar.

Referensen sätts i en lokal kopia till just insända placeringar; vikterna är oförändrade. Rangordningen är färre ändrade redan lagda pass, kortare total tidsförskjutning (veckodag × 1440 + startminut), lägre kostnad och stabil placeringsordning. Ett salbyte räknas som ett ändrat pass och kan ske utan tidsförskjutning. De bästa hittade alternativen är inte ett globalt optimalitetsbevis. Inga alternativ är inte ett olösbarhetsbevis.

Sökningen använder en gemensam tvåsekundersbudget för hela anropet inklusive kontroller, inte två sekunder per kandidat eller mål. Den prövar djupet stegvis och använder en explicit heapstack med kompakta tidsiteratorer för även stora viloytor. Det finns ingen separat 512-målsgräns eller rekursion per viloytemål. `timed_out` betyder en faktiskt nådd deadline. Redan helt kontrollerade alternativ kan följa med när budgeten tar slut; delvis prövade alternativ följer aldrig med. Den oberoende kontrollanten har fått `validate_before` för avbrott vid samma deadline; vanliga `validate` är fortsatt utan tidsgräns och oförändrad i regelbedömningen.

Ett låst redan lagt pass eller en samplacerad enhet med låst del flyttas aldrig. En olagd fast aktivitet i `rest` kan bara läggas på sin låsta tid. Samplacerade pass hanteras som en sökenhet och alla dess pass följer med i kandidaten. Delvis lagda samplacerade enheter nekas som en hård avvikelse, precis som i den befintliga kontrollanten. Samma kontrollant prövar ursprungsplaceringen och varje hel kandidat, inklusive tidskrav, elevkluster, perioder, salar, marginaler, lunch och dagsgränser. Medvetna krockmarkeringar hör till appen och ändrar aldrig denna regelkontroll.

Felkoder: 400 `bad_request` (inklusive mode/djup/nullkombinationer och okända fält), `bad_problem`, `version_mismatch`, `unknown_lesson`, `locked_lesson`, `bad_target` eller `invalid_baseline`. Det sista svaret har `details.violations` med kod, text och referenser; inga förbättringsförslag returneras för ett utkast med hårda brott. HTTP-grindarna är samma som för övriga motorvägar: 401 utan rätt token, 405 för fel metod, 413 över kroppsstorleksgränsen och 429 vid upptagen kapacitet. Queryparametrar godtas inte. Tid anges i verkliga `elapsed_ms`, även vid avbruten förkontroll. Inget sparas eller installeras av placeringshjälpen.

## Inte med

Restid mellan byggnader, varannan-vecka-pass utöver perioder, exakt lösare (CP-SAT), jobbtjänst och eget gränssnitt. Appens skyddade serverväg bygger ett anonymiserat underlag och läser motorresultaten; ingen standardexport eller kommunanslutning följer av denna koppling. Motorn är inte jämförd med FET, XHSTT-instanser eller kommersiella system.
