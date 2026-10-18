// Product evidence for an owned, immutable build checkout. Never reads the shared worktree's product files.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const ownedCandidateRoot=resolve(root,'work/pilot/targets/protected/runtime');
// Kept identical to apply-named-timplans.mjs; contract test guards the scope.
export const examinationProductPaths=['web/app','web/lib','web/components','web/hooks','web/scripts','web/package.json','web/package-lock.json','web/vite.config.ts','web/vinext.config.ts'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function examinationCandidateSources({checkout,revision}){
 assert.match(revision,/^[a-f0-9]{40}$/u,'An exact build revision is required');
 assert.equal(checkout,resolve(checkout));assert.equal(realpathSync(checkout),checkout,'Candidate symlinks refused');
 assert.ok(checkout.startsWith(ownedCandidateRoot+'/'),'Candidate must be an owned runtime checkout');
 assert.ok(lstatSync(checkout).isDirectory());
 const git=(args,options={})=>execFileSync('git',args,{cwd:checkout,maxBuffer:128*1024*1024,...options});
 const text=args=>git(args,{encoding:'utf8'}).trim();
 assert.equal(realpathSync(text(['rev-parse','--show-toplevel'])),checkout,'Candidate must be its own checkout');
 assert.equal(text(['rev-parse','HEAD']),revision,'Candidate HEAD differs from the built revision');
 const clean=()=>{
  assert.equal(text(['status','--porcelain','--untracked-files=all','--',...examinationProductPaths]),'','Candidate product must be committed and clean');
  assert.equal(text(['ls-files','--others','--',...examinationProductPaths]),'','Untracked candidate product files refused, including ignored files');
 };
 clean();
 const entries=git(['ls-tree','-r','-z','--full-tree',revision,'--',...examinationProductPaths],{encoding:'utf8'}).split('\0').filter(Boolean).map(line=>{
  const match=/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(line);assert.ok(match,'Only regular committed product files are permitted');
  return{oid:match[2],path:match[3]};
 });
 assert.ok(entries.length>0,'Empty product checkout');
 const batch=git(['cat-file','--batch'],{input:entries.map(e=>e.oid).join('\n')+'\n'});let offset=0;
 const sources={};
 for(const entry of entries){
  const end=batch.indexOf(10,offset);assert.ok(end>=offset);const header=batch.subarray(offset,end).toString('utf8').split(' ');
  assert.equal(header[0],entry.oid);assert.equal(header[1],'blob');assert.match(header[2],/^\d+$/u);
  const size=Number(header[2]);offset=end+1;const content=batch.subarray(offset,offset+size);assert.equal(content.length,size);offset+=size;assert.equal(batch[offset++],10);
  assert.ok(!entry.path.split('/').includes('..'));const file=resolve(checkout,entry.path);assert.equal(realpathSync(file),file,'Product symlink refused');assert.ok(lstatSync(file).isFile());
  const disk=readFileSync(file);assert.equal(sha(disk),sha(content),'Candidate disk differs from committed blob: '+entry.path);sources[entry.path]=sha(content);
 }
 assert.equal(offset,batch.length);clean();assert.equal(text(['rev-parse','HEAD']),revision,'Candidate moved while being verified');
 return{sources,candidateCheckout:{path:checkout,revision}};
}
