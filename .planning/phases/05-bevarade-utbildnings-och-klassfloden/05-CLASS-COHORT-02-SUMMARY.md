---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: CLASS-COHORT-02
status: completed_rollback_verified_not_applied
date: 2026-10-15
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
implementation_commit: ed4f66a
---

# Klassgiltighet och låst utbildningsstart

Planens två uppgifter är genomförda och verifierade mot faktisk PostgreSQL i isolerat lokalt `protected`, helt inom rollback. Migrationen är **inte permanent tillämpad**. Ingen produktserver har startats om. Genomförandet och proven ligger atomiskt i `ed4f66a`: additiva datum och skydd för samma datum är en odelbar invariant; ett schema utan sina skydd checkas därför inte in som ett mellanläge.

## Resultat

- `school_classes` får nullable `starts_on`, `ends_on`, `created_at`, `updated_at` och explicit `validity_source`. Alla äldre kolumner och medlemskapsrader bevaras. Äldre datum/tidsstämplar förblir null; ett gammalt kvitto fyller inte i historik.
- Nya gymnasieklasser genom även gamla `phase5_class_command(create)` får exakt samstämmigt datum från bundna programplansversioner, förenligt med utbildningens kalenderår. Klassens första läsår använder juli-gränsen. Saknat/otydligt underlag stoppar ny klass. Grundskola och introduktionsprogram kan fortsatt skapa klasser med okänd giltighet.
- Gemensamma triggers skyddar utbildningens kalenderår, programplansdatum, bindning och ny version. Samma datum tillåter innehålls-/revisionsarbete och ny version; kopiering får nytt datum på ny utbildning utan gamla klasser/elever/länkar. Äldre okänt kalenderår hindrar inte samma-datum-kloning från entydigt programplansunderlag, men räcker inte för ny klassbildning.
- Klassen serialiserar med källskrivningar via utbildningsradens lås. Direkt planskrivning använder `FOR UPDATE NOWAIT` så att den inte väntar baklänges mot klassvägens utbildning→plan. Konflikt ger `40001` med `class_cohort_start_locked`. Datumkritiska skrivningar nekar annan isolation än READ COMMITTED; detta förhindrar att en äldre transaktionssnapshot används som bevis för att klasser saknas. Aktuell databasdefault verifierades som `read committed`.
- INSERT/UPDATE av medlemskap kontrollerar separata medlemsdatum mot låst klassrad. Period före känd start nekas; legacy-null bevarar tidigare beteende. Samma privata datumregel hanterar inkluderande slut och förbjuder öppet medlemskap som går förbi känt klass-slut. Ingen datumredigering/slutfunktion eller nya tabell-/RPC-rättigheter har införts.

## Färsk verifiering

| Kontroll | Faktiskt resultat |
| --- | --- |
| `node work/pilot/verify-class-cohort-dates.mjs --out /private/tmp/class-cohort-02-full-3.json` | exit 0, **89 kontroller PASS**, `rollbackRestored=true` |
| Ursprungliga data | Samtliga offentliga tabellrader lika före/efter. Gamla klasskolumner och kompletta medlemskapsrader jämfördes dessutom direkt efter additiv migration. |
| Schema/rättigheter | Fullt fingeravtryck för funktioner, tabeller, kolumner, constraints, index, triggers, ACL, policies och migrationsjournal lika efter rollback. Alla nya hjälpare privata även för Worker. |
| Faktiska SQL-/RPC-flöden | Gamla create/replay, datum-/registreringsmetadata, direkta datumändringar, livscykeländring, ny version, skolborttagningsspärr, GR/IM, faktisk kullkopia, motstridiga datum, saknat kalenderår och bevarad legacyversion PASS. |
| Faktiska registermutationer | Klassbyte före start nekat utan delvis ändrad elev/medlemskap; på/efter start tillåtet. Utbildningsbyte före/på/efter klassstart bevarar tillåtna medlemsperioder; direkt tidigareläggning av medlemskap nekas. |
| Isolationsnegativ | Egna fixturer under REPEATABLE READ respektive SERIALIZABLE: utbildningsstart, planstart och klassinsert nekas med exakt `40001`/hint. **Inte ett samtidighetsprov.** |
| Befintlig rapportfil | Slutrunnern nekade befintlig `--out /private/tmp/class-cohort-02-full-2.json` med exit 1 före mål-/DB-kontakt; första bevis skrivs aldrig över. |
| `git diff --check` och `node --check work/pilot/verify-class-cohort-dates.mjs` | exit 0 |

Rapportens 51 källhashar binder produktfiler, prov, SQL-fixtur, katalog och lokal importkedja. Rådata och första felbevis ligger privat utanför Git. Slutkällornas SHA256:

- Migration: `a39b5771a357c1b9e0ed2923bd89f2543cc5c0c3ee360a04132c7964e7591f67`.
- SQL-prov: `ef51d542c0df3ea71d4ae505701b519c61d3a5e1f19f743ac26789e66f3fb699`.
- Runner: `83af6ea052a6f479a72cb4e1bcdc831764bbb50c88a57de39b63de55ae981504`.

## Avvikelser och preciseringar

1. Orchestratorn godkände den tredje spårade filen `work/pilot/verify-class-cohort-dates.mjs`: SQL-provet behöver reproducerbar egen kund-/sessions-/mandatfixtur och gamla kvitton före migration. Den exporterade setupen kan återanvändas; import kör inga prov. Runnern kräver `assertTarget`, explicit privat `--out`, skapar ingen permanent apply och skriver rapport med `0600`/`wx`.
2. Tidiga körningar hittade och rättade SQL-CASE-syntax, testfixturens extra utkast mot unik nyckel, namnnormalisering, kopieringsblockets körordning och kopians skolmandat. En körning under pågående källändring underkändes av hashkontrollen. Första privata felrapporter är kvar, inklusive `/private/tmp/class-cohort-02-full-1.json`; de har inte märkts om till PASS. Slutrunnern skriver endast status/kod i konsolen, aldrig råa assertion-rader.
3. Utbildningsbyte före klassstart kan legitimt flytta en framtida medlemsperiod utan att tidigarelägga den. Proven kontrollerar periodens faktiska giltighet, inte ett generellt förbud mot ett tidigare utbildningsbyte.
4. Känt klass-slut har ingen produktväg för registrering i denna etapp. Slutgränserna verifieras därför med den faktiska privata medlemsperiodhjälparen och verkliga constraints på syntetisk klassrad, medan faktiska registermutationer använder lagrade klasser med öppen sluttid. Ingen produkttrigger har stängts av.

## Kvar till plan08 och SS 12000

Verkligt överlapp mellan två anslutningar/HTTP, väntande startändring mot klasskapande, beständig isolerad apply, Worker-/browserflöden och lokal leverans är **inte körda här**. Plan08 måste visa samtidighet på installerad migration; det tidiga rollback-provet bevisar inte detta. Handbok/UI ändras i senare planer, så inget nytt app-/dokumentationsbygge behövdes för SQL-steget.

Avstämning gäller **SS 12000:2024 / OpenAPI 2.1.0** enligt paketets SS12000-bilaga. Stabilt klass-UUID, separat klassgiltighet, medlemsperiod och registermetadata bevarar avsedd `Group`/`GroupMembership`-betydelse. Historiskt okända datum, intern en-utbildning-per-klass och äldre namnnyckel är fortsatt begränsningar. Inget exportkontrakt, fullständig standardefterlevnad eller verklig kommunanslutning har verifierats. ADMIN-03/04 och PLANERING-04/05 får detta avgränsade provresultat; fulla krav/fas 5 markeras inte avslutade.

Root ansvarar för paket-/fasstatus, push av aktuell gren och kontroll av fjärrcommit före nästa beroendeplan.
