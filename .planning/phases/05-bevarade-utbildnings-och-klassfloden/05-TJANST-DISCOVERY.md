# Tjänstefördelning, avtal och bedömning — aktuell kodinventering

**Datum:** 2026-10-16. **Status:** underlag för GSD-planering; ingen produktkod, migration eller verklig anslutning är genomförd i detta steg.

Inventeringen utgår från `.planning/codebase/ARCHITECTURE.md` och `CONVENTIONS.md` men verifierar berörda källfiler i dagens arbetskopia. Kodkartan är från 2026-09-11: dess uppgifter om klientcentrerad administration och enda API-routen är historiska. Dagens skyddade administration har ett server-/Worker-/SQL-lager. `.planning/PROJECT.md`, `.planning/STATE.md`, lärartidsresearchen och befintlig tjänstefördelningstodo är lästa. Pågående APL-arbete ändras inte.

Senaste användarbeslut styr: **rektor fastställer tjänstefördelningen och huvudmannen följer upp**. Huvudmannen ska kunna välja **olika kollektivavtal**. Den äldre tjänstetodons huvudmannagodkännande är därmed inte en tillämplig beslutsregel för detta paket. Program-/timplanernas befintliga beslutskedja är en annan domän och består.

## 1. Återanvändbar grund och verkliga luckor

| Område | Verifierad kod | Konsekvens för planen |
| --- | --- | --- |
| Inloggningsidentitet | `supabase/migrations/20260913100000_phase2_worker_core.sql`: `identities` med unik `(issuer, subject)`, `memberships` med kund, status och unik `(identity_id, customer_id)`. | Kontot är inte en fullständig personal-/anställningspost. Ny personalidentitet ska kunna finnas före inloggning, men egen åtkomst kräver en uttryckligt verifierad bindning. Namn, e-post och lärarsignatur är inga åtkomstbevis. |
| Äldre personalankare | `20260905120000_huvudman.sql`: `assignments` har namn, roll, huvudman och valfri legacyprofil; `assignment_units` listar skolor. | Saknar anställningsperiod, omfattning, avtal, årsram, käll-ID och egen bedömning. Återanvänd stabil länk där den finns; behandla inte tabellen som färdig anställningsmodell. |
| Bindning konto–personalankare | `20260922120000_phase3_staff_bindings.sql`: `staff_assignment_bindings`, `phase3_staff_binding_is_valid`. | Bevara bindningen till medlemskap, kund, huvudman och roll. Nya personalobjekt behöver egen kontrollerad koppling till denna kedja; en medskickad `staffPersonId` får aldrig ge egen åtkomst. |
| Aktuella mandat | `web/lib/mandate-policy.ts`: `shape`, `delegable`, `inScope`, `decideMandate`; SQL `phase3_actor`, `phase3_mandate_is_valid`. | Behörighet till kund/skola, giltigheter och föräldramandat ska prövas vid varje personaloperation. Huvudmannens avtalsförvaltning, rektors beslut och lärarens egen läsning är skilda operationer. |
| Årsunderlag | `web/lib/planning-year-contract.ts`: `PlanningRow`, `PlanningPlanReference`, `PlanningClassReference`, `planningAnnualMetrics`; `planning-year-model.ts`: `projectGymYear`, `projectGrYear`, `projectImYear`. | Exakta skol-/års-/plan-/klassreferenser och okänt kontra noll kan återanvändas. `PlanningOverviewTotals` är uttryckligen ramstimmar, inte bemanningsbehov eller lärartid. |
| Namngivna timplaner | `web/lib/named-timplan.ts`, migrationerna `20261015200000`–`20261015204000`. | Behov ska referera till exakt serie och version. Namnbyte ändrar presentation; det får inte sammanföra två självständiga timplaner. |
| Klasser och koppling | `web/lib/class-cohort.ts`, `web/lib/class-timplan.ts`; `school_classes`, `class_timplans`; migrationerna `20261015100000`–`20261015102000`. | Använd klass-ID och exakt årskoppling. Klassen är skild från undervisningsgrupp och faktisk elevmedlemskap. Legacy med okänd giltighet får inte bli verifierat behov. |
| Planbeslut | `web/lib/plan-decision.ts`: `PlanDecisionKind`, `PlanDecisionCommand`; `web/lib/server/plan-decision.ts`; `20261015202000_named_timplan_decisions.sql`. | Revision, underlagshash och historik är användbara mönster. Nuvarande kontrakt är hårdkodat till programplan/timplan och `submit/return/approve/withdraw`; skapa eget tjänstebeslut med rektor som beslutsfattare. |
| Exempelschema | `web/lib/admin-model.ts`: `Group.teacher`, `Slot.teacher`, stränglistan `teachers`; `web/app/page.tsx`, `workspace-views.tsx`. | Inga skyddade personal-ID:n, avtalsramar eller faktisk tid kan härledas ur detta. Det är inte en produktionsgrund för tjänstefördelning. |

Ingen skyddad avtalskatalog, arbetstidsbudget, individuell tjänstebedömning, personalårsplan eller tjänsteuppföljning har hittats. Avtalsval kan inte implementeras som en till etikett på `assignments`.

## 2. Lärarens egen tjänst före undervisningsgrupper

### Hindret i dagens kod

`web/lib/mandate-policy.ts:shape` kräver `function='larare'`, `scopeKind='group'` och minst en undervisnings-/mentorgrupp. Samma formregel finns i den senaste `phase3_mandate_shape` i `20260927090000_phase3_support_groups.sql`. `phase3_scope_kind` tillåter endast school/group/pupil/case. En ny lärare utan elevgrupp saknar alltså giltigt lärarmandat även om anställningen och tjänsteplanen finns.

Ge inte läraren skolscope för att lösa detta: `phase4_scope` ger skolscope bred elevläsning. Skapa inte heller en fiktiv grupp, och öppna inte en ny personalväg enbart på inloggat medlemskap utan mandat. Den senare varianten skulle behöva en separat sessions- och återkallelsemotor.

### Rekommenderad minsta utökning

Inför **`larare` med `scopeKind='self'`** för den egna tjänsten. Behåll befintligt `group`-mandat oförändrat. Self har minst en faktiskt tilldelad skola, samma rektor→lärare-kedja och personalbindning, men **noll grupper, elever och ärenden**. Endast lärarrollen får self. En tjänsteplansrad eller samläsningsrelation ger aldrig i sig elevåtkomst.

Egen läsning, dialog/kommentar och lärarinitierat ärende ska härleda målpersonen från aktuell session → medlemskap → verifierad personalbindning i den låsta transaktionen. Klientens person-ID får högst vara ett extra likhetsvillkor. Gruppmandat kan också läsa samma egen tjänst via denna bindning, utan att relationen till elever utvidgas. Rektorn kan bereda ett personalobjekt utan lärarkonto; lärardialog markeras då som ännu inte tillgänglig, inte som genomförd.

| Del | Konkreta ändringspunkter |
| --- | --- |
| Ren mandatmodell | `web/lib/mandate-policy.ts`: utöka `MandateScope`, strikt `shape` för self, särskilt avslag för `pupil.*` och avgränsat egen-tjänstbeslut med serverladdad personidentitet. `inScope` får inte låta self falla igenom som case/skola. Lägg kontraktsprov i `mandate-policy.test.mjs`. |
| Mutationsparser | `web/lib/server/mandates.ts:parseMandatePayload`: godta self endast för lärare, kräva skolurval och tomma groups/pupilIds/caseIds; serverns bindningskontroll är fortsatt avgörande. `mandates.test.mjs` provar förbjudna kombinationer. |
| SQL-form och personalbindning | **Ny migration**, inte ändring av tillämpade migrationer: ersätt `phase3_scope_kind`; ersätt senaste `phase3_mandate_shape`; koppla ny personbindning till `staff_assignment_bindings`. `phase3_insert_mandate` finns senast i `20260929140000_phase4_register_reads.sql` och skapar personalankare för rektor/lärare. Kontrollera dess nya self-gren och atomär bindning uttryckligen. `phase3_staff_binding_is_valid`, `phase3_mandate_is_valid` och föräldrakontroll ska behålla kund-/skol-/tidsvillkor. |
| Tilldelningsgränssnitt | `web/app/mandate-grant-dialog.tsx`: `Scope`, `scopeText`, `scopesFor`, skolurval och payload. `web/app/mandate-workspace.tsx`: self-typ och verksamhetstext, exempelvis ”Egen tjänst”. Ingen automatisk omvandling av gamla gruppmandat. |
| Sessionspresentation | `web/lib/access-rules.ts:AssignmentView`, `web/app/api/session/route.ts` (`a.scope_kind`, `view`, valt context), `web/app/api/context/route.ts` (låst SQL och context-svar), `web/app/context-switch.tsx:ActiveContext`. Serverläst scope/capability måste följa kontextbyte och återläsning. |
| Tidigt API-nekande | Om API-gränsen använder scope: läs `scope_kind` från låst uppdrag i `web/lib/server/db.ts:withSessionContext`, bär det i `LiveSession`/`Context` och neka self i gemensamt elev-API-skydd. Kopiera inte scope från klientheader eller tidigare sessionssvar. `server/session.ts` behöver ingen separat autentiseringsmodell; eventuell typförändring ska följas genom dess kontextkonstruktioner. |
| Skyddad navigering | `web/app/protected-home.tsx`: dagens `PUPIL_FUNCTIONS` och `startView` visar Elever för alla lärare. Self ska starta i egen tjänst och inte montera elevregistret, inte ens via `?vy=elever`, gammal URL, Back eller cache. För gruppmandat består nuvarande elevfunktioner. |

### Elevvägar måste uttryckligen vara stängda

`phase4_scope` i `20260929140000_phase4_register_reads.sql` ger redan false för okänt/self-scope. **Det räcker inte:** `phase4_list_pupils` kan fortfarande returnera klass-/utbildningsalternativ även med tomma elevrader, och `phase4_register_selection` lämnar skol-/årsmetadata. Lägg ett uttryckligt self-nekande innan dessa läsningar.

Inventera och prova den aktuella kedjan:

- `phase3_probe_scope` — senaste definition i `20260929140000_phase4_register_reads.sql`; återanvänds av registerurvalet.
- `phase4_register_selection` — `20260929161000_phase4_register_selection.sql`.
- `phase4_list_pupils` — senaste definition i `20260929180000_phase4_list_protected_flag.sql`, inklusive listans options.
- `phase4_projection`, `phase4_card_row`, `phase4_pupil_card` och `phase4_scope` — `20260929140000_phase4_register_reads.sql`. Self ska inte kunna nå en elev genom direkt UUID.
- `web/app/api/elever/{urval,lista,elev,historik,personnummer,export,andra}/route.ts` och `web/lib/server/pupil-register.ts`. Ändring/historik/personnummer/export har redan administratörsfilter, men ingår i negativa regressioner. Källkonflikt- och skyddad-identitetvägar ska också förbli nekade.
- `phase3_read_pupils` är avvecklad genom `20260930100000_phase4_retire_probe.sql`; den ska inte återinföras.

Prova som riktig Workerroll och via API/OIDC: self ser egen tjänst utan grupp; annan person och annan kund nekas; alla elevrutter och metadataentrypoints nekas; gamla gruppmandat behåller exakt sin gamla elevomfattning; self med insmugen grupp/elev/case/annat rollnamn nekas; rektors-/lärarmandat återkallas under låsväntan; konto spärras; sammanfallande namn eller e-post påverkar inte bindningen. Lärarinitiativ ska binda faktisk läraridentitet, aldrig rektorns attest av en kryssruta.

Rekommenderad avgränsning för genomförande: separat kontrakts-/policyplan, därefter sammanhängande SQL-plan med self/personbindning/elevnekan och sedan verkliga Worker-/session-/elevregressioner **före** att egen-tjänstvyn aktiveras. Undvik en mellanleverans där self blir giltigt men metadataentrypoints ännu är öppna.

## 3. Behov från timplan till tjänsterad

`PlanningRow` skiljer `class-bound`, `planning`, `forecast` och `missing`; måtten har `known`, `complete` och nullable `value`. Behåll dessa skillnader i tjänsteunderlaget. En timplanssumma som saknar klass-/grupporganisation är inte automatiskt ett lärarbehov. IM redovisar timmar per vecka och kan innehålla praktik/mentorskap; dessa värden kan inte multipliceras med ett godtyckligt veckotal eller klassificeras som undervisning.

Nytt behovsobjekt behöver minst kund, skola, läsår, giltighetsintervall, klass-ID eller uttryckligt planerad grupp, timplansserie-ID/plan-ID/version/revision, klasskopplingsrevision, kanonisk ämnes-/nivårad, termin och mängd med enhet. Nivå-/kursidentifiering ska följa den frysta källan; sökbar benämning är ingen radidentitet. Nuvarande stödda gymnasieflöde kan vara första konkreta leverans, medan övriga skolformer visas som ej stödda eller ofullständiga — inte med felaktiga årsbehov.

`school_classes` och `pupil_class_memberships` är riktiga registerobjekt. En **planerad undervisningsgrupp** behövs ändå för delning, samläsning och grupper från flera klasser. Den ska ha egen stabil identitet och giltighet; faktisk elevmedlemskap är ett separat framtida kontrakt. Att välja hela klassen som planeringsunderlag får inte ändra elevplacering eller gruppmandat.

Skilj minst tre mängder: elevens undervisningsbehov, aktivitetens gemensamma undervisningstid och varje lärares avsatta tid. Exempel: två klasser samläser 60 minuter med en lärare → varje klass får 60 minuter och läraren 60. Två lärare samtidigt → varje lärare får sin egen 60-minutersresurs. Delvis samläsning måste ha uttryckliga överlappande perioder/mängder; dra inte av hela årsbehovet för att en relation finns. Deltagandeandelen i aktiviteten är inte anställningsprocenten.

Varje uppgift får en budgetidentitet som framtida schema och utfall kan hänvisa till. Mentorskap och planering budgeteras en gång; framtida kalenderplacering förbrukar/förlägger budgeten och läggs inte ovanpå den. Visa ännu inget verifierat schemaandelstal när skyddat schema saknas. APL:s elevtid ska kunna vara källmarkering i behovet men får inte skapa lika mycket lärartid; besök, handledarkontakt och uppföljning är egna läraruppgifter.

## 4. Nya objekt och ansvar

Föreslagna domänobjekt, inte befintliga tabeller:

| Objekt | Ansvar och viktig gräns |
| --- | --- |
| Personalperson och verifierad kontobindning | Stabil kund-/huvudmansidentitet med externa käll-ID:n, inga personnummer i tjänsterader. Skild från inloggningskonto och åtkomstmandat. |
| Anställning och period | Person, giltighet, omfattning och anställningsform. Samma person kan ha flera perioder/anställningar; överlapp måste bedömas, inte döljas av senaste rad. |
| Avtalskatalog/version och huvudmannens urval | Flera centrala avtal kan väljas av huvudmannen. Avtalsval och lokal överenskommelse har separat källa, period och granskningsstatus. Ett huvudmannaval får inte skriva om varje anställnings faktiska avtalsgrund. |
| Individuell avtals-/tidsgrund | Exakt avtalsversion, lokal avvikelse, arbetstidsform, individuell total/reglerad/förtroenderam och beräkningsunderlag per period. En kollektiv genomsnittstid är inte automatiskt individens årsram. |
| Skoluppdrag och kapacitetsandel | Vilken del av anställningen som används på respektive skola under perioden. Delad lärare kräver gemensam kapacitetskontroll men ger inte rektor tillgång till andra skolors individmotiveringar. |
| Tjänsteplan med revisionsrad | Skola/läsår, behov, planerade undervisningsgrupper, lärartilldelning, specialuppdrag och budget per uppgift/tidsform. Arbetsuppgift och reglerad/förtroendetid är två dimensioner. |
| Individuell bedömning | Källrevisioner, kategori, faktisk undervisningsprofil, bedömningsfaktorer, individuellt tak, planeringsbehov, mentorskap, motivering, dialog och omprövningsorsak. Förordningsprofil är skild från avtal. |
| Rektorsbeslut och lärarsynlig version | Fastställandet binder exakt tjänste-/avtals-/behovs-/bedömningsunderlag. Huvudman följer upp utan approve-knapp. Ny revision ändrar inte vad tidigare beslut omfattade. |
| Undantagsärende | Laggrund, tillämpligt intervall och underlag, initiativets verkliga aktör, beslut, påverkan och uppföljning. Kalenderns framtida lärarundantag är ett annat objekt. |

Ändringar i grupper, timmar, omfattning, avtalsversion eller bedömningsprofil ska göra beroende bedömning inaktuell. De ska inte tyst skriva om gamla beslut eller nollställa tiden. Koppling till behörighetsunderlag ska bära källversion och ”okänt/ej kontrollerat”; detta paket får inte påstå att Skolverkets lärarregister är anslutet.

## 5. SQL-, API- och sparprotokoll

`web/lib/server/db.ts:withSessionContext` tar sessionsradlås, härleder kund från eget medlemskap, tar `phase3_lock_customer`, låser medlemskap och läser aktuell uppdragsgiltighet innan transaktionslokal kontext sätts. `protectedRoute` i `authz.ts` kontrollerar kontextepoch, roll, eventuell MFA och obligatorisk säkerhetshändelse före commit och svar. Detta ska återanvändas; nya personalvägar får inte anropa demologin eller klientens direkt-Supabase-lager.

`phase5_programplan_session_check` och `phase5_programplan_actor` i `20260930162000_phase5_programplan_drafts.sql` visar sessionskontroll före kundlås och omprövning efter låsväntan. De är dock låsta till programplan/rektor/huvudman; nya personaloperationer behöver motsvarande domänspecifika kontroll, inklusive lärarens self. Planera låsordning gemensamt för person, anställningsperiod, skola, behov, tjänsteplan och kommando så att samtidiga skolor inte båda reserverar samma kapacitet.

Praktiska befintliga mönster:

- `20261015102000_class_cohort_commands.sql`: sluten begäransform, kommando-ID, egen kommandojournal, underlagstoken, statusläsning, återspelning och obligatorisk audit. Matcha **hela** begäran, identitet och uppdrag vid återspelning.
- `20261015201000_named_timplan_commands.sql`: förväntad revision, lås av käll-/målobjekt, atomär skapning/namnbyte och sparat svar. Samma ID med ändrat innehåll ska vara konflikt.
- `20261015202000_named_timplan_decisions.sql`: underlagshash och separata plan-/beslutsrevisioner; beslutet sparar historik och exakt grund. Tjänstebeslut återanvänder principen, inte huvudmannagodkännandet.
- `20261015204000_worker_named_timplans.sql`: uttrycklig Worker-grant för få public entrypoints. Interna hjälpare och tabeller förblir stängda; verifiera faktisk ACL och direkt SQL-anrop.
- `web/lib/server/class-cohort.ts`, `server/planning-year.ts`: strikt svarskontroll, 409 för konflikt, auditfel utan data, återkontroll av skolscope i samma transaktion.
- `web/lib/named-timplan-journal.ts`, `web/lib/unsaved-changes.tsx`, `web/app/planning-context.tsx`: okänt sparresultat och navigation måste hanteras. Personalmotiveringar ska inte okritiskt läggas i webbläsarens beständiga journal; håll minsta nödvändiga request-ID/referenser och återläs serverstatus.

Tjänstebedömningens fria text är verksamhetsdata. Audit ska innehålla tillåtna tekniska referenser/åtgärder och resultat, inte hela motiveringen eller känsliga individuella orsaker. Huvudmannens uppföljning behöver en särskild fältprojektion; roller får inte automatiskt dela samma JSON-svar.

## 6. Kopiering, massändring och årsbyte

`20261014100000_phase5_atomic_cohort_copy.sql` införde atomärt källbundet kopiekommando och statuskvitto; **senaste** `phase5_copy_programplan_education` finns i `20261016100000_rector_programplan_creation.sql`. Det kopierar utbildnings-/programgrund till nästa kull med aktuellt skolmandat. Det är inte kopiering av personalårsplan.

Tjänsteplanens årsbyte ska därför vara en egen operation: förhandsgranskning av förra årets uppgifter mot nästa års exakta klasser/timplaner, aktuella anställningar, avtal, skolandelar och kapacitet. Kopiera som utkast med nya radidentiteter och källproveniens. Beslut, lärarinitiativ, kvittenser, gamla giltigheter och bedömningens godkända status ska inte automatiskt följa med. Ofullständig mappning ska visas före commit.

Flytt mellan personer måste atomärt frigöra/tilldela rätt budget och göra berörda bedömningar inaktuella. Massregistrering ska ge avgränsad förhandsgranskning och radfel utan oavsiktlig delskrivning. En timeout kräver statusläsning av samma kommando, inte ett nytt kommando-ID. Klass-/programkullkopiering ska fortsatt bevaras utan personalkopia som sidoeffekt.

## 7. Skyddade vyer och verifieringsyta

`web/app/protected-home.tsx` har idag vyunion utan tjänster/avtal. `PlanningSelection.view` tillåter bara programplan/timplan. Utöka inte genom typcasts: välj en uttrycklig tjänstekontext med samma verifierade skola/läsår och separata registerval. `planning-context.tsx` hanterar scoped cache, generationskontroll, uppdragsbyte, Back och okänt sparande; dessa beteenden behöver följa med till ny vy.

Huvudmannen behöver avtalsurval och en sammanställd uppföljningsbild. Rektor behöver behov → personer → hela uppdraget → individuell bedömning → fastställande, med direkt länk till avvikelsens orsak. Läraren behöver en egen projektion av aktuell tillgänglig version, dokumenterad dialog och eget initiativ. Dessa är separata fält-/operationskontrakt även om samma lagrade plan används.

Planernas kontroller ska omfatta rena modellfall, verkliga SQL-prov med Workerroll, riktiga HTTP/API-prov, samtidighet/återkallelse, okända skrivutfall och dator-/telefonflöde. Befintliga relevanta mönster finns i `supabase/tests/phase3_policy.test.sql`, `phase3_matrix.test.sql`, `phase4_selection.test.sql`, `work/pilot/verify-mandates.mjs`, `verify-mandate-locks.mjs`, `verify-class-cohort-commands.mjs`, `verify-named-timplans-api.mjs` och tillhörande browserscenarier. Deras tidigare PASS är ingen verifiering av den nya modulen.

Vid genomförande: `node --test lib/*.test.mjs`, relevanta servertester, `npx tsc --noEmit`, `npx oxlint app lib`, `npm run build`, isolerade SQL/API/browserprov efter förändringens omfattning. Lägg till användarinstruktioner för avtal, tjänstefördelning och bedömning och uppdatera vid behov `docs/handbok/mandat.md`, `planering.md` och `regler.md`; kör `npm run docs:build`. Tekniska kontrakt hör i interna dokument.

## 8. SS 12000 och gränser

Specifikationsbasen i den redan granskade researchen är **SS 12000:2024 utgåva 4, officiell OpenAPI 2.1.0**. Den här inventeringen är kod-/modellanalys; den gör ingen ny anslutnings- eller standardefterlevnadsverifiering.

- Person → `Person`; kundens interna personal-ID och externa käll-ID:n hålls isär och återanvänds över avtal/år. Inloggningsidentitet är inte automatiskt standardens Person-ID.
- Skola → `Organisation`; anställnings-/skoluppdrag → avsedd mappning till `Duty` med person, `dutyAt`, `dutyPercent`, `hoursPerYear` och giltigheter. Duty är inte ett lokalt åtkomstmandat.
- Klass och planerad undervisningsgrupp → `Group` med rätt kategori och giltighet; planerad grupp, faktiskt medlemskap och lokal elevåtkomst hålls isär.
- Undervisningsbehov/aktivitet och lärartilldelning → avsedd `Activity`/`DutyAssignment`; aktivitetens och varje lärares `minutesPlanned` är skilda mått.
- Mentorsrelation kan motsvara `Duty.assignmentRole` med Mentor, grupp och period. Mentorsbudget/bedömningsskäl är egna objekt.
- Avtal, lokal överenskommelse, individuell bedömning, rektorsbeslut och rättsligt undantag har egna domänobjekt; ingen verifierad direkt standardrepresentation påstås.
- `CalendarEvent`, lärarens respektive elevens undervisningslängd, lärarundantag och faktisk uppföljning är senare kontrakt. Inget kalenderobjekt bevisar i sig att arbetet genomförts.

Fastställ källa och skrivansvar per fält samt beteende vid ändrade externa ID:n, rättelse, borttag, återimport och källkonflikt. Import ska inte ändra avtalsgrund eller rektorsbeslut tyst. Faktisk integration kräver senare separat kontraktsprov mot motpartens stödda objekt, versioner och enheter.

## 9. Viktigaste risker inför genomförande

1. Giltigt self-mandat öppnas innan elevmetadata stängts: leverera den säkerhetsändringen sammanhängande och prova direkt SQL, HTTP och gamla gruppmandat.
2. Person, konto, anställning, skoluppdrag och åtkomstmandat blandas ihop: modellera och testa separata identiteter/giltigheter innan UI byggs.
3. Huvudmannens avtalsval blir en global obligatorisk avtalsram: bind faktisk version och eventuell lokal överenskommelse per anställningsperiod.
4. Rektors beslut råkar ärva huvudmannens approve från programplan: tjänster behöver eget tillstånds-/beslutskontrakt enligt användarbeslutet.
5. Planramstimmar behandlas som personalbehov, eller APL och samläsning räknas dubbelt: explicit behov/aktivitet/lärarbudget med exakta källor och mängder.
6. Delad person får två fulla kapaciteter på två skolor: gemensam person-/periodkontroll under lås med begränsad fältåtkomst.
7. Årsbyte kopierar gamla avtal, godkännanden eller lärarinitiativ: ny granskningsbar utkastkopia med omprövning och atomärt kvitto.
8. Äldre avtalsversion eller framtida regler behandlas som gällande: regel-/avtalsstatus och giltighetsintervall måste vara beslutets frysta underlag. Researchens juridiska frågor och produktionsgranskning är inte lösta av tekniska tester.

**Utfall:** aktuell implementation ger återanvändbara säkerhets-, års-, versions- och kvittomönster. Personal-/avtals-/tjänsteobjekt och de nya användarflödena återstår. Ingen appbyggnad eller databasändring har körts för denna dokumentinventering.
