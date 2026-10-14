import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,symlinkSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {parseCopyApiArgs,artifactManifest,COPY_ENTRY} from './verify-programplan-copy-api.mjs';

test('API arguments permit only loopback HTTP and a private JSON report',()=>{
 const valid=parseCopyApiArgs(['--base-url','http://127.0.0.1:3061','--out','/private/tmp/copy-proof.json','--preflight']);
 assert.deepEqual(valid,{url:'http://127.0.0.1:3061',out:'/private/tmp/copy-proof.json',preflight:true});
 for(const url of ['https://127.0.0.1:3061','http://localhost:3061','http://192.168.1.2:3061','http://127.0.0.1:3061/path','http://127.0.0.1:3061/?secret=x','http://user:password@127.0.0.1:3061']){
  assert.throws(()=>parseCopyApiArgs(['--base-url',url,'--out','/private/tmp/copy-proof.json']));
 }
 assert.throws(()=>parseCopyApiArgs(['--base-url','http://127.0.0.1:3061','--out','/Users/copy.json']));
 assert.throws(()=>parseCopyApiArgs(['--base-url','http://127.0.0.1:3061','--out','/private/tmp/copy-proof.json','--reset']));
 assert.throws(()=>parseCopyApiArgs(['--base-url','http://127.0.0.1:3061','--out','/private/tmp/copy-proof.json','--preflight','--preflight']));
 assert.throws(()=>parseCopyApiArgs(['--base-url','http://127.0.0.1:3061']));
 assert.equal(COPY_ENTRY,'public.phase5_copy_programplan_education(uuid,uuid,integer,integer,uuid,text,text,text,jsonb,boolean)');
});

test('artifact hashing includes all built bytes and excludes private runtime vars',()=>{
 const directory=mkdtempSync('/private/tmp/copy-artifact-test-');
 try{
  mkdirSync(join(directory,'server'));writeFileSync(join(directory,'build-mode.json'),'{}');writeFileSync(join(directory,'server/worker.js'),'export const built=true;');
  writeFileSync(join(directory,'server/.dev.vars'),'SYNTHETIC_SECRET=first');writeFileSync(join(directory,'server/.dev.vars.lock'),'private');
  const first=artifactManifest(directory);assert.equal(first.fileCount,2);
  assert.ok(first.files.every(file=>!file.path.includes('.dev.vars')));
  writeFileSync(join(directory,'server/.dev.vars'),'SYNTHETIC_SECRET=second');assert.deepEqual(artifactManifest(directory),first);
  writeFileSync(join(directory,'server/worker.js'),'export const built=false;');assert.notEqual(artifactManifest(directory).sha256,first.sha256);
  symlinkSync(join(directory,'server/.dev.vars'),join(directory,'server/link'));assert.throws(()=>artifactManifest(directory));
 }finally{rmSync(directory,{recursive:true,force:true});}
});
