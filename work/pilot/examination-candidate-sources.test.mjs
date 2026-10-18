import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {examinationCandidateSources,examinationProductPaths,ownedCandidateRoot} from './examination-candidate-sources.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
test('candidate product scope remains identical to the established package proof scope',()=>{
 const code=readFileSync(new URL('./apply-named-timplans.mjs',import.meta.url),'utf8');
 const match=/const product=(\[[^;]+\]);/u.exec(code);assert.ok(match);
 assert.deepEqual(JSON.parse(match[1].replaceAll("'",'"')),examinationProductPaths);
});
test('owned clean checkout binds disk bytes to committed blobs and rejects dirty, staged, untracked or wrong revision',()=>{
 const checkout=mkdtempSync(join(ownedCandidateRoot,'examination-source-test-'));
 const git=(...args)=>execFileSync('git',args,{cwd:checkout,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 try{
  git('init','--quiet');git('config','user.name','Synthetic contract test');git('config','user.email','synthetic@example.invalid');
  mkdirSync(join(checkout,'web/app'),{recursive:true});writeFileSync(join(checkout,'web/app/page.ts'),'export const synthetic = true;\n');
  writeFileSync(join(checkout,'web/package.json'),'{}\n');git('add','.');git('commit','--quiet','-m','synthetic fixture');
  const revision=git('rev-parse','HEAD'),request={checkout,revision};
  const valid=examinationCandidateSources(request);assert.deepEqual(valid.candidateCheckout,{path:checkout,revision});assert.equal(valid.sources['web/app/page.ts'],sha('export const synthetic = true;\n'));
  assert.throws(()=>examinationCandidateSources({...request,revision:'0'.repeat(40)}));
  writeFileSync(join(checkout,'web/app/page.ts'),'changed\n');assert.throws(()=>examinationCandidateSources(request));
  git('add','web/app/page.ts');assert.throws(()=>examinationCandidateSources(request));git('reset','--hard','HEAD');
  writeFileSync(join(checkout,'web/app/untracked.ts'),'untracked');assert.throws(()=>examinationCandidateSources(request));rmSync(join(checkout,'web/app/untracked.ts'));
  writeFileSync(join(checkout,'.gitignore'),'web/app/ignored.ts\n');writeFileSync(join(checkout,'web/app/ignored.ts'),'ignored');assert.throws(()=>examinationCandidateSources(request));rmSync(join(checkout,'web/app/ignored.ts'));
  // Git's assume-unchanged bit can hide modifications from status; blob comparison must still catch them.
  git('update-index','--assume-unchanged','web/app/page.ts');writeFileSync(join(checkout,'web/app/page.ts'),'hidden changed\n');assert.equal(git('status','--porcelain','--','web/app'),'');assert.throws(()=>examinationCandidateSources(request),/disk differs/u);git('update-index','--no-assume-unchanged','web/app/page.ts');git('checkout','--','web/app/page.ts');
  const link=checkout+'-link';symlinkSync(checkout,link);try{assert.throws(()=>examinationCandidateSources({checkout:link,revision}),/symlinks/u);}finally{rmSync(link);}
  assert.deepEqual(examinationCandidateSources(request),valid);
 }finally{rmSync(checkout,{recursive:true,force:true});}
});
