// Synthetic component evidence with mocked routes only; no database or live authentication.
import {test,expect,type Page} from '@playwright/test';
import type {GrimClassCreateRequest,GrimClassLinkRequest,GrimClassUnderlag} from '../lib/grim-class-timplan';
const gid=(n:number)=>`51a40000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const url='/e2e/fixtures/grim-class-preview.html';
const region=(page:Page)=>page.getByRole('region',{name:'Klasser och läsår för GR/IM',exact:true});
const series={id:gid(50),name:'Grundfördelning',revision:0};
type Row=GrimClassUnderlag['classes'][number];
async function mock(page:Page,{mode='saved',im=false,readOnly=false}:{mode?:string;im?:boolean;readOnly?:boolean}={}){
 const links:GrimClassLinkRequest[]=[],creates:GrimClassCreateRequest[]=[],errors:string[]=[],receipts=new Map<string,unknown>();let failed=false;
 const classes:Row[]=im?[{id:gid(10),name:'IMA',startYear:2026,link:null,candidate:null}]:[
  {id:gid(10),name:'7A',startYear:2026,link:null,candidate:null},
  {id:gid(11),name:'8B',startYear:2026,link:null,candidate:{planId:gid(1),series,version:1,status:'faststalld',columnId:'ak8',revision:0}}];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/klasser/grim/**',async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON();
  const reply=(json:unknown,status=200)=>route.fulfill({status,json});
  if(path.endsWith('/underlag'))return reply({plan:{id:gid(1),offeringId:gid(2),unitId:gid(3),schoolName:'Syntetiska skolan',educationName:im?'Syntetiskt IM':'Syntetisk GR 7–9',kind:im?'introduktionsprogram':'grundskola',series,version:1,status:'faststalld',revision:2},
   schoolYear:2026,columns:im?[{id:'vecka',label:'Per vecka'}]:[{id:'ak7',label:'Åk 7'},{id:'ak8',label:'Åk 8'},{id:'ak9',label:'Åk 9'}],canManage:!readOnly,blockers:[],classes,legacyRows:im?[]:[{className:'9C',columnId:'ak9',revision:0}]});
  if(receipts.has(body.commandId))return reply({...(receipts.get(body.commandId) as object),replayed:true});
  if(mode==='mfa'&&!failed){failed=true;return reply({code:'mfa_required'},403);}
  if(mode==='conflict'&&!failed){failed=true;return reply({code:'grim_class_link_revision'},409);}
  if(path.endsWith('/skapa')){creates.push(body);const row={id:gid(20+creates.length),name:body.name,startYear:2026,link:null,candidate:null};classes.push(row);const r={id:row.id,name:row.name,startYear:2026,replayed:false};receipts.set(body.commandId,r);return reply(r);}
  if(!path.endsWith('/koppla'))throw Error(path);
  links.push(body);
  const row=classes.find(c=>c.id===body.classId)!;const prior=row.link??row.candidate;
  const r={classId:body.classId,schoolYear:2026,planId:body.planId,columnId:body.columnId,revision:(body.expectedLinkRevision??-1)+1,adopted:!row.link&&!!row.candidate,replayed:false};
  receipts.set(body.commandId,r);row.link={planId:body.planId,series,version:1,status:'faststalld',columnId:body.columnId,revision:r.revision};row.candidate=null;void prior;
  if(mode==='lost'&&!failed){failed=true;return route.abort();}
  return reply(r);
 });
 return{links,creates,errors};
}
async function open(page:Page,query=''){await page.goto(url+query);await region(page).getByRole('button',{name:/Koppla klass|Visa klasser/}).click();await expect(region(page).getByRole('heading',{name:'Klasser för läsåret'})).toBeVisible();}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}

test('skapa klass, välj årskurs och koppla; kopplingen läses om',async({page},info)=>{
 const m=await mock(page);await open(page);
 await region(page).getByRole('button',{name:'Skapa klass'}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Klassnamn').fill('7c');await dialog.getByRole('button',{name:'Skapa klass'}).click();
 await expect(region(page).getByText('Klassen 7C är skapad',{exact:false})).toBeVisible();expect(m.creates[0].name).toBe('7C');
 await region(page).getByLabel('Årskurs för 7C').selectOption('ak7');await region(page).getByRole('button',{name:'Koppla 7C'}).click();
 await expect(region(page).getByText('Klassens koppling till Åk 7, version 1 för 2026/27 är sparad.')).toBeVisible();
 expect(m.links).toHaveLength(1);expect(m.links[0]).toMatchObject({columnId:'ak7',expectedLinkRevision:null,previousPlanId:null});
 await expect(region(page).getByRole('button',{name:'7C är kopplad'})).toBeDisabled();
 await region(page).getByLabel('Årskurs för 7C').selectOption('ak8');await region(page).getByRole('button',{name:'Ändra koppling för 7C'}).click();
 await expect(region(page).getByText('Åk 8, version 1',{exact:false})).toBeVisible();expect(m.links[1]).toMatchObject({columnId:'ak8',expectedLinkRevision:0,previousPlanId:gid(1)});
 expect(m.errors).toEqual([]);await noOverflow(page);await page.screenshot({path:info.outputPath('grim-linked.png'),fullPage:true});
});
test('namnrad blir identifierad först när rektor bekräftar kopplingen',async({page})=>{
 const m=await mock(page);await open(page);
 await expect(region(page).getByText('Äldre namnkoppling · Åk 8 – blir identifierad först när du kopplar klassen')).toBeVisible();
 await expect(region(page).getByText('Namnrader utan klass')).toBeVisible();expect(m.links).toEqual([]);
 await region(page).getByRole('button',{name:'Bekräfta namnkoppling för 8B'}).click();
 await expect(region(page).getByText('Namnkopplingen är nu identifierad',{exact:false})).toBeVisible();expect(m.links[0]).toMatchObject({classId:gid(11),columnId:'ak8',expectedLinkRevision:0,previousPlanId:gid(1)});
});
test('IM kopplas bara per vecka',async({page})=>{
 const m=await mock(page,{im:true});await open(page,'?im=1');
 await expect(region(page).getByLabel('Årskurs för IMA')).toHaveCount(0);await expect(region(page).getByText('Per vecka',{exact:true})).toBeVisible();
 await region(page).getByRole('button',{name:'Koppla IMA'}).click();await expect(region(page).getByText('Per vecka, version 1',{exact:false})).toBeVisible();expect(m.links[0].columnId).toBe('vecka');
});
test('409 sparar inget, visar konflikten och läser om',async({page})=>{
 const m=await mock(page,{mode:'conflict'});await open(page);
 await region(page).getByLabel('Årskurs för 7A').selectOption('ak7');await region(page).getByRole('button',{name:'Koppla 7A'}).click();
 await expect(region(page).getByRole('alert')).toContainText('Klassens koppling har ändrats');expect(m.links).toEqual([]);
 await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeEnabled();
});
test('MFA krävs: begäran behålls och skickas inte automatiskt efter omladdning',async({page})=>{
 const m=await mock(page,{mode:'mfa'});await open(page);
 await region(page).getByLabel('Årskurs för 7A').selectOption('ak7');await region(page).getByRole('button',{name:'Koppla 7A'}).click();
 await expect(region(page).getByRole('button',{name:'Verifiera med engångskod'})).toBeVisible();
 await page.reload();await expect(region(page).getByRole('button',{name:'Kontrollera sparstatus'})).toBeVisible();expect(m.links).toEqual([]);
 await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();
 await region(page).getByRole('button',{name:'Kontrollera sparstatus'}).click();await expect(region(page).getByText('är sparad',{exact:false})).toBeVisible();expect(m.links).toHaveLength(1);
});
for(const reload of [false,true])test(`okänt utfall kontrolleras med samma commandId: reload=${reload}`,async({page})=>{
 const m=await mock(page,{mode:'lost'});await open(page);
 await region(page).getByLabel('Årskurs för 7A').selectOption('ak9');await region(page).getByRole('button',{name:'Koppla 7A'}).click();
 await expect(region(page).getByText('Svaret kunde inte bekräftas',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();
 if(reload){await page.reload();await expect(region(page).getByRole('button',{name:'Kontrollera sparstatus'})).toBeVisible();}
 expect(m.links).toHaveLength(1);
 await region(page).getByRole('button',{name:'Kontrollera sparstatus'}).click();await expect(region(page).getByText('är sparad',{exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeEnabled();
 const raw=await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('sp:grim-class:')).length);expect(raw).toBe(0);
});
test('huvudman ser klasser utan redigeringskontroller',async({page})=>{
 const m=await mock(page,{readOnly:true});await page.goto(url+'?hm=1');await region(page).getByRole('button',{name:'Visa klasser'}).click();
 await expect(region(page).getByText('7A',{exact:true})).toBeVisible();
 await expect(region(page).getByRole('button',{name:/^Koppla 7A|Skapa klass|Bekräfta namnkoppling/})).toHaveCount(0);await expect(region(page).getByRole('combobox')).toHaveCount(0);expect(m.links).toEqual([]);
});
test('44 px mål och synlig fokus i skapa-dialogen',async({page},info)=>{
 const m=await mock(page);await open(page);
 const controls=await region(page).locator('button,select').evaluateAll(nodes=>nodes.map(n=>({name:n.getAttribute('aria-label')??n.textContent,height:n.getBoundingClientRect().height})));
 for(const c of controls)expect(c.height,c.name??'control').toBeGreaterThanOrEqual(44);
 await region(page).getByRole('button',{name:'Skapa klass'}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByLabel('Klassnamn')).toBeVisible();
 for(const b of await dialog.locator('button,input').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height)))expect(b).toBeGreaterThanOrEqual(44);
 await page.screenshot({path:info.outputPath('grim-create.png'),fullPage:true});
 await dialog.getByRole('button',{name:'Avbryt'}).click();await expect(region(page).getByRole('button',{name:'Skapa klass'})).toBeFocused();await noOverflow(page);expect(m.creates).toEqual([]);
});
