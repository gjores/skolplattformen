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
