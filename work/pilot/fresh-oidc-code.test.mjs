import test from 'node:test';
import assert from 'node:assert/strict';
import { freshOidcCode } from './fresh-oidc-code.mjs';

// Symbolic outputs only: no secrets or authentication codes in fixtures or output.
test('a fresh period can be used without waiting', async () => {
  assert.equal(await freshOidcCode({now:()=>30000,generate:()=> 'new-period',
    wait:()=>assert.fail('unnecessary wait')}), 'new-period');
});
test('the last eight seconds wait for the next period before generating', async () => {
  let time=22250, generatedAt=[];
  const result=await freshOidcCode({now:()=>time,wait:async ms=>{time+=ms;},
    generate:t=>{generatedAt.push(t);return 'next-period';}});
  assert.equal(result,'next-period');assert.deepEqual(generatedAt,[30000]);
});
test('a previously used output is never reused', async () => {
  let time=21000;
  const result=await freshOidcCode({now:()=>time,wait:async ms=>{time+=ms;},
    lastCode:'old-period',generate:t=>t<30000?'old-period':'next-period'});
  assert.equal(result,'next-period');assert.equal(time,30000);
});
test('waiting is bounded when a new output cannot be generated', async () => {
  let time=0;
  await assert.rejects(freshOidcCode({now:()=>time,wait:async ms=>{time+=ms;},
    lastCode:'unchanged',generate:()=> 'unchanged'}),/Fresh OTP unavailable/);
  assert.equal(time,32500);
});
