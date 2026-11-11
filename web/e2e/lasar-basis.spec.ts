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

// ---- Markeringen om ny kalenderversion i Tjänstefördelning (D-11). Användarbeslut 2026-11-11, alternativ a:
// Använd version {n} öppnar den befintliga raddialogen för en rad i taget; markören skickar inget kommando.
const tid=(n:number)=>`51a50000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const MARKER='Läsårskalendern har en ny fastställd version (2, 1 juni 2027). Underlaget räknar med version 1: 178 → 183 skoldagar.';
async function openMarker(page:Page,query:string){
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`${url}?vy=markering${query}`);
 await expect(page.getByTestId('marker-used')).toBeAttached();
 return errors;
}
const sentByLasar=(page:Page)=>page.evaluate(()=>({commands:window.__lasar.commands.length,decisions:window.__lasar.decisions.length,summaries:window.__lasar.summaries.length,used:window.__lasar.used}));

test('markeringen visas när en IM-rad är inaktuell och en föregående version finns',async({page})=>{
 const errors=await openMarker(page,'&sammanfattning=ny');
 const marker=page.getByTestId('lasar-basis-marker');
 await expect(marker).toContainText(MARKER);
 await expect(marker).toContainText('En rad räknar med den äldre versionen. Använd version 2 öppnar en rad i taget. Inget räknas om förrän du sparar raden.');
 await expect(marker.getByRole('button',{name:'Visa skillnaden'})).toBeVisible();
 await expect(marker.getByRole('button',{name:'Använd version 2'})).toBeVisible();
 await noSideScroll(page);
 expect(errors).toEqual([]);
});

test('markeringen saknas utan inaktuell IM-rad, och kalendern läses då inte',async({page})=>{
 const errors=await openMarker(page,'&sammanfattning=ny&rader=ingen');
 await expect(page.getByTestId('lasar-basis-marker')).toHaveCount(0);
 // TE26A:s inaktuella rad räknar med terminer, inte kalendern, och ger ingen markering.
 expect((await sentByLasar(page)).summaries).toBe(0);
 expect(errors).toEqual([]);
});

test('markeringen saknas när ingen föregående version är fastställd',async({page})=>{
 const errors=await openMarker(page,'&sammanfattning=faststalld');
 await expect.poll(async()=>(await sentByLasar(page)).summaries).toBe(1);
 await expect(page.getByTestId('lasar-basis-marker')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('markeringen saknas vid läsfel',async({page})=>{
 const errors=await openMarker(page,'&sammanfattning=fel');
 await expect.poll(async()=>(await sentByLasar(page)).summaries).toBe(1);
 await expect(page.getByTestId('lasar-basis-marker')).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('Visa skillnaden visar skoldagar per termin före och efter och de berörda raderna',async({page})=>{
 const errors=await openMarker(page,'&sammanfattning=ny');
 await page.getByRole('button',{name:'Visa skillnaden'}).click();
 const dialog=page.getByRole('dialog',{name:'Skillnad mellan kalenderversionerna'});
 await expect(dialog).toBeVisible();
 const table=dialog.getByTestId('lasar-basis-diff');
 await expect(table.getByRole('columnheader')).toHaveText(['Skoldagar','Version 1, 10 juni 2026','Version 2, 1 juni 2027']);
 await expect(table.getByRole('row',{name:/^HT/})).toHaveText(/HT\s*80\s*85/);
 await expect(table.getByRole('row',{name:/^VT/})).toHaveText(/VT\s*98\s*98/);
 await expect(table.getByRole('row',{name:/^Hela läsåret/})).toHaveText(/Hela läsåret\s*178\s*183/);
 await expect(dialog.getByTestId('lasar-basis-rows').getByRole('listitem')).toHaveText(['IMSPR · Svenska som andraspråk 1']);
 await noSideScroll(page);
 await dialog.getByRole('button',{name:'Stäng'}).click();
 await expect(dialog).toHaveCount(0);
 const sent=await sentByLasar(page);
 expect(sent.commands+sent.decisions).toBe(0);
 expect(errors).toEqual([]);
});

test('Använd version 2 lämnar exakt de berörda raderna och skickar inget kommando',async({page})=>{
 const errors=await openMarker(page,'&sammanfattning=ny&rader=tva');
 await expect(page.getByTestId('lasar-basis-marker')).toContainText('2 rader räknar med den äldre versionen.');
 await page.getByRole('button',{name:'Använd version 2'}).click();
 await expect(page.getByTestId('marker-used')).toHaveText(`${tid(811)},${tid(812)}`);
 const sent=await sentByLasar(page);
 expect(sent.used).toEqual([[tid(811),tid(812)]]);
 expect(sent.commands+sent.decisions).toBe(0);
 expect(sent.summaries).toBe(1);
 expect(errors).toEqual([]);
});

test('utan skrivförmåga visas texten och Visa skillnaden men inte Använd version',async({page})=>{
 const errors=await openMarker(page,'&sammanfattning=ny&skriv=0');
 const marker=page.getByTestId('lasar-basis-marker');
 await expect(marker).toContainText('Inget räknas om automatiskt.');
 await expect(marker.getByRole('button',{name:'Visa skillnaden'})).toBeVisible();
 await expect(marker.getByRole('button',{name:/Använd version/})).toHaveCount(0);
 expect(errors).toEqual([]);
});

test('markeringens knappar är minst 44px och bryts vid 200 % text utan sidledsrullning',async({page})=>{
 await openMarker(page,'&sammanfattning=ny');
 for(const name of ['Visa skillnaden','Använd version 2'])expect((await page.getByRole('button',{name}).boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await noSideScroll(page);
 await page.addStyleTag({content:'html{font-size:200% !important}'});
 await expect(page.getByTestId('lasar-basis-marker')).toContainText('178 → 183 skoldagar');
 await noSideScroll(page);
});

// ---- Samma markering i Tjänstefördelningens simulerade arbetsyta (tjanst-preview).
const tjanst='/e2e/fixtures/tjanst-preview.html';
const tjanstLog=(page:Page)=>page.evaluate(()=>({commands:window.__tjanst.commands as Logged[],summaries:window.__tjanst.summaries as Logged[]}));
async function openTjanst(page:Page,query:string){
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(tjanst+query);await expect(page.locator('.tjanst').getByText('Hämtar tjänstefördelningen…')).toHaveCount(0);
 return errors;
}

test('Tjänstefördelning läser inte kalendern när ingen IM-rad är inaktuell',async({page})=>{
 const errors=await openTjanst(page,'');
 await expect(page.locator('.tjanst-content')).toBeVisible();
 await expect(page.getByTestId('lasar-basis-marker')).toHaveCount(0);
 expect((await tjanstLog(page)).summaries).toHaveLength(0);
 expect(errors).toEqual([]);
});

test('Tjänstefördelning: Använd version 2 öppnar raddialogen och sparar först när raden sparas',async({page},info)=>{
 const errors=await openTjanst(page,'?kalender=ny');
 const marker=page.getByTestId('lasar-basis-marker');
 await expect(marker).toContainText('Läsårskalendern har en ny fastställd version (2, 15 januari 2027). Underlaget räknar med version 1: 178 → 183 skoldagar.');
 const log=await tjanstLog(page);
 expect(log.summaries.map(s=>s.body)).toEqual([{unitId:'51a50000-0000-4000-8000-000000000003',schoolYear:2026}]);
 await noSideScroll(page);
 if(!info.project.name.startsWith('desktop')){
  // Redigeringen finns bara på dator (D-15): på telefon visas texten och Visa skillnaden.
  await expect(marker.getByRole('button',{name:/Använd version/})).toHaveCount(0);
  expect(errors).toEqual([]);return;
 }
 await marker.getByRole('button',{name:'Använd version 2'}).click();
 const dialog=page.getByRole('dialog');
 const save=dialog.getByRole('button',{name:'Spara tjänsteraden'});
 await expect(save).toBeVisible();
 await expect(dialog.getByLabel('Lärartid HT (timmar)')).toHaveValue('36');
 await expect(dialog.getByLabel('Lärartid VT (timmar)')).toHaveValue('36');
 expect((await tjanstLog(page)).commands).toHaveLength(0);
 await save.click();
 await expect(dialog).toHaveCount(0);
 const sent=(await tjanstLog(page)).commands;
 expect(sent).toHaveLength(1);
 expect(sent[0].body.action).toBe('save_row');
 expect(sent[0].body.payload.rowId).toBe(tid(305));
 expect([sent[0].body.payload.teacherHt,sent[0].body.payload.teacherVt]).toEqual([2160,2160]);
 await expect(marker).toHaveCount(0);
 expect(errors).toEqual([]);
});
