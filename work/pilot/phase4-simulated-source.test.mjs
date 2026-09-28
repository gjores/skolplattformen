import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const script=new URL('./phase4-simulated-source.mjs',import.meta.url);
for(const args of [[],['--target','baseline'],['--target=protected'],['--target protected'],['--target','protected','--db-url','postgres://invalid'],['--target','protected','--linked']]){
 test(`refuses unapproved CLI arguments: ${JSON.stringify(args)}`,()=>{
  const p=spawnSync(process.execPath,[script.pathname,...args],{encoding:'utf8'});
  assert.equal(p.status,1);assert.equal(p.stdout,'');assert.equal(p.stderr.trim(),'REFUSED');
 });
}
