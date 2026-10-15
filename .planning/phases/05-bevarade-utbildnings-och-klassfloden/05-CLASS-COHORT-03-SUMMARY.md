---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: CLASS-COHORT-03
status: completed
completed: 2026-10-15
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
subsystem: klasskoppling
requires: [CLASS-COHORT-02]
provides: [ID-först för identifierade klasslänkar, explicit entydig legacyadoption, säker namnårskonflikt]
affects: [CLASS-COHORT-03A, CLASS-COHORT-04, CLASS-COHORT-05, CLASS-COHORT-08]
tech-stack:
  added: []
  patterns: [ID-först med separat legacyfallback, serialiserad namnårsnyckel, rollback med källclosure]
key-files:
  created:
    - supabase/migrations/20261015101000_class_cohort_link_identity.sql
    - supabase/tests/phase5_class_cohort_link_identity.test.sql
    - work/pilot/verify-class-cohort-link-identity.mjs
---

# CLASS-COHORT-03: identifierade länkar och säkra namnkollisioner

Identifierade klasslänkar läses, låses och uppdateras via stabilt klass-ID och tillämpningsläsår. Den äldre primärnyckeln skola/klassnamn/läsår, klassregistrets namn/startår-unikhet, samtliga gamla rader och befintliga rättigheter behålls. Två olika kullar kan ha samma klassnamn, men en överlappande lagringsnyckel ger `40001` med den säkra hinten `class_name_year_conflict` utan att flytta någon relation.

## Genomförande

**Uppgift 1:** `phase5_class_underlag` gör ett separat ID-uppslag först. Legacyfallback gäller bara null `class_id`, rätt skola/namn/år och en timplan för samma utbildning, huvudman och första läsår. Flera historiska klasser med samma namn inom utbildningen betraktas som tvetydigt underlag. En främmande kulls legacyrad visas inte som den nya klassens länk; gamla lagrade länkar ligger kvar i versionslistan.

`phase5_class_command` låser klass-ID och serialiserar konkurrerande länkskapning på skola/namn/tillämpningsår. Identifierad uppdatering använder ID/år. Legacyadoption kräver exakt tidigare plan och revision, entydigt klassval samt fortsatt null-ID på den låsta raden. En upptagen äldre PK kontrolleras före INSERT; relevanta unikhetsfel från just klasslänkens PK/ID-årindex mappas till samma säkra konflikt. Andra unikhetsfel maskeras inte. Ingen automatisk adoption, namnändring, klassflytt eller radering införs. Befintliga identifierade länkar får byta version även om klassens aktuella namn skiljer sig från den lagrade namnnyckeln; UPDATE bevarar den tidigare nyckeln. Namnmatchning krävs vid INSERT och legacyadoption.

En sluten datumfunktion används både av kommandot och den befintliga valideringstriggern: kända klassdatum ska överlappa det inkluderande läsåret 1 juli–30 juni. Okända legacydatum ger ingen gissad begränsning och skrivs inte om. Nya funktioner saknar klient-, service- och Worker-EXECUTE; befintliga entrypoints behåller sina ACL och ägare.

**Uppgift 2:** Bevarandematrisen omfattar gamla identifierade länkar och receipts, namnlikhet i skilda kullar, korrekt och felaktig legacyadoption, ny fastställd version och ändring av exakt ett läsår. Faktiska direkta legacy-upserts kan inte skriva över identifierade länkar utan revision; det går inte att nollställa klass-ID eller flytta det till en annan kull genom alternativ UPDATE. Medlemskap, elevplaceringar, klassgiltighet och övriga läsår kontrolleras före/efter.

Taskcommits:

- `24e2db0` — `fix(05-CLASS-COHORT-03): bind klasslankar till stabil identitet`
- `fc775e8` — `test(05-CLASS-COHORT-03): bevara legacyvagar och skyddade lankar`
- `3533de8` — `fix(05-CLASS-COHORT-03): bevara namnnyckel vid identifierat versionsbyte`

Beroende02 kom från `91d9077`. Slutprovets produkt-/provkällor finns i `3533de8d7e4c6026600868c1df97814f2dc67717`; rapporten binder även 57 lokala källfiler inklusive importerade helpers, katalog och paketlås. Inga äldre migrationsfiler eller plan01-filer ändrades.

## Faktisk verifiering

| Kommando från projektroten | Resultat | Avgränsning |
| --- | --- | --- |
| `node work/pilot/verify-class-cohort-link-identity.mjs --out /private/tmp/class-cohort-03-first-20261015.json` | PASS, exit 0, 145 kontroller | Första fulla SQL-provet; rollback exakt. |
| `node work/pilot/verify-class-cohort-link-identity.mjs --out /private/tmp/class-cohort-03-final-20261015.json` | PASS, exit 0, 153 kontroller | Efter tillagda alternativa legacy-skrivningar och kontroll av PK/ACL/RLS. 86 kontroller är plan02:s hela read-committed SQL-matris körd efter migration03. |
| `node work/pilot/verify-class-cohort-link-identity.mjs --out /private/tmp/class-cohort-03-reviewed-20261015.json` | PASS, exit 0, 156 kontroller | Slutbevis efter oberoende granskningsfix: faktiskt versionsbyte för namnändrad klass med bevarad namnnyckel, klassgiltighet och gamla receipts. |
| `node --check work/pilot/verify-class-cohort-link-identity.mjs` | PASS, exit 0 | Runnerns syntax. |
| `node --input-type=module -e "await import('./work/pilot/verify-class-cohort-link-identity.mjs'); console.log('import-safe PASS')"` | PASS, exit 0 | Import startar ingen provkörning eller databasanslutning. |
| `git diff --check` | PASS, exit 0 | Inga whitespacefel. |

Alla tre SQL-körningarna använder `assertTarget('protected')`, den redan körande isolerade lokala PostgreSQL-miljön och en uttrycklig read-committed-transaktion. Syntetiska egna förmigrationsrader etableras först; migration02 och03 körs endast inne i rollback. Inga grants, triggeravstängningar, demo-bootstrap eller beständiga apply används. Runnern kräver en ny privat JSON-sökväg och skriver med `0600` och `wx`; källhasharna kontrolleras igen efter körningen.

Slutrapportens SHA256: `ea383dae0d1a3bb4c89a08ca6b619089eb2b9d1ef474d87c57957af5dca7f056`. Alla **61 public-tabeller** har identiska fullradshashar före/efter. DDL-, ACL-, policy-, trigger- och migrationsjournalfingeravtrycket är identiskt: `2783b69936aabccfe1945f038ba10223adb1cc4398d9391408c45638410c9461`. Inuti migration03 kontrollerades också att alla redan lagrade rader, de ersatta funktionernas ACL/ägare samt klass-/länktabellernas PK, unikhet, constraints, tabellrättigheter och RLS-policyer var oförändrade.

Färska beteendefall omfattar:

- Två klasser med samma namn i samma skola men olika kullar har skilda UUID. Överlappande tillämpningsår nekas med exakt konfliktkod och oförändrade data; olika namn och icke överlappande år fungerar.
- ID-uppslaget hittar en historisk identifierad relation även när klassens nuvarande namn skiljer sig från den lagrade länknamnsnyckeln. Ingen namnändring görs av migrationen eller läsningen.
- Främmande offering, tvetydigt namn, utelämnat/felaktigt föregående plan-ID och gammal revision kan inte adopteras. Korrekt explicit adoption ger en enda ID-bindning och ett återspelbart kvitto.
- Receipt som skapades före både02 och03 återspelas exakt, även efter ersättningsversionens fastställande; klassdatum och gamla relationer förblir oförändrade.
- En ny fastställd version flyttar inga länkar. Uttryckligt versionsbyte påverkar bara valt klass-ID/läsår och bevarar elev-/medlemskapsrader och klassgiltighet.
- Datumgränserna 30 juni och 1 juli är inkluderande på rätt sida; null legacy ger ingen påhittad period. Klassernas nya beständiga startdatum och medlemskapsvägar prövas även av02-regressionen.

Ingen webbapp-/handboksbyggnad eller UI-körning behövdes för dessa SQL-/runnerändringar. De svenska konfliktmeddelandena kopplas in genom03A och den faktiska Worker-/browserkedjan provas i08. Ordinarie lokal3012 är orörd.

## Preciserad demogräns och avvikelser

Den äldre `web/lib/cohort-store.ts` läser/upsertar/raderar en legacyrad utan `class_id`. I **protected** har anon/authenticated saknat direkt åtkomst sedan karantänen, och Worker har inte direkt klasslänksåtkomst. Det vore fel att skapa grants för att få ett positivt demoprov. Orkestreraren godkände därför följande precisering: den gamla radformen provas genom en avgränsad syntetisk migrationsrollsfixtur, medan de faktiska rollerna `anon`, `authenticated` och `skolplattform_worker` var och en nekas SELECT/INSERT/DELETE med 42501. Identifierade relationer bevaras. Detta bevisar kompatibel lagrad legacyform och fortsatt protected-avskiljning, **inte** en fungerande direkt demoadapter i protected eller en ny kontroll av historisk basmiljö. Demokoden är oförändrad.

En tredje spårad fil, den import-säkra verifieringsrunnern, behövdes för reproducerbar gemensam02/03-fixtur, rätt mål och full rollbackbevaring; orkestreraren godkände avvikelsen. De tre verkliga körningarna passerade; inga misslyckade SQL-försök döljs. Oberoende granskning hittade efter den andra körningen att den äldre triggerns namnmatchning fortfarande blockerade versionsbyte för en identifierad klass vars namn hade ändrats. Detta rättades enligt regel1, med nya faktiska SQL-assertions för just den historiska fixturen. Namnmatchning begränsades till INSERT/adoption; redan identifierad UPDATE behåller oförändrat klass-ID och namnnyckel. Slutkörningen omfattar dessa tre tillkomna kontroller.

Känt slutdatum har ingen redigeringsväg i detta paket. Ändgränser provas därför med den faktiska slutna datumfunktionen och syntetiska kompositvärden; lagrade nya klasser har öppet slutdatum. Inga lagrade historiska datum fabriceras för provets skull. Verklig konkurrens mellan två anslutningar är fortfarande **ej körd** och ligger uttryckligen i plan08 efter isolerad apply; den enda rollbackanslutningen bevisar inte samtidighet eller race-resultat.

## Krav och SS 12000

ADMIN-04/PLANERING-04 får avgränsat nytt SQL-bevis för stabil klassidentitet, explicit versions-/årskoppling och säkra kollisioner. ADMIN-03 får bevarandebevis, inklusive02:s kullkopieringsregression; det tidigare godkända mänskliga kopieringsprovet begärs inte igen. PLANERING-05 får reproducerbar källbunden verifiering. Inga hela krav eller fas5 stängs.

Avstämningen följer SS 12000:2024 / OpenAPI 2.1.0 enligt paketets bilaga. Avsedd `Group.id`-identitet skiljs från namn, intern utbildning/kull och tillämpningsläsår. Klassens giltighet förblir skild från medlemskapets datum; inkluderande gränser och okänd historik bevaras. En-utbildning-per-klass och den äldre namnårsnyckeln är fortfarande uttryckliga interna begränsningar. Ingen standardexport, extern ID-mappning eller verklig kommunanslutning har implementerats eller verifierats här.

Nästa beroenden03A/04/05 kan nu genomföras. Rootagenten hanterar oberoende granskning, gemensam status samt push/fjärrverifiering. Plan08 måste uppdatera den äldre `verify-class-timplans.mjs`-runnerns definitionkontroll till de senaste migrationerna och ge äldre GY-fixturer verifierat kalenderår; den gamla plan01-runnern har avsiktligt inte ändrats under03.
