import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {createOtpHelperServer} from './idp-otp-helper.mjs';

test('only the local IdP can request codes for the three synthetic OTP accounts', async () => {
  const calls=[];
  const server=createOtpHelperServer(async user=>{calls.push(user);return '123456';});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(body,headers={},method='POST')=>fetch(base+'/otp',{method,headers:{Origin:'http://127.0.0.1:8180','Content-Type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})});
  const valid={realm:'skolplattform-test',username:'p3.rektor'};
  try {
    for(const headers of [{Origin:'https://example.com'},{Origin:'null'},{Origin:''}])
      assert.equal((await request(valid,headers)).status,403);
    const rebound=await new Promise((resolve,reject)=>{const r=httpRequest(base+'/otp',{method:'POST',headers:{Host:'example.com',Origin:'http://127.0.0.1:8180','Content-Type':'application/json'}},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);r.end(JSON.stringify(valid));});
    assert.equal(rebound,403);
    for(const body of [null,[],{}, {...valid,realm:'another-realm'},{...valid,username:'p2.principal'},{...valid,extra:true}])
      assert.equal((await request(body)).status,403);
    assert.equal((await request(valid,{},'GET')).status,405);
    assert.deepEqual(calls,[]);
    const response=await request(valid);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'),'http://127.0.0.1:8180');
    assert.deepEqual(await response.json(),{code:'123456'});
    assert.deepEqual(calls,['p3.rektor']);
    const preflight=await fetch(base+'/otp',{method:'OPTIONS',headers:{Origin:'http://host.docker.internal:8180','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('access-control-allow-origin'),'http://host.docker.internal:8180');
    assert.equal(preflight.headers.get('access-control-allow-credentials'),null);
  } finally {await new Promise(resolve=>server.close(resolve));}
});

test('malformed, oversized and failed requests expose no private error or arbitrary output', async () => {
  const server=createOtpHelperServer(async()=>{throw Error('private diagnostic');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const headers={Origin:'http://127.0.0.1:8180','Content-Type':'application/json'};
  try {
    assert.equal((await fetch(base+'/otp',{method:'POST',headers,body:'{'})).status,400);
    assert.equal((await fetch(base+'/otp',{method:'POST',headers,body:'x'.repeat(1500)})).status,413);
    const failed=await fetch(base+'/otp',{method:'POST',headers,body:JSON.stringify({realm:'skolplattform-test',username:'p3.it'})});
    assert.equal(failed.status,503);
    assert.deepEqual(await failed.json(),{error:'local_helper_unavailable'});
    assert.equal((await fetch(base+'/otp?username=p3.it',{method:'POST',headers,body:'{}'})).status,404);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
