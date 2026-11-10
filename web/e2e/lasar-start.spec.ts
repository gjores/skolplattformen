// Simulerat UI-prov för nytt läsår, huvudmannens ram och panelen Undervisning i
// Läsår & skoldagar (05.1.1-05). /api/lasar/* besvaras av fixturens mock i
// webbläsaren med syntetiska data; ingen databas, server eller inloggning.
// Serverns regler för ram, kopiering och arbetssätt provas i plan 10 och 11.
import {test,expect,type Page} from '@playwright/test';
const url='/e2e/fixtures/lasar-preview.html';
const tid=(n:number)=>`51a50000-0000-4000-8000-${String(n).padStart(12,'0')}`;
type Logged={path:string;body:any};
const commands=(page:Page)=>page.evaluate(()=>window.__lasar.commands) as Promise<Logged[]>;
const decisions=(page:Page)=>page.evaluate(()=>window.__lasar.decisions) as Promise<Logged[]>;

async function openPage(page:Page,query:string,ready:string){
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>{errors.push(`webbläsardialog: ${d.message()}`);void d.dismiss();});
 await page.goto(url+query);
 await expect(page.locator(ready).first()).toBeVisible();
 return errors;
}

// ---------------------------------------------------------------- startval (avsnitt 10)

const variants:{name:string;query:string;heading:string;body:string;buttons:string[]}[]=[
 {name:'rektor, eget förslag',query:'?tom=1',heading:'Inget läsår ännu',body:'Skapa ett förslag utifrån helgdagarna och vanliga lov, eller utgå från förra läsåret.',buttons:['Skapa förslag','Kopiera förra läsåret']},
 {name:'rektor, ram utgiven',query:'?tom=1&arbetssatt=ram',heading:'Inget läsår ännu',body:'Utgå från huvudmannens ram och justera för skolan, eller kopiera förra läsåret. Skillnader mot ramen visas i kalendern.',buttons:['Utgå från huvudmannens ram','Kopiera förra läsåret']},
 {name:'rektor, ram saknas (D-14)',query:'?tom=1&arbetssatt=ram&ram=saknas',heading:'Ramen saknas',body:'Huvudmannen har inte gett ut ramen för 2026/27. Du kan börja när ramen finns.',buttons:[]},
 {name:'huvudman, ingen ram',query:'?tom=1&arbetssatt=ram&mal=ram&roll=huvudman',heading:'Ingen ram för 2026/27',body:'Lägg terminer och gemensamma lov- och studiedagar för alla skolor.',buttons:['Skapa ram','Kopiera förra årets ram']},
 {name:'huvudman, skola utan kalender',query:'?tom=1&roll=huvudman',heading:'Rektorn har inte påbörjat läsåret',body:'Kalendern visas här när rektorn har skapat ett förslag.',buttons:[]},
 {name:'läsläge',query:'?tom=1&roll=admin',heading:'Inget läsår ännu',body:'Ingen kalender är skapad för Syntetiska grundskolan 2026/27.',buttons:[]},
];
for(const v of variants){
 test(`tomläge: ${v.name}`,async({page})=>{
  const errors=await openPage(page,v.query,'.ly-start');
  const start=page.locator('.ly-start');
  await expect(start.getByRole('heading',{level:2})).toHaveText(v.heading);
  await expect(start.locator('p').first()).toHaveText(v.body);
  const buttons=start.getByRole('button');
  await expect(buttons).toHaveCount(v.buttons.length);
  for(const [i,name] of v.buttons.entries())await expect(buttons.nth(i)).toHaveText(name);
  // Högst en primärknapp (Skolplattan): övriga är outline.
  expect(await start.locator('button').evaluateAll(list=>list.filter(b=>b.classList.contains('bg-primary')).length)).toBeLessThanOrEqual(1);
  await expect(page.locator('.ly-calendar')).toHaveCount(0);
  expect(await commands(page)).toEqual([]);
  expect(errors).toEqual([]);
 });
}

test('tomläge: Kopiera förra läsåret är inaktiv utan föregående kalender och har hjälptext',async({page})=>{
 const errors=await openPage(page,'?tom=1&forra=0','.ly-start');
 const copy=page.getByRole('button',{name:'Kopiera förra läsåret'});
 await expect(copy).toBeDisabled();
 await expect(copy).toHaveAccessibleDescription('Det finns ingen kalender för 2025/26 att kopiera.');
 await expect(page.getByRole('button',{name:'Skapa förslag'})).toBeEnabled();
 expect(errors).toEqual([]);
});

test('Skapa förslag skapar kalendern med kommandot create',async({page})=>{
 const errors=await openPage(page,'?tom=1','.ly-start');
 await page.getByRole('button',{name:'Skapa förslag'}).click();
 await expect(page.locator('.ly-calendar')).toBeVisible();
 const sent=await commands(page);
 expect(sent).toHaveLength(1);
 expect(sent[0].body.ops).toEqual([{op:'create',source:'proposal'}]);
 expect(sent[0].body.versionId).toBeNull();
 expect(sent[0].body.expectedRevision).toBeNull();
 await expect(page.locator('.admin-notice')).toContainText('Ett förslag för läsåret 2026/27 är skapat.');
 await expect(page.locator('.ly-review-card')).toHaveCount(0);
 expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- kopiering och granskning (avsnitt 16 fall 6)

test('kopierade dagar granskas innan förslaget kan skickas',async({page})=>{
 const errors=await openPage(page,'?tom=1&ar=2027','.ly-start');
 await page.getByRole('button',{name:'Kopiera förra läsåret'}).click();
 const card=page.locator('.ly-review-card');
 await expect(card).toBeVisible();
 expect((await commands(page))[0].body.ops).toEqual([{op:'create',source:'copy'}]);
 await expect(card.getByRole('heading',{name:'Att granska efter kopieringen'})).toBeVisible();
 await expect(card).toContainText('6 dagar kunde inte flyttas entydigt från 2026/27 och är inte inlagda. Helgdagarna är beräknade för 2027/28.');
 const rows=card.locator('.ly-review-row');
 await expect(rows).toHaveCount(6);
 // Vecka 53 och påsken listas med skäl; dagarna är inte inlagda.
 await expect(rows.filter({hasText:'Studiedag · Syntetisk planeringsdag · måndag v.53 2026'})).toContainText('Vecka 53 finns inte 2027.');
 await expect(rows.filter({hasText:'Lovdag · Påsklov · måndag v.12 2027'})).toContainText('Påsken infaller en annan vecka 2028.');
 // Samma vecka och veckodag: höstlovet v.44 2026 blir v.44 2027, november-studiedagen v.46 blir v.46.
 await expect(page.locator('button[title^="måndag 1 november 2027 · Lovdag · Höstlov"]')).toBeVisible();
 await expect(page.locator('button[title^="fredag 19 november 2027 · Studiedag · Syntetisk fortbildning"]')).toBeVisible();
 await expect(page.locator('button[title^="måndag 10 april 2028 ·"]')).toHaveAttribute('title',/Skoldag.*att granska/);
 await expect(page.locator('td.ly-review')).not.toHaveCount(0);
 await expect(page.locator('.ly-legend')).toContainText('Att granska');

 const submit=page.getByRole('button',{name:'Skicka förslag'});
 await expect(submit).toBeDisabled();
 await expect(page.locator('.tp-workflow')).toContainText('6 kopierade dagar är inte granskade. Granska dem innan du skickar förslaget.');

 // Visa veckan markerar påskveckans redigerbara dagar utan att ändra dem.
 await rows.filter({hasText:'måndag v.12 2027'}).getByRole('button',{name:'Visa veckan'}).click();
 await expect(page.locator('td.ly-selected')).toHaveCount(4);
 await expect(page.locator('button[title^="måndag 10 april 2028 ·"]')).toHaveAttribute('aria-pressed','true');
 expect(await commands(page)).toHaveLength(1);

 for(let i=6;i>=1;i--){
  await rows.first().getByRole('button',{name:/^Klar/}).click();
  await expect(rows).toHaveCount(i-1);
  if(i>1)await expect(submit).toBeDisabled();
 }
 const resolved=(await commands(page)).slice(1).map(c=>c.body.ops);
 expect(resolved).toHaveLength(6);
 for(const ops of resolved){expect(ops).toHaveLength(1);expect(ops[0].op).toBe('resolve_review');expect(ops[0].itemId).toMatch(/^copy\|/);}
 expect(new Set(resolved.map(o=>o[0].itemId)).size).toBe(6);
 await expect(card).toHaveCount(0);
 await expect(submit).toBeEnabled();
 await expect(page.locator('.ly-legend')).not.toContainText('Att granska');
 await expect(page.locator('.admin-history')).toContainText('Kopierat från 2026/27, 6 dagar granskade');
 expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- arbetssätt (D-01, D-15)

test('byte av arbetssätt skickar set_mode först efter bekräftelse med förhandsvisningens skolor',async({page})=>{
 const errors=await openPage(page,'?vy=arbetssatt&roll=huvudman','.ly-mode-card [role=radio]');
 await expect(page.getByRole('heading',{name:'Arbetssätt för läsåret 2026/27'})).toBeVisible();
 const ram=page.locator('.ly-mode-option',{hasText:'Huvudmannens ram'});
 const save=page.getByRole('button',{name:'Spara arbetssätt'});
 await expect(page.locator('.ly-mode-option',{hasText:'Eget förslag per skola'}).locator('[role=radio]')).toHaveAttribute('aria-checked','true');
 await expect(save).toBeDisabled();
 await ram.click();
 await expect(ram.locator('[role=radio]')).toHaveAttribute('aria-checked','true');

 // Esc och den säkra knappen betyder nej: inget set_mode skickas.
 await save.click();
 const dialog=page.getByRole('alertdialog');
 await expect(dialog.getByRole('heading',{name:'Byt arbetssätt för 2026/27?'})).toBeVisible();
 await expect(dialog.locator('.ly-dialog-list li')).toHaveCount(2);
 await expect(dialog).toContainText('Syntetiska gymnasiet');
 const keep=dialog.getByRole('button',{name:'Behåll arbetssättet'});
 await expect(keep).toBeFocused();
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await save.click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Behåll arbetssättet'}).click();
 await expect(page.getByRole('alertdialog')).toHaveCount(0);
 let sent=await decisions(page);
 expect(sent.map(d=>d.body.action)).toEqual(['preview_mode_change','preview_mode_change']);

 await save.click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Byt arbetssätt'}).click();
 await expect(page.locator('.ly-mode-card .admin-notice')).toContainText('Arbetssättet för 2026/27 är sparat: huvudmannens ram.');
 sent=await decisions(page);
 expect(sent.map(d=>d.body.action)).toEqual(['preview_mode_change','preview_mode_change','preview_mode_change','set_mode']);
 const set=sent[3].body;
 expect(set.target).toEqual({kind:'frame'});
 expect(set.mode).toBe('ram');
 expect(set.confirmAffected).toEqual([tid(4),tid(5)]);
 expect(sent[2].body.mode).toBe('ram');
 await expect(save).toBeDisabled();
 expect(errors).toEqual([]);
});

test('arbetssättet är låst när läsåret har börjat',async({page})=>{
 const errors=await openPage(page,'?vy=arbetssatt&roll=huvudman&last=1','.ly-mode-card [role=radio]');
 await expect(page.locator('.ly-mode-card')).toContainText('Läsåret 2026/27 har börjat. Arbetssättet kan inte ändras.');
 await expect(page.getByRole('button',{name:'Spara arbetssätt'})).toHaveCount(0);
 for(const radio of await page.locator('.ly-mode-card [role=radio]').all())await expect(radio).toHaveAttribute('aria-disabled','true');
 expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- huvudmannens ram (avsnitt 11, avsnitt 16 fall 5, vy-delen)

const day=(page:Page,long:string)=>page.locator(`button[title^="${long} ·"]`);
const cell=(page:Page,long:string)=>page.locator('td.ly-day',{has:day(page,long)});

test('ramvyn: utan gruppverktyg och korta veckor, och Ge ut ramen med frivilligt meddelande',async({page})=>{
 const errors=await openPage(page,'?mal=ram&roll=huvudman&arbetssatt=ram','.ly-calendar');
 await expect(page.getByRole('heading',{level:1,name:'Läsår och skoldagar · Huvudmannens ram'})).toBeVisible();
 await expect(page.locator('#ly-group')).toHaveCount(0);
 await expect(page.locator('.ly-shortweek')).toHaveCount(0);
 await expect(page.locator('.ly-scope')).toHaveCount(0);
 for(const name of ['Skicka förslag','Fastställ','Återställ förslaget'])await expect(page.getByRole('button',{name})).toHaveCount(0);
 await expect(page.locator('.tp-cover-side .tp-status')).toHaveText('Utkast');
 await page.getByRole('button',{name:'Ge ut ramen'}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('heading',{name:'Ge ut ramen till skolorna'})).toBeVisible();
 await expect(dialog).toContainText('Inget i skolornas kalendrar ändras.');
 expect(await decisions(page)).toEqual([]);
 await dialog.getByRole('button',{name:'Ge ut ramen'}).click();
 await expect(page.locator('.admin-notice')).toContainText('Ramen för 2026/27 är utgiven till skolorna.');
 const sent=await decisions(page);
 expect(sent).toHaveLength(1);
 expect(sent[0].body).toMatchObject({action:'publish_frame',target:{kind:'frame'},text:'',mode:null,confirmAffected:[]});
 await expect(page.locator('.tp-cover-side .tp-status')).toHaveText('Utgiven');
 await expect(page.getByRole('button',{name:'Ge ut ramen'})).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('skolans jämförelse med ramen: kort, markörer och terminsavvikelse',async({page})=>{
 const errors=await openPage(page,'?arbetssatt=ram','.ly-calendar');
 const card=page.locator('.ly-frame-card');
 await expect(card.getByRole('heading',{name:'Jämfört med huvudmannens ram'})).toBeVisible();
 await expect(page.locator('.ly-side > *').first()).toHaveClass(/ly-frame-card/);
 await expect(card).toContainText('Ramens version 1, utgiven 1 juni 2026');
 await expect(card).toContainText('HT börjar 18 augusti 2026 · ramen 17 augusti 2026');
 await expect(card.locator('.ly-counters')).toContainText('Dagar som skiljer sig2');
 await expect(card.locator('.ly-frame-list li')).toHaveCount(2);
 await expect(card).toContainText('måndag 12 oktober 2026: studiedag (Skolans studiedag) · ramen skoldag');
 await expect(cell(page,'måndag 12 oktober 2026').locator('.ly-frame-mark')).toHaveCount(1);
 await expect(cell(page,'fredag 13 november 2026').locator('.ly-frame-mark')).toHaveCount(1);
 await expect(page.locator('.ly-frame-mark')).toHaveCount(2);
 await expect(day(page,'måndag 12 oktober 2026')).toHaveAttribute('title',/skiljer sig från ramen: ramen skoldag/);
 await expect(page.locator('.ly-term-field',{has:page.locator('#ly-ht-start')}).locator('.ly-frame-diff')).toHaveText('Ramen: 17 augusti 2026');
 await expect(page.locator('.ly-frame-diff')).toHaveCount(1);
 await expect(page.locator('.ly-legend')).toContainText('Skiljer sig från ramen');
 await expect(page.locator('.ly-frame-banner')).toHaveCount(0);
 await card.getByRole('button',{name:'Visa måndag 12 oktober 2026'}).click();
 await expect(day(page,'måndag 12 oktober 2026')).toHaveAttribute('aria-pressed','true');
 expect(await commands(page)).toEqual([]);
 expect(errors).toEqual([]);
});

test('ramen ändrad: dialogens säkra knapp och Esc skickar inget och ändrar inga dagar',async({page})=>{
 const errors=await openPage(page,'?arbetssatt=ram&ram=andrad','.ly-calendar');
 const banner=page.locator('.ly-frame-banner');
 await expect(banner).toContainText('Huvudmannen har ändrat ramen (version 2, 15 oktober 2026). 3 dagar skiljer sig från skolans kalender.');
 // En primär knapp per vy: banderollens Ta in, inte Skicka förslag.
 await expect(page.getByRole('button',{name:'Skicka förslag'})).not.toHaveClass(/bg-primary/);
 await expect(banner.getByRole('button',{name:'Ta in ramens ändringar'})).toHaveClass(/bg-primary/);
 await banner.getByRole('button',{name:'Visa skillnaderna'}).click();
 await expect(day(page,'måndag 12 oktober 2026')).toHaveAttribute('aria-pressed','true');
 await expect(day(page,'fredag 15 januari 2027')).toHaveAttribute('aria-pressed','true');

 await banner.getByRole('button',{name:'Ta in ramens ändringar'}).click();
 const dialog=page.getByRole('alertdialog');
 await expect(dialog.getByRole('heading',{name:'Ta in ramens ändringar?'})).toBeVisible();
 await expect(dialog).toContainText('2 dagar i skolans kalender ändras till ramens värden. Skolans egna justeringar på andra dagar ligger kvar.');
 await expect(dialog.locator('.ly-dialog-list li')).toHaveCount(3);
 const keep=dialog.getByRole('button',{name:'Behåll skolans kalender'});
 await expect(keep).toBeFocused();
 await keep.click();
 await expect(page.getByRole('alertdialog')).toHaveCount(0);
 await banner.getByRole('button',{name:'Ta in ramens ändringar'}).click();
 await expect(page.getByRole('alertdialog')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('alertdialog')).toHaveCount(0);

 expect(await commands(page)).toEqual([]);
 await expect(cell(page,'måndag 12 oktober 2026')).toHaveClass(/ly-studiedag/);
 await expect(cell(page,'fredag 15 januari 2027')).toHaveClass(/ly-skoldag/);
 await expect(page.locator('#ly-vt-end')).toHaveValue('2027-06-11');
 await expect(banner).toBeVisible();
 expect(errors).toEqual([]);
});

test('Ta in ramens ändringar skickar exakt de godkända nycklarna',async({page})=>{
 const errors=await openPage(page,'?arbetssatt=ram&ram=andrad','.ly-calendar');
 await page.locator('.ly-frame-banner').getByRole('button',{name:'Ta in ramens ändringar'}).click();
 const dialog=page.getByRole('alertdialog');
 const confirm=dialog.getByRole('button',{name:/^Ta in \d+ ändring/});
 await expect(confirm).toHaveText('Ta in 2 ändringar');
 await dialog.getByRole('checkbox').click();
 await expect(confirm).toHaveText('Ta in 3 ändringar');
 await dialog.getByRole('checkbox').click();
 await expect(confirm).toHaveText('Ta in 2 ändringar');
 await confirm.click();
 await expect(page.locator('.ly-frame-banner')).toHaveCount(0);
 const sent=await commands(page);
 expect(sent).toHaveLength(1);
 expect(sent[0].body.ops).toEqual([{op:'take_frame_changes',frameVersionId:tid(302),accepted:['term:vt:end','day:2027-01-15']}]);
 await expect(cell(page,'fredag 15 januari 2027')).toHaveClass(/ly-studiedag/);
 await expect(cell(page,'måndag 12 oktober 2026')).toHaveClass(/ly-studiedag/);
 await expect(page.locator('.admin-notice')).toContainText('2 ändringar från ramens version 2 är intagna.');
 await expect(page.locator('.ly-frame-card')).toContainText('Ramens version 2, utgiven 15 oktober 2026');
 expect(errors).toEqual([]);
});

test('en vald konflikt tas in med ramens värde',async({page})=>{
 const errors=await openPage(page,'?arbetssatt=ram&ram=andrad','.ly-calendar');
 await page.locator('.ly-frame-banner').getByRole('button',{name:'Ta in ramens ändringar'}).click();
 const dialog=page.getByRole('alertdialog');
 await dialog.getByRole('checkbox').click();
 await dialog.getByRole('button',{name:'Ta in 3 ändringar'}).click();
 await expect(page.locator('.ly-frame-banner')).toHaveCount(0);
 const sent=await commands(page);
 expect(sent[0].body.ops[0].accepted).toEqual(['term:vt:end','day:2027-01-15','day:2026-10-12']);
 await expect(cell(page,'måndag 12 oktober 2026')).toHaveClass(/ly-lovdag/);
 expect(errors).toEqual([]);
});

test('Behåll skolans kalender kvitterar ramen och skillnaderna står kvar',async({page})=>{
 const errors=await openPage(page,'?arbetssatt=ram&ram=andrad','.ly-calendar');
 await page.locator('.ly-frame-banner').getByRole('button',{name:'Behåll skolans kalender'}).click();
 await expect(page.locator('.ly-frame-banner')).toHaveCount(0);
 const sent=await commands(page);
 expect(sent.map(c=>c.body.ops)).toEqual([[{op:'keep_school_calendar',frameVersionId:tid(302)}]]);
 await expect(cell(page,'fredag 15 januari 2027')).toHaveClass(/ly-skoldag/);
 await expect(cell(page,'fredag 15 januari 2027').locator('.ly-frame-mark')).toHaveCount(1);
 await expect(page.locator('.ly-frame-card')).toContainText('Ramens version 2, utgiven 15 oktober 2026');
 expect(errors).toEqual([]);
});

test('huvudmannen ser att ramen har ändrats, utan knappar',async({page})=>{
 const errors=await openPage(page,'?arbetssatt=ram&ram=andrad&roll=huvudman&status=forslag','.ly-calendar');
 await expect(page.locator('.ly-frame-banner')).toHaveCount(0);
 await expect(page.locator('.ly-frame-card')).toContainText('Ramen har ändrats sedan skolan började. Rektorn har inte tagit in ändringen.');
 for(const name of ['Ta in ramens ändringar','Behåll skolans kalender'])await expect(page.getByRole('button',{name})).toHaveCount(0);
 expect(errors).toEqual([]);
});
