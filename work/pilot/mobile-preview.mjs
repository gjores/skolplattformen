// Tillfällig, länkavgränsad ingång till den syntetiska provmiljön på samma LAN.
// Produktens Worker, OIDC-utfärdare, callback och behörigheter förblir oförändrade.
import {createServer} from 'node:http';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {networkInterfaces} from 'node:os';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {assertTarget} from './verify-target.mjs';

const APP = 'http://127.0.0.1:3012';
const IDP = 'http://host.docker.internal:8180';
const OTP = 'http://127.0.0.1:8181';
const COOKIE = 'sp_mobile_access';
const MAX_BODY = 1024 * 1024;
const TTL = 2 * 60 * 60 * 1000;
const HOP_HEADERS = ['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade','content-length','content-encoding'];

function equal(a,b) {
  if(typeof a!=='string') return false;
  const left=Buffer.from(a),right=Buffer.from(b);
  return left.length===right.length && timingSafeEqual(left,right);
}

export function privateAddress(address) {
  const parts=address.split('.').map(Number);
  return parts.length===4 && parts.every(n=>Number.isInteger(n)&&n>=0&&n<=255)
    && (parts[0]===10 || parts[0]===192&&parts[1]===168 || parts[0]===172&&parts[1]>=16&&parts[1]<=31);
}

export function mobileLocation(value, origin) {
  for (const base of [APP,IDP,'http://127.0.0.1:8180','http://localhost:8180']) {
    if(value===base || value.startsWith(base+'/')) return origin+value.slice(base.length);
  }
  return value;
}

function idpText(text,origin) {
  // Bara synliga absoluta adresser byts. Kodade redirect_uri-parametrar behåller
  // originalets callback, så kodutbytet fortfarande använder exakt samma URI.
  text=text.replaceAll(OTP+'/otp',origin+'/__mobile/otp');
  for(const base of [IDP,'http://127.0.0.1:8180','http://localhost:8180']) text=text.replaceAll(base,origin);
  return text;
}

export function createMobilePreviewServer({origin,accessKey,expiresAt=Date.now()+TTL,fetchUpstream=fetch}) {
  const expectedHost=new URL(origin).host;
  if(!/^http:\/\/[\d.]+:\d+$/u.test(origin)||!/^\w{32}$/u.test(accessKey)) throw Error('invalid_mobile_configuration');
  return createServer(async (request,response)=>{
    const reply=(status,message)=>{
      request.resume(); response.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
      response.end(message);
    };
    if(request.headers.host!==expectedHost || Date.now()>=expiresAt) return reply(403,'Mobilingången är stängd. Öppna den aktuella åtkomstlänken från chatten.');
    const url=new URL(request.url,origin);
    if(url.origin!==origin) return reply(403,'Fel adress.');
    if(/%2f|%5c/iu.test(url.pathname)) return reply(404,'Ingen sådan provväg.');
    if(url.pathname==='/__mobile/start' && request.method==='GET') {
      if(!equal(url.searchParams.get('key'),accessKey)) return reply(403,'Fel åtkomstlänk.');
      response.writeHead(303,{'Location':'/?vy=programplaner','Set-Cookie':`${COOKIE}=${accessKey}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0,Math.floor((expiresAt-Date.now())/1000))}`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
      return response.end();
    }
    const cookies=(request.headers.cookie??'').split(';').map(s=>s.trim());
    if(!cookies.some(c=>c.startsWith(COOKIE+'=')&&equal(c.slice(COOKIE.length+1),accessKey))) return reply(403,'Öppna först den aktuella åtkomstlänken från chatten.');
    // Avvisa främmande ursprung innan ett ursprung översätts till loopback.
    if(request.headers.origin && request.headers.origin!==origin) return reply(403,'Främmande ursprung nekas.');
    if(!['GET','HEAD'].includes(request.method) && request.headers.origin!==origin) return reply(403,'Ursprung krävs.');
    if(request.headers['sec-fetch-site']==='cross-site') return reply(403,'Främmande anrop nekas.');
    let base=APP;
    const isIdp=url.pathname.startsWith('/realms/skolplattform-test/')||url.pathname.startsWith('/resources/');
    if(url.pathname.startsWith('/realms/')&&!isIdp) return reply(404,'Ingen sådan provrealm.');
    if(url.pathname.startsWith('/admin')||url.pathname.startsWith('/__mobile/')&&url.pathname!=='/__mobile/otp') return reply(404,'Ingen sådan provväg.');
    if(isIdp) base=IDP;
    if(url.pathname==='/__mobile/otp') {
      if(request.method!=='POST'||request.headers['content-type']!=='application/json') return reply(405,'Provkod kräver POST och JSON.');
      base=OTP;
    }
    const target=new URL(base===OTP?'/otp':url.pathname+url.search,base);
    const headers=new Headers();
    for(const name of ['accept','accept-language','content-type','user-agent','sec-fetch-dest','sec-fetch-mode','sec-fetch-site']) if(request.headers[name]) headers.set(name,request.headers[name]);
    const upstreamCookies=cookies.filter(c=>!c.startsWith(COOKIE+'='));
    if(upstreamCookies.length&&base!==OTP) headers.set('Cookie',upstreamCookies.join('; '));
    if(request.headers.origin) headers.set('Origin',base===OTP?IDP:base);
    if(request.headers.referer) headers.set('Referer',base+'/');
    const abort=new AbortController();
    response.on('close',()=>abort.abort());
    try {
      let body;
      if(!['GET','HEAD'].includes(request.method)) {
        const chunks=[];let size=0;
        for await(const chunk of request) {
          size+=chunk.length;
          if(size>MAX_BODY) return reply(413,'Begäran är för stor.');
          chunks.push(chunk);
        }
        if(size) body=Buffer.concat(chunks);
      }
      const result=await fetchUpstream(target,{method:request.method,headers,body,redirect:'manual',signal:AbortSignal.any([abort.signal,AbortSignal.timeout(60000)])});
      const outgoing=Object.fromEntries(result.headers);
      for(const name of [...HOP_HEADERS,'set-cookie','access-control-allow-origin','access-control-allow-credentials']) delete outgoing[name];
      outgoing['cache-control']='no-store';outgoing['referrer-policy']='same-origin';outgoing['x-content-type-options']='nosniff';
      const setCookies=result.headers.getSetCookie();
      if(setCookies.length) outgoing['set-cookie']=setCookies;
      if(outgoing.location) outgoing.location=mobileLocation(outgoing.location,origin);
      let content=Buffer.from(await result.arrayBuffer());
      const contentType=result.headers.get('content-type')??'';
      if(isIdp&&(contentType.includes('text/html')||url.pathname.endsWith('/js/test-accounts-v2.js'))) {
        let text=idpText(content.toString('utf8'),origin);
        // Den lokala hjälpens tidigare cross-origin-anrop utelämnade cookies.
        // Mobilens same-origin-anrop behöver enbart ingångens åtkomstcookie.
        if(url.pathname.endsWith('/js/test-accounts-v2.js')) text=text.replaceAll("credentials:'omit'","credentials:'same-origin'");
        content=Buffer.from(text);
        delete outgoing.etag;
      } else if(base===APP&&url.pathname==='/api/auth/logout'&&contentType.includes('application/json')&&result.ok) {
        const payload=JSON.parse(content.toString('utf8'));
        if(typeof payload.redirect!=='string') throw Error('invalid_logout');
        payload.redirect=mobileLocation(payload.redirect,origin);
        content=Buffer.from(JSON.stringify(payload));
      }
      if(!abort.signal.aborted) {response.writeHead(result.status,outgoing);response.end(request.method==='HEAD'?undefined:content);}
    } catch {
      if(!abort.signal.aborted) reply(502,'Den lokala provtjänsten svarar inte. Försök igen.');
    }
  });
}

async function start() {
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=='--address'||!privateAddress(args[1])) throw Error('Ange --address med datorns privata wifi-adress.');
  const address=args[1];
  if(!Object.values(networkInterfaces()).flat().some(n=>n?.address===address&&!n.internal)) throw Error('Adressen tillhör inte datorn.');
  const manifest=await assertTarget('protected',{requireIdp:true});
  if(manifest.idp.issuer!==IDP+'/realms/skolplattform-test'||manifest.idp.publicUrl!=='http://127.0.0.1:8180') throw Error('Endast den befintliga lokala prov-IdP:n stöds.');
  const health=await fetch(APP+'/api/health/db',{signal:AbortSignal.timeout(10000)});
  const db=await health.json();
  if(!health.ok||db.runtime!=='workerd'||db.role!=='skolplattform_worker') throw Error('Skyddad lokal Worker måste köras.');
  const origin=`http://${address}:3013`,accessKey=randomBytes(16).toString('hex'),expiresAt=Date.now()+TTL;
  const server=createMobilePreviewServer({origin,accessKey,expiresAt});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(3013,address,resolve);});
  const entry=origin+'/__mobile/start?key='+accessKey;
  try {
    await writeFile(new URL('./targets/protected/mobile-preview.json',import.meta.url),JSON.stringify({origin,entry,expiresAt})+'\n',{mode:0o600});
  } catch(error) {
    server.close();server.closeAllConnections();throw error;
  }
  console.log(`Mobilingång kör på ${origin}; åtkomstlänk finns i privat målfil och gäller i två timmar.`);
  const stop=()=>{server.close();server.closeAllConnections();};
  const timer=setTimeout(stop,TTL);
  process.once('SIGINT',()=>{clearTimeout(timer);stop();});
  process.once('SIGTERM',()=>{clearTimeout(timer);stop();});
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) {
  try {await start();} catch {console.error('Mobilingång kunde inte starta: LOCAL_MOBILE_FAILED');process.exitCode=1;}
}
