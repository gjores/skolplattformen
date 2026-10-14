#!/usr/bin/env node
// Read-only public API check of the actual adapter bundled into workerd. No DB or credentials.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const [mode,outArg]=process.argv.slice(2);assert.ok(['head','current'].includes(mode));
const out=resolve(outArg??'');assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));
const file='web/lib/server/skolverket.ts';
const source=mode==='head'?execFileSync('git',['show','HEAD:'+file],{cwd:root,encoding:'utf8'}):readFileSync(resolve(root,file),'utf8');
const require=createRequire(resolve(root,'web/package.json'));
const {build}=require('esbuild');const wr=createRequire(require.resolve('wrangler'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare');
const probe=`\nexport default {async fetch(){try{const result=await fetchRegistryUnit('19207279');return Response.json({ok:!!result&&result.unit.code==='19207279'&&!!result.unit.name.trim()&&/^\\d{4}$/.test(result.unit.municipalityCode)&&result.unit.schoolTypes.length>0,hasAddress:!!result?.unit.address});}catch{return Response.json({ok:false,reason:'registry_unavailable'},{status:503});}}};`;
const bundle=await build({stdin:{contents:"import {fetchRegistryUnit} from 'registry-adapter-under-test';"+probe,resolveDir:root,loader:'ts'},plugins:[{name:'adapter-source',setup(b){b.onResolve({filter:/^registry-adapter-under-test$/},()=>({path:'adapter',namespace:'tested'}));b.onLoad({filter:/.*/,namespace:'tested'},()=>({contents:source,loader:'ts',resolveDir:dirname(resolve(root,file))}));}}],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
const runtime=new Miniflare(convertV4MiniflareOptions({host:'127.0.0.1',port:0,workers:[{name:'registry-adapter-read-only',modules:true,compatibilityDate:'2026-09-01',script:bundle.outputFiles[0].text}]}));
let response,body;
try{response=await runtime.dispatchFetch('http://localhost');body=await response.json();}finally{await runtime.dispose();}
const report={kind:'registry-adapter-actual-workerd',status:response.status===200&&body.ok?'PASS':'FAIL',scope:'read-only-public-api-no-database',sourceMode:mode,sourceSha256:createHash('sha256').update(source).digest('hex'),addressSourceSha256:createHash('sha256').update(readFileSync(resolve(root,'web/lib/registry-address.ts'))).digest('hex'),httpStatus:response.status,result:body};
writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify(report));if(report.status!=='PASS')process.exitCode=1;
