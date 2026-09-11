# Phase 1: Baslinje och avskild pilotmiljö — Pattern Map

**Mapped:** 2026-09-11
**Scope:** BASE-01, BASE-02, PILOT-01. Underlag för planering; ingen appkod, databas eller drift har ändrats eller körverifierats här.
**Inputs:** `01-CONTEXT.md`, `01-RESEARCH.md` (arkitektur, filfördelning och validering), projektvägledningen, aktuell kodkarta och nedanstående kodankare. Granskad `01-UI-SPEC.md` anger gränssnittets detaljer.

Nya filnamn nedan är avgränsade planeringsförslag tills research och planer fastställer dem. Befintliga filer behöver bara ändras där det valda kontraktet kräver det. En egen fil för varje hjälpfunktion är inte ett krav. Baslinjens ursprungliga källor och migreringar ska bevaras som historik innan beteendet förändras.

## File Classification

Matchning anger återanvändbar struktur, inte att dagens säkerhetsbeteende är godkänt. `exact` för en befintlig fil betyder att ändringen hör hemma i samma roll och dataflöde; spärrarna kan ändå behöva byggas från grunden.

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `web/lib/supabase.ts` | service | request-response | Egen typad klientfabrik, rader 5–19 | exact; nuvarande åtkomstvillkor ersätts |
| `web/lib/runtime-mode.ts` (nytt namn föreslaget) | utility | transform | Konfigurationsinläsning i `supabase.ts:8–22` | role-match; ingen säker lägesmodell finns |
| `web/lib/runtime-mode.test.mjs` (nytt namn föreslaget) | test | transform | `web/lib/cohort-model.test.mjs:1–44` | exact teststruktur |
| `web/lib/organisation-store.ts` | store | CRUD | Egen `currentOrganizer`/felhantering, rader 237–254 | exact; demo och seedning är undantag att ta bort |
| `web/lib/planning-store.ts` | store | CRUD | Egen klient-/felhjälpare, rader 44–55 | exact; laddningarnas skrivbiverkan ersätts |
| `web/lib/pilot-fixtures.ts` (nytt namn föreslaget) | model | transform | `web/lib/organisation-model.ts:650–690`, `web/lib/admin-model.ts:316–400` | role-match; sammanhållen tvåskolefixtur saknas |
| `web/lib/pilot-fixtures.test.mjs` (nytt namn föreslaget) | test | transform | `web/lib/cohort-model.test.mjs:12–61` | exact teststruktur |
| `web/app/page.tsx` | component | event-driven | Egen sessionsägare, rader 241–246 och 372–384 | exact |
| `web/app/organisation-workspace.tsx` | component | event-driven | Eget lokalt tillstånd och skolväljare, rader 170–188 och 586–618 | exact |
| `web/app/globals.css` | config | transform | Egna brytpunkter, rader 674–708 och 1895–1909 | exact |
| `web/scripts/phone-preview.mjs` | utility | request-response | Egen loopbackserver, proxy och stängning, rader 6–80 | exact |
| `web/vite.config.ts` | config | transform | Egen Vinext/Cloudflare-konfiguration, rader 37–60 | exact |
| `web/package.json` | config | file-I/O | Egna bygg-/telefonkommandon, rader 8–14 | exact |
| `.gitignore` | config | file-I/O | Egen lista, rader 1–15 | exact |
| `web/.gitignore` | config | file-I/O | Egna miljö-/utdatagränser, rader 29–38 | exact |
| `supabase/config.toml` | config | file-I/O | Eget projekt/API/Auth-upplägg, rader 1–18 och 150–171 | exact; nuvarande anonyma Auth är osäkert för skyddad miljö |
| `supabase/migrations/<timestamp>_quarantine_demo_access.sql` | migration | CRUD | Explicit funktionsprivilegium i `20260905130000_demo_bootstrap.sql:34–35` | role-match; full karantän saknas |
| `work/pilot/verify-target.mjs` | utility | transform | Ingen säker kontroll av avsiktligt isolerat mål | none |
| `work/supabase/verify.mjs` | test | request-response | Egen modell → lagring → omläsning; fixtures måste isoleras före användning | exact testroll |
| `work/supabase/verify-cohorts.mjs` | test | request-response | Egna assertioner och avgränsad städning, rader 12–49 | exact testroll |
| `work/supabase/verify-school-import.mjs` | test | request-response | Egna rollback-/rektorsprov, rader 15–31 | exact testroll |
| `work/pilot/verify-isolation.mjs` | test | request-response | Assertion-/felstruktur i `verify-cohorts.mjs:8,27–43` | role-match; negativ privilegietäckning är ny |
| `web/scripts/run-mode.mjs` | utility | batch | Underprocess och explicit miljö i `phone-preview.mjs:6–17` | role-match |
| `work/pilot/prepare-local.mjs` | utility | file-I/O | Ingen isolerad mål-/manifestfabrik finns | none |
| `work/pilot/verify-baseline.mjs` | utility | batch | Inget revisionsbundet återspel finns | none |
| `work/pilot/verify-baseline-db.mjs` | test | request-response | `verify-cohorts.mjs:12–49` | role-match; mål/arkiv kopplas enligt research |
| `supabase/tests/phase1_isolation.test.sql` | test | request-response | Ingen pgTAP-svit finns | none |
| `web/playwright.config.ts` | config | file-I/O | Ingen browsertestkonfiguration finns | none |
| `web/e2e/phase1-baseline.spec.ts` | test | event-driven | Modellens bevarandefall finns; ingen browseranalog | none |
| `web/e2e/phase1-isolation.spec.ts` | test | event-driven | Ingen byggd nätverks-/lägessvit finns | none |
| `web/e2e/phase1-save-order.spec.ts` | test | event-driven | Kodfynd i workspace finns; ingen styrbar browserreproducerare | none |
| `web/lib/store-isolation.test.mjs` | test | request-response | Node-teststruktur i `cohort-model.test.mjs:1–10` | role-match; kontrollerad transport är ny |
| `docs/pilot/baseline.md` | config | file-I/O | Fallbeskrivningar i `docs/elevkullar-och-klasskopplingar.md:9–37` | role-match; nytt revisionsbundet bevis krävs |
| `docs/pilot/connection-profile.md` | config | file-I/O | Ingen fullständig daterad anslutningsprofil finns | none |
| `web/package-lock.json` | config | file-I/O | Befintlig npm-låsfil; genereras genom paketkommandot | role-match till paketkonfiguration |

**35 fil-/målposter:** 17 exact, 9 role-match, 9 utan analog. Strukturlikhet innebär inte befintlig täckning av säkerhetskravet. Nya namn följer research; planer kan begränsa vilka äldre verktyg som behöver ändras.

## Pattern Assignments

### Klient och laddning: `supabase.ts`, `runtime-mode.ts`, båda datalagren

**Imports och klienttyp — `web/lib/supabase.ts:5–6,11`:**

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';
export type Client = SupabaseClient<Database>;
```

Behåll typad klient och relativa `.ts`-importer i domän-/verktygslagret. Komponenter använder redan aliaset `@/`. Lägesklassificering ska vara testbar utan att skapa en klient eller läsa en befintlig användarsession. Använd researchens kontrakt för uttryckligt provläge och nekad skyddad start; `Boolean(url && key)` är en konfigurationskontroll, inget säkerhetsmönster.

**Fel före användning — `web/lib/planning-store.ts:44–47,53–55`:**

```typescript
function client(): Client {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  return db;
}
const fail = (what: string, message: string): never => {
  throw new Error(`Kunde inte ${what}: ${message}`);
};
```

**Saknad organisatorisk kontext — `web/lib/organisation-store.ts:239–243`:**

```typescript
async function currentOrganizer(db: Client): Promise<string> {
  const { data, error } = await db.rpc('current_organizer_id');
  if (error) throw new Error(`Kunde inte läsa huvudmannen: ${error.message}`);
  if (!data) throw new Error('Användaren är inte knuten till någon huvudman.');
  return data;
}
```

Återanvänd uttryckliga fel och typade resultat. Kopiera inte läsning → anonym inloggning → seedning. `loadOrganisation:247–274`, `loadTimplans:92–108` och `loadSchoolYears:245–269` innehåller just den biverkan fasen ska avskilja. Hela datalagrets anropsyta måste stoppas av klientgränsen även när någon importerar lagret direkt; ett React-villkor räcker inte.

### Sammanhängande provmaterial: `pilot-fixtures.ts` och dess tester

**Fabrik med explicit källunderlag — `web/lib/admin-model.ts:316–320`:**

```typescript
export type AdminSource = { organisation: OrganisationState; timplans: TimplanState };
export function createAdminState(source?: AdminSource): AdminState {
  const organisation = source?.organisation ?? createOrganisationState();
  const timplans = source?.timplans ?? createTimplanState(organisation);
  const groups = baseGroups.map((g) => ({ ...g, members: [] as string[] }));
```

Återanvänd modellernas kopplingar och regler, men skapa ett sammanhållet provunderlag med en huvudman, en GR-skola och en GY-skola. Relatera utbildningar, elever, klassförslag, planer och läsår till rätt skola genom explicita ID:n. Ge varje ny provsession egna objekt så att mutationsläckor mellan fabriksanrop undviks.

**Anpassning som krävs:** `createOrganisationState:650–680` har en skola med båda skolformerna. `createAdminState:339` refererar till `sa25`/`ek25`; `:377` sätter alla elevers `unitId` till `organisation.activeUnitId`. `deriveClasses:295–313` grupperar efter klassnamn utan skol-ID. Återanvänd därför inte fabrikerna oförändrade och anta att skolbyte räcker. Avgränsa klassunderlaget till aktiv skola före dagens klassderivering; skapa inte en fullständig beständig klassmodell i fas 1.

**Testimports — `web/lib/cohort-model.test.mjs:1–4`:**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrganisationState } from './organisation-model.ts';
import { createTimplanState, deriveEducations } from './timplan-model.ts';
```

**Bevisa oberoende — samma fil, rader 15–16 och 31–33:**

```javascript
const snapshot = structuredClone({ org, tp });
const next = copyCohort(org, tp.plans, 'huvudman', 'sa25', 2027);
// Efter ändringar i kopian:
copied.cells[Object.keys(copied.cells)[0]][0] = 999;
next.offering.pointPlans[0].specialization.push('LOCAL');
assert.deepEqual({ org, tp }, snapshot);
```

Kontrollera skol-/utbildningsreferenser, oberoende sessionsobjekt och faktiskt användbara klassförslag för GR och GY. Bevara befintliga positiva och negativa kull-/klassfall på rader 12–129. Exempelrollens `assert.throws` är modellvalidering, inte bevis på databasbehörighet.

### Sidans tillstånd och skolval: `page.tsx`, `organisation-workspace.tsx`, CSS

**Tillståndsägare:** `web/app/page.tsx:241–246` äger `AdminState` i `useState`. Bevara sammanhållet sessionsägarskap och bedöm nekad start före montering/laddning. Dagens `key` på `OrganisationWorkspace` (`page.tsx:374–376`) återskapar komponenten vid grundskolebyte. Kopiera inte detta till skolväxlaren: ändringar ska finnas kvar medan sidan är öppen.

**Tillgänglig native-väljare — `web/app/organisation-workspace.tsx:590–603`:**

```tsx
<select
  className="og-unit-switch"
  aria-label="Skolenhet"
  value={unit.id}
  onChange={(e) => {
    run((s) => selectUnit(s, e.target.value));
    setOfferingId('');
    setPlanId(null);
  }}
>
  {unitsForRole(org, role).map((u) => (
    <option key={u.id} value={u.id}>{u.name}</option>
  ))}
</select>
```

Återanvänd native select och återställning av detaljval; följ UI-SPEC:s synliga etikett **Exempelskola**, skolformstext, fokus och pekytor. Synkronisera samma skolkontext med elev-/klassunderlaget. `page.tsx:209–218` och `organisation-workspace.tsx:611–618` är ankare för miljö- och rollförklaring; använd UI-SPEC:s nya texter och verklig lagringslivslängd.

**Responsiv avgränsning — `web/app/globals.css:1898,1906,1909`:**

```css
.class-plan-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-items:end;gap:12px;margin:18px 0}
@media(max-width:600px){.class-plan-form{grid-template-columns:minmax(0,1fr)}.tp-cover{flex-direction:column}.tp-cover-side{align-items:flex-start}.tp-layout{grid-template-columns:minmax(0,1fr)}}
.tp-grid-scroll{contain:layout paint}
```

Bevara befintliga verksamhetsytor och tabellens egna rullområde. Nya kontroller följer UI-SPEC:s token och 320 px-/telefonprov; dessa kodexempel är inte en fullständig tillgänglighetsgranskning.

### Lokal körning: `phone-preview.mjs`, Vite, paket och ignorefiler

**Programstart utan shell — `web/scripts/phone-preview.mjs:6–17`:**

```javascript
const project = fileURLToPath(new URL('../', import.meta.url));
const upstreamPort = 3001;
const phonePort = 3002;
const child = spawn(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'dev',
  '--config', 'dist/server/wrangler.json',
  '--port', String(upstreamPort), '--ip', '127.0.0.1', '--inspector-port', '0',
], {
  cwd: project,
  env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

Återanvänd `process.execPath`, argumentlista, explicit arbetskatalog, avbrottshantering på rader 46–58 och beredskapsprov på rader 60–72. Anpassa miljöarvet enligt research så att en gammal `.env.local` eller gammalt bygge inte väljer dagens anslutna demoprojekt. Före start måste valt bygge och dess läge vara entydiga.

**HTTP-gräns:** `phone-preview.mjs:25–30` avvisar andra metoder än GET/HEAD och sökvägarna `/cdn-cgi/`/`/__debug`. Återanvänd detta för klientprovet; det stoppar inte JavaScript som kontaktar Supabase direkt och bevisar inget Auth-/servermutationsflöde.

`web/vite.config.ts:37–60` behåller Vinext, Cloudflare och den befintliga RSC/SSR-kopplingen; ingen verktygsuppgradering behövs för mönsteråterbruk. Paketets befintliga kommandon finns på `web/package.json:8–14`. Rootens `.gitignore:3–5` undantar `.env*` men tillåter `.env.example`; webbappens `.gitignore:29–30` undantar alla `.env*`. En ny ofarlig exempelkonfiguration måste därför hanteras i båda relevanta ignorelagren. Baslinjen ska aldrig tvinga in verkliga lokala konfigurationsfiler.

### Databaskarantän och isolerade prov: konfiguration, migration, verifieringsskript

**Explicit funktionsprivilegium — `supabase/migrations/20260905130000_demo_bootstrap.sql:34–35`:**

```sql
revoke execute on function public.bootstrap_demo_profile(text) from public, anon;
grant execute on function public.bootstrap_demo_profile(text) to authenticated;
```

Detta är syntaxankaret, inte säker målsättning: dagens `authenticated`-grant släpper in anonyma Auth-sessioner. En ny framåtriktad migration måste avlägsna den installerade farliga vägen och hantera direkta rättigheter enligt researchens karantänkontrakt. Att radera den gamla migrationsfilen eller enbart ändra `enable_anonymous_sign_ins` bevisar inte att gammal åtkomst upphört.

`supabase/config.toml:5,10,150–171` ger befintligt format för projektidentitet, port och Auth. Isolerat baslinjeåterspel och skyddat karantänprov måste ha kontrollerade skilda mål/livscykler; ett namn eller en checkbox är inte tillräcklig målvalidering. Fullständig kontolivscykel och skolmandat väntar till fas 2–3.

**Assertioner mot omläst verksamhetsresultat — `work/supabase/verify-cohorts.mjs:27–34`:**

```javascript
await assert.rejects(()=>copyCohortInDatabase(source.id,2027),/redan/);
await assert.rejects(()=>copyCohortInDatabase(source.id,2026),/efter/);
const b={unitId:unit.id,className:'SA27A',startYear:2027,timplanId:copiedTP.id,columnId:'ar1'};
await assert.rejects(()=>saveClassTimplan(b),/fastställd/);
await checked(db.from('timplans').update({status:'faststalld',decided_on:'2026-09-08'}).eq('id',copiedTP.id));
await saveClassTimplan(b);
assert.deepEqual((await loadClassTimplans(unit.id))[0],b);
await assert.rejects(()=>saveClassTimplan({...b,columnId:'ak8'}),/årskurs/);
```

**Fel som stoppar och städning av skapade ID:n — samma fil, rader 8 och 45–49:**

```javascript
const checked=async query=>{const {data,error}=await query;if(error)throw new Error(error.message);return data;};
// I finally efter att endast egna fixture-ID:n lagts i unitIds:
for(const id of unitIds){
  await checked(db.from('class_timplans').delete().eq('unit_id',id));
  await checked(db.from('school_units').delete().eq('id',id));
}
```

Använd dessa assertioner/avgränsade fixture-ID:n efter en ny kontroll som avvisar oavsiktligt mål **innan** klient, Auth, migrering, seedning eller städning anropas. `verify-cohorts:4–9` importerar idag appklienten och loggar in via demo; det startmönstret ska inte kopieras till karantänproven. `verify-school-import:15–16` prövar rollback och `:23–31` bevarat/lokalt rektorsval; det är verksamhetsprov, inte full mandatmatris.

`verify.mjs` börjar med `loadOrganisation` och kan ändra/seed:a den vanliga demohuvudmannen; den är ingen ofarlig läskontroll. `reset.mjs` ska inte bli ett rutinmässigt baslinjekommando. Återspel av den gamla appversionen görs bara mot särskilt disponibelt lokalt mål enligt research; det är inte fasens vanliga provvy.

### Kompletterande nya researchmål

`web/scripts/run-mode.mjs` kopierar underprocessmönstret ovan, men tillför researchens explicita byggmiljö. `work/pilot/verify-baseline-db.mjs` återanvänder verksamhetsassertionerna ovan efter `verify-target`; `store-isolation.test.mjs` återanvänder Node-testimports men måste prova riktiga laddare genom kontrollerad transport. `prepare-local`, `verify-baseline` och SQL-/Playwright-filerna har ingen komplett lokal analog: använd RESEARCH:s respektive miljö-, SQL- och browserkontrakt. Modellassertionerna ger verksamhetsfallen, inte en färdig browserharness. `docs/pilot/baseline.md` återanvänder de äldre flödesstegen men ska fylla på nya revisions-/miljöbundna resultat; `connection-profile.md` följer RESEARCH:s status per fält. Låsfilen uppdateras genom npm för det avgränsade testberoendet.

## Shared Patterns

- **Modell → datalager:** återanvänd rena verksamhetsregler och typade tabellöversättningar. Ingen verklig Auth-/mandatvakt finns att kopiera; håll skyddade vägar stängda i fas 1.
- **Fel → begriplig status:** `planning-store.ts:53–55` kastar operationsfel; `organisation-workspace.tsx:365–368` fångar modellfel före ändring. Visa inte hemligheter och kalla inte minnesändring databaslagring.
- **Skolkontext → gemensam session:** samma relationsbundna underlag måste användas av elever, klassförslag och planering; skolbyte ska inte remontera det. UI-SPEC styr text/fokus/mått.
- **Bevis → rätt lager:** Node provar modeller; isolerade SQL/API-prov provar installerat skydd; browser provar beteende och trafik. Ett lager ersätter inte de andra.

### Unsafe Patterns — får inte kopieras som lösning

- `supabase.ts:28–38`: återanvändning av godtycklig kvarvarande session, anonym inloggning och självutdelad demohuvudmannaprofil.
- `organisation-store.ts:263–271`: seedning vid tomt läsresultat och felstädning av huvudmannens samtliga skolor/uppdrag. Tomt, nekat och misslyckat är skilda tillstånd.
- `planning-store.ts:94–100,247–253`: dataskapande från normal laddning. Klientprov ska använda explicit lokal fixtur; skyddad väg ska inte börja om som demo vid fel.
- `organisation-workspace.tsx:361–420`: parallella autosparningar med ovillkorlig omläsning. Detta är ett känt riskområde att reproducera/redovisa i baslinjen, inget godkänt mönster för ny lagring. Vanliga modelltester kan passera trots tappad ändring.
- `page.tsx:374–376`: byte av komponentnyckel återställer exempeländringar. Passar inte tvåskolekontraktets bevarade öppna session.
- `createAdminState:377` och `deriveClasses:295–313`: aktiv skola för alla elever och global gruppering på klassnamn. Behåll skolgräns i provunderlaget.
- Anonymt Auth-konto i `authenticated` är fortfarande anonymt. Rollen i UI, `current_app_role()` och en lyckad bootstrap visar inte ett verifierat personligt skolmandat.

## No Analog Found

| File/contract | Role | Data Flow | Reason |
|---|---|---|---|
| `work/pilot/verify-target.mjs`, `prepare-local.mjs` | utility | transform / file-I/O | Ingen mål-/manifestvalidering eller isolerad målfabrik före biverkan finns. |
| Lägesavgränsning i nytt runtime-kontrakt | utility | transform | Endast närvarokontroll av URL/nyckel finns; inga säkra standard-/fellägen eller prövad byggisolering. |
| `supabase/tests/phase1_isolation.test.sql` och negativ API-täckning | test | request-response | Inga pgTAP-prov eller komplett negativ privilegie-/Storage-matris finns. |
| `web/playwright.config.ts`, `web/e2e/phase1-{baseline,isolation,save-order}.spec.ts` | config / test | event-driven | Browserramverk, deterministisk server och svarordningsharness saknas. Research ger skelett. |
| `work/pilot/verify-baseline.mjs` | utility | batch | Befintliga skript gäller aktuell arbetsyta; inget revisionsbundet återställningsprov finns. |
| `docs/pilot/connection-profile.md` | config | file-I/O | Ingen komplett bekräftat/syntetiskt/förslag/öppet-profil finns. Innehåll från CONTEXT och RESEARCH; ingen ny appvy. |

Ingen ytterligare bred sökning behövs för att fylla dessa luckor. Planera dem som nya kontrakt med prövbara krav och använd `01-RESEARCH.md`; låt inte frånvaro av en analog utvidga fasen till riktig kontohantering eller kommunintegration.

## Metadata

**Analog search scope:** `web/lib/`, `web/app/`, `web/scripts/`, `web/package.json`, `web/vite.config.ts`, `supabase/config.toml`, två riktade migrationer, `work/supabase/`, rootens/webbappens ignorefiler och befintlig dokumentation.
**Strong reusable analog families:** fem — modellfabriker, React-arbetsyta, Node-modelltester, telefonstart/proxy, kull-/importprov. Säkerhetskritiska undantag har granskats separat och markerats ovan.
**Project conventions:** `AGENTS.md` läst; ingen root `CLAUDE.md` eller `.claude/skills/`/`.agents/skills/` hittades.
**Evidence:** riktad statisk kodläsning 2026-09-11. Inga befintliga miljöfiler lästes, inga skrivande databasskript kördes och inga nya passerade prov påstås.
