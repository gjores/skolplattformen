// Supplemental synthetic UI checks; requires the isolated Vite fixture server.
import {chromium,webkit} from '../../web/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
const results=[];
const base=process.env.TJANST_UX_URL??'http://127.0.0.1:5209/e2e/fixtures/tjanst-preview.html';
for(const [engine,width,height]of [[chromium,1440,900],[chromium,1024,768],[webkit,390,664],[webkit,320,740]]){
 const b=await engine.launch();try{
  const p=await b.newPage({viewport:{width,height},locale:'sv-SE'});p.setDefaultTimeout(8000);
  await p.goto(base+'?tjvy=kurs&data=manga&delvis=1');
  const card=p.getByRole('region',{name:'Historia 1',exact:true}).locator('.tjanst-missing-card').filter({has:p.getByText('MA3',{exact:true})});
  await card.waitFor();const text=await card.innerText();
  if(!text.includes('Behov HT 50 h · VT 50 h')||!text.includes('Fördelat HT 50 h · VT 25 h'))throw new Error('Wrong partial-coverage summary');
  results.push({profile:`${engine.name()} ${width}x${height}`,case:'Partially allocated need retains class/need/covered totals',status:'PASS'});
  await p.goto(base+'?tjvy=klass');await p.getByRole('button',{name:'Samläsning med EK26',exact:true}).click();
  const joint=p.getByRole('region',{name:'Samläsning: Svenska 1 TE26A + EK26',exact:true});await joint.waitFor();
  await p.goBack();await p.getByRole('region',{name:'Per klass',exact:true}).waitFor();
  await p.goForward();await joint.waitFor();await p.reload();await joint.waitFor();
  results.push({profile:`${engine.name()} ${width}x${height}`,case:'Joint navigation survives Back/Forward/reload',status:'PASS'});
 }finally{await b.close();}
}
await writeFile(new URL('./p2-36-supplement.json',import.meta.url),JSON.stringify({scope:'Synthetic in-memory UI; no real auth/database',results},null,2)+'\n');
console.log(`${results.length} supplemental checks PASS`);
