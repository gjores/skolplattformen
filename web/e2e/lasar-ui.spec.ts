// Simulerat UI-prov för Läsår & skoldagar i skyddad drift (05.1.1). /api/lasar/*
// besvaras av fixturens mock i webbläsaren med en syntetisk skola; ingen databas,
// server eller inloggning. Komponentprov, inte faktiskt prov.
import {test,expect,type Page} from '@playwright/test';
const url='/e2e/fixtures/lasar-preview.html';
const VERSION='51a50000-0000-4000-8000-000000000101';
type Logged={path:string;body:any};
const commands=(page:Page)=>page.evaluate(()=>window.__lasar.commands) as Promise<Logged[]>;
const phone=(name:string)=>name.startsWith('phone');
type Entry={depth:number;tag:string;class:string|null;ariaPressed:string|null;ariaLabel:string|null;disabled:boolean;text:string};

async function open(page:Page,query=''){
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+query);
 await expect(page.locator('.ly-calendar')).toBeVisible();
 return errors;
}
/** Samma fingeravtryck som demoregressionen (e2e/lasar-demo.spec.ts): djup, tagg, class, aria och egen text. */
function fingerprint(page:Page,selector:string):Promise<Entry[]>{
 return page.locator(selector).first().evaluate(root=>{
  const out:Entry[]=[];
  const walk=(el:Element,depth:number)=>{
   const own=Array.from(el.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent??'').join(' ').replace(/\s+/g,' ').trim();
   out.push({depth,tag:el.tagName.toLowerCase(),class:el.getAttribute('class'),ariaPressed:el.getAttribute('aria-pressed'),ariaLabel:el.getAttribute('aria-label'),disabled:el.hasAttribute('disabled'),text:own});
   for(const child of Array.from(el.children))walk(child,depth+1);
  };
  walk(root,0);return out;
 });
}

test('rektorn gör en vardag till lovdag och kommandot sparas',async({page},info)=>{
 const errors=await open(page);
 await expect(page.getByRole('heading',{level:1,name:'Läsår och skoldagar · Syntetiska grundskolan'})).toBeVisible();
 await expect(page.locator('.tp-role-switch')).toHaveCount(0);
 const tool=page.getByRole('button',{name:'Lovdag',exact:true});
 await tool.click();await expect(tool).toHaveAttribute('aria-pressed','true');
 const day=page.locator('td.ly-day',{has:page.locator('button[title^="onsdag 7 oktober 2026 ·"]')});
 await expect(day).toHaveClass(/ly-skoldag/);
 const button=day.locator('button');
 if(phone(info.project.name))await button.tap();else await button.click();
 await expect(page.locator('.tp-cover-side')).toContainText(/Sparat \d{2}:\d{2}/);
 const sent=await commands(page);
 expect(sent).toHaveLength(1);
 expect(sent[0].path).toBe('/api/lasar/kommando');
 expect(sent[0].body.ops).toEqual([{op:'set_days',dates:['2026-10-07'],kind:'lovdag'}]);
 expect(sent[0].body.expectedRevision).toBe(3);
 expect(sent[0].body.versionId).toBe(VERSION);
 expect(sent[0].body.commandId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
 expect(sent[0].body.payloadHash).toMatch(/^sha256:[0-9a-f]{64}$/);
 expect(await page.evaluate(()=>window.__lasar.revision())).toBe(4);
 await expect(day).toHaveClass(/ly-lovdag/);
 await expect(page.locator('button[title="onsdag 7 oktober 2026 · Lovdag"]')).toBeVisible();
 expect(errors).toEqual([]);
});

test('läsläge utan skrivförmåga skickar inget kommando',async({page},info)=>{
 const errors=await open(page,'?roll=lasare');
 await expect(page.locator('.tp-cover-side')).toContainText('Läsvy');
 await expect(page.getByRole('button',{name:'Lovdag',exact:true})).toBeDisabled();
 const button=page.locator('button[title^="onsdag 7 oktober 2026 ·"]');
 if(phone(info.project.name))await button.tap();else await button.click();
 await expect(button).toHaveAttribute('aria-pressed','true');
 expect(await commands(page)).toEqual([]);
 await expect(page.locator('td.ly-day',{has:button})).toHaveClass(/ly-skoldag/);
 expect(errors).toEqual([]);
});

test('skyddad vy och demo har samma kalender, teckenförklaring och räknare för samma läsår',async({page})=>{
 const parts=['.ly-calendar','.ly-legend','.ly-terms','.ly-counters','.ly-holidays','.tp-frame-line > span'];
 const read=async()=>Object.fromEntries(await Promise.all(parts.map(async p=>[p,await fingerprint(page,p)])));
 await open(page,'?vy=demo');
 const demo=await read();
 await open(page);
 const protectedView=await read();
 expect(protectedView['.ly-calendar'].length).toBeGreaterThan(300);
 // Terminerna visas i läsläge i den skyddade vyn tills set_term finns (plan 04); fakta och texten jämförs.
 const terms=(entries:Entry[])=>entries.filter(e=>e.class==='ly-term-facts'||e.class==='cell-secondary');
 for(const p of parts){
  if(p==='.ly-terms'){expect(terms(protectedView[p])).toHaveLength(3);expect(terms(protectedView[p])).toEqual(terms(demo[p]));}
  else expect(protectedView[p],p).toEqual(demo[p]);
 }
 // A-08 och A-10: rubrik, statusetikett och avgränsningstext i skyddad drift.
 await expect(page.locator('.ly-side .og-card').first().getByRole('heading',{name:'Kontroll mot förordningarna'})).toBeVisible();
 await expect(page.locator('.ly-side .og-card').first()).toContainText('Inom gränserna');
 await expect(page.locator('.plan-boundary')).toContainText('Fastställandet sparas med datum, version och beslutstext. Tjänstefördelning och timplaner läser den fastställda versionen.');
 await expect(page.locator('.plan-boundary')).not.toContainText('ingen handling i verklig mening');
 await expect(page.locator('.tp-versions button')).toHaveText('Version 1 · Utkast');
 await page.getByRole('button',{name:'Vad räknas som skoldag, lovdag och studiedag?'}).click();
 await expect(page.locator('.ly-definitions')).toBeVisible();
});

// ---- Plan 05.1.1-04: arbetsflöde, versioner, dialoger och lägen (UI-SPEC avsnitt 9, 12, 13, 16 fall 2–4, 7–9).
// Simulerat mot fixturens mock; förmågorna i mocken är en efterbildning och bevisar inte behörighet.
const decisions=(page:Page)=>page.evaluate(()=>window.__lasar.decisions) as Promise<Logged[]>;
const workflow=(page:Page)=>page.locator('.tp-workflow-actions');
const dialog=(page:Page)=>page.getByRole('dialog');
const dayButton=(page:Page,label:string)=>page.locator(`button[title^="${label} ·"]`);
const CONFLICT='Kalendern ändrades av någon annan. Den har lästs om och din senaste ändring sparades inte. Gör om ändringen om den fortfarande behövs.';
async function press(page:Page,info:{project:{name:string}},label:string){
 const b=dayButton(page,label);if(phone(info.project.name))await b.tap();else await b.click();
}
/** Lägger till en dag i markeringen utan att ändra den: kommando-klick på dator, Markera flera på telefon. */
async function addToSelection(page:Page,info:{project:{name:string}},label:string){
 if(phone(info.project.name)){
  const mode=page.getByRole('button',{name:'Markera flera'});
  if(await mode.getAttribute('aria-pressed')!=='true')await mode.click();
  await dayButton(page,label).tap();
 }else await dayButton(page,label).click({modifiers:['ControlOrMeta']});
}
async function runDialog(page:Page,button:string,text:string){
 await dialog(page).getByRole('textbox').fill(text);
 await dialog(page).getByRole('button',{name:button,exact:true}).click();
 await expect(dialog(page)).toBeHidden();
}

test('skicka, ta tillbaka och skicka igen',async({page})=>{
 const errors=await open(page);
 await expect(workflow(page).getByRole('button')).toHaveText(['Återställ förslaget','Skicka förslag']);
 await workflow(page).getByRole('button',{name:'Skicka förslag'}).click();
 await expect(dialog(page).getByRole('heading',{name:'Skicka förslag till huvudmannen'})).toBeVisible();
 await expect(dialog(page).locator('.review-summary')).toContainText('Kontroll mot förordningarna');
 await expect(dialog(page).locator('.review-summary')).toContainText('Inom gränserna');
 await dialog(page).getByRole('button',{name:'Skicka förslag',exact:true}).click();
 await expect(dialog(page)).toContainText('Beskriv förslaget för huvudmannen.');
 expect(await decisions(page)).toEqual([]);
 await runDialog(page,'Skicka förslag','Syntetiskt förslag med höstlov vecka 44.');
 await expect(page.locator('.admin-notice')).toContainText('Förslaget är skickat till huvudmannen.');
 await expect(page.locator('.tp-cover-side .tp-status')).toHaveText('Förslag till huvudman');
 await expect(workflow(page).getByRole('button')).toHaveText(['Ta tillbaka']);
 await workflow(page).getByRole('button',{name:'Ta tillbaka'}).click();
 await expect(page.locator('.admin-notice')).toContainText('Förslaget är taget tillbaka.');
 await page.getByRole('button',{name:'Stäng meddelandet'}).click();
 await expect(page.locator('.admin-notice')).toHaveCount(0);
 await workflow(page).getByRole('button',{name:'Skicka förslag'}).click();
 await runDialog(page,'Skicka förslag','Skickas igen.');
 await expect(page.locator('.tp-cover-side .tp-status')).toHaveText('Förslag till huvudman');
 const sent=await decisions(page);
 expect(sent.map(d=>d.body.action)).toEqual(['submit','withdraw','submit']);
 expect(sent[0].body.text).toBe('Syntetiskt förslag med höstlov vecka 44.');
 expect(sent.map(d=>d.body.expectedRevision)).toEqual([3,4,5]);
 await expect(page.locator('.admin-history')).toContainText('Rektor · Syntetisk rektor');
 await expect(page.locator('.admin-history > div').first()).toContainText(/Rektor · Syntetisk rektor · \d{4}-\d{2}-\d{2} \d{2}:\d{2} · Version 1/);
 expect(errors).toEqual([]);
});

test('huvudmannen återsänder med skäl',async({page})=>{
 await open(page,'?roll=huvudman&status=forslag');
 await expect(page.locator('.tp-cover-side')).toContainText('Läsvy');
 await expect(workflow(page).getByRole('button')).toHaveText(['Återsänd','Fastställ']);
 await workflow(page).getByRole('button',{name:'Återsänd'}).click();
 await dialog(page).getByRole('button',{name:'Återsänd',exact:true}).click();
 await expect(dialog(page)).toContainText('Ange vad rektorn behöver ändra.');
 await runDialog(page,'Återsänd','Flytta studiedagen till en onsdag.');
 await expect(page.locator('.admin-notice')).toContainText('Förslaget är återsänt till rektorn.');
 await expect(page.locator('.tp-cover-side .tp-status')).toHaveText('Återsänd för ändring');
 await expect(workflow(page).getByRole('button')).toHaveCount(0);
 await expect(page.locator('.admin-history > div').first()).toContainText('Huvudman · Syntetisk huvudman');
 await expect(page.locator('.admin-history > div').first()).toContainText('Flytta studiedagen till en onsdag.');
});

test('huvudmannen fastställer med beslutstext',async({page})=>{
 await open(page,'?roll=huvudman&status=forslag');
 await workflow(page).getByRole('button',{name:'Fastställ'}).click();
 await expect(dialog(page).getByRole('heading',{name:'Fastställ läsårstiderna'})).toBeVisible();
 await runDialog(page,'Fastställ','Beslut i syntetisk nämnd 2026-11-10, dnr 1.');
 await expect(page.locator('.admin-notice')).toContainText('Läsåret 2026/27 är fastställt.');
 await expect(page.locator('.tp-cover-side .tp-status')).toHaveText('Fastställd');
 await expect(page.locator('.tp-cover-side')).toContainText('Gäller: version 1');
 await expect(page.locator('.ly-version-line')).toHaveText('Version 1 gäller sedan 10 november 2026.');
 await expect(page.locator('.tp-versions button')).toHaveText(['Version 1 · Fastställd · gäller']);
 await expect(workflow(page).getByRole('button')).toHaveText(['Öppna för ändring']);
 expect((await decisions(page)).map(d=>[d.body.action,d.body.text])).toEqual([['approve','Beslut i syntetisk nämnd 2026-11-10, dnr 1.']]);
});

test('öppna för ändring ger version 2 som utkast och version 1 märkt gäller',async({page})=>{
 await open(page,'?roll=huvudman&status=faststalld');
 await workflow(page).getByRole('button',{name:'Öppna för ändring'}).click();
 await expect(dialog(page)).toContainText('Version 1 gäller tills den nya versionen är fastställd. Rektorn kan ändra kommande dagar och skicka ett nytt förslag. Passerade dagar är låsta.');
 await runDialog(page,'Öppna','Ny studiedag i mars.');
 await expect(page.locator('.tp-versions button')).toHaveText(['Version 1 · Fastställd · gäller','Version 2 · Utkast']);
 await expect(page.locator('.tp-versions button').nth(1)).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.ly-version-line')).toHaveText('Version 2 är utkast. Version 1, fastställd 18 mars 2026, gäller tills den nya versionen är fastställd.');
 await expect(page.locator('.tp-workflow-text')).toContainText('Rektorn arbetar med utkastet.');
 await expect(page.locator('.tp-cover-side')).toContainText('Gäller: version 1');
 await expect(workflow(page).getByRole('button')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__lasar.versions())).toBe(2);
});

test('rektorn begär ändring av en fastställd kalender',async({page})=>{
 await open(page,'?status=faststalld');
 await expect(workflow(page).getByRole('button')).toHaveText(['Begär ändring']);
 await workflow(page).getByRole('button',{name:'Begär ändring'}).click();
 await expect(dialog(page).getByRole('heading',{name:'Begär ändring av läsårskalendern'})).toBeVisible();
 await dialog(page).getByRole('button',{name:'Skicka begäran'}).click();
 await expect(dialog(page)).toContainText('Ange orsaken till ändringen.');
 await runDialog(page,'Skicka begäran','En extra studiedag i mars.');
 await expect(page.locator('.tp-workflow-text')).toContainText('Rektorn har begärt ändring: ”En extra studiedag i mars.”');
 await expect(workflow(page).getByRole('button')).toHaveText(['Ta tillbaka begäran']);
 expect((await decisions(page)).map(d=>d.body.action)).toEqual(['request_change']);
});

test('huvudmannen avslår begäran med motivering',async({page})=>{
 await open(page,'?roll=huvudman&status=faststalld&begaran=open');
 await expect(page.locator('.tp-workflow-text')).toContainText('Rektorn har begärt ändring: ”Ny studiedag i mars för syntetisk fortbildning.”. Öppna kalendern för ändring eller avslå begäran med motivering.');
 await expect(workflow(page).getByRole('button')).toHaveText(['Avslå begäran','Öppna för ändring']);
 await workflow(page).getByRole('button',{name:'Avslå begäran'}).click();
 await dialog(page).getByRole('button',{name:'Avslå begäran'}).click();
 await expect(dialog(page)).toContainText('Ange skälet till avslaget.');
 await runDialog(page,'Avslå begäran','Studiedagarna räcker.');
 await expect(page.locator('.tp-workflow-text')).toContainText(/Huvudmannen avslog begäran \d+ \p{L}+ \d{4}: ”Studiedagarna räcker.”\. Version 1 gäller fortsatt\./u);
 await expect(workflow(page).getByRole('button')).toHaveText(['Öppna för ändring']);
});

test('passerad dag går inte att ändra med klick, vecka eller meny',async({page},info)=>{
 const errors=await open(page,'?version=2&passerade=1');
 const past=page.locator('td.ly-day',{has:dayButton(page,'onsdag 7 oktober 2026')});
 await expect(past).toHaveClass(/ly-past/);
 await expect(dayButton(page,'onsdag 7 oktober 2026')).toHaveAttribute('title','onsdag 7 oktober 2026 · Skoldag · passerad dag, låst');
 await expect(page.locator('.ly-legend')).toContainText('Passerad dag (låst)');
 await page.getByRole('button',{name:'Lovdag',exact:true}).click();
 await press(page,info,'onsdag 7 oktober 2026');
 await expect(dayButton(page,'onsdag 7 oktober 2026')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.ly-marking')).toContainText('passerad dag, låst');
 await expect(past).toHaveClass(/ly-skoldag/);
 await page.getByRole('button',{name:/^Vecka 41: markera/}).click();
 await expect(page.locator('.ly-marking-what')).toContainText('5 dagar markerade');
 await expect(page.locator('.ly-marking-what')).toContainText('5 skoldagar · 5 låsta');
 if(!phone(info.project.name)){
  await dayButton(page,'onsdag 7 oktober 2026').click({button:'right'});
  const menu=page.locator('.ly-menu');
  await expect(menu).toContainText('Markerade dagar är låsta');
  await expect(menu.getByRole('menuitem',{name:'Passerade dagar är låsta'})).toHaveAttribute('aria-disabled','true');
  await page.keyboard.press('Escape');
 }
 expect(await commands(page)).toEqual([]);
 await expect(page.locator('#ly-ht-start')).toHaveText('måndag 17 augusti 2026');
 await press(page,info,'onsdag 18 november 2026');
 await expect(page.locator('.tp-cover-side')).toContainText(/Sparat \d{2}:\d{2}/);
 const sent=await commands(page);
 expect(sent.map(c=>c.body.ops)).toEqual([[{op:'set_days',dates:['2026-11-18'],kind:'lovdag'}]]);
 expect(errors).toEqual([]);
});

test('läsläge: administratör, huvudman på utkast och äldre version visar inga skrivknappar',async({page})=>{
 await open(page,'?roll=admin');
 await expect(workflow(page).getByRole('button')).toHaveCount(0);
 await expect(page.locator('.tp-cover-side')).toContainText('Läsvy');
 await expect(page.locator('.tp-comment-box')).toHaveCount(0);
 await open(page,'?roll=huvudman');
 await expect(workflow(page).getByRole('button')).toHaveCount(0);
 await expect(page.locator('.tp-workflow-text')).toHaveText('Rektorn arbetar med utkastet.');
 await open(page,'?version=2');
 await expect(workflow(page).getByRole('button')).toHaveText(['Återställ förslaget','Skicka förslag']);
 await page.locator('.tp-versions').getByRole('button',{name:'Version 1 · Fastställd · gäller'}).click();
 await expect(page.locator('.tp-versions button').first()).toHaveAttribute('aria-pressed','true');
 await expect(workflow(page).getByRole('button')).toHaveCount(0);
 await expect(page.locator('.ly-tools-hint')).toHaveText('Du läser version 1. Den gäller fortfarande.');
 await expect(page.locator('.tp-cover-side')).toContainText('Läsvy');
 const reads=await page.evaluate(()=>window.__lasar.reads) as Logged[];
 expect(reads.at(-1)!.body.versionId).toBe('51a50000-0000-4000-8000-000000000101');
});

test('konflikt 409 läser om kalendern och behåller markeringen',async({page},info)=>{
 await open(page,'?fel=konflikt');
 await page.getByRole('button',{name:'Lovdag',exact:true}).click();
 await press(page,info,'onsdag 7 oktober 2026');
 await expect(page.locator('.tp-inline-error')).toHaveText(CONFLICT);
 await expect(page.locator('td.ly-day',{has:dayButton(page,'fredag 20 november 2026')})).toHaveClass(/ly-lovdag/);
 await expect(page.locator('td.ly-day',{has:dayButton(page,'onsdag 7 oktober 2026')})).toHaveClass(/ly-skoldag/);
 await expect(dayButton(page,'onsdag 7 oktober 2026')).toHaveAttribute('aria-pressed','true');
});

test('osäker skrivning, nekad behörighet och nekad passerad dag visar texterna och läser om',async({page},info)=>{
 await open(page,'?fel=osaker');
 await page.getByRole('button',{name:'Lovdag',exact:true}).click();
 await press(page,info,'onsdag 7 oktober 2026');
 await expect(page.locator('.tp-inline-error')).toHaveText('Det gick inte att bekräfta att ändringen sparades. Kalendern har lästs om. Kontrollera dagen.');
 await expect(page.locator('td.ly-day',{has:dayButton(page,'onsdag 7 oktober 2026')})).toHaveClass(/ly-lovdag/);
 await open(page,'?fel=403');
 await page.getByRole('button',{name:'Lovdag',exact:true}).click();
 await press(page,info,'onsdag 7 oktober 2026');
 await expect(page.locator('.tp-inline-error')).toHaveText('Du har inte behörighet att ändra den här kalendern. Kalendern har lästs om.');
 await expect(page.locator('.tp-cover-side')).toContainText('Läsvy');
 await expect(page.getByRole('button',{name:'Lovdag',exact:true})).toBeDisabled();
 await expect(workflow(page).getByRole('button')).toHaveCount(0);
 await open(page,'?fel=passerad');
 await page.getByRole('button',{name:'Lovdag',exact:true}).click();
 await press(page,info,'onsdag 7 oktober 2026');
 await expect(page.locator('.tp-inline-error')).toContainText('Passerade dagar kan inte ändras.');
 await expect(page.locator('td.ly-day',{has:dayButton(page,'onsdag 7 oktober 2026')})).toHaveClass(/ly-skoldag/);
});

test('engångskod och regelnekande håller dialogen öppen med texten kvar',async({page})=>{
 await open(page,'?fel=mfa');
 await workflow(page).getByRole('button',{name:'Skicka förslag'}).click();
 await dialog(page).getByRole('textbox').fill('Förslag som kräver verifiering.');
 await dialog(page).getByRole('button',{name:'Skicka förslag',exact:true}).click();
 await expect(dialog(page)).toContainText('Verifiering med engångskod krävs.');
 await expect(dialog(page).getByRole('button',{name:'Verifiera med engångskod'})).toBeVisible();
 await expect(dialog(page).getByRole('textbox')).toHaveValue('Förslag som kräver verifiering.');
 await open(page,'?fel=regler');
 await workflow(page).getByRole('button',{name:'Skicka förslag'}).click();
 await dialog(page).getByRole('textbox').fill('Förslag.');
 await dialog(page).getByRole('button',{name:'Skicka förslag',exact:true}).click();
 await expect(dialog(page).locator('.validation-warning')).toContainText('Förslaget kunde inte skickas:');
 await expect(dialog(page).getByRole('textbox')).toHaveValue('Förslag.');
 await expect(page.locator('.tp-cover-side .tp-status')).toHaveText('Utkast');
});

test('återställ förslaget kräver bekräftelse i appens dialog',async({page},info)=>{
 await open(page);
 page.on('dialog',d=>{throw new Error(`webbläsarens dialog: ${d.message()}`);});
 await page.getByRole('button',{name:'Lovdag',exact:true}).click();
 await press(page,info,'onsdag 7 oktober 2026');
 await expect(page.locator('.tp-cover-side')).toContainText(/Sparat/);
 await workflow(page).getByRole('button',{name:'Återställ förslaget'}).click();
 const confirm=page.getByRole('alertdialog');
 await expect(confirm.getByRole('heading',{name:'Återställ förslaget?'})).toBeVisible();
 await confirm.getByRole('button',{name:'Behåll förslaget'}).click();
 await expect(confirm).toBeHidden();
 expect((await commands(page)).length).toBe(1);
 await workflow(page).getByRole('button',{name:'Återställ förslaget'}).click();
 await page.getByRole('alertdialog').getByRole('button',{name:'Återställ',exact:true}).click();
 await expect(page.locator('.admin-notice')).toContainText('Terminer och lov är återställda till förslaget.');
 await expect(page.locator('td.ly-day',{has:dayButton(page,'onsdag 7 oktober 2026')})).toHaveClass(/ly-skoldag/);
 expect((await commands(page)).at(-1)!.body.ops).toEqual([{op:'reset_to_proposal'}]);
});

test('anteckningen sparas vid Enter, och osparad text frågar innan versionsbyte',async({page},info)=>{
 await open(page,'?version=2');
 await addToSelection(page,info,'måndag 26 oktober 2026');
 const field=page.locator('#ly-day-note');
 await field.fill('Syntetiskt höstlov');
 await expect(page.locator('.ly-note-status')).toHaveText('Osparad anteckning');
 expect(await commands(page)).toEqual([]);
 await field.press('Enter');
 await expect(page.locator('.ly-note-status')).toHaveCount(0);
 await expect(page.locator('.tp-cover-side')).toContainText(/Sparat \d{2}:\d{2}/);
 expect((await commands(page)).map(c=>c.body.ops)).toEqual([[{op:'set_notes',dates:['2026-10-26'],note:'Syntetiskt höstlov'}]]);
 // Blur sparar också, även när fokus går till versionsvalet.
 await field.fill('Syntetiskt lov');
 await page.locator('.tp-versions').getByRole('button',{name:'Version 1 · Fastställd · gäller'}).click();
 await expect(page.locator('.tp-versions button').first()).toHaveAttribute('aria-pressed','true');
 expect((await commands(page)).map(c=>c.body.ops).at(-1)).toEqual([{op:'set_notes',dates:['2026-10-26'],note:'Syntetiskt lov'}]);
 // Osparad kommentar: versionsbyte frågar i appens dialog först.
 await page.getByRole('textbox',{name:'Ny kommentar'}).fill('Ett utkast till kommentar.');
 await page.locator('.tp-versions').getByRole('button',{name:'Version 2 · Utkast'}).click();
 const ask=page.getByRole('alertdialog');
 await expect(ask.getByRole('heading',{name:'Osparade ändringar'})).toBeVisible();
 await ask.getByRole('button',{name:'Stanna kvar'}).click();
 await expect(page.locator('.tp-versions button').first()).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('textbox',{name:'Ny kommentar'})).toHaveValue('Ett utkast till kommentar.');
});
