---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "22"
subsystem: protected-offering-school-linkage
status: complete
completed: 2026-10-05
requirements: [ADMIN-04, ADMIN-02]
requirements-finally-verified: []
human_result: awaiting_user
migration_preservation: partial
requires: [05-21]
provides: [school-scoped-register-education, school-scoped-timplans, stable-class-version-linkage, school-removal-dependency-check]
affects: [05-23, 05-25]
plan_head_before: 5b74c76
worker_build_revision: ce887482648a1cc1a0257d3d380769f35519a5cb
---

# 05-22 — skolkoppling för elever, klasser och timplaner

En tillagd skola kan använda utbildningen för sina egna elevplaceringar, klasser och timplaner genom befintliga skyddade vägar. Registervalen visar skolans kopplade utbildningar. Varje skola har egna timplansversioner; klasskopplingen kräver samma skola och fastställd version och flyttas inte av en ny version. Skola med refererande klasser, placeringar eller timplaner kan inte tas bort från utbildningen.

Genomfört och automatiskt prövat lokalt med syntetiska uppgifter enligt D-06/D-07. Den första migreringens fyra ändrade tidsstämplar och full SQL-svitens äldre fel är kvarstående avvikelser. Mänsklig begriplighetsbedömning väntar; detta slutgodkänner inte ADMIN-04 eller fas 5.

## Levererat

- FK för `school_classes` och `pupil_placements` pekar på `offering_units(offering_id, unit_id, organizer_id)`. Nya FK validerades före borttagning av gamla, i samma transaktion. Utbildningsval, årskurser, etiketter och befintliga registerbyten kontrollerar skolkopplingen med oförändrad kund-, mandat-, skydds-, period- och revisionsgräns.
- `timplans.unit_id` är obligatorisk och kopplad till utbildningens skolor. Version, öppen version och fastställd version är unika per utbildning och skola. Timplanens egen skola styr lista, läsning och rektorsskrivning. Klassens skola, planstatus och rätt kolumn kontrolleras vid klasskoppling.
- Befintligt skolkommando nekar borttagning av alla tre typer av beroenden med `programplan_in_use`. Skolor-dialogen visar ett begripligt besked och läser om aktuellt läge. Skolvalet och revisionen bevaras vid nekandet.
- Inga nya signaturer eller grants. Exakt tidigare 16 phase5-entrypoints för Worker. Funktions-ACL och äldre `copy_offering_cohort` bevaras. Den äldre kopieringen är stängd för PUBLIC/anon/authenticated/Worker; befintlig `service_role`-rättighet bevaras, och äldre privilegierad kopiering har inte återöppnats eller verifierats som fungerande.
- Handboken beskriver egna skolkopplingar, klassens fasta version och borttagningsbegränsningen. Enligt D-07 ingår ännu inga appkommandon för att skapa klass, skapa timplan eller koppla klass till timplan. Befintlig timplansvy för GR/IM används i browserprovet; gymnasiets nya timtabell ligger fortsatt i senare planer.

## Inventerade funktioner

Före-definitioner hämtades med `pg_get_functiondef` på det isolerade protected-målet. Fulla motiveringar och SHA-256 finns i [05-22-FUNCTION-INVENTORY.md](05-22-FUNCTION-INVENTORY.md).

| Klassificering | Funktioner |
|---|---|
| Byts till skolkopplad väg | `phase4_change_pupil`, `phase4_history_value`, `phase4_list_pupils`, `phase4_validate_selection`, `phase5_change_programplan_education`, `phase5_list_timplans`, `phase5_read_timplan`, `phase5_timplan_scope`, `validate_class_timplan` |
| Avser huvudskolans ursprung med avsikt | `phase5_create_programplan_education`, `phase5_list_programplan_offerings`, `phase5_programplan_education`, `phase5_programplan_education_status`, `phase5_programplan_lifecycle`, `phase5_programplan_starts_on`, `phase5_programplan_unit_guard`, `phase5_programplan_writable` |
| Berörs inte; lämnas orörd | `copy_offering_cohort`, `phase4_projection`, `phase5_change_timplan_cell`, `phase5_programplan_result`, `phase5_programplan_scope` |

Projection använder redan placeringens skola, cellskrivningen ärver timplan-scope och programplanens delade scope är levererat i 05-21. Huvudskolans identitet/start/etikett bevaras avsiktligt. Befintligt elevskapandekommando saknas; FK och byte-/utbildningskommandon är de befintliga vägarna.

## Verifiering

| Kontroll | Resultat |
|---|---|
| Node modell/server, inklusive sex nya målskydds-/journalprov | 577/577 PASS |
| Timplan-API-harness och register-API-harness | 7/7 och 5/5 PASS |
| TypeScript, oxlint, skyddat appbygge, handboksbygge | PASS |
| Riktad skolkopplings-SQL | 46/46 PASS; spårprov RED före migrering |
| Full SQL, 30 filer | **FAIL 1963/1964**, endast äldre `phase2_audit` #13 |
| Byggd Worker: timplan-API, livscykel-API, register-API | 39/39, 39/39 och 18/18 PASS |
| Browser timplan / livscykel | 22/22 och 20/20 PASS på dator/telefon |
| Browser programplan | Första hela **FAIL 39/40**; oförändrat separat phone14-omprov 1/1 PASS |
| Browser terminer | 25/25 körda PASS + ett avsiktligt hoppat datorfall |
| Browser elevkort / lista / rolläsningar | Slutligt 12/12, 13/13 och 5/5 PASS; riktig lokal OIDC i de äldre registerfallen |
| Korrigerad migrationsbackfill, helradsbevis med rollback | PASS; historiskt första helradsbevis för timplaner är **PARTIAL** |
| Verksamhetsbevarande efter hela regressionen | PASS: samma efter-migrationshashar för klasser, placeringar, timplaner, timvärden och klasskopplingar; alla tidigare funktions-ACL oförändrade |
| Aktuellt användarprov före/efter byte på 3012 | 18 scenarier över nio utbildningar och två roller, PASS och sparade verksamhetsrader bevarade |

Matrisen täcker 137 passerade beteenden och ett avsiktligt hoppat fall, med 112 städningsbilagor. Egna verksamhetsrader och felinjektioner är borta; append-only audit och dess nödvändiga ankare bevaras. Nya skolkopplingsfall använder lokalt mintade sessioner mot riktig Worker och PostgreSQL. Mänsklig OIDC/MFA-bedömning eller verklig kommunanslutning är inte härledd ur dem.

Minimerade resultat ligger i `work/pilot/results/phase5-22-*.json`. Lokala rårapporter, loggar och bilder ligger i `web/test-results/phase5-22-final/`; deras SHA finns i browserrapporten. Rårapporterna är orörda; separata `*-local.json` och `report-paths.json` återkopplar bilagor till den bevarade lokala resultatkatalogen efter städning av byggkopian. Den oberoende granskningen finns i [05-22-VERIFICATION.md](05-22-VERIFICATION.md), status `human_needed`. Dator-/telefonbilder för B:s timplan, skolborttagning och elevkort har granskats.

Fas 5:s första sviter och API använde `849c1df`; slutliga registersviter och phone14 använde `ce88748`. Produktkod i `web/app`, `web/lib` och `supabase` är identisk mellan dessa revisioner. Vanlig 3012 kör slutligt bygge `ce88748`, med 27 äldre klientfiler kvar för öppna flikar. Inga användarflikar laddades om automatiskt och ingen återetablering av provdata gjordes. Den egna isolerade byggkopian och den gamla byggbackupen är borttagna efter att råbevisen bevarats. Tillfällig lokal 3059-returadress i test-IdP är återställd; användare, engångskoder och övriga klientinställningar bevaras.

Fas 4:s nya register-SQL, API och browserkörningar ersätter dess äldre bevis för de fyra ersatta registerfunktionerna.

## Rättningar och kvarstående avvikelser

1. Första riktade SQL-omgången gav 44/46. Ett negativt placeringsprov överlappade en period och ett ACL-prov antog felaktigt att äldre `service_role`-EXECUTE var stängt. Provdata/förväntning korrigerades utan ändrad produktbehörighet; första rapporten bevaras.
2. Första backfillen ändrade **fyra timplans `updated_at`** via befintlig touch-trigger. Klasser, placeringar, timmar, klasskopplingar och funktions-ACL bevarades, men de gamla tidsstämplarna kan inte återställas ur aggregathasharna. Källmigrationen stänger nu enbart `timplans_touch` kring backfill och återaktiverar direkt, i transaktion. Ett exklusivt rollbackprov från återställt före-schema bevisar fullradsbevarande för korrigerad migration. Journal-only-synk kräver exakta före-/efterhashar, PASS-bevis och aktuellt schema/ACL. Den reparerar inte första körningens metadata. Historiskt bevarande är fortsatt PARTIAL, och inga tidsstämplar har hittats på.
3. Full SQL är fortsatt röd på det äldre fas 2-fallet: `History denied` matchar inte förväntat `%serverkontext%`. Alla berörda register- och timplansfiler passerar. Felet har inte dolts genom ändrad förväntning.
4. Register-API gav först 15/18. Beständiga provrader hade sparad framtida placering/klasshistorik som två gamla provkloner kopierade trots antagande om en enda period. Endast de egna klonerna får nu dagens entydiga perioder; originalet lämnas kvar. Lokal Kong/PG-loggminimering återställdes med befintligt granskat verktyg. Slutligt faktiskt Kong-källbevis passerar; konfigurationen ensam räknas inte som bevis.
5. Första elevkortskörningen gav 0/12: tre felaktiga etikettlokatorer och nio saknade lokala OIDC-returadresser. Provet använder nu faktisk combobox-roll med exakt utbildnings-ID/text och inväntar liståtergång. Testklienten fick tillfällig avgränsad 3059-returadress, som återställts. Slutligt 12/12 PASS; produktregler oförändrade.
6. Phone14 i första fulla programkörningen föll i 20 s väntan på lässvar under versionsöppning, före ändrings-/epoch-prov. Oförändrat separat omprov passerade 1/1. Första orsaken är inte fastställd; första hela körningen står kvar som FAIL och ingen automatisk retry användes.
7. Båda migrationsstegen och deras gemensamma fixturer versionshanterades i samma implementationcommit eftersom fulla skolkopplingsprovet och browserfixturen behöver båda schemaändringarna. Kontrollerad tracer-RED, riktad SQL och separat slutlig verifiering behölls. Provrättningarna ligger i två separata commits. Andra trådars pågående dokument- och arbetskopieändringar har bevarats.

## Fortsättning

- Nästa genomförandeplan är **05-23**, med full poängsumma, Svenska/SvA och valbara block/paket i fem separata steg A–E. Poängmängden rättades inte i denna skolkopplingsvåg.
- 05-25 väntar på 05-23; yrkesfastställande kräver dessutom levererade regler från 05-17, som fortfarande saknar PLAN. 05-24:s rena GR/IM-analys är redan genomförd.
- Mänsklig bedömning av elevkort/skolbesked är awaiting_user på vanlig lokal 3012. ADMIN-04 är Pending: skapa klass/timplan/koppla klass i den skyddade appen och fullt läsårsunderlag återstår enligt D-07. Full ADMIN-02, fas 5 och fas 4:s mänskliga checkpoint är öppna.

Implementation: `849c1df`. Registerprov: `4290147`. Elevkortprov: `ce88748`. Resultat-/planeringscommit är separat från produktändringarna.
