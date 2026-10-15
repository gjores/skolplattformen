---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-03
status: complete_closed_sql_foundation
completed: 2026-10-15
subsystem: database
requires: [NAMED-TIMPLANS-UX-02]
affects: [NAMED-TIMPLANS-UX-04, NAMED-TIMPLANS-UX-05, NAMED-TIMPLANS-UX-07]
---

# Namngivna timplaners stängda skapa-/namnkommandon och egna versioner

Planens två uppgifter är implementerade och verifierade som stängd SQL-grund i en separat schema-only-databas med enbart granskade syntetiska fixturer. 100 kontroller PASS, full rollback och egen databasstädning PASS. Ingen migration eller runtimeleverans har gjorts i användarens aktiva databas.

## Vad som ändrats

- `supabase/migrations/20261015201000_named_timplan_commands.sql` inför `phase5_named_timplan_create(jsonb)` och `phase5_named_timplan_rename(jsonb)`, privata oföränderliga kvitton samt append-only namnhistorik. Nya funktioner/tabeller saknar grants för public/anon/authenticated/service_role/Worker.
- Ny separat plan får eget serie-ID, namn och version1. Valfri kopiekälla binds till samma skola/utbildning och exakt revision. Timrader bevaras endast när rad och terminsfördelning stämmer; övriga återställs till uttryckligt ofördelade fält. Originalets poäng/timmar ändras inte.
- Befintliga `phase5_create_gym_timplan` skapar nästa version inom predecessorns serie. Null-predecessor tillåter bara entydig äldre defaultväg; den kan inte starta en godtycklig parallell serie.
- Namnbyte ändrar bara seriens namn/revision/registertid plus eget kvitto, namnhändelse och säkerhetsaudit. Planversionens `name_at_creation`, planrader, beslut, klasslänkar och deras tidsstämplar bevaras.
- Den äldre karantänlagda `copy_offering_cohort` behåller signatur/rättigheter men låser verifierad källutbildning och nekar flera serier, i stället för att tyst välja högsta versionsnummer. Den skyddade `phase5_copy_programplan_education` ändras inte och har provats med oförändrad programramkopiering utan gamla klasser/timplaner/länkar.

## Exakt kvittosemantik

Gamla lagrade gym-kvitton skrivs inte om. Befintliga endpointen behåller tidigare svarshape och replaybeteende: gamla kvittensfält med `replayed:true` och planens aktuella revision. Ny serieinformation finns i separat aktuell planprojektion när plan05 är genomförd; den stoppas inte in i ett gammalt lagrat kvitto.

Nya create-kvitton är ögonblicksbilder: revision0 och serie-ID/namn/revision vid skapandet. Replay ändrar enbart `replayed` till true, även om aktuell planrevision eller serienamn senare ändrats. Aktuell planprojektion returneras separat. Rename-kvittot återger exakt begärt namn och `expectedSeriesRevision+1` även efter ett senare namnbyte; det återställer aldrig det äldre namnet. Samma commandId med annan request/aktör nekas. Gamla och nya create-/renamekommandon kan inte återanvända varandras commandId.

## Verifiering

Kommandon:

```sh
node --check work/pilot/verify-named-timplan-commands.mjs
node work/pilot/verify-named-timplan-commands.mjs --out /private/tmp/named-timplan-commands-03-final.json
```

- Slutkörning: 100 SQL-/DB-roll-/kontraktskontroller PASS, exit0.
- 62 befintliga syntetiska publictabellers slutprojektioner och publicschemafingeravtryck är identiska före/efter full rollback. Commandmigrationen lämnar varje föregående syntetisk tabell oförändrad vid installation.
- 34 bundna källor var oförändrade från början till slut. Egen schema-only-databas städad; inga liverader kopierades.
- Verkliga DB-roller verifierar att båda kommandon och privata tabeller förblir stängda. Relevanta session-/aktörs-/skolmandat, revocation, requestreplay, gammal kvittens, namn-/revisionskonflikter och fel scope provas i SQL.
- Strikta extra fält, null/numeriska/otillåtna UUID:n, negativa/fraktionella revisioner, brutet kopiepar, namnkontroller och Unicodegränser provas. Den gemensamma fulla Unicodepariteten finns i plan02; 03 använder samma SQLnamnhelper.
- Auditfel vid både create och rename lämnar inga delar av serie, plan, celler, kvitto eller namnhistorik. Namnhistorik och kvitto kan inte uppdateras/raderas.
- Nästa version får samma serie, lokalt ökat versionsnummer, aktuellt versionsnamn och exakta kopierade timmar. Annan utbildning/källrevision nekas. Separat plan med samma namn ger `40001/timplan_name_conflict`.
- Tidigare delkörningar PASS75 och PASS99 behålls som historik. Ingen första misslyckad plan03-körning har dolts; nya kontroller motiverade de utökade slutkörningarna.

Privat slutrapport: `/private/tmp/named-timplan-commands-03-final.json`.

Rapportens SHA256: `f9b123fa7fe392dcea82775a39f6ca7cd2d7f6d13a07a35f6d70482efa71c39f`.

Publicschemafingeravtryck före/efter: `919261dc5df30009b4e8705f9b910b2d996fa23cd410bce482205d26ee1db671`.

| Fil | SHA256 |
| --- | --- |
| `supabase/migrations/20261015201000_named_timplan_commands.sql` | `02c747bef0e60f07593d3c46512185a72701dfb0c0f10991b3602f3d14c773d4` |
| `supabase/tests/phase5_named_timplan_commands.test.sql` | `1a57a00a6d21a161d72293ccfda0e2c45199a456510d25a8b3e0512116bed8c2` |
| `work/pilot/verify-named-timplan-commands.mjs` | `0d306698ab720b4fefc822d71763513fa9affd2c7d44fa3b732f4cccd420503f` |

## Bevisgränser och nästa steg

Plan02:s gamla offering/unit-index är avsiktligt kvar. Ett andra parallellt timplanobjekt nekas därför atomiskt i denna isolerade mellanversion. Plan04 behöver installera serieunika index tillsammans med säker oberoende beslutskedja innan den positiva två-planer-/kopierade-separata-plan-matrisen kan passera. Det är inte ett färdigt parallellt produktflöde i aktiv app.

Ingen faktisk samtidighet mellan två anslutningar, HTTP/OIDC/MFA, dator/telefon eller användaracceptans påstås. MFA ligger liksom tidigare i skyddad HTTP-route och provas först i senare paketsteg. Schema-only-hjälparen återställer auth-definitioner under den lokala testdatabasens ägare, utelämnar framtida objektdefaults för andra databasägare och gör ingen auth-/OIDC- eller fullklusterekvivalensutfästelse. Endast syntetiska förhandsrader har bevarandeprovats. Användarens originalbevarande återstår att kontrollera separat vid faktisk kort apply i12; ingen full-data-export har gjorts.

Källgranskning av plan04:s nya migration fann ingen uppenbar kontraktskonflikt; det är inte dess körbevis. Plan04:s exekutor ansvarar för faktisk SQL-/beslutstestning och äldre kvittoparitet mot serverprojektionen.

SS 12000:2024/OpenAPI 2.1.0: interna serie-/versions-ID:n ersätter aldrig klass-/organisations-ID:n. Namnbyte och ny planversion bevarar klassgiltighet, medlemskap och explicita läsårslänkar. Ingen standardexport eller kommunanslutning är verifierad.

Samordnaren granskar och skapar avgränsad commit/push. Denna agent har inte ändrat STATE, PROJECT, runtime eller Git.
