// Synthetic browser transport, no actual SQL/OIDC or municipal integration.
// Writes below are produced by real UI interactions; controls change source data or delay already-produced replies only.
import {test,expect,type Page,type Locator} from '@playwright/test';
const URL='/e2e/fixtures/tjanst-preview.html';
const id=(n:number)=>`51a50000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const ws=(p:Page)=>p.locator('.tjanst');
const dialog=(p:Page)=>p.getByRole('dialog');
const commands=(p:Page)=>p.evaluate(()=>window.__tjanst.commands);
async function open(p:Page,query=''){await p.goto(URL+query);await expect(ws(p).getByText('Hämtar tjänstefördelningen…')).toHaveCount(0);await expect(ws(p).getByRole('heading',{name:'Tjänstefördelning',exact:true})).toBeVisible();}
async function math(p:Page){await ws(p).getByRole('region',{name:'Matris',exact:true}).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();await expect(dialog(p).getByText('Ingen lärare vald',{exact:true})).toBeVisible();}
async function choose(p:Page,name='Cecilia Dahl'){await dialog(p).getByRole('button',{name:`Välj ${name}`,exact:true}).click();}
async function save(p:Page){await dialog(p).getByRole('button',{name:'Spara tjänsteraden',exact:true}).click();await expect(dialog(p)).toHaveCount(0);}
async function bulk(p:Page){await ws(p).getByRole('button',{name:'Massregistrera',exact:true}).click();await expect(dialog(p).getByLabel('Lärare för markerade behov')).toBeVisible();}
async function assignBulk(p:Page,person=id(104)){await dialog(p).getByLabel('Lärare för markerade behov').selectOption(person);const apply=dialog(p).getByRole('button',{name:'Använd valet på markerade behov',exact:true});await expect(apply).toBeEnabled();await apply.click();}
async function previewSave(p:Page){await dialog(p).getByRole('button',{name:'Förhandsvisa',exact:true}).click();await expect(dialog(p).getByRole('heading',{name:'Förhandsvisning',exact:true})).toBeVisible();await dialog(p).getByRole('button',{name:'Spara ändringarna',exact:true}).click();await expect(dialog(p)).toHaveCount(0);}
async function clickNeeds(group:Locator,count:number){for(let n=0;n<count;n++)await group.getByRole('checkbox').nth(n).check();}

test.describe('sammanhållen planering på dator',()=>{
 test.beforeEach(({},info)=>test.skip(!info.project.name.startsWith('desktop'),'Telefonen är läsläge enligt D-15.'));
 test('tomt nytt år visar behov utan lagrad version eller implicit lärarval',async({page},info)=>{
  await open(page,'?ar=2027');
  const before=await page.evaluate(()=>window.__tjanst.snapshotOf()) as any;expect(before.versions).toEqual([]);expect(before.draft).toBeNull();
  await expect(ws(page).getByRole('button',{name:/Skapa utkast|Ändra i ny version/})).toHaveCount(0);
  await ws(page).getByRole('region',{name:'Matris',exact:true}).getByRole('button',{name:'Vakant, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  await expect(dialog(page).getByText('Ingen lärare vald',{exact:true})).toBeVisible();await expect(dialog(page).getByLabel('Lärartid HT (timmar)')).toHaveValue('50');
  await expect(dialog(page).getByText(/Planerad för samma klass/).first()).toBeVisible();
  await dialog(page).getByLabel('Sök lärare').fill('Anna');await dialog(page).getByLabel('Sök lärare').press('Enter');
  await expect(dialog(page).getByText('Ingen lärare vald',{exact:true})).toBeVisible();expect(await commands(page)).toEqual([]);
  await expect(dialog(page).getByText('Behörighetsunderlag saknas').first()).toBeVisible();
  await page.screenshot({path:`/private/tmp/tjanst-year-${info.project.name}-suggestions.png`,fullPage:true});
  await dialog(page).getByRole('button',{name:'Välj förslaget: Anna Andersson',exact:true}).click();await save(page);
  const sent=(await commands(page))[0].body;expect(sent.action).toBe('save_row');expect(sent.schoolYear).toBe(2027);expect(sent.expectedRevision).toBe(0);expect(sent.payload.planningContext).toMatchObject({baseVersionId:null,choice:{kind:'suggestion',personId:id(101)}});
  const after=await page.evaluate(()=>window.__tjanst.snapshotOf()) as any;expect(after.versions).toHaveLength(1);expect(after.draft.rows).toHaveLength(1);expect(after.draft.rows[0].personId).toBe(id(101));
 });
 test('kolumnfokus väljer ingen lärare och manuellt val bevarar övriga rader',async({page})=>{
  await open(page);const before=await page.evaluate(()=>window.__tjanst.snapshotOf()) as any;await math(page);
  await dialog(page).getByLabel('Sök lärare').fill('David');await dialog(page).getByLabel('Sök lärare').press('Enter');await expect(dialog(page).getByText('Ingen lärare vald',{exact:true})).toBeVisible();
  await expect(dialog(page).getByText(/Gäller en del av läsåret/)).toBeVisible();await expect(dialog(page).getByText('2026-07-01 – 2027-01-31 · 50 %')).toBeVisible();
  await choose(page,'David Ek');await dialog(page).getByLabel('Lärartid HT (timmar)').fill('12');await save(page);
  const after=await page.evaluate(()=>window.__tjanst.snapshotOf()) as any;expect(after.draft.rows.slice(0,before.draft.rows.length)).toEqual(before.draft.rows);expect(after.draft.rows.at(-1)).toMatchObject({personId:id(104),teacherHt:720,teacherVt:3000});
  expect((await commands(page))[0].body.payload.planningContext.choice.kind).toBe('manual');
 });
 test('okänt behov blir inte noll eller dold förifyllnad',async({page})=>{
  await open(page,'?data=okand-tid');await math(page);await choose(page);await expect(dialog(page).getByLabel('Lärartid HT (timmar)')).toHaveValue('');await expect(dialog(page).getByLabel('Lärartid VT (timmar)')).toHaveValue('');
  await dialog(page).getByRole('button',{name:'Spara tjänsteraden'}).click();expect(await commands(page)).toEqual([]);await dialog(page).getByLabel('Lärartid HT (timmar)').fill('0');await dialog(page).getByLabel('Lärartid VT (timmar)').fill('5');await save(page);expect((await commands(page))[0].body.payload).toMatchObject({teacherHt:0,teacherVt:300});
 });
 test('förslagsfel skiljs från tomlista och manuellt sparande fungerar',async({page})=>{
  await open(page,'?forslag=otillgangliga');await math(page);await expect(dialog(page).getByRole('heading',{name:'Förslagen kunde inte hämtas'})).toBeVisible();
  await expect(dialog(page).getByText('Du kan fortfarande söka och välja en lärare manuellt.')).toBeVisible();await choose(page);await save(page);
  await open(page,'?data=ny-gr-klass&ar=2027');
  await ws(page).getByRole('region',{name:'Matris',exact:true}).getByRole('button',{name:'Vakant, Matematik, TE26A: ingen tid. Tilldela.'}).click();
  await expect(dialog(page).getByRole('heading',{name:'Inga tidigare planeringsförslag'})).toBeVisible();await expect(dialog(page).getByRole('button',{name:/Välj förslaget:/})).toHaveCount(0);
  // Same class display name as prior year is not identity; the new GR class/row has different stable IDs.
  await choose(page);await save(page);expect((await commands(page))[0].body.payload.sourceKey).toContain(id(299));
 });
 test('första ändring efter publicering skapar intern revision och historik står kvar',async({page})=>{
  await open(page,'?data=publicerad');const before=await page.evaluate(()=>window.__tjanst.snapshotOf()) as any;await math(page);await choose(page);await save(page);
  const after=await page.evaluate(()=>window.__tjanst.snapshotOf()) as any;expect(after.versions).toHaveLength(2);expect(after.versions.find((v:any)=>v.status==='draft').basedOnVersionId).toBe(id(601));expect(after.snapshots).toEqual(before.snapshots);
  expect((await commands(page)).map(c=>c.body.action)).toEqual(['save_row']);
  await ws(page).getByRole('button',{name:'Historik',exact:true}).click();await expect(ws(page).getByRole('button',{name:'Massregistrera',exact:true})).toHaveCount(0);
  await expect(ws(page).getByRole('region',{name:'Matris',exact:true}).getByRole('button',{name:/Tilldela\.|Ändra\./})).toHaveCount(0);await ws(page).getByRole('button',{name:'Tillbaka till planeringen'}).click();
  await expect(ws(page).getByRole('button',{name:'Massregistrera',exact:true})).toBeVisible();
 });
 for(const kind of ['core','person','evidence'] as const)test(`ändrad ${kind} kräver nytt aktivt val men bevarar tid och kommentar`,async({page})=>{
  await open(page);await math(page);
  if(kind==='evidence')await dialog(page).getByRole('button',{name:'Välj förslaget: Anna Andersson',exact:true}).click();else await choose(page,'Anna Andersson');
  await dialog(page).getByLabel('Lärartid HT (timmar)').fill('12');await dialog(page).getByLabel('Kommentar (valfri)').fill('Bevara denna inmatning');
  await page.evaluate(k=>window.__tjanst.bump(k),kind);await dialog(page).getByRole('button',{name:'Spara tjänsteraden'}).click();
  await expect(dialog(page).getByText('Underlaget har ändrats. Dina uppgifter finns kvar. Välj lärare på nytt.')).toBeVisible();
  await expect(dialog(page).getByLabel('Lärartid HT (timmar)')).toHaveValue('12');await expect(dialog(page).getByLabel('Kommentar (valfri)')).toHaveValue('Bevara denna inmatning');
  await expect(dialog(page).getByRole('button',{name:'Spara tjänsteraden',exact:true})).toBeDisabled();
  await expect(dialog(page).getByText('Vald lärare: Anna Andersson',{exact:true})).toBeVisible();
  await choose(page,'Anna Andersson');await save(page);const sent=await commands(page);expect(sent).toHaveLength(2);expect(sent[0].body.commandId).not.toBe(sent[1].body.commandId);
  const after=await page.evaluate(()=>window.__tjanst.snapshotOf()) as any;expect(after.revision).toBe(8);expect(after.draft.rows.at(-1).teacherHt).toBe(720);
 });
 test('administratör lägger till via snäv katalog och tom kolumn tas bort uttryckligt',async({page})=>{
  await open(page,'?roll=administrator');await ws(page).getByRole('button',{name:'Lägg till lärare i fördelningen',exact:true}).click();await choose(page,'David Ek');await dialog(page).getByRole('button',{name:'Lägg till läraren',exact:true}).click();await expect(dialog(page)).toHaveCount(0);
  expect(await page.evaluate(()=>window.__tjanst.reads.some(r=>r.path.endsWith('/personal/lasa')))).toBe(false);
  await ws(page).locator('.tjanst-empty-columns summary').click();await ws(page).locator('.tjanst-empty-columns > div').filter({hasText:'David Ek'}).getByRole('button',{name:'Ta bort tom lärarkolumn…'}).click();
  await expect(dialog(page)).toContainText('Personal');await dialog(page).getByRole('button',{name:'Ta bort kolumnen',exact:true}).click();await expect(dialog(page)).toHaveCount(0);
  expect((await commands(page)).map(c=>c.body.action)).toEqual(['add_teacher','remove_teacher']);
  await expect(ws(page).locator('.tjanst-empty-columns > div').filter({hasText:'Bertil Berg'})).toHaveCount(0);
 });
 for(const switchLabel of ['Byt skola','Byt läsår','Byt uppdrag'])test(`redan producerat row-svar över ${switchLabel} återför inte gammal rad`,async({page})=>{
  await open(page);await page.evaluate(()=>window.__tjanst.holdProduced('plan/forhandsvisa'));
  await ws(page).getByRole('region',{name:'Matris',exact:true}).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__tjanst.produced.length)).toBe(1);
  // The selector is outside the modal; the same external context event can happen while a dialog is open.
  await page.evaluate(label=>{const button=[...document.querySelectorAll('main > div > button')].find(b=>b.textContent===label);(button as HTMLButtonElement).click();},switchLabel);
  await page.evaluate(()=>window.__tjanst.releaseProduced());await expect(dialog(page)).toHaveCount(0);
  expect(await commands(page)).toEqual([]);await expect(ws(page).getByText('Vald lärare: Cecilia Dahl',{exact:true})).toHaveCount(0);
  const active=await page.evaluate(()=>window.__tjanst.activeScope);if(switchLabel==='Byt läsår')expect(active.schoolYear).toBe(2027);if(switchLabel==='Byt skola')expect(active.unitId).toBe(id(4));if(switchLabel==='Byt uppdrag')expect(active.epoch).toBe(2);
 });
 for(const route of ['plan/kommando','plan/status'])test(`producerat ${route}-kvitto över årsbyte ändrar inte nya årets vy`,async({page})=>{
  await open(page);await math(page);await choose(page);await page.evaluate(r=>{if(r==='plan/status')window.__tjanst.failNext('plan/kommando','lost');window.__tjanst.holdProduced(r);},route);
  await dialog(page).getByRole('button',{name:'Spara tjänsteraden'}).click();await expect.poll(()=>page.evaluate(()=>window.__tjanst.produced.length)).toBe(1);
  await page.evaluate(()=>{const b=[...document.querySelectorAll('main > div > button')].find(b=>b.textContent==='Byt läsår') as HTMLButtonElement;b.click();});await expect(ws(page).locator('.tjanst-subline')).toContainText('Läsåret 27/28');
  await page.evaluate(()=>window.__tjanst.releaseProduced());await expect(dialog(page)).toHaveCount(0);await expect(ws(page).getByText(/Tjänsteraden är sparad/)).toHaveCount(0);
  expect(await commands(page)).toHaveLength(1);const before=await page.evaluate(()=>window.__tjanst.snapshotOf('51a50000-0000-4000-8000-000000000003',2026)) as any,after=await page.evaluate(()=>window.__tjanst.snapshotOf()) as any;
  expect(before.revision).toBe(8);expect(after.schoolYear).toBe(2027);expect(after.revision).toBe(0);expect(after.draft).toBeNull();
 });
 for(const stage of ['command','journal'] as const)for(const change of ['scope','phone'] as const)test(`byte av ${change} under ${stage}-hash skickar inget för gammal arbetsyta`,async({page})=>{
  await open(page);await math(page);await choose(page);
  await page.evaluate(needle=>{
   const original=crypto.subtle.digest.bind(crypto.subtle),state={held:false,release:()=>{}};(window as any).__hashPause=state;
   crypto.subtle.digest=async(algorithm,bytes)=>{if(!state.held&&new TextDecoder().decode(bytes).includes(needle)){state.held=true;await new Promise<void>(resolve=>{state.release=resolve;});}return original(algorithm,bytes);};
  },stage==='command'?'save_row':'tjanst_journal_scope_v1');
  await dialog(page).getByRole('button',{name:'Spara tjänsteraden'}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__hashPause.held)).toBe(true);
  if(change==='scope')await page.evaluate(()=>{const b=[...document.querySelectorAll('main > div > button')].find(b=>b.textContent==='Byt läsår') as HTMLButtonElement;b.click();});else{await page.setViewportSize({width:390,height:844});await expect(ws(page).getByLabel('Vy',{exact:true})).toBeVisible();}
  await page.evaluate(()=>(window as any).__hashPause.release());await expect(dialog(page)).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('tjanst:')).length)).toBe(0);expect(await commands(page)).toEqual([]);
 });
 test('samma personnamn sammanför inte historik eller aktiva val',async({page})=>{
  await open(page,'?data=samma-namn');await math(page);
  await expect(dialog(page).getByRole('button',{name:'Välj Anna Andersson',exact:true})).toHaveCount(2);
  await expect(dialog(page).getByRole('button',{name:'Välj förslaget: Anna Andersson',exact:true})).toHaveCount(1);
  await dialog(page).getByRole('button',{name:'Välj Anna Andersson',exact:true}).nth(1).click();await save(page);
  expect((await commands(page))[0].body.payload.planningContext.choice).toMatchObject({kind:'manual',personId:id(106)});
 });
 test('sent stöd för föregående rad ersätter inte nästa rads val',async({page})=>{
  await open(page);await page.evaluate(()=>window.__tjanst.holdProduced('plan/forhandsvisa'));
  await ws(page).getByRole('region',{name:'Matris',exact:true}).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__tjanst.produced.length)).toBe(1);
  await ws(page).getByRole('region',{name:'Matris',exact:true}).getByRole('button',{name:'Cecilia Dahl, Matematik 1b, EK26: ingen tid. Tilldela.'}).click();await choose(page,'David Ek');
  await page.evaluate(()=>window.__tjanst.releaseProduced());await expect(dialog(page).getByText('Vald lärare: David Ek',{exact:true})).toBeVisible();await dialog(page).getByLabel('Lärartid HT (timmar)').fill('4');await save(page);
  expect((await commands(page))[0].body.payload).toMatchObject({sourceKey:`class_timplan:${id(202)}:2026:MATMAT01b`,personId:id(104),teacherHt:240});
 });
 for(const first of ['row','bulk'])test(`okänd ${first}-skrivning spärrar båda skrivvägar tills status klarlagts`,async({page},info)=>{
  await open(page);await page.evaluate(()=>{window.__tjanst.failNext('plan/kommando','lost');window.__tjanst.failNext('plan/status','network');});
  if(first==='row'){await math(page);await choose(page);await dialog(page).getByRole('button',{name:'Spara tjänsteraden'}).click();}
  else{await bulk(page);await dialog(page).getByRole('group',{name:'Behov att registrera'}).getByRole('checkbox',{name:/TE26A · Matematik 1c/}).check();await assignBulk(page);await dialog(page).getByRole('button',{name:'Förhandsvisa',exact:true}).click();await dialog(page).getByRole('button',{name:'Spara ändringarna'}).click();}
  await expect(dialog(page)).toContainText('Det gick inte att avgöra om ändringen sparades.');await dialog(page).getByRole('button',{name:'Stäng utan att spara'}).click();
  await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();
  await expect(ws(page).getByRole('button',{name:'Massregistrera',exact:true})).toHaveCount(0);await expect(ws(page).getByRole('region',{name:'Matris',exact:true}).getByRole('button',{name:/Tilldela\.|Ändra\./})).toHaveCount(0);
  expect(await commands(page)).toHaveLength(1);const journal=await page.evaluate(()=>Object.entries(sessionStorage).filter(([k])=>k.startsWith('tjanst:')).map(([,v])=>v).join(''));expect(journal).not.toMatch(/teacherHt|planningContext|Cecilia|David/);
  await page.screenshot({path:`/private/tmp/tjanst-year-${info.project.name}-unknown-${first}.png`,fullPage:true});
  await ws(page).getByRole('button',{name:'Kontrollera sparstatus'}).click();await expect(ws(page).getByRole('button',{name:'Massregistrera',exact:true})).toBeVisible();expect(await commands(page)).toHaveLength(1);
 });
 test('hel samläsning flyttas med grupptid en gång och andra lärare bevaras',async({page},info)=>{
  await open(page,'?data=samlasning');const before=await page.evaluate(()=>window.__tjanst.snapshotOf()) as any;
  await ws(page).getByRole('button',{name:'Flytta uppdrag',exact:true}).click();await dialog(page).getByLabel('Flytta från lärare').selectOption(id(102));await dialog(page).getByLabel('Flytta till lärare').selectOption(id(104));await dialog(page).getByRole('button',{name:'Bekräfta mållärare'}).click();
  const selection=dialog(page).getByRole('region',{name:'Uppdrag att flytta'});await selection.getByRole('checkbox',{name:/TE26A · Svenska 1/}).check();await dialog(page).getByRole('button',{name:'Förhandsvisa',exact:true}).click();
  await expect(dialog(page).getByRole('button',{name:'Spara ändringarna',exact:true})).toBeDisabled();
  await dialog(page).getByRole('button',{name:'Markera lärarens alla rader i samläsningen'}).click();await dialog(page).getByRole('button',{name:'Förhandsvisa',exact:true}).click();await expect(dialog(page).getByRole('button',{name:'Spara ändringarna',exact:true})).toBeEnabled();
  await page.screenshot({path:`/private/tmp/tjanst-year-${info.project.name}-batch-selection.png`,fullPage:true});await dialog(page).getByRole('heading',{name:'Förhandsvisning',exact:true}).evaluate(node=>node.scrollIntoView({block:'start'}));await page.screenshot({path:`/private/tmp/tjanst-year-${info.project.name}-batch-preview.png`,fullPage:true});await dialog(page).getByRole('button',{name:'Spara ändringarna',exact:true}).click();await expect(dialog(page)).toHaveCount(0);
  const after=await page.evaluate(()=>window.__tjanst.snapshotOf()) as any;expect(after.draft.joints[0].teachers).toEqual([{personId:id(104),ht:3000,vt:3000},{personId:id(101),ht:1200,vt:1200}]);
  expect(after.draft.rows.filter((r:any)=>r.personId===id(101))).toEqual(before.draft.rows.filter((r:any)=>r.personId===id(101)));expect((await commands(page))[0].body.payload.items).toHaveLength(2);
 });
 test('avmarkering och nytt radstöd kan inte ersättas av ett gammalt producerat batchrowsvar',async({page})=>{
  await open(page);await bulk(page);await expect(dialog(page).getByLabel('Lärare för markerade behov').locator('option')).not.toHaveCount(2);
  await page.evaluate(()=>window.__tjanst.holdProduced('plan/forhandsvisa'));
  const checkbox=dialog(page).getByRole('group',{name:'Behov att registrera'}).getByRole('checkbox',{name:/TE26A · Matematik 1c/});await checkbox.check();
  await expect.poll(()=>page.evaluate(()=>window.__tjanst.produced.length)).toBe(1);await checkbox.uncheck();await page.evaluate(()=>window.__tjanst.bump('core'));await checkbox.check();await assignBulk(page);
  await page.evaluate(()=>window.__tjanst.releaseProduced());await previewSave(page);expect((await commands(page)).map(c=>c.body.action)).toEqual(['bulk']);
 });
 test('redan producerad batchpreview återöppnar inte ett stängt formulär',async({page})=>{
  await open(page);await bulk(page);await dialog(page).getByRole('group',{name:'Behov att registrera'}).getByRole('checkbox',{name:/TE26A · Matematik 1c/}).check();await assignBulk(page);await page.evaluate(()=>window.__tjanst.holdProduced('plan/forhandsvisa'));
  await dialog(page).getByRole('button',{name:'Förhandsvisa',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__tjanst.produced.length)).toBe(1);await dialog(page).getByRole('button',{name:'Stäng utan att spara'}).click();await page.evaluate(()=>window.__tjanst.releaseProduced());await expect(dialog(page)).toHaveCount(0);expect(await commands(page)).toEqual([]);
  await bulk(page);await expect(dialog(page).getByRole('heading',{name:'Förhandsvisning',exact:true})).toHaveCount(0);await expect(dialog(page).getByRole('group',{name:'Behov att registrera'}).getByRole('checkbox',{checked:true})).toHaveCount(0);
 });
 test('batchformuläret bevaras över telefonläge utan nya stöd- eller skrivanrop',async({page},info)=>{
  await open(page);await bulk(page);await dialog(page).getByRole('group',{name:'Behov att registrera'}).getByRole('checkbox',{name:/TE26A · Matematik 1c/}).check();await assignBulk(page);
  const row=dialog(page).getByRole('region',{name:'TE26A · Matematik 1c',exact:true});await row.getByLabel('Lärartid HT (timmar)').fill('12');
  const count=await page.evaluate(()=>window.__tjanst.reads.filter(r=>r.path.endsWith('/forhandsvisa')).length);
  await page.setViewportSize({width:390,height:844});await expect(dialog(page)).toHaveCount(0);await expect(ws(page).getByRole('button',{name:'Massregistrera',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>window.__tjanst.reads.filter(r=>r.path.endsWith('/forhandsvisa')).length)).toBe(count);expect(await commands(page)).toEqual([]);
  await page.setViewportSize(info.project.name==='desktop'?{width:1440,height:900}:{width:1024,height:768});await expect(row.getByLabel('Lärartid HT (timmar)')).toHaveValue('12');await expect(row).toContainText('Vald lärare: David Ek');await previewSave(page);expect((await commands(page))[0].body.payload.items[0].payload.teacherHt).toBe(720);
 });
 test('stale batch behåller tid men kräver förnyat aktivt lärarval',async({page})=>{
  await open(page);await bulk(page);await dialog(page).getByRole('group',{name:'Behov att registrera'}).getByRole('checkbox',{name:/TE26A · Matematik 1c/}).check();await assignBulk(page);
  const row=dialog(page).getByRole('region',{name:'TE26A · Matematik 1c',exact:true});await row.getByLabel('Lärartid HT (timmar)').fill('12');await dialog(page).getByRole('button',{name:'Förhandsvisa',exact:true}).click();
  await expect(dialog(page).getByRole('button',{name:'Spara ändringarna',exact:true})).toBeEnabled();await page.evaluate(()=>window.__tjanst.bump('person',undefined,undefined,'51a50000-0000-4000-8000-000000000104'));await dialog(page).getByRole('button',{name:'Spara ändringarna',exact:true}).click();
  await expect(dialog(page).getByRole('alert').first()).toContainText('Underlaget har ändrats');await expect(row.getByLabel('Lärartid HT (timmar)')).toHaveValue('12');
  await dialog(page).getByRole('button',{name:'Hämta nytt planeringsstöd',exact:true}).click();await expect(dialog(page).getByRole('button',{name:'Använd valet på markerade behov'})).toBeEnabled();
  await dialog(page).getByRole('button',{name:'Förhandsvisa',exact:true}).click();expect(await commands(page)).toHaveLength(1);
  await assignBulk(page);await previewSave(page);const sent=await commands(page);expect(sent).toHaveLength(2);expect(sent[1].body.payload.items[0].payload.teacherHt).toBe(720);expect(sent[1].body.payload.items[0].payload.planningContext.choice.expectedPersonBasisHash).not.toBe(sent[0].body.payload.items[0].payload.planningContext.choice.expectedPersonBasisHash);
 });
 test('två uttryckliga batcher 100+1 utan dolt lärarval eller omskrivning',async({page})=>{
  test.setTimeout(180_000);await open(page,'?data=batch');await bulk(page);const group=dialog(page).getByRole('group',{name:'Behov att registrera'});
  await clickNeeds(group,100);await assignBulk(page);await group.getByRole('checkbox').nth(100).check();
  const last=dialog(page).getByRole('region',{name:'TE26A · Behov 101',exact:true});await expect(last).toContainText('Ingen lärare vald');
  await expect(dialog(page).getByRole('button',{name:'Förhandsvisa',exact:true})).toBeDisabled();await expect(dialog(page)).toContainText('100');expect(await commands(page)).toEqual([]);
  await group.getByRole('checkbox').nth(100).uncheck();await previewSave(page);const first=await page.evaluate(()=>window.__tjanst.snapshotOf()) as any;expect(first.draft.rows).toHaveLength(100);
  await bulk(page);await dialog(page).getByLabel('Sök behov').fill('Behov 101');await dialog(page).getByRole('group',{name:'Behov att registrera'}).getByRole('checkbox').check();await expect(dialog(page).getByRole('region',{name:'TE26A · Behov 101',exact:true})).toContainText('Ingen lärare vald');await assignBulk(page);await previewSave(page);
  const after=await page.evaluate(()=>window.__tjanst.snapshotOf()) as any;expect(after.draft.rows).toHaveLength(101);expect(after.draft.rows.slice(0,100)).toEqual(first.draft.rows);expect(after.versions).toHaveLength(1);
  const sent=await commands(page);expect(sent.map(c=>c.body.action)).toEqual(['bulk','bulk']);expect(sent.map(c=>c.body.payload.items.length)).toEqual([100,1]);expect(sent.map(c=>c.body.expectedRevision)).toEqual([0,1]);
 });
});

test.describe('telefon läser planeringen',()=>{
 test.beforeEach(({},info)=>test.skip(info.project.name.startsWith('desktop'),'Telefonstorlekar har eget läsläge.'));
 test('nytt år är läsbart utan normal- eller batchredigering',async({page},info)=>{
  await open(page,'?ar=2027');await expect(ws(page).getByRole('tab',{name:'Matris',exact:true})).toHaveCount(0);await ws(page).getByRole('combobox',{name:'Vy',exact:true}).selectOption('klass');
  await expect(ws(page).getByText('Inga uppdrag har ännu fördelats för läsåret. Här kan du läsa aktuellt underlag. Planeringen görs på dator.',{exact:true})).toBeVisible();
  await expect(ws(page).getByRole('button',{name:/Flytta uppdrag|Massregistrera|Lägg till|Tilldela|Ta bort|Spara/})).toHaveCount(0);
  await ws(page).getByRole('button',{name:'Publiceringsstatus',exact:true}).click();const panel=ws(page).getByRole('region',{name:'Fastställ och publicera',exact:true});await expect(panel).toBeVisible();await expect(panel.getByRole('button',{name:/Fastställ och publicera|Ta bort/})).toHaveCount(0);
  await ws(page).getByRole('button',{name:'Dölj publiceringsstatus',exact:true}).click();expect(await commands(page)).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);await page.screenshot({path:`/private/tmp/tjanst-year-${info.project.name}-current.png`,fullPage:true});
 });
});
