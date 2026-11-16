// SM-DIAGNOS: faktiskt användarbeteende mot uttryckligt simulerade rutter, syntetiska uppgifter.
import { test, expect, type Page } from './schema-test';
import proposal from './fixtures/schema-forslag.json' with { type: 'json' };
import folj from './fixtures/schema-folj.json' with { type: 'json' };
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag } from '../lib/schema-contract.ts';
import type { SchemaDiagnosFynd } from '../lib/schema-diagnos.ts';
const URL='/e2e/fixtures/schema-preview.html', headers={'X-Context-Epoch':'1'};
const teacher=proposal.resurser.larare[0];
const findings:SchemaDiagnosFynd[]=[{code:'too_little_time',message:`${teacher.name} har 900 min undervisning och aktiviteter men bara 600 min möjlig tid när spärrar och marginaler räknas in.`,
  proof:true,lessons:[folj.lesson],resources:[{typ:'larare',id:teacher.ref,label:teacher.name}],action:{target:'villkor',label:'Se över tillgänglig tid och villkor',resourceId:teacher.ref,resource:{typ:'larare',id:teacher.ref,label:teacher.name}}}];
const statistics={lessons:[{lesson:folj.lesson,title:'Matematik',attempts:120,moves:8,backtracks:24,ejections:3}],bottlenecks:[{code:'resource_busy',resource:{typ:'larare' as const,id:teacher.ref,label:teacher.name},count:16}],iterations:200};
async function setup(page:Page,diagnosis:unknown={version:SCHEMA_CONTRACT_VERSION,findings},status=200){
  let solves=0;
  const bodies:Record<string,unknown>[]=[];
  await page.route('**/api/schema/diagnos',r=>{bodies.push(r.request().postDataJSON());return r.fulfill({headers,status,json:diagnosis});});
  await page.route('**/api/schema/forslag',r=>{solves++;return r.fulfill({headers,json:{...proposal,contractVersion:SCHEMA_CONTRACT_VERSION,villkor:r.request().postDataJSON().villkor,statistics} as SchemaForslag});});
  await page.route('**/api/schema/folj',r=>r.fulfill({headers,json:{...folj.utanElever,contractVersion:SCHEMA_CONTRACT_VERSION}}));
  await page.route('**/api/schema/lagen',r=>r.fulfill({headers,json:{...folj.alla,contractVersion:SCHEMA_CONTRACT_VERSION}}));
  await page.goto(URL);
  return {bodies,solves:()=>solves};
}

test('överbokad lärare visas före beräkning med åtgärdslänk; motorn kör först efter uttryckligt fortsätt',async({page},info)=>{
  const calls=await setup(page);
  await page.getByRole('button',{name:'Ta fram schemaförslag',exact:true}).click();
  const panel=page.getByRole('region',{name:'Före beräkning',exact:true});
  await expect(panel).toBeVisible();await expect(panel.getByText(findings[0].message)).toBeVisible();
  await expect(panel.getByText('Går inte ihop',{exact:true})).toBeVisible();
  expect(calls.solves()).toBe(0);expect(calls.bodies).toHaveLength(1);
  await panel.getByRole('button',{name:'Se över tillgänglig tid och villkor',exact:true}).click();
  await expect(page.locator('details.schema-villkor')).toHaveAttribute('open','');
  expect(calls.solves()).toBe(0);
  await page.screenshot({path:info.outputPath('diagnos-fore.png'),fullPage:true});
  await panel.getByRole('button',{name:'Ta fram förslag ändå',exact:true}).click();
  await expect(page.getByText('Förslag · Alla pass lagda',{exact:true})).toBeVisible();
  expect(calls.solves()).toBe(1);expect(calls.bodies).toHaveLength(1);
});

test('hopfälld sökstatistik öppnas med tangentbord och leder till Följ passet samt lärarens villkorsrad',async({page},info)=>{
  await setup(page,{version:SCHEMA_CONTRACT_VERSION,findings:[]});
  await page.getByRole('button',{name:'Ta fram schemaförslag',exact:true}).click();
  const panel=page.getByRole('region',{name:'Svårast att lägga',exact:true});
  const disclosure=page.locator('details').filter({has:page.locator('summary',{hasText:'Svårast att lägga'})}),summary=disclosure.locator('summary');
  await expect(summary).toBeVisible();await expect(panel).toBeHidden();await summary.focus();await page.keyboard.press('Enter');
  await expect(panel).toBeVisible();await expect(panel.getByText('Matematik',{exact:true})).toBeVisible();
  await expect(panel.getByText('120 starttidsförsök · 8 flyttförsök · 24 nekanden eller återgångar · 3 undanträngningar')).toBeVisible();
  await expect(panel.getByText(`Resursen var upptagen: ${teacher.name} · 16 sökförsök`)).toBeVisible();
  await panel.getByRole('button',{name:'Följ passet',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Följ passet: Matematik, Klass 1',exact:true})).toBeVisible();
  const source = proposal.lessons.find(l => l.id === folj.lesson)!;
  const movePanel = page.getByRole('form', { name: 'Flytta pass' });
  await expect(movePanel.getByRole('combobox', { name: 'Dag', exact: true })).toHaveValue(String(source.day));
  await expect(movePanel.getByRole('combobox', { name: 'Starttid', exact: true })).toHaveValue(String(source.startMin));
  await panel.getByRole('button',{name:'Visa villkoren',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Villkor i tabell',exact:true})).toBeVisible();
  await expect(page.getByRole('tab',{name:'Lärare',exact:true})).toHaveAttribute('aria-selected','true');
  await page.addStyleTag({content:'html { font-size: 200%; }'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await summary.focus();await page.keyboard.press('Space');await expect(panel).toBeHidden();await expect(summary).toBeFocused();
  await page.screenshot({path:info.outputPath('diagnos-statistik-hopfalld-200.png'),fullPage:false});
  await page.keyboard.press('Enter');await expect(panel).toBeVisible();await expect(summary).toBeFocused();
  await panel.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('diagnos-statistik-200.png'),fullPage:false});
});

test('nekad fördiagnos visar begripligt fel och kör aldrig förslaget',async({page})=>{
  const calls=await setup(page,{code:'forbidden',correlationId:'syntetiskt-prov'},403);
  await page.getByRole('button',{name:'Ta fram schemaförslag',exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible();expect(calls.solves()).toBe(0);
  await expect(page.getByText('Förslag · Alla pass lagda',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Ta fram schemaförslag',exact:true})).toBeEnabled();
});

test('gammal diagnostikversion godtas inte som fyndfri beräkning',async({page})=>{
  const calls=await setup(page,{version:SCHEMA_CONTRACT_VERSION-1,findings:[]});
  await page.getByRole('button',{name:'Ta fram schemaförslag',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Schemamotorns svar kunde inte kontrolleras. Läs om sidan och försök igen.');
  expect(calls.solves()).toBe(0);
});
