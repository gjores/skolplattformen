---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "06"
subsystem: database
status: complete
requires: [04-05]
provides: [simulerad källleverans, explicit källbeslut, separat källägande och lokal rättelse]
affects: [04-10, 04-13, 04-21]
requirements: [STU-04, STU-06]
completed: 2026-09-28
---

# Fas 4 plan 06: Källvärde och lokal rättelse

Den simulerade källan kan lämna basfält utan att skriva över en lokal rättelse. Administratörens uttryckliga beslut sparar version, ursprung och beslutshistorik. Det är lokal syntetisk funktion; ingen verklig registeranslutning eller INT-07-verifiering.

## Levererat

- Postgres-only `phase4_simulated_source_deliver(jsonb)` accepterar endast elev-ID, tillåtet basfält och värde. Namn, allowlistat syntetiskt personnummer och skyddsmarkering ingår; datumrelationer/utbildningar importeras inte av simulatorn.
- Fälttillstånd skiljer ansvarig källa, originalkälla, skrivägare, senaste källvärde och lokal rättelse. Effektivt lokalt värde består vid en avvikelse. En upprepad identisk leverans skapar ingen ny version eller avvikelse; ett uppdaterat inkommande värde ändrar samma öppna avvikelse under lås.
- `phase4_resolve_source(jsonb)` kräver levande administratörsmandat, pågående/framtida placering, skyddsbehörighet där relevant och exakt `expectedVersion`. Båda valen sparar beslut och historik. Registerägt fält nekas i `basics`; efter uttryckligt källval följer fältet senare källleveranser.
- Systemleveranser har null personalaktör. Konfliktens ändringsaktör blir `Simulerad källa` när senaste relevanta historikrad kommer från systemet, aldrig den personal som just läser konflikten.
- Personnummer lämnas utanför källavvikelsens värden och maskeras i historiken. Historikens `resolution` visar `local`/`source`; modell och sluten serverparser har samordnats med 04-12. Gränssnittets beslutstext tillhör 04-13.
- Leveransens värdefria säkerhetshändelse skrivs i samma transaktion. Loggfel återställer fältvärde, version, historik och avvikelse. Approllerna saknar execute; resolver förblir stängd tills skriv-API i 04-10.
- CLI accepterar exakt `--target protected`, kontrollerar mål före skrivsessionerna, använder en egen syntetisk slump-ID-fixtur och skriver bara status/fall-ID. Fixturcleanup är begränsad till eget kund-ID och verifierat provnamn; append-only-undantaget gäller endast den privilegierade cleanuptransaktionen. Säkerhetsloggar raderas inte.

## Faktisk verifiering

| Kontroll | Resultat |
|---|---|
| RED före implementation | Två saknade SQL-funktioner, 2/2 förväntat röda |
| Registerprov efter migration 163000 | PASS 150/150 inklusive samtliga tidigare registerassertions och 50 nya källassertions |
| Samordnad urvalsprojektion (04-12) | PASS 20/20 |
| CLI:s otillåtna argument | PASS 6/6; inga mål- eller databasargument accepteras |
| CLI syntax | PASS |
| Exakt registeromprov efter CLI | PASS 150/150 via ordinarie `run-sql-tests.mjs` efter slutliga migrationer |
| CLI verklig samtidighet | PASS 3/3: rollstängning, observerad faktisk låsväntan vid upprepad leverans samt gammalt beslut mot samtidig källleverans. Egen fixtur städades. |
| Full SQL-regression | Fullständigt omprov: FAIL totalt, 16 filer körda, 607 passerade assertions i tio filer. Samma sex äldre fas 3-fixturer stoppas före assertions av `Case school scope denied`. Alla fas 4-filer PASS. |

CLI:s första försök fick CONNECT_TIMEOUT efter setup; cleanup lyckades. Omprovet passerade med vanlig direktanslutning och tre riktiga databasanslutningar. Ingen transportfallback eller extra beroende infördes.

Första riktade slutproven kördes via Docker-intern psql efter `assertTarget('protected')`; ordinarie SQL-köraren fick lokal TCP-timeout. Rapporten `work/pilot/results/phase4-wave6-focused.json` innehåller fil, status, exitkod och antal assertions, inga elevvärden. Första fullkörningens avbrott redovisas separat som INCOMPLETE. Slutligt exakt registeromprov och full SQL-körning gick via ordinarie `run-sql-tests.mjs`; `phase4-source-cli.json` är PASS150 och `phase4-wave6-all-sql.json` är FAIL med de sex kända fixturfelen. Dessa är `phase3_boundaries`, `phase3_connections`, `phase3_mandates`, `phase3_matrix`, `phase3_policy` och `phase3_temporal`; inget prov hoppades över.

## Avvikelser

1. Granskning efter tillämpad 160000 hittade fel enumvärde för audit samt ofullständigt typat konflikt-/skyddssvar. Redan tillämpad migration ändrades inte: 162000 rättar dessa kontrakt och systemaktörens namn i samtidighetskonflikt.
2. 163000 gör nästa leverans automatisk för uttryckligt källägt fält och exponerar beslut i läshistoriken. Lokala rättelser skyddas fortsatt.
3. Vid första testutökningen ersattes äldre registerfixtur av misstag; den återställdes helt före slutprovet. Slutdiffen är enbart 94 tillagda rader och samtliga 150 assertions passerar.
4. En temporär SQL-helper med namnet `resolve` triggade lokal pg_graphql-DDL-hook. Helpern heter därför `decide`; ingen produktionsfunktion eller behörighet ändrades för att kringgå felet.

## Krav och kvarstående gränser

STU-04 → separat proveniens, bevarad rättelse, båda beslut, registerägd skrivspärr, maskerad avvikelse och historik. STU-06 → versionsprövning, idempotens, en öppen avvikelse per fält, loggfelrollback; verkligt tvåanslutningsprov observerade serverns låsväntan och bevarat lokalt värde utan dubbla avvikelser.

API-skrivvägen (04-10), elevkortets beslut/UI (04-13), samlad fasgrind (04-21), användarverifiering och faktisk kommunanslutning godkänns inte av dessa SQL-prov. Äldre övergångsröda fas 3-fixturer hör till 04-14/15. Global STATE/ROADMAP/VALIDATION ägs av orkestratorn.

## Commits

- `b9a110a` — källleverans, explicit avgörande och första riktade SQL-prov.
- `faeb211` — bevarad registerregression, automatisk uppdatering av källägda fält och exponerad beslutshistorik.
- `ba1812f` — CLI och argumentskyddsprov, verklig samtidig leverans och källbeslut.
