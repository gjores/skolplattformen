# Motor5: gemensam årsbudget med bevarat v4-stöd

Avgränsad Rust-del av `05.2-SM-LASARSMONSTER-PLAN.md`, genomförd 2026-11-16. Ingen aktiv motor, databas, app eller installation ändrades av dessa prov. Ingen personinformation eller ny extern identitet ingår i kontraktet. Roten äger TS-underlag, datum/lagring, UI och den samlade GSD-verifieringen.

`ActivityTime.budget` är optional och frånvaron serialiseras exakt som tidigare. Motor5 accepterar problemversion4 och5, men v4 med budget nekas. Nya budgeter grupperas per aktivitet och budget-ID, med identiska min/max och unika befintliga perioder. Kompileringen summerar varje enhets riktiga minutbidrag per veckodag över just dess aktiva periodrader. State, tidsreparation, slutstatus och övre/undre/exakta delbarhetsbevis använder dessa vektorer. Den oberoende kontrollanten räknar separat från råa `ActivityTime`-rader och passens `counted_min`, utan lösarens koefficientkod. Samma budgetsträng i två aktiviteter kopplas aldrig samman.

Problemversionen återges på solve, validate, positions, diagnose och suggest, inklusive tomma lösningssvar. Hälsosvaret anger motor5 och stödda problemversioner `[4,5]`. Ny budget-/versionsprövning finns även i de placeringsvägar som tidigare inte behövde kompilera underlaget. `validate_solution` nekar dessutom en annan svarsversion än problemets. V4 utan budget behåller sin tidigare radsemantik och JSON-representation.

## Faktiska prov

- Sju nya matematiska tester skrevs först och föll på den saknade budgetmodellen. Efter implementation passerade alla sju.
- `cargo test --offline --locked --workspace`: **74/74 PASS**, inga ignorerade fall. Detta omfattar tio riktiga HTTP-fall på egna lediga loopbackportar, där både v4 och v5 kontrolleras på samtliga fem skyddade endpoints. Token-, metod-, storleks-, samtidighets- och tidsgrindar är kvar. Ingen aktiv3012/3013 användes.
- Två ytterligare regressioner för samplacerade delars `counted_min`/marginal och uttryckligt null-/feltypat budgetfält lades därefter till. Riktat `cargo test --offline --locked -p schemamotor-solve --test annual_time`: **9/9 PASS**. Totalt **76 unika passerade Rust-fall** i dessa körningar. Produktionskoden ändrades inte mellan helsviten och det riktade omprovet.
- `CARGO_PROFILE_RELEASE_STRIP=none cargo build --offline --locked --release`: PASS med lokal stable Rust. Det första native HTTP-bygget hade SHA-256 `458079c71d5922f71862c67bc20431c630e76b1ea4b18da390035db1aea25006`, CLI `b251d4d7157a3652a3f47a655a2a01037d3bafa5065602dbf1db8c2e5416ae9a`. De är historiska lokala arbetskopiebyggen, ersatta av salsbokningsrättningen nedan; ingen installation intygas.
- Faktisk CLI-körning jämförde `examples/legacy-v4.json` mellan den bevarade gamla211d-b:s v4-binär och nya native motor5. Version4, problem-ID, **problemhash**, status, placeringar, oplacerade pass, diagnoser och metrics var identiska. Tidsberoende stats jämfördes inte. V4-hash: `a912cee0715ef3b6ce4d1648edce8183ca94b28d8937222f8d3c87ed3ff8f715`.
- `examples/annual-budget-v5.json` gav version5, komplett schema på rätt veckodag och årsutfallet270min. Ny oberoende CLI-validering gav **0 regelbrott** för samtliga tre resultat (gammal4, ny4 och ny5). Privat sanerad rapport `/private/tmp/schema-annual-cli-proof-20261116.json`; temporära in-/utfiler städades.
- `git diff --check -- schemamotor`: PASS.

Budgetfallen prövar gemensamt pass som räknas i båda perioderna, skilda lärartermpass med egna dagvektorer, olika veckodagsantal, årsunderuttag och sound delbarhetsbevis, enbart en placerad termins otillåtna komplettstatus, separata aktiviteter med lika budgetsträng, inkonsekvent min/max, dubbla periodrader, ogiltiga ID:n, explicit null, counted_min och samplacerade delar/marginal.

Den första fulla kompileringen upptäckte en felbenämnd teststatus (`Invalid` i stället för modellens `InputMissing`); testet rättades före den gröna helsviten. Egen HTTP kräver lokal lyssnarbehörighet och kördes med den nödvändiga processbehörigheten. Det är ett lokalt syntetiskt motorbevis, inte ett skyddat app-/OIDC-/DB-bevis eller en standardanslutning.

## Salsbokningar: avgränsad integrationsrättning

C5:s riktiga nativeprov visade att en avsiktlig salsbokning utan lärare eller grupp nekades som `empty_lesson`. Det äldre modellvillkoret blockerade redan solve för sådana bokningar; den nya fullständiga kontrollen i v5 gjorde även felet synligt vid validate. Appens aktivitet kräver sedan tidigare deltagare **eller sal**. Inga påhittade grupper eller personreferenser ska behövas.

Den enda produktionsändringen här är att ett pass utan lärare/grupp godtas om det har ett positivt salsantal. Befintlig kontroll av salreferenser och samtliga salskrav består. Noll salar och okända tillåtna salar nekas, helt tomma pass förblir ogiltiga, och årsbudgetgrinden ändras inte. Legacy v4:s äldre fristående placeringskontroll ändras inte.

- Fyra nya domänprov i `crates/solve/tests/rooms_only.rs` gav **3 FAIL/1 PASS före fix**, sedan **4 PASS**. De provar v4/v5 solve och validate, en salsmarginal som hindrar r1 men lämnar r2 fri, tomma/ogiltiga krav samt antal/egenskaper/kapacitet/tillgänglighet även för bokning av två salar.
- Ett nytt riktigt HTTP-fall provar v4/v5 solve och båda salkandidaternas validate: **PASS**. Befintliga budget- och versionsprov är kvar.
- Ny helkörning `cargo test --workspace --offline --locked`: **81 PASS, 0 FAIL, 0 ignorerade**, inklusive samtliga 9 årsbudgetfall och 11 HTTP-fall. De riktade proven räknas inte en gång till i totalsumman.
- Nytt `CARGO_PROFILE_RELEASE_STRIP=none cargo build --release --offline --locked`: **PASS**. HTTP SHA256 `b5cf534fc2b770fdd675dcef72533a2472674cf46fb14243b03cc5d776bdafd2`; CLI SHA256 `4f36fdec0c4e8bca4490ed45a5675de1623f534c603158cad3720285f1abdc5c`.
- Oförändrade `schema-salar-routes.test.mjs` + `schema-villkorsforslag-routes.test.mjs`, med `SCHEMA_SALAR_ENGINE=1 SCHEMA_VILLKORSFORSLAG_ENGINE=1`: **28 PASS, 0 FAIL, 0 överhoppade** mot den nya native HTTP-binären. C5 kontrollerar också faktisk daterad kandidat och salmarginal. Datakällor/behörigheter är syntetiska; ingen riktig app-/OIDC-/DB-kedja eller aktiv målprocess används.
- `git diff --check -- schemamotor`: **PASS**.

Privat sanerad proveniens: `/private/tmp/schema-year-room-only-proof-20261116.json`. Där binds källfiler, båda binärerna och separata test-/byggloggar med SHA256. Efter enbart ett förtydligande av modellkommentaren byggdes release igen; båda binärernas bytes var identiska med dem som prövats i C5/C12-gaten. Dessa arbetskopiebyggen kräver en ny exakt kandidatfrysning hos roten. De tidigare binärernas CLI-jämförelse ovan är historisk; den hävdas inte som ett nytt kandidatbundet API-bevis.

## Kvar hos appens integration

TS-byggaren måste välja v4 för omarkerade legacyunderlag och v5 för årsmodellen. För en budgetbärande rad kräver motorn explicit period, budget-ID1–200 UTF8-byte utan trimavvikelse/kontrolltecken, högst32 tidsrader per sådan aktivitet, dagräknare högst366 och max_min högst10^9. Därtill finns en samlad aritmetisk säkerhetsgräns före kompilering. De fastställda ht/vt-raderna ligger väl inom detta.

Motorn känner bara det insända problemet. Full årsbehovsberäkning, faktiska kalenderkortningar, delperiodens årsrest och datumspecifika undervisningsdelta måste fortfarande byggas och presenteras av appen. Dessa följdändringar, nytt skyddat API-/UI-prov, frysning, installation och mänsklig acceptans bevisas inte av denna Rust-del.
