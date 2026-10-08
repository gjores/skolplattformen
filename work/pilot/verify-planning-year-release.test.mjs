// Offline validator probes. Historical SEARCH cases read Git and saved reports;
// dummy metadata probes never stand in for actual API/browser/DB evidence.
import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as search from './verify-planning-year-search-details.mjs';
import {validateHistoricalSearchApplied} from './verify-planning-year-release.mjs';
import {hasUnsafeCleanupAttachment,parseReleaseArgs,validateReleaseReview,validateBootstrapInventory,BOOTSTRAP_IMPORTS,BOOTSTRAP_DATA,parseSealedJson,validateOwnedFileIdentity,closeOwnedReleaseFiles,completedReleaseStatus,publishCompletion,validateFinalArtifactSeal} from './verify-planning-year-release.mjs';
const hex='a'.repeat(64),revision='b'.repeat(40),report='work/pilot/results/source-only-placeholder.json';
const historicalReport=name=>JSON.parse(readFileSync(new URL('./results/'+name+'.json',import.meta.url),'utf8'));
const historicalRead=(commit,file)=>execFileSync('git',['show',`${commit}:${file}`],{cwd:new URL('../../',import.meta.url),stdio:['ignore','pipe','ignore']});
test('historical SEARCH apply without sourceCommit validates against approved rollback Git bytes',()=>{
 const applied=historicalReport('phase5-40-search-details-apply'),rollback=historicalReport('phase5-40-search-details-rollback');
 assert.equal(Object.hasOwn(applied,'sourceCommit'),false);
 assert.doesNotThrow(()=>validateHistoricalSearchApplied(applied,rollback,search,historicalRead));
});
test('historical SEARCH apply still rejects changed migration hash',()=>{
 const applied=historicalReport('phase5-40-search-details-apply'),rollback=historicalReport('phase5-40-search-details-rollback');
 applied.sourceHash='0'.repeat(64);
 assert.throws(()=>validateHistoricalSearchApplied(applied,rollback,search,historicalRead),/complete exact controlled SEARCH apply proof/u);
});
const pinNames=['PHASE5_CONTEXT_ACTUAL_REPORT','PHASE5_CONTEXT_APPROVED_SOURCE_REVISION','PHASE5_CONTEXT_WRITE_ACTUAL_REPORT','PHASE5_CONTEXT_WRITE_APPROVED_SOURCE_REVISION','PHASE5_LIST_ACTUAL_REPORT','PHASE5_LIST_APPROVED_SOURCE_REVISION','PHASE5_GYM_ACTUAL_REPORT','PHASE5_GYM_APPROVED_SOURCE_REVISION'];
const options={otherReport:report,otherSource:revision,finalSource:revision,finalBuild:revision,finalContextReport:report,finalContextSource:revision};
const env=Object.fromEntries(pinNames.map((k,i)=>[k,i%2?revision:report]));
function sample(){return {kind:'phase5-planning-year-release-root-review-v1',target:'protected',baseURL:'http://127.0.0.1:3060',finalSourceRevision:revision,finalBuildRevision:revision,sourceHashes:{'work/pilot/verify-planning-year-release.mjs':hex},specPins:{C:hex,C04:hex,L:hex,G:hex,O:hex},operatorPins:{...env},other:{report,approvedSourceRevision:revision},finalContext:{report,approvedSourceRevision:revision,specSha256:hex,reportSha256:hex},artifactSeal:{report,sha256:hex}};}
const rejects=[
 ['extra field',m=>m.extra=true],
 ['missing field',m=>delete m.artifactSeal],
 ['wrong target',m=>m.target='baseline'],
 ['port3012',m=>m.baseURL='http://127.0.0.1:3012'],
 ['self-derived HEAD mismatch',m=>m.finalSourceRevision='c'.repeat(40)],
 ['missing C04 pin',m=>delete m.specPins.C04],
 ['invalid source hash',m=>m.sourceHashes['work/pilot/verify-planning-year-release.mjs']='x'],
 ['traversal source',m=>m.sourceHashes['../secret']=hex],
 ['operator pin mismatch',m=>m.operatorPins.PHASE5_CONTEXT_APPROVED_SOURCE_REVISION='c'.repeat(40)],
 ['optional finalC forbidden',m=>m.finalContext=null],
 ['partial finalC',m=>delete m.finalContext.specSha256],
 ['wrong O source',m=>m.other.approvedSourceRevision='c'.repeat(40)],
 ['invalid artifact SHA',m=>m.artifactSeal.sha256='x'],
 ['manifest getter',m=>Object.defineProperty(m,'target',{get(){throw Error('must not invoke');},enumerable:true})],
 ['prototype field',m=>Object.setPrototypeOf(m,{extra:true})],
 ['symbol field',m=>m[Symbol('extra')]=1],
];
for(const [name,change]of rejects)test('closed release review rejects '+name,()=>{const m=sample();change(m);assert.throws(()=>validateReleaseReview(m,options,env));});
test('complete synthetic metadata alone does not activate a target',()=>assert.equal(validateReleaseReview(sample(),options,env).target,'protected'));
test('missing independent environment pin refuses',()=>{const e={...env};delete e.PHASE5_CONTEXT_WRITE_ACTUAL_REPORT;assert.throws(()=>validateReleaseReview(sample(),options,e));});
test('pure help',()=>assert.equal(parseReleaseArgs(['--help']).help,true));
test('help with extras refuses',()=>assert.throws(()=>parseReleaseArgs(['--help','--out','a'])));
test('duplicate args refuse',()=>assert.throws(()=>parseReleaseArgs(['--target','protected','--target','protected'])));
test('unknown args refuse',()=>assert.throws(()=>parseReleaseArgs(['--reset'])));
test('dryrun is explicit and contains no target operation',()=>assert.equal(parseReleaseArgs(['--dry-run','--target','protected','--base-url','http://127.0.0.1:3060']).dryRun,true));
test('actual path missing reviewed manifest refuses',()=>assert.throws(()=>parseReleaseArgs(['--target','protected','--base-url','http://127.0.0.1:3060','--other-report',report,'--other-source-revision',revision,'--artifact-dir','web/dist-protected','--out',report])));

// V2 pre-import closure probes. These are pure metadata, not imported helpers.
const bootHashes=()=>({...Object.fromEntries(Object.entries(BOOTSTRAP_IMPORTS).map(([p,v])=>[p,v.sha256])),...BOOTSTRAP_DATA});
test('v2 complete fixed bootstrap metadata is closed',()=>assert.equal(validateBootstrapInventory(bootHashes()).length,36));
test('v2 self-only source map cannot reach a repo import',()=>assert.throws(()=>validateBootstrapInventory({'work/pilot/verify-planning-year-release.mjs':hex})));
test('v2 direct helpers without transitive modules refuse',()=>{const h=Object.fromEntries(Object.entries(bootHashes()).filter(([p])=>p.startsWith('work/pilot/verify-planning-year-')));assert.throws(()=>validateBootstrapInventory(h));});
test('v2 omitted transitive contract refuses',()=>{const h=bootHashes();delete h['web/lib/programplan-terms-contract.ts'];assert.throws(()=>validateBootstrapInventory(h));});
test('v2 omitted lazy fixture import refuses',()=>{const h=bootHashes();delete h['work/pilot/phase5-planning-year-search-fixtures.mjs'];assert.throws(()=>validateBootstrapInventory(h));});
test('v2 changed helper bytes require explicit bootstrap source review',()=>{const h=bootHashes();h['work/pilot/verify-target.mjs']='c'.repeat(64);assert.throws(()=>validateBootstrapInventory(h));});
test('v2 getter cannot authorize a bootstrap helper',()=>{const h=bootHashes();Object.defineProperty(h,'work/pilot/verify-target.mjs',{get(){throw Error('must not invoke');}});assert.throws(()=>validateBootstrapInventory(h));});
test('v2 package-lock omission refuses before import',()=>{const h=bootHashes();delete h['web/package-lock.json'];assert.throws(()=>validateBootstrapInventory(h));});
test('v2 missing independent finalC raw SHA refuses',()=>{const m=sample();delete m.finalContext.reportSha256;assert.throws(()=>validateReleaseReview(m,options,env));});
test('v2 invalid finalC raw SHA refuses',()=>{const m=sample();m.finalContext.reportSha256=undefined;assert.throws(()=>validateReleaseReview(m,options,env));});

// V3 pure sealed-byte and injected filesystem probes. No repo/target is loaded.
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const sealed=value=>{const bytes=Buffer.from(JSON.stringify(value));return {bytes,digest:digest(bytes)};};
test('v3 parser consumes the exact sealed bytes',()=>{const input=sealed({n:1});assert.deepEqual(parseSealedJson(input,digest),{n:1});input.bytes=Buffer.from('{"n":2}');assert.throws(()=>parseSealedJson(input,digest),/SEALED_BYTES_DIGEST_MISMATCH/u);});
test('v3 independent finalC raw pin is checked before JSON metadata',()=>{const bytes=Buffer.from('not json');assert.throws(()=>parseSealedJson({bytes,digest:digest(bytes)},digest,hex),/INDEPENDENT_FINAL_C16_RAW_REPORT_SHA/u);});
test('v3 a matching sealed raw pin parses only its own bytes',()=>{const input=sealed({n:1});assert.deepEqual(parseSealedJson(input,digest,input.digest),{n:1});});
const stat=(ino=1,extra={})=>({dev:7,ino,nlink:1,mode:0o100600,isFile:()=>true,isSymbolicLink:()=>false,...extra});
function fakeFs(){
 const files=new Map(),fds=new Map(),events=[];let nextFd=10,nextIno=100;
 const fault={};
 function reject(key){if(fault[key]){fault[key]-=1;throw Error('injected '+key);}}
 function fileForFd(fd){const f=fds.get(fd);if(!f)throw Error('closed FD');return f;}
 const ops={constants:{O_WRONLY:1,O_CREAT:2,O_EXCL:4,O_NOFOLLOW:8},
  openSync(path,flags,mode){events.push(['open',path,flags,mode]);reject('open');let f=files.get(path);if(f&&(flags&4)){const error=Error('exists');error.code='EEXIST';throw error;}if(!f){if(!(flags&2))throw Error('missing');f={stat:stat(nextIno++,{mode:0o100000|(mode??0o600)}),bytes:Buffer.alloc(0),path};files.set(path,f);}const fd=nextFd++;fds.set(fd,f);return fd;},
  fstatSync(fd){events.push(['fstat',fd]);reject('fstat');return fileForFd(fd).stat;},
  lstatSync(path){events.push(['lstat',path]);reject('lstat');const f=files.get(path);if(!f)throw Error('missing');return f.stat;},
  ftruncateSync(fd,n){events.push(['truncate',fd,n]);reject('truncate');fileForFd(fd).bytes=Buffer.alloc(n);},
  writeSync(fd,bytes,offset,n,position){events.push(['write',fd]);reject('write');const f=fileForFd(fd),need=position+n;if(f.bytes.length<need){const b=Buffer.alloc(need);f.bytes.copy(b);f.bytes=b;}bytes.copy(f.bytes,position,offset,offset+n);return n;},
  fsyncSync(fd){events.push(['fsync',fd]);reject('fsync');fileForFd(fd);},
  closeSync(fd){events.push(['close',fd]);reject('close');if(!fds.delete(fd))throw Error('already closed');},
  unlinkSync(path){events.push(['unlink',path]);reject('unlink');if(!files.delete(path))throw Error('missing');}
 };
 return {ops,files,fds,events,fault,add(path){const fd=ops.openSync(path,15,0o600);return {fd,stat:ops.fstatSync(fd)};},json(path){return JSON.parse(files.get(path).bytes.toString());}};
}
function closureFixture(){const f=fakeFs(),lock=f.add('/lock'),out=f.add('/reserved');return {...f,args:{lock:'/lock',out:'/reserved',lockFd:lock.fd,outFd:out.fd,ownedLockStat:lock.stat,reservedStat:out.stat,dbClosed:true}};}
const verified={verificationComplete:true,readCompletionKnown:true,dbClosed:true,reservedClosed:true,lockClosed:true,lockReleased:true,failure:null};
test('v3 complete status requires every known closure',()=>{assert.deepEqual(completedReleaseStatus(verified),{status:'PASS',complete:true});for(const key of Object.keys(verified).filter(k=>k!=='failure'))assert.deepEqual(completedReleaseStatus({...verified,[key]:false}),{status:'FAIL',complete:false});assert.equal(completedReleaseStatus({...verified,failure:{code:'FAILED'}}).complete,false);});
test('v3 inode, link, mode and regular-file checks are closed',()=>{for(const extra of [{ino:2},{dev:2},{nlink:2},{mode:0o100644},{isFile:()=>false},{isSymbolicLink:()=>true}])assert.throws(()=>validateOwnedFileIdentity(stat(),stat(1,extra),'REFUSED'),/REFUSED/u);});
test('v3 closes reserved and lock before releasing the owned lock',()=>{const f=closureFixture(),result=closeOwnedReleaseFiles(f.ops,f.args);assert.equal(result.failure,null);assert.equal(result.lockReleased,true);assert.deepEqual(f.events.filter(e=>['close','unlink'].includes(e[0])),[['close',f.args.outFd],['close',f.args.lockFd],['unlink','/lock']]);assert.equal(f.files.has('/reserved'),true);});
test('v3 unknown DB close prevents lock release',()=>{const f=closureFixture(),result=closeOwnedReleaseFiles(f.ops,{...f.args,dbClosed:false});assert.equal(result.lockReleased,false);assert.equal(f.files.has('/lock'),true);assert.equal(completedReleaseStatus({...verified,...result,dbClosed:false}).complete,false);});
for(const [name,path,extra]of [['foreign lock','/lock',{ino:999}],['linked lock','/lock',{nlink:2}],['wrong mode','/lock',{mode:0o100644}],['foreign reserved','/reserved',{ino:998}]])test('v3 closure refuses '+name,()=>{const f=closureFixture();f.files.get(path).stat={...f.files.get(path).stat,...extra};const result=closeOwnedReleaseFiles(f.ops,f.args);assert.equal(result.failure.code,'RELEASE_FILE_OWNERSHIP_REFUSED');assert.equal(result.lockReleased,false);assert.equal(f.events.some(e=>e[0]==='unlink'),false);assert.equal(completedReleaseStatus({...verified,...result}).complete,false);});
for(const [name,fdKey]of [['reserved','outFd'],['lock','lockFd']])test('v3 '+name+' close failure preserves FAIL and lock',()=>{const f=closureFixture(),original=f.ops.closeSync;f.ops.closeSync=fd=>{if(fd===f.args[fdKey])throw Error('injected close');original(fd);};const result=closeOwnedReleaseFiles(f.ops,f.args);assert.equal(result.lockReleased,false);assert.equal(result.failure.code,name==='reserved'?'RESERVED_RESULT_CLOSE_UNKNOWN':'SERIAL_LOCK_CLOSE_UNKNOWN');assert.equal(completedReleaseStatus({...verified,...result}).complete,false);assert.equal(f.files.has('/lock'),true);});
test('v3 unlink refusal cannot become completion PASS',()=>{const f=closureFixture();f.fault.unlink=1;const result=closeOwnedReleaseFiles(f.ops,f.args);assert.equal(result.failure.code,'SERIAL_LOCK_RELEASE_REFUSED');assert.equal(result.lockReleased,false);assert.equal(completedReleaseStatus({...verified,...result}).complete,false);});
const proposedCompletion={status:'PASS',complete:true,reservedEvidence:{path:'/reserved',sha256:hex},requiresSuccessfulCommandExit:true};
test('v3 new completion uses exclusive nofollow 0600 after closure',()=>{const f=fakeFs();publishCompletion(f.ops,'/completion',proposedCompletion);assert.deepEqual(f.json('/completion'),proposedCompletion);assert.deepEqual(f.events[0],['open','/completion',15,0o600]);assert.equal(f.fds.size,0);});
test('v3 existing foreign completion is never written or replaced',()=>{const f=fakeFs(),existing=f.add('/completion');f.ops.closeSync(existing.fd);const own=f.files.get('/completion'),bytes=Buffer.from('foreign immutable');own.bytes=bytes;f.events.length=0;assert.throws(()=>publishCompletion(f.ops,'/completion',proposedCompletion),/COMPLETION_PUBLICATION_REFUSED/u);assert.equal(f.files.get('/completion'),own);assert.equal(f.files.get('/completion').bytes,bytes);assert.deepEqual(f.events,[['open','/completion',15,0o600]]);});
for(const key of ['write','fsync','close'])test('v3 '+key+' publication failure cannot leave accepted PASS',()=>{const f=fakeFs();const reserved=f.add('/reserved');f.files.get('/reserved').bytes=Buffer.from('{"status":"FAIL","complete":false}');f.ops.closeSync(reserved.fd);const originalReserved=f.files.get('/reserved').bytes;f.fault[key]=1;assert.throws(()=>publishCompletion(f.ops,'/completion',proposedCompletion),/COMPLETION_PUBLICATION_REFUSED/u);assert.equal(f.json('/completion').status,'FAIL');assert.equal(f.json('/completion').complete,false);assert.equal(f.files.get('/reserved').bytes,originalReserved);});
test('v3 failure downgrade refuses a replaced completion inode',()=>{const f=fakeFs(),originalClose=f.ops.closeSync;let failed=false;f.ops.closeSync=fd=>{if(!failed){failed=true;const foreign={stat:stat(900),bytes:Buffer.from('foreign immutable'),path:'/completion'};f.files.set('/completion',foreign);throw Error('close unknown');}originalClose(fd);};assert.throws(()=>publishCompletion(f.ops,'/completion',proposedCompletion),/COMPLETION_PUBLICATION_REFUSED/u);assert.equal(f.files.get('/completion').bytes.toString(),'foreign immutable');assert.equal(f.events.filter(e=>e[0]==='truncate').length,1);});
test('v3 repeated filesystem failure leaves reserved FAIL unchanged',()=>{const f=fakeFs(),r=f.add('/reserved');f.files.get('/reserved').bytes=Buffer.from('{"status":"FAIL","complete":false}');f.ops.closeSync(r.fd);const bytes=f.files.get('/reserved').bytes;f.fault.fsync=2;assert.throws(()=>publishCompletion(f.ops,'/completion',proposedCompletion));assert.equal(f.files.get('/reserved').bytes,bytes);});
test('v3 completion is a mandatory distinct output argument',()=>{const args=['--target','protected','--base-url','http://127.0.0.1:3060','--other-report',report,'--other-source-revision',revision,'--artifact-dir','web/dist-protected','--out','reserved','--review-manifest',report,'--review-manifest-sha256',hex,'--final-source-revision',revision,'--final-build-revision',revision,'--final-context-report',report,'--final-context-source-revision',revision];assert.throws(()=>parseReleaseArgs(args));assert.throws(()=>parseReleaseArgs([...args,'--completion-out','reserved']));assert.equal(parseReleaseArgs([...args,'--completion-out','completion']).completionOut,'completion');});

// V4 chronology probes use synthetic metadata solely for closed-schema checks.
// They do not claim a real pre-O launch observation or actual O/browser PASS.
function artifactMetadata(){
 const artifactFiles=[{path:'source-only-placeholder',sha256:hex}],artifactInventorySha256=digest(Buffer.from(JSON.stringify(artifactFiles)));
 const review={finalSourceRevision:revision,finalBuildRevision:revision},prior={O:{reportSha256:hex,approvedSourceRevision:revision}};
 const seal={kind:'phase5-planning-year-tested-artifact-seal-v1',target:'protected',baseURL:'http://127.0.0.1:3060',finalSourceRevision:revision,finalBuildRevision:revision,otherReportSha256:hex,otherApprovedSourceRevision:revision,runtimeClosureSha256:hex,artifactFiles,artifactInventorySha256,recordedDuringActualO:true,launchProof:{report,sha256:hex}};
 const launch={kind:'phase5-planning-year-isolated-tested-launch-v1',target:'protected',baseURL:'http://127.0.0.1:3060',sourceRevision:revision,buildRevision:revision,artifactInventorySha256,recordedBeforeOtherCases:true,completionKnown:true};
 return {seal,launch,context:{review,prior,runtimeClosureSha256:hex,artifactFiles,sha:digest}};
}
test('v4 pre-O launch schema needs no future O raw-report hash',()=>{const m=artifactMetadata();assert.equal(validateFinalArtifactSeal(m.seal,m.launch,m.context),undefined);assert.equal(Object.hasOwn(m.launch,'testedByOtherReportSha256'),false);});
test('v4 removed future-report launch field is rejected as extra',()=>{const m=artifactMetadata();m.launch.testedByOtherReportSha256=hex;assert.throws(()=>validateFinalArtifactSeal(m.seal,m.launch,m.context),/CLOSED_TESTED_LAUNCH_PROOF/u);});
test('v4 post-O seal still binds the full actual O raw SHA',()=>{const m=artifactMetadata();m.seal.otherReportSha256='c'.repeat(64);assert.throws(()=>validateFinalArtifactSeal(m.seal,m.launch,m.context),/FINAL_ARTIFACT_TESTED_SOURCE/u);});
for(const [key,value]of [['sourceRevision','c'.repeat(40)],['buildRevision','c'.repeat(40)],['artifactInventorySha256','c'.repeat(64)],['recordedBeforeOtherCases',false],['completionKnown',false]])test('v4 pre-O launch retains '+key+' binding',()=>{const m=artifactMetadata();m.launch[key]=value;assert.throws(()=>validateFinalArtifactSeal(m.seal,m.launch,m.context),/ROOT_REVIEWED_ACTUAL_TESTED_LAUNCH/u);});

// V5 cleanup classifier probes. The names below are actual G18 attachment labels,
// not fabricated positive business/API evidence.
test('v5 actual G18 audit-failure labels remain legitimate completed proof',()=>{
 assert.equal(hasUnsafeCleanupAttachment([
  {name:'audit-failure-original-six-indices-geometry.json'},
  {name:'audit-failure-original-six-indices.png'},
  {name:'cleanup.json'},
 ]),false);
});
test('v5 deferred cleanup blocks completion even beside positive audit-failure proof',()=>{
 assert.equal(hasUnsafeCleanupAttachment([{name:'audit-failure-original-six-indices.png'},{name:'cleanup-deferred.json'}]),true);
});
test('v5 failed cleanup blocks completion even beside a normal cleanup attachment',()=>{
 assert.equal(hasUnsafeCleanupAttachment([{name:'cleanup.json'},{name:'cleanup-failure.json'}]),true);
});
