// Synthetic component evidence for Tjänstefördelning (05.1-05). /api/tjanst/* is answered by the fixture's in-browser mock;
// no database, server or live authentication. Komponentprov, inte faktiskt prov.
import {test,expect,type Page} from '@playwright/test';
const url='/e2e/fixtures/tjanst-preview.html';
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
  await expect(dialog.getByText('Schemalagd tid')).toBeVisible();await expect(dialog.getByText('Underlag saknas')).toBeVisible();
  await expect(dialog.getByText('Källa: Teknikprogrammet version 2, ämnesrad Matematik 1c')).toBeVisible();
  await expect(dialog.getByLabel('Lärartid HT (timmar)')).toHaveValue('50');await expect(dialog.getByLabel('Lärartid VT (timmar)')).toHaveValue('50');
  await dialog.getByLabel('Lärartid VT (timmar)').fill('40');
  await expect(dialog.getByText('Avvikelse VT: −10 h')).toBeVisible();
  await dialog.getByRole('button',{name:'Spara tjänsteraden'}).click();
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
  await group.getByRole('button',{name:'Öppna klasskopplingar'}).click();
  expect(await page.evaluate(()=>window.__tjanst.openedLinks)).toBe(1);
  // Skolans behov räknar bara kopplade klasser: 300 + 200 + 144 h.
  await expect(matrix(page).locator('tfoot tr').first().locator('td').first()).toHaveText('644 h');
  await ws(page).getByRole('tab',{name:'Per klass'}).click();await ws(page).getByLabel('Klass',{exact:true}).selectOption({label:'NA26B'});
  await expect(ws(page).getByRole('heading',{name:'NA26B · koppling saknas'})).toBeVisible();
  await expect(ws(page).getByRole('region',{name:'Per klass'})).not.toContainText(/\b0 h\b/);
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
  await dialog.getByLabel('Typ').selectOption('mentor');await dialog.getByLabel('Lärare').selectOption({label:'Cecilia Dahl'});
  await dialog.getByLabel('Klass (valfri)').selectOption({label:'EK26'});await dialog.getByLabel('Tid HT (timmar)').fill('10');
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
  await expect(panel.getByText('1. Utkast')).toHaveAttribute('aria-current','step');
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
  await expect(ws(page).getByText('Lärarna ser version 2, publicerad 2026-10-19.')).toBeVisible();
  await expect(matrix(page).getByRole('button',{name:/Ändra\.$|Tilldela\.$/})).toHaveCount(0);
  await panel.getByRole('button',{name:'Versionshistorik'}).click();
  await expect(panel.getByText(/^Version 2 · Fastställd och publicerad · Rektor Syntetisk · 2026-10-19 \d\d:\d\d$/)).toBeVisible();
  await expect(panel.getByText(/^Version 1 · Ersatt av senare version · Rektor Syntetisk/)).toBeVisible();
  await ws(page).getByRole('button',{name:'Ändra i ny version'}).click();
  await expect(ws(page).getByText('Utkastet version 3 är skapat. Lärarna ser version 2 tills du publicerar.')).toBeVisible();
  await expect(ws(page).getByText('Lärarna ser version 2, publicerad 2026-10-19.')).toBeVisible();
  void dialog;dialog=page.getByRole('dialog');await expect(dialog).toHaveCount(0);
 });

 test('AE5 skoladministratör förbereder men saknar beslutsknappen',async({page})=>{
  await open(page,'?roll=administrator');
  await expect(ws(page).getByText('Du kan förbereda fördelningen. Rektor fastställer och publicerar.')).toBeVisible();
  await expect(ws(page).getByRole('button',{name:'Lägg till lärare i fördelningen'})).toBeVisible();
  await ws(page).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  const panel=ws(page).getByRole('region',{name:'Fastställ och publicera'});
  await expect(panel.getByText('Rektor fastställer och publicerar fördelningen. Du kan fortsätta förbereda utkastet.')).toBeVisible();
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
  await expect(dialog.getByRole('alert')).toContainText('Version 2 har publicerats under tiden. Hämta aktuellt läge och välj Ändra i ny version.');
  await expect(ws(page).getByText(/är fastställd och publicerad/)).toHaveCount(0);
  await dialog.getByRole('button',{name:'Behåll utkastet'}).click();await expect(ws(page).getByText('Utkast',{exact:true})).toBeVisible();
 });

 test('AE8 409 sparar inget och inmatningen står kvar',async({page})=>{
  await open(page);
  await page.evaluate(()=>window.__tjanst.failNext('plan/kommando',{status:409,code:'tjanst_revision_conflict'}));
  await matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Lärartid VT (timmar)').fill('40');await dialog.getByLabel('Kommentar (valfri)').fill('Syntetisk kommentar');
  await dialog.getByRole('button',{name:'Spara tjänsteraden'}).click();
  await expect(dialog.getByRole('alert')).toContainText('Din ändring har inte sparats. Hämta aktuellt läge och gör om ändringen.');
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
  await page.getByRole('dialog').getByRole('button',{name:'Spara tjänsteraden'}).click();
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
  const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'Spara tjänsteraden'}).click();
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
  let dialog=page.getByRole('dialog');await dialog.getByLabel('Lärare').selectOption({label:'David Ek'});
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
  await ws(page).getByLabel('Visa version').selectOption({label:'Version 1 · publicerad 2026-06-15'});
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
  await ws(page).getByLabel('Visa version').selectOption({label:'Aktuell version'});
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
});
