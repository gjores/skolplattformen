---
phase: 04
wave: 2
status: passed
completed_plans: [04-02, 04-07, 04-08]
next_plans: [04-03]
---

# Fas 4 — våg 2

Genomförd omfattning: stängt registerschema och referensdata (04-02), säker fel-/nedladdningstransport (04-07) samt minimerad registerloggning (04-08). Tillsammans med 04-01 är fyra av fasens 22 planer genomförda. Ingen ny användarvy har tillkommit.

## Leverans och verifiering

- Databasen har stabila elev-ID:n, daterade skol-/klass-/hemkommunperioder, käll- och ändringshistorik. Överlapp och främmande relationer nekas. Tabellerna har FORCE RLS och inga appgrants; ingen ny elevläsning öppnas av vågen.
- 43/43 period-/relationsprov och 78/78 registerprov PASS mot isolerat lokalt `protected`-mål efter målskydd och ny migration. SCB:s 290 kommuner samt 512 syntetiska identiteter är inlästa; identiteterna accepteras också av modellens validator.
- Klienten avbryter gamla svar och exportfiler efter kontextbyte. Konfliktuppgifter valideras med gemensamt kontrakt. SQL-fel lämnar inga råa databasdetaljer.
- Logghjälparen hanterar skyddad visning per elev, särskilda personnummerhändelser och nekad ändring vid konflikt. Loggfel stoppar svaret. Transaktionsgränsen är simulerad i dessa snabbprov; faktisk API-/PostgreSQL-rollback återstår i senare planer.
- Samlad `node --test lib/*.test.mjs lib/server/*.test.mjs`: 350/350 PASS. Fokuserade resultat: transport/mandat 22/22, audit 16/16. Typkontroll och lint PASS.
- `npm run build:protected`: PASS. Första bygget kompilerade men paketeringen stoppades när en äldre lokal förhandsvisning återskapade målkatalogen. Efter tillfälligt stopp passerade hela bygget. Förhandsvisningen återstartades på port 3000 och svarade HTTP 200.
- Full SQL-regression: 686/686 PASS i 12 filer (565 tidigare + 121 nya prov), exit 0. Minimerad rapport: `work/pilot/results/phase4-wave2-sql-all.json`.

## Miljö och avgränsningar

Docker-hälsokontroller och en SQL-anslutning fick timeout under hög lokal belastning. Målskyddet stoppade migrering när kontrollen inte gick igenom. Ny migrering gjordes först när `assertTarget('protected')` åter passerade; ingen reset, ingen ändring av tillämpad migration och inga verkliga elevuppgifter.

Lokala JSON-rapporter för fas 4 undantas nu uttryckligen från Git. Kraven STU-01–06 och DATA-01–02 slutmarkeras inte av vågens delprov. Registerbehörigheter, SQL-funktioner, API, gränssnitt, handbok och full fasverifiering återstår enligt planerna. Ingen verklig kommunanslutning eller drift har godkänts.

Valideringsstrategins API-skript `verify-register.mjs` skapas först i 04-16 och har därför inte körts i denna våg. Nuvarande bevis gäller schema och hjälpfunktioner, inte färdiga registeranrop.

## Fortsättning

Nästa steg är våg 3, plan 04-03: migrera befintliga provrelationer med bevarade ID:n och mandat samt införa huvudmannens uttryckliga skyddsbehörighet per skola. Våg 1–2 ska inte göras om. Användarprov av hela flödet kommer efter att gränssnittet och de samlade kontrollerna är färdiga, i 04-22.
