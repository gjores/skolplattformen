---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-05
status: verified-synthetic-sql
---

# Namngivna läsprojektioner

Gymdetalj och gymunderlag visar stabil serieidentitet, aktuellt namn och namnrevision. Äldre versioners `nameAtCreation` är fortsatt null. Klassunderlag visar den exakta andra plan som en klass redan följer. Klass-ID används före äldre namnmatchning; en äldre namnlänk får inte överrida en identifierad klasslänk.

Läsårsplaneringen tar varje series faktiskt klassbundna versioner för valt läsår, annars seriens aktuella kandidat. En klasskoppling till A döljer inte B. Två klassbundna versioner inom samma serie kan visas samtidigt. Programplanraden har `series:null` och en plural `schoolTimplans` med samtliga relevanta skolreferenser. Timplanrader har inte detta pluralfält. GR/IM behåller tidigare versionsval och `series:null`.

Sökning omfattar namnen. Sortering har stabila serie-/planidentifierare som skiljer lika utbildningsnamn. Den befintliga revisionshashen täcker hela raden och därmed namnrevision och skolreferenser. SQL begränsar skolreferenser till samma 2 000 som det strikta kontraktet.

Totalskontraktet är oförändrat: gemensamma programpoäng räknas en gång, respektive planversions timmar räknas per plan/år/kolumn, klass-ID räknas en gång. Timmarnas verksamhetsbenämning är **Summa i de visade timplanerna**, inte undervisningsbehov eller bemanning. Flera kända alternativ gör inte timmar okända. Saknade timmar/klasser och GR/IM:s olika mått består.

## Filer

- `supabase/migrations/20261015203000_named_timplan_reads.sql`
- `supabase/tests/phase5_named_timplan_reads.test.sql`
- `work/pilot/verify-named-timplan-reads.mjs`
- `05-NAMED-TIMPLANS-UX-05-PLAN.md` – rättad senaste SQL-källa och preciserad aggregation.

## Verifiering

`node work/pilot/verify-named-timplan-reads.mjs --out /private/tmp/named-timplan-reads-05-sixth.json`

**PASS, exit 0, 25 kontroller.** Privat rapports SHA-256: `b1591a97063693e0761b0ae72183509031b2a3f72555657adf575c8406a7d1eb`. Rapporten binder 65 källfiler. Start/slut UTC: 2026-10-15 20:57:52.428 / 21:16:25.847. Tiderna är körjournal, inget prestandagodkännande.

Faktiska PostgreSQL-svar kontrollerades med riktiga klientkontrakt och gymmets verkliga serverprojektion. Endast miljö-/felberoenden stubbas vid import; SQL och projicerings-/kataloglogik är verkliga. Testet omfattar bland annat:

- Två version 1 i olika serier, separat matematikfördelning och gemensamt fryst poängunderlag.
- A under år 1/B under år 2, klassnamnbyte med stabilt ID, annan plans klasslänk och oförändrat kommandokvitto.
- Ersatt klassbunden A1, aktuell A2 och B1; A1/A2 samtidigt när olika klasser följer dessa.
- Plural skolreferens, namnbyte/sökning och historiskt null utan fabricerat namn.
- Över 50 verkligt skapade planer, två sidor, stabil ordning, filter och inaktuell urvalsrevision efter namnbyte.
- Faktisk SQL/TypeScript-paritet för totalsummor, gemensamma poäng och två klass-ID:n.
- Saknade timmar; GR med äldre bunden/ny obunden version och saknad legacyklass; IM med 14 veckotimmar.
- Inskickat/återlämnat programplansfilter samt ny fastställd programkälla medan gammal timplans poäng och timmar förblir frysta.
- Privata hjälpfunktioners ACL, befintliga SQL-gränsers närvaro och klientavvisning över 10 000 rader. Ingen faktisk SQL-fixtur med 10 001 rader kördes.

Alla originalkolumner i **syntetiska** förhandsrader jämfördes före/efter 02–05. Full rollback återställde samtliga 62 ursprungliga publika tabellers hash/count samt schema/ACL/journalfingeravtryck. Egen testdatabas och dump städades. Privat journal: `/private/tmp/named-timplan-snapshot-QKtESu/journal.json`.

## Avvikelser och bevisgräns

Planens hänvisning till `20261012160000_programplan_school_timplan.sql` var inte den senaste definitionen: `20261012220000_plan_decision_search.sql` tillför beslutsstadium och filter samt ID-matchning. Dessa ändringar har bevarats och filterbeteendet har fått verkliga regressionsprov.

Tidigare rapporter finns kvar privat. Första körningen skickade rått gymsvar direkt till klientparsern och föll i testharnessen; detta rättades till riktig serverprojektion. Andra körningen passerade 22 kontroller men hade mindre omfattning. Tredje/fjärde körningen föll när nya GR-fixturer skapades i fel ordning; slutfixturen fyller utkast, fastställer och kopplar därefter klassen, utan avstängda triggers. Femte körningen klarade 24 beteendekontroller och full rollback men underkändes av slutlig källhash när `server/mandates.ts` ändrades parallellt. Sjätte körningen har en oförändrad källmängd och PASS.

Endast schema har exporterats från det skyddade lokala målet. Inga användar-, auth-, sessions- eller journalrader exporterades. Data är granskade syntetiska repositoryfixturer. Detta bevisar inte migrering av användarens originalrader, HTTP/OIDC/browser eller verkligt SS 12000-utbyte. Namngiven serie är intern; stabila klass-/organisations-ID:n och exakta läsårsbundna relationer bevaras enligt paketets mappning mot SS 12000:2024/OpenAPI 2.1.0.

Ingen permanent apply, runtimeändring eller commit utfördes av denna deluppgift. Samordnaren granskar, versionshanterar och integrerar.
