import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const server=new URL('./server/',import.meta.url);
registerHooks({load(url,context,next){
  const is=name=>url===new URL(name,server).href;
  if(is('db.ts'))return {format:'module',shortCircuit:true,source:'export class Deny extends Error{constructor(code,status,details){super(code);this.code=code;this.status=status;this.details=details;}}'};
  if(is('authz.ts'))return {format:'module',shortCircuit:true,source:'export class AuditUnavailable extends Error{}'};
  if(is('mandate-route.ts'))return {format:'module',shortCircuit:true,source:'export function mandateOperation(){throw Error("must not be called")}'};
  return next(url,context);
}});
const {tjanstRequest,TJANST_REQUEST_BYTES}=await import('./server/tjanst.ts');
const request=(text,streamed=false)=>new Request('http://localhost/api/schema/datum',{method:'POST',headers:{'Content-Type':'application/json'},body:streamed?new ReadableStream({start(controller){for(let at=0;at<text.length;at+=8192)controller.enqueue(new TextEncoder().encode(text.slice(at,at+8192)));controller.close();}}):text,...streamed?{duplex:'half'}:{}});
test('stora schemaunderlag kan läsas med egen gräns medan tjänstefördelningens ordinarie gräns består',async()=>{
  const body=JSON.stringify({placements:'x'.repeat(TJANST_REQUEST_BYTES+1024)});
  await assert.rejects(()=>tjanstRequest(request(body),x=>x),e=>e.code==='bad_request'&&e.details.reason==='payload_too_large');
  const accepted=await tjanstRequest(request(body,true),x=>x,8*1024*1024);assert.equal(accepted.placements.length,TJANST_REQUEST_BYTES+1024);
});
test('schemats större gräns är fortfarande hård för strömmade anrop utan Content-Length',async()=>{
  const limit=8*1024*1024,body=JSON.stringify({datedOverrides:'x'.repeat(limit)});
  await assert.rejects(()=>tjanstRequest(request(body,true),x=>x,limit),e=>e.code==='bad_request'&&e.details.reason==='payload_too_large');
});
