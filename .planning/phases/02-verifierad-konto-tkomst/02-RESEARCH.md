# Fas 2: Verifierad kontoåtkomst — Research

**Researchad:** 2026-09-12
**Domän:** OIDC-federation mot lokal test-IdP, cookie-baserad appsession i byggd Vinext/Cloudflare-Worker, kund/medlemskap/uppdrag-modell i Postgres med RLS som andra linje, oföränderlig säkerhetslogg
**Konfidens:** MEDIUM–HIGH (leverantörskällkod och lokal miljö verifierade; den byggda Workerns TCP-anslutning till Postgres och Keycloaks claims-beteende behöver ett tidigt spik, se Open Questions)

Märkning i dokumentet: **[VERIFIED: källa]** = kontrollerat i källkod, officiell dokumentation eller körd kommando på denna dator 2026-09-12. **[ASSUMED]** = träningskunskap eller härledning som inte kunnat kontrolleras; ska bekräftas i plan innan det byggs vidare på.

<user_constraints>
## User Constraints (från 02-CONTEXT.md)

### Locked Decisions

#### Inloggning och testidentitet
- **D-01:** Inloggning i fas 2 sker mot en **lokal OIDC-testleverantör** (Keycloak eller motsvarande i Docker, i samma disponibla provmiljö som fas 1:s Supabase-mål) kopplad via Supabase Auth. Federationsvägen — utfärdare, anspråk, utloggning — ska provas nu så att fas 7 blir ett leverantörsbyte i konfiguration, inte ett nytt flöde. Ingen e-post/lösenord-inloggning byggs som huvudväg.
- **D-02:** En person identifieras av **(issuer, sub)**. E-post och namn är visningsuppgifter, aldrig nyckel. Samma person hos två kunder är två medlemskap på samma identitet. Ingen automatisk sammanslagning på namn eller e-post.
- **D-03:** **MFA-bevis krävs för administrativa åtgärder** (etablering, inbjudan, spärr, avslut av uppdrag). Appen läser IdP:ns anspråk (amr/acr) och nekar utan bevis; test-IdP:n konfigureras med TOTP. Appen kör ingen egen TOTP.

#### Första företrädaren (IAM-01)
- **D-04:** Kundens första medlemskap etableras genom en **leverantörsutfärdad engångsinbjudan**: tidsbegränsad, bunden till namngiven person och förväntad utfärdare, utfärdad efter verifiering utanför appen (avtal, kontakt med huvudmannen). Inbjudan löses in med den externa identiteten; först då uppstår medlemskapet. Organisationsnummer, e-postdomän eller uppslag i Skolenhetsregistret ger aldrig rättigheter i sig.
- **D-05:** **Kund ≠ huvudman.** Kunden (avtalspart/tenant) är en egen nivå ovanför `organizers`; en kommun kan ha flera nämnder/huvudmän och en koncern flera bolag. Första medlemskapet gäller kunden; huvudmän och skolenheter knyts under kunden. Befintliga `organizers` och deras data bevaras och knyts till en kund vid migration.
- **D-06:** Första företrädaren får **enbart kundadministration**: bjuda in fler, sätta upp huvudman och skolenheter, utse rektor. Ingen elev- eller undervisningsåtkomst följer av kundadministrationen; sådana rättigheter kräver eget uppdrag.

#### Uppdragsval och kontextbyte (IAM-03, IAM-04)
- **D-07:** Uppdragsväljaren sitter **alltid i sidhuvudet** och visar aktuell kund · huvudman · skolenhet · funktion, i stil med fas 1:s Exempelskola-väljare och Plan Digitals skol-/läsårsval. En person med ett enda uppdrag ser bara etiketten. Byte sker utan ny inloggning.
- **D-08:** Vid byte av uppdrag och vid utloggning **rensas allt klienttillstånd med elev-/verksamhetsinnehåll i alla flikar**: övriga flikar får besked (BroadcastChannel eller motsvarande) och låser sig till den nya kontexten eller till utloggat läge. Osparade ändringar varnas före byte.
- **D-09:** Väljaren listar **bara uppdrag som gäller idag** som valbara; kommande (t.ex. vikariat från nästa månad) och avslutade uppdrag visas gråa med datum. Servern prövar giltighet vid varje anrop, inte bara vid valet.

#### Spärr, sessionsslut och säkerhetslogg (IAM-05, ACL-01, AUDIT-01)
- **D-10:** **Serverlager i den byggda Workern** för skyddade åtgärder: cookie-baserad appsession, kontext (kund, medlemskap, uppdrag) prövas per anrop, aktör och uppdrag härleds på servern. Databasens RLS behålls som andra försvarslinje mot alternativa vägar. Klienten får inte längre skriva `actor_role` eller andra aktörsfält. Sessions- och cookieflödet provas tidigt i byggd Worker, före elevregistret.
- **D-11:** **Prövning per anrop mot medlemskaps-/uppdragstabellerna.** En token bevisar identitet, aldrig rättighet. Spärr eller avslutat uppdrag = nästa skyddade anrop nekas oavsett tokenens giltighet. Appsessionen har kort glidande livstid (storleksordning 15 minuter) så att även identitetsdelen löper ut snabbt; exakt värde är Claude's discretion.
- **D-12:** **Kundadministratör spärrar inom sin kund** (medlemskap och uppdrag, med MFA-bevis). Leverantören kan spärra på kundens begäran endast via en loggad nödrutin utanför appens vanliga väg, aldrig via en generell adminvy i appen.
- **D-13:** Säkerhetsloggen skrivs **på servern, oföränderlig för verksamhetsanvändare**, med en händelse per beständig ändring: aktör (issuer, sub), faktiskt uppdrag, tid, källa, objekt, resultat, korrelations-ID. Inloggning, utloggning, kontextbyte, inbjudan, spärr och **nekade anrop** loggas också. En **granskarfunktion hos kunden** kan läsa och exportera sin kunds logg. Läsningar av elevinnehåll loggas först när elevregistret finns (fas 4). Befintliga händelsetabeller (`organisation_events`, `point_plan_events`, `timplan_events`, `school_year_events`) får inte längre ta emot klientvald `actor_role`.

#### Redan beslutade ramar
- **D-14:** Kundisolering enligt ACL-01 gäller innehåll, filer, sökträffar, exporter **och existensuppgifter**: ett känt objekt-ID från annan kund ger samma svar som ett obefintligt. Fas 1:s fynd att `registry_snapshots` läses över kundgränsen (`auth.uid() is not null`) rättas i denna fas.
- **D-15:** Fas 1:s exempelläge (`example`) förblir helt utan backend. Läget `protected` öppnas i denna fas, men endast via serverlagret och den lokala provmiljön; inga molnnycklar och ingen `--linked`-drift. Demoetablering (`bootstrap_demo_profile`, demohuvudman) tas bort ur den körda databasen som del av att `protected` öppnas.

### Claude's Discretion
- Val av OIDC-testleverantör (Keycloak är utgångspunkt), hur den seedas med testkund, testpersoner och TOTP, och hur den startas i samma `prepare-local`-flöde som fas 1:s mål.
- Sessionsmekanik i Workern (cookieattribut, glidande livstid, CSRF-skydd, hur Supabase-token och appsession förhåller sig till varandra).
- Tabellmodell för kund, medlemskap, uppdrag, inbjudan och säkerhetshändelser, samt hur befintliga `profiles`/`assignments` migreras utan att förlora användarskapat material (D-08 i fas 1 gäller).
- Hur nekanden loggas utan att loggen kan fyllas av en angripare (rate limit/aggregering).
- Val av kanal för flikrensning och hur "osparat" avgörs i befintliga vyer.
- Testupplägg: fas 1:s `verify-isolation`, pgTAP och Playwright-projekt utökas snarare än ersätts; acceptansfallen i `docs/kommunintegration-och-sakerhet.md` (rader om spärr, gamla sessioner, annan kunds objekt-ID, samma e-post hos två kunder) blir körbara kontroller.

### Deferred Ideas (OUT OF SCOPE)
- Leverantörens egen åtkomstväg (Supabase-panel, service-nyckel, dashboard) med egen loggning och MFA — tas upp i fas 6 (spårbarhet/drift) enligt färdplanen; nämnd i säkerhetsdokumentet.
- Vårdnadshavar- och elevinloggning (e-legitimation) — utanför första milstolpen.
- SCIM/katalogsynk av konton från kommunen — fas 7 tillsammans med IdP-anslutningen.

#### Reviewed Todos (not folded)
- **API för lärares behörigheter med statistisk uppföljning** — hör till uppdragsmodellen (fas 3) och kräver giltighet/historik som fas 2 lägger grunden för; kvar i kön.
- **Läsårslins: ställa sig i ett läsår som i Plan Digital** — planeringsfunktion utan koppling till kontoåtkomst; kvar i kön.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Beskrivning (REQUIREMENTS.md) | Forskningsstöd i detta dokument |
|----|-------------------------------|---------------------------------|
| IAM-01 | En verifierad företrädare kan etablera kundens första medlemskap utan att enbart ett angivet organisationsnummer eller en e-postdomän ger rättigheter. | Inbjudningsmodell (`invitations` med token-hash, förväntad utfärdare, namngiven person, engångs, tidsgräns) och inlösenflöde efter OIDC-inloggning — § Architecture Patterns mönster 4; leverantörsutfärdande via skript i `work/pilot/`, aldrig via appvy (D-04, D-12). |
| IAM-03 | Personal med flera giltiga uppdrag kan välja tillåten arbetskontext; varje uppdrag anger organisation, relevant skolenhet och giltighet utan att rättigheter blandas. | Tabellen `access_assignments` med scope (kund/huvudman/skolenhet), funktion och `valid_from/valid_to`; kontext lagras i serversessionen; per-anrops-prövning — mönster 3 och 5. |
| IAM-04 | Personal kan logga ut så att skyddad åtkomst för den avslutade appsessionen upphör och föregående elevinnehåll rensas ur relevant klienttillstånd, även vid kontextbyte och flera flikar. | Serverlagrad session (`app_sessions`, `revoked_at`), RP-initierad utloggning mot Keycloak `end_session_endpoint`, BroadcastChannel + kontext-epok i svarshuvud — mönster 5 och 7. |
| IAM-05 | Behörig administratör kan spärra ett medlemskap eller avsluta ett uppdrag så att nästa skyddade anrop nekas även med tidigare utfärdad token. | Varje anrop läser `memberships.status` och uppdragets giltighet i samma transaktion som åtgärden; ingen rättighet cachas i cookie/JWT — mönster 5; MFA-krav på spärr via `amr`/`acr` — mönster 2. |
| ACL-01 | En användare nekas åtkomst till annan kunds objekt och röjande metadata via direkt anrop, vy, sökning, export och tillgängliga filvägar. | Dedikerad databasroll utan `BYPASSRLS` + policyer nycklade på sessions-GUC; klientroller förblir karantänsatta (PostgREST/GraphQL/Storage stängda); 404-ekvivalent svar för främmande ID; `registry_snapshots` får `customer_id`/`organizer_id` — mönster 6, Pitfalls 6–7. |
| AUDIT-01 | Behörig granskare kan följa pilotens beständiga ändringar med serververifierad aktör, faktiskt uppdrag, tid, källa, objekt och resultat; klienten kan inte välja en annan loggad aktör eller roll. | `security_events` append-only (revoke + trigger), skrivs i samma transaktion som ändringen med korrelations-ID från Workern; befintliga `*_events` får aktörsfält satta av trigger ur sessions-GUC; granskarfunktion med kundfilter och export via Worker — mönster 8. |
</phase_requirements>

## Project Constraints (från AGENTS.md — ingen CLAUDE.md finns)

[VERIFIED: ./AGENTS.md läst 2026-09-12]

- Paketrot är `web/`; projekt-/GSD-rot är katalogen ovanför. Domänmodeller i `web/lib/*-model.ts`, datalager i `*-store.ts`, vyer i `web/app/`, migrationer i `supabase/migrations/`.
- Kontroller i `web/`: `node --test lib/*.test.mjs`, `npx tsc --noEmit`, `npx oxlint app lib`, `npm run build`. Anpassa till ändringen; UI-ändring prövas på dator och telefon. Tidigare passerade tester är historik.
- `signInDemo`/`bootstrap_demo_profile` får inte användas i skyddade driftvägar (D-15 tar bort dem ur den körda databasen).
- Huvudmannen utser rektor; rektor tilldelar läraruppdrag inom sina skolenheter. Mandat kontrolleras på servern och i datavägar; klientens rollval är inget behörighetsbevis.
- Inga hemligheter eller personuppgifter i Git, planeringsdokument eller felsökningsutdata. Lokal konfiguration skiljs från källor via ignorefiler. **Konsekvens:** Keycloak-klienthemlighet, Worker-rollens databaslösenord och sessionsnyckel genereras per mål av `prepare-local` och landar i det gitignorerade manifestet / `.dev.vars`, aldrig i repo. `web/.gitignore` saknar idag `.dev.vars` — måste läggas till (se Pitfalls 9).
- Granska `work/supabase/`-skript före körning; använd avsedd isolerad testmiljö (fas 1:s mål).
- Skolverkets uppslag verifierar skoluppgifter, inte rätten att företräda en huvudman (stämmer med D-04).
- Skriv på svenska med tydliga verksamhetsord; skilj förslag, implementation, syntetiskt prov och godkänd verklig anslutning. Simulerat IdP-prov får inte märkas som IAM-02/fas 7-uppfyllt.
- Minnesanteckning (användarens auto-memory): Node 25 krävs för `web/` (`export PATH="/opt/homebrew/opt/node@25/bin:$PATH"`); systemets Node 20 räcker inte. [VERIFIED: `node --version` → v25.9.0 med PATH satt]

## Summary

Fasen kräver tre saker som inte finns i dag: en extern identitet som appen kan verifiera, ett serverlager som äger session och kontext, och en datamodell där rättigheter är rader med giltighet i stället för en roll per profil. Undersökningen av leverantörernas källkod ger ett avgörande faktum för D-01/D-03: **Supabase Auths inbyggda Keycloak-provider läser bara `userinfo` och validerar aldrig ID-token, och Keycloaks inbyggda mappers för `acr` och `amr` kan inte lägga anspråken i `userinfo`** [VERIFIED: gotrue v2.187.0 `keycloak.go`; Keycloak Javadoc `AcrProtocolMapper`/`AmrProtocolMapper` saknar `UserInfoTokenMapper`]. Om Supabase Auth får vara OIDC-klient (mellanhand) mot Keycloak når alltså MFA-beviset aldrig appen. Rekommendationen är därför att **Workern själv är OIDC-klient** (openid-client, PKCE, nonce, ID-token-validering, läser `acr`/`amr`/`auth_time`) och att Supabase Auth kopplas in via **`grant_type=id_token`** för Keycloak: Workern skickar den validerade ID-token till GoTrue, som registrerar identiteten i `auth.users`/`auth.identities` och ger ett `auth_user_id` [VERIFIED: gotrue `token_oidc.go` accepterar `keycloak` med issuer = `external.keycloak.url`]. Så uppfylls D-01:s "kopplad via Supabase Auth" utan att D-03 blir omöjligt. Appens egen `identities(issuer, sub)` är nyckel för rättigheter — nödvändigt eftersom Supabase Auth automatiskt länkar identiteter med samma verifierade e-post och detta inte kan stängas av [VERIFIED: supabase.com/docs identity-linking], vilket annars skulle bryta D-02.

Den lokala topologin har en verifierad fälla: GoTrue-containern måste nå Keycloaks issuer-URL för discovery/JWKS, och samma URL-sträng måste fungera i webbläsaren. Mac-värden löser inte `host.docker.internal`, containrarna gör det (192.168.65.254) och de når tjänster bundna till 127.0.0.1 på värden [VERIFIED: körda kommandon]. Lösningen är en engångsrad i `/etc/hosts` (`127.0.0.1 host.docker.internal`) som `prepare-local` kontrollerar och annars rapporterar BLOCKED med instruktion — aldrig sudo i skript. Alternativet utan hosts-rad är att hoppa över GoTrue-steget helt (Workern ensam OIDC-klient), vilket rör D-01 och kräver användarens beslut.

Serverlagret bygger på det som redan finns: Vinext 1.0.0-beta.9 stödjer route handlers, middleware, `cookies()` och `cloudflare:workers`-bindningar, kör RSC-miljön i workerd även i dev och validerar Origin för Server Actions men inte för route handlers [VERIFIED: vinext README och `request-pipeline.js`]. Workern ska nå Postgres direkt med **postgres.js** som **dedikerad roll `skolplattform_worker`** (LOGIN, `NOBYPASSRLS`, begränsade grants) och sätta sessionskontext med `set_config(..., true)` per transaktion; RLS-policyer nycklade på dessa GUC:er blir andra försvarslinjen medan `anon`/`authenticated` förblir karantänsatta så att PostgREST, GraphQL och Storage inte alls är öppna vägar. Säkerhetshändelsen skrivs i samma transaktion som ändringen. Detta måste bevisas i ett tidigt spik i byggd Worker (roadmapens krav) eftersom TCP-anslutning från workerd i `wrangler dev` mot 127.0.0.1 är dokumenterad för Hyperdrive-fallet men inte uttryckligen för lokal Postgres utan Hyperdrive [ASSUMED].

**Primär rekommendation:** Plan 02-01 ska vara ett spik som i den byggda Workern bevisar (1) Keycloak-inloggning via openid-client med `acr`/`amr` i ID-token, (2) GoTrue `id_token`-grant som skapar `auth.users`-rad, (3) httpOnly-cookie-session med glidande 15 min lagrad i Postgres via `skolplattform_worker`, (4) att en spärrad medlemskapsrad nekar nästa anrop. Först därefter byggs tabellmodell, uppdragsväljare och säkerhetslogg ut.

## Standard Stack

### Core

| Komponent | Version | Syfte | Varför standard | Källa |
|-----------|---------|-------|-----------------|-------|
| Keycloak (Docker) | `quay.io/keycloak/keycloak:26.7.3` (pinna exakt tag) | Lokal OIDC-test-IdP med TOTP, `acr`/`amr`, realm-import | D-01:s utgångspunkt; stödjer `--import-realm`, step-up (LoA/acr) och AMR-mapper | [VERIFIED: quay.io tag-API 2026-09-12: 26.7.3 publicerad 2026-08-31, `latest` = 26.7.3; keycloak.org/server/containers] |
| Supabase CLI / lokal stack | CLI 2.78.1 (installerad) → GoTrue v2.187.0, PostgREST v14.5, Postgres 17.6.1.095 | Samma disponibla mål som fas 1; GoTrue för `id_token`-grant | Redan i drift på båda målen | [VERIFIED: `supabase --version`; `docker inspect` av protected-målets containrar] |
| openid-client | 6.8.8 (publ. 2026-09-05) | OIDC-klient i Workern: discovery, PKCE, nonce, ID-token-validering, `buildEndSessionUrl` | Byggd på oauth4webapi, körs på Cloudflare Workers, Node ≥ 20 | [VERIFIED: `npm view`; github.com/panva/openid-client README "Cloudflare Workers"] |
| postgres (postgres.js) | 3.4.9 (publ. 2026-04-05) | Direkt Postgres-anslutning från Workern med dedikerad roll, transaktioner, `set_config` | Cloudflares dokumenterade Postgres-drivrutin för Workers (`nodejs_compat`), minst 3.4.5 | [VERIFIED: `npm view`; developers.cloudflare.com hyperdrive postgres-js-exempel] |
| Vinext + @cloudflare/vite-plugin + wrangler | 1.0.0-beta.9 / 1.54.4 / 4.129.0 (låsta i `web/package-lock.json`) | Route handlers (`app/api/**/route.ts`), middleware, `cookies()`, `cloudflare:workers` `env`, byggd Worker `dist/server/index.js` | Redan projektets byggkedja; ändra inte versioner i denna fas | [VERIFIED: `web/package.json`, `node_modules/vinext/package.json`, `dist/server/wrangler.json`] |
| Postgres 17 (Supabase-bild) | 17.6.1.095 | Tabeller, RLS, triggers, `set_config`, `pgcrypto` | Redan i målen | [VERIFIED: `docker inspect`] |

### Supporting

| Komponent | Version | Syfte | När |
|-----------|---------|-------|-----|
| otpauth | 9.5.2 | Generera TOTP-koder i Playwright/Node-prov mot Keycloaks TOTP | Automatiserade inloggningsprov med MFA | [VERIFIED: `npm view`] |
| @keycloak/keycloak-admin-client | 26.7.3 | Alternativ till realm-JSON för att seeda användare/TOTP via Admin REST | Endast om realm-import visar sig otillräcklig för OTP-hemligheter (se Open Questions 3) | [VERIFIED: `npm view`] |
| pgTAP via `supabase test db` | pg_prove 3.36 (fas 1) | Bevisa grants, RLS som `skolplattform_worker`, append-only | Varje migration i fasen | [VERIFIED: 01-05-SUMMARY] |
| @playwright/test | 1.63.0 (låst) | Browserprov: inloggning, uppdragsväljare, flikrensning, spärr | Utökas med projekt `protected` | [VERIFIED: `web/playwright.config.ts`] |
| jose | 6.2.12 (finns redan transitivt i `node_modules`) | Endast vid behov av egen JWT-hantering i prov (t.ex. minta Supabase-JWT för negativa API-prov som i fas 1) | Prov, inte appkod | [VERIFIED: `ls node_modules`] |

### Alternativ som övervägts

| I stället för | Kunde använda | Avvägning | Bedömning |
|---------------|---------------|-----------|-----------|
| Worker som OIDC-klient + GoTrue `id_token`-grant | **GoTrue som OIDC-mellanhand** (`/auth/v1/authorize?provider=keycloak`) | Enklast konfiguration, men GoTrue läser bara `userinfo` och Keycloaks acr/amr-mappers kan inte skriva till userinfo → **D-03 kan inte uppfyllas**; GoTrue vidarebefordrar visserligen godtyckliga query-parametrar (t.ex. `acr_values`) till Keycloak, men resultatet syns inte; ingen RP-initierad utloggning mot IdP:n; ID-token returneras inte till appen | **Fungerar inte lokalt för D-03** [VERIFIED: gotrue `keycloak.go`, `external.go`; Keycloak Javadoc] |
| Worker + GoTrue `id_token`-grant | **Worker ensam OIDC-klient, Supabase enbart databas** | Ingen hosts-rad, ingen GoTrue-beroende, enklast nätverk; men "kopplad via Supabase Auth" (D-01) uppfylls inte bokstavligt | Godtagbar reservväg om spiket faller; **kräver användarens beslut** |
| Supabase Auth med Keycloak | **Supabase "third-party auth"** | Stödjer bara Firebase, Auth0, Cognito och Clerk i CLI-konfigurationen | **Fungerar inte** för Keycloak [VERIFIED: supabase.com/docs cli/config; rotens `supabase/config.toml`] |
| Keycloak | Lättare OIDC-servrar (dex, mock-oidc) | Saknar TOTP/step-up/acr-LoA-hantering som D-03 kräver att provas | Avvisat |
| postgres.js via TCP med dedikerad roll | **PostgREST med Worker-mintade JWT** (`role`-claim = egen roll) | HTTP fungerar säkert i Workers, men kräver att Workern håller JWT-hemligheten (kan minta `service_role`), saknar transaktioner över flera satser (händelse + ändring atomärt) och kräver att `authenticator` får `set role` till ny roll | Reserv om TCP-spiket faller; sämre för AUDIT-01-atomicitet |
| Dedikerad roll | **service_role-nyckel i Workern** | Förbjudet som genväg av D-10/§7 (bred nyckel runt kundisolering) | Avvisat |
| Serverlagrad session (opak cookie) | Signerad/krypterad JWT-cookie | Spärr och glidande livstid kräver då ändå serverkontroll per anrop (D-11) → ingen vinst, mer kryptoyta | Avvisat |

**Installation (i `web/`, Node 25):**
```bash
export PATH="/opt/homebrew/opt/node@25/bin:$PATH"
npm install openid-client@6.8.8 postgres@3.4.9
npm install --save-dev otpauth@9.5.2
docker pull quay.io/keycloak/keycloak:26.7.3   # några hundra MB, kräver nät; görs av prepare-local
```
[VERIFIED: versioner mot npm-registret 2026-09-12; paketen är inte installerade i `web/node_modules` i dag]

## Architecture Patterns

### Rekommenderad struktur (tillägg)

```
web/
├── app/
│   ├── api/auth/login/route.ts        # startar OIDC (PKCE, state, nonce → tillfällig cookie)
│   ├── api/auth/callback/route.ts     # kodutbyte, ID-token-validering, GoTrue id_token-grant, session
│   ├── api/auth/logout/route.ts       # revoke session, RP-initierad utloggning mot Keycloak
│   ├── api/session/route.ts           # GET: aktuell identitet, uppdrag (giltiga/kommande/avslutade), epok
│   ├── api/context/route.ts           # POST: välj uppdrag → ny epok
│   ├── api/kund/**/route.ts           # kundadministration (inbjudan, spärr, huvudman, skolenhet, rektor)
│   ├── api/logg/route.ts              # granskare: läs/exportera kundens säkerhetslogg
│   └── middleware.ts                  # (valfritt) Sec-Fetch-Site/Origin-kontroll, korrelations-ID
├── lib/
│   ├── runtime-mode.ts                # + 'protected'
│   ├── server/db.ts                   # postgres.js-klient, withContext(tx, ctx)
│   ├── server/session.ts              # cookie, sliding expiry, revoke
│   ├── server/oidc.ts                 # openid-client-konfiguration, claims-tolkning (acr/amr)
│   ├── server/authz.ts                # requireContext(), requireMfa(), deny() med loggning
│   ├── server/events.ts               # security_events + aggregering av nekanden
│   ├── session-channel.ts             # BroadcastChannel + epok på klienten
│   └── server-client.ts               # klientens fetch-omslag mot /api (ersätter supabase() i protected)
supabase/migrations/2026091xxxxxxx_*.sql  # customers, identities, memberships, access_assignments,
                                          # invitations, app_sessions, security_events, worker-roll, RLS
supabase/tests/phase2_*.test.sql          # pgTAP
work/pilot/idp/realm-template.json        # Keycloak-realm med platshållare (ingen hemlighet)
work/pilot/prepare-local.mjs              # + --with-idp: startar Keycloak, genererar realm, hemligheter, .dev.vars
work/pilot/verify-access.mjs              # API-prov av spärr, utgånget uppdrag, främmande ID, samma e-post
```

### Mönster 1: Inloggning — Worker som OIDC-klient, Supabase Auth via `id_token`-grant

**Vad:** `GET /api/auth/login` skapar `state`, `code_verifier`, rå `nonce`; lagrar dem i en kortlivad httpOnly-cookie (`SameSite=Lax`, 10 min); redirect till Keycloaks `authorization_endpoint` med `scope=openid profile email`, `code_challenge`, `nonce = hex(sha256(rå nonce))`. `GET /api/auth/callback` byter kod mot tokens med openid-client (validerar `iss`, `aud`, `exp`, signatur, `nonce`), läser `sub`, `iss`, `acr`, `amr`, `auth_time`, `email`, `name` ur ID-token. Därefter `POST {SUPABASE_URL}/auth/v1/token?grant_type=id_token` med `{ provider: 'keycloak', id_token, nonce: <rå nonce> }` (anon-nyckel i `apikey`-huvudet) → GoTrue verifierar token via discovery mot `external.keycloak.url`, skapar/uppdaterar `auth.users` + `auth.identities` och svarar med `user.id`. Workern skapar `identities`-rad på `(iss, sub)` (upsert, `auth_user_id` sätts), skapar `app_sessions`-rad och sätter sessionscookien. Supabase-sessionens access/refresh-token behövs inte och sparas inte.

**Varför:**
- GoTrue accepterar `provider: "keycloak"` i `id_token`-grant när `external.keycloak.enabled` och `url` är satta; issuer = `config.External.Keycloak.URL`; `aud` måste innehålla `external.keycloak.client_id`. [VERIFIED: gotrue v2.187.0 `internal/api/token_oidc.go`]
- GoTrue kräver att nonce antingen saknas i både token och anrop eller finns i båda; vid båda jämförs `sha256(params.Nonce)` med tokenens `nonce`. Alternativt `skip_nonce_check = true` för providern (Workern har redan validerat nonce). [VERIFIED: `token_oidc.go`; hex-kodningen av hashen [ASSUMED] — bekräfta i spik]
- GoTrue kastar bort okända anspråk (`Claims`-strukturen saknar egen `UnmarshalJSON`); `acr`/`amr` överlever inte in i Supabase. **Därför läser Workern dem själv.** [VERIFIED: `provider/provider.go`, `provider/oidc.go` `parseGenericIDToken`]
- Sedan Keycloak 22 måste `openid`-scope begäras. [VERIFIED: supabase.com/docs auth-keycloak]
- openid-client kräver `allowInsecureRequests` för `http://`-issuer i lokal miljö. [VERIFIED: openid-client docs `allowInsecureRequests`]
- Om GoTrue-steget misslyckas (Keycloak onåbar från containern etc.) ska inloggningen **nekas**, inte tyst fortsätta utan `auth_user_id` — annars är "kopplad via Supabase Auth" en illusion.

**Lokal topologi (verifierad):**
- Mac-värden löser inte `host.docker.internal`; GoTrue-/db-containrarna löser det till 192.168.65.254 och når en tjänst bunden till `127.0.0.1` på värden (HTTP 200 mot testserver på 127.0.0.1:8189). [VERIFIED: `dscacheutil`, `docker exec … getent hosts`, curl-test 2026-09-12; Docker Desktop 4.27.1]
- Kravet: **en** hostname-sträng som fungerar för webbläsare (värden), Worker (värden) och GoTrue (container). Lösning: rad `127.0.0.1 host.docker.internal` i `/etc/hosts` (rootägd fil, kräver sudo en gång); Keycloak startas med `--hostname http://host.docker.internal:8180` och publiceras på `127.0.0.1:8180`; `external.keycloak.url = "http://host.docker.internal:8180/realms/skolplattform-test"`. `prepare-local --with-idp` kontrollerar `dscacheutil -q host -a name host.docker.internal` och rapporterar `BLOCKED` med instruktion om raden saknas — skriptet kör aldrig sudo.
- Reserv för fysisk telefon: `--idp-host <LAN-IP>` (då måste Keycloak binda `0.0.0.0`); inte standard.

### Mönster 2: MFA-bevis ur ID-token (D-03) och step-up

**Vad:** Sessionsraden sparar `acr text`, `amr text[]`, `auth_time timestamptz`. `requireMfa(ctx)` kräver `amr` ⊇ {`otp`} (RFC 8176) **eller** `acr` i konfigurerad mängd (`MFA_ACR_VALUES`, lokalt `"2"`), samt `auth_time` inom `MFA_MAX_AGE` (förslag 8 h). Saknas bevis svarar Workern `403 {code:'mfa_required'}` och klienten erbjuder "Verifiera med engångskod" → `GET /api/auth/login?step_up=1` som lägger `acr_values=2` (eller `claims={"id_token":{"acr":{"essential":true,"values":["2"]}}}`) i auktorisationsbegäran; Keycloak höjer nivån utan full ny inloggning (SSO-kaka) och ny ID-token uppdaterar sessionens `acr/amr/auth_time`.

**Keycloak-konfiguration i realm-JSON:**
- Browser-flöde med *Condition - Level of Authentication*: nivå 1 = lösenord, nivå 2 = OTP; realm-attribut `acr.loa.map` mappar `"1"→1`, `"2"→2`. Klienten kan begära nivå via `acr_values`/`claims`. [VERIFIED: keycloak.org server_admin "Step-up Authentication" (översiktstext); detaljerad JSON-form [ASSUMED]]
- AMR-mapper (`Authentication Method Reference`) på klientscope + referensvärden (`pwd`, `otp`) på respektive exekvering i flödet ger `amr` i ID- och access-token. [VERIFIED: keycloak.org Javadoc `AmrProtocolMapper` "sets the 'amr' claim … to the reference values configured on the completed authenticators"; Red Hat build of Keycloak 24 admin guide via websearch (MEDIUM)]
- TOTP: realm `otpPolicyType=totp`, `otpPolicyAlgorithm=HmacSHA1`, `otpPolicyDigits=6`, `otpPolicyPeriod=30`; testpersoner för admin får required action `CONFIGURE_TOTP` eller importerad OTP-credential. [ASSUMED för exakt JSON; se Open Questions 3]
- Fas 7: Entra ID skickar `amr: ["pwd","mfa"]`; regeln ska vara konfigurerbar per utfärdare, inte hårdkodad till `otp`. [ASSUMED]

### Mönster 3: Datamodell — kund → identitet → medlemskap → åtkomstuppdrag

**Vad (DDL-skiss, alla nya tabeller med RLS på, ägda av `postgres`, åtkomst för `skolplattform_worker`):**

```sql
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
alter table public.organizers add column customer_id uuid references public.customers(id);
-- backfill: en kund per befintlig huvudman, sedan not null (bevarar alla rader, D-05/fas 1 D-08)

create table public.identities (
  id uuid primary key default gen_random_uuid(),
  issuer text not null,
  subject text not null,
  auth_user_id uuid unique references auth.users(id) on delete set null,  -- från GoTrue id_token-grant
  display_name text, email text,                                            -- visning, aldrig nyckel (D-02)
  created_at timestamptz not null default now(), last_login_at timestamptz,
  unique (issuer, subject)
);

create type public.membership_status as enum ('active', 'blocked');
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.identities(id),
  customer_id uuid not null references public.customers(id),
  status public.membership_status not null default 'active',
  blocked_at timestamptz, blocked_by uuid references public.memberships(id), block_reason text,
  created_at timestamptz not null default now(),
  unique (identity_id, customer_id)
);

-- Åtkomstuppdrag: kund-, huvudman- eller skolenhetsnivå med giltighet (D-09). Fas 3 fyller funktionerna.
create type public.access_function as enum ('kundadmin', 'granskare', 'huvudman', 'rektor', 'administrator', 'larare');
create table public.access_assignments (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id),
  customer_id uuid not null references public.customers(id),
  organizer_id uuid references public.organizers(id),
  unit_id uuid references public.school_units(id),
  function public.access_function not null,
  valid_from date not null default (now() at time zone 'Europe/Stockholm')::date,
  valid_to date check (valid_to is null or valid_to >= valid_from),
  staff_assignment_id uuid references public.assignments(id),   -- koppling till befintlig personalpost (fas 3)
  created_by uuid references public.memberships(id), created_at timestamptz not null default now(),
  ended_by uuid references public.memberships(id), ended_at timestamptz,
  check ((function in ('kundadmin','granskare')) = (organizer_id is null and unit_id is null)),
  check (function <> 'rektor' or unit_id is not null)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  token_hash bytea not null unique,           -- sha256 av engångstoken; klartext visas bara vid utfärdande
  invited_person_name text not null, expected_issuer text not null, expected_email text,  -- e-post = visning/kontroll
  grants jsonb not null,                       -- t.ex. [{"function":"kundadmin"}]
  issued_by text not null,                     -- 'leverantor:cli' eller membership-id
  expires_at timestamptz not null, used_at timestamptz, used_by_identity_id uuid references public.identities(id),
  created_at timestamptz not null default now()
);

create table public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash bytea not null unique,
  identity_id uuid not null references public.identities(id),
  membership_id uuid references public.memberships(id),        -- vald kontext
  assignment_id uuid references public.access_assignments(id),
  context_epoch integer not null default 1,
  acr text, amr text[] not null default '{}', auth_time timestamptz,
  created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null, absolute_expires_at timestamptz not null, revoked_at timestamptz
);
```

**Migration utan förlust:**
- `profiles`, `assignments`, `assignment_units`, `organizers` och alla verksamhetstabeller behålls oförändrade i struktur; `organizers.customer_id` fylls med en "Migrerad kund: <namn>" per huvudman. [Härlett ur D-05; **inga** `delete` i migrationen enligt fas 1-mönstret — VERIFIED: karantänmigrationen har 0 destruktiva satser]
- Befintliga `profiles` (demoanonyma identiteter, provkonto) får **inte** aktiva medlemskap; de lämnas som rader så att `organisation_events.actor`-FK:er består. `bootstrap_demo_profile` droppas (`drop function`) och demohuvudmannen `00000000-0000-4000-8000-000000000001` behålls som rad men knyts till en spärrad/inaktiv kund ("Demo — stängd"), eller så raderas den bara om inga verksamhetsrader refererar den (kontrollera i migrationen med `raise` vid referenser). D-15 kräver borttagning ur *körd databas*; att ta bort funktionen och alla vägar in räcker, radering av raden är valfri. [Härlett; fixturerna `protected-fixtures.sql` refererar demohuvudmannen — VERIFIED]
- `current_organizer_id()`/`current_app_role()` **omdefinieras** att läsa sessions-GUC (se mönster 6) så att alla befintliga policyer automatiskt blir "andra linje" nycklade på serverns kontext. Funktionerna `appoint_school_principal`/`import_school_unit`/`copy_offering_cohort` använder `auth.uid()` för aktör; Workern sätter `request.jwt.claims` till `{"sub": "<auth_user_id>", "role": "authenticated"}` i transaktionen så att `auth.uid()` ger `identities.auth_user_id`. [`auth.uid()` läser `current_setting('request.jwt.claims', true)::jsonb->>'sub'` — VERIFIED i Supabase-schemat allmänt (standard); exakt fallback-ordning [ASSUMED], pgTAP-prov krävs]

### Mönster 4: Inbjudan (IAM-01, D-04)

**Vad:** Leverantören kör `node work/pilot/invite.mjs --target protected --customer <id> --person "Namn" --issuer <iss> [--email …] --grants kundadmin --ttl 72h` som `postgres` via `psql`-anrop (som fas 1:s fixturskript): skapar `customers`-rad vid behov, `invitations`-rad med `token_hash`, skriver `security_events` med `source='cli'`, skriver ut en engångslänk `https://…/inbjudan/<token>` **en gång** i terminalen (aldrig i resultatfil). Inlösen: användaren loggar in (mönster 1); `POST /api/inbjudan/losen` kontrollerar `sha256(token)`, `expires_at`, `used_at is null`, `expected_issuer = session.identity.issuer`; om `expected_email` finns och skiljer sig visas en bekräftelsefråga (visning, inte spärr — D-02); i **en transaktion**: `memberships` (active), `access_assignments` per `grants`, `used_at/used_by`, `security_events`. Skript och route delar tokenformat (32 slumpbytes, base64url).

**Varför inte i appen:** D-12 förbjuder en generell leverantörsvy; skriptvägen är samma mönster som `prepare-local`/fixturer och ligger utanför Workern.

### Mönster 5: Session och per-anrops-prövning (D-10, D-11, IAM-05)

**Vad:**
- Cookie `sp_session`: 32 slumpbytes base64url; `HttpOnly; Path=/; SameSite=Lax; Secure` när begäran är `https:` (lokal http på 127.0.0.1 måste fungera i WebKit-projektet → sätt `Secure` villkorat; inget `__Host-`-prefix lokalt). Databasen lagrar `sha256(token)`.
- Glidande livstid: `expires_at = now() + 15 min` vid varje skyddat anrop (skrivningen kan strypas till högst en gång per minut), `absolute_expires_at = login + 8 h`. Spik ska mäta att 15 min inte stör arbetsflödena; om det gör det är intervallet Claude's discretion enligt D-11.
- `requireContext(request)`: i **samma transaktion** som åtgärden: `select … from app_sessions s join identities i … left join memberships m … left join access_assignments a …` med villkor `s.revoked_at is null and s.expires_at > now() and s.absolute_expires_at > now()`; om `m.status <> 'active'` eller uppdraget inte gäller i dag (`valid_from <= today and (valid_to is null or valid_to >= today)`, `ended_at is null`) → `deny('membership_blocked' | 'assignment_expired')` (403, loggas), och sessionens kontext nollställs. Ingen rättighet läses ur cookien.
- Spärr (`POST /api/kund/medlemskap/:id/sparr`) kräver kundadmin i samma kund + `requireMfa`; sätter `status='blocked'` och `update app_sessions set revoked_at = now() where identity_id = … and membership_id = …` (även andra öppna sessioner dör direkt) — men det senare är komfort; **garantin** ligger i per-anrops-läsningen.
- Kontextbyte `POST /api/context {assignmentId}`: verifierar att uppdraget tillhör sessionens identitet och gäller i dag, sätter `membership_id/assignment_id`, `context_epoch = context_epoch + 1`, loggar `context_changed`. Svar och alla efterföljande svar bär `X-Context-Epoch`.
- CSRF: Vinext validerar Origin mot Host för **Server Actions** (403 vid avvikelse; saknat Origin passerar) men **inte för route handlers** [VERIFIED: `node_modules/vinext/dist/server/request-pipeline.js` `validateCsrfOrigin`, anropad från action-filer]. Workern måste därför i alla `POST/PUT/PATCH/DELETE`-routes kräva `Sec-Fetch-Site ∈ {same-origin, none}` **eller** `Origin` = egen origin, annars 403 — plus `SameSite=Lax`. Ingen egen CSRF-token behövs då.
- Korrelations-ID: `crypto.randomUUID()` per begäran i middleware/route → `set_config('app.correlation_id', …, true)` och svarshuvud `X-Correlation-Id`; klienten visar det i felmeddelanden.

**Hur Supabase-token och appsession förhåller sig:** Supabase Auth används vid inloggning för att registrera identiteten och ge ett stabilt `auth_user_id`; dess access/refresh-token används inte i drift och sparas inte. Appsessionen är den enda sessionen. Vid utloggning: `revoked_at`, cookie raderas, redirect till Keycloaks `end_session_endpoint` med `id_token_hint` (ID-token sparas krypterat i sessionsraden **eller** bara `client_id` + `post_logout_redirect_uri`, som Keycloak accepterar med bekräftelsesida) [ASSUMED för Keycloaks bekräftelsebeteende utan `id_token_hint`]. GoTrue erbjuder ingen utloggning mot uppströms IdP [VERIFIED: `external.go` saknar end_session-hantering].

### Mönster 6: Dedikerad databasroll och RLS som andra linje (ACL-01, D-10)

**Vad:**
```sql
-- Migration (körs som postgres). Lösenordet sätts av prepare-local efter db reset via psql, aldrig i migrationen.
create role skolplattform_worker login nobypassrls noinherit;
grant usage on schema public to skolplattform_worker;
grant select, insert, update on public.customers, public.identities, public.memberships,
  public.access_assignments, public.invitations, public.app_sessions to skolplattform_worker;
grant select, insert on public.security_events to skolplattform_worker;          -- aldrig update/delete
grant select, insert, update, delete on public.school_units, … to skolplattform_worker;  -- bara vägar fasen öppnar
grant execute on function public.import_school_unit(jsonb,jsonb,uuid,text), public.appoint_school_principal(uuid,uuid,text) to skolplattform_worker;

-- Kontexthjälpare ersätter fas 1:s profilbaserade
create or replace function public.current_customer_id() returns uuid language sql stable
  as $$ select nullif(current_setting('app.customer_id', true), '')::uuid $$;
create or replace function public.current_organizer_id() returns uuid language sql stable
  as $$ select nullif(current_setting('app.organizer_id', true), '')::uuid $$;
create or replace function public.current_app_role() returns public.app_role language sql stable
  as $$ select nullif(current_setting('app.app_role', true), '')::public.app_role $$;

-- Nya tabeller: policyer nycklade på kund
alter table public.memberships enable row level security;
create policy memberships_customer on public.memberships for all to skolplattform_worker
  using (customer_id = public.current_customer_id()) with check (customer_id = public.current_customer_id());
-- Undantag: sessionsuppslag före kontextval sker med app.customer_id tomt → egen policy på app_sessions/identities
--   nycklad på app.identity_id, och inloggnings-/inbjudningsvägen körs i en 'bootstrap'-transaktion med
--   set_config('app.phase','login') och egna, snäva policyer.
alter table public.registry_snapshots add column organizer_id uuid references public.organizers(id);
-- backfill från school_units.code där möjligt; policy: organizer_id = current_organizer_id()
drop policy registry_snapshots_read on public.registry_snapshots;  -- ersätter auth.uid() is not null (D-14)
```
- Workern per transaktion: `sql.begin(async tx => { await tx\`select set_config('app.identity_id', ${id}, true), set_config('app.customer_id', ${cust}, true), set_config('app.organizer_id', ${org}, true), set_config('app.app_role', ${role}, true), set_config('app.membership_id', …), set_config('app.assignment_id', …), set_config('app.correlation_id', …), set_config('request.jwt.claims', ${json}, true)\`; … })`. `set_config(name, value, is_local=true)` är transaktionslokalt och parametriserbart — använd det, inte `set local` (som inte tar bindparametrar). [VERIFIED: PostgreSQL-standard; `current_setting(name, missing_ok)` ger NULL när GUC saknas]
- `anon`/`authenticated` förblir helt karantänsatta (fas 1). Fasen **öppnar inga** PostgREST-, GraphQL- eller Storage-vägar; alternativa vägar existerar därmed inte, och RLS på `skolplattform_worker` skyddar mot Workerns egna fel (glömt kundfilter). `verify-isolation.mjs` fortsätter att bevisa 58 nekade. [VERIFIED: 01-06-SUMMARY; policyer `to skolplattform_worker` gäller eftersom rollen inte äger tabellerna och saknar bypassrls — PostgreSQL-standard]
- Existensdöljande (D-14): alla routes med objekt-ID svarar `404 {code:'not_found'}` både när raden saknas och när RLS filtrerar bort den — Workern skiljer inte fallen; dessutom returnerar `update … returning` 0 rader → 404, aldrig 403 med objektinformation. Söktjänster och listor filtreras i SQL, aldrig i JS efter hämtning.
- Filvägar: Storage-policyerna är borttagna (fas 1), ingen appväg laddar upp filinnehåll [VERIFIED: CONCERNS.md "sparar bara namn, storlek och typ"]; fasen öppnar **inte** Storage. Framtida filåtkomst går via Workern med kundprövning (fas 4/5). Redovisas som avgränsning, inte som uppfyllt.

### Mönster 7: Flikrensning och kontext-epok (D-08, IAM-04)

**Vad:** Allt elev-/verksamhetsinnehåll ligger i dag i React-minne (`useState`) i `page.tsx`, `organisation-workspace.tsx`, `admin-workspace.tsx`, `workspace-views.tsx`; ingen `localStorage`/`sessionStorage`/IndexedDB används; enda cookie från klienten är sidomenyns UI-kaka. [VERIFIED: `grep` i `web/app`, `web/lib`, `web/components`] Därför räcker en fullständig omladdning för att rensa. Design:
- `lib/session-channel.ts`: `new BroadcastChannel('skolplattform-session')`; den flik som byter kontext/loggar ut sänder `{type:'epoch', epoch}` respektive `{type:'logged-out'}` efter lyckat serversvar. Övriga flikar visar ett låsande överlägg ("Kontexten ändrades i en annan flik") och laddar om till `/` vid klick (låser sig → ingen tyst dataförlust i den fliken; D-08:s "låser sig"). BroadcastChannel stöds i alla aktuella webbläsare inkl. Safari ≥ 15.4 [ASSUMED, allmänt känt; `storage`-event är onödigt].
- Server-epok som fallback: klienten sparar `X-Context-Epoch` från senaste svar; avvikelse i något svar eller på `visibilitychange` (`GET /api/session`) → samma lås. Täcker flikar som missade meddelandet.
- "Osparat": inför en liten registry `useUnsavedChanges(id, dirty)` (React context) som vyer med utkast registrerar sig i (`organisation-workspace` `saving`/utkast, `permitDraft`, timplansredigering); väljaren frågar `window.confirm`-liknande dialog före byte om något är dirty. I fas 2 är bara de vägar fasen öppnar skrivbara i `protected`, så registret kan börja litet.
- Uppdragsväljaren i sidhuvudet återanvänder fas 1:s `.og-unit-switch`-mönster (44 px, `appearance:none`) [VERIFIED: 01-VERIFICATION].

### Mönster 8: Säkerhetslogg (AUDIT-01, D-13)

```sql
create type public.event_outcome as enum ('ok', 'denied', 'error');
create table public.security_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  correlation_id uuid not null,
  source text not null check (source in ('worker','cli','db')),
  actor_identity_id uuid references public.identities(id),
  actor_issuer text, actor_subject text,                       -- kopieras in: läsbart även om identiteten raderas
  session_id uuid, membership_id uuid, assignment_id uuid, customer_id uuid,
  action text not null, object_type text, object_id uuid,
  outcome public.event_outcome not null,
  details jsonb not null default '{}'::jsonb,                  -- minimerat: aldrig elevinnehåll, aldrig token
  ip_hash bytea
);
revoke all on public.security_events from public, anon, authenticated;
grant select, insert on public.security_events to skolplattform_worker;
create function public.security_events_immutable() returns trigger language plpgsql as $$
begin raise exception 'security_events är oföränderlig'; end $$;
create trigger security_events_no_update_delete before update or delete on public.security_events
  for each row execute function public.security_events_immutable();
alter table public.security_events enable row level security;
alter table public.security_events force row level security;   -- gäller även ägaren postgres i prov
create policy security_events_read_customer on public.security_events for select to skolplattform_worker
  using (customer_id = public.current_customer_id() and current_setting('app.app_role', true) = 'granskare');
create policy security_events_insert on public.security_events for insert to skolplattform_worker with check (true);
```
- Händelsen skrivs i **samma transaktion** som ändringen (Worker) eller inuti SQL-funktionen (`import_school_unit` etc. skriver redan `organisation_events` transaktionellt — komplettera med `security_events` via en `after`-trigger eller i funktionen). Nekanden och inloggning/utloggning skrivs i egen transaktion.
- Befintliga `*_events`: `before insert`-trigger sätter `new.actor := nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub'` och `new.actor_role := current_setting('app.app_role', true)::app_role` och `raise exception` om GUC saknas; kolumnen kan inte längre väljas av klienten eftersom klientroller saknar grants och Workern aldrig läser fältet från begäran. pgTAP: insert med avvikande `actor_role` ger raden serverns värde.
- Nekanden utan flödning: tabell `denial_buckets(bucket_start timestamptz, key text, count int, primary key (bucket_start, key))`; per nekande `insert … on conflict do update set count = count + 1 returning count`; endast `count <= 20` per (nyckel, minut) ger en `security_events`-rad; när en ny hink öppnas skrivs en sammanfattande händelse `denied_suppressed` med antal för föregående hink. Nyckel = `sha256(identity_id | ip)` + route-klass. Cloudflares Rate-Limiting-binding finns i `wrangler.json` (`ratelimits`) men fungerar bara i molnet [VERIFIED: fältet finns i genererad `dist/server/wrangler.json`; lokal funktion [ASSUMED] — använd Postgres-varianten].
- Granskare: `GET /api/logg?from&to&format=json|csv` kräver `granskare`-uppdrag i kunden; exporten filtreras i SQL av policyn, loggas själv som `log_exported`. `details` innehåller aldrig namn på elever (fas 4 definierar läsloggning).

### Anti-mönster att undvika
- **Rättigheter i token/cookie:** varken Supabase-JWT-claims (`custom_access_token`-hook) eller signerad cookie får styra behörighet; D-11 kräver tabellläsning per anrop.
- **`auth.users` som personnyckel:** GoTrue länkar automatiskt identiteter med samma verifierade e-post och detta kan inte stängas av [VERIFIED: supabase.com/docs auth-identity-linking]; nyckeln är `identities(issuer, subject)`.
- **`service_role` i Workern** eller JWT-hemligheten i Workern (kan minta `service_role`).
- **Filtrera kund i JS efter `select *`:** RLS + SQL-filter, annars läcker existens via svarstider/antal.
- **Öppna `authenticated`-grants "för att stores ska fungera":** stores får en server-klient (`server-client.ts`); PostgREST förblir stängt.
- **`set local x = $1`:** fungerar inte med bindparametrar; använd `set_config(...,true)`.
- **`SameSite=Strict` på state/nonce-cookien:** OIDC-återkomsten är en cross-site-navigering från Keycloak; `Strict` gör att cookien inte skickas och callbacken faller. Använd `Lax`. [ASSUMED, standardbeteende]

## Don't Hand-Roll

| Problem | Bygg inte | Använd | Varför |
|---------|-----------|--------|--------|
| OIDC-kodflöde, PKCE, nonce, ID-token-signatur/`aud`/`iss`/`exp` | Egen JWT-verifiering mot JWKS | `openid-client` 6.8.8 (`discovery`, `buildAuthorizationUrl`, `authorizationCodeGrant`, `buildEndSessionUrl`) | Fällor: `alg`-förvirring, `azp`, klockskev, JWKS-rotation; biblioteket körs på Workers [VERIFIED] |
| TOTP-koder i prov | Egen HOTP/TOTP | `otpauth` 9.5.2 | Base32, tidsfönster, SHA-1-varianter |
| Postgres-protokoll/transaktioner i Worker | Egen HTTP-omväg via PostgREST med mintade JWT | `postgres` 3.4.9 + `sql.begin()` | Atomär händelse + ändring; parametrisering; Cloudflares dokumenterade väg |
| Test-IdP | Mock-OIDC-server i Node | Keycloak 26.7.3 med realm-import | Step-up/acr/amr/TOTP måste vara "riktiga" för att fas 7 ska bli ett konfigurationsbyte |
| Sessions-ID | Egen PRNG/sekvens | `crypto.getRandomValues` (Web Crypto i workerd) + `sha256` i DB | 256 bitars entropi, hash i vila |
| Cookieparsning | Regex på `Cookie`-huvudet | `cookies()` från `next/headers` (Vinext-shim) eller `Response.headers.append('Set-Cookie', …)` med `serialize` | Attributhantering, flera Set-Cookie [VERIFIED: vinext README "cookie attachment" för route handlers] |
| Nyckel-/hemlighetsdistribution lokalt | Hårdkodade provvärden i repo | `prepare-local` genererar per mål → `manifest.json` (0600), `.dev.vars` (gitignored) | AGENTS.md förbjuder hemligheter i Git även för prov |

## Runtime State Inventory

Ej tillämpligt: fasen är ingen omdöpning/refaktorering av befintliga namn. Den enda körtidsstat som *ändras* är den lokala protected-databasens installerade objekt (funktionen `bootstrap_demo_profile`, demohuvudmannen, `registry_snapshots`-policyn), som hanteras genom ny migration + `prepare-local --fresh` (disponibla mål). Molndemons installerade tillstånd rörs inte (D-15).

## Common Pitfalls

### Pitfall 1: Supabase Auth som OIDC-mellanhand tappar MFA-beviset
**Vad går fel:** Med `/auth/v1/authorize?provider=keycloak` hämtar GoTrue bara `userinfo`; `acr`/`amr` finns i ID-token men Keycloaks mappers `AcrProtocolMapper`/`AmrProtocolMapper` implementerar inte `UserInfoTokenMapper`. Appen ser aldrig MFA-bevis → D-03 omöjligt.
**Varför:** Providerdesign i GoTrue (oauth2-flöde utan OIDC-validering). [VERIFIED: `keycloak.go`, Keycloak Javadoc]
**Undvik:** Worker som OIDC-klient (mönster 1). **Varningstecken:** `auth.identities.identity_data` saknar `custom_claims.acr` efter inloggning.

### Pitfall 2: Hostname som fungerar både i webbläsare och container
**Vad går fel:** `external.keycloak.url = http://127.0.0.1:8180/...` → GoTrue i containern når sig själv; `http://host.docker.internal:8180` → webbläsaren på Mac löser inte namnet. go-oidc kräver dessutom att discovery-dokumentets `issuer` exakt matchar konfigurerad URL. [VERIFIED: körda uppslag; `token_oidc.go` använder `oidc.NewProvider(ctx, issuer)` utan `InsecureIssuerURLContext` för keycloak]
**Undvik:** `/etc/hosts`-rad `127.0.0.1 host.docker.internal` (kontroll i `prepare-local`, BLOCKED med instruktion), Keycloak `--hostname http://host.docker.internal:8180`, port publicerad på `127.0.0.1:8180`. Dokumentera i `docs/pilot/README.md`. **Varningstecken:** GoTrue-svar `oidc: issuer did not match` eller `dial tcp 127.0.0.1:8180: connect: connection refused` i `docker logs supabase_auth_…`.

### Pitfall 3: Automatisk identitetslänkning i Supabase Auth
**Vad går fel:** Två Keycloak-användare med samma verifierade e-post (realm `duplicateEmailsAllowed`) länkas till **en** `auth.users`-rad; om appen nycklade på `auth_user_id` skulle rättigheter blandas (acceptansfallet "samma e-post hos två kunder"). [VERIFIED: supabase docs; går inte att stänga av]
**Undvik:** `identities(issuer, subject)` unik; `auth_user_id` är bara en referens (`unique` måste då **inte** vara på `auth_user_id` om två identiteter kan dela användare — gör kolumnen icke-unik eller hantera länkningsfallet uttryckligen). Testa fallet i `verify-access.mjs`. **Varningstecken:** `select count(*) from auth.identities group by user_id` > 1 för Keycloak-identiteter.

### Pitfall 4: `enable_signup` och e-postvägen
**Vad går fel:** `id_token`-grant skapar användare bara om signup är tillåten (`enable_signup = true`, redan så). Samtidigt är e-post/lösenord aktiv i GoTrue (`GOTRUE_EXTERNAL_EMAIL_ENABLED=true`) [VERIFIED: containerns env], men den vägen ger ingen rättighet eftersom Workern aldrig litar på Supabase-JWT. Ändå: fas 1:s `verify-isolation` kunde `signUp` med e-post (INFO-post).
**Undvik:** Sätt `[auth.email] enable_signup = false` i prepare-locals genererade config för protected; behåll `[auth] enable_signup = true` (krävs för `id_token`). Låt `verify-isolation` fortsatt visa att ett e-postkonto inte når något.

### Pitfall 5: Vinext skyddar Server Actions men inte route handlers mot CSRF
**Vad går fel:** Route handlers med cookie-session kan anropas cross-site via formulär-POST om `SameSite=Lax` inte räcker (t.ex. `Lax` tillåter top-level GET-navigering med cookie). [VERIFIED: `validateCsrfOrigin` anropas bara i action-pipelines]
**Undvik:** Alla muterande routes kräver `Sec-Fetch-Site` same-origin/none eller matchande `Origin`; **GET får aldrig mutera** (utloggning är `POST`). Playwright-prov: cross-origin POST från en `data:`-sida → 403.

### Pitfall 6: `auth.uid()`-baserade funktioner får NULL med Worker-rollen
**Vad går fel:** `import_school_unit`, `appoint_school_principal`, `copy_offering_cohort` skriver `actor = auth.uid()`; utan JWT-GUC blir det NULL och `current_app_role()` (profilbaserad) NULL → "Bara huvudmannen …"-fel. [VERIFIED: funktionskropparna i `20260908150000_school_import.sql`, `20260908120000_cohorts_classes.sql`]
**Undvik:** Sätt `request.jwt.claims` med `sub = identities.auth_user_id` per transaktion och omdefiniera `current_organizer_id()`/`current_app_role()` mot GUC (mönster 6). pgTAP: anropa funktionerna som `skolplattform_worker` med och utan GUC.

### Pitfall 7: `registry_snapshots` och existensläckor via 403/tider
**Vad går fel:** Dagens policy `auth.uid() is not null` (fas 1-fynd) och routes som svarar 403 för främmande ID men 404 för obefintligt röjer existens (D-14).
**Undvik:** Kolumn `organizer_id` + policy; enhetlig 404; `update … returning` med 0 rader → 404. Prov: känt främmande ID vs slumpat ID ger identisk statuskod, body-form och (grovt) svarstid.

### Pitfall 8: Postgres-TCP från workerd lokalt är inte bevisat
**Vad går fel:** Cloudflare dokumenterar postgres.js med Hyperdrive och `nodejs_compat`; i produktion blockeras `localhost`/privata IP. Lokalt (Miniflare/workerd i `vinext dev` och `wrangler dev`) förväntas riktiga sockets fungera mot 127.0.0.1:56322, men det är [ASSUMED].
**Undvik:** Spik i plan 02-01: `GET /api/health/db` kör `select 1` i **både** `vinext dev` och den byggda `wrangler dev`-förhandsvisningen. Reserv: PostgREST med Worker-mintad JWT (se Alternativ). **Varningstecken:** `connect(): Network connection lost` eller saknat `cloudflare:sockets`.

### Pitfall 9: Hemligheter till Workern lokalt
**Vad går fel:** Wrangler/vite-pluginen läser `.dev.vars` i konfigurationskatalogen (utan `wrangler.jsonc` = `web/`), annars `.env`/`.env.local` som **hemligheter** (`CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV` default true), och skriver dem till `dist/<env>/.dev.vars` vid bygge; `wrangler dev --config dist/server/wrangler.json` läser `dist/server/.dev.vars`. `web/.gitignore` ignorerar `.env*` och `/dist/` men **inte** `.dev.vars`. [VERIFIED: `wrangler-dist/cli.js` `getVarsForDev`, vite-plugin `dev-vars.ts`; `web/.gitignore`]
**Undvik:** Lägg `.dev.vars*` i `web/.gitignore`; `run-mode.mjs dev|preview --mode protected --target protected` genererar `web/.dev.vars` resp. `dist/server/.dev.vars` från målets manifest (0600) och tar bort dem vid avslut; skriv aldrig ut värden. Bygg `protected` med tomma `NEXT_PUBLIC_*` (klientpaketet ska fortfarande vara utan Supabase — `verify-isolation` kontrollerar). I Workern läses värden via `import { env } from 'cloudflare:workers'` [VERIFIED: vinext README] eller `process.env` (nodejs_compat, kompatibilitetsdatum 2026-09-03 ≥ 2025-04-01 [ASSUMED att `process.env` fylls]).

### Pitfall 10: Realm-import och TOTP-hemligheter
**Vad går fel:** Import av OTP-credentials i realm-JSON har ett internt format (`secretData`/`credentialData`) som lätt blir fel; då kan Playwright inte generera koder.
**Undvik:** Två säkra vägar: (a) testpersonen har required action `CONFIGURE_TOTP`; Playwright läser hemligheten från "Kan du inte skanna?"-texten vid första inloggningen och sparar den i testkörningens minne; (b) Admin REST via `@keycloak/keycloak-admin-client`. Välj (a) för spiket; (b) om upprepade körningar behöver fast hemlighet.

### Pitfall 11: Klockor och "gäller idag"
**Vad går fel:** `current_date` i UTC skiljer sig från svensk kalenderdag runt midnatt; vikariat "från imorgon" öppnas fel timme.
**Undvik:** `(now() at time zone 'Europe/Stockholm')::date` i en `immutable`-hjälpare `app_today()`; prov med `set_config('app.fake_today', …)` för deterministiska tester (läs den i hjälparen när satt).

### Pitfall 12: Phase-1-kontroller får inte gå sönder
**Vad går fel:** `verify-isolation.mjs` räknar `supabase` i byggt paket och kräver 0 tillåtna; `verify-phase1` kräver `dist/build-mode.json` med `mode: example`.
**Undvik:** Nytt bygge `build:protected` märker `mode: protected` i separat `dist`-mapp eller körs efter/före exempelbygget i `verify:phase2`; `preview:example` ska fortfarande vägra ett protected-bygge. Klientbundeln i `protected` importerar fortfarande inte `@supabase/supabase-js`.

## Code Examples

### Login-route (skiss, Vinext route handler)
```ts
// web/app/api/auth/login/route.ts — Källa: openid-client 6 README (VERIFIED) + Vinext route handlers (VERIFIED)
import * as client from 'openid-client';
import { env } from 'cloudflare:workers';

export async function GET(request: Request) {
  const config = await client.discovery(new URL(env.OIDC_ISSUER), env.OIDC_CLIENT_ID, undefined,
    client.ClientSecretPost(env.OIDC_CLIENT_SECRET), { execute: [client.allowInsecureRequests] }); // http lokalt
  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const rawNonce = client.randomNonce();
  const hashedNonce = await sha256Hex(rawNonce);                  // GoTrue jämför sha256(rå) med tokenens nonce
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: env.OIDC_REDIRECT_URI, scope: 'openid profile email',
    code_challenge: codeChallenge, code_challenge_method: 'S256', state, nonce: hashedNonce,
    ...(new URL(request.url).searchParams.get('step_up') ? { acr_values: env.MFA_ACR_VALUES } : {}),
  });
  const headers = new Headers({ Location: url.href });
  headers.append('Set-Cookie', serialize('sp_login', await seal({ codeVerifier, state, rawNonce, hashedNonce }),
    { httpOnly: true, sameSite: 'lax', path: '/api/auth', maxAge: 600, secure: isHttps(request) }));
  return new Response(null, { status: 302, headers });
}
```

### Callback: kodutbyte → GoTrue `id_token`-grant → session
```ts
// Källa: openid-client authorizationCodeGrant (VERIFIED), gotrue token_oidc.go (VERIFIED)
const tokens = await client.authorizationCodeGrant(config, new URL(request.url),
  { pkceCodeVerifier: login.codeVerifier, expectedState: login.state, expectedNonce: login.hashedNonce });
const claims = tokens.claims()!;                                   // iss, sub, acr, amr, auth_time, email, name
const gotrue = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=id_token`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
  body: JSON.stringify({ provider: 'keycloak', id_token: tokens.id_token, nonce: login.rawNonce }),
});
if (!gotrue.ok) return deny('idp_registration_failed');           // aldrig tyst fortsättning
const { user } = await gotrue.json();                             // user.id = auth_user_id
```

### Transaktion med kontext och händelse (postgres.js)
```ts
// Källa: postgres.js sql.begin + PostgreSQL set_config (VERIFIED standard)
export async function withContext<T>(ctx: Ctx, fn: (tx: Sql) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.identity_id', ${ctx.identityId}, true),
                    set_config('app.customer_id', ${ctx.customerId ?? ''}, true),
                    set_config('app.organizer_id', ${ctx.organizerId ?? ''}, true),
                    set_config('app.app_role', ${ctx.appRole ?? ''}, true),
                    set_config('app.membership_id', ${ctx.membershipId ?? ''}, true),
                    set_config('app.assignment_id', ${ctx.assignmentId ?? ''}, true),
                    set_config('app.correlation_id', ${ctx.correlationId}, true),
                    set_config('request.jwt.claims', ${JSON.stringify({ sub: ctx.authUserId, role: 'authenticated' })}, true)`;
    const live = await tx`select m.status, a.valid_from, a.valid_to, a.ended_at
                          from app_sessions s join memberships m on m.id = s.membership_id
                          left join access_assignments a on a.id = s.assignment_id
                          where s.id = ${ctx.sessionId} and s.revoked_at is null and s.expires_at > now()`;
    if (!live[0] || live[0].status !== 'active' || !validToday(live[0])) throw new Deny('context_invalid');
    const result = await fn(tx);
    await tx`insert into security_events (correlation_id, source, actor_identity_id, actor_issuer, actor_subject,
             session_id, membership_id, assignment_id, customer_id, action, object_type, object_id, outcome, details)
             values (${ctx.correlationId}, 'worker', ${ctx.identityId}, ${ctx.issuer}, ${ctx.subject}, ${ctx.sessionId},
             ${ctx.membershipId}, ${ctx.assignmentId}, ${ctx.customerId}, ${ctx.action}, ${ctx.objectType}, ${ctx.objectId}, 'ok', ${ctx.details})`;
    return result;
  });
}
```

### pgTAP: RLS som Worker-roll och oföränderlig logg
```sql
-- Mönster från supabase/tests/phase1_isolation.test.sql (VERIFIED)
begin; create extension if not exists pgtap with schema extensions; select plan(6);
set role skolplattform_worker;
select set_config('app.customer_id', '<kund A>', true);
select is((select count(*) from public.memberships where customer_id = '<kund B>'), 0::bigint, 'RLS döljer annan kunds medlemskap');
select throws_ok($$update public.security_events set action = 'x' where id = 1$$, '42501', null, 'worker saknar UPDATE på loggen');
reset role;
select throws_like($$delete from public.security_events where id = 1$$, '%oföränderlig%', 'trigger stoppar även ägaren');
select is(has_table_privilege('authenticated', 'public.memberships', 'SELECT'), false, 'klientroller fortsatt stängda');
select is(has_function_privilege('skolplattform_worker', 'public.bootstrap_demo_profile(text)', 'EXECUTE'), false, 'demofunktionen finns inte/nekas');
select * from finish(); rollback;
```

### Klient: BroadcastChannel och epok
```ts
// web/lib/session-channel.ts (skiss)
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('skolplattform-session') : null;
export function announce(msg: { type: 'epoch'; epoch: number } | { type: 'logged-out' }) { channel?.postMessage(msg); }
export function onSessionMessage(handler: (msg: unknown) => void) { channel?.addEventListener('message', (e) => handler(e.data)); }
// I fetch-omslaget: const epoch = Number(res.headers.get('X-Context-Epoch')); if (epoch && epoch !== current) lock();
```

## State of the Art

| Äldre sätt | Nuvarande | När | Påverkan |
|------------|-----------|-----|----------|
| Anonym inloggning + `bootstrap_demo_profile` (fas 0) | Extern OIDC-identitet, medlemskap via inbjudan | Fas 2 | D-15: funktionen tas bort ur körd databas |
| En roll per `profiles`-rad, RLS via `current_app_role()` på profil | `identities → memberships → access_assignments` med giltighet; hjälpare läser sessions-GUC | Fas 2 | Befintliga policyer blir andra linje utan omskrivning |
| Klienten skriver `actor_role` | Trigger sätter aktörsfält ur serverkontext | Fas 2 | AUDIT-01 |
| Supabase-JWT i webbläsaren (`persistSession`) | Opak httpOnly-cookie, serverlagrad session | Fas 2 | Ingen token i klienten; `verify-isolation` fortsätter gälla |
| `wrangler dev` utan hemligheter | `.dev.vars` genererad per mål | Fas 2 | Kräver gitignore-tillägg |
| GoTrue "custom OAuth providers" (`custom:`-prefix) finns i v2.187 | — | Sep 2026 | Ej nödvändigt: `keycloak` är inbyggd provider [VERIFIED: `token_oidc.go`] |
| Supabase CLI 2.78.1 installerad; 2.117.0 finns | Behåll 2.78.1 i fasen | — | Uppgradering byter GoTrue-version och kräver omverifiering av spiket; gör det inte mitt i fasen |

**Utfasat/ej tillämpligt:** Supabase "third-party auth" (bara Cognito/Auth0/Firebase/Clerk); `GOTRUE_EXTERNAL_ALLOWED_ID_TOKEN_ISSUERS` (markerad deprecated i källan); Keycloaks `hostname:v1`-flaggor (v2 är standard i 26.x).

## Open Questions — RESOLVED för planering, körbevis återstår

**Planeringsavstämning 2026-09-13 — RESOLVED:** Besluten D-16–D-18 i CONTEXT är redan godkända och ska inte återfrågas. Planeringshanteringen är avgjord för alla sju punkter: 1 och 3 verifieras genom stoppande spik i 02-03/02-04; 2 är D-17; 4 genomförs i 02-07/02-08; 5 använder 15 min glidande och 8 h absolut med prov i 02-11; 6 följer det uttryckliga kontraktet nedan; 7 är senarelagd med ägare fas 7. RESOLVED betyder vald hantering, inte passerade körprov eller vald kommunleverantör. Ingen ny teknisk körverifiering har gjorts vid denna uppdatering.

1. **Fungerar postgres.js mot 127.0.0.1:56322 från workerd i `vinext dev` och `wrangler dev`?**
   - Vet: Cloudflare listar postgres.js ≥ 3.4.5 med `nodejs_compat`; lokala sockets i Miniflare används brett. [VERIFIED delvis]
   - Oklart: uttrycklig dokumentation för lokal Postgres utan Hyperdrive saknas. [ASSUMED]
   - Planerat bevis: 02-03 task 1 prövar `GET /api/health/db` i dev och byggd Worker; 02-04 granskar spikbeviset. Misslyckande är stoppande BLOCKED. Reservväg väljs uttryckligen och berörda planer revideras före fortsatt exekvering; ingen tyst fallback.

2. **Hosts-raden är godkänd — D-17.** Detta är inte längre en öppen preferensfråga. 02-01 kontrollerar `127.0.0.1 host.docker.internal` och rapporterar BLOCKED om den saknas. Inget skript ändrar hosts-filen självt. Faktisk konfiguration verifieras vid exekvering.

3. **Keycloaks exakta realm-JSON för LoA-flöde, AMR-referenser och TOTP-import.** Vet: funktionerna finns i 26.x [VERIFIED översikt]. Oklart: fältnamn i export/import. Rekommendation: bygg realmen en gång i admin-UI på det disponibla målet, exportera med `kc.sh export --realm`, lägg exporten (utan hemligheter, klientsekret som platshållare) som `work/pilot/idp/realm-template.json`. Verifiera faktiska `acr`/`amr`/`auth_time`-värden i ID-token i 02-03/02-04 innan administrativa vägar öppnas. Saknade eller oväntade anspråk får inte räknas som MFA; detta är ett stoppande körbevis, inte en redan verifierad egenskap.

4. **Hur mycket av dagens stores ska öppnas i `protected` i fas 2?** Vet: fas 3 äger "skyddade datavägar", fas 5 bevarade flöden med verkliga identiteter. Rekommendation: fas 2 öppnar exakt kundadministrationens vägar (kund, inbjudan, medlemskap, uppdrag, huvudman via `organizers`, skolenhet via `import_school_unit`, rektor via `appoint_school_principal`, organisationens läsning) plus säkerhetslogg; övriga vyer visar "Stängt i denna fas" i `protected`. Detta räcker för alla sex krav och ger AUDIT-01 "första skyddade ändringen".

5. **Sliding 15 min i praktiken.** Vet: D-11 tillåter Claude's discretion. Rekommendation: 15 min glidande + 8 h absolut; klienten pingar `/api/session` vid `visibilitychange` (inte periodiskt, för att inte hålla sessionen vid liv i bakgrunden). Mät i browserprov att en 16 minuters paus ger utloggat läge.

6. **GoTrue-nonce: hex eller base64?** Vet: `sha256(params.Nonce)` jämförs med tokenens `nonce` [VERIFIED]. Oklart: kodning. **RESOLVED — planeringskontrakt:** Enligt 02-01/02-03/02-04 är Workern OIDC-klient (D-16) och validerar nonce tillsammans med utfärdare, audience, state, PKCE och tokenens giltighet före GoTrue-anropet. Den separata GoTrue-providern använder avsiktligt `skip_nonce_check = true` för identitetsregistreringen och får inte bli en alternativ väg till appsession eller rättigheter. Detta är vald lokal konfiguration, inte en reserv som aktiveras när ett prov faller. 02-04 måste bevisa att fel nonce nekas i Workern, ingen appsession skapas och GoTrue-vägen ensam inte ger skyddad åtkomst. Saknat eller misslyckat bevis stoppar exekveringen; ingen noncevalidering i Workern får stängas av.

7. **Fas 7 och SAML (Skolfederation).** Varken Worker-OIDC eller GoTrue-`id_token` ger SAML som ren konfiguration; Supabase SAML SSO är en molnfunktion utan lokal motsvarighet. Sannolik väg: Keycloak (eller kommunens IdP) som broker SAML→OIDC. Utanför fas 2; notera i `connection-profile.md` OB-02 när fas 7 planeras.

## Environment Availability

| Beroende | Krävs av | Tillgängligt | Version | Reserv |
|----------|----------|--------------|---------|--------|
| Node (Homebrew node@25) | web/, prov | ✓ | v25.9.0 (npm 11.12.1) | — |
| Docker Desktop | Supabase-mål, Keycloak | ✓ (daemon svarar) | Engine 25.0.2 / Desktop 4.27.1 | — (BLOCKED utan) |
| Supabase CLI | Lokala mål, `test db` | ✓ | 2.78.1 (GoTrue v2.187.0, PostgREST v14.5, PG 17.6.1.095) | Uppgradera inte i fasen |
| Lokala mål baseline/protected | Alla databasprov | ✓ körs | API 55321/56321, DB 55322/56322 | `prepare-local --fresh` |
| psql-klient | Fixturer, prov | ✓ | 14.15 (mot PG17, fungerar sedan fas 1) | — |
| Keycloak-bild | D-01 | ✗ ej hämtad | mål 26.7.3 (finns på quay.io) | Kräver nät vid första `prepare-local --with-idp`; saknas nät → BLOCKED |
| `host.docker.internal` på värden | GoTrue ↔ Keycloak | ✗ (löses inte; `/etc/hosts` rootägd) | — | Manuell rad med sudo (instruktion från prepare-local) eller LAN-IP-variant; annars reservväg utan GoTrue (D-01-beslut) |
| Container → värdens 127.0.0.1-tjänster | Keycloak nåbar från GoTrue | ✓ testat (HTTP 200 via host.docker.internal) | — | — |
| openid-client, postgres, otpauth | Worker, prov | ✗ ej installerade | 6.8.8 / 3.4.9 / 9.5.2 på npm | `npm install` (nät) |
| Playwright + webbläsare | Browserprov | ✓ (fas 1 körde 12+3 prov) | 1.63.0 | — |
| pgTAP/pg_prove | SQL-prov | ✓ (bild hämtad i fas 1) | pg_prove 3.36 | — |
| jose | ev. prov | ✓ transitivt | i node_modules | — |

**Saknade beroenden utan reserv:** inga som blockerar planering. Keycloak-bilden och npm-paketen kräver nätåtkomst vid första körning.
**Saknade beroenden med reserv:** `host.docker.internal`-uppslag på värden (hosts-rad eller D-01-reservväg).

## Validation Architecture

`workflow.nyquist_validation` är `true` i `.planning/config.json` [VERIFIED].

### Test Framework
| Egenskap | Värde |
|----------|-------|
| Ramverk | `node:test` (Node 25) för `web/lib/*.test.mjs`; pgTAP via `supabase --workdir work/pilot/targets/protected test db --local`; Playwright 1.63.0; API-/integrationsprov i `work/pilot/*.mjs` (mönster `assertTarget` + resultatfil utan hemligheter) |
| Konfigfil | `web/playwright.config.ts` (utökas med projekt `protected`), `supabase/tests/phase2_*.test.sql` (nya), `web/scripts/verify-phase2.mjs` (ny, kopia av `verify-phase1.mjs`-mönstret) |
| Snabb körning | `cd web && export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && node --test lib/*.test.mjs` (< 2 s) |
| Full svit | `cd web && npm run verify:phase2` (modeller, tsc, lint, bygge protected+example, pgTAP fas 1+2, `verify-isolation`, `verify-access`, Playwright); BLOCKED (exit 3) utan Docker/Keycloak — aldrig PASS |

### Phase Requirements → Test Map
| Krav | Beteende | Testtyp | Automatiserat kommando | Fil finns? |
|------|----------|---------|------------------------|-----------|
| IAM-01 | Inbjudan med fel utfärdare/utgången/redan använd nekas; org.nummer/e-postdomän ger inget medlemskap; giltig inbjudan ger exakt ett medlemskap + kundadmin-uppdrag + händelse | integration (API) + pgTAP | `node work/pilot/verify-access.mjs --case inbjudan`; `supabase … test db` | ❌ Wave 0 |
| IAM-03 | `/api/session` listar giltiga/kommande/avslutade uppdrag korrekt runt datumgränser; kontextbyte utan ny inloggning; rättigheter följer valt uppdrag | pgTAP (`app_today` med fejkat datum) + Playwright | `supabase … test db`; `npx playwright test --project protected -g uppdrag` | ❌ Wave 0 |
| IAM-04 | Utloggning revokerar sessionen (nästa anrop 401); två flikar: byte i A låser B; 16 min paus → utloggat | Playwright (två sidor i samma kontext) + API | `npx playwright test --project protected -g "flik|utlogg"`; `verify-access --case session-expiry` (stubbar tid via `set_config('app.fake_now')` eller kort livstid i testmål) | ❌ Wave 0 |
| IAM-05 | Spärr av medlemskap → befintlig sessions nästa anrop 403 med giltig cookie; avslutat uppdrag mid-session → 403; spärr utan MFA nekas | API + Playwright | `verify-access --case sparr --case uppdrag-avslut --case mfa-kravs` | ❌ Wave 0 |
| ACL-01 | Känt objekt-ID från kund B som kund A ger 404 identiskt med obefintligt; sök/lista/export innehåller bara egen kund; PostgREST/GraphQL/Storage fortsatt 0 tillåtna; RLS som worker-roll döljer främmande rader | API + pgTAP + fas 1 `verify-isolation` | `verify-access --case frammande-id`; `node work/pilot/verify-isolation.mjs`; pgTAP | ❌ Wave 0 (isolation ✓ finns) |
| AUDIT-01 | Varje ändring ger exakt en `security_events`-rad med aktör = sessionens identitet oavsett vad klienten skickar; `actor_role` i `*_events` överskrivs av trigger; UPDATE/DELETE på loggen nekas; granskare ser bara sin kund och export loggas; nekanden aggregeras efter 20/min | pgTAP + API | `supabase … test db`; `verify-access --case logg --case logg-flod` | ❌ Wave 0 |
| D-02 (acceptansfall) | Två Keycloak-användare med samma e-post → två `identities`, inga delade medlemskap | API | `verify-access --case samma-epost` | ❌ Wave 0 |
| D-03 | Admin-åtgärd med `amr` utan `otp` → 403 `mfa_required`; efter step-up → OK | Playwright (TOTP via otpauth) | `npx playwright test --project protected -g mfa` | ❌ Wave 0 |

### Sampling Rate
- **Per uppgiftscommit:** `node --test lib/*.test.mjs` samt berörd pgTAP-fil när migration ändrats (`supabase --workdir … test db --local`, ~5 s).
- **Per våg:** `npm run verify:phase2 -- --skip-browser` (mål: < 30 s exkl. bygge) samt riktad Playwright för ändrade vyer.
- **Fasgrind:** full `npm run verify:phase2` grön (browsersteget obligatoriskt) före `/gsd:verify-work`; `verify:phase1` ska också fortfarande vara PASS (regression av fas 1:s bevis).

### Wave 0 Gaps
- [ ] `work/pilot/prepare-local.mjs --with-idp` (Keycloak-start, realm-generering, hemligheter i manifest, hosts-kontroll) och `work/pilot/idp/realm-template.json`
- [ ] `web/scripts/run-mode.mjs` läge `protected` (+ `.dev.vars`-generering, `build:protected`, `preview:protected`) och `.dev.vars*` i `web/.gitignore`
- [ ] Spik 02-01: `app/api/health/db/route.ts`, login/callback/logout, minimal `app_sessions` + worker-roll — bevis i byggd Worker
- [ ] `supabase/tests/phase2_access.test.sql`, `phase2_audit.test.sql` — grants, RLS som `skolplattform_worker`, append-only, trigger för aktörsfält, `registry_snapshots`
- [ ] `work/pilot/verify-access.mjs` med fall enligt tabellen (resultat `work/pilot/results/access.json` utan hemligheter)
- [ ] `web/e2e/phase2-access.spec.ts` + projekt `protected` i `playwright.config.ts` (server via `dev:protected:test` mot protected-målet + Keycloak; TOTP via `otpauth`)
- [ ] `web/scripts/verify-phase2.mjs` (sammanställare; PASS/FAIL/BLOCKED/KNOWN-ISSUE som fas 1)
- [ ] `web/lib/runtime-mode.test.mjs` utökas med `protected`; `web/lib/session-channel.test.mjs` (epok-logik ren funktion)

## Sources

### Primära (HIGH)
- gotrue v2.187.0 källkod (versionen som körs i målen): `internal/api/provider/keycloak.go`, `internal/api/token_oidc.go`, `internal/api/external.go`, `internal/api/provider/oidc.go`, `internal/api/provider/provider.go` — Keycloak-providerns userinfo-beteende, `id_token`-grant för keycloak, nonce-hashning, `Claims` utan okända fält, query-param-vidarebefordran, avsaknad av upstream-utloggning
- Keycloak Javadoc 26.5.1: `AcrProtocolMapper`, `AmrProtocolMapper` (implementerade gränssnitt utan `UserInfoTokenMapper`)
- keycloak.org/server/containers, /server/hostname (26.7.x): `start-dev`, `--import-realm`, `KC_BOOTSTRAP_ADMIN_*`, `--hostname`, `--hostname-backchannel-dynamic`
- quay.io tag-API `keycloak/keycloak`: 26.7.3 (2026-08-31), `latest` = 26.7.3
- supabase.com/docs: `local-development/cli/config` (auth.external.*, hooks, sessions, third_party-lista), `auth/social-login/auth-keycloak` (`openid`-scope sedan Keycloak 22, url = issuer), `auth/auth-identity-linking` (automatisk länkning kan inte stängas av)
- openid-client README och `docs/functions/allowInsecureRequests.md` (runtimes inkl. Cloudflare Workers; http-issuer i utveckling)
- developers.cloudflare.com: Hyperdrive postgres-js-exempel (`postgres@>3.4.5`, `nodejs_compat`), TCP-sockets (produktionsbegränsningar)
- Lokal miljö 2026-09-12: `docker ps/inspect/exec`, `dscacheutil`, curl-test container→värd, `supabase --version`, `npm view`, `node_modules/vinext` (README, `request-pipeline.js`, `headers.js`), `node_modules/wrangler/wrangler-dist/cli.js` (`getVarsForDev`), `node_modules/@cloudflare/vite-plugin/dist/index.mjs` (`dev-vars.ts`), `dist/server/wrangler.json`, `web/.gitignore`
- Projektfiler: 02-CONTEXT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, 01-VERIFICATION.md, 01-03/05/06-SUMMARY.md, `docs/kommunintegration-och-sakerhet.md`, `.planning/codebase/*.md`, `supabase/migrations/*.sql`, `supabase/tests/phase1_isolation.test.sql`, `work/pilot/*.mjs`, `web/lib/*.ts`, `web/scripts/run-mode.mjs`, `web/playwright.config.ts`, AGENTS.md

### Sekundära (MEDIUM)
- Red Hat build of Keycloak 24 admin guide + keycloak.org server_admin (via websearch/utdrag): AMR-mapper och "Authenticator reference", step-up/LoA-översikt, `acr_values`/`claims`
- Supabase CLI-mappning `[auth.external.keycloak].url` → `GOTRUE_EXTERNAL_KEYCLOAK_URL` (härlett ur config-mallens generiska providerblock och containerns env för apple)

### Tertiära (LOW / ASSUMED — validera i spik)
- postgres.js TCP mot 127.0.0.1 från workerd lokalt utan Hyperdrive
- `process.env`-fyllning i workerd via nodejs_compat med kompatibilitetsdatum 2026-09-03
- Hex-kodning av GoTrue:s nonce-hash
- Keycloak: realm-JSON-fält för LoA-villkor, AMR-referenser, OTP-credential-import; `end_session` utan `id_token_hint`
- BroadcastChannel-stöd (allmänt känt, ej källkontrollerat här)

## Metadata

**Konfidens per område:**
- Standard stack: HIGH — versioner mot registret och installerad miljö; Keycloak-tag mot quay.io
- IdP-koppling (D-01/D-03): HIGH på vad som *inte* fungerar (källkod), MEDIUM på den rekommenderade vägens detaljer (nonce-kodning, realm-JSON) → spik
- Serverlager/Worker: MEDIUM — Vinext-funktioner verifierade i kod; TCP-Postgres lokalt ej bevisat
- Datamodell/RLS: HIGH — PostgreSQL-standardmekanismer, fas 1-mönster verifierade
- Pitfalls: HIGH för 1–3, 5–7, 9, 12 (verifierade); MEDIUM för övriga

**Researchdatum:** 2026-09-12
**Giltig till:** 2026-10-12 (30 dagar) — kortare om Supabase CLI eller Keycloak-bilden byts (GoTrue-version följer CLI)

## Riktad beredskapsgranskning 2026-09-13

`docs/pilot/bankid-readiness-review.md` kompletterar denna research efter användarens beställning D-19. Fas 1-koden saknar fortfarande riktig autentisering; fas 2 är planerad, inte implementerad. Minsta komplettering av planeringen är små servergränser för leverantörsregistrering/bevismappning, utfärdar- och klientbunden policy, step-up bunden till ursprunglig session/arbetskontext samt minimal verifieringsmetadata i skyddad audit. Befintligt internt identitets-ID och separat mandatprövning behålls.

Full BankID-anslutning, kontolänkning, beslutsbunden engångsverifiering och elektronisk underskrift återstår som separat arbete. Lokalt MFA-prov styrker inte viss personidentitetsnivå eller underskrift. Rapporten anger officiella källor och skillnaden mellan befintlig kod, plan och rekommendation. Detta tillägg är inte ett påstående om körverifierad integration.
