// Isolated component evidence. Every API request is intercepted; no real registry or database.
import { test, expect, type Page, type Route } from '@playwright/test';
import { parseSchoolRegistryCommand, type SchoolRegistryCommand, type LocalRegistrySchool } from '../lib/school-registry';
const id = (n:number) => `77101410-0000-4000-8000-${String(n).padStart(12,'0')}`;
const local:LocalRegistrySchool = { id:id(4),code:'11111111',name:'Syntetiska gamla skolan',status:'AKTIV',municipalityCode:'0180',municipalityName:'Testkommun',locality:'Testorten',address:{street:'Gamla vägen 1',postalCode:'12345',locality:'Testorten'},principalName:'Lokalt utsedd rektor',schoolTypes:['GY','GR'],sourceSchoolTypes:['GY','GR'],revision:'a'.repeat(64),sourceFetchedAt:'2026-10-01',canUpdate:true };
const registry = (code:string) => ({code,name:code===local.code?'Syntetiska uppdaterade skolan':'Syntetiska nya skolan',status:'AKTIV',municipalityCode:'0180',municipalityName:'Testkommun',locality:'Testorten',address:{street:'Nya vägen 2',postalCode:'12345',locality:'Testorten'},organizationNumber:'9999999999',schoolTypes:['GY'],programmes:{GY:['SA']},modified:'2026-10-14',registryFingerprint:'b'.repeat(64),fetchedAt:'2026-10-14T10:00:00.000Z'});
type Scenario = 'normal'|'lost-saved'|'lost-not-found'|'conflict'|'read-fail'|'missing-org'|'denied'|'unknown-status'|'slow-search';
async function mock(page:Page,scenario:Scenario='normal') {
  const commands:SchoolRegistryCommand[]=[],statuses:SchoolRegistryCommand[]=[],unexpected:string[]=[],errors:string[]=[];let stored=false,listReads=0,delayed:(()=>void)|null=null;
  page.on('pageerror',error=>errors.push(error.message));
  const receipt=(c:SchoolRegistryCommand)=>({commandId:c.commandId,status:'saved',unitId:c.operation==='update'?local.id:id(5),code:c.code,operation:c.operation,revision:'c'.repeat(64),replayed:false});
  const reply=(route:Route,json:unknown,status=200)=>route.fulfill({status,json});
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname,body=route.request().method()==='POST'?route.request().postDataJSON():null;
    if(path==='/api/skolor'){
      listReads++;
      if(scenario==='read-fail'&&listReads===2)return reply(route,{code:'audit_unavailable'},503);
      const units=[structuredClone(local)];
      if(stored){const c=commands.at(-1)!;const r=registry(c.code);const updated={...local,...r,id:c.operation==='update'?local.id:id(5),principalName:c.operation==='update'?local.principalName:null,schoolTypes:c.operation==='update'?local.schoolTypes:r.schoolTypes,sourceSchoolTypes:r.schoolTypes,revision:'c'.repeat(64),sourceFetchedAt:r.fetchedAt,canUpdate:c.operation==='update'};
        // Strip only upstream contract fields; local list has its own strict schema.
        const {organizationNumber:_o,programmes:_p,modified:_m,registryFingerprint:_f,fetchedAt:_t,...row}=updated;
        if(c.operation==='update')units[0]=row;else units.push(row);
      }
      return reply(route,{organizer:{id:id(3),name:'Syntetisk huvudman',organizationNumber:scenario==='missing-org'?null:'9999999999'},units});
    }
    if(path==='/api/skolor/register'){
      if(scenario==='denied')return reply(route,{code:'forbidden'},403);
      if(body.kind==='organizationNumber')return reply(route,{kind:body.kind,organizationNumber:body.value,units:[{code:'22222222',name:'Syntetiska nya skolan',status:'AKTIV'},{code:local.code,name:local.name,status:'AKTIV'}]});
      if(scenario==='slow-search'&&body.value===local.code)await new Promise<void>(resolve=>{delayed=resolve;});
      return reply(route,{kind:'code',unit:registry(body.value),local:body.value===local.code?local:null});
    }
    if(path==='/api/skolor/register/spara'){
      const c=parseSchoolRegistryCommand(body);commands.push(c);
      if(scenario==='conflict')return reply(route,{code:'conflict'},409);
      if(commands.length===1&&['lost-saved','lost-not-found','unknown-status'].includes(scenario)){stored=scenario==='lost-saved';return reply(route,'Synthetic lost reply',502);}
      stored=true;return reply(route,receipt(c));
    }
    if(path==='/api/skolor/register/status'){
      const c=parseSchoolRegistryCommand(body);statuses.push(c);expect(c).toEqual(commands[0]);
      if(scenario==='unknown-status')return reply(route,'Synthetic unavailable status',502);
      return reply(route,stored?receipt(c):{commandId:c.commandId,status:'not_found'});
    }
    unexpected.push(path);return reply(route,{code:'unexpected'},500);
  });
  await page.goto('/e2e/fixtures/school-registry-preview.html');await expect(page.getByRole('heading',{name:'Dina skolenheter'})).toBeVisible();
  return {commands,statuses,release:()=>{expect(delayed).not.toBeNull();delayed!();},verify:()=>{expect(unexpected).toEqual([]);expect(errors).toEqual([]);}};
}
async function search(page:Page,code='22222222') {await page.getByLabel('Skolenhetskod (8 siffror)',{exact:true}).fill(code);await page.getByRole('button',{name:'Sök skola',exact:true}).click();await expect(page.getByRole('heading',{name:/Granska Syntetiska/})).toBeVisible();}
async function geometry(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);}

test('kodimport visar granskning och skapar inga nya mandat',async({page},info)=>{const m=await mock(page);await search(page);await expect(page.getByRole('heading',{name:'Granska Syntetiska nya skolan'})).toBeFocused();await geometry(page);await page.screenshot({path:info.outputPath('import-preview.png'),fullPage:true});await page.getByRole('button',{name:'Lägg till skolenhet',exact:true}).click();await expect(page.getByRole('status')).toContainText('Skolenheten är tillagd');await expect(page.getByText('Importerad skola. Ett skolmandat behövs för fortsatt arbete.')).toBeVisible();await expect(page.getByText('Visas med skolmandat',{exact:true})).toBeVisible();expect(m.commands).toHaveLength(1);expect(m.commands[0].expectedRevision).toBeNull();await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeEnabled();m.verify();});
test('organisationssökning väljer en skola innan sparning',async({page})=>{const m=await mock(page);await page.getByLabel('Organisationsnummer',{exact:true}).check();await expect(page.getByLabel('Huvudmannens organisationsnummer',{exact:true})).toHaveValue('9999999999');await page.getByRole('button',{name:'Sök skola',exact:true}).click();await page.getByRole('button',{name:'Granska Syntetiska nya skolan',exact:true}).click();await expect(page.getByRole('heading',{name:'Granska Syntetiska nya skolan'})).toBeVisible();expect(m.commands).toHaveLength(0);m.verify();});
test('uppdatering bevarar lokal rektor och frånvarande skolform',async({page},info)=>{const m=await mock(page);await page.getByRole('button',{name:'Hämta registeruppgifter för Syntetiska gamla skolan'}).click();await expect(page.getByRole('heading',{name:'Granska Syntetiska uppdaterade skolan'})).toBeVisible();await expect(page.getByText('Nu: Gamla vägen 1, 12345 Testorten')).toBeVisible();await expect(page.getByText(/Lokala skolformer behålls: Grundskola/)).toBeVisible();await page.screenshot({path:info.outputPath('update-preview.png'),fullPage:true});await geometry(page);await page.getByRole('button',{name:'Uppdatera registeruppgifter',exact:true}).click();await expect(page.getByRole('status')).toContainText('Registeruppgifterna är uppdaterade');const card=page.getByRole('heading',{name:'Syntetiska uppdaterade skolan',exact:true}).locator('..');await expect(card).toContainText('Lokalt utsedd rektor');await expect(card).toContainText('Grundskola');expect(m.commands[0]).toMatchObject({operation:'update',expectedRevision:local.revision});m.verify();});
test('förlorat sparat svar återläses utan ny import',async({page})=>{const m=await mock(page,'lost-saved');await search(page);await page.getByRole('button',{name:'Lägg till skolenhet',exact:true}).click();await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();await page.getByRole('button',{name:'Läs sparstatus',exact:true}).click();await expect(page.getByRole('status')).toContainText('Skolenheten är tillagd');expect(m.commands).toHaveLength(1);expect(m.statuses).toHaveLength(1);m.verify();});
test('not_found sparas om med samma fulla kommando',async({page})=>{const m=await mock(page,'lost-not-found');await search(page);await page.getByRole('button',{name:'Lägg till skolenhet',exact:true}).click();await page.getByRole('button',{name:'Läs sparstatus',exact:true}).click();await page.getByRole('button',{name:'Försök spara igen',exact:true}).click();await expect(page.getByRole('status')).toContainText('Skolenheten är tillagd');expect(m.commands).toHaveLength(2);expect(m.commands[1]).toEqual(m.commands[0]);m.verify();});
test('okänd status behåller spärr och granskat kommando',async({page})=>{const m=await mock(page,'unknown-status');await search(page);await page.getByRole('button',{name:'Lägg till skolenhet',exact:true}).click();await page.getByRole('button',{name:'Läs sparstatus',exact:true}).click();await expect(page.getByRole('button',{name:'Läs sparstatus',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();await expect(page.getByRole('button',{name:'Lägg till skolenhet',exact:true})).toBeDisabled();expect(m.commands).toHaveLength(1);m.verify();});
test('konflikt kräver nytt granskat underlag',async({page})=>{const m=await mock(page,'conflict');await search(page);await page.getByRole('button',{name:'Lägg till skolenhet',exact:true}).click();await expect(page.getByRole('alert')).toContainText('ändrats');await expect(page.getByRole('button',{name:'Lägg till skolenhet',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Hämta nytt underlag',exact:true}).click();await expect(page.getByRole('button',{name:'Lägg till skolenhet',exact:true})).toBeEnabled();expect(m.commands).toHaveLength(1);m.verify();});
test('bekräftad sparning följd av läsfel skapar inte igen',async({page})=>{const m=await mock(page,'read-fail');await search(page);await page.getByRole('button',{name:'Lägg till skolenhet',exact:true}).click();await expect(page.getByRole('status')).toContainText('Sparandet är bekräftat, men listan kunde inte läsas');await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();await page.getByRole('button',{name:'Läs om listan',exact:true}).click();await expect(page.getByRole('status')).toContainText('Skolenheten är tillagd');expect(m.commands).toHaveLength(1);m.verify();});
test('saknat organisationsnummer och annan huvudman ger ingen import',async({page})=>{const m=await mock(page,'missing-org');await expect(page.getByText(/Huvudmannen saknar organisationsnummer/)).toBeVisible();await expect(page.getByRole('button',{name:'Sök skola',exact:true})).toHaveCount(0);expect(m.commands).toHaveLength(0);m.verify();});
test('nekad registerträff exponeras inte som sparbar skola',async({page})=>{const m=await mock(page,'denied');await page.getByLabel('Skolenhetskod (8 siffror)',{exact:true}).fill('22222222');await page.getByRole('button',{name:'Sök skola',exact:true}).click();await expect(page.getByRole('alert')).toContainText('tillåter inte');await expect(page.getByRole('button',{name:'Lägg till skolenhet',exact:true})).toHaveCount(0);m.verify();});
test('sent svar kan inte ersätta ny sökning eller nytt uppdrag',async({page})=>{const m=await mock(page,'slow-search');await page.getByLabel('Skolenhetskod (8 siffror)',{exact:true}).fill(local.code);await page.getByRole('button',{name:'Sök skola',exact:true}).click();await page.getByLabel('Skolenhetskod (8 siffror)',{exact:true}).fill('22222222');await page.getByRole('button',{name:'Sök skola',exact:true}).click();await expect(page.getByRole('heading',{name:'Granska Syntetiska nya skolan'})).toBeVisible();m.release();await page.getByRole('button',{name:'Simulera byte av uppdrag'}).click();await expect(page.getByRole('heading',{name:'Dina skolenheter'})).toBeVisible();await expect(page.getByRole('heading',{name:/Granska Syntetiska/})).toHaveCount(0);expect(m.commands).toHaveLength(0);m.verify();});

test('fristående mänskligt prov fungerar utan API-interception',async({page},info)=>{
 const requests:string[]=[];const errors:string[]=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))requests.push(request.url());});page.on('pageerror',error=>errors.push(error.message));
 // No page.route here: this is the URL the user can open directly.
 await page.goto('/e2e/fixtures/school-registry-manual.html');await expect(page.getByRole('heading',{name:'Avskilt användarprov',exact:true})).toBeVisible();
 await page.getByLabel('Organisationsnummer',{exact:true}).check();await page.getByRole('button',{name:'Sök skola',exact:true}).click();await page.getByRole('button',{name:'Granska Provskolan Eken',exact:true}).click();
 await page.getByRole('button',{name:'Lägg till skolenhet',exact:true}).click();await expect(page.getByRole('status')).toContainText('Skolenheten är tillagd');await expect(page.getByText('Importerad skola. Ett skolmandat behövs för fortsatt arbete.')).toBeVisible();await expect(page.getByText('Visas med skolmandat',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Hämta registeruppgifter för Provskolan Björken',exact:true}).click();await expect(page.getByText(/Lokala skolformer behålls: Grundskola/)).toBeVisible();await page.getByRole('button',{name:'Uppdatera registeruppgifter',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Registeruppgifterna är uppdaterade');const updated=page.getByRole('heading',{name:'Björkens gymnasium',exact:true}).locator('..');await expect(updated).toContainText('Alex – lokalt tillsatt rektor');await expect(updated).toContainText('Grundskola');
 await geometry(page);await page.screenshot({path:info.outputPath('manual-after-update.png'),fullPage:true});
 await page.getByRole('button',{name:'Börja om användarprovet',exact:true}).click();await expect(page.getByRole('heading',{name:'Provskolan Björken',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Provskolan Eken',exact:true})).toHaveCount(0);expect(requests).toEqual([]);expect(errors).toEqual([]);
});
