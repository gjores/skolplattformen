// Användarfynd efter våg8: verkliga komponenter med uttryckligt simulerade API-svar. Databas, mandat och motor provas separat.
import { test, expect, type Page } from './schema-test';
import raw from './schema-fixture';
import checked from './fixtures/schema-kontroll.json' with { type: 'json' };
import following from './fixtures/schema-folj.json' with { type: 'json' };
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaKontrollRequest, type SchemaRegel, type SchemaVillkor } from '../lib/schema-contract.ts';
import { parseSchemaDatumAndringar } from '../lib/schema-datum.ts';
import { schemaVillkorsandring, schemaVillkorsforslagInputFingerprint, type SchemaVillkorsforslagRequest } from '../lib/schema-villkorsforslag.ts';
const proposal=raw as unknown as SchemaForslag,headers={'X-Context-Epoch':'1'},URL='/e2e/fixtures/schema-preview.html';
function control(input:SchemaKontrollRequest){return {...checked.clash,contractVersion:SCHEMA_CONTRACT_VERSION,grundFingerprint:input.grundFingerprint,fingerprint:proposal.fingerprint,violations:[],total:0,
  metrics:{...proposal.metrics,placed:input.placements.length,unplaced:proposal.lessons.length-input.placements.length},teachings:proposal.teachings,trims:proposal.trims,rooms:Object.fromEntries(input.placements.filter(p=>p.room).map(p=>[p.lesson,p.room!]))};}
async function setup(page:Page,egna:SchemaRegel[]=[]){
  const controls:SchemaKontrollRequest[]=[],solves:{villkor:SchemaVillkor}[]=[];
  await page.addInitScript(({unitId,villkor})=>localStorage.setItem(`schema-villkor:${unitId}`,JSON.stringify(villkor)),{unitId:proposal.unitId,villkor:{...proposal.villkor,egna}});
  await page.route('**/api/schema/diagnos',r=>r.fulfill({headers,json:{version:SCHEMA_CONTRACT_VERSION,findings:[]}}));
  await page.route('**/api/schema/forslag',r=>{const input=r.request().postDataJSON();solves.push(input);return r.fulfill({headers,json:{...proposal,villkor:input.villkor}});});
  await page.route('**/api/schema/kontroll',r=>{const input=r.request().postDataJSON();controls.push(input);return r.fulfill({headers,json:control(input)});});
  await page.route('**/api/schema/folj',r=>r.fulfill({headers,json:following.utanElever}));
  await page.route('**/api/schema/lagen',r=>r.fulfill({headers,json:following.alla}));
  await page.goto(URL);await page.getByRole('button',{name:'Ta fram schemaförslag',exact:true}).click();
  await expect(page.getByText('Tid · Alla pass har tid',{exact:true})).toBeVisible();return {controls,solves};
}
test('saknat underlag visar ett fokuserat hinder med vägar till tjänstefördelning och timplan',async({page},info)=>{
  await page.route('**/api/schema/diagnos',r=>r.fulfill({headers,json:{version:SCHEMA_CONTRACT_VERSION,findings:[]}}));
  await page.route('**/api/schema/forslag',r=>r.fulfill({headers,json:{...proposal,villkor:r.request().postDataJSON().villkor,basis:null,status:'input_missing',lessons:[],teachings:[],fordelning:[],links:[],statistics:{lessons:[],bottlenecks:[],iterations:0},
    metrics:{...proposal.metrics,lessons:0,placed:0,unplaced:0},trims:[]}}));
  await page.goto(URL);await page.getByRole('button',{name:'Ta fram schemaförslag',exact:true}).click();
  const heading=page.getByRole('heading',{name:'Schemat kan inte läggas ännu',exact:true});await expect(heading).toBeFocused();
  const alert=page.getByRole('alert').filter({has:heading});await expect(alert).toContainText('ingen tjänstefördelning');
  await expect(alert.getByRole('button',{name:'Öppna tjänstefördelningen'})).toBeVisible();await expect(alert.getByRole('button',{name:'Öppna timplanerna'})).toBeVisible();
  await expect(page.getByText('Tiden följer timplanen',{exact:true})).toHaveCount(0);await page.screenshot({path:info.outputPath('underlag-saknas.png'),fullPage:false});
});
test('olika undervisningar får egna antal; Ångra är synlig också i villkorstabellen',async({page})=>{
  await setup(page);await page.getByText('Antal lektioner per undervisning',{exact:true}).click();
  const panel=page.getByRole('region',{name:'Fördela undervisningen på lektioner'}),selects=panel.getByRole('combobox');
  await selects.nth(0).selectOption('2');await selects.nth(1).selectOption('3');
  await page.getByRole('button',{name:'Villkor i tabell',exact:true}).click();
  const undo=page.getByRole('button',{name:'Ångra senaste villkor',exact:true});
  await page.locator('.villkorstabell').scrollIntoViewIfNeeded();await expect(undo).toBeInViewport();await undo.click();
  await expect(selects.nth(0)).toHaveValue('2');await expect(selects.nth(1)).toHaveValue('');
  await page.getByRole('button',{name:'Gör om',exact:true}).click();await expect(selects.nth(1)).toHaveValue('3');
});
test('Följ passet går att öppna från viloytan och byte finns i följpanelen',async({page})=>{
  await setup(page);const own=page.locator('[data-lesson="pass-7"]').first();await own.click();await page.getByRole('form',{name:'Flytta pass'}).getByRole('button',{name:'Lägg på viloytan',exact:true}).click();
  const rest=page.locator('.schema-rest');await rest.getByRole('button',{name:/^Följ passet /}).click();await expect(page.getByRole('heading',{name:/Följ passet:/})).toBeVisible();await expect(page.getByText('Villkor för passet',{exact:true})).toBeVisible();
  await page.locator('.folj').getByRole('button',{name:'Stäng',exact:true}).click();
  await page.locator('.schema-lesson [data-lesson]').first().click();await page.getByRole('button',{name:'Följ passet',exact:true}).first().click();
  await expect(page.locator('.folj').getByRole('button',{name:'Byt med ett annat pass…',exact:true})).toBeVisible();
});
test('Varför inte har Lägg här som går att nå med tangentbord och kontrollerar vald tid',async({page},info)=>{
  const {controls}=await setup(page);await page.locator('[data-lesson="pass-7"]').first().dblclick();
  const index=following.alla.positions.findIndex(p=>p.state==='onskemal'||p.state==='brott'),position=following.alla.positions[index];expect(index).toBeGreaterThanOrEqual(0);
  const slot=page.locator('.folj-start').nth(index);await slot.focus();
  const why=page.getByRole('dialog',{name:/^Varför inte/});await expect(why).toBeVisible();await page.keyboard.press('Tab');await expect(why.getByRole('button',{name:'Lägg här',exact:true})).toBeFocused();
  await page.screenshot({path:info.outputPath('varfor-inte-lagg-har.png'),fullPage:false});await why.getByRole('button',{name:'Lägg här',exact:true}).click();
  await expect.poll(()=>controls.at(-1)?.placements.find(p=>p.lesson==='pass-7')?.startMin).toBe(position.startMin);expect(controls.at(-1)?.placements.find(p=>p.lesson==='pass-7')?.day).toBe(position.day);
});
test('utebliven placering ger ett granskat villkorsalternativ som godkänns och ångras tillsammans',async({page},info)=>{
  const own=proposal.lessons.find(l=>l.id==='pass-7')!,rule:SchemaRegel={slag:'amne',ref:own.title,typ:'sparrad',days:[0,1,2,3,4],startMin:480,endMin:1020};
  const {controls}=await setup(page,[rule]);
  await page.route('**/api/schema/placering',r=>{const input=r.request().postDataJSON();return r.fulfill({headers,json:{contractVersion:SCHEMA_CONTRACT_VERSION,grundFingerprint:input.grundFingerprint,depth:input.depth,timedOut:false,elapsedMs:1,suggestions:[]}});});
  await page.route('**/api/schema/villkorsforslag',r=>{
    const input=r.request().postDataJSON() as SchemaVillkorsforslagRequest,change=schemaVillkorsandring(input.villkor,0,own.title)!;
    const to={lesson:own.id,day:own.day!,startMin:own.startMin!,room:own.roomId},placements=[...input.placements,to],metrics={studentGapMin:0,teacherGapMin:0,cost:0};
    return r.fulfill({headers,json:{contractVersion:SCHEMA_CONTRACT_VERSION,grundFingerprint:input.grundFingerprint,fingerprint:'a'.repeat(28),inputFingerprint:schemaVillkorsforslagInputFingerprint(input),lesson:input.lesson,depth:input.depth,timedOut:false,elapsedMs:1,testedCandidates:1,newGrundCandidates:0,explanation:'Passet kan placeras om den här spärren tas bort.',
      suggestions:[{id:'regel-1',change,placement:{placements,changes:[{lesson:own.id,from:null,to}],metricsBefore:metrics,metricsAfter:metrics,cost:0},kontroll:{...control({...input,placements}),fingerprint:'b'.repeat(28)}}]}});
  });
  await page.locator('[data-lesson="pass-7"]').first().click();await page.getByRole('form',{name:'Flytta pass'}).getByRole('button',{name:'Lägg på viloytan',exact:true}).click();
  await page.locator('.schema-rest').getByRole('button',{name:/^Föreslå placering för /}).click();
  const suggestions=page.getByRole('region',{name:'Förslag på ändrade villkor'});await expect(suggestions).toContainText('Den här regeln tas bort');
  await expect(page.locator('.schema-rest')).toContainText(own.title);await page.screenshot({path:info.outputPath('villkorsforslag.png'),fullPage:false});
  await suggestions.getByRole('button',{name:'Godkänn villkorsändring och placering 1',exact:true}).click();
  await expect(page.locator('.schema-rest')).toContainText('Inga pass på viloytan');expect(controls.at(-1)?.villkor.egna).toEqual([]);
  await page.getByRole('button',{name:'Ångra senaste villkor',exact:true}).click();await expect(page.locator('.schema-rest')).toContainText(own.title);expect(controls.at(-1)?.villkor.egna).toEqual([rule]);
});
test('datumflytt ger ett undantag och lämnar grundschema och andra tillfällen orörda; ångra återställer',async({page,schemaDraftServer},info)=>{
  await setup(page);const requests:SchemaKontrollRequest[]=[];
  await page.route('**/api/schema/datum',r=>{const input=r.request().postDataJSON();requests.push(input);const overrides=parseSchemaDatumAndringar(input.datedOverrides);return r.fulfill({headers,json:{contractVersion:SCHEMA_CONTRACT_VERSION,grundFingerprint:input.grundFingerprint,fingerprint:proposal.fingerprint,datedOverrides:overrides,checkedDates:[...new Set([...input.dates,...overrides.flatMap(a=>[a.originalDate,a.date])])],violations:[],total:0,timeChanges:[]}});});
  const val=page.getByRole('region',{name:'Grundschema eller faktiska tillfällen'});await val.getByRole('button',{name:'Datumintervall',exact:true}).click();await val.getByLabel('Från',{exact:true}).fill('2026-11-06');await val.getByLabel('Till',{exact:true}).fill('2026-11-16');
  const first=page.locator('[data-date="2026-11-06"] [data-occurrence]').first(),key=await first.getAttribute('data-occurrence'),lesson=await first.getAttribute('data-lesson');expect(key).toBeTruthy();await first.click();
  const dialog=page.getByRole('dialog',{name:'Ändra ett tillfälle'});await expect(dialog).toContainText('Grundschemat behåller sin tid');await dialog.getByLabel('Datum',{exact:true}).fill('2026-11-13');await dialog.getByLabel('Starttid',{exact:true}).fill('15:00');await dialog.getByRole('button',{name:'Spara ändringen för detta tillfälle',exact:true}).click();
  await expect(dialog).toHaveCount(0);await expect(page.locator(`[data-date="2026-11-06"] [data-occurrence="${key}"]`)).toHaveCount(0);await expect(page.locator(`[data-date="2026-11-13"] [data-occurrence="${key}"]`)).toBeVisible();
  await expect(page.locator(`[data-date="2026-11-13"] [data-lesson="${lesson}"]`)).toHaveCount(2);
  await expect.poll(()=>schemaDraftServer.saves.at(-1)?.datedOverrides.length).toBe(1);const saved=schemaDraftServer.saves.at(-1)!;expect(saved.placements.find(p=>p.lesson===lesson)).toMatchObject({day:proposal.lessons.find(l=>l.id===lesson)!.day,startMin:proposal.lessons.find(l=>l.id===lesson)!.startMin});expect(requests.length).toBeGreaterThan(0);
  await page.screenshot({path:info.outputPath('datumundantag.png'),fullPage:false});await page.getByRole('button',{name:'Ångra senaste datumändring',exact:true}).click();await expect(page.locator(`[data-date="2026-11-06"] [data-occurrence="${key}"]`)).toBeVisible();await expect(page.locator(`[data-date="2026-11-13"] [data-lesson="${lesson}"]`)).toHaveCount(1);
});

test('ny fördiagnos visas och får fokus även när en gammal placeringssökning står öppen', async ({ page }) => {
  await setup(page);
  await page.route('**/api/schema/placering', r => { const input = r.request().postDataJSON(); return r.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: input.grundFingerprint, depth: input.depth, timedOut: false, elapsedMs: 1, suggestions: [] } }); });
  await page.locator('[data-lesson="pass-7"]').first().click();
  await page.getByRole('form', { name: 'Flytta pass' }).getByRole('button', { name: 'Lägg här och flytta det som krockar', exact: true }).click();
  await expect(page.locator('[data-schema-placement-panel]')).toBeVisible();
  await page.route('**/api/schema/diagnos', r => r.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [{ code: 'capacity', message: 'Skolans valda undervisningstid ryms inte inom dagarnas tidsram.', proof: true, lessons: [], resources: [], action: { target: 'villkor', label: 'Se över villkoren' } }] } }));
  await page.getByRole('button', { name: 'Beräkning', exact: true }).click();
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.locator('[data-schema-placement-panel]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Före beräkning', exact: true })).toBeFocused();
  await expect(page.getByRole('region', { name: 'Före beräkning', exact: true })).toContainText('Skolans valda undervisningstid');
  await expect(page.getByRole('button', { name: 'Ta fram förslag ändå', exact: true })).toBeVisible();
});

for (const viaActivity of [false, true]) test(`datumundantag kräver bekräftelse även efter tidigare diagnos (${viaActivity ? 'aktivitetsdialog' : 'fortsätt beräkningen'})`, async ({ page }) => {
  const { solves } = await setup(page);
  const finding = { code: 'capacity', message: 'Tidigare kontrollpunkt som behöver granskas.', proof: false, lessons: [], resources: [], action: { target: 'villkor', label: 'Se över villkoren' } };
  await page.route('**/api/schema/diagnos', r => r.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [finding] } }));
  await page.getByRole('button', { name: 'Beräkning', exact: true }).click();
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Före beräkning', exact: true })).toBeVisible();
  await page.route('**/api/schema/datum', r => { const input = r.request().postDataJSON(), datedOverrides = parseSchemaDatumAndringar(input.datedOverrides); return r.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: input.grundFingerprint, fingerprint: proposal.fingerprint, datedOverrides, checkedDates: [...new Set([...input.dates, ...datedOverrides.flatMap(a => [a.originalDate, a.date])])], violations: [], total: 0, timeChanges: [] } }); });
  const val = page.getByRole('region', { name: 'Grundschema eller faktiska tillfällen' });
  await val.getByRole('button', { name: 'Datumintervall', exact: true }).click();await val.getByLabel('Från', { exact: true }).fill('2026-11-06');await val.getByLabel('Till', { exact: true }).fill('2026-11-06');
  await page.locator('[data-date="2026-11-06"] [data-occurrence]').first().click();
  const dateDialog = page.getByRole('dialog', { name: 'Ändra ett tillfälle' });await dateDialog.getByLabel('Starttid', { exact: true }).fill('15:00');await dateDialog.getByRole('button', { name: 'Spara ändringen för detta tillfälle', exact: true }).click();await expect(dateDialog).toHaveCount(0);
  if (viaActivity) {
    await page.locator('details.schema-villkor > summary').click();await page.locator('details.schema-villkor').getByRole('combobox', { name: 'Längsta pass', exact: true }).selectOption('100');
    await page.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();const activity = page.getByRole('dialog', { name: 'Ny aktivitet', exact: true });
    await activity.getByLabel('Namn', { exact: true }).fill('Bevarad mentorstid');await activity.getByLabel('Klass 1', { exact: true }).check();await activity.getByRole('button', { name: 'Lägg till aktivitet', exact: true }).click();
    await expect(activity.getByText(finding.message, { exact: true })).toHaveCount(0);
    await activity.getByRole('button', { name: 'Ta fram nytt förslag och behåll formuläret', exact: true }).click();
  } else await page.getByRole('button', { name: 'Ta fram förslag ändå', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Räkna om hela grundschemat?' });await expect(confirmation).toBeVisible();await confirmation.getByRole('button', { name: 'Behåll nuvarande schema', exact: true }).click();
  expect(solves).toHaveLength(1);
  if (viaActivity) { const activity = page.getByRole('dialog', { name: 'Ny aktivitet', exact: true });await expect(activity.getByLabel('Namn', { exact: true })).toHaveValue('Bevarad mentorstid');await activity.getByRole('button', { name: 'Avbryt', exact: true }).click(); }
  await expect(page.getByRole('heading', { name: '1 ändrat tillfälle', exact: true })).toBeVisible();
});
