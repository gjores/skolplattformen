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

- `crates/model` – kontraktet: underlag (`Problem`) och resultat (`Solution`), version 3. V3 lägger till `search_statistics` i resultatet; äldre underlag och svar godtas inte som V3. Okända fält nekas.
- `crates/solve` – lösaren. Besked: `complete`, `time_limit`, `infeasible` (med bevis), `input_missing`, `cancelled`.
- `crates/validate` – fristående granskning som räknar i minuter och inte delar kod med lösaren. Bygger även för `wasm32-unknown-unknown`.
- `crates/cli` – kommandorad, syntetiska skolor och mätning.
- `crates/service` – `schemamotor-tjanst`, HTTP-tjänst för appens server: `GET /v1/health`, `POST /v1/solve[?time_ms=N]`, `POST /v1/diagnose`, `POST /v1/validate` och `POST /v1/positions` med `Authorization: Bearer`. Gränser för storlek, räknetid och samtidiga körningar; innehåll loggas inte.

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

## Inte med

Restid mellan byggnader, varannan-vecka-pass utöver perioder, exakt lösare (CP-SAT), jobbtjänst och eget gränssnitt. Appens skyddade serverväg bygger ett anonymiserat underlag och läser motorresultaten; ingen standardexport eller kommunanslutning följer av denna koppling. Motorn är inte jämförd med FET, XHSTT-instanser eller kommersiella system.
