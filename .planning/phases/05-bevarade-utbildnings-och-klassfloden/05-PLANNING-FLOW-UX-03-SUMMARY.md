# 05-PLANNING-FLOW-UX-03 — separat APL-livscykel i SQL

Status: implementerat; isolerad SQL-verifiering PASS; aktiv installation återstår.

Ny migration: `supabase/migrations/20261018100000_separate_apl_workflow.sql`. Den lägger till två privata tabeller: `apl_workflow_states` och `apl_organizer_reviews`. Befintliga gymnasietimplaners räknare initieras från deras aktuella revision utan ändring av befintliga tabeller. Två befintliga CHECK-villkor utökas uttryckligen för review och nytt beslutskontrakt. Elva funktioner ersätts, två ägarprivata hjälpare tillkommer; inga nya Worker-RPC-rättigheter.

Tabellbeslut fungerar utan APL-perioder. Årsram/GUT och olösta timkopieringsförluster kontrolleras fortfarande. Separat APL kan därefter sparas inom årsramen; enbart rektor bekräftar och enbart huvudman granskar aktuell rektorsbekräftelse. Alla senare händelser lämnar godkänd timplansrevision, status, celler och beslutshash orörda. Periodändring gör tidigare bekräftelse och granskning inaktuella men historiken finns kvar.

`work/pilot/verify-separate-apl-workflow.mjs` använder riktiga SQL-entrypoints, Worker-roll och syntetiskt yrkesprogram. SQL07 bevisar bland annat tomma perioder vid godkännande, båda CAS, budgettak, felaktig/återkallad roll, gamla exakta kvitton, audit-rollback, privata tabeller och faktiskt observerad låsväntan mellan två APL-skrivare. Den ena transaktionen COMMIT:ar och den andra nekas med 40001. Full matris med deferred constraints återställs.

`apply-planning-flow.mjs` och `deliver-planning-flow.mjs` förbereder separat kontrollerad installation/artefaktöverföring. Båda är inerta vid import; ingen installation har körts. Delivery använder explicit `separate_apl_v1`-läge i det gemensamma read-only OIDC-provet; äldre verktyg har kvar sin defaultsemantik.

Avvikelser: planens preliminära migrations-/verifierarfilnamn ersattes med ovanstående. Syntetiskt fixturebygge exporteras direkt från verifieraren i stället för separat fixturefil. Faktiskt SQL-race för timplansersättning samt särskilda arkiv-/ersättningsfall återstår enligt verifieringsgränsen nedan.

## Gemensam verifiering

- 109 modell-, journal- och serverprov PASS (APL, planbeslut och gamla kontrakt); `npx tsc --noEmit` PASS och riktad oxlint PASS 2026-10-18.
- Isolerat faktiskt PostgreSQL-prov: `/private/tmp/separate-apl-sql07.json`, 32 kontroller PASS, 74 källhashar oförändrade och full cleanup. Schema-only kopia utan verksamhetsdata; egna syntetiska testobjekt. Detta är inte prov av verklig kommunanslutning eller full auth-klusterlikvärdighet.
- Installerarens exakta struktur-/ACL-grind accepterar SQL07:s före/efter-struktur. 78 gamla och nya installer-/deliveryprov PASS. Ingen aktiv databas eller process på 3012 har ändrats av dessa delplaner.
- Faktisk OIDC/browser på dator och telefon, kandidatbygge, godkännandegater samt eventuell installation överlämnas till delplan 06. SQL07 innehåller två samtidiga APL-skrivare; inget nytt faktiskt race mellan APL-spara och byte av godkänd timplansversion har genomförts. Arkiverad/ersatt kapabilitet är kontrollerad i modell/server och deliverygrind, men inte en egen sådan SQL07-livscykelmatris.

## SS 12000 och datagräns

Den separata revisionsräknaren och granskningen är intern verksamhetsplanering. Befintliga stabila ID:n för utbildning, timplan, skolenhet och klass behålls; ingen ny Attendance, Placement eller elevgenomförandeuppgift härleds ur ett APL-beslut. Ingen standardanslutning eller ny verifierad utbytesförmåga påstås. Planens befintliga SS 12000-avgränsning gäller fortsatt.

## Leveransansvar

Root samordnar avgränsade commits och push i den delade arbetskopian. Delagenten har inte gjort egna commits eller skrivit till aktiv databas. Föregående migreringsfiler, frysta kvitton och historiska beslut är orörda.
