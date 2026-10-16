// Component evidence: endpoints are synthetic, no server mandate claim.
import {test,expect} from '@playwright/test';
const id=(n:number)=>`33000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('external labels preserve log filters and only submit when Visa is chosen',async({page})=>{
 const calls:URL[]=[];await page.route('**/api/logg?*',async route=>{calls.push(new URL(route.request().url()));await route.fulfill({json:{events:[]}});});
 await page.goto('/e2e/fixtures/date-picker-integration-preview.html');await expect(page.getByText('Inga händelser i perioden.')).toBeVisible();const baseline=calls.length;
 await page.getByLabel('Från',{exact:true}).fill('2026-12-31');await page.getByLabel('Till',{exact:true}).fill('2027-01-02');
 const field=page.getByLabel('Från',{exact:true});expect(await field.evaluate(e=>e.closest('label'))).toBeNull();await field.locator('..').getByRole('button',{name:'Öppna kalender'}).click();
 const popup=page.getByRole('dialog',{name:'Välj datum',exact:true});expect(await popup.evaluate(e=>e.closest('label'))).toBeNull();await popup.getByRole('button',{name:/fredag 1 januari 2027/}).click();
 expect(calls).toHaveLength(baseline);await expect(field).toHaveValue('2027-01-01');await page.getByRole('button',{name:'Visa',exact:true}).click();await expect.poll(()=>calls.length).toBe(baseline+1);expect(calls.at(-1)!.searchParams.get('from')).toBe('2027-01-01T00:00:00.000Z');expect(calls.at(-1)!.searchParams.get('to')).toBe('2027-01-02T23:59:59.999Z');
});
test('external mandate labels keep focus, bounds and exact submitted dates',async({page},info)=>{
 const writes:Record<string,unknown>[]=[];await page.route('**/api/logg?*',r=>r.fulfill({json:{events:[]}}));
 await page.route('**/api/kund/mandat/urval',r=>r.fulfill({json:{functions:['rektor'],recipients:[{membershipId:id(1),displayName:'Syntetisk rektor'}],schools:[{id:id(2),name:'Syntetisk skola'}],groups:[],pupils:[],cases:[],validFrom:'2026-12-30',validTo:'2027-01-04'}}));
 await page.route('**/api/kund/rektor',async r=>{writes.push(r.request().postDataJSON());await r.fulfill({json:{assignmentId:id(3)}});});
 await page.goto('/e2e/fixtures/date-picker-integration-preview.html');await page.getByRole('button',{name:'Tilldela nytt uppdrag'}).click();const dialog=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Tilldela uppdrag',exact:true})});await dialog.getByRole('combobox',{name:'Uppdrag',exact:true}).selectOption('rektor');await dialog.getByRole('combobox',{name:'Mottagare',exact:true}).selectOption(id(1));await dialog.getByRole('checkbox',{name:'Syntetisk skola'}).check();
 const from=dialog.getByLabel('Gäller från',{exact:true}),to=dialog.getByLabel('Gäller till',{exact:true});expect(await from.evaluate(e=>e.closest('label'))).toBeNull();expect(await to.evaluate(e=>e.closest('label'))).toBeNull();
 await from.locator('..').getByRole('button',{name:'Öppna kalender'}).click();let popup=page.getByRole('dialog',{name:'Välj datum',exact:true});expect(await popup.evaluate(e=>e.closest('label'))).toBeNull();await expect(popup.getByRole('button',{name:/tisdag 29 december 2026/})).toBeDisabled();await popup.getByRole('button',{name:/torsdag 31 december 2026/}).click();await expect(from).toHaveValue('2026-12-31');await expect(from.locator('..').getByRole('button')).toBeFocused();
 await to.fill('2027-01-04');await to.locator('..').getByRole('button',{name:'Öppna kalender'}).click();popup=page.getByRole('dialog',{name:'Välj datum',exact:true});await expect(popup.getByRole('button',{name:/tisdag 5 januari 2027/})).toBeDisabled();await page.screenshot({path:`/private/tmp/date-picker-mandate-${info.project.name}.png`,fullPage:true});await popup.getByRole('button',{name:/måndag 4 januari 2027/}).click();expect(writes).toHaveLength(0);
 await dialog.getByRole('button',{name:'Tilldela uppdraget',exact:true}).click();await expect.poll(()=>writes.length).toBe(1);expect(writes[0]).toMatchObject({membershipId:id(1),function:'rektor',unitIds:[id(2)],validFrom:'2026-12-31',validTo:'2027-01-04'});await expect(page.getByText('Tilldelat till Syntetisk rektor')).toBeVisible();
});
