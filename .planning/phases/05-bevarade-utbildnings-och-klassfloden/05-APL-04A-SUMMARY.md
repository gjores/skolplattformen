---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-04A
subsystem: versioned-decisions-and-recovery
status: complete
requires: [APL-01, APL-03, APL-04]
provides: [versioned-public-decisions, independent-apl-decision-proof, historical-decision-replay, scope-bound-apl-journal]
affects: [APL-05, APL-06, APL-07, APL-08]
key-files:
  created: [web/lib/apl-plan-journal.ts, web/lib/apl-plan-journal.test.mjs]
  modified: [web/lib/plan-decision.ts, web/lib/plan-decision.test.mjs, web/lib/server/plan-decision.ts, web/lib/server/plan-decision.test.mjs, web/app/api/planbeslut/underlag/route.ts, web/app/api/planbeslut/andra/route.ts]
---

# APL-04A – beslutskontrakt och återhämtning

Beslutsdelen och journalen är klara med 32 beslutsprov och nio journalprov, TypeScript och oxlint. Oberoende läsgranskning hittar inga blockerare. Samlad modell-/server-/journalregression passerar 89/89. Separat faktisk PostgreSQL-Worker-/serverparitet passerar 28 kontroller med fem observerade rollbackfall efter SQL-skrivning. Ingen aktiv databas, 3012 eller permanent installation har ändrats inom denna plan.

## Beslutskontrakt och äldre kvitton

`projectPlanDecision(value, expected, authority, command = null)` tar det fullständiga betrodda SQL-envelope från APL-03. `authority` är APL-04:s färska `AplProjectionAuthority`; `command` är hela strikta requesten vid mutation/replay. Läsning får inte använda replay. Legacy får endast väljas från `resultContract:'legacy'`, `replayed:true`, `aplBasis:null` och ett äldre raw-result som saknar både `contractVersion` och `apl`. Saknade fält i ett nytt svar ger aldrig fallback. Klientens kommando har inga versionsfält för att välja kontrollnivå.

| Transport | Form och verifiering |
| --- | --- |
| Nytt privat SQL-svar | `apl_decision_sql_v1`, `resultContract:'apl_decision_v1'`, exakt nytt raw-result och nullable fryst APL-basis |
| Äldre privat kvitto | Samma envelope med `resultContract:'legacy'`, `replayed:true`, `aplBasis:null`; raw-result förblir exakt lagrat innehåll |
| Nytt offentligt detail | `contractVersion:'apl_decision_v1'`, obligatoriskt `series` och `apl`; APL är null för programplan/annan profil |
| Äldre offentligt replay | Explicit `contractVersion:'legacy'`; inga APL-fält, nya checks eller serienamn injiceras |
| Nytt inbox/page-item | Obligatoriskt `series` och `apl:null\|{state,ready,blockers}`; befintliga task/count/filterformer kvarstår |

Bevarandet avser det lagrade DB-kvittot och privata råa result. Det offentliga äldre svaret får uttrycklig versionsmetadata och påstås därför inte vara byteidentiskt med föregångarens HTTP-payload. Äldre history utan `nameAtDecision` och resultat utan `series` förblir läsbara. Den uttryckliga legacyparsern kan inte anropas av en ny HTTP-request för att välja gamla regler.

En redan genomförd legacy submit/approve omklassificeras inte enligt nya APL-krav. Servern verifierar fortfarande den frysta katalogen, källidentiteten, timmatrisens struktur och den äldre checklistans form. Den lagrade presentationen och blockerlistan bevaras. Ny submit/approve kräver däremot både tidigare oberoende program-/poäng-/tim-/2028-kontroller och den kompletta aktuella APL-bevisningen. Fryst nytt replay verifieras med sitt lagrade underlag; dagens plan läses inte in som ersättning.

## Oberoende APL-kontroll före commit

För yrkestimplan krävs `apl` även om `apl.detail.plan` är null. Servern använder APL-04:s `projectAplFrozenRead` för full katalog/källa/timmatris, innehållshash, verkliga allokeringsgränser, programmetadata, skola, huvudman, perioder, kopieringsposter och roll-/statusbundna capabilities. Därefter binds beslutets source/catalog/hours samt plan-ID, skola, utbildning, version, revision, serie och status till exakt samma frysta underlag. Beslutets hours-array normaliseras till en rowKey-map före jämförelse med gymunderlagets hours-map; objektnycklarnas ordning får inte avgöra innehållslikhet.

Servern räknar om APL-blockerarna med den rena modellen och jämför den råa listan i exakt ordning. Den sista rektorshändelsen är aktuell endast när dess hash stämmer med aktuellt fryst innehåll; ID och `ready` måste stämma med samma kontroll. Saknad eller inaktuell bekräftelse ger samma uttryckliga meddelande som SQL. Aktiva draft/returned/submitted måste innehålla hela APL-listan som övergripande blockerarsuffix. Approved/replaced får inget sådant retroaktivt kompletteringskrav. Ett nytt approve med `apl.ready:false` stoppas även om det resulterande godkända råsvarets övergripande blockerlista är tom.

Råa nya blockerlistor tillåter dubbletter och högst 100 000 texter. Gränsen rymmer APL-modellens högst 100 perioder, 20 000 aktiva allokeringar, 200 innehållskopplingar per period, per-allokerings-/periodproblem och högst 4 950 periodpar. Rålistan jämförs före eventuell deduplicering av den övergripande offentliga presentationen. Den nästlade APL-listan förblir exakt. Legacyformens äldre gräns och unikhetskrav består.

`readPlanDecision(tx,input,authority)` och `commandPlanDecision(tx,input,authority)` behåller `{body,event}`. De två befintliga routes skickar nu färsk skyddad kontext vidare. Det är en avgränsad, nödvändig utökning av planens ursprungliga sex produkt-/testfiler, godkänd av samordnaren; ingen generell authz eller annan route ändras. Projektion och obligatorisk Worker-audit sker före transaktionscommit. Ett kontraktsfel ger `audit_unavailable` och en oberoende beslutsblockerare ger befintlig 409; felaktiga mutationer får inte committas.

## Genomförd verifiering av beslutsdelen

RED skrevs före produktändringen och bevaras privat i `/private/tmp/apl04a-decision-red.txt`. Slutkörningen för beslutsdelen `node --test lib/plan-decision.test.mjs lib/server/plan-decision.test.mjs` passerar **32/32** i `/private/tmp/apl04a-decision-full.txt`. `npx tsc --noEmit` och `npx oxlint app lib` passerar utan fel eller varning.

Proven omfattar de tidigare nationella programreglerna för samtliga tolv yrkesprogram, programplan före APL, SA-timplan, poäng-/timminimum, 2028-gräns, roll/MFA/CSRF/epochgränser, obligatorisk audit, legacy submit/approve-replay, förbjuden legacy-dispatch för läsning/nytt beslut, forcerat versionsfält, saknat APL, falsk hash/beredskap/capability/händelse, nytt approve utan rektorsbekräftelse, äldre return/withdraw och historiskt approved utan retroaktiv uppgift.

Två **var för sig giltiga** underlag med olika timmar respektive olika fryst källnamn avvisas när de kombineras. En allokering över celltotalen avvisas även med korrekt omräknad hash. Ett giltigt utkast med 100 perioder och fler än 100 duplicerade blockertexter läses och jämförs korrekt; borttagning av en enda rå blockerare avvisas. Nytt replay kontrollerar den frysta APL-bevisningen och kan inte gömma manipulation bakom replayflaggan.

Dessa serverprov använder riktiga routes, `protectedRoute`, parsers, katalogverifiering och domänprojektion, men kontrollerade doubles för DB/session/lagrad transaktion. Deras rollbackbevis gäller doublens återställning efter först registrerad mutation. Separat `verify-apl-plan-access.mjs` äger faktisk Worker-login, PostgreSQL-grants och SQL-rollback; slutrapporten `/private/tmp/apl-access-final.json` passerar 28 kontroller och verifierar 79 oförändrade källhashar. Den omfattar äldre namnlöst kvitto, BF/SA/programbeslut, installationsrollback av 65 tabeller och 337 ursprungliga syntetiska rader samt komplett cleanup. Se [APL-04:s exakta verifieringsnivå](05-APL-04-SUMMARY.md). OIDC och hela riktiga HTTP-flödet på körande Worker ingår inte i dessa Node-prov.

## Återhämtningsjournal

`apl-plan-journal.ts` binder varje försök till stabil hash av issuer/subject, kund, medlemskap, uppdrag, huvudman, skola, exakt plan-ID/version och skrivande roll. MFA-/sessionsepok ingår inte, så legitim omladdning eller förnyad MFA behåller försöket. Detta är klientens återhämtningsdata, aldrig serverns behörighetsbevis; varje serveranrop kontrollerar färskt mandat.

`createAplJournal` och `parseAplJournal` validerar hela requesten och en separat hash över normaliserat scope och exakt kommando. Arrayordning bevaras till skillnad från APL:s semantiska innehållshash. Ändrat CAS, payload, commandId eller ordning kan inte återanvända den sparade requesthashen. `persistAplJournal` vägrar ersätta ett annat pending-försök och kräver exakt read-back. Anroparen ska använda **sessionStorage** och invänta persistens före nätmutationen. Lagringsfel stoppar mutation. `removeAplJournal` tar endast bort samma verifierade försök, aldrig annan lagring.

`recoverAplJournal` kräver exakt requestbundet statuskvitto och färsk läsning. `retry_exact` gäller endast not_found med oförändrat CAS och aktuell capability; rektorsbekräftelse kräver dessutom samma innehållshash. `needs_review` ändrar aldrig gamla requesten. Ett kvitto som följts av nyare plan ger `completed_historical`, behåller det historiska resultatet och kräver omläsning. Även `completed_current` kräver färsk gym-/APL-läsning i UI; kvittots snapshot får inte bli ny redigeringskälla. Scope måste byggas från verifierad session och gymplan, vars skola/version inte finns direkt i APL-read-svaret.

Nio Node-prov täcker omladdning/MFA, samtliga nio scopefält, ändrad request/ordning, lagringsfel och utebliven read-back före mutation, främmande eller trasig lagring, getteravvisning, villkorad borttagning, förlorat svar, historisk framgång efter innehålls-/statusändring, not_found med ändrat CAS/mandat och felaktiga kvitton. `node --test lib/apl-plan.test.mjs lib/apl-plan-journal.test.mjs lib/plan-decision.test.mjs lib/server/apl-plan.test.mjs lib/server/plan-decision.test.mjs` passerar **89/89**; privat logg `/private/tmp/apl04-root-tests.txt`. Typkontroll och riktad journallint passerar. Journalens faktiska browserintegration verifieras i 05 och 08.

## UI-handoff och kvarstående integration

Ingen osäker fallback behålls för gamla UI-mockar. Vid inventering finns detaljer eller inkorgsobjekt som behöver explicit nytt kontrakt i `web/e2e/usability.spec.ts`, `programplan-copy.spec.ts`, `class-cohort.spec.ts` och `named-planning-overview.spec.ts`. `named-timplans.spec.ts` och `operational-class-timplan.spec.ts` berör samma endpointområde men de observerade svaren är tom inkorg respektive avsiktligt fel och behöver bedömas i sina fulla scenarier. Samordnaren/APL-05/06 äger dessa fixtures. Inga TypeScript-fel utanför planens filer uppstod efter kontraktsändringen. Faktiska UI-/telefonflöden återstår.

SS 12000:2024 utgåva 4/OpenAPI 2.1.0 beaktas enligt APL-kontraktet genom bevarade stabila skol-/huvudmanna-/plan-ID:n och tydligt fryst källansvar. Inga klass-/läsårslänkar, placeringar, elevrelationer eller externa objekt ändras. Detta är intern planering och versionssäker verifiering, inte en verifierad extern SS 12000-anslutning.
