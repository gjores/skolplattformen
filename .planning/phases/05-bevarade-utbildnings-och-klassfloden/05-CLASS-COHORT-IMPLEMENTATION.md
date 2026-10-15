---
phase: 05-bevarade-utbildnings-och-klassfloden
package: CLASS-COHORT
status: executing
date: 2026-10-15
implementation: in_progress
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
---

# Genomförande av tidig klassorganisation

Användaren har valt förslaget med oförändrade mandat. Detta paket planerar genomförandet, inte ett redan verifierat stöd. Läs [beslutad omfattning](05-CLASS-COHORT-CONTEXT.md) och [SS 12000-avstämningen](05-CLASS-COHORT-SS12000.md). Inga produktfiler, databaser eller provservrar ändras genom planeringen. [Planchecken](05-CLASS-COHORT-PLAN-CHECK.md) är PASS för planering; genomförande och faktiska prov återstår.

## Körning och beroenden

Starta endast `05-CLASS-COHORT-*-PLAN.md`; fas 5:s äldre vågnummer är andra paket. Varje plan har högst fem produkt-/provfiler och två eller tre uppgifter. GSD-sammanfattningar, verifiering och statusuppdateringar tillkommer enligt respektive output och räknas inte som produktkod.

| Plan | Våg | Kräver | Resultat |
| --- | --- | --- | --- |
| [01](05-CLASS-COHORT-01-PLAN.md) | 1 | — | Begripligt årsval och faktiskt negativt SQL-prov före kullstart |
| [02](05-CLASS-COHORT-02-PLAN.md) | 2 | 01 | Additiva klassdatum, proveniens, skydd för utbildningsstart och medlemskapsperiod |
| [03](05-CLASS-COHORT-03-PLAN.md) | 3 | 02 | ID-först och säker namnkollision med bevarad äldre nyckel |
| [03A](05-CLASS-COHORT-03A-PLAN.md) | 4 | 03 | Typade felkoder, svensk text och auditerade konflikter |
| [04](05-CLASS-COHORT-04-PLAN.md) | 4 | 03 | Skolbundna SQL-kommandon, atomisk batch och requestkvitto |
| [05](05-CLASS-COHORT-05-PLAN.md) | 4 | 03 | Strikta TypeScript-kontrakt med beteendeprov |
| [06](05-CLASS-COHORT-06-PLAN.md) | 5 | 03A, 04, 05 | Skyddade read/create/status-rutter |
| [07](05-CLASS-COHORT-07-PLAN.md) | 6 | 06 | Valbart klasssteg i gemensam programplansarbetsyta |
| [08](05-CLASS-COHORT-08-PLAN.md) | 7 | 07 | Verkliga SQL-/Worker-/browserprov och bevarande |
| [09](05-CLASS-COHORT-09-PLAN.md) | 8 | 08 | Handbok, samma testade bygge på lokal 3012, konkret användarprov |
| [10](05-CLASS-COHORT-10-PLAN.md) | 9 | 09 | Separat mänsklig begriplighetskontroll |

03A/04/05 har skilda filer men ett gemensamt fryst kontrakt nedan; genomför sekventiellt om kontraktet behöver justeras. Övriga steg berör gemensamma invariants och är avsiktligt sekventiella. Checkpoint finns endast efter automatiserade kontroller och lokal leverans. Avgränsade kontrollerade commits/pushar följer AGENTS; inga orelaterade arbetskopieändringar ska tas med.

## Gemensamt internt kontrakt för plan 04–07

Detta är genomförandeval inom beslutet. Exakta namn fastställs här för att SQL och TypeScript inte ska utveckla olika kontrakt. Standardutbytesobjekt implementeras inte.

- **Read request:** `{offeringId, unitId}`. Svar innehåller samma ID:n, `educationName`, `schoolName`, `educationRevision` (offerings.lifecycle_revision), `sourceToken`, `educationStartsOn`, `firstSchoolYear`, `canManage`, `blockers`, `classes`. `sourceToken` är SHA256 av kanonisk, ID-sorterad uppsättning berörda programplansversioners ID/revision/status/bindning/startedOn samt utbildningens kalenderstart; det innehåller inga elevdata. Saknad/otydlig datumkälla ger null datum/år/token och blockerad create. Skrivscope kräver exakt skola i mandat, inte bara en annan skola som råkar ingå i utbildningen.
- **Create request:** `{commandId, offeringId, unitId, expectedEducationRevision, expectedSourceToken, startsOn, names}`. `names` är 1–20 uttryckligt granskade namn, redan normaliserade med trim/versaler enligt befintligt klasskontrakt, max 60 tecken, inga kontrolltecken eller dubletter. `startsOn` är det exakta datum användaren sett; servern kräver identitet med verifierad utbildningsstart. Inget redigerbart slutdatum, skolform, actor/assignment, klass-ID eller elevfält tas emot. Slutdatum lagras null.
- **Create reply:** `{commandId, offeringId, unitId, startsOn, classes, replayed}`. Varje klass har `{id,name,cohortStartYear,startsOn,endsOn,validitySource}`. Svar räknas som bekräftat endast när antal, namnordning och datum svarar exakt mot begäran, klass-ID:n är unika och `endsOn=null`, `validitySource=education_start`. `cohortStartYear` är första läsåret enligt juli-gräns, inte kalenderår. Underlagets äldre klasser får `startsOn=null,endsOn=null,validitySource=legacy_unknown`.
- **Status request:** hela samma create-request, inte enbart commandId. **Status reply:** `{commandId,offeringId,unitId,status,receipt}`, där status är `found` med strikt verifierat create-kvitto eller `not_found` med `receipt=null`. Status är läsande. Den verifierar fortfarande current actor/session/assignment/exakt skolmandat och kvittots request. Ändrad källa efter en redan genomförd begäran hindrar inte läsning av eget kvitto när aktuellt mandat består; replay skapar aldrig en ny klass. Verifierat not_found medger omförsök av exakt ursprunglig begäran, som åter prövar aktuella revisioner.
- **SQL-entrypoints:** `phase5_class_cohort_underlag(uuid,uuid)`, `phase5_class_cohort_command(jsonb)`, `phase5_class_cohort_status(jsonb)`. Alla läsningar är auditerade. Skapa använder privat immutable `class_cohort_commands` med command-ID, actor, assignment, exakt request, reply och registreringstid. Batch är atomisk med varje klass och audit; fel ger noll nya rader/kvitton. Worker får enbart execute på entrypoints, aldrig tabellaccess. `public`/`anon`/`authenticated`/`service_role` får inga nya vägar.
- **HTTP:** POST `/api/klasser/organisation/underlag`, `/skapa`, `/status`. Befintliga `/api/klasser/underlag`, `/skapa` och `/koppla` bevaras. Startlås/namnkonflikt ska ges begripligt säkert 409-besked; exakta koder tas upp i serverprov. Underlagets sourceToken prövas igen under lås vid create och förändring kräver omläsning/granskning.

## Fryst kontraktsprecisering inför våg 4, 2026-10-15

- `sourceToken` är exakt 64 gemena hextecken utan prefix. SQL använder SHA256 av UTF-8 för JSONB:s textrepresentation av `{calendarStartYear,versions}`; `versions` omfattar alla utbildningens planrader sorterade på ID med `{id,version,revision,status,catalogId,basisCatalogId,hasBasis,startedOn}`. Klienten behandlar värdet som opakt. Offering- och samtliga planradslås hålls under CAS och klassinsert.
- `blockers` är `string[]` med fasta säkra svenska verksamhetstexter. Källans `educationStartsOn`, `firstSchoolYear` och `sourceToken` är alla null eller alla kända. Null kräver blocker och `canManage=false`. Arkiv, år utanför aktuellt skrivstöd eller klassgräns kan behålla känd källa men blockerar create. Huvudmannens läsläge kan ha tom blockerlista och `canManage=false`.
- Läsningens klasslista har samma sex klassfält som create. `legacy_unknown` kräver null start/slut; `education_start` kräver verkligt startdatum och eventuellt inkluderande slut som inte föregår start. Läsningen visar gamla klasser även vid blockerad aktuell källa. ID:n är unika; SQL sorterar namn, första läsår, ID. Klassens gamla första läsår tillåts 1–9998. Känd källas första läsår är 1–9998 och härleds med juli-gränsen. Ny create begränsas till första läsår 2000–2100, samma som befintlig skyddad klasskoppling; annan känd källa är läsbar men ger blocker. Datum följer exakt YYYY-MM-DD, verklig dag och år 0001–9999; år 0000 accepteras inte.
- `found.receipt.replayed` är alltid true, beräknat från lagrat kvitto utan att ändra kvittot; första create ger false och command-replay true. Statusparsern kräver found med fullständigt korrekt kvitto eller not_found med null receipt. SQL verifierar exakt hela request inklusive revision/sourceToken även om dessa inte återges i reply.
- Namn granskas efter `trim().toUpperCase()` i klienten och begäran accepterar endast detta kanoniska värde, 1–60 UTF-16-kodenheter, utan Unicode Cc/Cf eller dubletter. SQL och TypeScript ska prövas för samma accepterade/nekade värden, inklusive å/ä/ö, blanksteg, formattecken och tecken utanför BMP; servern får inte tyst normalisera request eller namnordning.
- Läsning bevarar klassnamn som icke-tom text med högst60 Unicode-kodpunkter, utan klientnormalisering, även för `education_start` eftersom den äldre timplansbundna create-vägen har PostgreSQL:s tidigare namnregler. Strikt JavaScript-kanoniskt namn krävs för den nya batchbegäran och dess create-/statuskvitto. Läsning får inte tappa en historisk klass på grund av skärpta nyregistreringsregler.
- Read audit: `class_cohort_read` / `education` / offeringId. Status audit: `class_cohort_status_read` / `education_command` / commandId. Batch audit: `class_cohort_created` / `education_command` / commandId samt `class_created` / `class` per ny klass. Audit innehåller inga klassnamn. Totaltaket 2000 gäller exakt utbildning+skola och prövas som befintligt antal plus hela batchen under lås.
- TypeScript-exporter: `ClassCohortUnderlagRequest`, `ClassCohortUnderlag`, `ClassCohortClass`, `ClassCohortCreateRequest`, `ClassCohortCreateReply`, `ClassCohortStatusReply`; parsers `parseClassCohortUnderlagRequest`, `parseClassCohortUnderlag(value,input)`, `parseClassCohortCreateRequest`, `parseClassCohortCreateReply(value,input)`, `parseClassCohortStatusRequest` (hela create-request) och `parseClassCohortStatusReply(value,input)`.

## Datum, identitet och befintliga datavägar

`school_classes` är den enda klassmodellen. Additiva `starts_on`, `ends_on`, `validity_source`, nullable `created_at`/`updated_at` lagrar känd utbildningsstart för nya lokala klasser. Gamla rader behåller sina tidigare kolumner exakt och får okänd giltighet; ingen automatisk datumbackfill. Nya klasser genom både tidig och äldre timplansbunden create måste få samma kontrollerade datum/proveniens. Registreringstid för nya lokala klasser är faktisk server-/DB-tid och hålls skild från giltighetsstart. Äldre okända created_at/updated_at förblir null, utan now()-backfill. Ett gammalt kvitto får inte ändra en historisk klass bara för att datum saknas.

`phase5_programplan_starts_on` använder min och fallback till skolår och räcker inte som exakt verifierad källa. För nytt klasskapande krävs att berörda bundna planversioner har giltiga samstämmiga exakta datum. Ingen kulltext eller årtal kan ersätta datumet. Konflikt eller ofullständigt underlag stoppar ny create, inte historisk läsning. Alla berörda startändringsvägar ska stoppas när klass finns, även ändring inom samma år. Samma start med ny version tillåts och kopiering med annan start till en ny offering tillåts utan gamla klass-ID:n.

Nya klassdatum måste användas av serverns befintliga medlemskapsskydd. Registermutation för klassbyte och utbildningsbyte, samt direkta tillåtna datavägar, ska nekas om medlemsperioden ligger utanför känd klassgiltighet. Kontrollen ändrar inga historiska medlemskap och inför ingen gissad spärr för legacy-null. Det är ett integritetsskydd för tidig klassbildning, inte ett nytt elevplaceringsflöde.

Äldre `class_timplans` behåller PK `(unit_id,class_name,start_year)`. Identifierade länkar använder class-ID + läsår först. Explicit entydig legacy-adoption med tidigare plan-ID/revision består; tyst/ambig adoption är förbjuden. Samma namn i olika startkullar kan finnas men en överlappande namn-/tillämpningsårsnyckel ger konflikt utan ändring. Även `school_classes UNIQUE(unit_id,name,start_year)` består: samma namn/skola/startläsår får inte skapas på en annan utbildning. Två utbildningar samma år fungerar med olika klassnamn. Full nyckelmigrering och namnbyte ingår inte.

## Krav till färska verifieringsresultat

| Krav/gräns | Plan och obligatoriska fall | Resultat nu |
| --- | --- | --- |
| ADMIN-04 / PLANERING-04 | 01,03,08: fryst start, vårstart, före-start-nekande via SQL och verkligt API, ID/läsår/version, namnkollision och historisk länk | 01: SQL60/UI36 PASS; 03: SQL156 PASS; verkligt API i08 återstår |
| ADMIN-04 | 02,04,06,08: tom klass före timplan, skolmandat, HM read-only, revision, batch/receipt/audit, gammal create-väg och medlemskapsdatum | 02: datum/startlås/medlemskap SQL89 PASS i rollback; 04/06/08 återstår |
| ADMIN-03 | 02,07,08: ny kull får inga gamla klasser, elever, medlemskap eller versionslänkar; tidigare godkänd kopia kräver ingen ny mänsklig acceptans | 02: faktisk kopie-RPC i rollback PASS; 07/08 återstår, tidigare användaracceptans består |
| PLANERING-04 | 07,08,10: gemensam ny/befintlig plan, befintlig klass, skapa, Gör senare/återöppna; dator/telefon | Inte genomfört |
| PLANERING-05 | 08–10: faktiska SQL/Worker/browser, handboksbygge, exakt lokal runtime och mänskligt avgränsat resultat | Inte genomfört |
| SS 12000-avstämning | 02–08: stabila klass-ID:n, separat giltighet/medlemsperiod, groupType Klass och GY som avsedd mappning; ingen export/kommunanslutning | Käll-/modellavstämning, inga integrationsprov |

Plan08 skriver verkliga kommandon, exitkoder, source/buildhashar, före/efter-data och begränsningar i `05-CLASS-COHORT-VERIFICATION.md`. Osäkert utfall ska lösas innan cleanup eller ny mutation. Privata råbevis ligger utanför Git; resultatsammanfattningen innehåller inga konton, tokens eller personuppgifter. Historiska fasresultat är bakgrund, inte dagens testkörning.

Genomförande startat 2026-10-15 på användarens `gsd:execute-phase 5`. Plan01 är genomförd: SQL60, UI36, Node5, typ/lint och separat skyddat bygge PASS; se [sammanfattning](05-CLASS-COHORT-01-SUMMARY.md). Plan02 är därefter rollback-verifierad med SQL89, 61 bevarade tabeller och 51 bundna källor; se [sammanfattning](05-CLASS-COHORT-02-SUMMARY.md). Plan03 är verifierad med SQL156, 61 återställda tabeller och 57 bundna källor vid commit910ff0c, inklusive rättat versionsbyte för omdöpt klass; se [sammanfattning](05-CLASS-COHORT-03-SUMMARY.md). Plan03A är därefter verifierad med Node9/UI42/typ/lint och oberoende granskning; se [sammanfattning](05-CLASS-COHORT-03A-SUMMARY.md). Plan05 har13 Node-sviter, typ/lint och granskade Unicodegränser PASS; se [sammanfattning](05-CLASS-COHORT-05-SUMMARY.md). Plan04 och dess verkliga SQL-/TypeScript-paritet återstår före06. Ingen permanent apply eller faktisk konkurrens verifierad ännu. Hela fas 5, historiska integritetsavvikelser, prestandabacklogg och verklig anslutning är inte avslutade genom detta paket.

## Körväg för SQL-prov före plan08

Plan02–04 verifieras innan den permanenta verifieringsrunnern skrivs. De nya SQL-testfilerna skrivs som transaktionsfria provblock (inga egna BEGIN/COMMIT) med tydliga assertions/RAISE vid fel, syntetiska egna fixturer och privata resultat. Befintliga fixture-hjälpare får återanvändas efter läsning; rättigheter/kund-/uppdragskontext måste sättas i varje prov. Inga obehöriga skrivningar mot ordinarie verksamhetsrader får döljas som testsetup.

Kör från projektroten med `CLASS_COHORT_STAGE=02`, därefter `03` respektive `04`. Följande Node-harness är en konkret körväg; granska importerade befintliga helpers före användning. Den installerar endast paketets ännu ej installerade migrationer inuti rollback och kör stegets SQL-prov. Främmande nätmål accepteras inte. Denna enanslutnings-harness visar låsregler/atomik och kan inte bevisa verklig flersessionskonkurrens medan DDL är ocommittad. Samtidighetsfallen hålls ej körda tills plan08 efter isolerad apply använder två faktiska anslutningar/HTTP med bevisat överlapp. Plan08 gör senare en fullare beständig runner och explicit apply; tidig verifiering får aldrig skapa en permanent migration i förväg.

```sh
CLASS_COHORT_STAGE=02 node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {assertTarget} from './work/pilot/verify-target.mjs';
import {allPublicHashes} from './work/pilot/verify-atomic-cohort-copy.mjs';
import {vocationalDatabaseFingerprint} from './work/pilot/apply-vocational-plan-decisions.mjs';
const stage=process.env.CLASS_COHORT_STAGE;
assert.ok(['02','03','04'].includes(stage));
const specs=[
 ['02','20261015100000_class_cohort_dates.sql','phase5_class_cohort_dates.test.sql'],
 ['03','20261015101000_class_cohort_link_identity.sql','phase5_class_cohort_link_identity.test.sql'],
 ['04','20261015102000_class_cohort_commands.sql','phase5_class_cohort_commands.test.sql'],
].filter(([n])=>n<=stage);
const target=await assertTarget('protected');
const postgres=createRequire(new URL('./web/package.json',`file://${process.cwd()}/`))('postgres');
const db=postgres(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
const rollback=Error('expected_class_cohort_rollback');
const hash=s=>createHash('sha256').update(s).digest('hex');
let passed=false;
try {
 const before=await allPublicHashes(db);
 const fingerprint=await vocationalDatabaseFingerprint(db);
 try {
  await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;
   await tx`set local statement_timeout='60s'`;
   for(const [n,migration,test] of specs){
    const installed=await tx`select version from supabase_migrations.schema_migrations where version=${migration.slice(0,14)}`;
    // Denna tidiga körväg är för ännu ej tillämpat paket. Redan installerat paket
    // använder plan08:s --applied-runner med verifierade definitioner/fingeravtryck.
    assert.equal(installed.length,0,`Migration ${migration} already installed`);
    await tx.unsafe(readFileSync(`supabase/migrations/${migration}`,'utf8'));
    if(n===stage) await tx.unsafe(readFileSync(`supabase/tests/${test}`,'utf8'));
   }
   passed=true;
   throw rollback;
  });
 } catch(error) { if(error!==rollback) throw error; }
 assert.ok(passed);
 assert.deepEqual(await allPublicHashes(db),before);
 assert.equal(await vocationalDatabaseFingerprint(db),fingerprint);
 const sources=Object.fromEntries(specs.flatMap(([,m,t])=>[
  [`supabase/migrations/${m}`,hash(readFileSync(`supabase/migrations/${m}`))],
  [`supabase/tests/${t}`,hash(readFileSync(`supabase/tests/${t}`))],
 ]));
 writeFileSync(`/private/tmp/class-cohort-${stage}-rollback.json`,JSON.stringify({status:'PASS',stage,rollbackRestored:true,fingerprint,sources},null,2));
} finally {await db.end();}
NODE
```

Saknas helper/export eller kräver aktuell testfixtur annan setup ska implementeraren rätta den tillfälliga harnessens anrop efter kodläsning och protokollföra den faktiskt körda varianten. Detta tillåter inte att hoppa över prov, ersätta verklig SQL med strängsökning eller använda fjärrdatabas. Vid fel är resultatet FAIL och ingen apply får följa. Framgång kräver processens exit0 samt lika efterfingeravtryck; gamla PASS-resultat återanvänds inte som nya bevis.
