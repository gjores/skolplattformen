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
 if(opened)await menu.locator(':scope > summary').click();await field.selectOption(value);if(opened)await menu.locator(':scope > summary').click();
}
export async function onlyIssues(page:Page){const menu=page.locator('.tjanst-filter-options');if(await menu.getAttribute('open')===null)await menu.locator(':scope > summary').click();await menu.getByRole('checkbox',{name:'Visa bara avvikelser och saknade kopplingar'}).check();await menu.locator(':scope > summary').click();}

export async function advancedMode(page:Page,checked=true){
 const menu=page.locator('.tjanst-actions > details').filter({hasText:'Verktyg'});if(!await menu.count())return;
 const summary=menu.locator(':scope > summary');if(await menu.getAttribute('open')===null)await summary.click();const field=menu.getByRole('checkbox',{name:'Avancerade val före tilldelning',exact:true});if(await field.count())await field.setChecked(checked);await summary.click();
}
