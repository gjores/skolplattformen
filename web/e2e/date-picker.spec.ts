import {test,expect,type Page} from '@playwright/test';
const open=async(page:Page,id='fixture-date')=>{await page.locator(`#${id}`).locator('..').getByRole('button',{name:'Öppna kalender'}).click();return page.getByRole('dialog',{name:'Välj datum',exact:true});};
test.beforeEach(async({page})=>{await page.goto('/e2e/fixtures/date-picker-preview.html');});
test('ISO weeks, year boundary, exact form value, no automatic submit and manual editing',async({page},info)=>{
 const popup=await open(page);await expect(popup.locator('.rdp-week_number_header')).toBeVisible();await expect(popup.getByRole('rowheader',{name:'Vecka 53',exact:true})).toBeVisible();
 await popup.getByRole('button',{name:/fredag 1 januari 2027/}).click();await expect(page.getByTestId('value')).toHaveText('2027-01-01');await expect(page.getByTestId('saved')).toBeEmpty();await expect(page.locator('#fixture-date-calendar-help')).toHaveText('Vecka 53 (2026)');
 await page.getByRole('button',{name:'Spara formulär'}).click();await expect(page.getByTestId('saved')).toHaveText('2027-01-01');
 await page.getByLabel('Datum',{exact:true}).fill('2024-02-29');await expect(page.getByTestId('value')).toHaveText('2024-02-29');
 await page.getByRole('button',{name:'Nytt värde utifrån'}).click();await expect(page.getByLabel('Datum',{exact:true})).toHaveValue('2028-02-29');const leap=await open(page);await expect(leap.getByRole('button',{name:/tisdag 29 februari 2028, valt datum/})).toBeVisible();
 await leap.getByRole('combobox',{name:'Månad',exact:true}).selectOption('11');await leap.getByRole('combobox',{name:'År',exact:true}).selectOption('2026');await page.screenshot({path:`/private/tmp/date-picker-${info.project.name}.png`,fullPage:true});
 const box=await leap.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(page.viewportSize()!.width+1);
 await leap.getByRole('button',{name:'Töm datum'}).click();await expect(page.getByLabel('Datum',{exact:true})).toHaveValue('');
});
test('inclusive bounds, required, disabled, readonly and disabled fieldsets',async({page})=>{
 let popup=await open(page,'bounded-date');await expect(popup.getByRole('button',{name:/tisdag 29 december 2026/})).toBeDisabled();await expect(popup.getByRole('button',{name:/onsdag 30 december 2026/})).toBeEnabled();await expect(popup.getByRole('button',{name:'Töm datum'})).toHaveCount(0);await popup.getByRole('button',{name:'Nästa månad'}).click();await expect(popup.getByRole('button',{name:/tisdag 5 januari 2027/})).toBeDisabled();await popup.getByRole('button',{name:/måndag 4 januari 2027/}).click();await expect(page.getByTestId('value')).toHaveText('2027-01-04');
 await expect(page.locator('#readonly-date').locator('..').getByRole('button')).toBeDisabled();await expect(page.locator('#disabled-date')).toBeDisabled();
 popup=await open(page,'fieldset-date');await popup.getByRole('button',{name:'Stäng'}).click();await page.getByRole('button',{name:'Lås fältgruppen'}).click();await expect(page.locator('#fieldset-date')).toBeDisabled();await expect(page.locator('#fieldset-date').locator('..').getByRole('button')).toBeDisabled();
 await page.locator('#bounded-date').fill('2027-01-05');expect(await page.locator('#bounded-date').evaluate((e:HTMLInputElement)=>e.validity.valid)).toBe(false);
});
test('nested modal keeps focus and Escape only dismisses the calendar; keyboard selection',async({page})=>{
 await page.getByRole('button',{name:'Öppna dialog',exact:true}).click();const outer=page.getByRole('dialog',{name:'Ändra placering',exact:true});await expect(outer).toBeVisible();const popup=await open(page,'dialog-date');
 await page.keyboard.press('Escape');await expect(popup).toHaveCount(0);await expect(outer).toBeVisible();await expect(page.locator('#dialog-date').locator('..').getByRole('button')).toBeFocused();
 await open(page,'dialog-date');await page.getByRole('button',{name:/torsdag 31 december 2026, valt datum/}).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await expect(page.locator('#dialog-date')).toHaveValue('2027-01-01');await expect(outer).toBeVisible();await expect(page.getByTestId('saved')).toBeEmpty();
});
