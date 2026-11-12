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

- `crates/model` – kontraktet: underlag (`Problem`) och resultat (`Solution`), version 1. Okända fält nekas.
- `crates/solve` – lösaren. Besked: `complete`, `time_limit`, `infeasible` (med bevis), `input_missing`, `cancelled`.
- `crates/validate` – fristående granskning som räknar i minuter och inte delar kod med lösaren. Bygger även för `wasm32-unknown-unknown`.
- `crates/cli` – kommandorad, syntetiska skolor och mätning.

## Regler

Hårda: ingen lärare, elev eller sal dubbelbokas; rast mellan pass; frånvaro och tillåtna tider; salens egenskaper och storlek; låsta pass; samtidiga pass (block) och pass som inte får överlappa; lunch i ett fönster; högsta undervisningstid per dag; samma ämne högst en gång per dag när det är förbjudet.

Önskemål med vikter: håltimmar för elever och lärare, sena pass, samma ämne flera gånger samma dag, och så få flyttade pass som möjligt mot ett tidigare schema (`reference`).

Elever räknas i kluster: elever som har exakt samma grupper. Två grupper krockar bara om de delar ett kluster.

## Sökning

1. Bevis före sökning: pass utan möjlig tid eller sal, låsta pass som krockar, för lite tid för en lärare, klass eller salstyp.
2. Första schema: placera svårast först och kasta ut det som står i vägen, med statistik över vad som brukar krocka.
3. Förbättring: simulerad avsvalning med flytt, byte och korta kedjor, på alla kärnor med olika frön.
4. Det som inte får plats förklaras. För en lärare eller klass med högst 40 pass prövas alla möjligheter; då är beskedet ett bevis med minsta mängd pass som inte går ihop.

Med en tråd och iterationsgräns ger samma underlag och frö samma schema.

## Inte med

Restid mellan byggnader, varannan-vecka-pass utöver perioder, exakt lösare (CP-SAT), jobbtjänst, koppling till appen och gränssnitt. Motorn är inte jämförd med FET, XHSTT-instanser eller kommersiella system.
