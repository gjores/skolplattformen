import test from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {createMobilePreviewServer,mobileLocation,privateAddress} from './mobile-preview.mjs';

const key='a'.repeat(32);
async function fixture(t,upstream=()=>new Response('ok')) {
  let server,origin,calls=[];
  // Port binds first; incoming requests cannot run until the configured handler exists.
  const {createServer}=await import('node:http');
  const probe=createServer();
  await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  origin=`http://127.0.0.1:${port}`;
  server=createMobilePreviewServer({origin,accessKey:key,fetchUpstream:async (url,options)=>{calls.push({url:String(url),options});return upstream(url,options);}});
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const send=(path,options={})=>fetch(origin+path,{redirect:'manual',...options,headers:{Cookie:`sp_mobile_access=${key}`,...options.headers}});
  return {origin,calls,send};
}

test('startadress måste vara privat IPv4; publika, wildcard och loopback nekas',()=>{
  for(const ip of ['192.168.68.109','10.1.2.3','172.16.0.2','172.31.255.1']) assert.equal(privateAddress(ip),true);
  for(const ip of ['0.0.0.0','127.0.0.1','8.8.8.8','172.32.0.1','192.168.0.999','192.168.1']) assert.equal(privateAddress(ip),false);
});

test('åtkomstlänk sätter separat HttpOnly-cookie och tar bort nyckeln ur adressen',async t=>{
  const f=await fixture(t);
  const noKey=await fetch(f.origin,{redirect:'manual'});assert.equal(noKey.status,403);
  const bad=await f.send('/__mobile/start?key=wrong');assert.equal(bad.status,403);
  const opened=await f.send('/__mobile/start?key='+key);assert.equal(opened.status,303);
  assert.equal(opened.headers.get('location'),'/?vy=programplaner');
  assert.match(opened.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);
  assert.equal(opened.headers.get('referrer-policy'),'no-referrer');assert.equal(f.calls.length,0);
});

test('fel Host, främmande eller saknat write-Origin, cross-site och andra realmer nekas före proxy',async t=>{
  const f=await fixture(t);
  const wrongHost=await new Promise((resolve,reject)=>{
    const request=httpRequest(f.origin,{headers:{Host:'foreign.example',Cookie:`sp_mobile_access=${key}`}},response=>{response.resume();resolve(response.statusCode);});
    request.on('error',reject);request.end();
  });
  assert.equal(wrongHost,403);
  for(const [path,options,status] of [
    ['/',{headers:{Cookie:'sp_mobile_access='+encodeURIComponent('å'.repeat(32))}},403],
    ['/',{headers:{Origin:'http://foreign.example'}},403],
    ['/api/auth/logout',{method:'POST'},403],
    ['/api/auth/logout',{method:'POST',headers:{Origin:'null'}},403],
    ['/',{headers:{'Sec-Fetch-Site':'cross-site'}},403],
    ['/realms/master/protocol/openid-connect/token',{},404],
    ['/admin/realms/skolplattform-test',{},404],
    ['/resources/x%2f..%2fadmin',{},404],
    ['/__mobile/otp',{method:'GET'},405],
  ]) assert.equal((await f.send(path,options)).status,status,`${path}: ${Object.keys(options.headers??{}).join(',')}`);
  assert.equal(f.calls.length,0);
});

test('utgången länk och cookie nekas',async t=>{
  const server=createMobilePreviewServer({origin:'http://127.0.0.1:30199',accessKey:key,expiresAt:0,fetchUpstream:()=>{throw Error('must_not_fetch');}});
  await new Promise(resolve=>server.listen(30199,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  for(const path of ['/','/__mobile/start?key='+key]) assert.equal((await fetch('http://127.0.0.1:30199'+path,{redirect:'manual',headers:{Cookie:'sp_mobile_access='+key}})).status,403);
});

test('app får bara sin loopback-origin och appcookie; kroppslös utloggning bevaras',async t=>{
  const f=await fixture(t);
  await f.send('/api/auth/logout',{method:'POST',headers:{Origin:f.origin,Cookie:`sp_mobile_access=${key}; sp_session=synthetic`}});
  assert.equal(f.calls[0].url,'http://127.0.0.1:3012/api/auth/logout');
  assert.equal(f.calls[0].options.headers.get('origin'),'http://127.0.0.1:3012');
  assert.equal(f.calls[0].options.headers.get('cookie'),'sp_session=synthetic');
  assert.equal(f.calls[0].options.body,undefined);
});

test('OIDC-navigation behåller kodad originalcallback men visar mobilursprunget',async t=>{
  const location='http://host.docker.internal:8180/realms/skolplattform-test/protocol/openid-connect/auth?redirect_uri=http%3A%2F%2F127.0.0.1%3A3012%2Fapi%2Fauth%2Fcallback&state=synthetic';
  const f=await fixture(t,()=>new Response(null,{status:302,headers:{Location:location}}));
  const result=await f.send('/api/auth/login');
  const moved=new URL(result.headers.get('location'));
  assert.equal(moved.origin,f.origin);
  assert.equal(moved.searchParams.get('redirect_uri'),'http://127.0.0.1:3012/api/auth/callback');
  assert.equal(mobileLocation('http://127.0.0.1:3012/api/auth/callback?code=synthetic',f.origin),f.origin+'/api/auth/callback?code=synthetic');
});

test('IdP-formulär och privat knappskript pekar på samma mobilursprung',async t=>{
  const f=await fixture(t,()=>new Response("const origin='http://host.docker.internal:8180';fetch('http://127.0.0.1:8181/otp',{credentials:'omit'});",{headers:{'Content-Type':'text/javascript','ETag':'old'}}));
  const result=await f.send('/resources/cache/login/skolplattform-local-test/js/test-accounts-v2.js');
  const text=await result.text();
  assert.ok(text.includes(f.origin+'/__mobile/otp'));assert.ok(!text.includes('host.docker.internal'));assert.ok(!text.includes('127.0.0.1:8181'));
  assert.ok(text.includes("credentials:'same-origin'"));
  assert.equal(result.headers.get('referrer-policy'),'same-origin');
  assert.equal(result.headers.get('etag'),null);assert.equal(f.calls[0].url.startsWith('http://host.docker.internal:8180/'),true);
});

test('provkod kräver rätt mobilorigin och skickas endast till lokala hjälpen',async t=>{
  const f=await fixture(t,()=>Response.json({code:'000000'},{headers:{'Access-Control-Allow-Origin':'http://host.docker.internal:8180'}}));
  const result=await f.send('/__mobile/otp',{method:'POST',headers:{Origin:f.origin,'Content-Type':'application/json'},body:JSON.stringify({realm:'skolplattform-test',username:'p3.rektor'})});
  assert.equal(result.status,200);assert.equal(result.headers.get('access-control-allow-origin'),null);
  assert.equal(f.calls[0].url,'http://127.0.0.1:8181/otp');assert.equal(f.calls[0].options.headers.get('origin'),'http://host.docker.internal:8180');
});

test('writeöverstorlek nekas och upstreamfel ger slutet svar utan tekniska detaljer',async t=>{
  const f=await fixture(t,()=>{throw Error('private_upstream_material');});
  const big=await f.send('/api/x',{method:'POST',headers:{Origin:f.origin},body:'x'.repeat(1024*1024+1)});assert.equal(big.status,413);assert.equal(f.calls.length,0);
  const failed=await f.send('/');assert.equal(failed.status,502);assert.ok(!(await failed.text()).includes('private_upstream_material'));
});

test('endast logout-redirect skrivs om i app-JSON; verksamhetsdata är oförändrade',async t=>{
  const f=await fixture(t,url=>Response.json(String(url).endsWith('/api/auth/logout')?{redirect:'http://host.docker.internal:8180/realms/skolplattform-test/protocol/openid-connect/logout?post_logout_redirect_uri=http%3A%2F%2F127.0.0.1%3A3012%2F'}:{name:'http://host.docker.internal:8180'}));
  const logout=await f.send('/api/auth/logout',{method:'POST',headers:{Origin:f.origin}});
  const data=await logout.json();assert.equal(new URL(data.redirect).origin,f.origin);
  assert.equal(new URL(data.redirect).searchParams.get('post_logout_redirect_uri'),'http://127.0.0.1:3012/');
  assert.deepEqual(await (await f.send('/api/utbildningar')).json(),{name:'http://host.docker.internal:8180'});
});
