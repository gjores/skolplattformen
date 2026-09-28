# Fas 4: Beständigt och skyddat elevregister – research

**Undersökt:** 2026-09-28
**Område:** PostgreSQL-datamodell med datumperioder (Supabase lokalt, PG 17.6), SQL-styrd behörighet och fältprojektion, Worker-API med obligatorisk logg, React-vyer i den skyddade arbetsytan, provgrind.
**Samlad tillförlitlighet:** HÖG för kodens nuläge och återanvändbara mönster (lästa filer, citerade rader). MEDEL för föreslagen datamodell och API-form (bygger på verifierade PG-funktioner och befintliga mönster men är ännu inte prövade här). LÅG/ANTAGET där det står `[ASSUMED]`.

Ingen databas har skrivits till och ingen kod har ändrats under researchen. Två skrivskyddade frågor kördes mot den lokala protected-databasen (version, tillgängliga tillägg, antal migrationer och provrader).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Elevens uppgifter och skyddad identitet
- **D-01:** Basuppgifterna är **minimala**: namn, personnummer (syntetiskt) och därur födelsedatum, hemkommun, skolplacering, klass, utbildning och status. Inga kontaktuppgifter, adresser eller vårdnadshavare i fas 4.
- **D-02:** Personnummer lagras. Administratör ser födelsedatum i listor och **hela numret endast i elevkortet på uttrycklig begäran**; varje sådan visning loggas som egen händelse. Lärare och övriga utan administrativt mandat ser aldrig personnummer eller födelsedatum. — **Reversibility:** costly — rationale: fältbehörighet per funktion påverkar SQL-policy, API-projektion, export och loggtyper.
- **D-03:** Elev med **skyddade personuppgifter**: namn och personnummer visas endast för administratör med uttrycklig behörighet på elevens placeringsskola. Övriga med mandat (t.ex. lärare i gruppen) ser ett anonymt visningsnamn; eleven förekommer inte i sökträffar för den som inte får se uppgifterna. Skyddad elev ingår inte i export utan uttryckligt val av den som får se uppgifterna. Varje visning av skyddad uppgift loggas. Fel, aviseringar, räknare och metadata får inte röja att en skyddad elev finns (DATA-01).

#### Placering, klasshistorik och läsår
- **D-04:** Eleven har **exakt en aktiv skolplacering per datum** (skola + utbildning + startdatum, valfritt slutdatum). Framtida placeringar kan läggas in i förväg; avslutade bevaras som historik. Skolbyte = avsluta den ena och starta en ny. — **Reversibility:** costly — rationale: placeringsmodellen är grund för behörighetsomfattning, läsårslista och framtida fakturering.
- **D-05:** **Klassbyte** skapar en ny daterad klasstillhörighet; den föregående får slutdatum och historiken bevaras. Utbildningen byts inte automatiskt. Hör nya klassen till en annan utbildning visas en varning, och utbildningsbyte kräver ett separat, uttryckligt beslut (STU-03).
- **D-06:** **Hemkommun** lagras som daterad uppgift (kommunkod, giltighetsperiod, ursprung). Flytt mitt i läsåret ger en ny period. Tillsammans med placeringsperioderna är detta underlaget för framtida fakturering.
- **D-07:** **Läsårsväljare i sidhuvudet** (`‹ 26/27 ›`) för den skyddade miljön som styr elevlistan: vilka elever som är placerade det valda läsåret. Årskurs härleds ur utbildningens startår (`åk = läsår − startår + 1`); utbildningar får startår som heltal. Läsårsstatus/lås, Aktuella/Framtida/Arkiverade-flikar och terminskolumner i timplanen ingår **inte** i fas 4.

#### Källa, rättelse och konflikter
- **D-08:** I piloten **äger appen** elevuppgifterna. Varje fält bär ursprung (i fas 4 "manuell i appen", med aktör och tid). Modellen har plats för en extern källa per fält (SS 12000, SPAR) så att fas 7 kan göra fält registerägda utan omarbetning. — **Reversibility:** costly — rationale: källmärkning per fält är ett datakontrakt som import, historik och konfliktregel bygger på.
- **D-09:** När en extern källa senare levererar ett annat värde än en **lokal rättelse** skrivs rättelsen aldrig tyst över. Eleven får en synlig avvikelse där administratören väljer mellan lokal rättelse och källans värde. Regeln byggs i fas 4 och prövas med en simulerad källa (STU-04).
- **D-10:** **Samtidig ändring**: sparningen nekas med besked om vem som ändrade och när; administratören ser sitt och det nyare värdet per ändrat fält och väljer vad som ska gälla. Inget skrivs över tyst (STU-06).
- **D-11:** **Historik** per elev och fält i elevkortet för administratör: vad, från/till, vem, när, källa. Skyddade uppgifter visas i historiken endast för den som får se dem. Säkerhetsloggen får motsvarande händelser **utan** värden.

#### Sökning, urval och export
- **D-12:** Elevlistan styrs av valt läsår och skola, med sökfält (namn; för administratör även födelsedatum/personnummer) och filter på klass, utbildning, årskurs och status. **Servern** avgör vilka elever som förekommer utifrån mandatet; ingen större lista filtreras i webbläsaren.
- **D-13:** Namnlika elever skiljs åt med **födelsedatum + klass + skola** i träffar. Lärare, som inte ser födelsedatum, ser klass.
- **D-14:** **Urvalet i adressen**: läsår, skola och filter ligger i sidans adress så att bakåtknappen och omladdning ger samma lista; rensas vid byte av uppdrag. *Precisering från orkestratorn:* fritextsökordet (som kan vara ett namn eller personnummer) läggs **inte** i adressen — adresser hamnar i webbläsarhistorik och åtkomstloggar. Sökordet hålls i flikens sessionstillstånd och rensas vid kontextbyte/utloggning.
- **D-15:** **Export**: administratören väljer fält ur de mandatet tillåter. Personnummer kräver uttryckligt val och loggas som egen typ. Skyddade elever utelämnas om de inte uttryckligen väljs av den som får se dem. Servern prövar mandat, spärrar, skydd och fält även vid direktanrop, och exporten loggas (DATA-02).

#### Fakturering till hemkommuner
- **D-16:** Användaren vill ha fakturering till hemkommuner. Den är en **ny förmåga utanför fas 4**; fas 4 levererar bara underlaget (D-04, D-06). Fakturering blir egen todo/fas.

#### Redan beslutade ramar (från tidigare faser)
- Mandaten från fas 3 styr all elevåtkomst: lärare egna undervisnings-/mentorsgrupper, skoladministratör tilldelade skolor, huvudman ingen elevinsyn utan separat uppdrag, elevhälsa skola/elev/ärende enligt uppdrag, tidsbegränsad support en elev eller grupper på en skola i högst 60 min, IT ingen elevinsyn.
- Loggpolicyn från fas 3: läsning, ändring, export, behörighetsändring och nekande loggas med aktör, faktiskt uppdrag, tid, objekt och resultat, **innan** svaret lämnas; loggfel ger inget innehåll och ingen ändring. Loggen innehåller inga elevuppgifter eller anteckningar.
- Engångskod vid inloggning för konton med registrerad kod (2026-09-27); administrativa ändringar kräver giltigt bevis (8 h).
- Endast syntetiska uppgifter; medicinska elevhälsojournaler ingår inte; ingen verklig kommun- eller registeranslutning.
- Docusaurus-handboken innehåller endast användarinstruktioner och regler (beslut 2026-09-23); tekniska kontrakt i `docs/pilot/`.

### Claude's Discretion
- Tabell-/vymodell för elev, placering, klasstillhörighet, hemkommunsperiod och fältursprung; hur fas 3:s `mandate_pupils`/syntetiska elevprov migreras eller ersätts utan att bryta verifierade fas 3-bevis.
- Versionsmekanism för konflikter (radversion, per-fält-version) och exakt konfliktvy.
- Maskeringsformat för födelsedatum/personnummer i listor; syntetiska personnummer ska följa Skatteverkets testpersonnummer eller tydligt fiktivt format.
- Sidindelning och prestanda för elevlistan.
- Hur den simulerade externa källan för D-09 byggs (fixtur/skript), så länge den tydligt är syntetisk.

### Folded Todos
- **Läsårslins: ställa sig i ett läsår som i Plan Digital** — vikt i avgränsad form enligt D-07: läsårsväljare, startår som heltal och härledd årskurs för elevlistan. Resterande steg i todon (läsårsstatus/lås, flikar, terminskolumner, automatisk klass→timplan-koppling, tjänsterader) ligger kvar i todon.

### Deferred Ideas (OUT OF SCOPE)
- **Fakturering till hemkommuner** (interkommunal ersättning): belopp, beräkningsregler, fakturaunderlag, export till ekonomisystem — egen fas/todo (D-16).
- Vårdnadshavare, adresser och kontaktuppgifter — inte i fas 4 (D-01).
- Resten av läsårslinsen: läsårsstatus/lås, Aktuella/Framtida/Arkiverade, terminskolumner, automatisk klass→timplan-koppling, tjänsterader.
- Sparade namngivna urval.

#### Reviewed Todos (not folded)
- **SPAR-synk för elever och vårdnadshavare** — hör till fas 7 (registerintegration); fas 4 förbereder källmärkning per fält (D-08).
- **Planera stark identitetskontroll och BankID**, **Utred Sverige-id och integration** — identitetsfrågor, inte elevregister.
- **RACI-matris**, **Leverantörens systemadministration** — administrations-/ansvarsmodell, egna faser.
- **Avgränsa Docusaurus till instruktioner och regler** — gäller redan som ram.
- **API för lärares behörigheter med statistisk uppföljning** — uppdragsstatistik, inte elevregister.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Beskrivning (REQUIREMENTS.md) | Stöd i denna research |
|----|-------------------------------|------------------------|
| STU-01 | Behörig administratör kan återfinna samma elev och sparade basuppgifter efter utloggning och omläsning genom ett stabilt internt ID skilt från elevens eventuella inloggningskonto. | `pupils.id` (uuid, aldrig återanvänt, ingen koppling till `identities`); alla skrivningar i SECURITY DEFINER-funktioner i en transaktion; "Sann status" = omläsning efter sparning; API-fall `register-reload` och browserprov 1. |
| STU-02 | Aktuell, framtida och avslutad skolplacering med giltighetsdatum och bevarad historik. | `pupil_placements` med `daterange`-uteslutning (btree_gist), gruppering Aktuell/Framtida/Avslutade mot `app_today()`, skolbyte i en funktion (avsluta + ny). pgTAP `phase4_periods`. |
| STU-03 | Datumsatta klasstillhörigheter utan att klassbyte byter utbildning eller skriver om tidigare tillhörighet. | Ny tabell `school_classes` (beständigt klass-ID) + `pupil_class_memberships` med uteslutning; klassbytet rör aldrig `pupil_placements.offering_id`; varning när `school_classes.offering_id` ≠ placeringens. |
| STU-04 | Se uppgiftens ursprung och rätta i ansvarig källa; lokal rättelse skrivs inte tyst över. | `pupil_field_state` (ursprung, skrivägare, revision per fält), `pupil_source_values` (senaste syntetiska leverans), avvikelse = lokal rättelse ≠ levererat värde; simulerad källa endast som postgres-funktion + CLI mot verifierat mål. |
| STU-05 | Söka och filtrera tillåtna elever per skola och läsår, skilja namnlika åt och återgå till samma urval. | SQL-urval före `count`/sida; filtervärden ur skolans klasser/utbud (inte ur eleverna); särskiljande rad; urval i adressen, sökord i `sessionStorage` och POST-kropp. |
| STU-06 | Två administratörer får begriplig versionskonflikt i stället för tyst överskrivning. | Aggregatversion `pupils.version` + revision per fält; `select … for update` på elevraden; 409 `conflict` med `details` (vem, när, krockande fält). Två-anslutningsprov enligt mönstret i `verify-mandate-locks.mjs`. |
| DATA-01 | Skyddad syntetisk elev: arbetsfall för behöriga, inget röjande via läsvägar, sökträffar, fel, aviseringar, metadata. | Projektion i SQL (anonymt visningsnamn, sortering på visat namn, uteslutning ur sökträffar), ny uttrycklig behörighet på administratörsmandatet, identiskt 404, loggade visningar, läckagesökning i DOM/nätverk/logg. |
| DATA-02 | Export av endast tillåtna elever och fält för uttryckligt urval; serverprövad, loggad, samma spärr- och skyddsregler. | `POST /api/elever/export` räknar om urvalet i SQL, fält ur stängd lista, främmande ID nekar hela exporten, egna händelsetyper för export och personnummerexport, `requireMfa`. |
</phase_requirements>

## Project Constraints (from AGENTS.md)

Ingen `CLAUDE.md` finns; `AGENTS.md` gäller och har samma tyngd som låsta beslut. Inga projektskills under `.claude/skills/` eller `.agents/skills/`.

- Skriv på svenska med tydliga verksamhetsord. Skilj förslag, implementation, test mot syntetiska data och godkänd verklig anslutning.
- Utgå från `.planning/codebase/` och verifiera berörd kod före ändring. Tidigare passerade tester är historik, inte bevis.
- Dela större ombyggnader i kontrollerbara förändringar. **Bevara gymnasiets utbildningsflöde, kurs-/nivåtillägg, kopiering till nästa elevkull och explicita klass–timplanskopplingar.**
- Varje aktivt krav ska kunna följas till fas och verifieringsresultat. Markera inte simulerat integrationsprov som riktig kommunanslutning.
- Domänmodeller i `web/lib/*-model.ts`, datalager i `*-store.ts`, vyer i `web/app/`, migrationer i `supabase/migrations/`.
- Kontroller i `web/`: `node --test lib/*.test.mjs`, `npx tsc --noEmit`, `npx oxlint app lib`, `npm run build`. Vid UI-ändring prövas flödet på dator och telefon.
- Docusaurus (`docs/handbok/`) innehåller endast användarinstruktioner och regler; vid ändrat användarbeteende ingår berörda handbokssidor och `npm run docs:build` i planen. Tekniska kontrakt i interna repodokument (`docs/pilot/`). Importera inte `.planning/`, testkonton eller privata miljöfiler.
- `signInDemo`/`bootstrap_demo_profile` får inte användas med verkliga elevuppgifter eller i pilotens skyddade driftvägar.
- Kontrollera mandat på servern och i datavägarna; klientens rollval är inget behörighetsbevis.
- Hemligheter och personuppgifter skrivs inte i Git, planeringsdokument eller felsökningsutdata.
- Granska `work/supabase/`-skript före körning; `reset.mjs` raderar demodata. Använd avsedd isolerad testmiljö.
- Elevregisterintegration behöver eget källansvar, kontrakt och behörighet (fas 6–7).
- Versionshantera avgränsade ändringar; blanda inte in andra pågående ändringar i en commit. Användarminne: kontrollera mtime innan du rättar fel i filer du inte rört (samtidiga sessioner i `web/`).

## Summary

Fas 4 bygger det första beständiga elevregistret ovanpå fas 3:s mandat- och loggkedja. Allt som behövs finns redan som mönster: SECURITY DEFINER-funktioner som börjar med `phase3_actor()` och prövar mandatet själva, tabeller med `force row level security` och indragna rättigheter för `skolplattform_worker`, `protectedRoute` som skriver säkerhetshändelsen i samma transaktion före svaret, och en fail-closed fasgrind. Registret ska följa exakt samma form. Inga nya npm-paket behövs. Den enda nya plattformskomponenten är PostgreSQL-tillägget `btree_gist` (finns i den lokala PG 17.6, ej installerat, betrott tillägg), som gör "exakt en aktiv placering/klass/hemkommun per datum" till en databasgaranti via `EXCLUDE USING gist (pupil_id WITH =, daterange(...) WITH &&)`.

Det svåraste är inte tabellerna utan tre gränssnitt mot fas 3. (1) Fas 3:s elevprov är hårt bundet: `mandate_pupils`, `mandate_groups`, `mandate_cases` och `phase3_probe_group_members` har sammansatta främmande nycklar mot `phase3_probe_pupils(id, customer_id, unit_id)` och `phase3_probe_groups`, och alla sju fas 3-SQL-provfiler, fixturfilen, `verify-mandates.mjs` (67 träffar på elevprov/`/api/prov`), `verify-access.mjs` (22) och mandatbrowsern (24) använder elevprovet. En elev som byter skola bryter dessutom den sammansatta nyckeln, eftersom skolan i fas 4 kommer ur placeringen och inte är en fast elevkolumn. (2) Behörighetsomfattningen blir datumberoende: fas 3 prövar `p.unit_id` på eleven; fas 4 måste pröva att en placering (eller klasstillhörighet) vid mandatets skola överlappar valt läsår. (3) Skyddad identitet kräver en ny, uttrycklig behörighet på administratörsmandatet, som fas 3:s formprövning (`phase3_mandate_shape`) och tilldelningsvägen inte känner till.

Rekommendationen är att **ersätta** elevprovet i stället för att köra det parallellt: nya registertabeller, datamigrering av befintliga provrader med samma UUID, omriktade främmande nycklar, omskrivna scope-funktioner, portade fas 3-provfall (samma fallnamn) mot registrets API, och därefter borttagen `/api/prov` och indragen `phase3_read_pupils`. En kvarlämnad andra läsväg till elevdata vore själv en DATA-01-risk. Konflikthantering byggs med en aggregatversion på eleven plus revision per fält i en ursprungstabell; det ger begriplig per-fältkonflikt utan att klienten skickar gamla värden (viktigt för personnummer).

**Primär rekommendation:** Följ fas 3:s arkitektur till punkt och pricka (SQL avgör urval, fält och skydd; Worker loggar före svar; grind utan hopp), lägg datumperioderna i uteslutningsvillkor med `btree_gist`, och planera ersättningen av elevprovet som en egen kontrollerad våg med portade regressionsfall.

## Architectural Responsibility Map

| Förmåga | Primär nivå | Sekundär nivå | Motivering |
|---------|-------------|---------------|------------|
| Vilka elever som finns för aktören (scope per läsår) | Databas (SECURITY DEFINER-funktion) | API (tolkar parametrar) | Fas 3-mönster: urval före antal och svar; direkt REST/RPC nekas. |
| Fältprojektion (anonymt namn, födelsedatum, personnummer) | Databas | API (kopierar endast kända fält) | Samma regel måste gälla lista, kort, historik, export och sökning; en plats. |
| "Exakt en aktiv period per datum" | Databas (exclusion constraint) | Databasfunktion (begripligt fel före constraint) | Garanti även vid samtidiga skrivningar och direkta vägar. |
| Versionskonflikt | Databas (radlås + revision) | Webbläsare (konfliktvy) | Kontrollen måste ske där skrivningen sker, i samma transaktion. |
| Säkerhetslogg före svar | API (`protectedRoute` + `logEvent` i tx) | Databas (`security_events`, append-only) | Befintlig verifierad kedja. |
| Ändringshistorik med värden | Databas (append-only tabell skriven av mutationsfunktionen) | API/webbläsare (läsning på begäran) | D-11: verksamhetshistorik ≠ säkerhetslogg; skrivs i samma transaktion som ändringen. |
| MFA-krav för ändring, personnummervisning, export | API (`requireMfa`) | Webbläsare (`MfaStepUpNotice`) | Befintlig 8 h-bevisprofil. |
| Läsårsväljare, urval i adress, sökord i sessionStorage | Webbläsare | API (validerar varje parameter) | Bekvämlighet i klienten; servern är gränsen. |
| Export (CSV) | API (bygger fil, loggar före svar) | Databas (urval och fält) | Samma som fas 3-exporten men med POST-kropp. |
| Simulerad källa (D-09) | Databas (postgres-only funktion) + `work/pilot`-CLI | — | Får aldrig vara en Worker-väg. |

## Standard Stack

### Kärna (redan i repot, inga nya paket)

| Komponent | Version | Syfte | Varför |
|-----------|---------|-------|--------|
| PostgreSQL (Supabase lokalt, protected-mål) | 17.6 `[VERIFIED: select version() mot protected-DB]` | Registertabeller, perioder, funktioner | Befintlig plattform. |
| `btree_gist` (PG contrib) | 1.7, tillgängligt men ej installerat `[VERIFIED: pg_available_extensions mot protected-DB]` | Kombinera `pupil_id WITH =` med `daterange WITH &&` i uteslutningsvillkor | Stöder `uuid` och är ett "trusted" tillägg `[CITED: postgresql.org/docs/17/btree-gist.html]`. |
| `postgres` (postgres.js) | 3.4.9 `[VERIFIED: web/package.json]` | Worker → DB, taggade mallar (parametriserat) | Befintligt i `web/lib/server/db.ts`. |
| React / Vinext | react ^19.2.8, vinext ^1.0.0-beta.9 `[VERIFIED: web/package.json]` | Vyer | Befintligt. |
| `@base-ui/react` + lokala shadcn-omslag | 1.7.0 `[VERIFIED: web/package.json]` | Dialog, Table, Checkbox, Badge, Collapsible | UI-SPEC listar komponenterna. |
| `lucide-react` | 1.31.0 | Ikoner | UI-SPEC. |
| `node:test` (Node 25) | v25.9.0 `[VERIFIED: node --version]` | Modell-/serverprov | Befintligt mönster. |
| pgTAP | 1.3.3 tillgängligt `[VERIFIED: pg_available_extensions]` | SQL-prov via `supabase test db --local` | `work/pilot/run-sql-tests.mjs`. |
| `@playwright/test` | 1.63.0 `[VERIFIED: web/package.json]` | Browserprov dator/telefon/byggd Worker | `playwright.protected.config.ts`. |

### Alternativ som övervägts

| I stället för | Kunde använda | Avvägning |
|---------------|---------------|-----------|
| `btree_gist` + `EXCLUDE` | Trigger som söker överlapp | Trigger är inte säker vid samtidiga transaktioner utan extra låsning; uteslutningsvillkoret är det dokumenterade mönstret `[CITED: postgresql.org/docs/17/rangetypes.html]`. Använd funktionens egen kontroll bara för begripligt felbesked. |
| PG 18 `PRIMARY KEY ... WITHOUT OVERLAPS` | — | Finns inte i PG 17 `[ASSUMED]`; målet kör 17.6. |
| Radversion enbart | Per-fält-version enbart | Enbart radversion ger falska konflikter mellan orelaterade fält; enbart per-fält saknar enkel "någon ändrade eleven"-kontroll. Rekommendation: båda (aggregatversion + revision per fält). |
| `pg_trgm`/`unaccent` för sökning | `ILIKE` med escapade jokertecken | Pilotvolymen motiverar inte nya tillägg; bestäm efter mätning. |

**Installation:** inga `npm install`. Migrationen gör:
```sql
create extension if not exists btree_gist with schema extensions;
```
`[ASSUMED]` att `extensions`-schemat används för tillägg som i resten av Supabase-målet (pgcrypto och uuid-ossp ligger där enligt `pg_extension`-frågan).

## Package Legitimacy Audit

Fasen installerar **inga** externa npm-/PyPI-/crates-paket. Enda tillägget är PostgreSQL-contrib-modulen `btree_gist`, som levereras med databasservern och redan finns i målets `pg_available_extensions`.

| Paket | Register | Ålder | Nedladdningar | Källrepo | Verdikt | Disposition |
|-------|----------|-------|---------------|----------|---------|-------------|
| btree_gist (PG contrib) | Ingår i PostgreSQL | – | – | postgresql.org | ej tillämpligt (ingen registerinstallation) | Godkänt |

**Borttagna p.g.a. [SLOP]:** inga. **Flaggade [SUS]:** inga.

## Architecture Patterns

### Systemdiagram (dataflöde)

```
Webbläsare (Elever-vyn)                         Worker (protectedRoute)                     PostgreSQL (SECURITY DEFINER)
────────────────────────                         ───────────────────────                     ──────────────────────────────
Läsårsväljare/urval i adress ─┐
Sökord (sessionStorage) ──────┼─ POST /api/elever/lista {lasar,skola,filter,sida,sok}
                              │        │ requireContext → withSessionContext (lås session/medlemskap,
                              │        │   app.* settings, epokkontroll)
                              │        │ requireSyntheticMandates (endast lokalt protected-mål)
                              │        └─► select phase4_list_pupils(...) ─────────────────► phase3_actor() (mandatkedja)
                              │                                                               ├─ läsårsfönster [Y-07-01, Y+1-07-01)
                              │                                                               ├─ scope: placering/klass/elev/ärende ∩ fönster
                              │                                                               ├─ projektion: visat namn, född, märken
                              │                                                               ├─ sökning på visat/tillåtet fält, skyddad utesluts
                              │                                                               ├─ sortering på VISAT namn, count, sida
                              │                                                               └─ returnerar rader + filtervärden ur skolans klasser
                              │        logEvent(tx, 'pupil_register_listed' + ev. 'pupil_protected_viewed')
                              │        ── fel i logg → rollback → 500 audit_unavailable (inget innehåll)
                              ◄──────── 200 {pupils,total,page,pages,filters,capabilities} Cache-Control: no-store

Elevkort ─ GET /api/elever/elev?elev=&lasar= ──► phase4_read_pupil  ─► samma scope/projektion; utanför scope ⇒ P0002 ⇒ 404
Visa personnummer ─ POST /api/elever/personnummer ─► requireMfa ─► phase4_reveal_personnummer ─► logg 'pupil_personnummer_revealed'
Historik ─ GET /api/elever/historik ─► phase4_read_history (skyddade/personnummer-rader filtreras) ─► logg
Ändring ─ POST /api/elever/andra {pupilId, expectedVersion, kind, payload}
          └► requireSameOrigin + requireMfa ─► phase4_change_pupil:
               select … from pupils where id=… for update   (serialiserar samtidiga skrivare)
               revision per berört fält > expectedVersion ⇒ 409 conflict {vem, när, fält}
               skriv värden/perioder (EXCLUDE-garanti), pupil_field_state, pupil_field_history, version+1
          ─► logg 'pupil_updated' | 'pupil_placement_changed' | … (utan värden)
Export ─ POST /api/elever/export {urval, fält, personnummer?, skyddade?} ─► requireMfa ─► phase4_export_pupils
          ─► logg 'pupil_register_exported' / 'pupil_register_exported_personnummer' ─► text/csv (buffrad)

Simulerad källa (endast CLI som postgres, assertTarget('protected')):
work/pilot/phase4-simulated-source.mjs ─► phase4_simulated_source_deliver(...) ─► pupil_source_values ⇒ avvikelse
```

### Rekommenderad filstruktur

```
supabase/migrations/
  20260929100000_phase4_register_schema.sql        # btree_gist, tabeller, EXCLUDE, RLS/revoke, offerings.start_year
  20260929110000_phase4_register_migrate_probe.sql  # provrader → register (samma UUID), omriktade FK
  20260929120000_phase4_register_functions.sql      # scope, projektion, läs-, ändrings-, historik-, exportfunktioner
  20260929130000_phase4_protected_permission.sql    # uttrycklig skyddsbehörighet på administratörsmandat
  2026093xxxxxxx_phase4_retire_probe.sql            # revoke/drop phase3_read_pupils + provtabeller (sist)
supabase/tests/
  phase4_register.test.sql  phase4_periods.test.sql  phase4_protected.test.sql
  phase4_conflicts.test.sql phase4_export.test.sql   (+ uppdaterade phase3_*.test.sql)
web/lib/
  pupil-register-model.ts (+ .test.mjs)   # läsår, årskurs, urval↔adress, personnummer, CSV, konflikt, gruppering
  server/pupil-register.ts (+ .test.mjs)  # parsers, SQL-anrop via mandateOperation, radkopiering
web/app/
  api/elever/{lista,elev,personnummer,historik,andra,export}/route.ts
  pupil-register-workspace.tsx  pupil-card.tsx  pupil-dialogs.tsx  school-year-picker.tsx
work/pilot/
  sql/phase4-fixtures.sql  phase4-browser-fixtures.mjs  phase4-simulated-source.mjs
  verify-register.mjs  verify-register-locks.mjs
web/e2e/phase4-register.spec.ts
web/scripts/verify-phase4.mjs (+ .test.mjs)
docs/pilot/phase4-register.md   docs/handbok/{anvandning,mandat,regler,sakerhetslogg}.md
```
Fasta sökvägar med ID i frågesträng/kropp rekommenderas i stället för dynamiska ruttsegment, eftersom befintliga routes (`/api/prov/elev?elev=`) använder det mönstret och dynamiska segment i Vinext inte är prövade i repot `[ASSUMED]`.

### Mönster 1: Registertabeller med periodgaranti

**Vad:** Aktuella basvärden som kolumner på `pupils` (för sökning, sortering, projektion); perioder i egna tabeller med `EXCLUDE`.
**Förslag (Claude's discretion, ej prövat):**

```sql
-- Källa: mönster från postgresql.org/docs/17/rangetypes.html (room_reservation) och btree-gist.html
create extension if not exists btree_gist with schema extensions;

create table public.pupils (
  id uuid primary key default gen_random_uuid(),          -- STU-01: stabilt, aldrig identities.id
  customer_id uuid not null,
  organizer_id uuid not null,
  given_name text not null check (length(btrim(given_name)) between 1 and 120),
  family_name text not null check (length(btrim(family_name)) between 1 and 120),
  personnummer text not null check (personnummer ~ '^\d{12}$'),
  birth_date date not null,                                -- sätts av mutationsfunktionen ur personnumret
  protected_identity boolean not null default false,
  anonymous_name text not null,                            -- serverns visningsnamn för obehöriga
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  unique (id, customer_id),
  unique (customer_id, personnummer),
  foreign key (organizer_id, customer_id) references public.organizers(id, customer_id)
);

create table public.pupil_placements (
  id uuid primary key default gen_random_uuid(),
  pupil_id uuid not null, customer_id uuid not null,
  organizer_id uuid not null, unit_id uuid not null, offering_id uuid not null,
  starts_on date not null, ends_on date,                   -- ends_on inkluderande, null = tills vidare
  check (ends_on is null or ends_on >= starts_on),
  foreign key (pupil_id, customer_id) references public.pupils(id, customer_id),
  foreign key (unit_id, organizer_id) references public.school_units(id, organizer_id),
  foreign key (offering_id, unit_id) references public.offerings(id, unit_id), -- kräver ny unique(id, unit_id)
  exclude using gist (pupil_id with =, daterange(starts_on, ends_on, '[]') with &&)
);
-- Samma form för pupil_class_memberships (class_id → school_classes) och
-- pupil_home_municipalities (municipality_code → municipalities).
alter table public.pupils enable row level security;
alter table public.pupils force row level security;
revoke all on public.pupils from public, anon, authenticated, skolplattform_worker;
-- … upprepa för varje ny tabell (fas 3-mönstret, 20260922100000_phase3_mandates.sql:165-191)
```

Detaljer att hålla fast:
- `daterange(x, null, '[]')` ger obegränsad övre gräns; `daterange` kanoniseras till `[)` `[CITED: postgresql.org/docs/17/rangetypes.html]`. Använd samma uttryck i uteslutningen och i alla överlappsfrågor så att GiST-indexet används.
- Klasstillhörighet måste ligga inom en placering vid klassens skola: det kan inte uttryckas som `EXCLUDE`; pröva i mutationsfunktionen (och i pgTAP).
- `school_classes(id, customer_id, organizer_id, unit_id, offering_id, name, start_year, unique(unit_id, name, start_year))` ger klassen den beständiga identitet som CONCERNS efterfrågar och samma naturliga nyckel som `class_timplans` redan använder, så fas 5 kan knyta an utan omarbetning.
- `offerings.start_year integer` (D-07). Befintlig kolumn är fritext: `cohort text not null,` `[VERIFIED: supabase/migrations/20260905120000_huvudman.sql:138]`. Se fallgrop 9 om grundskolan.
- `municipalities(code text primary key check (code ~ '^\d{4}$'), name text not null)`; koderna är fyrsiffriga och fastställs av SCB `[CITED: scb.se, Län och kommuner i kodnummerordning]`. Repo saknar i dag en kommunlista (kodsökning gav bara `'0000'`/`'Exempelstad'` i fixturer).

### Mönster 2: Scope per läsår i stället för fast elevskola

Fas 3 prövar elevens fasta skola. Nuvarande funktion `[VERIFIED: supabase/migrations/20260924150000_phase3_policy_parameter_binding.sql:2-16]`:

```sql
create or replace function public.phase3_pupil_in_scope(assignment_id uuid,pupil_id uuid,case_id uuid default null)
...
    join public.phase3_probe_pupils p on p.id=$2 and p.customer_id=a.customer_id and p.organizer_id=a.organizer_id
    join public.mandate_units u on u.assignment_id=a.id and u.unit_id=p.unit_id
    where a.id=$1 and public.phase3_mandate_is_valid(a.id)
      and a.function in ('rektor','larare','administrator','elevhalsa','support')
```

Fas 4 ersätter `u.unit_id=p.unit_id` med: det finns en placering för eleven vid en av mandatets skolor vars period överlappar det begärda fönstret. För gruppscope: klasstillhörighet i en av mandatets klasser som överlappar fönstret. För elev-/ärendescope: `mandate_pupils`/`mandate_cases` **och** placering vid mandatets skola i fönstret. Rekommenderad signatur: `phase4_pupil_in_scope(assignment_id uuid, pupil_id uuid, window daterange, case_id uuid default null)`. Fönstret för läsår Y: `daterange(make_date(Y,7,1), make_date(Y+1,7,1), '[)')` `[ASSUMED: 1 juli som läsårsgräns — bekräfta]`. För ändringar används fönstret "idag och framåt" så att en administratör inte kan ändra en elev som bara har avslutade placeringar vid skolan `[ASSUMED — bekräfta, se Öppna frågor]`.

### Mönster 3: Projektion i en funktion

En enda SQL-funktion avgör vad en aktör ser av en elev och används av lista, kort, sökning, historik och export:

| Aktör | Visat namn | Födelsedatum | Personnummer | Hemkommun | Märken | Åtgärder |
|-------|------------|--------------|--------------|-----------|--------|----------|
| `administrator` med skyddsbehörighet vid elevens placeringsskola, eller elev utan skydd | Riktigt namn | Ja | Endast via separat, loggat anrop | Ja | Skyddad, Avvikelse | Ändra, exportera |
| `administrator` utan skyddsbehörighet, skyddad elev | `anonymous_name` | Nej | Nej | Nej `[ASSUMED]` | Inga | Inga `[ASSUMED]` |
| `rektor`, `larare`, `elevhalsa`, `support` | Riktigt namn, eller `anonymous_name` om skyddad | Nej | Nej | Nej | Inga | Inga |

UI-SPEC: "Fält som servern inte returnerar visas inte alls." Därför ska Worker-koden kopiera en uttrycklig fältlista (som `toProbePupil` i `web/lib/pupil-probe-model.ts`) och aldrig sprida SQL-raden.

### Mönster 4: Mutation med versionskontroll och historik i samma transaktion

```sql
-- Förslag, ej prövat. En funktion per ändringstyp (bas, hemkommun, skolbyte, utbildningsbyte, avslut, klass, avvikelse).
create function public.phase4_change_basics(p_pupil uuid, p_expected integer, p_changes jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; p public.pupils; conflicts jsonb;
begin
  a := public.phase3_actor();                                   -- mandatkedjan, som i fas 3
  if a.function <> 'administrator' then raise exception 'Write denied' using errcode='42501'; end if;
  select * into p from public.pupils where id=p_pupil and customer_id=a.customer_id for update;
  if not found or not public.phase4_can_edit(a, p) then        -- scope + skyddsbehörighet
    raise exception 'Not found' using errcode='P0002';          -- samma som okänd elev
  end if;
  select jsonb_agg(jsonb_build_object('field',s.field,'changedAt',s.changed_at,'changedBy',s.changed_by_name))
    into conflicts
    from public.pupil_field_state s
   where s.pupil_id=p.id and s.field in (select jsonb_object_keys(p_changes)) and s.revision > p_expected;
  if conflicts is not null then
    raise exception 'Version conflict' using errcode='40001', detail=conflicts::text;  -- 40001 → 409 i mandateSqlFailure
  end if;
  -- validera, skriv kolumner, pupil_field_state (revision = p.version+1, källa 'app'),
  -- pupil_field_history (från/till, aktör, källa), version = version + 1
  return jsonb_build_object('version', p.version + 1);
end $$;
revoke all on function public.phase4_change_basics(uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.phase4_change_basics(uuid,integer,jsonb) to skolplattform_worker;
```

- Radlåset gör att två samtidiga sparningar körs efter varandra; den andra ser högre revision och får 409. Det är samma "vänta och läs ny status"-mekanism som `work/pilot/verify-mandate-locks.mjs` provar med två riktiga anslutningar.
- Perioder (placering, klass, hemkommun) behandlas som tre "fält" i `pupil_field_state`, så en namnändring ger inte falsk periodkonflikt (UI-SPEC skiljer fältkonflikt från periodkonflikt).
- Konfliktsvaret bär värdet "Sparat värde" för krockande fält. För personnummer returneras endast maskerat värde (`ÅÅÅÅMMDD-••••`), annars blir konflikten en ologgad visning.
- `postgres.js`-felobjektet exponerar `detail`; Worker måste tolka det och lägga det i `Deny('conflict', 409, details)`. `fail()` tar redan `details` (`{ code, correlationId: corr, ...(details ? { details } : {}) }`, `[VERIFIED: web/lib/server/http.ts:42-52]`), men klientens `ApiError` saknar fält för dem (fallgrop 6).

### Mönster 5: Route enligt fas 3

Befintlig kedja `[VERIFIED: web/lib/server/authz.ts:224-232]`:
```ts
      if (requiresAudit(opts.mutating, opts.audit) && !handled.event) {
        throw new Error('Skyddad route saknar obligatorisk säkerhetshändelse');
      }
      if (handled.event) {
        try {
          await logEvent(tx, ctx, { ...handled.event, outcome: 'ok' });
        } catch {
          // Transaktionen rullas tillbaka och inget innehåll lämnar servern.
          throw new AuditUnavailable();
```
Nya routes: `protectedRoute(request, action, { mutating, audit: 'required', mfa, functions }, handler)`, handler anropar SQL via `mandateOperation` (som kör `requireSyntheticMandates()` och mappar SQLSTATE). En handler får bara returnera **ett** `event`; flera händelser (t.ex. en per visad skyddad elev) kräver att handlern själv anropar `logEvent(tx, ctx, …)` inne i transaktionen före retur, och att fel där kastar `AuditUnavailable` `[ASSUMED: ingen befintlig route loggar flera händelser; verifiera vid implementation]`.

### Mönster 6: Klienten

- Vy nycklas som i fas 3: `key={`${session.epoch}-${session.context!.assignmentId}`}` och generation per begäran (`lifecycle`-refen i `pupil-probe-workspace.tsx`). `api` i `web/lib/server-client.ts` släpper redan svar från äldre generation/epok.
- `protected-home.tsx` har ingen adressroutning i dag; vyn är `useState`. Menyn styrs av `PROBE_FUNCTIONS` `[VERIFIED: web/app/protected-home.tsx:56]`: `const PROBE_FUNCTIONS = ['rektor', 'larare', 'administrator', 'elevhalsa', 'support'];` och den stängda posten `['Elever', Users],` `[VERIFIED: web/app/protected-home.tsx:80]`. Fas 4 lägger till läsning av `?vy=elever&lasar=…` vid start, `pushState` vid urvalsbyte och `popstate`-hantering; `replaceState('/')` vid kontextbyte/utloggning.
- `startStepUp(returnTo)` bevarar frågesträngen: `safeReturnTo` returnerar `resolved.pathname + resolved.search + resolved.hash` `[VERIFIED: web/app/api/auth/login/route.ts:7-17]`. Sökordet får alltså aldrig ligga i `returnTo`.
- `api.download` är GET-bunden (`method: 'GET'`, `[VERIFIED: web/lib/server-client.ts:110-120]`). Export och sökning via POST kräver en ny `downloadPost`/`post`-variant.

### Anti-mönster att undvika

- **Parallellt elevprov kvar:** en andra läsväg (`/api/prov`, `phase3_read_pupils`) som inte använder fas 4:s projektion läcker skyddat namn.
- **Filtrera eller räkna i klienten:** strider mot D-12 och ger metadata via antal.
- **Filtervärden ur elevraderna:** en klass som bara innehåller en skyddad elev röjer den; ta filtervärden ur skolans `school_classes`/utbud.
- **Personnummer i URL, `title`, `data-*`, `aria-*`, konsol, `sessionStorage` eller säkerhetslogg.**
- **Klientens gamla värden som konfliktbas:** klienten känner inte personnumret; använd revision per fält.
- **Hårdkodade datum i fixturer:** bygg datum relativt `app_today()` så att aktuella/framtida/avslutade placeringar förblir rätt.

## Ersättning av fas 3:s elevprov (Claude's discretion – rekommendation)

**Bindningar som måste hanteras** `[VERIFIED: supabase/migrations/20260922100000_phase3_mandates.sql:79-139]`:
```sql
create table public.phase3_probe_pupils (
  ...
  unique (id, customer_id, unit_id),
...
create table public.mandate_groups (
  ...
  kind text not null check (kind in ('undervisning','mentor')),
  ...
  foreign key (group_id, customer_id, unit_id) references public.phase3_probe_groups(id, customer_id, unit_id)
);
create table public.mandate_pupils (
  ...
  foreign key (pupil_id, customer_id, unit_id) references public.phase3_probe_pupils(id, customer_id, unit_id)
);
```
(`phase3_probe_group_members` rad 108 och `phase3_probe_cases` rad 116 har samma sammansatta nyckel mot `phase3_probe_pupils`.)

**Rekommenderad ordning (en kontrollerad våg):**
1. Schemamigrering med registertabeller (inga dataflyttar).
2. Datamigrering: varje `phase3_probe_pupils`-rad → `pupils` med **samma UUID** (namn delas deterministiskt, syntetiskt personnummer ur tillåten lista, placering vid provradens skola från läsårets början); varje `phase3_probe_groups`-rad → `school_classes` med samma UUID (syntetiskt klassnamn, utbildning vid skolan); medlemskap → `pupil_class_memberships`. Släpp de gamla sammansatta FK:erna och lägg nya: `mandate_pupils(pupil_id, customer_id) → pupils(id, customer_id)`, `mandate_groups(group_id, customer_id, unit_id) → school_classes(id, customer_id, unit_id)`, `phase3_probe_cases(pupil_id, customer_id) → pupils(id, customer_id)` (ärendet behåller eget `unit_id`). Befintliga mandat i målet fortsätter då att peka på samma ID.
3. Omskrivna funktioner: `phase3_pupil_in_scope`, `phase3_probe_scope`, `phase3_mandate_options` (rektorns grupp-/elevurval) och `phase3_mandate_shape` läser registertabellerna. Behåll funktionsnamnen där mandatkedjan anropar dem.
4. Porta prov: fas 3-SQL-provens fixturrader (`insert into public.phase3_probe_pupils values (...)`, t.ex. `supabase/tests/phase3_temporal.test.sql:13`) skrivs om till registertabellerna; `work/pilot/sql/phase3-fixtures.sql` likaså. `verify-mandates.mjs`-fallen som läser elever flyttas från `/api/prov` till `/api/elever` med **samma fallnamn** (`teacher-group`, `school-admin`, `health-*`, `support-*`, `foreign-object`, `audit-read-fail`, `audit-export-fail`, …) så att grindens falluppsättning kan jämföras. Mandatbrowserns elevprovssteg flyttas till Elever-vyn.
5. Sist: ta bort `/api/prov/elev`, `/api/prov/export`, `pupil-probe-workspace.tsx` och menyposten; migration som drar in `phase3_read_pupils` från `skolplattform_worker` (eller släpper den) och släpper `phase3_probe_pupils/_groups/_group_members`. Negativt prov: `/api/prov/elev` ger 404 och direkt RPC ger 42501.

Den gröna fas 3-grinden på `278f235` förblir historiskt bevis. Nytt bevis för samma invarianter krävs mot den nya koden (AGENTS.md). Om planeraren hellre behåller `/api/prov` en tid måste den läsa via fas 4:s projektion; annars är den en läcka.

## Don't Hand-Roll

| Problem | Bygg inte | Använd i stället | Varför |
|---------|-----------|------------------|--------|
| Ingen överlappning mellan perioder | Trigger eller klientkontroll | `EXCLUDE USING gist (pupil_id WITH =, daterange(...) WITH &&)` + `btree_gist` | Säkert vid samtidighet; dokumenterat PG-mönster. |
| Samtidighetsskydd | Tidsstämpeljämförelse i klienten | `select … for update` + revision i samma transaktion | Kontrollen måste ske där skrivningen sker. |
| Logg före svar | Egen loggning per route | `protectedRoute` + `logEvent(tx, …)` | Verifierad i fas 3 (audit-read-fail m.fl.). |
| Mandatprövning | Ny rollkontroll i TypeScript | `phase3_actor()` + scope-funktion i SQL | Kedjeprövning, kundlås, medlemskap redan löst. |
| CSV-escaping | Egen `join(';')` | `csvRow`/`csvCell` i `web/lib/audit-export.ts` | Hanterar formelprefix `^[=+\-@\t\r]` och citattecken. |
| Målskydd | Egen URL-kontroll | `requireSyntheticMandates()` / `assertTarget('protected')` | Endast portarna 56321/56322 på loopback godtas. |
| Loggminimering | Fria detaljfält | Utöka `sanitizeAuditDetails` med stängda värdescheman | Okända nycklar tappas tyst idag. |
| Fokus/dialog/osparade ändringar | Egen modal | Base UI `Dialog` + `useUnsavedChanges` + `MfaStepUpNotice` | UI-SPEC och fas 3-rättningen 43c6b79. |
| Syntetiska personnummer | Slumpgenerator med Luhn | Skatteverkets testpersonnummer (öppna data) i en incheckad tillåten lista | Skatteverket spärrar testnumren från verklig tilldelning `[CITED: skatteverket.se, Testpersonnummer som öppen data]`. |

**Nyckelinsikt:** Varje egenbyggd kontroll utanför SQL-funktionen blir en andra sanning som kan glida isär från projektionen – och i den här domänen är glidningen själva läckan.

## Runtime State Inventory

Fasen ersätter elevprovet (migrering), så inventeringen gäller.

| Kategori | Funnet | Åtgärd |
|----------|--------|--------|
| Lagrade data | Protected-DB: 4 rader i `phase3_probe_pupils` `[VERIFIED: count mot protected-DB]`, provgrupper, ärenden och mandatrader (`mandate_pupils/groups/cases`) från fixturer, browser-fixturer och tidigare provkörningar. `security_events` innehåller historiska händelser med `object_type = 'phase3_probe_pupil'`; tabellen är oföränderlig. | **Datamigrering** i migration 2 (samma UUID). Säkerhetshändelser lämnas orörda; granskarvyn måste tåla gamla objekttyper. |
| Live-tjänstekonfiguration | Keycloak-testrealm med `p3.*`-konton (mandat binds i DB). Kong-loggminimering försvinner vid omstart (`configure-audit-source`). | Nya fas 4-konton (t.ex. andra administratör, administratör med skyddsbehörighet) skapas av ny fixturskript enligt `phase3-browser-fixtures.mjs`. Ingen ändring av befintliga konton. |
| OS-registrerat tillstånd | Inga launchd/cron-poster hittade för projektet. En manuellt startad preview på port 3000 kan köra ett äldre bygge. | Ingen registrering. Stoppa/bygg om previewn efter fasen (grinden stoppar aldrig andras servrar). |
| Hemligheter/miljövariabler | `targets/protected/manifest.json`, `idp/phase3-users.json` (0600, gitignorerade). Inga namn ändras. | Ingen. Nya lösenord för fas 4-konton i egen fil med samma skydd. |
| Byggartefakter | `web/dist-protected` innehåller `/api/prov`-routes; `work/pilot/results/phase3-*.json` är historik. | Bygg om (`npm run build:protected`). Resultatfiler lämnas som historik; nya `phase4-*.json`. |

## Common Pitfalls

### Fallgrop 1: Sammansatta FK med `unit_id` blockerar skolbyte
**Vad händer:** `mandate_pupils`/ärenden/gruppmedlemmar pekar på `(id, customer_id, unit_id)`; en elev som byter skola kan inte uppdateras, eller mandatet följer med till fel skola.
**Undvik:** Rikta om till `(id, customer_id)` och låt scope-funktionen pröva skolan via placeringen i tidsfönstret.
**Varningssignal:** migrationen behåller `unique (id, customer_id, unit_id)` på elevtabellen.

### Fallgrop 2: Sortering och sökning på riktigt namn röjer skyddad elev
**Vad händer:** listan sorteras på `family_name` men visar `anonymous_name`; radens position avslöjar det verkliga efternamnet. Sökning på riktigt namn ger träff trots anonymt namn.
**Undvik:** sortera och sök på det **projicerade** värdet; skyddade elever utesluts helt ur träffar när sökord finns och aktören saknar skyddsbehörighet (D-03).
**Varningssignal:** SQL-frågan har `order by p.family_name` utanför projektionen.

### Fallgrop 3: Metadata läcker via antal, filtervärden, fel eller filnamn
**Vad händer:** `count(*)` före skyddsfiltret, klassalternativ härledda ur eleverna, ett 403 i stället för 404 för skyddad elev, exportens filnamn eller loggdetaljer med skyddsflagga.
**Undvik:** allt räknas efter projektion; filtervärden ur skolans klasser/utbud; utanför scope ⇒ `P0002` ⇒ samma 404 som okänd elev; filnamnet `syntetiskt-elevurval-{26-27}-{datum}.csv` innehåller inga elevdata.
**Varningssignal:** olika svarskod eller svarsstorlek för skyddad och okänd elev.

### Fallgrop 4: Historik och konfliktvy blir ologgad personnummervisning
**Vad händer:** `pupil_field_history` lagrar gamla/nya personnummer; historikläsning eller 409-svar visar dem utan händelsen `pupil_personnummer_revealed`.
**Undvik:** historik och konflikt returnerar personnummer maskerat; hela numret endast via reveal-anropet. Namnrader för skyddad elev tas bort för obehöriga (UI visar ingen ersättningsrad).

### Fallgrop 5: Nya routes loggas som `/api/other` och nya detaljnycklar tappas
**Vad händer:** `auditRoute` godtar bara `'/api/auth','/api/context','/api/session','/api/inbjudan','/api/kund','/api/logg','/api/prov','/api/other'` `[VERIFIED: web/lib/server/audit-details.ts:6]`; nya nycklar som `schoolYear` eller `fields` försvinner i `sanitizeAuditDetails` utan fel.
**Undvik:** lägg till `/api/elever` i `ROUTES` och stängda värdescheman för nya nycklar (heltal 2000–2100, fältnamn ur stängd lista, booleska flaggor). Modellprov i `events.test.mjs`.

### Fallgrop 6: 409 betyder två saker och klienten tappar detaljer
**Vad händer:** `context_changed` (409) låser arbetsytan i `server-client.ts`; en versionskonflikt är också 409 men med koden `conflict`. `ApiError` bär bara `code`, `status`, `correlationId`, så `details` (vem/när/fält) når aldrig konfliktvyn.
**Undvik:** utöka `ApiError` med `details`; skilj på `code` (inte status). `mandateSqlFailure` mappar redan `'23505' || '40001'` till `conflict`/409 `[VERIFIED: web/lib/server/mandates.ts:181-190]`, men ger inte vidare `detail`.

### Fallgrop 7: `23P01` (uteslutningsbrott) blir 500
**Vad händer:** `mandateSqlFailure` känner inte `23P01`; ett överlappande datum blir `bad_request` 500 via `denyResponse`.
**Undvik:** pröva överlapp i funktionen först och kasta ett känt fel med fältkod; mappa `23P01` till 400 med `details: { field, reason: 'overlap' }` som reserv. Copy finns: "Eleven har redan en placering {datum}. En elev kan bara ha en aktiv placering per dag."

### Fallgrop 8: Datumgränser och "idag"
**Vad händer:** inklusiva slutdatum blandas med halvöppna intervall; skolbytets "dagen före" blir fel vid månadsskifte; prov med fasta datum ruttnar.
**Undvik:** en konvention (`starts_on`/`ends_on` inkluderande, `daterange(...,'[]')`); `app_today()` i Europe/Stockholm `[VERIFIED: supabase/migrations/20260913100000_phase2_worker_core.sql:22-23]` (`nullif(current_setting('app.fake_today', true), '')::date` / `(now() at time zone 'Europe/Stockholm')::date`). pgTAP kan sätta `app.fake_today`; Worker-, API- och browserprov kan inte, så fixturer räknar datum relativt `app_today()`.

### Fallgrop 9: Startår för grundskolans utbildningar
**Vad händer:** återfyllning ur `cohort` ger fel årskurs. Gymnasiets text är "Elever som börjar HT {år}", grundskolans är "Läsåret {år}/{yy}" (`copy_offering_cohort`, `20260908120000_cohorts_classes.sql:17-18`); för grundskolan är det inte kullens startår.
**Undvik:** återfyll bara gymnasiet; lämna övriga `null` ("Uppgift saknas" i UI); den syntetiska fixturen sätter startår uttryckligen. Fas 5 äger utbildningsflödena – ändra inte `copy_offering_cohort`.

### Fallgrop 10: Glömt målskydd eller MFA
**Vad händer:** en ny route anropar SQL direkt utan `mandateOperation` och kan då nå en icke-lokal databas; eller reveal/export saknar `mfa: true`.
**Undvik:** alla registeranrop via `mandateOperation`; `mfa: true` för ändringar, personnummervisning och export (UI-SPEC har egna MFA-texter för alla tre).

### Fallgrop 11: Sökord läcker via adress, logg eller cache
**Vad händer:** sökordet hamnar i `returnTo`, frågesträng, `console.error` eller loggdetaljer.
**Undvik:** POST-kropp; logga högst `searchKind` (`name|birthdate|personnummer`) om något; `Cache-Control: no-store` (redan i `json()`); escapa `%`/`_` i `ILIKE`.

### Fallgrop 12: Fas 3-grinden och specar går sönder av menyändringen
**Vad händer:** mandatbrowsern (24 träffar på elevprov/`/api/prov`), `phase3-workspace.spec.ts` (5), `verify-access.mjs` (22), `verify-mandates.mjs` (67) bygger på elevprovet; grinden har `secretPattern` som letar efter `Syntetisk elev` `[VERIFIED: web/scripts/verify-phase3.mjs:89]`.
**Undvik:** porta i samma våg som borttagningen; ge fas 4:s syntetiska namn en egen markör (t.ex. efternamn som alltid innehåller ett fast provord) och lägg den i läckagemönstret för fas 4-rapporterna.

### Fallgrop 13: Skyddsbehörigheten saknar tilldelningsväg
**Vad händer:** D-03 kräver "uttrycklig behörighet"; `phase3_mandate_shape` för `administrator` godtar i dag bara `scope_kind='school'` och inga extra flaggor (`20260927090000_phase3_support_groups.sql:23-56`). Utan migration och tilldelningsväg kan bara fixturer ge rätten.
**Undvik:** se Öppen fråga 1; oavsett väg ska rätten prövas i kedjan (barnets rätt ⊆ förälderns) och varje tilldelning loggas som behörighetsändring.

## Code Examples

### Läsår, årskurs och status (ren modell, `web/lib/pupil-register-model.ts`)
```ts
// Förslag. Läsårsgränsen 1 juli är ANTAGEN och måste bekräftas.
export function currentSchoolYear(today: string): number {
  const [y, m] = today.split('-').map(Number);
  return m >= 7 ? y : y - 1;
}
export function schoolYearLabel(startYear: number): string {
  return `${String(startYear % 100).padStart(2, '0')}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}
export function gradeFor(schoolYear: number, offeringStartYear: number | null): number | null {
  return offeringStartYear === null ? null : schoolYear - offeringStartYear + 1; // D-07
}
export function placementGroup(p: { startsOn: string; endsOn: string | null }, today: string):
  'aktuell' | 'framtida' | 'avslutad' {
  if (p.startsOn > today) return 'framtida';
  if (p.endsOn !== null && p.endsOn < today) return 'avslutad';
  return 'aktuell';
}
```

### Personnummerkontroll (format + kontrollsiffra + tillåten lista)
```ts
// Luhn över de tio sista siffrorna (ÅÅMMDDNNNK). Allowlistan är Skatteverkets
// testpersonnummer, incheckade som öppna data (se Öppna frågor 3).
export function luhnOk(ten: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(ten[i]) * (i % 2 === 0 ? 2 : 1);
    if (d > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
}
export function parsePersonnummer(input: string, allow: ReadonlySet<string>):
  { ok: true; value: string } | { ok: false; reason: 'format' | 'not_synthetic' } {
  const m = /^(\d{8})-?(\d{4})$/.exec(input.trim());
  if (!m || !luhnOk((m[1] + m[2]).slice(2))) return { ok: false, reason: 'format' };
  const value = m[1] + m[2];
  return allow.has(value) ? { ok: true, value } : { ok: false, reason: 'not_synthetic' };
}
```
`[ASSUMED]` Luhn-regeln och 12-siffrigt format ur träningskunskap; Skatteverket anger endast att testnumren är "rätt definitionsmässigt" med korrekt kontrollsiffra `[CITED: skatteverket.se]`. Servern (SQL-funktionen) gör samma kontroll mot en tabell med den tillåtna listan; klientkontrollen är bara bekvämlighet.

### Urval i adressen utan sökord
```ts
const KEYS = ['vy', 'lasar', 'skola', 'klass', 'utbildning', 'ak', 'status', 'sida'] as const;
export function selectionToQuery(s: Selection, defaults: Selection): string {
  const q = new URLSearchParams({ vy: 'elever' });
  for (const k of KEYS.slice(1)) if (s[k] !== undefined && s[k] !== defaults[k]) q.set(k, String(s[k]));
  return `?${q}`;           // aldrig 'sok'
}
// sessionStorage-nyckel knuten till uppdrag och epok, t.ex. `sp_elevsok:${assignmentId}:${epoch}`
```

### Worker-route (skiss)
```ts
// web/app/api/elever/andra/route.ts – följer app/api/prov/elev/route.ts
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'pupil_update', {
    mutating: true, mfa: true, audit: 'required', functions: ['administrator'],
  }, async (_ctx, tx) => {
    const change = parsePupilChange(await request.json());          // stängt schema, 400 annars
    const result = await changePupil(tx, change);                    // mandateOperation + SQL; 409 med details
    return { body: result, event: { action: change.eventAction, objectType: 'pupil',
      objectId: change.pupilId, details: { fields: change.fieldNames } } };
  });
}
```

## State of the Art

| Äldre sätt | Nuvarande sätt | Ändrat | Konsekvens |
|------------|----------------|--------|------------|
| Elever i `AdminState` (exempelläge) | Beständigt register i protected-miljön | Fas 4 | Exempelläget förblir utan backend (UI-SPEC). |
| `offerings.cohort` fritext | `offerings.start_year` heltal + härledd årskurs | Fas 4 (D-07) | Fas 5 kan härleda `cohort` ur startåret. |
| Klass som namnsträng (`class_timplans(unit_id, class_name, start_year)`) | `school_classes` med ID, samma naturliga nyckel | Fas 4 | Fas 5 kan koppla klass–timplan via ID. |
| Fast elevskola i scope | Placering i tidsfönster | Fas 4 | Mandatet följer placeringen, inte eleven. |
| Periodöverlapp i trigger | `EXCLUDE` + `btree_gist`; PG 18 har temporala nycklar `WITHOUT OVERLAPS` `[ASSUMED]` | – | Byt inte PG-version för detta. |

**Utgår i fasen:** `phase3_read_pupils`, `/api/prov/*`, `pupil-probe-workspace.tsx`, menyposten "Syntetiskt elevprov" (UI-SPEC).

## Assumptions Log

| # | Antagande | Avsnitt | Risk om fel |
|---|-----------|---------|-------------|
| A1 | Läsåret går 1 juli–30 juni (fönster `[Y-07-01, Y+1-07-01)`). | Mönster 2, kodexempel | Elever vid terminsgräns hamnar i fel läsår. Alternativ: skolans `school_years`-kalender (finns inte för alla skolor). |
| A2 | Status Aktiv/Kommande/Avslutad räknas mot `app_today()`, inte mot valt läsår. | Mönster 3 | Missvisande status i äldre/framtida läsår. |
| A3 | Administratör får bara ändra elever med aktuell eller framtida placering vid mandatets skola. | Mönster 2 | Antingen för bred skrivrätt eller att nödvändiga rättelser av historik blockeras. |
| A4 | Administratör utan skyddsbehörighet ser inte hemkommun och får inga åtgärder för skyddad elev. | Mönster 3 | Kan röja eller stoppa arbetsfall. |
| A5 | Skatteverkets testpersonnummer är 12-siffriga med Luhn på de tio sista siffrorna och får checkas in som öppna data. | Kodexempel, Don't hand-roll | Fel validering eller licensfråga; fallback: tydligt fiktivt format. |
| A6 | `btree_gist` installeras i schemat `extensions`. | Standard Stack | Migrationen misslyckas; lätt att rätta. |
| A7 | Dynamiska ruttsegment i Vinext är oprövade; fasta sökvägar används. | Filstruktur | Ingen risk, bara stil. |
| A8 | Flera säkerhetshändelser i en route (en per visad skyddad elev) går att skriva med `logEvent` i handlern. | Mönster 5 | Måste annars lösas med en händelse med `count`. |
| A9 | PG 17 saknar `WITHOUT OVERLAPS`. | Alternativ | Ingen, eftersom rekommendationen inte bygger på det. |
| A10 | Lärarens gruppscope motsvarar klasser i fas 4 (både `undervisning` och `mentor` pekar på `school_classes`). | Ersättning | Undervisningsgrupper som inte är klasser saknar modell. |

## Open Questions

1. **Vem ger skyddsbehörigheten, och byggs tilldelningen i UI i fas 4?**
   - Vet: D-03 kräver uttrycklig behörighet för administratör vid placeringsskolan. UI-SPEC nämner ingen kontroll i tilldelningsdialogen.
   - Oklart: om rektor ger den (kryssruta i `mandate-grant-dialog.tsx` vid funktion `administrator`) eller om den bara seedas i fas 4.
   - Rekommendation: kolumn/tabell på mandatet (t.ex. `access_assignments.protected_identity_access boolean` med formprövning bara för `administrator`), rektor tilldelar via befintlig dialog, loggas som behörighetsändring. Om UI utelämnas i fas 4: dokumentera att rätten bara ges via fixtur och att DATA-01:s arbetsfall prövas med seedat mandat.
2. **Läsårsgräns och elevstatus per läsår** (A1, A2) – bekräfta med användaren eller välj och dokumentera i `docs/pilot/phase4-register.md`.
3. **Syntetiska personnummer** – Skatteverkets fil laddas ned en gång (nätverk krävs) och ett urval med födelseår 2008–2020 checkas in, eller ett tydligt fiktivt format väljs. Kräver en `checkpoint:human-verify` om licens/format inte kan bekräftas av exekveraren.
4. **Kommunlista** – full SCB-lista (290 kommuner) eller ett begränsat urval för piloten? Koderna är offentliga, inte personuppgifter.
5. **Undervisningsgrupper** (A10) – räcker klasser som grupp i fas 4?
6. **Skrivrätt för historiska elever** (A3).
7. **Visning för administratör utan skyddsbehörighet** (A4) och exakt format på `anonymous_name` (ska inte innehålla ord som "skyddad", "dold", "anonym" enligt UI-SPEC; ska inte heller se avvikande ut i förhållande till andra namn mer än nödvändigt).

## Environment Availability

| Beroende | Krävs av | Tillgängligt | Version | Reserv |
|----------|----------|--------------|---------|--------|
| Node | modellprov, grind | ✓ | v25.9.0 (`/opt/homebrew/opt/node@25/bin`) | – |
| Docker | lokala mål | ✓ | 25.0.2 | – |
| Supabase CLI | `supabase test db`, `migration up` | ✓ | 2.78.1 | – |
| psql (klient) | fixturskript | ✓ | 14.15 (servern 17.6) | – |
| Protected-mål (Supabase + Keycloak) | SQL/API/browser | ✓ körs (containrar healthy; 28 migrationer, senaste `20260927090000`) | PG 17.6 | – |
| Baseline-mål | regression baslinje-db | ✓ körs | – | – |
| `btree_gist` | periodgaranti | ✓ tillgängligt, ej installerat | 1.7 | – |
| Docusaurus-beroenden | `npm run docs:build` | ✓ (`docs-site/node_modules`) | – | – |
| Nät för Skatteverkets testpersonnummer | fixturdata | ej prövat | – | Tydligt fiktivt format |

**Blockerande utan reserv:** inga.
**Noterat:** Den lokala stacken nås bara på localhost; fysisk telefon är fortsatt öppet beslut (fas 3). Fynd från 2026-09-28: inloggning från `localhost` i stället för `127.0.0.1` ger `login_state_invalid` (deferred-items) – använd `127.0.0.1` i prov eller ta rättningen i fasen.

## Validation Architecture

### Test Framework

| Egenskap | Värde |
|----------|-------|
| Ramverk | `node:test` (Node 25), pgTAP 1.3.3 via `supabase test db --local`, egna API-provskript (`work/pilot/*.mjs`), Playwright 1.63.0 |
| Konfig | `web/playwright.protected.config.ts` (lägg `phase4-register` i `testMatch` på toppnivå och i protected-desktop/-phone/-built), `supabase/tests/`, `work/pilot/verify-target.mjs` |
| Snabbkommando | `cd web && node --test lib/pupil-register-model.test.mjs lib/server/pupil-register.test.mjs` |
| Full svit | `cd web && npm run verify:phase4` (ny, fail-closed, byggd på `verify-phase3.mjs`) |

### Phase Requirements → Test Map

| Krav | Beteende | Typ | Automatiskt kommando | Finns? |
|------|----------|-----|----------------------|--------|
| STU-01 | Samma elev-ID och sparat namn efter ny session | API + browser | `node work/pilot/verify-register.mjs --case register-reload` ; spec "administratören återfinner eleven efter utloggning" | ❌ Wave 0 |
| STU-01 | Elev-ID skilt från `identities`/konto | pgTAP | `node work/pilot/run-sql-tests.mjs --file phase4_register.test.sql --out <scratch>` | ❌ |
| STU-02 | Aktuell/framtida/avslutad gruppering; skolbyte avslutar + startar atomiskt; överlapp nekas (23P01/400) | modell + pgTAP + API | `node --test lib/pupil-register-model.test.mjs` ; `--file phase4_periods.test.sql` ; `--case placement-change` | ❌ |
| STU-03 | Klassbyte ger ny period, bevarar förra, rör inte utbildning; varning vid annan utbildning; tidigast-datum | pgTAP + API + browser | `--file phase4_periods.test.sql` ; `--case class-change` ; spec "klassbyte bevarar historik och utbildning" | ❌ |
| STU-04 | Ursprung per fält; simulerad leverans ≠ lokal rättelse ⇒ avvikelse, ingen överskrivning; båda valen loggas och syns i historik | pgTAP + API + browser | `--file phase4_register.test.sql` ; `node work/pilot/phase4-simulated-source.mjs --target protected` ; `--case source-discrepancy` | ❌ |
| STU-05 | Serverurval per skola/läsår, filter, sida, sökning (POST), namnlika skiljs åt, urval i adress, sökord aldrig i URL/nätverksfrågesträng | modell + API + browser | `node --test lib/pupil-register-model.test.mjs` ; `--case search-filter` ; spec "urval överlever bakåt och omladdning utan sökord i adressen" | ❌ |
| STU-06 | Andra sparningen nekas med vem/när/fält; val per fält sparas; periodkonflikt | modell + pgTAP + två anslutningar + browser | `node work/pilot/verify-register-locks.mjs` ; `--file phase4_conflicts.test.sql` ; `--case concurrent-edit` ; spec "två administratörer får konflikt" | ❌ |
| DATA-01 | Skyddad elev: behörig admin söker/öppnar/ändrar/exporterar; lärare ser anonymt namn; obehörig admin/lärare/support: ingen sökträff, inget märke, samma 404, oförändrat antal/sidantal; inget i DOM/sessionStorage/nätverk/logg | pgTAP + API + browser | `--file phase4_protected.test.sql` ; `--case protected-admin`, `protected-teacher`, `protected-unauthorized`, `protected-direct` ; spec "skyddad elev röjs inte" | ❌ |
| DATA-02 | Export: bara valda fält/elever, personnummer och skyddade bara vid uttryckligt val; främmande ID, otillåtet fält, utan mandat, utan MFA nekas och loggas; egen händelsetyp för personnummerexport | modell (CSV) + pgTAP + API + browser | `--file phase4_export.test.sql` ; `--case export-selection`, `export-direct-denied`, `export-personnummer` | ❌ |
| AUDIT (regression) | Logg före svar för lista/kort/reveal/historik/ändring/export; loggfel ⇒ inget innehåll, ingen ändring | API | `--case audit-register-read-fail`, `audit-register-write-rollback` | ❌ |
| Fas 3-regression | Mandatkedja, gruppscope, elevhälsa, support mot registret; `/api/prov` borta | SQL + API + browser | `node work/pilot/run-sql-tests.mjs --out …` (alla filer) ; `node work/pilot/verify-mandates.mjs --out …` (portade fall) | ✅ finns, måste portas |
| Bevarandeflöden | Gymnasieutbildning, kurs-/nivåtillägg, kullkopiering, klass–timplan | DB-regression | `node work/pilot/verify-baseline-db.mjs` | ✅ |
| Handbok | Verifierat beteende beskrivet | bygge | `npm run docs:build` (projektroten) | ✅ |

### Sampling Rate
- **Per uppgift:** berörd modellfil med `node --test` (< 5 s) samt `npx tsc --noEmit` och `npx oxlint app lib`.
- **Per SQL-ändring:** berörd pgTAP-fil via `run-sql-tests.mjs --file` (transaktion med rollback; kräver protected-målet).
- **Per våg:** alla `lib/*.test.mjs lib/server/*.test.mjs`, alla SQL-filer, `verify-register.mjs` för vågens fall.
- **Fasgrind:** `npm run verify:phase4` grön (inga hopp i fas 4-browsern, färsk revision/fingeravtryck) före `gsd-verify-work`.

### Wave 0 Gaps
- [ ] `web/lib/pupil-register-model.test.mjs` – läsår, årskurs, gruppering, urval↔adress, personnummer, CSV, konfliktmodell.
- [ ] `web/lib/server/pupil-register.test.mjs` – parsers (stängda scheman), radkopiering, SQLSTATE→svar (inkl. `23P01`, `40001` med detaljer).
- [ ] Utökat `web/lib/server/events.test.mjs` – `/api/elever` i `ROUTES`, nya detaljnycklar.
- [ ] `supabase/tests/phase4_{register,periods,protected,conflicts,export}.test.sql` + uppdaterade `phase3_*.test.sql`-fixturer.
- [ ] `work/pilot/sql/phase4-fixtures.sql` – minst två namnlika elever, en skyddad, en med framtida placering, en med avslutad, en med klassbyte till annan utbildning, en med hemkommunsbyte, en med avvikelse (UI-SPEC Acceptance Evidence).
- [ ] `work/pilot/phase4-browser-fixtures.mjs` – två administratörer (en med skyddsbehörighet), lärare i den skyddade elevens klass, support.
- [ ] `work/pilot/verify-register.mjs` (namngivna fall, delurval ⇒ PARTIAL) och `verify-register-locks.mjs` (två anslutningar).
- [ ] `web/e2e/phase4-register.spec.ts` i protected-desktop, -phone, -built.
- [ ] `web/scripts/verify-phase4.mjs` + `.test.mjs`, `npm run verify:phase4`, `REQUIRED_SQL_FILES` utökad, läckagemönster med fas 4:s namnmarkör.

## Security Domain

`security_enforcement` saknas i `.planning/config.json` ⇒ aktiverat.

### Tillämpliga ASVS-kategorier

| ASVS-kategori | Gäller | Standardkontroll |
|---------------|--------|------------------|
| V2 Autentisering | ja | Befintlig OIDC + engångskod; `requireMfa` (8 h) för ändring, personnummervisning, export. |
| V3 Sessionshantering | ja | `withSessionContext` (lås, utgång, epok), `X-Context-Epoch`, rensning vid kontextbyte. |
| V4 Åtkomstkontroll | ja | `phase3_actor()` + scope-funktion per läsår + projektion i SQL; tabeller med `force row level security` och indragna rättigheter; identiskt 404. |
| V5 Indatavalidering | ja | Stängda parsers som `parseMandatePayload`; UUID-regex; datum `^\d{4}-\d{2}-\d{2}$`; personnummer mot tillåten lista i SQL; `ILIKE`-escaping. |
| V6 Kryptografi | nej (ingen ny) | Personnummer lagras i klartext i syntetisk miljö; kryptering i vila är ett senare driftbeslut. |
| V7 Loggning | ja | `security_events` före svar, stängda detaljscheman, inga värden; verksamhetshistorik separat. |
| V8 Dataskydd | ja | `Cache-Control: no-store`, sökord aldrig i URL, personnummer bara på begäran, rensning av klienttillstånd. |
| V13 API | ja | `requireSameOrigin` för POST (även läsande POST rekommenderas), `functions`-lista, JSON-scheman. |

### Kända hotmönster

| Mönster | STRIDE | Standardmotåtgärd |
|---------|--------|-------------------|
| IDOR mot elev-ID | Information disclosure | Scope i SQL; utanför scope ⇒ `P0002` ⇒ samma 404 som okänd elev. |
| Uppräkning via personnummersökning | Information disclosure | Exakt match för personnummer, bara för administratör, skyddade utesluts för obehöriga; sökningen loggas. |
| Metadata via antal/sortering/filter | Information disclosure | Räkna och sortera efter projektion; filtervärden ur skolans klasser. |
| Masshämtning via export | Information disclosure | MFA, stängd fältlista, omräknat urval, egen händelsetyp för personnummer. |
| Tyst överskrivning | Tampering | Radlås + revision per fält, 409 med detaljer. |
| Förfalskad historik/aktör | Repudiation | Historik skrivs i SECURITY DEFINER-funktionen med aktör ur `phase3_actor()`; append-only-trigger som `security_events_immutable`. |
| CSV-formelinjektion | Tampering | `csvCell` prefixar `^[=+\-@\t\r]`. |
| Direkt REST/RPC mot nya tabeller | Elevation of privilege | Inga rättigheter för `anon/authenticated/skolplattform_worker` på tabeller; bara utvalda funktioner granteras; källprov som i fas 3 (`direct-rest/rpc/sql`). |
| Simulerad källa som Worker-väg | Elevation of privilege | Källfunktionen granteras inte Worker; körs endast av CLI efter `assertTarget('protected')`. |

## Sources

### Primära (HÖG)
- Kod i repot, läst 2026-09-28: `supabase/migrations/20260922100000_phase3_mandates.sql`, `20260924130000_phase3_mandate_policy.sql`, `20260924150000_phase3_policy_parameter_binding.sql`, `20260926090000_phase3_workspace_options.sql`, `20260926100000_phase3_pupil_probe_worker_read.sql`, `20260927090000_phase3_support_groups.sql`, `20260913100000_phase2_worker_core.sql`, `20260913200000_phase2_access_model.sql`, `20260905120000_huvudman.sql`, `20260905170000_timplan_lasar.sql`, `20260908120000_cohorts_classes.sql`; `web/lib/server/{authz,db,events,audit-details,http,mandates,mandate-route,pupil-probe}.ts`; `web/app/api/prov/{elev,export}/route.ts`; `web/app/{protected-home,pupil-probe-workspace,mfa-step-up}.tsx`; `web/lib/{server-client,pupil-probe-model,audit-export,admin-model}.ts`; `web/scripts/verify-phase3.mjs`; `work/pilot/{run-sql-tests,prepare-local,phase3-browser-fixtures,verify-mandates,verify-mandate-locks}.mjs`; `work/pilot/sql/phase3-fixtures.sql`; `supabase/tests/phase3_temporal.test.sql`; `web/playwright.protected.config.ts`; `web/package.json`.
- Skrivskyddade frågor mot protected-DB: `version()`, `pg_available_extensions`, `pg_extension`, `supabase_migrations.schema_migrations`, radantal.
- Planering: `04-CONTEXT.md`, `04-UI-SPEC.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `codebase/CONCERNS.md`, `research/PITFALLS.md`, `03-VERIFICATION.md`, `03-VALIDATION.md`, `03-07-SUMMARY.md`, `deferred-items.md`, `docs/pilot/mandatmatris.md`, `docs/plan-digital-lasarsmodell.md`.

### Sekundära (MEDEL, officiell dokumentation)
- [PostgreSQL 17: btree_gist](https://www.postgresql.org/docs/17/btree-gist.html) – uuid-stöd, trusted, exempel med `EXCLUDE`.
- [PostgreSQL 17: Range Types](https://www.postgresql.org/docs/17/rangetypes.html) – uteslutningsvillkor på intervall, kombination med btree_gist, kanonisk form `[)`.
- [Skatteverket: Testpersonnummer som öppen data](https://www.skatteverket.se/omoss/digitalasamarbeten/omvaraoppnadata/testpersonnummersomoppendata.4.5b35a6251761e6914202df9.html) – ca 40 000 testnummer, spärrade för verklig tilldelning, får användas av alla i testmiljöer.
- [Skatteverket utvecklarportal: Testpersonnummer](https://www7.skatteverket.se/portal/apier-och-oppna-data/utvecklarportalen/oppetdata/Test%C2%AD%C2%ADpersonnummer) – nedladdningsplats (innehållet kunde inte läsas automatiskt).
- [SCB: Län och kommuner i kodnummerordning](https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/lan-och-kommuner/lan-och-kommuner-i-kodnummerordning/) – källa för kommunkoder.

### Tertiära (LÅG)
- Träningskunskap om Luhn-kontrollsiffra i personnummer och PG 18:s temporala nycklar (märkta `[ASSUMED]`).

## Metadata

**Tillförlitlighet per område:**
- Nuläge och återanvändbara mönster: HÖG – lästa filer och citerade rader.
- Datamodell och periodgaranti: MEDEL–HÖG – officiell PG-dokumentation + verifierad tilläggstillgång; modellen själv är ett förslag.
- Ersättning av elevprovet: MEDEL – bindningarna är verifierade; ordningen är en rekommendation.
- Fallgropar: HÖG för de kodbelagda (1, 5, 6, 7, 8, 9, 12, 13), MEDEL för läckagemönstren (2, 3, 4, 11).
- Personnummer/kommunlista: LÅG–MEDEL tills filerna hämtats och formatet bekräftats.

**Researchdatum:** 2026-09-28
**Giltig till:** ca 2026-10-28 (stabil stack); omprövas om fas 3-filerna ändras före planeringen.
