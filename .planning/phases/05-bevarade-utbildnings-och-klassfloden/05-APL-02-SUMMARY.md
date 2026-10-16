---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-02
subsystem: apl-storage
status: complete
completed: 2026-10-16
requires: [APL-01]
provides: [private-apl-storage, closed-apl-rpcs, atomic-apl-commands, frozen-apl-receipts, sql-apl-hash]
affects: [APL-03, APL-04, APL-07]
key-files:
  created: [supabase/migrations/20261016120000_apl_planning.sql, work/pilot/verify-apl-plan-commands.mjs, supabase/tests/phase5_apl_hash_vectors.json]
  modified: []
---

# APL-02 – privat lagring, atomiska kommandon och frysta kvitton

SQL-implementationen finns i den nya additiva migrationen. Den har endast installerats i ägda tillfälliga databaser med schemakopia och syntetiska fixturer. Nya RPC:er är stängda för samtliga vanliga roller, service_role och Worker. Användarmiljön, 3012 och befintliga elev-/klass-/beslutsdata har inte ändrats av denna plan.

## Genomfört

Åtta privata tabeller bär underlag, perioder, innehåll, heltalsminuter, kopieringsgranskning, rektorshändelser, kommandokvitton och transaktionsbundna skrivtillstånd. RLS, explicita återkallade tabell-/funktionsrättigheter, sammansatta relationer och triggers skyddar lagringen. Rektorshändelser och kvitton får inte uppdateras/raderas/tömmas. En kopieringsgranskningspost bevarar ursprunget och kan endast lösas en gång med serverns aktör, uppdrag, tid och användarens notering.

De stängda entrypoints är `phase5_apl_plan_read(uuid)`, `phase5_apl_plan_command(jsonb)` och `phase5_apl_plan_status(jsonb)`. Alla returnerar APL-01:s privata `apl_sql_v1`-envelope. Save/confirm lagrar hela publika svaret och fryst raw-timplan/katalog/timmatrix i samma kvitto. Status kräver hela originalkommandot. Replay återvaliderar mandat och exakt requestidentitet och läser därefter det historiska kvittot, utan att ersätta det med dagens underlag.

APL-skrivningen tar befintlig session-/mandat-/skol-/utbildningsordning samt program-, serie- och timplanslås. CAS skyddar även no-op. Faktisk planändring eller löst granskningsärende höjer revisionen exakt en gång. Semantiskt oförändrade sorteringar ger ett nytt beständigt kvitto och audit utan revisionshöjning. Confirm kräver verklig rektor, komplett stödd planering och exakt innehållshash; den skapar en egen oföränderlig händelse och höjer revisionen en gång. Huvudmannen får ingen ny APL-skrivbehörighet.

SQL har portabel kanonisk serialisering och innehållshash enligt APL-01, separerad från administrativa revisioner. Datum, UUID, Unicode-text, rowKey-grammatik och minut-/terminsrelationer kontrolleras strikt. Bekräftelsespärrarna följer omfattning, ämneskoppling, total/varav, start-/terminsdatum, överlapp och prioriterad ISO-veckokapacitet. Inget datumintervall räknas om till uppgiven APL-omfattning.

Den nya celltriggern hindrar redan här en senare minskning eller nollställning till null av totaltimmar under en sparad APL-andel. Den använder samma timplanslås. Detta tidigarelägger den strukturella säkerhetsdelen från APL-03; beslutskedja, kopiering och historiska beslutskvitton återstår där.

## Faktisk verifiering och första fel

Samordnaren körde `work/pilot/verify-apl-plan-commands.mjs` mot privat schemakopia med syntetiska befintliga rader. Ingen användartabelldata exporterades. Följande rapporter är privata:

- `/private/tmp/apl-commands-first.json`: första DDL-körningen avbröts av SQL:s reserverade ord `overlaps` i en variabeldeklaration. Namnet rättades; cleanup slutfördes.
- Andra körningen passerade DDL, originalbevarande och båda hashvektorerna men stoppades av runnerns kvarstående `SET LOCAL ROLE` efter savepoint. Runnern fick explicit `RESET ROLE`; detta var inget produktfel.
- `/private/tmp/apl-commands-third.json`: **39 godkända kontroller och två observerade verkliga anslutningsöverlapp**. Save/save och save/rad hade olika backend-PID:n och observerad blockering; förloraren fick CAS-konflikt utan delskrivning. Roll-/skol-/kundgränser, mandatåterkallelse, save/no-op/replay/status, rektorshändelse, APL-minuter, timminskning/null, auditrollback, ofullständigt utkast och databevarande passerade. Schema/ACL och originalrader återställdes exakt efter rollback och den ägda databasen städades.

Efter tredje körningen identifierade en oberoende läsgranskning att den privata planparsern ännu accepterade för bred rowKey-syntax före kontrollen mot aktiv källa. Detta kunde också påverka serverägda kopieringsposter. Parsern har nu en exakt Unicode 17-/UTF-16-kompatibel nyckelvalidator utan databas-/localeberoende. **Slutkandidaten passerade därefter:** `/private/tmp/apl-commands-finalcandidate.json` visar 46 kontroller, 5 680 oberoende JS-/SQL-prober för Unicodegränser och nyckelgrammatik samt två verkliga anslutningsöverlapp. De observerade väntningarna låg på befintligt advisory-lås; därefter fick förloraren 40001 utan delskrivning. Samtliga 65 originaltabeller (inklusive tidsstämplar), schema och befintliga funktionsrättigheter bevarades efter rollback; 66 källhashar var oförändrade och cleanup slutfördes. Utgånget/återkallat sessionsmandat, återkallat uppdrag för både status och replay samt direkt ändring av oföränderliga händelser/kvitton ingår.

Oberoende slutgranskning fann inga blockerare. Textspärrens Cc/Cf/Cs-ranges jämfördes även med samtliga Unicodekodpunkter i Node 25.9.0/Unicode 17 utan skillnad. Runnerns syntax- och diffkontroll passerar. Riktad oxlint gav inga fel och en stilvarning om avsiktlig Set-kopia i källinventeringen. Ett första lintanrop med `../` nekades av verktygets sökvägsregel; samma fil kontrollerades därefter från roten. Ingen produktändring gjordes efter slutkörningen.

## SQL-handoff till APL-03/04

- `phase5_apl_plan_value(plan_id)` ger AplPlan eller SQL null; `phase5_apl_copy_review(plan_id)` ger serverägd lista.
- `phase5_apl_plan_projection(plan_id)` ger exakt publikt ReadReply. `phase5_apl_plan_basis(plan_id)` ger fryst `{organizerId,gymTimplan,copyReview}`. De privata hjälparna ersätter inte scopekontroll.
- `phase5_apl_program(gym)` härleder AplProgram ur exakt katalog/ref. `sourceSupported` kommer från befintliga källspärrar med neutraliserad administrativ status/arkivering; faktisk skrivbarhet kontrolleras separat.
- `phase5_apl_content_hash(plan_id)` och rena `phase5_apl_hash_payload`/`phase5_apl_hash_value` följer APL-01. `phase5_apl_canonical(jsonb)` accepterar endast protokollets null/bool/heltal/sträng/lista.
- `phase5_apl_validate_allocations(gym,apl)` nekar ogiltiga aktiva relationer. `phase5_apl_confirmation_blockers(gym,apl,reviews,program)` ger svenska blockersträngar för beslutsintegration. `spring_start_review` är en icke-blockerande UI-granskning och finns därför inte i denna blockerlista.
- Båda nya timplansskapvägarna måste även efter APL-03 returnera revision 0. En privat kopieringshelper kan under befintliga skap-/källås lägga ett eget `apl_plan_write_permits(txid_current(),pg_backend_pid(),ny_plan_id)`, initiera strukturen, kontrollera resultatet, audita och ta bort tillståndet. Använd inte ordinarie APL-save för skapinitialisering; det höjer revision. Kopiera inga rektorshändelser eller resolutioner.
- Äldre receipts, huvudmannens beslut, inkorgens snabbgrenar och serverns historiska beslutsprojektion är avsiktligt inte ändrade här. APL-03/04A ska integrera dem tillsammans och hålla legacy-replay skild från nya krav.

SS 12000:2024 utgåva 4/OpenAPI 2.1.0 beaktas genom stabila skol-/organisations-/planidentiteter och separat internt APL-underlag. Ingen Placement, Attendance, elevplacering, extern export eller verklig standardanslutning införs eller påstås verifierad. Faktisk HTTP/Worker/OIDC, användarflöde, aktiv installation och mänsklig acceptans ligger kvar i senare planer. Inget ursprungligt pilotkrav eller hel fas stängs av denna SQL-plan.
