---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: CLASS-COHORT-06
status: completed
completed: 2026-10-15
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
subsystem: skyddat klassorganisations-API
requires: [CLASS-COHORT-03A, CLASS-COHORT-04, CLASS-COHORT-05]
provides: [auditerat underlag, MFA-skyddat klasskapande, läsande requestbunden sparstatus]
affects: [CLASS-COHORT-07, CLASS-COHORT-08]
tech-stack:
  added: []
  patterns: [protectedRoute, strikt svarstolkning inom transaktion, obligatorisk audit]
key-files:
  created:
    - web/lib/server/class-cohort.ts
    - web/lib/server/class-cohort.test.mjs
    - web/app/api/klasser/organisation/underlag/route.ts
    - web/app/api/klasser/organisation/skapa/route.ts
    - web/app/api/klasser/organisation/status/route.ts
---

# CLASS-COHORT-06: skyddat API för klassorganisation

Tre POST-rutter ansluter plan04:s SQL-operationer till befintlig sessions-, mandat-, MFA- och auditkontroll. Underlag kan läsas av huvudman, rektor och administratör. Skapa kräver rektor eller administratör, samma origin och aktuell serverbedömd MFA. Sparstatus är en obligatoriskt auditerad läsning för rektor eller administratör; den kräver hela den tidigare begäran och anropar aldrig skaparkommandot. Status kräver inte ett nytt MFA-bevis för skrivning.

## Genomförande och commits

`class-cohort.ts` använder de frysta signaturerna `phase5_class_cohort_underlag(uuid,uuid)`, `phase5_class_cohort_command(jsonb)` och `phase5_class_cohort_status(jsonb)`. Requestparsern körs före domän-SQL. Exakt en resultatrad och ett strikt scope-/requestbundet svar krävs inne i transaktionen. Saknat, dubblerat eller felaktigt DB-svar ger `audit_unavailable`; ett preliminärt skapande kan därför inte lämnas som success eller committas via denna väg.

Befintlig `mandateOperation` ger de säkra namnårs-/startlåsfelen från03A. Endast `40001` med `class_plan_not_ready` får den motsvarande kompletterande felkoden i den nya adaptern. Oväntade hints och `42501` avslöjar inga databasinterna detaljer; SQL:s `55000` behandlas som auditfel. Oförändrad lokal målspärr består.

Workerhändelserna är `class_cohort_read` / `education`, `class_cohort_created` / `education_command` och `class_cohort_status_read` / `education_command`. Objekt-ID, skol-ID och vid skapande antal ingår; klassnamn, sourceToken och hela begäran loggas inte. Befintlig säkerhetslogg tillför aktuell funktion och bedömt MFA-bevis för skrivningen. Plan04:s separata SQL-audit per klass påverkas inte.

- `548497c` — produktadapter och tre rutter, uppgift1.
- `93c8411` — fjorton routeprov, uppgift2.

Endast planens fem filer ändrades. Ingen UI-kod, SQL-migration, grant, ny rättighet eller beständig miljöändring infördes. Gemensam planstatus och push/fjärrverifiering hanteras av orkestreraren.

## Faktisk verifiering

Slutomgången kördes i `web/` och gav:

| Kommando | Resultat |
| --- | --- |
| `node --test lib/class-cohort.test.mjs lib/server/class-cohort.test.mjs lib/server/class-timplan.test.mjs` | PASS, exit 0: 36 testfall, 0 fel/skips; 14 nya routeprov + 13 kontrakt + 9 tidigare klassplanprov. |
| `npx tsc --noEmit` | PASS, exit 0. |
| `npx oxlint app lib` | PASS, exit 0. |
| `git diff --check` | PASS, exit 0; även staged whitespacekontroll före båda taskcommits PASS. |

Privat rapport: `/private/tmp/class-cohort-06-jqj0jyuf/evidence.json`, SHA256 `6841577135d8d25790b4009e83c4d6dd3538ae7d09d90d2c10989b968d80c486`. Rapporten innehåller kommandon, exitkoder, privata loggreferenser/logghashar och **49 källhashar identiska före/efter**. Källorna omfattar de berörda proven/rutterna, deras lokala importberoenden, paketlås och plan04:s migrationskälla. Rapport/loggar ligger i en unik privat katalog med 0600 för filer.

De nya proven laddar verkliga routefunktioner, `protectedRoute`, MFA-bedömning, request-/svarsparser, säkerhetsloggens minimering och HTTP-svar. Endast databas-, sessions- och miljöadaptrar ersätts med syntetiska fixturer. De prövar:

- Läsläge för huvudman/rektor/admin, exakt vidarebefordrat utbildnings-/skolscope och audit utan klassnamn/sourceToken.
- Skapa för rektor/admin; huvudman och andra roller nekas före domän-SQL. Fel/saknad origin, saknad/gammal MFA, saknad/utgången/återkallad session och ändrat uppdrag stoppar operationen.
- Den aktuella transaktionskontextens roll övertrumfar en äldre rollhint. Fel epoch ger `context_changed` före domän-SQL på alla tre rutter.
- Felaktig JSON, extra behörighetsfält, ogiltiga ID:n, otillåtet andra namn och ofullständig statusbegäran når ingen domänoperation.
- Vidarebefordrat exakt scope plus simulerat SQL-nekande för annan skola; simulerad actor-/requestkonflikt lämnar inga kvitton. Dessa fall bevisar adapterhanteringen, inte databasens mandatkontroll.
- `found` och `not_found` med full begäran, utan MFA-skrivkrav, anropar endast statusfunktionen och skapar ingenting.
- Säker konfliktkod, generiskt behörighetsfel samt obligatorisk lyckad/nekad audit. Auditfel rullar tillbaka den syntetiska transaktionen och lämnar inga lyckade svar.
- Noll/flera/felaktiga DB-rader, annan utbildning/skola, dubbla klass-ID:n, avvikande datum/namnordning och felaktiga statuskvitton stängs innan success.

Första omgången gav 33/36: tre provförväntningar utelämnade den befintliga loggens automatiska `accessFunction` och MFA-`proof`. Förväntningarna rättades; produktkoden behövde ingen ändring. Två egna lintvarningar om heterogena testtupler rättades genom namngivna fixturefält. Full lint upptäckte också plan05:s avsiktliga `new Array(1)`-glesarrayprov; orkestreraren rättade det separat till samma glesa array via explicit längd. Slutomgången ovan omfattar den rättningen. Ingen kvarstående avvikelse från plan06.

## Begränsningar och SS 12000

Detta är adapter-/kontraktsbevis med syntetiska DB/sessioner. Inget faktiskt Worker-, PostgreSQL-, OIDC-, HTTP-race- eller MFA-step-up-flöde kördes inom06. Plan04:s separata SQL274-bevis ersätter inte dessa återstående kontroller. Plan08 ska prova den verkliga kedjan och samtidighet;07 ska först ansluta UI. Ingen separat appbyggnad eller UI-/handboksändring behövdes för denna serverplan, och ordinarie3012 är orörd.

ADMIN-04 får verifierade routegränser och PLANERING-04/05 ett strikt request-/kvittoflöde. ADMIN-03 får adapterbevis för att misslyckad audit/svarstolkning inte ger delvis lyckat svar; faktisk DB-atomik tillhör04/08. Inga hela krav eller fas5 stängs.

SS 12000:2024 / OpenAPI 2.1.0 enligt paketbilagan beaktas genom stabila klass-ID:n, explicit utbildning/skola och oförändrade giltighetsdatum. API:t bevarar plan05:s skillnad mellan klassgiltighet och medlemskap samt okända historiska datum. Intern en-utbildning-per-klass och äldre namnårsnyckel kvarstår. Detta är inget standardiserat exportkontrakt, ingen verifierad SS 12000-anslutning och ingen verklig kommunanslutning.
