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

test('skyddad vy och demo har samma kalender och teckenförklaring för samma läsår',async({page})=>{
 await open(page,'?vy=demo');
 const demo={calendar:await fingerprint(page,'.ly-calendar'),legend:await fingerprint(page,'.ly-legend')};
 await open(page);
 const protectedView={calendar:await fingerprint(page,'.ly-calendar'),legend:await fingerprint(page,'.ly-legend')};
 expect(protectedView.calendar.length).toBeGreaterThan(300);
 expect(protectedView.calendar).toEqual(demo.calendar);
 expect(protectedView.legend).toEqual(demo.legend.filter(e=>e.tag!=='button'&&!(e.tag==='svg'||e.tag==='path')));
});
