# Phase 2: Verifierad kontoåtkomst - Context

**Gathered:** 2026-09-12
**Status:** Planering klar och oberoende omgranskad 2026-09-13; redo för genomförande

<domain>
## Phase Boundary

Personal loggar in med en verifierad extern identitet, väljer ett giltigt uppdrag som arbetskontext, nekas annan kunds objekt och röjande metadata även vid direkta anrop, sökning, export och filvägar, kan spärras så att nästa skyddade anrop nekas trots utfärdad token, och varje beständig ändring får en serververifierad säkerhetshändelse. Krav: IAM-01, IAM-03, IAM-04, IAM-05, ACL-01, AUDIT-01.

Fasen bygger appens kontrakt mot en **avskild testidentitet**. Den faktiska kommun-IdP:n och fördröjningen från extern kontokälla godkänns i fas 7 och får inte markeras uppfyllda här. Uppdragsmodellens innehåll (HM utser rektor, rektor tilldelar läraruppdrag inom sitt mandat) är fas 3; fas 2 bygger den grund (kund, medlemskap, uppdrag med giltighet, kontextval) som fas 3 fyller. Elevregister och läsloggning av elevinnehåll är fas 4.

</domain>

<decisions>
## Implementation Decisions

### Inloggning och testidentitet
- **D-01:** Inloggning i fas 2 sker mot en **lokal OIDC-testleverantör** (Keycloak eller motsvarande i Docker, i samma disponibla provmiljö som fas 1:s Supabase-mål) kopplad via Supabase Auth. Federationsvägen — utfärdare, anspråk, utloggning — ska provas nu för att återanvända appens sessions- och behörighetsflöde vid senare leverantörsbyte. Precisering 2026-09-13: ny leverantör måste stödja det avtalade protokollet och beviskontraktet; direkt BankID eller ändrad extern identitet är inte garanterat enbart ett konfigurationsbyte. Ingen e-post/lösenord-inloggning byggs som huvudväg.
- **D-02:** En person identifieras av **(issuer, sub)**. E-post och namn är visningsuppgifter, aldrig nyckel. Samma person hos två kunder är två medlemskap på samma identitet. Ingen automatisk sammanslagning på namn eller e-post.
- **D-03:** **MFA-bevis krävs för administrativa åtgärder** (etablering, inbjudan, spärr, avslut av uppdrag). Appen läser IdP:ns anspråk (amr/acr) och nekar utan bevis; test-IdP:n konfigureras med TOTP. Appen kör ingen egen TOTP.

### Första företrädaren (IAM-01)
- **D-04:** Kundens första medlemskap etableras genom en **leverantörsutfärdad engångsinbjudan**: tidsbegränsad, bunden till namngiven person och förväntad utfärdare, utfärdad efter verifiering utanför appen (avtal, kontakt med huvudmannen). Inbjudan löses in med den externa identiteten; först då uppstår medlemskapet. Organisationsnummer, e-postdomän eller uppslag i Skolenhetsregistret ger aldrig rättigheter i sig.
- **D-05:** **Kund ≠ huvudman.** Kunden (avtalspart/tenant) är en egen nivå ovanför `organizers`; en kommun kan ha flera nämnder/huvudmän och en koncern flera bolag. Första medlemskapet gäller kunden; huvudmän och skolenheter knyts under kunden. Befintliga `organizers` och deras data bevaras och knyts till en kund vid migration.
- **D-06:** Första företrädaren får **enbart kundadministration**: bjuda in fler, sätta upp huvudman och skolenheter, utse rektor. Ingen elev- eller undervisningsåtkomst följer av kundadministrationen; sådana rättigheter kräver eget uppdrag.

### Uppdragsval och kontextbyte (IAM-03, IAM-04)
- **D-07:** Uppdragsväljaren sitter **alltid i sidhuvudet** och visar aktuell kund · huvudman · skolenhet · funktion, i stil med fas 1:s Exempelskola-väljare och Plan Digitals skol-/läsårsval. En person med ett enda uppdrag ser bara etiketten. Byte sker utan ny inloggning.
- **D-08:** Vid byte av uppdrag och vid utloggning **rensas allt klienttillstånd med elev-/verksamhetsinnehåll i alla flikar**: övriga flikar får besked (BroadcastChannel eller motsvarande) och låser sig till den nya kontexten eller till utloggat läge. Osparade ändringar varnas före byte.
- **D-09:** Väljaren listar **bara uppdrag som gäller idag** som valbara; kommande (t.ex. vikariat från nästa månad) och avslutade uppdrag visas gråa med datum. Servern prövar giltighet vid varje anrop, inte bara vid valet.

### Spärr, sessionsslut och säkerhetslogg (IAM-05, ACL-01, AUDIT-01)
- **D-10:** **Serverlager i den byggda Workern** för skyddade åtgärder: cookie-baserad appsession, kontext (kund, medlemskap, uppdrag) prövas per anrop, aktör och uppdrag härleds på servern. Databasens RLS behålls som andra försvarslinje mot alternativa vägar. Klienten får inte längre skriva `actor_role` eller andra aktörsfält. Sessions- och cookieflödet provas tidigt i byggd Worker, före elevregistret.
- **D-11:** **Prövning per anrop mot medlemskaps-/uppdragstabellerna.** En token bevisar identitet, aldrig rättighet. Spärr eller avslutat uppdrag = nästa skyddade anrop nekas oavsett tokenens giltighet. Appsessionen har kort glidande livstid (storleksordning 15 minuter) så att även identitetsdelen löper ut snabbt; exakt värde är Claude's discretion.
- **D-12:** **Kundadministratör spärrar inom sin kund** (medlemskap och uppdrag, med MFA-bevis). Leverantören kan spärra på kundens begäran endast via en loggad nödrutin utanför appens vanliga väg, aldrig via en generell adminvy i appen.
- **D-13:** Säkerhetsloggen skrivs **på servern, oföränderlig för verksamhetsanvändare**, med en händelse per beständig ändring: aktör (issuer, sub), faktiskt uppdrag, tid, källa, objekt, resultat, korrelations-ID. Inloggning, utloggning, kontextbyte, inbjudan, spärr och **nekade anrop** loggas också. En **granskarfunktion hos kunden** kan läsa och exportera sin kunds logg. Läsningar av elevinnehåll loggas först när elevregistret finns (fas 4). Befintliga händelsetabeller (`organisation_events`, `point_plan_events`, `timplan_events`, `school_year_events`) får inte längre ta emot klientvald `actor_role`.

### Preciseringar efter research (2026-09-12, godkända av användaren)
- **D-16:** Supabase Auth kan inte förmedla MFA-anspråk (GoTrue:s Keycloak-provider läser bara userinfo; se 02-RESEARCH.md). Därför är **Workern själv OIDC-klient** mot testleverantören och läser `acr`/`amr`/`auth_time` direkt ur ID-token. Supabase Auth behålls för identitetsregistrering och `auth_user_id` via `grant_type=id_token`. Eftersom Supabase Auth automatiskt länkar identiteter med samma e-post är appens nyckel alltid `identities(issuer, subject)`; `auth_user_id` är referens.
- **D-17:** Den lokala provmiljön kräver en engångsrad `127.0.0.1 host.docker.internal` i `/etc/hosts` (användaren godkände detta). `prepare-local` kontrollerar raden och rapporterar BLOCKED om den saknas; inget skript ändrar `/etc/hosts` självt.
- **D-18:** Inget UI-SPEC tas fram för fas 2; fas 2:s ytor (uppdragsväljare, inbjudan, spärr, granskarens loggvy) följer `01-UI-SPEC.md`:s regler för pekytor, fokus och kontrast och fas 1:s väljarmönster.

### Beställd beredskapsgranskning 2026-09-13

- **D-19:** Användaren har beställt beredskap för att kunna ansluta BankID senare när det behövs, inte full integration i fas 2. Granska befintlig kod och planer, dokumentera minsta nödvändiga förberedelser och komplettera berörda planer. Starta inte appimplementation under granskningen.
- Identitetskontroll, MFA, behörighet/beslutsmandat och elektronisk underskrift är olika frågor. Lokalt TOTP-prov är inte bevis på viss personidentitetsnivå eller på godkänt myndighetsbeslut. Inga nya rättsliga krav eller tillitsnivåer fastställs av denna granskning.
- Teknisk precisering inom uppdraget: leverantörsspecifik registrering och bevismappning hålls bakom små servergränser; bevis bedöms mot godkänd utfärdar-/klientprofil; extra verifiering binds till ursprunglig session och arbetskontext. Interna identitets-ID:n bevaras, och e-post, namn eller auth_user_id får aldrig automatiskt länka behörigheter.
- Direkt BankID-anslutning, verklig kontolänkning, beslutsbunden engångsverifiering och elektronisk underskrift utreds separat före aktivering av respektive flöde. Inga nya person-/länktabeller eller generell policyplattform krävs nu. Rapporten `docs/pilot/bankid-readiness-review.md` skiljer förberedelser från senare integration.

### Redan beslutade ramar
- **D-14:** Kundisolering enligt ACL-01 gäller innehåll, filer, sökträffar, exporter **och existensuppgifter**: ett känt objekt-ID från annan kund ger samma svar som ett obefintligt. Fas 1:s fynd att `registry_snapshots` läses över kundgränsen (`auth.uid() is not null`) rättas i denna fas.
- **D-15:** Fas 1:s exempelläge (`example`) förblir helt utan backend. Läget `protected` öppnas i denna fas, men endast via serverlagret och den lokala provmiljön; inga molnnycklar och ingen `--linked`-drift. Demoetablering (`bootstrap_demo_profile`, demohuvudman) tas bort ur den körda databasen som del av att `protected` öppnas.

### Claude's Discretion
- Val av OIDC-testleverantör (Keycloak är utgångspunkt), hur den seedas med testkund, testpersoner och TOTP, och hur den startas i samma `prepare-local`-flöde som fas 1:s mål.
- Sessionsmekanik i Workern (cookieattribut, glidande livstid, CSRF-skydd, hur Supabase-token och appsession förhåller sig till varandra).
- Tabellmodell för kund, medlemskap, uppdrag, inbjudan och säkerhetshändelser, samt hur befintliga `profiles`/`assignments` migreras utan att förlora användarskapat material (D-08 i fas 1 gäller).
- Hur nekanden loggas utan att loggen kan fyllas av en angripare (rate limit/aggregering).
- Val av kanal för flikrensning och hur "osparat" avgörs i befintliga vyer.
- Testupplägg: fas 1:s `verify-isolation`, pgTAP och Playwright-projekt utökas snarare än ersätts; acceptansfallen i `docs/kommunintegration-och-sakerhet.md` (rader om spärr, gamla sessioner, annan kunds objekt-ID, samma e-post hos två kunder) blir körbara kontroller.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Säkerhets- och behörighetsmodell
- `docs/pilot/bankid-readiness-review.md` — riktad granskning 2026-09-13; minsta beredskap nu, senare BankID-/underskriftsarbete och belägg.
- `docs/kommunintegration-och-sakerhet.md` §1 (inloggning och kontolivscykel), §2 (behörighet följer uppdrag: identity → memberships → assignments → permissions), §3 (kund ≠ huvudman, isolering), §5 (säkerhetshändelser på servern), §7 (Supabase och serverlager), samt tabellen *Acceptansfall som gör kraven prövbara* — flera rader är direkta testfall för denna fas.
- `.planning/REQUIREMENTS.md` — IAM-01, IAM-03, IAM-04, IAM-05, ACL-01, AUDIT-01 (ordagrann lydelse).

### Fas 1-resultat som fasen bygger på
- `.planning/phases/01-baslinje-och-avskild-pilotmilj/01-CONTEXT.md` — D-06–D-09 (syntetiska uppgifter, bevarade flöden, baslinje, avskiljning).
- `.planning/phases/01-baslinje-och-avskild-pilotmilj/01-VERIFICATION.md` — vad som är bevisat och hur (pgTAP, `verify-isolation.mjs`, Playwright-projekt).
- `docs/pilot/baseline.md`, `docs/pilot/README.md` — hur provmiljön startas och vad som är historik.
- `docs/pilot/connection-profile.md` — öppna beroenden OB-01–OB-08 (IdP, kontokälla) som fasen inte får låtsas stänga.
- `work/pilot/prepare-local.mjs`, `work/pilot/verify-target.mjs`, `work/pilot/verify-isolation.mjs` — mönster för disponibla mål, målskydd och API-prov.
- `supabase/migrations/20260911120000_quarantine_demo_access.sql` — karantänen som fasen öppnar medvetet igen, väg för väg.

### Kodkarta
- `.planning/codebase/ARCHITECTURE.md` — dataflöden, dagens `profiles`/`current_app_role()`-modell, avsaknad av serverlager.
- `.planning/codebase/CONCERNS.md` — breda databasmandat, klientskrivna aktörsfält, samtidiga sparningar.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/lib/runtime-mode.ts` — lägeskontraktet `example|blocked`; `protected` läggs till här, stängt som standard.
- `web/lib/supabase.ts` — skapar ingen klient sedan fas 1; serverlagret blir den enda vägen till databasen i `protected`.
- `web/app/api/skolenhet/route.ts` — enda befintliga server-routen; mönster för Worker-endpoints.
- `web/scripts/run-mode.mjs`, `dist/build-mode.json` — bygg- och lägesmärkning som serverlagret kan läsa.
- `work/pilot/*` — målskydd, manifest, isolerings- och baslinjeprov att utöka med Keycloak-mål och sessionsprov.
- `supabase/tests/phase1_isolation.test.sql` — pgTAP-mönster för rättighetsbevis.
- `web/e2e/phase1-isolation.spec.ts` — nätverksövervakning i webbläsaren; utökas med cookie-/kontextprov.
- Exempelskola-väljaren i `web/app/page.tsx`/`organisation-workspace.tsx` (fas 1) — förlaga för uppdragsväljaren i sidhuvudet.

### Established Patterns
- Versionerade beslut med händelselogg och RLS per tabell; `current_organizer_id()`/`current_app_role()` som `security definer`-hjälpare — ersätts av kontextprövning på servern, RLS blir andra linje.
- En roll och en huvudman per `profiles`-rad — bryts upp i identitet → medlemskap (per kund) → uppdrag (med giltighet).
- Händelsetabeller tar `actor_role` från klienten (`savePointPlanEvent`, `planning-store.ts`) — får inte behållas.

### Integration Points
- Sidhuvudet i `web/app/page.tsx` (skolväljare, rollväxlare "Prova som" som i `protected` ersätts av verkliga uppdrag).
- Alla `*-store.ts` som idag talar direkt med Supabase — får en server-klient i `protected`.
- `supabase/config.toml` per mål (fas 1) — OIDC-leverantör konfigureras per mål, aldrig i molnet.

</code_context>

<specifics>
## Specific Ideas

- Uppdragsväljaren ska kännas som Plan Digitals topprad: alltid synlig, visar kontext och status, byte utan omstart (jfr `docs/plan-digital-lasarsmodell.md`).
- Acceptansfallen i säkerhetsdokumentet ska bli körbara kontroller i `work/pilot/` på samma sätt som fas 1 gjorde med isoleringen: "Ett uppdrag löper ut under en redan öppen session → nästa skyddade anrop nekas", "Kommunen spärrar kontot → åtkomst upphör inom uppmätt tid inklusive gamla sessioner", "Samma personnamn/e-post hos två kunder → ingen sammanslagning", "Känt objekt-ID från annan kund → inga existensuppgifter".

</specifics>

<deferred>
## Deferred Ideas

- Leverantörens egen åtkomstväg (Supabase-panel, service-nyckel, dashboard) med egen loggning och MFA — tas upp i fas 6 (spårbarhet/drift) enligt färdplanen; nämnd i säkerhetsdokumentet.
- Vårdnadshavar- och elevinloggning (e-legitimation) — utanför första milstolpen.
- SCIM/katalogsynk av konton från kommunen — fas 7 tillsammans med IdP-anslutningen.

### Reviewed Todos (not folded)
- **API för lärares behörigheter med statistisk uppföljning** — hör till uppdragsmodellen (fas 3) och kräver giltighet/historik som fas 2 lägger grunden för; kvar i kön.
- **Läsårslins: ställa sig i ett läsår som i Plan Digital** — planeringsfunktion utan koppling till kontoåtkomst; kvar i kön.

</deferred>

---

*Phase: 02-verifierad-konto-tkomst*
*Context gathered: 2026-09-12*
