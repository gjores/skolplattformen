// Simulerat UI-prov för kalenderns beroende underlag (05.1.1-14, D-11, LASAR-05, UI-SPEC avsnitt 15
// och avsnitt 16 fall 12). /api/lasar/sammanfattning besvaras av fixturens mock i webbläsaren med
// syntetiska skoldagar; ingen databas, server eller inloggning. Komponentprov, inte faktiskt prov.
import {test,expect,type Page} from '@playwright/test';
const url='/e2e/fixtures/lasar-preview.html';
const UNIT='51a50000-0000-4000-8000-000000000003';
type Logged={path:string;body:any};

async function openIm(page:Page,query:string){
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${url}?vy=im${query}`);
 await expect(page.getByTestId('lasar-im-weekly')).not.toHaveAttribute('aria-busy','true');
 return errors;
}
async function noSideScroll(page:Page){
 const {scroll,client}=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
 expect(scroll).toBeLessThanOrEqual(client);
}
const summaries=(page:Page)=>page.evaluate(()=>window.__lasar.summaries) as Promise<Logged[]>;

test('IM-texten med fastställd kalender anger läsår, version och skoldagar',async({page})=>{
 const errors=await openIm(page,'&sammanfattning=faststalld');
 await expect(page.getByTestId('lasar-im-weekly')).toHaveText('Veckoram. Läsårskalendern 2026/27 är fastställd (version 1, 178 skoldagar). Individuell fördelning visas inte här.');
 const sent=await summaries(page);
 expect(sent).toHaveLength(1);
 expect(sent[0].body).toEqual({unitId:UNIT,schoolYear:2026});
 await noSideScroll(page);
 expect(errors).toEqual([]);
});

test('IM-texten följer den gällande versionen när en ny version är fastställd',async({page})=>{
 const errors=await openIm(page,'&sammanfattning=ny');
 await expect(page.getByTestId('lasar-im-weekly')).toHaveText('Veckoram. Läsårskalendern 2026/27 är fastställd (version 2, 183 skoldagar). Individuell fördelning visas inte här.');
 expect(errors).toEqual([]);
});

test('IM-texten utan fastställd kalender säger att inga årstimmar beräknas',async({page})=>{
 const errors=await openIm(page,'&sammanfattning=tom');
 await expect(page.getByTestId('lasar-im-weekly')).toHaveText('Veckoram. Läsårskalendern för 2026/27 är inte fastställd. Inga årstimmar beräknas.');
 await expect(page.getByTestId('other-year-binding')).not.toContainText('saknas;');
 await noSideScroll(page);
 expect(errors).toEqual([]);
});

test('läsfel i IM-raden visar en text utan siffror',async({page})=>{
 const errors=await openIm(page,'&sammanfattning=fel');
 const note=page.getByTestId('lasar-im-weekly');
 await expect(note).toHaveText('Veckoram. Läsårskalendern kunde inte läsas.');
 await expect(note).not.toContainText(/\d/);
 await noSideScroll(page);
 expect(errors).toEqual([]);
});

test('IM-raden bryts vid 200 % textstorlek utan sidledsrullning',async({page})=>{
 await openIm(page,'&sammanfattning=faststalld');
 await page.addStyleTag({content:'html{font-size:200% !important}'});
 await expect(page.getByTestId('lasar-im-weekly')).toContainText('178 skoldagar');
 await noSideScroll(page);
});
