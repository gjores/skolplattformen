// Synthetic component evidence for Tjänstefördelning (05.1-05). /api/tjanst/* is answered by the fixture's in-browser mock;
// no database, server or live authentication. Komponentprov, inte faktiskt prov.
import {test,expect,type Page} from '@playwright/test';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
const url='/e2e/fixtures/tjanst-preview.html';
const UNIT_A='51a50000-0000-4000-8000-000000000003';
const SHOTS=`${existsSync('/private/tmp')?'/private/tmp':tmpdir()}/tjanst-ui`;
const ws=(page:Page)=>page.locator('.tjanst');
type Logged={path:string;body:any};
const commands=(page:Page)=>page.evaluate(()=>window.__tjanst.commands) as Promise<Logged[]>;
const desktop=(name:string)=>name.startsWith('desktop');
async function open(page:Page,query=''){
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+query);await expect(ws(page).getByText('Hämtar tjänstefördelningen…')).toHaveCount(0);
 return errors;
}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);}
const matrix=(page:Page)=>ws(page).getByRole('region',{name:'Matris'});
const footer=(page:Page,label:string,teacher:string)=>page.locator(`[data-sum="${label}:${teacher}"]`);

test.describe('dator',()=>{
 test.beforeEach(({},info)=>{test.skip(!desktop(info.project.name),'Matris och redigering finns bara på dator (D-15).');});

 test('fördela tom cell',async({page})=>{
  const errors=await open(page);
  const cell=matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'});
  await cell.click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByText('Schemalagd tid')).toBeVisible();await expect(dialog.getByText('Underlag saknas',{exact:true})).toBeVisible();
  await expect(dialog.getByText('Källa: Teknikprogrammet version 2, ämnesrad Matematik 1c')).toBeVisible();
  await expect(dialog.getByLabel('Lärartid HT (timmar)')).toHaveValue('50');await expect(dialog.getByLabel('Lärartid VT (timmar)')).toHaveValue('50');
  await dialog.getByLabel('Lärartid VT (timmar)').fill('40');
  await expect(dialog.getByText('Avvikelse VT: −10 h')).toBeVisible();
  // D-30: ingen Spara-knapp för en ny rad; valet av lärare sparar.
  await expect(dialog.getByRole('button',{name:'Spara tjänsteraden'})).toHaveCount(0);
  await dialog.getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();
  await expect(ws(page).getByText('Tjänsteraden är sparad: Cecilia Dahl, Matematik 1c, TE26A, HT 50 h · VT 40 h.')).toBeVisible();
  const sent=(await commands(page)).filter(c=>c.body.action==='save_row');
  expect(sent).toHaveLength(1);expect(sent[0].body.payload).toMatchObject({rowId:null,personId:'51a50000-0000-4000-8000-000000000103',teacherHt:3000,teacherVt:2400});
  expect(sent[0].body.payloadHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  const reads=await page.evaluate(()=>window.__tjanst.reads.filter(r=>r.path.endsWith('/plan/lasa')).length);expect(reads).toBeGreaterThanOrEqual(2);
  const saved=matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: 90 h. Ändra.'});await expect(saved).toBeVisible();
  const mathRow=matrix(page).getByRole('row').filter({has:page.getByRole('rowheader',{name:/^Matematik 1c/})});
  await expect(mathRow.locator('.tjanst-deviation')).toHaveText('−10 h');
  await expect(footer(page,'Totalt','Cecilia Dahl')).toHaveText('90 h');await expect(footer(page,'Undervisning','Cecilia Dahl')).toHaveText('90 h');
  await expect(saved).toBeFocused();
  expect(errors).toEqual([]);
 });

 test('AE2 koppling saknas: okopplad klass visar texten utan nollor',async({page})=>{
  await open(page);
  await expect(matrix(page).getByRole('rowheader',{name:'NA26B · koppling saknas'})).toBeVisible();
  const group=matrix(page).locator('tbody').filter({has:page.getByRole('rowheader',{name:'NA26B · koppling saknas'})});
  await expect(group).toContainText('Klassen har ingen timplan för läsåret 26/27. Behovet är okänt, inte noll.');
  await expect(group).not.toContainText(/\b0 h\b/);
  // 05.1-26: skolformen för en okopplad klass framgår inte; användaren väljer gymnasiet eller GR/IM uttryckligen.
  await group.getByRole('button',{name:'Klasskopplingar för gymnasiet'}).click();
  expect(await page.evaluate(()=>window.__tjanst.openedLinks)).toBe(1);
  expect(await page.evaluate(()=>window.__tjanst.openedLinkForms)).toEqual(['gymnasium']);
  await group.getByRole('button',{name:'Klasskopplingar för GR och IM'}).click();
  expect(await page.evaluate(()=>window.__tjanst.openedLinkForms)).toEqual(['gymnasium','grundskola']);
  // Skolans behov räknar bara kopplade klasser: 300 + 200 + 144 h.
  await expect(matrix(page).locator('tfoot tr').first().locator('td').first()).toHaveText('644 h');
  await ws(page).getByRole('tab',{name:'Per klass'}).click();await ws(page).getByLabel('Klass',{exact:true}).selectOption({label:'NA26B'});
  await expect(ws(page).getByRole('heading',{name:'NA26B · koppling saknas'})).toBeVisible();
  await expect(ws(page).getByRole('region',{name:'Per klass'})).not.toContainText(/\b0 h\b/);
 });

 test('WR-02: 400 tjanst_joint_already visar texten om samläsningen och raden finns kvar',async({page})=>{
  await open(page);
  const cell=matrix(page).getByRole('button',{name:'Anna Andersson, Engelska 5, TE26A: 50 h. Ändra.'});
  await cell.click();
  await page.getByRole('dialog').getByRole('button',{name:'Ta bort tjänsteraden…'}).click();
  const confirm=page.getByRole('dialog',{name:'Ta bort tjänsteraden?'});
  await page.evaluate(()=>window.__tjanst.failNext('plan/kommando',{status:400,code:'tjanst_joint_already'}));
  await confirm.getByRole('button',{name:'Ta bort tjänsteraden',exact:true}).click();
  await expect(confirm.getByRole('alert')).toContainText('Raden ingår i en samläsning. Ändra eller lös upp samläsningen först.');
  // Mockens simulerade fel besvarar anropet innan kommandot loggas; det köade felet ska vara förbrukat.
  expect(await page.evaluate(()=>window.__tjanst.fail['plan/kommando']?.length??0)).toBe(0);
  await confirm.getByRole('button',{name:'Behåll raden'}).click();
  await expect(matrix(page).getByRole('button',{name:'Anna Andersson, Engelska 5, TE26A: 50 h. Ändra.'})).toBeVisible();
 });

 test('D-28: samläsning med olika lärare spärras i dialogen och skickar inget',async({page})=>{
  await open(page);
  await ws(page).getByRole('tab',{name:'Per kurs/ämne'}).click();
  const course=ws(page).getByRole('region',{name:'Per kurs/ämne'});
  await course.getByRole('checkbox',{name:'Markera Engelska 5 TE26A, Bertil Berg'}).check();
  await course.getByRole('checkbox',{name:'Markera Matematik 1b EK26, Anna Andersson'}).check();
  await course.getByRole('button',{name:'Koppla till samläsning…'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('En samläsning ska ha samma lärare för alla klasser. De markerade raderna har olika lärare.');
  await expect(dialog.getByRole('button',{name:'Spara samläsningen'})).toBeDisabled();
  // 05.1-27: lärartid och täckning döljs när spärren gäller.
  await expect(dialog.getByText(/^Lärartid för gruppen/)).toHaveCount(0);await expect(dialog.getByRole('region',{name:'Täckning efter kopplingen'})).toHaveCount(0);
  expect((await commands(page)).filter(c=>c.body.action==='save_joint')).toEqual([]);
 });

 test('D-28: äldre samläsning med flera lärare märks i matrisen',async({page})=>{
  await open(page,'?data=samlasning');
  const svenska=matrix(page).locator('tbody').filter({has:page.getByRole('rowheader',{name:/^TE26A ·/})}).getByRole('row').filter({has:page.getByRole('rowheader',{name:/^Svenska 1/})});
  await expect(svenska.getByText('Samläsning · olika lärare')).toBeVisible();
 });

 test('val av lärare för ett behov med vakant rad ersätter Vakant i stället för att fördela dubbelt (05.1-32)',async({page})=>{
  await open(page);
  await matrix(page).getByRole('button',{name:'Anna Andersson, Svenska som andraspråk 1, IMSPR: ingen tid. Tilldela.'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByText('Behovet har en vakant rad. Väljer du en lärare ersätts Vakant, så att behovet inte fördelas dubbelt.')).toBeVisible();
  await expect(dialog.getByLabel('Lärartid HT (timmar)')).toHaveValue('36');
  await dialog.getByRole('button',{name:'Välj Anna Andersson',exact:true}).click();await expect(dialog).toHaveCount(0);
  const sent=(await commands(page)).filter(c=>c.body.action==='save_row');expect(sent).toHaveLength(1);
  expect(sent[0].body.payload).toMatchObject({rowId:'51a50000-0000-4000-8000-000000000305',personId:'51a50000-0000-4000-8000-000000000101'});
  await expect(matrix(page).getByRole('button',{name:/^Vakant, Svenska som andraspråk 1, IMSPR: ingen tid/})).toBeVisible();
 });

 test('fokus återgår till cellen när omläsningen efter sparning är fördröjd (09f5214)',async({page})=>{
  await open(page);
  await matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  const dialog=page.getByRole('dialog');
  await page.evaluate(()=>window.__tjanst.holdNext('plan/lasa'));
  await dialog.getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();
  await expect(ws(page)).toHaveAttribute('aria-busy','true');
  await page.waitForTimeout(150);
  await page.evaluate(()=>window.__tjanst.release());
  await expect(ws(page)).toHaveAttribute('aria-busy','false');
  await expect(matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: 100 h. Ändra.'})).toBeFocused();
 });

 test('05.1-27 kursklick visar alla klasser med samma kurs och kan rensas',async({page})=>{
  await open(page);
  const te=matrix(page).locator('tbody').filter({has:page.getByRole('rowheader',{name:/^TE26A ·/})});
  await te.getByRole('button',{name:'Engelska 5',exact:true}).click();
  await expect(ws(page).getByRole('tab',{name:'Per kurs/ämne'})).toHaveAttribute('aria-selected','true');
  await expect(ws(page).getByText('Visar alla klasser med kursen Engelska 5. Markera rader för att koppla dem till en samläsning.')).toBeVisible();
  const course=ws(page).getByRole('region',{name:'Per kurs/ämne'});
  await expect(course.getByRole('region',{name:'Engelska 5'})).toBeVisible();await expect(course.getByRole('region',{name:'Matematik 1b'})).toHaveCount(0);
  await ws(page).getByRole('button',{name:'Rensa filter'}).first().click();await expect(course.getByRole('region',{name:'Matematik 1b'})).toBeVisible();
 });

 test('05.1-27 samläsningsmärket öppnar den aktuella samläsningen',async({page})=>{
  await open(page);
  const svenska=matrix(page).locator('tbody').filter({has:page.getByRole('rowheader',{name:/^TE26A ·/})}).getByRole('row').filter({has:page.getByRole('rowheader',{name:/^Svenska 1/})});
  await svenska.getByRole('button',{name:'Samläsning',exact:true}).click();
  await expect(ws(page).getByRole('tab',{name:'Per kurs/ämne'})).toHaveAttribute('aria-selected','true');
  await expect(ws(page).getByRole('region',{name:'Samläsning: Svenska 1 TE26A + EK26'})).toBeFocused();
 });

 test('05.1-27 samläsning varnar för olika timplanstid och APL men får sparas',async({page})=>{
  await open(page,'?data=apl');
  await ws(page).getByRole('tab',{name:'Per kurs/ämne'}).click();
  const course=ws(page).getByRole('region',{name:'Per kurs/ämne'});
  await course.getByRole('checkbox',{name:'Markera Engelska 5 TE26A, Anna Andersson'}).check();
  await course.getByRole('checkbox',{name:'Markera Matematik 1b EK26, Anna Andersson'}).check();
  await course.getByRole('button',{name:'Koppla till samläsning…'}).click();
  const dialog=page.getByRole('dialog'),warning=dialog.locator('.tjanst-warning');
  await expect(warning).toContainText('Timplanstiden skiljer sig mellan klasserna: TE26A HT 50 h · VT 50 h; EK26 HT 50 h · VT 30 h. Gruppens tid kan inte motsvara alla klassers behov.');
  await expect(warning).toContainText('EK26 har APL under läsåret, TE26A har ingen APL. Samläsningen kan inte schemaläggas tillsammans under APL-perioderna.');
  await expect(dialog.getByRole('button',{name:'Spara samläsningen'})).toBeEnabled();
  await dialog.getByRole('button',{name:'Spara samläsningen'}).click();
  await expect(course.locator('[data-joint] .tjanst-warning').last()).toContainText('EK26 har APL under läsåret');
 });

 test('WR-02: blockeraren joint_invalid visas i Fastställ och publicera och knappen är inaktiv',async({page})=>{
  await open(page,'?hinder=samlasning');
  await ws(page).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  const panel=ws(page).getByRole('region',{name:'Fastställ och publicera'});
  await expect(panel.getByText('1 punkt behöver åtgärdas innan du kan fastställa.')).toBeVisible();
  await expect(panel.getByRole('listitem').filter({hasText:'En samläsning uppfyller inte reglerna'})).toHaveText('En samläsning uppfyller inte reglerna: raderna ska finnas i minst två klasser, och lärartid får bara gälla lärare som har en rad i gruppen. Ändra eller lös upp samläsningen.');
  await expect(panel.getByRole('button',{name:'Fastställ och publicera…'})).toBeDisabled();
  await expect(panel.getByText('Rektor fastställer och publicerar fördelningen.',{exact:false})).toHaveCount(0);
  expect((await commands(page)).filter(c=>c.body.action==='publish')).toEqual([]);
 });

 test('AE3 specialuppdrag: mentor med klass och programansvar utan grupp, skilt från undervisning',async({page})=>{
  await open(page);
  await ws(page).getByRole('tab',{name:'Specialuppdrag'}).click();
  const view=ws(page).getByRole('region',{name:'Specialuppdrag'});
  const mentor=view.getByRole('row').filter({hasText:'Mentor'}),program=view.getByRole('row').filter({hasText:'Programansvar'});
  await expect(mentor).toContainText('Anna Andersson');await expect(mentor).toContainText('TE26A');await expect(mentor).toContainText('40 h');
  await expect(program).toContainText('Bertil Berg');await expect(program).toContainText('Ingen grupp');
  await ws(page).getByRole('tab',{name:'Per lärare'}).click();
  const facts=ws(page).getByRole('region',{name:'Per lärare'}).locator('dl.tjanst-facts');
  await expect(facts).toContainText('UndervisningHT 100 h · VT 50 h · Läsår 150 h');await expect(facts).toContainText('SpecialuppdragHT 20 h · VT 20 h · Läsår 40 h');
  await expect(facts).toContainText('TotaltHT 120 h · VT 70 h · Läsår 190 h');await expect(facts).toContainText('Andel här60 %');await expect(facts).toContainText('Schemalagd tidUnderlag saknas');
  await ws(page).getByRole('button',{name:'Lägg till specialuppdrag'}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Spara specialuppdraget'}).click();
  await expect(dialog.getByText('Formuläret innehåller fel. Rätta de markerade fälten.')).toBeVisible();
  await expect(dialog.getByLabel('Typ')).toHaveAttribute('aria-invalid','true');await expect(dialog.getByText('Välj typ av uppdrag.')).toBeVisible();
  await dialog.getByLabel('Typ').selectOption('mentor');await dialog.getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();
  await dialog.getByLabel('Klass',{exact:true}).selectOption({label:'EK26'});await dialog.getByLabel('Tid HT (timmar)').fill('10');
  await dialog.getByRole('button',{name:'Spara specialuppdraget'}).click();
  await expect(ws(page).getByText('Specialuppdraget Mentor är sparat för Cecilia Dahl.')).toBeVisible();
  const sent=(await commands(page)).find(c=>c.body.action==='save_special')!;
  expect(sent.body.payload).toMatchObject({kind:'mentor',classId:'51a50000-0000-4000-8000-000000000202',ht:600,vt:0,specialId:null});
  await ws(page).getByRole('tab',{name:'Matris'}).click();
  await expect(footer(page,'Specialuppdrag','Cecilia Dahl')).toHaveText('10 h');await expect(footer(page,'Undervisning','Cecilia Dahl')).toHaveText('0 h');
 });

 test('AE4 samläsning räknas en gång och två lärare summerar täckningen',async({page})=>{
  await open(page);
  await expect(footer(page,'Undervisning','Bertil Berg')).toHaveText('150 h');await expect(footer(page,'Totalt','Bertil Berg')).toHaveText('210 h');
  for(const cls of ['TE26A','EK26'])await expect(matrix(page).getByRole('button',{name:`Bertil Berg, Svenska 1, ${cls}: 100 h. Ändra.`})).toBeVisible();
  const te=matrix(page).locator('tbody').filter({has:page.getByRole('rowheader',{name:/^TE26A ·/})});
  await expect(te.getByRole('row').filter({has:page.getByRole('rowheader',{name:/^Engelska 5/})}).locator('td').nth(1)).toHaveText('100 h');
  await ws(page).getByRole('tab',{name:'Per klass'}).click();await ws(page).getByLabel('Klass',{exact:true}).selectOption({label:'TE26A'});
  const english=ws(page).getByRole('region',{name:'Per klass'}).getByRole('row').filter({hasText:'Engelska 5'});
  await expect(english).toContainText('100 av 100 h · 2 lärare');await expect(english).toContainText('Anna Andersson');await expect(english).toContainText('Bertil Berg');
  await expect(ws(page).getByRole('region',{name:'Per klass'}).getByRole('row').filter({hasText:'Svenska 1'})).toContainText('Samläsning med EK26');
  await ws(page).getByRole('tab',{name:'Per kurs/ämne'}).click();
  const course=ws(page).getByRole('region',{name:'Per kurs/ämne'});
  await expect(course.getByText('Markera rader i olika klasser för att koppla dem till en samläsning.')).toBeVisible();
  await course.getByRole('checkbox',{name:'Markera Engelska 5 TE26A, Anna Andersson'}).check();
  await expect(course.getByText('1 rad markerad')).toBeVisible();
  await course.getByRole('button',{name:'Koppla till samläsning…'}).click();
  await expect(course.getByText('Markera minst två rader i minst två olika klasser.')).toBeVisible();
  await course.getByRole('checkbox',{name:'Markera Svenska 1 EK26, Bertil Berg'}).check();
  await course.getByRole('button',{name:'Koppla till samläsning…'}).click();
  await expect(course.getByText('Svenska 1 EK26 ingår redan i samläsningen Svenska 1 TE26A + EK26. Lös upp den först eller ändra den samläsningen.')).toBeVisible();
  await course.getByRole('checkbox',{name:'Markera Svenska 1 EK26, Bertil Berg'}).uncheck();
  await course.getByRole('checkbox',{name:'Markera Matematik 1b EK26, Anna Andersson'}).check();
  await expect(course.getByText('2 rader markerade')).toBeVisible();
  await course.getByRole('button',{name:'Koppla till samläsning…'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByLabel('Namn')).toHaveValue('Engelska 5 TE26A + EK26');
  await expect(dialog.getByRole('region',{name:'Täckning efter kopplingen'})).toContainText('TE26A: 50 av 100 h');
  await dialog.getByRole('button',{name:'Spara samläsningen'}).click();
  await expect(ws(page).getByText('Samläsningen Engelska 5 TE26A + EK26 är sparad. Lärartiden räknas en gång och klasserna TE26A och EK26 visas som täckta.')).toBeVisible();
  const sent=(await commands(page)).find(c=>c.body.action==='save_joint')!;
  expect(sent.body.payload.rowIds).toEqual(['51a50000-0000-4000-8000-000000000301','51a50000-0000-4000-8000-000000000306']);
  expect(sent.body.payload.teachers).toEqual([{personId:'51a50000-0000-4000-8000-000000000101',ht:3000,vt:0}]);
  await expect(course.getByRole('region',{name:'Samläsning: Engelska 5 TE26A + EK26'})).toBeVisible();
  await ws(page).getByRole('tab',{name:'Matris'}).click();await expect(footer(page,'Undervisning','Anna Andersson')).toHaveText('50 h');
 });

 test('AE5 rektor publicerar med engångskod och ändrar i ny version',async({page})=>{
  await open(page,'?aterkoppling=1');
  await expect(ws(page).getByText('Kvitterad av 1 av 2 lärare')).toBeVisible();
  await ws(page).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  const panel=ws(page).getByRole('region',{name:'Fastställ och publicera'});
  await expect(panel).toContainText('Ändringarna är ännu inte publicerade.');
  await panel.getByRole('button',{name:'Lärarnas återkoppling (1)'}).click();
  await expect(panel.getByText('Jag vill gärna ha mentorstiden kvar på VT.')).toBeVisible();await expect(panel.getByText('Inte kvitterad')).toBeVisible();
  await panel.getByRole('button',{name:'Fastställ och publicera…'}).click();
  let dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:'Fastställ och publicera version 2?'})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Behåll utkastet'})).toBeFocused();
  await dialog.getByRole('button',{name:'Fastställ och publicera'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Att fastställa och publicera kräver verifiering med engångskod.');
  await expect(dialog.getByRole('button',{name:'Verifiera med engångskod'})).toBeVisible();
  await page.evaluate(()=>{window.__tjanst.mfaVerified=true;});
  await dialog.getByRole('button',{name:'Fastställ och publicera'}).click();
  await expect(ws(page).getByText('Version 2 är fastställd och publicerad. Lärarna ser den i Min tjänst.')).toBeVisible();
  const published=(await commands(page)).filter(c=>c.path.endsWith('/plan/publicera'));
  expect(published).toHaveLength(2);expect(published[1].body).toMatchObject({action:'publish',expectedContentHash:expect.stringMatching(/^sha256:/)});
  expect((await commands(page)).filter(c=>c.path.endsWith('/plan/kommando')&&c.body.action==='publish')).toHaveLength(0);
  await expect(ws(page).getByText('Lärarna ser version 2, publicerad 2026-10-24.')).toBeVisible();
  await expect(matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'})).toBeVisible();
  await ws(page).getByRole('button',{name:'Historik',exact:true}).click();
  await expect(ws(page).getByLabel('Historisk publicering')).toHaveValue(published[1].body.payload.mutationContext.baseVersionId);
  await expect(matrix(page).getByRole('button',{name:/Ändra\.$|Tilldela\.$/})).toHaveCount(0);
  await ws(page).getByRole('button',{name:'Tillbaka till planeringen'}).click();
  await matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();
  await expect(ws(page).getByText('Ändringar ännu inte publicerade',{exact:true})).toBeVisible();
  await expect(ws(page).getByText('Lärarna ser version 2, publicerad 2026-10-24.')).toBeVisible();
  expect((await commands(page)).filter(c=>c.body.action==='create_draft')).toHaveLength(0);
  void dialog;dialog=page.getByRole('dialog');await expect(dialog).toHaveCount(0);
 });

 test('AE5 skoladministratör förbereder men saknar beslutsknappen',async({page})=>{
  await open(page,'?roll=administrator');
  await expect(ws(page).getByText('Du kan förbereda fördelningen. Rektor fastställer och publicerar.')).toBeVisible();
  await expect(ws(page).getByRole('button',{name:'Lägg till lärare i fördelningen'})).toBeVisible();
  await ws(page).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  const panel=ws(page).getByRole('region',{name:'Fastställ och publicera'});
  await expect(panel.getByText('Rektor fastställer och publicerar fördelningen. Du kan fortsätta planera.')).toBeVisible();
  await expect(panel.getByRole('button',{name:/Fastställ och publicera…|Ta bort utkastet/})).toHaveCount(0);
 });

 test('AE5 publicering nekas med 403 och 409 och visas klar först efter kvitto',async({page})=>{
  await open(page);
  await page.evaluate(()=>{window.__tjanst.mfaVerified=true;window.__tjanst.failNext('plan/publicera',{status:403,code:'forbidden'});window.__tjanst.failNext('plan/publicera',{status:409,code:'tjanst_published_meanwhile'});});
  await ws(page).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  await ws(page).getByRole('button',{name:'Fastställ och publicera…'}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:'Fastställ och publicera'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Bara rektor kan fastställa och publicera tjänstefördelningen.');await expect(dialog.getByRole('alert')).toContainText('Referens: syntetisk-ref-1');
  await dialog.getByRole('button',{name:'Fastställ och publicera'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Underlaget har ändrats. Dina uppgifter finns kvar. Hämta aktuellt underlag och bekräfta ditt val på nytt.');
  await expect(ws(page).getByText(/är fastställd och publicerad/)).toHaveCount(0);
  await dialog.getByRole('button',{name:'Behåll utkastet'}).click();await expect(ws(page).getByText('Ändringar ännu inte publicerade',{exact:true})).toBeVisible();
 });

 test('AE8 409 sparar inget och inmatningen står kvar',async({page})=>{
  await open(page);
  await page.evaluate(()=>window.__tjanst.failNext('plan/kommando',{status:409,code:'tjanst_revision_conflict'}));
  await matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Lärartid VT (timmar)').fill('40');await dialog.getByLabel('Kommentar (valfri)').fill('Syntetisk kommentar');
  await dialog.getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Underlaget har ändrats. Dina uppgifter finns kvar. Hämta aktuellt underlag och bekräfta ditt val på nytt.');
  // Användarprov 2026-10-27: ett val får inte ge en falsk felruta om formulärfel.
  await expect(dialog.getByText('Formuläret innehåller fel. Rätta de markerade fälten.')).toHaveCount(0);
  await expect(dialog.getByLabel('Lärartid VT (timmar)')).toHaveValue('40');await expect(dialog.getByLabel('Kommentar (valfri)')).toHaveValue('Syntetisk kommentar');
  await dialog.getByRole('button',{name:'Hämta aktuellt läge'}).click();
  await expect(dialog.getByLabel('Lärartid VT (timmar)')).toHaveValue('40');
  await dialog.getByRole('button',{name:'Stäng utan att spara'}).click();
  await expect(matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'})).toBeVisible();
  expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('tjanst:')).length)).toBe(0);
 });

 test('AE8 okänt utfall kontrolleras via status med samma commandId',async({page})=>{
  await open(page);
  await page.evaluate(()=>window.__tjanst.failNext('plan/kommando','lost'));
  await matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();
  await expect(ws(page).getByText('Tjänsteraden är sparad: Cecilia Dahl, Matematik 1c, TE26A, HT 50 h · VT 50 h.')).toBeVisible();
  const sent=(await commands(page)).filter(c=>c.body.action==='save_row');expect(sent).toHaveLength(1);
  const status=await page.evaluate(()=>window.__tjanst.reads.filter(r=>r.path.endsWith('/plan/status')));
  expect(status).toHaveLength(1);expect(status[0].body.command).toEqual({family:'plan',commandId:sent[0].body.commandId,action:'save_row',target:{unitId:'51a50000-0000-4000-8000-000000000003',schoolYear:2026,versionId:null,personId:null}});
  expect(JSON.stringify(status[0].body)).not.toContain('teacherVt');
 });

 test('AE8 okänt utfall efter omladdning läses via status, inte ny skrivning',async({page})=>{
  await open(page);
  await page.evaluate(()=>{window.__tjanst.failNext('plan/kommando','network');window.__tjanst.failNext('plan/status','network');});
  await matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Det gick inte att avgöra om ändringen sparades. Hämta aktuellt läge innan du försöker igen.');
  const journal=await page.evaluate(()=>Object.entries(sessionStorage).filter(([k])=>k.startsWith('tjanst:')).map(([,v])=>v));
  expect(journal).toHaveLength(1);expect(journal[0]).not.toMatch(/Cecilia|teacherVt|3000/);
  await dialog.getByRole('button',{name:'Stäng utan att spara'}).click();
  await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();
  await expect(ws(page).getByRole('button',{name:'Kontrollera sparstatus'})).toBeVisible();
  page.removeAllListeners('dialog');page.on('dialog',d=>void d.accept());
  await page.reload();
  await expect(ws(page).getByText('Ändringen sparades inte. Gör om ändringen om den behövs.')).toBeVisible();
  expect((await commands(page)).length).toBe(0);
  expect(await page.evaluate(()=>window.__tjanst.reads.filter(r=>r.path.endsWith('/plan/status')).length)).toBe(1);
 });

 test('lägg till lärare och lägg upp ny lärare',async({page})=>{
  await open(page);
  await ws(page).getByRole('button',{name:'Lägg till lärare i fördelningen'}).click();
  let dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Välj David Ek',exact:true}).click();
  await dialog.getByRole('button',{name:'Lägg till läraren'}).click();
  await expect(ws(page).getByText('David Ek är tillagd i fördelningen.')).toBeVisible();
  await expect(matrix(page).getByRole('columnheader',{name:/David Ek/})).toContainText('Andel här 50 %');
  await ws(page).getByRole('button',{name:'Lägg upp ny lärare'}).click();
  dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Lägg upp läraren'}).click();
  await expect(dialog.getByText('Ange förnamn.')).toBeVisible();await expect(dialog.getByText('Ange efternamn.')).toBeVisible();
  await dialog.getByLabel('Förnamn').fill('Erik');await dialog.getByLabel('Efternamn').fill('Fors');await dialog.getByRole('button',{name:'Lägg upp läraren'}).click();
  await expect(ws(page).getByText('Erik Fors är upplagd som ny lärare. Huvudmannen kompletterar anställning och andel.')).toBeVisible();
  const sent=(await commands(page)).find(c=>c.path.endsWith('/personal/kommando'))!;
  expect(sent.body).toMatchObject({action:'create_draft_teacher',expectedRevision:0,payload:{unitId:'51a50000-0000-4000-8000-000000000003',givenName:'Erik',familyName:'Fors',draftNote:''}});
 });

 test('D-24 äldre publicerad version visas skrivskyddad i sin helhet',async({page})=>{
  await open(page);
  await ws(page).getByRole('button',{name:'Historik',exact:true}).click();
  await ws(page).getByLabel('Historisk publicering').selectOption({label:'Version 1 · publicerad 2026-06-15'});
  await expect(ws(page).getByText('Du läser version 1 skrivskyddat, publicerad 2026-06-15 av Rektor Syntetisk. Lärarna ser den här versionen.')).toBeVisible();
  const read=await page.evaluate(()=>window.__tjanst.reads.filter(r=>r.path.endsWith('/plan/lasa')).at(-1));expect(read!.body.versionId).toBe('51a50000-0000-4000-8000-000000000601');
  await expect(matrix(page).getByRole('button',{name:/Ändra\.$|Tilldela\.$/})).toHaveCount(0);
  await expect(matrix(page).getByLabel('Anna Andersson, Engelska 5, TE26A: 50 h. Ändra.')).toBeVisible();
  await expect(matrix(page).getByRole('columnheader',{name:/Cecilia Dahl/})).toHaveCount(0);
  await expect(ws(page).getByRole('button',{name:/Lägg till lärare|Lägg till specialuppdrag|Ändra i ny version/})).toHaveCount(0);
  await ws(page).getByRole('tab',{name:'Specialuppdrag'}).click();
  await expect(ws(page).getByRole('region',{name:'Specialuppdrag'}).getByRole('row').filter({hasText:'Mentor'})).toBeVisible();
  await expect(ws(page).getByRole('button',{name:/Ändra uppdraget/})).toHaveCount(0);
  await ws(page).getByRole('tab',{name:'Per lärare'}).click();
  await expect(ws(page).getByRole('region',{name:'Per lärare'}).locator('dl.tjanst-facts')).toContainText('UndervisningHT 50 h · VT 0 h · Läsår 50 h');
  await ws(page).getByRole('button',{name:'Tillbaka till planeringen'}).click();
  await expect(ws(page).getByText(/Du läser version 1/)).toHaveCount(0);await expect(ws(page).getByRole('button',{name:'Lägg till specialuppdrag'})).toBeVisible();
 });

 test('skolbyte tömmer vyn innan nytt svar och visar bara serverns skola',async({page})=>{
  await open(page);
  await expect(matrix(page).getByRole('columnheader',{name:/Anna Andersson/})).toBeVisible();
  await page.evaluate(()=>window.__tjanst.holdNext('plan/lasa'));
  await page.getByRole('button',{name:'Byt skola'}).click();
  await expect(ws(page).getByText('Hämtar tjänstefördelningen…')).toBeVisible();
  await expect(ws(page).getByText('Anna Andersson')).toHaveCount(0);await expect(ws(page).getByText('Syntetiska gymnasiet')).toHaveCount(0);
  await page.evaluate(()=>window.__tjanst.release());
  await expect(matrix(page).getByRole('columnheader',{name:/Greta Grön/})).toBeVisible();
  await expect(ws(page).getByText('PLANERING · Andra syntetiska skolan')).toBeVisible();
  await ws(page).getByRole('tab',{name:'Per lärare'}).click();
  await expect(ws(page).getByRole('region',{name:'Per lärare'})).toContainText('Andel här40 %');
  await expect(ws(page).getByText(/På andra skolor/)).toHaveCount(0);
 });

 test('matris och per lärare saknar kapacitetsord',async({page})=>{
  await open(page);
  const banned=/över|ledig|kapacitet/i;
  expect(await matrix(page).textContent()).not.toMatch(banned);
  for(const name of await matrix(page).getByRole('button').evaluateAll(n=>n.map(x=>x.getAttribute('aria-label')??'')))expect(name).not.toMatch(banned);
  await ws(page).getByRole('tab',{name:'Per lärare'}).click();
  for(const teacher of ['Anna Andersson','Bertil Berg','Cecilia Dahl']){
   await ws(page).getByLabel('Lärare',{exact:true}).selectOption({label:teacher});
   expect(await ws(page).getByRole('region',{name:'Per lärare'}).textContent()).not.toMatch(banned);
  }
 });

 test('UI Matris, empty: fördelning utan rader, skola utan kopplade klasser och Alla behöriga skolor',async({page})=>{
  await open(page,'?data=tom');
  await expect(ws(page).getByText('Pågående planering',{exact:true})).toBeVisible();
  await expect(ws(page).getByText('Välj ett behov i matrisen och välj lärare på raden. Inga lärarval är förifyllda.')).toBeVisible();
  await expect(matrix(page).getByRole('button',{name:'Vakant, Matematik 1c, TE26A: ingen tid. Tilldela.'})).toBeVisible();
  await open(page,'?data=utan-klasser');
  await expect(ws(page).getByText('Ingen klass på skolan har en timplan för läsåret 26/27. Koppla klasserna till timplaner först. En gymnasieklass behöver en koppling för varje läsår, även i årskurs 2 och 3.')).toBeVisible();
  for(const name of ['Klasskopplingar för gymnasiet','Klasskopplingar för GR och IM'])await expect(ws(page).locator('.tjanst-state').getByRole('button',{name})).toBeVisible();
  await page.goto(url+'?skola=alla');
  await expect(ws(page).getByText('Välj en skola i planeringsvalet. En tjänstefördelning gäller en skola.')).toBeVisible();
  expect(await page.evaluate(()=>window.__tjanst.reads.length)).toBe(0);
 });

 test('UI Matris, loading: termins- och filterbyte läser inte om; vid omläsning står innehållet kvar inaktivt',async({page})=>{
  await open(page);
  // 05.1-32: termins- och filterbyte läser inte om; bara Hämta aktuellt läge (och ändringar) gör det.
  const reads=()=>page.evaluate(()=>window.__tjanst.reads.filter(r=>r.path.endsWith('/plan/lasa')).length),before=await reads();
  await ws(page).getByRole('button',{name:'HT',exact:true}).click();await ws(page).getByLabel('Klass').selectOption({label:'TE26A'});
  await ws(page).getByLabel('Lins',{exact:true}).selectOption('ofordelat');await ws(page).getByLabel('Lins',{exact:true}).selectOption('alla');await ws(page).getByLabel('Klass').selectOption('');
  await expect(ws(page).getByText('Hämtar tjänstefördelningen…')).toHaveCount(0);expect(await reads()).toBe(before);
  await page.evaluate(()=>window.__tjanst.holdNext('plan/lasa'));
  await ws(page).getByRole('button',{name:'Hämta aktuellt läge',exact:true}).click();
  await expect(ws(page)).toHaveAttribute('aria-busy','true');await expect(ws(page).getByText('Hämtar tjänstefördelningen…')).toBeVisible();
  await expect(page.locator('.tjanst-content')).toHaveAttribute('inert');await expect(page.locator('.tjanst-matrix')).toBeVisible();
  await page.evaluate(()=>window.__tjanst.release());
  await expect(ws(page)).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.tjanst-matrix caption')).toHaveText('Tjänstefördelning Syntetiska gymnasiet läsåret 26/27, HT');
  expect(new URL(page.url()).searchParams.get('termin')).toBe('ht');
  // Klassfiltret gäller direkt utan omläsning (05.1-32).
  const readsBeforeClass=await reads();await ws(page).getByLabel('Klass',{exact:true}).selectOption({label:'EK26'});
  await expect(matrix(page).getByRole('rowheader',{name:/^TE26A/})).toHaveCount(0);await expect(ws(page)).toHaveAttribute('aria-busy','false');expect(await reads()).toBe(readsBeforeClass);
  expect(new URL(page.url()).search).not.toContain(UNIT_A);
  await page.goBack();await expect(page.locator('.tjanst-matrix caption')).toHaveText(/Hela läsåret$/);
 });

 // 05.1-32: termin och filter läser inte om; felen framkallas med Hämta aktuellt läge.
 test('UI Matris, error: nätverksfel, 403, loggfel och context_changed har egna texter',async({page})=>{
  await page.goto(url+'?forsta=natverk');
  const alert=ws(page).getByRole('alert');
  await expect(alert).toContainText('Tjänsten kunde inte nås. Kontrollera anslutningen och försök igen.');
  await alert.getByRole('button',{name:'Hämta tjänstefördelningen igen'}).click();
  await expect(matrix(page)).toBeVisible();
  await page.evaluate(()=>window.__tjanst.failNext('plan/lasa',{status:503,code:'audit_unavailable'}));
  await ws(page).getByRole('button',{name:'Hämta aktuellt läge',exact:true}).click();
  await expect(alert).toContainText('Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.');await expect(alert).toContainText('Referens: syntetisk-ref-1');
  await expect(matrix(page)).toBeVisible();
  await page.evaluate(()=>window.__tjanst.failNext('plan/lasa',{status:403,code:'forbidden'}));
  await ws(page).getByRole('button',{name:'Hämta aktuellt läge',exact:true}).click();
  await expect(alert).toContainText('Ditt aktuella uppdrag tillåter inte att läsa tjänstefördelningen för den här skolan.');
  await expect(page.locator('.tjanst-matrix')).toHaveCount(0);await expect(ws(page).getByText('Anna Andersson')).toHaveCount(0);
  await open(page);
  await page.evaluate(()=>window.__tjanst.failNext('plan/lasa',{status:409,code:'context_changed'}));
  await ws(page).getByRole('button',{name:'Hämta aktuellt läge',exact:true}).click();
  await expect(alert).toContainText('Uppdraget har ändrats. Ladda om arbetsytan.');await expect(page.locator('.tjanst-matrix')).toHaveCount(0);
 });

 test('UI Matris, populated: klassgrupper, kursrader, lärarkolumner, Vakant och fotraden',async({page})=>{
  await open(page);
  for(const header of ['Kurs · klass','Behov','Fördelat','Avvikelse','Vakant'])await expect(matrix(page).getByRole('columnheader',{name:header,exact:true})).toBeVisible();
  const heads=await matrix(page).locator('thead th.tjanst-teacher .tjanst-teacher-name').allTextContents();expect(heads).toEqual(['Anna Andersson','Bertil Berg','Cecilia Dahl']);
  await expect(matrix(page).getByRole('columnheader',{name:/Cecilia Dahl/})).toContainText('Ny lärare');
  for(const g of ['TE26A · Teknikprogrammet version 2','EK26 · Ekonomiprogrammet version 1','IMSPR · Språkintroduktion version 1'])await expect(matrix(page).getByRole('rowheader',{name:g})).toBeVisible();
  await expect(matrix(page).getByRole('button',{name:'Vakant, Svenska som andraspråk 1, IMSPR: 72 h. Ändra.'})).toBeVisible();
  await expect(matrix(page).getByRole('rowheader',{name:/^Svenska 1/}).first()).toContainText('Samläsning');
  for(const [label,value] of [['Undervisning','150 h'],['Specialuppdrag','40 h'],['Totalt','190 h']])await expect(footer(page,label,'Anna Andersson')).toHaveText(value);
  await expect(matrix(page).locator('tfoot tr').first().locator('td.tjanst-vacant')).toHaveText('72 h');
  await expect(matrix(page).locator('caption')).toHaveText('Tjänstefördelning Syntetiska gymnasiet läsåret 26/27, Hela läsåret');
  expect(await matrix(page).locator('thead th.tjanst-teacher').evaluateAll(n=>n.every(x=>x.getAttribute('scope')==='col'))).toBe(true);
  expect(await matrix(page).locator('tbody th.tjanst-first').evaluateAll(n=>n.every(x=>x.getAttribute('scope')==='row'))).toBe(true);
 });

 test('UI Matris, partial: koppling saknas utan nollor, underlag saknas och avvikelse bara när den inte är noll',async({page})=>{
  await open(page);
  await expect(matrix(page).getByRole('rowheader',{name:'NA26B · koppling saknas'})).toBeVisible();
  const english=matrix(page).getByRole('row').filter({has:page.getByRole('rowheader',{name:/^Engelska 5/})});
  await expect(english.locator('td').nth(2)).toHaveText('');
  const math=matrix(page).getByRole('row').filter({has:page.getByRole('rowheader',{name:/^Matematik 1c/})});
  await expect(math.locator('td').nth(2)).toHaveText('−100 h');
  await ws(page).getByRole('tab',{name:'Per lärare'}).click();
  await expect(ws(page).getByRole('region',{name:'Per lärare'})).toContainText('Schemalagd tidUnderlag saknasVisas när schemat finns i Skolplattformen.');
 });

 test('UI Matris, zero-one-many: 1 lärare och flera lärare på samma kurs',async({page})=>{
  await open(page);
  await expect(matrix(page).getByRole('rowheader',{name:'TE26A · Teknikprogrammet version 2'})).toContainText('200 av 300 h · 2 lärare');
  await expect(matrix(page).getByRole('button',{name:'Anna Andersson, Engelska 5, TE26A: 50 h. Ändra.'})).toBeVisible();
  await expect(matrix(page).getByRole('button',{name:'Bertil Berg, Engelska 5, TE26A: 50 h. Ändra.'})).toBeVisible();
  await expect(matrix(page).getByRole('row').filter({has:page.getByRole('rowheader',{name:/^Engelska 5/})}).locator('td').nth(1)).toHaveText('100 h');
  await page.getByRole('button',{name:'Byt skola'}).click();
  await expect(matrix(page).getByRole('rowheader',{name:'SA26C · Samhällsvetenskapsprogrammet version 1'})).toContainText('50 av 50 h · 1 lärare');
 });

 test('UI Per klass/Per lärare/Specialuppdrag/Per kurs, empty: var sin tomtext',async({page})=>{
  await open(page,'?tjvy=klass');
  await ws(page).getByLabel('Klass',{exact:true}).selectOption({label:'NA26B'});
  await expect(ws(page).getByText('Klassen har ingen timplan för läsåret 26/27. Behovet är okänt, inte noll.')).toBeVisible();
  await ws(page).getByRole('tab',{name:'Per lärare'}).click();await ws(page).getByLabel('Lärare',{exact:true}).selectOption({label:'Cecilia Dahl'});
  await expect(ws(page).getByText('Cecilia Dahl har ingen undervisning eller något uppdrag i den här versionen.')).toBeVisible();
  await ws(page).getByRole('tab',{name:'Per kurs/ämne'}).click();
  await expect(ws(page).getByText('Markera rader i olika klasser för att koppla dem till en samläsning.')).toBeVisible();
  await open(page,'?data=utan-uppdrag&tjvy=special');
  await expect(ws(page).getByText('Inga specialuppdrag ännu.')).toBeVisible();
 });

 test('UI Per klass/Per lärare, populated: täckning per kurs med alla lärare och summor per lärare',async({page})=>{
  await open(page,'?tjvy=klass');
  const view=ws(page).getByRole('region',{name:'Per klass'});
  await expect(view.locator('dl')).toContainText('TimplanTeknikprogrammet · version 2');await expect(view.locator('dl')).toContainText('Täckning200 av 300 h · 2 lärare');
  await expect(view.getByRole('row').filter({hasText:'Engelska 5'})).toContainText('Anna Andersson · HT 50 h · VT 0 h');
  await expect(view.getByRole('row').filter({hasText:'Engelska 5'})).toContainText('Bertil Berg · HT 0 h · VT 50 h');
  await ws(page).getByRole('tab',{name:'Per lärare'}).click();await ws(page).getByLabel('Lärare',{exact:true}).selectOption({label:'Bertil Berg'});
  const teacher=ws(page).getByRole('region',{name:'Per lärare'});
  await expect(teacher.locator('dl')).toContainText('UndervisningHT 50 h · VT 100 h · Läsår 150 h');await expect(teacher.locator('dl')).toContainText('Andel här100 %');
  await expect(teacher.getByRole('row').filter({hasText:'Svenska 1'})).toContainText('Samläsning med EK26');
  await expect(teacher.getByText(/^Personal-ID 51a50000-0000-4000-8000-000000000102$/)).toBeVisible();
  expect(new URL(page.url()).search).not.toContain('000000000102');
 });

 test('UI Per kurs (samläsning), zero-one-many: minst två rader i två klasser',async({page})=>{
  await open(page,'?tjvy=kurs');
  const course=ws(page).getByRole('region',{name:'Per kurs/ämne'});
  await course.getByRole('checkbox',{name:'Markera Engelska 5 TE26A, Anna Andersson'}).check();
  await course.getByRole('checkbox',{name:'Markera Engelska 5 TE26A, Bertil Berg'}).check();
  await expect(course.getByText('2 rader markerade')).toBeVisible();
  await course.getByRole('button',{name:'Koppla till samläsning…'}).click();
  await expect(course.getByText('Raderna gäller samma klass (TE26A). En samläsning behöver rader i minst två olika klasser. Två rader på samma behov i en klass är dubbel fördelning; ta bort den ena i matrisen.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await course.getByRole('button',{name:'Avmarkera alla'}).click();await expect(course.getByText(/rader markerade|rad markerad/)).toHaveCount(0);
 });

 test('UI Per kurs (samläsning), error: redan kopplad rad, för få rader och 409',async({page})=>{
  await open(page,'?tjvy=kurs');
  const course=ws(page).getByRole('region',{name:'Per kurs/ämne'});
  await course.getByRole('checkbox',{name:'Markera Svenska 1 TE26A, Bertil Berg'}).check();
  await course.getByRole('checkbox',{name:'Markera Matematik 1b EK26, Anna Andersson'}).check();
  await course.getByRole('button',{name:'Koppla till samläsning…'}).click();
  await expect(course.getByRole('alert')).toHaveText('Svenska 1 TE26A ingår redan i samläsningen Svenska 1 TE26A + EK26. Lös upp den först eller ändra den samläsningen.');
  await course.getByRole('checkbox',{name:'Markera Svenska 1 TE26A, Bertil Berg'}).uncheck();
  await course.getByRole('button',{name:'Koppla till samläsning…'}).click();
  await expect(course.getByRole('alert')).toHaveText('Markera minst två rader i minst två olika klasser.');
  await course.getByRole('checkbox',{name:'Markera Engelska 5 TE26A, Anna Andersson'}).check();
  await page.evaluate(()=>window.__tjanst.failNext('plan/kommando',{status:409,code:'tjanst_revision_conflict'}));
  await course.getByRole('button',{name:'Koppla till samläsning…'}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Namn').fill('Syntetisk samläsning');
  await dialog.getByRole('button',{name:'Spara samläsningen'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Underlaget har ändrats. Dina uppgifter finns kvar. Hämta aktuellt underlag och bekräfta ditt val på nytt.');
  await expect(dialog.getByLabel('Namn')).toHaveValue('Syntetisk samläsning');
 });

 test('UI Dialoger, loading: Sparar… i knappen, fälten inaktiva och stängning spärrad',async({page})=>{
  await open(page);
  await page.evaluate(()=>window.__tjanst.holdNext('plan/kommando'));
  await matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();
  await expect(dialog.getByText('Sparar…',{exact:true})).toBeVisible();await expect(dialog.getByRole('button',{name:'Välj Cecilia Dahl',exact:true})).toBeDisabled();
  await expect(dialog.getByLabel('Lärartid HT (timmar)')).toBeDisabled();await expect(dialog.getByRole('button',{name:'Stäng utan att spara'})).toBeDisabled();
  await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
  await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toHaveCount(0);
  await page.evaluate(()=>window.__tjanst.release());
  await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeEnabled();
 });

 test('UI Dialoger, error: fältfel, 400, loggfel och MFA har egna texter och inmatningen bevaras',async({page})=>{
  await open(page);
  await matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  const dialog=page.getByRole('dialog'),ht=dialog.getByLabel('Lärartid HT (timmar)'),choose=dialog.getByRole('button',{name:'Välj Cecilia Dahl',exact:true});
  await ht.fill('abc');await choose.click();expect((await commands(page)).length).toBe(0);
  await expect(dialog.getByRole('alert').first()).toHaveText('Formuläret innehåller fel. Rätta de markerade fälten.');
  await expect(ht).toHaveAttribute('aria-invalid','true');await expect(ht).toHaveAccessibleDescription(/Ange tid i timmar, till exempel 40 eller 37,5\./);
  await ht.fill('-5');await choose.click();await expect(dialog.getByText('Tiden kan inte vara negativ.')).toBeVisible();
  await ht.fill('37,5');
  for(const [failure,text] of [[{status:400,code:'tjanst_duplicate_row'},'Cecilia Dahl har redan en rad för Matematik 1c i TE26A. Ändra den befintliga raden.'],
   [{status:503,code:'audit_unavailable'},'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig. Dina uppgifter finns kvar i formuläret.'],
   [{status:403,code:'mfa_required'},'Att ändra tjänstefördelningen kräver verifiering med engångskod.'],
   [{status:403,code:'forbidden'},'Ditt aktuella uppdrag tillåter inte ändringen.']] as const){
   await page.evaluate(f=>window.__tjanst.failNext('plan/kommando',f),failure);
   await choose.click();
   await expect(dialog.getByRole('alert')).toContainText(text);await expect(ht).toHaveValue('37,5');
  }
  await choose.click();
  await expect(ws(page).getByText('Tjänsteraden är sparad: Cecilia Dahl, Matematik 1c, TE26A, HT 37 h 30 min · VT 50 h.')).toBeVisible();
  expect((await commands(page)).filter(c=>c.body.action==='save_row').at(-1)!.body.payload.teacherHt).toBe(2250);
 });

 test('UI Dialoger, partial: valfria fält får vara tomma och tid krävs för minst en termin',async({page})=>{
  await open(page);
  await matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  const dialog=page.getByRole('dialog'),choose=dialog.getByRole('button',{name:'Välj Cecilia Dahl',exact:true});
  await dialog.getByLabel('Lärartid HT (timmar)').fill('0');await dialog.getByLabel('Lärartid VT (timmar)').fill('');
  await choose.click();
  await expect(dialog.getByText('Ange tid för minst en termin.')).toBeVisible();expect((await commands(page)).length).toBe(0);
  await dialog.getByLabel('Lärartid VT (timmar)').fill('10');await choose.click();
  await expect(ws(page).getByText('Tjänsteraden är sparad: Cecilia Dahl, Matematik 1c, TE26A, HT 0 h · VT 10 h.')).toBeVisible();
  expect((await commands(page))[0].body.payload.comment).toBe('');
  await ws(page).getByRole('button',{name:'Lägg till specialuppdrag'}).click();
  const special=page.getByRole('dialog');await special.getByLabel('Typ').selectOption('programansvar');
  await expect(special.getByLabel('Klass (valfri)')).toHaveCount(0);
  await special.getByRole('button',{name:'Välj Vakant',exact:true}).click();await special.getByLabel('Tid VT (timmar)').fill('5');
  await special.getByRole('button',{name:'Spara specialuppdraget'}).click();
  await expect(ws(page).getByText('Specialuppdraget Programansvar är sparat för Vakant.')).toBeVisible();
  expect((await commands(page)).at(-1)!.body.payload).toMatchObject({kind:'programansvar',personId:null,classId:null,comment:''});
 });

 test('UI Fastställ-panelen, populated: stegrad, hinder, versionshistorik och återkoppling',async({page})=>{
  await open(page,'?hinder=1&aterkoppling=1');
  await ws(page).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  const panel=ws(page).getByRole('region',{name:'Fastställ och publicera'});
  await expect(panel).toContainText('Ändringarna är ännu inte publicerade.');
  await expect(panel.getByText('1 punkt behöver åtgärdas innan du kan fastställa.')).toBeVisible();await expect(panel.getByText('En tjänsterad bygger på en äldre timplansversion.')).toBeVisible();
  await expect(panel.getByRole('button',{name:'Fastställ och publicera…'})).toBeDisabled();
  await expect(panel.getByRole('button',{name:'Ta bort opublicerade ändringar…'})).toBeEnabled();
  await expect(ws(page).getByRole('button',{name:'Historik',exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Lärarnas återkoppling (1)'}).click();
  await expect(panel.getByText('Version 1 · Kvitterad av 1 av 2 lärare')).toBeVisible();await expect(panel.getByText(/Anna Andersson · 2026-06-16/)).toBeVisible();
  await expect(panel).not.toContainText(/facklig/i);
  await panel.getByRole('button',{name:'Ta bort opublicerade ändringar…'}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.getByText('Ändringarna som ännu inte publicerats tas bort. Lärarna ser fortfarande version 1.')).toBeVisible();
  await dialog.getByRole('button',{name:'Ta bort utkastet'}).click();
  await expect(ws(page).getByText('Utkastet version 2 är borttaget.')).toBeVisible();await expect(ws(page).getByText('Publicerad',{exact:true}).first()).toBeVisible();
 });

 test('UI Fastställ-panelen, error: 403, 409, MFA och okänt utfall; klar först efter kvitto',async({page})=>{
  await open(page);
  await ws(page).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  await ws(page).getByRole('button',{name:'Fastställ och publicera…'}).click();
  const dialog=page.getByRole('dialog'),go=dialog.getByRole('button',{name:'Fastställ och publicera'});
  await page.evaluate(()=>{window.__tjanst.failNext('plan/publicera',{status:403,code:'forbidden'});window.__tjanst.failNext('plan/publicera',{status:409,code:'tjanst_content_changed'});});
  await go.click();await expect(dialog.getByRole('alert')).toContainText('Bara rektor kan fastställa och publicera tjänstefördelningen.');
  await go.click();await expect(dialog.getByRole('alert')).toContainText('Underlaget har ändrats. Dina uppgifter finns kvar. Hämta aktuellt underlag och bekräfta ditt val på nytt.');
  await go.click();await expect(dialog.getByRole('alert')).toContainText('Att fastställa och publicera kräver verifiering med engångskod.');
  await expect(ws(page).getByText(/är fastställd och publicerad/)).toHaveCount(0);
  await page.evaluate(()=>{window.__tjanst.mfaVerified=true;window.__tjanst.failNext('plan/publicera','lost');window.__tjanst.holdNext('plan/status');});
  await go.click();
  await expect(dialog.getByText('Svaret uteblev. Vi kontrollerar om ändringen sparades.')).toBeVisible();await expect(dialog.getByRole('button',{name:'Publicerar…'})).toBeDisabled();
  await expect(ws(page).getByText(/är fastställd och publicerad/)).toHaveCount(0);
  await page.evaluate(()=>window.__tjanst.release());
  await expect(ws(page).getByText('Version 2 är fastställd och publicerad. Lärarna ser den i Min tjänst.')).toBeVisible();
 });

 test('tangentbord: ett tabbstopp med piltangenter, Home, End och Enter samt fokus åter efter dialog och borttagning',async({page})=>{
  await open(page);
  const tabbable=await matrix(page).locator('.tjanst-cell button').evaluateAll(n=>n.filter(x=>x.getAttribute('tabindex')==='0').length);expect(tabbable).toBe(1);
  const first=matrix(page).getByRole('button',{name:'Anna Andersson, Matematik 1c, TE26A: ingen tid. Tilldela.'});
  await first.focus();
  await page.keyboard.press('ArrowRight');await expect(matrix(page).getByRole('button',{name:'Bertil Berg, Matematik 1c, TE26A: ingen tid. Tilldela.'})).toBeFocused();
  await page.keyboard.press('End');await expect(matrix(page).getByRole('button',{name:'Vakant, Matematik 1c, TE26A: ingen tid. Tilldela.'})).toBeFocused();
  await page.keyboard.press('Home');await expect(first).toBeFocused();
  await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
  const english=matrix(page).getByRole('button',{name:'Anna Andersson, Engelska 5, TE26A: 50 h. Ändra.'});await expect(english).toBeFocused();
  expect(await english.getAttribute('tabindex')).toBe('0');expect(await first.getAttribute('tabindex')).toBe('-1');
  await page.keyboard.press('Enter');const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'Ändra tjänsteraden'})).toBeVisible();
  await expect(dialog.getByLabel('Lärartid HT (timmar)')).toHaveValue('50');
  await dialog.getByRole('button',{name:'Stäng utan att spara'}).click();await expect(english).toBeFocused();
  await page.keyboard.press('Space');await dialog.getByRole('button',{name:'Ta bort tjänsteraden…'}).click();
  const confirm=page.getByRole('dialog');await expect(confirm.getByRole('button',{name:'Behåll raden'})).toBeFocused();
  await confirm.getByRole('button',{name:'Ta bort tjänsteraden'}).click();
  await expect(ws(page).getByText('Tjänsteraden är borttagen: Anna Andersson, Engelska 5, TE26A.')).toBeVisible();
  await expect(matrix(page).getByRole('rowheader',{name:'TE26A · Teknikprogrammet version 2'})).toBeFocused();
 });

 test('redigeringsläge stängs när fönstret krymper och osparad inmatning skyddas',async({page})=>{
  await open(page);
  await matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  await page.getByRole('dialog').getByLabel('Lärartid VT (timmar)').fill('12');
  const size=page.viewportSize()!;await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.tjanst-matrix')).toHaveCount(0);
  await expect(ws(page).getByText('Redigeringen är stängd på den här skärmstorleken. Dina uppgifter finns kvar när du öppnar vyn på dator igen.')).toBeVisible();
  await expect(page.locator('[data-unsaved]')).toHaveAttribute('data-unsaved','true');
  await page.setViewportSize(size);
  await expect(page.getByRole('dialog').getByLabel('Lärartid VT (timmar)')).toHaveValue('12');
 });

 test('pekytor: minst 44 px på dator',async({page})=>{
  await open(page,'?aterkoppling=1');
  await ws(page).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  const small=await ws(page).locator('button:visible,select:visible,[role=tab]:visible,.tjanst-mark,.mandate-check').evaluateAll(n=>n.map(x=>{const r=x.getBoundingClientRect();return {name:x.getAttribute('aria-label')??x.textContent,h:r.height,w:r.width};}).filter(x=>x.h<44||x.w<44));
  expect(small).toEqual([]);
  await ws(page).getByRole('tab',{name:'Per kurs/ämne'}).click();
  expect(await ws(page).locator('.tjanst-mark').evaluateAll(n=>n.every(x=>x.getBoundingClientRect().height>=44&&x.getBoundingClientRect().width>=44))).toBe(true);
  await ws(page).getByRole('tab',{name:'Matris'}).click();
  await matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  expect(await page.getByRole('dialog').locator('button,input,select,textarea').evaluateAll(n=>n.every(x=>x.getBoundingClientRect().height>=44))).toBe(true);
 });

 test('UI Matris, overflow: 40 lärare × 300 rader rullar i behållaren med klistrade delar',async({page},info)=>{
  await open(page,'?data=stor');
  await expect(matrix(page).locator('thead th.tjanst-teacher')).toHaveCount(40);await expect(matrix(page).locator('tbody th[scope=row]')).toHaveCount(300);
  await noOverflow(page);
  const scroller=page.locator('.tjanst-matrix-scroll');
  await scroller.evaluate(el=>{el.scrollTop=el.scrollHeight/2;el.scrollLeft=el.scrollWidth;});
  const box=(await scroller.boundingBox())!;
  const head=(await matrix(page).getByRole('columnheader',{name:/Lärare40 Efternamn40/}).boundingBox())!;
  expect(Math.abs(head.y-box.y)).toBeLessThan(3);
  const firstCol=(await matrix(page).locator('tfoot th').first().boundingBox())!;
  expect(Math.abs(firstCol.x-box.x)).toBeLessThan(3);expect(Math.abs(firstCol.y+firstCol.height*3-(box.y+box.height))).toBeLessThan(6);
  const visibleRowHeader=await page.evaluate(()=>{const s=document.querySelector('.tjanst-matrix-scroll')!.getBoundingClientRect();const th=[...document.querySelectorAll('.tjanst-matrix tbody th[scope=row]')].find(x=>{const r=x.getBoundingClientRect();return r.top>s.top+100&&r.bottom<s.bottom-150;})!;return th.getBoundingClientRect().left-s.left;});
  expect(Math.abs(visibleRowHeader)).toBeLessThan(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await scroller.screenshot({path:`${SHOTS}/matris-40x300-${info.project.name}.png`});
 });

 test('UI Matris, long-text: långa lärar- och kursnamn bryts utan ellips',async({page},info)=>{
  await open(page,'?data=lang');
  const name=matrix(page).locator('thead .tjanst-teacher-name').filter({hasText:'Maximiliana'});
  await expect(name).toHaveText('Maximiliana Konstantinopelska-Vasaborgsson Ekströmsdotter');
  const m=await name.evaluate(el=>{const cs=getComputedStyle(el),th=el.closest('th')!;return {lines:el.getBoundingClientRect().height/parseFloat(cs.lineHeight),overflow:cs.textOverflow,fits:el.scrollWidth<=el.clientWidth,width:th.getBoundingClientRect().width};});
  expect(m.lines).toBeGreaterThanOrEqual(2);expect(m.overflow).not.toBe('ellipsis');expect(m.fits).toBe(true);expect(m.width).toBeGreaterThanOrEqual(96);
  const course=matrix(page).locator('tbody .tjanst-course').first();
  const c=await course.evaluate(el=>{const cs=getComputedStyle(el);return {lines:el.getBoundingClientRect().height/parseFloat(cs.lineHeight),overflow:cs.textOverflow,fits:el.scrollWidth<=el.clientWidth,width:el.closest('th')!.getBoundingClientRect().width};});
  expect(c.lines).toBeGreaterThanOrEqual(2);expect(c.overflow).not.toBe('ellipsis');expect(c.fits).toBe(true);expect(Math.round(c.width)).toBe(280);
  await expect(ws(page).getByText(/PLANERING · Syntetiska gymnasiet för teknik, naturvetenskap och samhällsvetenskap i Exempelstad/)).toBeVisible();
  await noOverflow(page);
  await page.locator('.tjanst-matrix-scroll').screenshot({path:`${SHOTS}/lang-namn-matris-${info.project.name}.png`});
 });

 test('UI Dialoger, long-text: långa namn och fältfel bryts inom dialogen vid 320 px',async({page},info)=>{
  // Dialoger renderas inte på telefon (D-15). 320 CSS-px prövas som 400 % förstoring av 1280 px (omflödning), med CSS-zoom.
  await page.setViewportSize({width:1280,height:800});
  await open(page,'?data=lang');
  await matrix(page).getByRole('button',{name:/^Maximiliana Konstantinopelska-Vasaborgsson Ekströmsdotter, Matematik 1c med fördjupning.*: ingen tid\. Tilldela\.$/}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Lärartid HT (timmar)').fill('ogiltigt värde med ett mycket långt ord Programmeringsfördjupningsövningstimmar');
  await dialog.getByRole('button',{name:'Välj Vakant',exact:true}).click();await expect(dialog.getByText('Ange tid i timmar, till exempel 40 eller 37,5.')).toBeVisible();
  await page.evaluate(()=>{(document.documentElement.style as CSSStyleDeclaration & {zoom:string}).zoom='4';});
  const r=await dialog.evaluate(el=>({fits:el.scrollWidth<=el.clientWidth,cssWidth:el.getBoundingClientRect().width/4,children:[...el.querySelectorAll('*')].filter(x=>x.getBoundingClientRect().right>el.getBoundingClientRect().right+1).length}));
  expect(r.fits).toBe(true);expect(r.children).toBe(0);expect(r.cssWidth).toBeLessThanOrEqual(320);
  // Granskningsbild: utan zoom med dialogen begränsad till 320 px bredd.
  await page.evaluate(()=>{(document.documentElement.style as CSSStyleDeclaration & {zoom:string}).zoom='';});
  await dialog.evaluate(el=>{(el as HTMLElement).style.maxWidth='320px';});
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await dialog.screenshot({path:`${SHOTS}/lang-namn-dialog-320-${info.project.name}.png`});
 });
});

test.describe('telefon',()=>{
 test.beforeEach(({},info)=>{test.skip(desktop(info.project.name),'Telefonprov.');});

 test('telefon: samläsning i Per klass leder till samläsningen i Per kurs/ämne (05.1-27)',async({page})=>{
  await open(page);
  await ws(page).getByLabel('Vy').selectOption({label:'Per klass'});await ws(page).getByLabel('Klass',{exact:true}).selectOption({label:'TE26A'});
  await ws(page).getByRole('button',{name:'Samläsning med EK26'}).first().click();
  await expect(ws(page).getByLabel('Vy')).toHaveValue('kurs');
  await expect(ws(page).getByRole('region',{name:'Samläsning: Svenska 1 TE26A + EK26'})).toBeFocused();
  await noOverflow(page);
 });

 test('telefon: öppnar Per lärare utan matris och utan redigeringskontroller',async({page},info)=>{
  const errors=await open(page);
  await expect(page.locator('.tjanst-matrix')).toHaveCount(0);await expect(ws(page).getByRole('tab')).toHaveCount(0);
  await expect(ws(page).getByLabel('Vy')).toHaveValue('larare');await expect(ws(page).getByLabel('Vy').locator('option')).toHaveText(['Fördela','Per klass','Per lärare','Specialuppdrag','Per kurs/ämne']);
  await expect(ws(page).getByText('Matrisen och all redigering finns på dator. Här kan du läsa fördelningen.')).toHaveCount(1);
  const editing=/Lägg till|Lägg upp|Ändra uppdraget|Ta bort|Koppla till|Lös upp|Ändra samläsningen|Fastställ och publicera…|Ändra i ny version|Tilldela|Ändra\.$/;
  for(const view of ['Per lärare','Per klass','Specialuppdrag','Per kurs/ämne']){
   await ws(page).getByLabel('Vy').selectOption({label:view});
   expect((await ws(page).getByRole('button').allTextContents()).filter(t=>editing.test(t))).toEqual([]);
   await expect(ws(page).locator('.tjanst-mark')).toHaveCount(0);
   await noOverflow(page);
  }
  await ws(page).getByRole('button',{name:'Publiceringsstatus',exact:true}).click();
  const panel=ws(page).getByRole('region',{name:'Fastställ och publicera'});
  await expect(ws(page).getByRole('button',{name:'Historik',exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:/Fastställ och publicera…|Ta bort utkastet/})).toHaveCount(0);
  await ws(page).getByLabel('Vy').selectOption({label:'Per lärare'});
  await expect(ws(page).getByRole('region',{name:'Per lärare'}).locator('.tjanst-cards').first()).toBeVisible();
  await noOverflow(page);
  await page.screenshot({path:`${SHOTS}/telefon-per-larare-${info.project.name}.png`,fullPage:true});
  expect(errors).toEqual([]);
 });

 test('telefon: per klass och specialuppdrag som kort med långa namn utan sidledsrullning',async({page},info)=>{
  await open(page,'?data=lang&tjvy=klass');
  await expect(ws(page).getByRole('region',{name:'Per klass'}).locator('.tjanst-cards')).toBeVisible();
  await expect(ws(page).getByRole('region',{name:'Per klass'}).locator('table')).toBeHidden();
  await noOverflow(page);
  await ws(page).getByLabel('Vy').selectOption({label:'Specialuppdrag'});
  await expect(ws(page).getByRole('region',{name:'Specialuppdrag'}).locator('.tjanst-cards')).toContainText('Ingen grupp');
  await noOverflow(page);
  await page.screenshot({path:`${SHOTS}/telefon-lang-namn-${info.project.name}.png`,fullPage:true});
 });

 test('pekytor: minst 44 px på telefon',async({page})=>{
  await open(page);
  await ws(page).getByRole('button',{name:'Publiceringsstatus',exact:true}).click();
  const small=await ws(page).locator('button:visible,select:visible').evaluateAll(n=>n.map(x=>{const r=x.getBoundingClientRect();return {name:x.getAttribute('aria-label')??x.textContent,h:r.height,w:r.width};}).filter(x=>x.h<44||x.w<44));
  expect(small).toEqual([]);
 });
});

// ---------- 05.1-29: matrislinser med 40 lärare (syntetisk skola, data=manga) ----------
const headers=(page:Page)=>matrix(page).locator('thead th.tjanst-teacher');
test.describe('linser',()=>{
 test.beforeEach(({},info)=>{test.skip(!desktop(info.project.name),'Matris, fästning och sparade linser finns bara på dator (D-15).');});
 test('relevanta kolumner, ämnesfilter, Visa alla och linser',async({page},info)=>{
  const errors=await open(page,'?data=manga');
  await expect(ws(page).getByText('Visar 40 av 40 lärare')).toBeVisible();await expect(headers(page)).toHaveCount(40);
  await ws(page).getByLabel('Ämne').selectOption('Engelska');
  await expect(ws(page).getByText('Visar 5 av 40 lärare')).toBeVisible();await expect(headers(page)).toHaveCount(5);
  await expect(headers(page).first()).toContainText('Engelskalärare');
  await ws(page).getByRole('button',{name:'Visa alla lärare (40)'}).click();await expect(headers(page)).toHaveCount(40);
  await ws(page).getByRole('button',{name:'Visa relevanta lärare'}).click();await expect(headers(page)).toHaveCount(5);
  await ws(page).getByRole('button',{name:'Rensa filter'}).click();
  await ws(page).getByLabel('Lins',{exact:true}).selectOption('ofordelat');
  await expect(matrix(page).locator('tbody th[scope=row]')).toHaveText(['Fysik 1FYS02 · ämnesrad Fysik 1','Kemi 1KEM05 · ämnesrad Kemi 1']);
  await expect(headers(page)).toHaveCount(0);await expect(ws(page).getByText('Visar 0 av 40 lärare')).toBeVisible();
  await expect(matrix(page).getByRole('button',{name:'Vakant, Fysik 1, MA1: ingen tid. Tilldela.'})).toBeVisible();
  await ws(page).getByLabel('Lins',{exact:true}).selectOption('samlasning');await expect(ws(page).getByText('Inga rader matchar filtret.')).toBeVisible();
  await noOverflow(page);await page.screenshot({path:`${SHOTS}/${info.project.name}-linser-ofordelat.png`});expect(errors).toEqual([]);
 });
 test('fäst lärare i rubriken och i listan, kompakt läge, kvar efter omladdning',async({page},info)=>{
  const errors=await open(page,'?data=manga');
  await ws(page).getByLabel('Ämne').selectOption('Engelska');
  const pin=matrix(page).getByRole('button',{name:/^Fäst .*Engelskalärare1$/});await pin.click();
  await expect(matrix(page).getByRole('button',{name:/^Lossa .*Engelskalärare1$/})).toHaveAttribute('aria-pressed','true');
  await ws(page).getByText('Fäst lärare (1)').click();await ws(page).getByLabel('Sök lärare').fill('Fysiklärare3');
  await ws(page).getByRole('checkbox',{name:/Fysiklärare3$/}).check();
  await expect(headers(page)).toHaveCount(6);await expect(headers(page).filter({hasText:'Fysiklärare3'})).toHaveCount(1);
  await ws(page).getByRole('checkbox',{name:'Kompakta kolumner'}).check();
  const compact=matrix(page).locator('th.tjanst-teacher-compact').first();
  await expect(compact.locator('.tjanst-teacher-initials')).toHaveText(/^[A-ZÅÄÖ]{2}$/);await expect(compact.locator('[data-compact-sum]')).toHaveText(/ h/);
  await compact.locator('.tjanst-pin').focus();await expect(compact.locator('.tjanst-teacher-full')).toBeVisible();
  for(const box of await matrix(page).locator('.tjanst-pin').all()){const b=await box.boundingBox();expect(b!.width).toBeGreaterThanOrEqual(44);expect(b!.height).toBeGreaterThanOrEqual(44);}
  await page.screenshot({path:`${SHOTS}/${info.project.name}-linser-kompakt.png`});
  const stored=await page.evaluate(()=>Object.entries(localStorage).filter(([k])=>k.startsWith('tjanst-lins:v1:')));
  expect(stored).toHaveLength(1);expect(stored[0][1]).not.toMatch(/lärare|Engelska/);
  await page.reload();await expect(ws(page).getByText('Hämtar tjänstefördelningen…')).toHaveCount(0);
  await ws(page).getByLabel('Ämne').selectOption('Engelska');
  await expect(headers(page)).toHaveCount(6);await expect(matrix(page).locator('th.tjanst-teacher-compact')).toHaveCount(6);
  await matrix(page).getByRole('button',{name:/^Lossa .*Fysiklärare3$/}).click();await expect(headers(page)).toHaveCount(5);
  await noOverflow(page);expect(errors).toEqual([]);
 });
 test('sparad lins och trasig lagring',async({page})=>{
  await page.addInitScript(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('tjanst-lins:'))localStorage.setItem(k,'{trasig');});
  const errors=await open(page,'?data=manga');
  await ws(page).getByLabel('Ämne').selectOption('Kemi');await ws(page).getByLabel('Lins',{exact:true}).selectOption('ofordelat');
  await ws(page).getByText('Sparade linser').click();await ws(page).getByLabel('Namn på linsen').fill('Kemi ofördelat');
  await ws(page).getByRole('button',{name:'Spara lins'}).click();await expect(ws(page).getByText('Linsen Kemi ofördelat är sparad.')).toBeVisible();
  await ws(page).getByRole('button',{name:'Rensa filter'}).click();await expect(headers(page)).toHaveCount(40);
  await ws(page).getByLabel('Sparad lins').selectOption('Kemi ofördelat');await ws(page).getByRole('button',{name:'Använd'}).click();
  await expect(ws(page).getByLabel('Ämne')).toHaveValue('Kemi');await expect(ws(page).getByLabel('Lins',{exact:true})).toHaveValue('ofordelat');
  await expect(matrix(page).locator('tbody th[scope=row]')).toHaveText(['Kemi 1KEM05 · ämnesrad Kemi 1']);
  await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('tjanst-lins:'))localStorage.setItem(k,'{trasig');});
  await page.reload();await expect(ws(page).getByText('Hämtar tjänstefördelningen…')).toHaveCount(0);
  await expect(ws(page).getByText('Sparade linser',{exact:true})).toBeVisible();await expect(ws(page).getByText('Fäst lärare',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
 });
 test('piltangenter går över synliga kolumner och Vakant',async({page})=>{
  await open(page,'?data=manga');await ws(page).getByLabel('Ämne').selectOption('Engelska');
  const first=matrix(page).locator('[data-cell="0:0"]');await first.focus();
  for(let i=0;i<5;i++)await page.keyboard.press('ArrowRight');
  await expect(matrix(page).locator('[data-cell="0:5"]')).toBeFocused();await expect(page.locator(':focus')).toHaveAttribute('aria-label',/^Vakant, Engelska 1, MA1/);
 });
});
test.describe('linser telefon',()=>{
 test.beforeEach(({},info)=>{test.skip(desktop(info.project.name),'Telefonprov.');});
 test('läsläge: linsväljaren finns, men inte fästning eller sparade linser',async({page},info)=>{
  const errors=await open(page,'?data=manga&tjvy=kurs');
  await expect(ws(page).getByLabel('Lins',{exact:true})).toBeVisible();
  await expect(ws(page).getByText('Fäst lärare')).toHaveCount(0);await expect(ws(page).getByText('Sparade linser')).toHaveCount(0);
  await ws(page).getByLabel('Lins',{exact:true}).selectOption('ofordelat');
  await noOverflow(page);await page.screenshot({path:`${SHOTS}/${info.project.name}-linser-telefon.png`,fullPage:true});expect(errors).toEqual([]);
 });
});

// ---------- 05.1-30: fördelningsläge (syntetisk skola med 40 lärare, data=manga) ----------
const fordela=(page:Page)=>ws(page).getByRole('region',{name:'Fördela'});
const queueOf=(page:Page)=>fordela(page).getByRole('list',{name:'Ofördelade behov'});
test.describe('fördela',()=>{
 test.beforeEach(({},info)=>{test.skip(!desktop(info.project.name),'Lärare väljs bara på dator (D-15).');});
 test('kö, inget förval, hoppa över, ändrad tid, val med siffra och sökning; kön går vidare',async({page},info)=>{
  const errors=await open(page,'?data=manga&dubbel=1&tjvy=fordela');
  await expect(queueOf(page).getByRole('button')).toHaveText(['Fysik 1 · MA1','Kemi 1 · MA2']);
  await expect(fordela(page).getByRole('heading',{name:'Fysik 1 · MA1'})).toBeVisible();
  await expect(fordela(page).getByText('Förslag utifrån tidigare planering')).toBeVisible();
  expect((await commands(page)).filter(c=>c.body.action==='save_row')).toHaveLength(0);
  await queueOf(page).getByRole('button',{name:'Fysik 1 · MA1'}).focus();await page.keyboard.press('n');
  await expect(fordela(page).getByRole('heading',{name:'Kemi 1 · MA2'})).toBeVisible();
  await page.keyboard.press('ArrowUp');await expect(fordela(page).getByRole('heading',{name:'Fysik 1 · MA1'})).toBeVisible();
  expect((await commands(page)).filter(c=>c.body.action==='save_row')).toHaveLength(0);
  await fordela(page).getByLabel('Lärartid HT (timmar)').fill('40');
  const first=fordela(page).getByRole('list',{name:'Lärare att välja'}).getByRole('listitem').first();
  const name=(await first.getByRole('button').textContent())!.replace(/^Välj /u,'');
  await expect(first.getByText(/^Undervisning nu: HT/u)).toBeVisible();await expect(first.getByText(/^Efter valet: HT .* · Läsår/u)).toBeVisible();
  await expect(first.getByText(/^Förslag: /u)).toBeVisible();await expect(first.getByText('Behörighetsunderlag saknas')).toBeVisible();
  // Varje skäl visas en gång även när läraren har flera rader i klassen.
  const reasons=(await first.getByText(/^Förslag: /u).textContent())!.replace(/^Förslag: /u,'').split(' · ');expect(new Set(reasons).size).toBe(reasons.length);
  await page.screenshot({path:`${SHOTS}/${info.project.name}-fordela-panel.png`});
  await queueOf(page).getByRole('button',{name:'Fysik 1 · MA1'}).focus();await page.keyboard.press('1');
  await expect(ws(page).getByText(`Tjänsteraden är sparad: ${name}, Fysik 1, MA1, HT 40 h · VT 50 h.`)).toBeVisible();
  let sent=(await commands(page)).filter(c=>c.body.action==='save_row');
  expect(sent).toHaveLength(1);expect(sent[0].body.payload).toMatchObject({rowId:null,teacherHt:2400,teacherVt:3000,planningContext:{choice:{kind:'suggestion'}}});
  // HT 40 av 50 h: behovet är delvis fördelat och ligger kvar, men kön går vidare.
  await expect(queueOf(page).getByRole('button')).toHaveText(['Fysik 1 · MA1','Kemi 1 · MA2']);
  await expect(fordela(page).getByRole('heading',{name:'Kemi 1 · MA2'})).toBeFocused();
  // Biologilärare5 har ingen koppling till MA2 eller Kemi: ett manuellt val via sökningen.
  await fordela(page).getByLabel('Sök lärare').fill('Biologilärare5');
  await fordela(page).getByRole('button',{name:/^Välj .*Biologilärare5$/u}).click();
  await expect(queueOf(page).getByRole('button')).toHaveText(['Fysik 1 · MA1']);await expect(fordela(page).getByRole('heading',{name:'Fysik 1 · MA1'})).toBeFocused();
  sent=(await commands(page)).filter(c=>c.body.action==='save_row');
  expect(sent).toHaveLength(2);expect(sent[1].body.payload).toMatchObject({rowId:'51a50000-0000-4000-8000-000000004015',planningContext:{choice:{kind:'manual'}}});
  expect(sent[1].body.payload.personId).not.toBeNull();
  await noOverflow(page);expect(errors).toEqual([]);
 });
 test('fel bevarar tider och behov; Vakant med V efter omförsök',async({page})=>{
  const errors=await open(page,'?data=manga&tjvy=fordela');
  await queueOf(page).getByRole('button',{name:'Kemi 1 · MA2'}).click();
  await fordela(page).getByLabel('Lärartid HT (timmar)').fill('30');
  // Någon annan ändrar underlaget efter att panelen hämtat sitt stöd (som i faktiskt prov 05.1-30).
  await expect(fordela(page).getByText('Förslag utifrån tidigare planering')).toBeVisible();
  await page.evaluate(()=>{window.__tjanst.bump('core');window.__tjanst.holdNext('plan/forhandsvisa');});
  await queueOf(page).getByRole('button',{name:'Kemi 1 · MA2'}).focus();await page.keyboard.press('v');
  await expect(fordela(page).getByRole('alert')).toContainText('Underlaget har ändrats. Dina uppgifter finns kvar.');
  await expect(fordela(page).getByRole('heading',{name:'Kemi 1 · MA2'})).toBeVisible();
  // Efter felet går valet bara att göra ur nytt planeringsstöd; gammalt stöd gav 409 igen i faktiskt prov 05.1-30.
  // Medan det nya stödet hålls inne finns inga val, och V skickar inget.
  await expect(fordela(page).getByText('Hämtar planeringsstöd…')).toBeVisible();await expect(fordela(page).getByRole('button',{name:'Välj Vakant'})).toHaveCount(0);
  const before=(await commands(page)).filter(c=>c.body.action==='save_row').length;
  await queueOf(page).getByRole('button',{name:'Kemi 1 · MA2'}).focus();await page.keyboard.press('v');
  expect((await commands(page)).filter(c=>c.body.action==='save_row')).toHaveLength(before);
  await page.evaluate(()=>window.__tjanst.release());await expect(fordela(page).getByRole('button',{name:'Välj Vakant'})).toBeVisible();
  await expect(fordela(page).getByLabel('Lärartid HT (timmar)')).toHaveValue('30');
  await queueOf(page).getByRole('button',{name:'Kemi 1 · MA2'}).focus();await page.keyboard.press('v');
  await expect(ws(page).getByText('Tjänsteraden är sparad: Vakant, Kemi 1, MA2, HT 30 h · VT 50 h.')).toBeVisible();
  const sent=(await commands(page)).filter(c=>c.body.action==='save_row');
  expect(sent.at(-1)!.body.payload).toMatchObject({rowId:'51a50000-0000-4000-8000-000000004015',personId:null,teacherHt:1800,planningContext:{choice:{kind:'unassigned'}}});
  expect(sent.at(-1)!.body.payload.planningContext.expectedBasisHash).not.toBe(sent.at(-2)!.body.payload.planningContext.expectedBasisHash);
  for(const b of await queueOf(page).getByRole('button').all()){const box=await b.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);}
  expect(errors).toEqual([]);
 });
});
test.describe('fördela delvis',()=>{
 test.beforeEach(({},info)=>{test.skip(!desktop(info.project.name),'Lärare väljs bara på dator (D-15).');});
 test('lärare som redan har tid på behovet kan inte väljas igen (ingen dubblettrad)',async({page})=>{
  const errors=await open(page,'?data=manga&delvis=1&tjvy=fordela');
  await queueOf(page).getByRole('button',{name:'Historia 1 · MA3'}).click();
  const existing=fordela(page).getByRole('region',{name:'Har redan tid på behovet'});
  await expect(existing).toContainText('Historialärare3: HT 50 h · VT 25 h. Ändra raden i matrisen.');
  await expect(fordela(page).getByRole('list',{name:'Lärare att välja'}).getByRole('button',{name:/Historialärare3$/u})).toHaveCount(0);
  await expect(fordela(page).getByText('Förslag utifrån tidigare planering')).toBeVisible();
  await queueOf(page).getByRole('button',{name:'Historia 1 · MA3'}).focus();await page.keyboard.press('1');
  const sent=(await commands(page)).filter(c=>c.body.action==='save_row');expect(sent).toHaveLength(1);
  expect(sent[0].body.payload.personId).not.toBe('51a50000-0000-4000-8000-000000001117');expect(sent[0].body.payload.rowId).toBeNull();
  // 05.1-33 / D-31: den andra läraren på behovet ger frågan om delning direkt; Bestäm senare lämnar hindret.
  const sharing=page.getByRole('dialog',{name:'Hur delar lärarna kursen?'});await expect(sharing).toBeVisible();
  await expect(sharing.getByText('Historialärare3: HT 50 h · VT 25 h')).toBeVisible();
  await sharing.getByRole('button',{name:'Bestäm senare'}).click();await expect(sharing).toHaveCount(0);
  expect((await commands(page)).filter(c=>c.body.action==='save_sharing')).toHaveLength(0);
  expect(errors).toEqual([]);
 });
});
test.describe('fördela telefon',()=>{
 test.beforeEach(({},info)=>{test.skip(desktop(info.project.name),'Telefonprov.');});
 test('läslista över ofördelade behov utan val',async({page},info)=>{
  const errors=await open(page,'?data=manga&tjvy=fordela');
  await expect(fordela(page).getByText('Lärare väljs på dator.')).toBeVisible();
  await expect(queueOf(page).getByRole('listitem')).toHaveText(['MA1Fysik 1 · MA1','MA2Kemi 1 · MA2']);
  await expect(fordela(page).getByRole('button')).toHaveCount(0);
  await noOverflow(page);await page.screenshot({path:`${SHOTS}/${info.project.name}-fordela-telefon.png`,fullPage:true});expect(errors).toEqual([]);
 });
});

// 05.1-33 / D-31: flera lärare på samma behov.
const ANNA='51a50000-0000-4000-8000-000000000101',CECILIA='51a50000-0000-4000-8000-000000000103';
const sharingDialog=(page:Page)=>page.getByRole('dialog',{name:'Hur delar lärarna kursen?'});
const sharingSent=async(page:Page)=>(await commands(page)).filter(c=>c.body.action==='save_sharing'||c.body.action==='clear_sharing');
const rowOf=(page:Page,label:RegExp)=>matrix(page).getByRole('row').filter({has:page.getByRole('rowheader',{name:label})});
test.describe('delning',()=>{
 test.beforeEach(({},info)=>{test.skip(!desktop(info.project.name),'Delningen anges på dator (D-15).');});
 test('andra läraren ger frågan; en i taget summerar, samtidigt räknas en gång; betygssättare',async({page},info)=>{
  const errors=await open(page);
  await matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();
  await expect(ws(page).getByText('Tjänsteraden är sparad: Cecilia Dahl, Matematik 1c, TE26A, HT 50 h · VT 50 h.')).toBeVisible();
  // En lärare: ingen fråga och inget märke.
  await expect(sharingDialog(page)).toHaveCount(0);await expect(rowOf(page,/^Matematik 1c/).locator('.tjanst-badge')).toHaveCount(0);
  await matrix(page).getByRole('button',{name:'Anna Andersson, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  // Behovet är redan täckt: tiden förifylls inte, utan anges för den andra läraren.
  await page.getByRole('dialog').getByLabel('Lärartid HT (timmar)').fill('50');await page.getByRole('dialog').getByLabel('Lärartid VT (timmar)').fill('50');
  await page.getByRole('dialog').getByRole('button',{name:'Välj Anna Andersson',exact:true}).click();
  const dialog=sharingDialog(page);await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Cecilia Dahl: HT 50 h · VT 50 h')).toBeVisible();await expect(dialog.getByText('Anna Andersson: HT 50 h · VT 50 h')).toBeVisible();
  await expect(dialog.getByText('Behörighetsunderlag saknas',{exact:false})).toBeVisible();
  // Inget förval av form; betygsrutorna är spärrade tills formen är vald.
  for(const r of await dialog.getByRole('radio').all())await expect(r).not.toBeChecked();
  await expect(dialog.getByRole('checkbox',{name:'Anna Andersson'})).toBeDisabled();
  await dialog.getByRole('button',{name:'Spara delningen'}).click();
  await expect(dialog.getByRole('alert')).toHaveText('Välj hur lärarna delar kursen.');expect(await sharingSent(page)).toEqual([]);
  // En i taget: båda har tid VT (sista terminen med tid), så båda förvalda som betygssättare.
  await dialog.getByRole('radio',{name:/^En i taget/u}).check();
  await expect(dialog.getByRole('checkbox',{name:'Anna Andersson'})).toBeChecked();await expect(dialog.getByRole('checkbox',{name:'Cecilia Dahl'})).toBeChecked();
  await dialog.getByRole('checkbox',{name:'Anna Andersson'}).uncheck();await dialog.getByRole('checkbox',{name:'Cecilia Dahl'}).uncheck();
  await dialog.getByRole('button',{name:'Spara delningen'}).click();
  await expect(dialog.getByRole('alert')).toHaveText('Välj minst en lärare som sätter betyg.');expect(await sharingSent(page)).toEqual([]);
  await dialog.getByRole('checkbox',{name:'Cecilia Dahl'}).check();
  await page.screenshot({path:`${SHOTS}/${info.project.name}-delning-dialog.png`});
  await dialog.getByRole('button',{name:'Spara delningen'}).click();
  await expect(ws(page).getByText('Delningen är sparad: En i taget. Sätter betyg: Cecilia Dahl.',{exact:false})).toBeVisible();await expect(dialog).toHaveCount(0);
  let sent=await sharingSent(page);expect(sent).toHaveLength(1);
  expect(sent[0].body.payload).toMatchObject({sourceKey:expect.stringMatching(/:MATMAT01c$/u),mode:'sequential',graderPersonIds:[CECILIA]});
  // En i taget: 100 + 100 mot behovet 100 h.
  await expect(rowOf(page,/^Matematik 1c/).locator('.tjanst-deviation')).toHaveText('+100 h');
  const badge=matrix(page).getByRole('button',{name:'Två lärare · en i taget: ange hur lärarna delar Matematik 1c i TE26A'});await expect(badge).toBeVisible();
  // Ändra via märket: samtidigt räknar behovet en gång, och båda lärarna behåller hela tiden.
  await badge.click();await expect(dialog.getByRole('radio',{name:/^En i taget/u})).toBeChecked();await expect(dialog.getByRole('checkbox',{name:'Cecilia Dahl'})).toBeChecked();
  await dialog.getByRole('radio',{name:/^Samtidigt i samma grupp/u}).check();
  await expect(dialog.getByRole('checkbox',{name:'Anna Andersson'})).not.toBeChecked();
  await dialog.getByRole('checkbox',{name:'Anna Andersson'}).check();
  await dialog.getByRole('button',{name:'Spara delningen'}).click();
  await expect(ws(page).getByText('Delningen är sparad: Samtidigt i samma grupp.',{exact:false})).toBeVisible();
  sent=await sharingSent(page);expect(sent[1].body.payload.mode).toBe('concurrent');expect([...sent[1].body.payload.graderPersonIds].sort()).toEqual([ANNA,CECILIA]);
  await expect(rowOf(page,/^Matematik 1c/).locator('.tjanst-deviation')).toHaveCount(0);
  await expect(matrix(page).getByRole('button',{name:'Två lärare · samtidigt: ange hur lärarna delar Matematik 1c i TE26A'})).toBeFocused();
  await expect(footer(page,'Undervisning','Cecilia Dahl')).toHaveText('100 h');
  // Per klass och Per kurs/ämne visar formen och betygssättarna.
  await ws(page).getByRole('tab',{name:'Per klass'}).click();await ws(page).getByLabel('Klass',{exact:true}).selectOption({label:'TE26A'});
  const math=ws(page).getByRole('region',{name:'Per klass'}).getByRole('row').filter({hasText:'Matematik 1c'});
  await expect(math.locator('.tjanst-sharing-line')).toHaveText('Två lärare · samtidigt · Sätter betyg: Anna Andersson, Cecilia Dahl');
  await ws(page).getByRole('tab',{name:'Per lärare'}).click();
  await ws(page).getByRole('region',{name:'Per lärare'}).getByLabel('Lärare',{exact:true}).selectOption({label:'Cecilia Dahl'});
  await expect(ws(page).getByRole('region',{name:'Per lärare'}).getByRole('row').filter({hasText:'Matematik 1c'})).toContainText('Delas med Anna Andersson · Samtidigt · Sätter betyg');
  await noOverflow(page);expect(errors).toEqual([]);
 });
 test('Bestäm senare ger hindret; märket utan delning; ta bort delningen',async({page})=>{
  const errors=await open(page,'?delning=saknas');
  const badge=matrix(page).getByRole('button',{name:'Två lärare utan angiven delning: ange hur lärarna delar Engelska 5 i TE26A'});
  await expect(badge).toBeVisible();
  await ws(page).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  const panel=ws(page).getByRole('region',{name:'Fastställ och publicera'});
  await expect(panel.getByRole('listitem').filter({hasText:'utan angiven delning'})).toContainText('Ange om de undervisar en i taget eller samtidigt.');
  await expect(panel.getByRole('button',{name:'Fastställ och publicera…'})).toBeDisabled();
  await badge.click();const dialog=sharingDialog(page);
  await expect(dialog.getByRole('button',{name:'Ta bort delningen'})).toHaveCount(0);
  await dialog.getByRole('button',{name:'Bestäm senare'}).click();await expect(dialog).toHaveCount(0);await expect(badge).toBeFocused();
  expect(await sharingSent(page)).toEqual([]);
  // En i taget: Bertil har tiden VT och förvalds som betygssättare. Servern kan neka (till exempel om raden ändrats under tiden).
  await badge.click();await dialog.getByRole('radio',{name:/^En i taget/u}).check();
  await expect(dialog.getByRole('checkbox',{name:'Bertil Berg'})).toBeChecked();await expect(dialog.getByRole('checkbox',{name:'Anna Andersson'})).not.toBeChecked();
  await page.evaluate(()=>window.__tjanst.failNext('plan/kommando',{status:400,code:'tjanst_sharing_grader'}));
  await dialog.getByRole('button',{name:'Spara delningen'}).click();
  await expect(dialog).toContainText('Den som sätter betyg måste vara en av lärarna med tid på kursen.');
  await expect(dialog.getByRole('radio',{name:/^En i taget/u})).toBeChecked();
  await dialog.getByRole('button',{name:'Spara delningen'}).click();await expect(dialog).toHaveCount(0);
  const done=matrix(page).getByRole('button',{name:'Två lärare · en i taget: ange hur lärarna delar Engelska 5 i TE26A'});await expect(done).toBeVisible();
  await expect(panel.getByRole('listitem').filter({hasText:'utan angiven delning'})).toHaveCount(0);
  await done.click();await dialog.getByRole('button',{name:'Ta bort delningen'}).click();
  await expect(ws(page).getByText('Delningen är borttagen. Ange en ny delning före publicering.')).toBeVisible();
  const sent=await sharingSent(page);expect(sent.at(-1)!.body).toMatchObject({action:'clear_sharing',payload:{sourceKey:expect.stringMatching(/:ENGENG05$/u)}});
  await expect(badge).toBeVisible();
  for(const b of [badge])expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  expect(errors).toEqual([]);
 });
 test('tangentbord: frågan får fokus, Escape stänger och fokus återgår',async({page})=>{
  const errors=await open(page,'?delning=saknas');
  const badge=matrix(page).getByRole('button',{name:'Två lärare utan angiven delning: ange hur lärarna delar Engelska 5 i TE26A'});
  await badge.focus();await page.keyboard.press('Enter');
  const dialog=sharingDialog(page);await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(d=>d.contains(document.activeElement))).toBe(true);
  for(const l of await dialog.locator('.tjanst-sharing-mode, .mandate-check').all())expect((await l.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(badge).toBeFocused();
  expect(errors).toEqual([]);
 });
 test('samläsning: två lärare i en samläsning får ingen delningsfråga',async({page})=>{
  const errors=await open(page,'?data=samlasning');
  await expect(rowOf(page,/^Svenska 1/).locator('.tjanst-badge').filter({hasText:'Två lärare'})).toHaveCount(0);
  expect(errors).toEqual([]);
 });
});
test.describe('delning telefon',()=>{
 test.beforeEach(({},info)=>{test.skip(desktop(info.project.name),'Telefonprov.');});
 test('Per klass visar formen och betygssättaren i läsläge',async({page},info)=>{
  const errors=await open(page);
  await ws(page).getByLabel('Vy').selectOption({label:'Per klass'});await ws(page).getByLabel('Klass',{exact:true}).selectOption({label:'TE26A'});
  const card=ws(page).getByRole('region',{name:'Per klass'}).locator('.tjanst-cards li').filter({hasText:'Engelska 5'});
  await expect(card.locator('.tjanst-sharing-line')).toHaveText('Två lärare · en i taget · Sätter betyg: Bertil Berg');
  await noOverflow(page);await page.screenshot({path:`${SHOTS}/${info.project.name}-delning-telefon.png`,fullPage:true});expect(errors).toEqual([]);
 });
});

// 05.1-34: Fördelas kö följer linsen; en vakant rad på ett täckt behov är överflödig, inte ofördelad (användarbeslut 2026-10-29).
test.describe('fördela lins',()=>{
 test.beforeEach(({},info)=>{test.skip(!desktop(info.project.name),'Lärare väljs bara på dator (D-15).');});
 test('Fördela öppnar med Ofördelat; Alla behov visar fördelade med status; överflödig vakant rad varnas men köas inte',async({page},info)=>{
  const errors=await open(page,'?vakant=1');
  const math=matrix(page).getByRole('row').filter({has:page.getByRole('rowheader',{name:/^Matematik 1b/})});
  await expect(math.getByText('Överflödig vakant rad')).toBeVisible();
  await expect(ws(page).getByLabel('Lins',{exact:true})).toHaveValue('alla');
  await ws(page).getByRole('tab',{name:'Fördela'}).click();
  await expect(ws(page).getByLabel('Lins',{exact:true})).toHaveValue('ofordelat');
  const open_=fordela(page).getByRole('list',{name:'Ofördelade behov'});
  await expect(open_.getByRole('button',{name:/^Matematik 1b · EK26/u})).toHaveCount(0);
  await expect(open_.getByRole('button',{name:/^Matematik 1c · TE26A/u})).toBeVisible();
  await expect(open_.getByText('Fördelat')).toHaveCount(0);
  await ws(page).getByLabel('Lins',{exact:true}).selectOption('alla');
  const all=fordela(page).getByRole('list',{name:'Behov'});
  await expect(all.getByRole('button',{name:'Matematik 1b · EK26 · Fördelat · överflödig vakant rad'})).toBeVisible();
  await expect(all.getByRole('button',{name:'Engelska 5 · TE26A · Fördelat'})).toBeVisible();
  await expect(fordela(page).getByText(/^\d+ behov · \d+ ofördelade$/u)).toBeVisible();
  // Första valet är fortfarande ett ofördelat behov.
  await expect(fordela(page).getByRole('heading',{name:'Matematik 1c · TE26A'})).toBeVisible();
  await page.screenshot({path:`${SHOTS}/${info.project.name}-fordela-alla-behov.png`});
  // Ett fördelat behov kan väljas under Alla behov, till exempel för en andra lärare.
  await all.getByRole('button',{name:'Engelska 5 · TE26A · Fördelat'}).click();
  await expect(fordela(page).getByRole('heading',{name:'Engelska 5 · TE26A'})).toBeVisible();
  await noOverflow(page);
  // Ett uttryckligt linsval står kvar; en lins som Fördela satte själv återställs när vyn lämnas, så att matrisen visar alla rader.
  await ws(page).getByRole('tab',{name:'Matris'}).click();await expect(ws(page).getByLabel('Lins',{exact:true})).toHaveValue('alla');
  await ws(page).getByRole('tab',{name:'Fördela'}).click();await expect(ws(page).getByLabel('Lins',{exact:true})).toHaveValue('ofordelat');
  await ws(page).getByRole('tab',{name:'Matris'}).click();await expect(ws(page).getByLabel('Lins',{exact:true})).toHaveValue('alla');
  await expect(matrix(page).getByRole('rowheader',{name:/^Engelska 5/u})).toBeVisible();
  await ws(page).getByRole('tab',{name:'Fördela'}).click();await ws(page).getByLabel('Lins',{exact:true}).selectOption('alla');await ws(page).getByLabel('Lins',{exact:true}).selectOption('ofordelat');
  await ws(page).getByRole('tab',{name:'Matris'}).click();await expect(ws(page).getByLabel('Lins',{exact:true})).toHaveValue('ofordelat');
  expect(errors).toEqual([]);
 });
});
