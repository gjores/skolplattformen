import type {Page} from '@playwright/test';
const add=new Set(['Lägg till lärare i fördelningen','Lägg upp ny lärare','Lägg till specialuppdrag']);
/** Samma disclosure som användaren: öppna bara när åtgärden är dold. */
export async function toolbarAction(page:Page,name:string){
 const ws=page.locator('.tjanst'),button=ws.getByRole('button',{name,exact:true});
 if(!await button.isVisible())await ws.locator('.tjanst-actions > details').filter({has:page.locator('summary').filter({hasText:new RegExp(`^${add.has(name)?'Lägg till':'Verktyg'}$`)})}).locator(':scope > summary').click();
 return button;
}
export async function clickToolbarAction(page:Page,name:string){await(await toolbarAction(page,name)).click();}
export async function viewOptions(page:Page){
 const options=page.locator('.tjanst details.tjanst-view-options');
 if(await options.getAttribute('open')===null)await options.locator(':scope > summary').click();
}

export async function selectFilter(page:Page,label:string,value:Parameters<ReturnType<Page['getByLabel']>['selectOption']>[0]){
 const field=page.locator('.tjanst').getByLabel(label,{exact:true}),menu=page.locator('.tjanst-filter-options');const opened=!await field.isVisible();
 if(opened)await menu.locator(':scope > summary').click();
 if(await field.evaluate(el=>el.tagName==='SELECT'))await field.selectOption(value);
 else { await field.click();if(typeof value==='string'&&/^[0-9a-f-]{36}$/i.test(value)){await field.fill('');await page.locator(`[role=option][data-person-id="${value}"]`).click();}
   else {const label=typeof value==='string'?value:value&&typeof value==='object'&&!Array.isArray(value)&&'label'in value?String(value.label):null;if(label===null)throw new Error('Explicit teacher name or ID required');await field.fill(label);await page.getByRole('option',{name:label,exact:true}).click();}}
 if(opened)await menu.locator(':scope > summary').click();
}
export async function onlyIssues(page:Page){const menu=page.locator('.tjanst-filter-options');if(await menu.getAttribute('open')===null)await menu.locator(':scope > summary').click();await menu.getByRole('checkbox',{name:'Visa bara avvikelser och saknade kopplingar'}).check();await menu.locator(':scope > summary').click();}

export async function advancedMode(page:Page,checked=true){
 const menu=page.locator('.tjanst-actions > details').filter({hasText:'Verktyg'});if(!await menu.count())return;
 const summary=menu.locator(':scope > summary');if(await menu.getAttribute('open')===null)await summary.click();const field=menu.getByRole('checkbox',{name:'Avancerade val före tilldelning',exact:true});if(await field.count())await field.setChecked(checked);await summary.click();
}

/** Verifiera synliga tidskort i Per lärare, även när tabeller ersätts av telefonkort. */
export async function expectTeacherTimes(page:Page,metric:string,ht:string,vt:string,year:string){
 const {expect}=await import('@playwright/test');const card=page.locator('.tjanst').getByRole('article',{name:metric,exact:true});await expect(card).toBeVisible();await expect(card.locator('.tjanst-teacher-year strong')).toHaveText(year);await expect(card.locator('dl>div').filter({has:page.getByText('HT',{exact:true})}).locator('dd')).toHaveText(ht);await expect(card.locator('dl>div').filter({has:page.getByText('VT',{exact:true})}).locator('dd')).toHaveText(vt);
}
