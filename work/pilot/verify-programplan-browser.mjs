// Kör bara efter roots runtime-/DB-samordning. Bevisar inte mänsklig förståelse.
import { spawn } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyProgramplanBrowserTarget } from './phase5-programplan-browser-fixtures.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
function walk(suites){return suites.flatMap(s=>[...(s.specs??[]),...walk(s.suites??[])]);}
export function summarizeProgramplanBrowser(json,proof){
  const tests=walk(json.suites??[]).flatMap(s=>(s.tests??[]).map(t=>({title:s.title,project:t.projectName,expected:t.expectedStatus,status:t.results?.at(-1)?.status,results:t.results??[]})));
  const cases=tests.map(t=>({case:t.title.split(':')[0],project:t.project,status:t.status}));
  const attachments=tests.flatMap(t=>t.results.flatMap(r=>r.attachments??[]));
  const bodies=name=>attachments.filter(a=>a.name===name&&typeof a.body==='string').map(a=>JSON.parse(Buffer.from(a.body,'base64').toString('utf8')));
  const builds=bodies('source-build.json'),cleanup=bodies('cleanup.json');
  const matrix=['programplan-desktop','programplan-phone'].every(project=>Array.from({length:15},(_,n)=>String(n+1).padStart(2,'0')).every(id=>cases.filter(c=>c.project===project&&c.case===id&&c.status==='passed').length===1));
  const cleaned=cleanup.length===30&&cleanup.every(c=>c&&['customers','sessions','plans','offerings','mandates','mintedSessions','triggers','functions'].every(key=>c[key]===0)&&c.preservedAuditEvents>0&&c.preservedAuditAnchors>0);
  const provenance=builds.length===2&&builds.every(b=>b.buildRevision===proof.buildRevision&&b.sourceRevision===proof.sourceRevision&&b.scope==='local-synthetic-only');
  return {phase:'05-11',status:tests.length===30&&matrix&&cleaned&&provenance&&tests.every(t=>t.expected==='passed'&&t.status==='passed'&&t.results.length===1)&&(json.errors??[]).length===0?'PASS':'FAIL',
    ...proof,scope:'local-synthetic-only',cases,cleanupCount:cleanup.length,cleanupVerified:cleaned,sourceBuildVerified:provenance,
    preservedAuditEvents:cleanup.reduce((n,c)=>n+(c?.preservedAuditEvents??0),0),preservedAuditAnchors:cleanup.reduce((n,c)=>n+(c?.preservedAuditAnchors??0),0),
    limits:['Lokalt mintade sessionsbevis; inget interaktivt IdP-prov.','Telefonprov använder iPhone/WebKit-emulering.','Negativa transportfel avgränsas med browserintercept, framgångswrite använder Worker/SQL.','Mänsklig förståelse och fasens fullständiga nationella regelram återstår.']};
}
export async function runProgramplanBrowser({baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3056',outFile=new URL('./results/phase5-11-browser.json',import.meta.url)}={}){
  const proof=await verifyProgramplanBrowserTarget(baseURL);
  const code=await new Promise((resolve,reject)=>{const child=spawn('npx',['playwright','test','-c','playwright.phase5-programplan.config.ts'],{cwd:`${root}web`,env:{...process.env,PHASE5_BASE_URL:baseURL},stdio:'inherit'});child.once('error',reject);child.once('exit',resolve);});
  const report=summarizeProgramplanBrowser(JSON.parse(await readFile(new URL('../../web/test-results/phase5-programplan.json',import.meta.url),'utf8')),proof);
  if(code!==0)report.status='FAIL';await writeFile(outFile,JSON.stringify(report,null,2)+'\n');console.log(`05-11 programplansbrowser ${report.status}: ${report.cases.length}/30, cleanup=${report.cleanupCount}/30`);return report;
}
if(process.argv[1]===fileURLToPath(import.meta.url))try{const report=await runProgramplanBrowser();if(report.status!=='PASS')process.exitCode=1;}catch{console.error('05-11 browser BLOCKED: mål/bygge/runtime/prov kunde inte verifieras.');process.exitCode=1;}
