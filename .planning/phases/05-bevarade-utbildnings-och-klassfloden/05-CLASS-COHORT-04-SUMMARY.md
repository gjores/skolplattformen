---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: CLASS-COHORT-04
status: completed_rollback_verified_not_applied
date: 2026-10-15
implementation_commit: 32f5dfa
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
---

# Tidig klassorganisation med atomiska kvitton

Planens båda uppgifter är genomförda och verifierade mot faktisk PostgreSQL i isolerat lokalt `protected`, helt inom rollback. Migrationen är **inte permanent tillämpad**. Gemensamt källkontrakt, läsning, klasskapning och kvitto-/auditgarantier checkas in tillsammans; ingen delvis öppnad skrivväg lämnas som mellanläge. Implementation och prov finns i `32f5dfa`. Root äger gemensam status och push.

## Resultat

- `phase5_class_cohort_underlag(uuid,uuid)` prövar verklig session, kund, huvudman, exakt skolmandat och utbildningens skoltillhörighet. Huvudmannen kan läsa; rektor/administratör kan skapa inom skolmandatet före fastställd timplan. Befintliga klasser läses med stabilt ID, originalnamn, separat kullår och giltighetskälla. Otydlig källa, arkiv, skrivår utanför 2000–2100 eller full lista blockerar ny klasskapning utan att dölja historiska klasser.
- `phase5_class_cohort_command(jsonb)` godtar den frysta hela begäran och 1–20 uttryckliga kanoniska namn. Källtoken är SHA256 av PostgreSQL JSONB-text med kalenderår och samtliga ID-sorterade planers identitet, version, revision, status, katalogbindning och datum. Utbildnings- och planradslås hålls under CAS och INSERT; skollåset serialiserar också namn/startläsår över olika utbildningar. Datumkritiska källregler från 02 och gamla namnets unika skol-/årsnyckel gäller fortsatt.
- Ny batch skapar bara tomma klasser med `education_start`, exakt startdatum och öppet slut. Alla rader, per-klass audit, batchaudit och privat requestbundet kvitto lyckas tillsammans eller återställs. Högst 2000 klasser får finnas för exakt utbildning/skola. Inga elevplaceringar, medlemskap eller timplanskopplingar skapas.
- `phase5_class_cohort_status(jsonb)` återläser endast samma hela begäran för samma identitet och uppdrag efter ny kontroll av aktuell session och mandat. `found` innehåller fullständigt kvitto med `replayed=true`; `not_found` skapar inga verksamhetsrader. Ändrad källa/livscykel eller arkivering förstör inte ett redan framgångsrikt kvitto. Ett nytt uppdrag för samma person får inte överta kvittot.
- Kvitton har FORCE RLS, inga tabellrättigheter och skydd mot UPDATE/DELETE/TRUNCATE. Endast de tre entrypoint-funktionerna har Worker EXECUTE. Övriga hjälpare och klientroller är stängda. Audit använder frysta operationer/objekttyper, utan klassnamn i detaljerna.
- SQL-namnvalideringen normaliserar aldrig input. Numeriska Unicode 17.0-intervall för Cc/Cf och tecken som ändras av JavaScripts `toUpperCase()` undviker PostgreSQL-lokalens skillnader, exempelvis `ß`. ECMAScript-trimtecken och UTF-16-gränsen räknas uttryckligt. Äldre klassnamn projiceras oförändrade; ingen historik skrivs om.

## Faktisk verifiering

| Kontroll | Resultat |
| --- | --- |
| `node work/pilot/verify-class-cohort-commands.mjs --out /private/tmp/class-cohort-04-final-1.json` | exit 0; **274 kontroller PASS**, `rollbackRestored=true` |
| Session/mandat | HM läser utan skrivrätt; rektor/admin skapar tidigt; faktisk annan kund och annan skola i samma utbildning nekas; återkallad session, borttaget skolmandat och samma identitet med nytt giltigt uppdrag kan inte överta kvitto. |
| Atomik | Två klasser i bekräftad ordning; ogiltig andra klass, dublett, ändrad payload/token, datumavvikelse, stale source/lifecycle, arkiv och kapacitetsfel ger inga delrader. Injicerat auditfel på andra klassen återställer också första klassen och dess audit. |
| Kapacitet/identitet | 20 namn lyckas, 21 nekas. Batch över 1999 nekas helt; en sista klass ger exakt 2000 och fortsatt läsbar blockerad lista. Två utbildningar samma år med olika namn lyckas; samma skolnamn/startläsår över utbildnings-ID:n ger säker konflikt. Ny planversion bevarar klasslistan och ändrar källtoken. |
| Återhämtning | Exakt retry och status behåller ID:n. Framgångsrikt kvitto läses efter faktisk källrevision, livscykelrevision och arkivering; nya skrivningar kräver aktuell källa. Status ändrar inga verksamhetsrader. |
| SQL/TypeScript | Faktiska läs-, batch- och statussvar passerar 05:s parsrar, även okänd legacykälla och läsbart år 2102 utanför skrivstödet. Faktisk DB-roll `skolplattform_worker` skapar ÅÄÖ/Deseret/30-emoji-namn och läser kvittot; privata hjälpare och tabell nekas. Detta är ett SQL-rollprov, inte ett riktigt HTTP-/OIDC-flöde. |
| Namnparitet | **5534** SQL/JS-prov med samtliga casing-/Cc-/Cf-punkter och deras grannar, alla ECMAScript-trimtecken före/efter/inuti namn samt UTF-16-gränser. Ensamma surrogater nekas av PostgreSQLs faktiska JSON-parser utan ersättningstecken. |
| Bevarande | Alla tidigare offentliga tabellrader oförändrade direkt efter 04-migrationen. Varje nekat SQL-anrop jämför klass, medlemskap, placering, länk, utbildning, programplan, kvitto och auditantal. Hela databasens offentliga rader och schema-/ACL-/policy-/journalfingeravtryck lika före/efter rollback. |
| Reproducerbarhet | 62 aktuella källhashar inkluderar importerade fixturer, katalog, målskydd, bevarandehjälpare och TS-kontrakt/test/importkedja. Befintlig privat rapportfil nekades före DB-kontakt med exit 1; rapport skapas med `wx`, mode 0600. |
| Syntax/whitespace | `node --check work/pilot/verify-class-cohort-commands.mjs` och avgränsad `git diff --check`: exit 0. |

Slutrapportens SHA256: `c56a633c3a80f9bbdfe411723ba39eef98b38f39c228bfe5b4ae509209c40be1`. Rårapporter och syntetiska detaljer stannar utanför Git i privat katalog. Tidigare felkörningar återställde databasen; felen gällde SQL-provets alias/fixturåterställning, kloning av ännu öppet utkast, främmande utbildnings obligatoriska programkod samt driverns JSON-serialisering i ett transportprov. Inget produktfel kvarstod i slutkörningen.

## Förtydliganden och kvarstående verifiering

- Den godkända tredje runnerfilen gör setupen reproducerbar och binder alla lokala beroenden. 02:s regressionsfil körs efter 03 men före 04 eftersom dess ursprungliga ACL-test avsiktligt kräver att alla funktioner med prefixet är privata. 04 provar därefter den nya exakta listan med tre publika entrypoints. Full 03-regression efter 04 återstår i 08.
- Befintlig MFA-policy ligger i Worker-routens `requireMfa`/policybedömning, inte i SQL-sessionens `amr`. SQL-proven verifierar faktisk session och mandat. MFA-/same-origin-/HTTP-felhantering provas i 06/08 genom den riktiga servergränsen; ingen ny egen SQL-MFA-policy införs.
- En anslutning med rollback bevisar inte samtidighet. Faktiska överlapp mellan två anslutningar, källskrivning mot klasskapning och samma request, återstår i 08. Ingen permanent apply, driftrelease eller verklig elevregisteranslutning har gjorts.
- Namnmatrisen är bunden till aktuell Node Unicode 17.0. Vid runtime-/Unicodeuppgradering ska pariteten köras om och eventuella ändringar behandlas som kontraktsändring.
- SS 12000:2024/OpenAPI 2.1.0: stabil klassidentitet och klassgiltighet hålls skilda från medlemsperiod och timplansrelation. Intern en-utbildning-per-klass, legacy-null och historisk namn-/årsnyckel kvarstår som dokumenterade begränsningar. Detta är intern modellverifiering, inte verifierat informationsutbyte eller standardcertifiering.
