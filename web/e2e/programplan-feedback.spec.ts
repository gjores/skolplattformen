// Isolated component evidence: real component and catalog; synthetic API only.
import {test,expect,type Page} from '@playwright/test';
import artifact from '../lib/programplan-catalog.generated.json' with {type:'json'};
import {parseProgramplanCatalog} from '../lib/programplan-catalog';
const catalog=parseProgramplanCatalog(artifact),program=catalog.programs.find(p=>p.code==='BF25')!;
const unit={id:'77101400-0000-4000-8000-000000000002',name:'Syntetisk provskola'};
const codes=new Set([...program.foundation,...program.programmeSpecific,...program.orientations.flatMap(o=>o.subjects),...program.specialization].filter(s=>s.subjectVersion!==null).map(s=>s.code));
async function open(page:Page){
 const writes:Record<string,any>[]=[],unexpected:string[]=[],errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.clock.setFixedTime(new Date('2026-10-31T10:00:00Z'));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/programplaner/val'){
   const selection=route.request().postDataJSON();
   return route.fulfill({json:{units:[unit],canCreateEducation:true,catalogs:selection.unitId?[{catalogId:catalog.catalogId,source:catalog.source}]:[],selection,programs:selection.catalogId?[{programRef:{code:program.code,version:program.version},name:program.name,orientations:program.orientations.map(({code,name})=>({code,name}))}]:[],projection:selection.programRef?{catalogId:catalog.catalogId,source:catalog.source,program,subjects:catalog.subjects.filter(s=>codes.has(s.code))}:null,decisionReady:false}});
  }
  if(path==='/api/programplaner/lista')return route.fulfill({json:{offerings:[],count:0,page:1,pageSize:50}});
  if(path==='/api/programplaner/utbildning/skapa'){writes.push(route.request().postDataJSON());return route.fulfill({status:400,json:{code:'bad_request',message:'Kontrollera den valda inriktningen.'}});}
  unexpected.push(path);return route.fulfill({status:500,json:{code:'unexpected'}});
 });
 await page.goto('/e2e/fixtures/programplan-flow-preview.html');
 const programSelect=page.getByLabel('1. Program');
 await expect(programSelect.getByRole('option',{name:program.name,exact:true})).toHaveCount(1);
 await programSelect.selectOption(`${program.code}:${program.version}`);
 await page.getByLabel('2. Inriktning').selectOption(program.orientations[0].code);
 return {writes,unexpected,errors};
}
async function details(page:Page){await page.getByLabel('Utbildningens namn',{exact:true}).fill('Syntetiskt BF');await page.getByLabel('Elevkull',{exact:true}).fill('2027–2030');await page.getByLabel('Utbildningens exakta startdatum',{exact:true}).fill('2027-08-20');}
test('Granska visar synliga, rättningsbara fältfel och bevarar arbetet',async({page},info)=>{
 const mock=await open(page);
 expect(await page.locator('#pp-new-board').evaluate(e=>e.getBoundingClientRect().height)).toBeGreaterThan(600);
 await page.getByRole('button',{name:'Granska utkast'}).click();
 const alert=page.getByRole('alert');await expect(alert).toBeInViewport({ratio:1});await expect(alert).toBeFocused();await expect(page.getByRole('button',{name:'Granska utkast'})).toBeInViewport({ratio:1});await page.screenshot({path:info.outputPath('validation-error.png')});
 await expect(page.getByRole('region',{name:'Kontrollera före sparning'})).toHaveCount(0);
 await expect(page.locator('#pp-new-name')).toHaveAttribute('aria-invalid','true');
 await expect(page.locator('#pp-new-cohort')).toHaveAttribute('aria-invalid','true');
 await expect(page.locator('#pp-new-start')).toHaveAttribute('aria-invalid','true');
 await page.getByRole('button',{name:'Ange utbildningens exakta startdatum.'}).click();await expect(page.locator('#pp-new-start')).toBeFocused();await expect(page.locator('#pp-new-start')).toBeInViewport();expect(await page.locator('#pp-new-start').evaluate(e=>{const b=e.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===e;})).toBe(true);
 await details(page);await page.getByRole('button',{name:'Granska utkast'}).click();
 await expect(page.getByRole('region',{name:'Kontrollera före sparning'})).toBeInViewport();await expect(alert).toHaveCount(0);expect(mock.writes).toHaveLength(0);
 await page.getByRole('button',{name:'Tillbaka till uppgifterna'}).click();
 await page.locator('#pp-new-start').fill('2020-08-20');await page.getByRole('button',{name:'Granska utkast'}).click();
 await expect(alert).toBeInViewport({ratio:1});await expect(alert).toContainText('Startdatumet måste ligga efter i dag.');
 await page.locator('#pp-new-start').fill('2027-08-20');await page.getByRole('button',{name:'Granska utkast'}).click();await expect(page.getByRole('region',{name:'Kontrollera före sparning'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Kontrollera före sparning'})).toContainText('Syntetiskt BF');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('review.png'),fullPage:true});expect(mock.unexpected).toEqual([]);expect(mock.errors).toEqual([]);
});
test('svarsfel syns vid åtgärden och nationell programversion bevaras',async({page},info)=>{
 const mock=await open(page);await details(page);
 await page.getByText('Programunderlag',{exact:false}).click();
 await expect(page.getByText(`Skolverkets programversion ${program.version}`,{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'Granska utkast'}).click();await page.getByRole('button',{name:'Spara utbildning och utkast'}).click();
 await expect(page.getByRole('alert')).toBeInViewport();await expect(page.getByRole('alert')).toContainText('Kunde inte spara. Uppgifterna kunde inte behandlas. Kontrollera formuläret.');
 await expect(page.locator('#pp-new-name')).toHaveValue('Syntetiskt BF');expect(mock.writes).toHaveLength(1);expect(mock.writes[0].basisReference.programRef).toEqual({code:program.code,version:program.version});
 await page.screenshot({path:info.outputPath('save-error.png')});expect(mock.unexpected).toEqual([]);expect(mock.errors).toEqual([]);
});
