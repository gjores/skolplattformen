// Component/UI evidence only. Mocked responses do not verify server permissions.
import {test,expect} from '@playwright/test';
const id='33000000-0000-4000-8000-000000000051';
const school={id:'33000000-0000-4000-8000-000000000111',name:'Syntetiska skolan'};
const mandate={id,displayName:'Syntetisk lärare',function:'larare',schools:[school],scopeKind:'group',validFrom:'2026-01-01',validTo:null,startsAt:null,endsAt:null,status:'giltigt',approverName:null};
test('namn, mobilbredd och bekräftat avslut',async({page},info)=>{
  let ended=false;
  await page.route('**/api/kund/mandat',r=>r.fulfill({json:{mandates:ended?[]:[mandate]}}));
  await page.route('**/api/kund/uppdrag/avsluta',async r=>{expect(r.request().postDataJSON()).toEqual({assignmentId:id});ended=true;await r.fulfill({json:{assignmentId:id}});});
  await page.goto('/e2e/fixtures/mandate-preview.html');
  await expect(page.getByText('Syntetisk lärare',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  const button=page.getByRole('button',{name:'Avsluta uppdrag för Syntetisk lärare'});
  const box=await button.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:`test-results/mandat-${info.project.name}.png`,fullPage:true});
  await button.click();await page.getByRole('button',{name:'Ja, avsluta uppdraget'}).click();
  await expect(page.getByText('Syntetisk lärare',{exact:true})).toHaveCount(0);expect(ended).toBeTruthy();
});
test('IT-konflikt kräver omläsning före ny ändring',async({page})=>{
  await page.route('**/api/kund/anslutning*',async r=>{
    if(r.request().method()==='PATCH')return r.fulfill({status:409,json:{code:'conflict'}});
    if(new URL(r.request().url()).searchParams.has('unitId'))return r.fulfill({json:{unitId:school.id,enabled:false,version:1}});
    return r.fulfill({json:{schools:[school]}});
  });
  await page.goto('/e2e/fixtures/mandate-preview.html?role=it');
  await expect(page.getByLabel('Skola')).toBeVisible();
  await page.getByRole('button',{name:'Aktivera anslutningen'}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button',{name:'Aktivera anslutningen'})).toBeDisabled();
  await page.getByRole('button',{name:'Hämta aktuellt läge'}).click();
  await expect(page.getByRole('button',{name:'Aktivera anslutningen'})).toBeEnabled();
});
