# 05-18 – backendbevis 2026-10-03

Status: **PASS lokalt med syntetiska uppgifter** för terminsmodell, SQL och nytt Worker-API. Mänsklig begriplighet och verklig drift ingår inte i dessa resultat. Tidigare programplans-API-regression har också passerat på samma byggda Worker.

Verifierad app-/serverkälla och byggd Worker: `cdf29c92c6e4114800bbf015562642037addca33`. Det slutliga administratörsprovet förbättrade enbart provharnessen: den använder ett faktiskt av rektor utfärdat administratörsuppdrag i stället för att ändra ett huvudmannauppdrags funktion. Detta krävde ingen ny app-/serverbyggnad. Initiala förprovet fick 30/31 PASS; nytt fullständigt förprov och slutprov fick **31/31 PASS vardera**.

## Beteende och kontrakt

- Separat lagring i `point_plans.term_distribution`, sex heltal i ordningen åk 1 HT/VT, åk 2 HT/VT och åk 3 HT/VT. Raden får vara ofullständig men summan får inte överstiga källpoängen.
- Exakta nivånycklar `part:subjectCode:subjectVersion:itemCode`. Fasta alternativa ämnen/saknade nivåer är inte valda automatiskt. Individuellt val och gymnasiearbete har egna ramnycklar.
- Separata slutna läsa-/skrivkontrakt. `parseProgramplan` och dess befintliga SQL-resultat har bevarats.
- Gemensam revisionsräknare, CAS och mandat-/sessionslås. Två samtidiga aktuella sessioner ger en vinnare och en 409-konflikt.
- Fastställda och ersatta versioner är läsbara och skrivskyddade. Versionskloning kopierar fördelningen. Tilldelad fördjupningsnivå får inte tas bort förrän dess fördelning uttryckligen har rensats och sparats.
- Befintligt mandat för huvudman/rektor gäller. Administratör nekas på servern; delegation ingår fortsatt i separat todo.
- DB- och Worker-audit är obligatoriska för läsning och skrivning. Prov med loggfel gav inga businessändringar eller framgångshändelser.

## Kontroller

| Kontroll | Resultat |
|---|---:|
| Terminsmodell/strikta kontrakt | 3/3 PASS |
| Server/route/kvittoskydd | 5/5 PASS |
| Äldre API-harness och ny exakt 15-signaturprofil | 5/5 PASS |
| Nya SQL-fall | 29/29 PASS |
| Befintliga programplansutkast | 108/108 PASS |
| Befintlig Worker-programplansprofil | 31/31 PASS |
| Befintlig Worker-arbetsyteprofil | 18/18 PASS |
| Befintliga utbildningsflöden | 50/50 PASS |
| Verkligt termins-API-förprov med tillfälliga grants | 31/31 PASS |
| Verkligt termins-API-slutprov efter separat grant | 31/31 PASS |
| Tidigare programplans-API med exakt 15-signaturprofil | 48/48 PASS |

SQL: **236/236** kontroller. Historiska Workerprofiler använder uttryckliga rollback-only revokes; de ändrar inte den slutliga produktionsprofilen. Det nya verkliga API-provet bevisar exakt **15** öppna `phase5_*`-entrypoints för Workern; de två nya terminskommandona är de enda tillagda rättigheterna. PUBLIC/anon/authenticated och nya helpers är fortsatt stängda.

## Målsäkerhet och migrationsbevis

Alla databasoperationer kördes efter `assertTarget('protected')` mot `skolplattform-pilot-protected` lokalt. Ingen reset gjordes. Foundation-migrationen är `20261003120000`; grant-migrationen är `20261003121000` och tillämpades först efter lyckat fullständigt API-förprov och verifierad exakt ACL-återställning.

Tidigare utbildningsmigration fanns i det faktiska schemat men saknades i migrationsjournalen. Apply-scriptets första version stoppade därför utan skrivning. Fortsättningen verifierade faktiska objekt och exakt 13 tidigare öppna Worker-signaturer; äldre migrationer spelades aldrig om.

En riktad `CREATE OR REPLACE phase5_programplan_term_rows` normaliserade numerisk `subjectVersion` till heltalstext så att giltigt JSON `1.0` ger samma nyckel som TypeScripts `1`. Journalens statements uppdaterades till den granskade fullständiga källan; bytehash för samtliga programplansrader bevarades. Färska 29 SQL-fall passerade efter rättningen.

Foundation-hash: `628cd5573e9cf3f0d3cbce305c4ac373333ecb23985e4c3569febe3a7bb1ef6e`.
Grant-hash: `51692a79fbbb4e245a179e787d5129cfb4db666db1856a8084b8df72d8d55a3a`.
Grant-apply krävde PASS/complete/preservation/ACL-restored samt oförändrade hashar för alla sju styrda app-/server-/migrationskällor.

## Städning och bevarande

Förprov och slutprov städade båda sina kund-/sessions-/plan-/utbildnings-/uppdragsrader och temporära felinjektionsfunktioner/-triggers. Fyra auditankare och 52 append-only audithändelser bevarades i varje huvudsaklig provfixtur. Bytehash för samtliga ursprungliga `point_plans`, `offerings`, `point_plan_events` och `class_timplans` var identisk före och efter respektive prov.

Tidigare API-regression kördes på egen Worker 3059 och bevisade åter samtidiga fördjupnings-/bindnings-/skapande-/klonkommandon, samtliga mandat-/sessionsgränser och DB-/Worker-loggfel. Byggrevisionen var samma `cdf29c9`; källhistorikens HEAD var `2477d57bf97b2e27097f13cdd0115e0645e5e335` med oförändrade styrda app-/serverkällor. Egen provdata städades med 155 audithändelser och fyra auditankare bevarade. Den separata äldre användarprovsservern 3012 lämnades orörd.

Resultatfiler:

- `work/pilot/results/phase5-18-terms-sql.json`
- `work/pilot/results/phase5-18-phase5_programplan_drafts-sql.json`
- `work/pilot/results/phase5-18-phase5_programplan_worker-sql.json`
- `work/pilot/results/phase5-18-phase5_programplan_workspace_worker-sql.json`
- `work/pilot/results/phase5-18-phase5_programplan_education-sql.json`
- `work/pilot/results/phase5-18-terms-api-preflight.json`
- `work/pilot/results/phase5-18-terms-api-final.json`
- `work/pilot/results/phase5-18-programplan-api-regression.json`

## Kompletterat slutprov på vanlig 3012

Releaseprov på byggd Worker d37f566: **31/31 PASS**, efter utökning av två befintliga fall. En enda fördjupningsrad rensades medan gymnasiearbetsfördelningen bevarades efter omläsning och nivåborttagning. Klon ändrades till egen revision 1 och lästes tillbaka; källans revision 8, fördelning och verksamhetshistorik bevarades exakt. Båda kontrollerade fixtures städades, originalverksamhetens samtliga bytehashar identiska. Rapport `phase5-18-terms-api-release.json`.

Initial release 29/31 hade transporttimeout i partial-draft följt av snapshot FAIL i CAS-fallet, samtidigt PASS på klon/rensning och cleanup/bevarande. Rapporten bevaras som `phase5-18-terms-api-release-initial.json`. Ny full 31 på färsk Worker passerade med samma server-/migrationskällor och oförändrade timeouts/provvillkor. Samtliga sju sourcehashar matchar slutkällan. Ingen slutsats om full nationell regelkontroll dras av SA25-paritetsfixturen.
