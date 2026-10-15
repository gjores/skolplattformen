// Private, short-lived schema-only verification database from assertTarget(protected).
// No live table rows, identities, sessions, tokens or migration-journal data are exported.
// No arbitrary connection strings; no live resets, disconnects or template-copy.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,chmodSync,openSync,closeSync,writeFileSync,readFileSync,rmSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {assertTarget} from './verify-target.mjs';
import {allPublicHashes} from './verify-atomic-cohort-copy.mjs';

const postgres=createRequire(new URL('../../web/package.json',import.meta.url))('postgres');
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const binaries='/opt/homebrew/opt/postgresql@18/bin/';

// Canonical public DDL/ACL fingerprint; migration-journal ROWS are deliberately
// excluded because schema-only cloning must not copy any source table data.
export async function schemaFingerprint(db,details=false){
 const functions=await db`select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner::text owner from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`;
 const tables=await db`select c.relname,c.relkind,coalesce(c.relacl,acldefault(case when c.relkind='S' then 's'::"char" else 'r'::"char" end,c.relowner))::text acl,c.relowner::text owner,c.relrowsecurity,c.relforcerowsecurity,c.reloptions::text options from pg_class c where c.relnamespace='public'::regnamespace order by c.relname`;
 const columns=await db`select c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod) type,a.attnotnull,a.attidentity,a.attgenerated,a.attacl::text acl,pg_get_expr(d.adbin,d.adrelid) default_value from pg_attribute a join pg_class c on c.oid=a.attrelid left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where c.relnamespace='public'::regnamespace and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`;
 const constraints=await db`select c.relname,p.conname,pg_get_constraintdef(p.oid) definition,p.convalidated from pg_constraint p join pg_class c on c.oid=p.conrelid where c.relnamespace='public'::regnamespace order by c.relname,p.conname`;
 const indexes=await db`select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname`;
 const triggers=await db`select c.relname,t.tgname,pg_get_triggerdef(t.oid) definition,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal order by c.relname,t.tgname`;
 const policies=await db`select * from pg_policies where schemaname='public' order by tablename,policyname`;
 // pg_restore may represent an owner-only ACL as NULL (owner defaults) and
 // reparses two historical nested AND checks into an associative flat AND.
 // Normalize only these exact known equivalents; all other DDL must match.
 for(const c of constraints){
  const name=c.relname==='class_timplans'&&c.conname==='class_timplans_class_name_check'?'class_name':c.relname==='school_classes'&&c.conname==='school_classes_name_check'?'name':null;
  if(name){const nested=`CHECK ((((length(${name}) >= 1) AND (length(${name}) <= 60)) AND (${name} = upper(btrim(${name})))))`;
   const flat=`CHECK (((length(${name}) >= 1) AND (length(${name}) <= 60) AND (${name} = upper(btrim(${name})))))`;
   if(c.definition===nested)c.definition=flat;
  }
 }
 const structure={functions,tables,columns,constraints,indexes,triggers,policies};return details?structure:createHash('sha256').update(JSON.stringify(structure)).digest('hex');
}

export async function createNamedTimplanSnapshot(){
 const target=await assertTarget('protected'),endpoint=new URL(target.dbUrl);assert.equal(endpoint.hostname,'127.0.0.1');
 const name='named_timplan_'+randomUUID().replaceAll('-',''),dir=mkdtempSync('/private/tmp/named-timplan-snapshot-');chmodSync(dir,0o700);
 const dump=dir+'/snapshot.dump',log=dir+'/tools.log',journal=dir+'/journal.json';
 const info={kind:'named-timplan-schema-only-snapshot',schemaVersion:1,database:name,dataCopied:false,schemas:['public','auth','supabase_migrations','extensions'],sourceProject:target.projectId,sourceHost:endpoint.hostname,sourcePort:endpoint.port,startedAt:new Date().toISOString(),stage:'reserved',cleanup:'pending'};
 const save=()=>writeFileSync(journal,JSON.stringify(info,null,2)+'\n',{mode:0o600});save();
 const db=postgres(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});let clone,created=false,closing=false;const extraConnections=new Set();
 const clean=async()=>{
  closing=true;
  const closed=await Promise.allSettled([...extraConnections].map(async connection=>{await connection.end();extraConnections.delete(connection);}));
  const failure=closed.find(r=>r.status==='rejected');if(failure)throw failure.reason;
  if(clone){await clone.end();clone=null;}
  if(created){assert.match(name,/^named_timplan_[0-9a-f]{32}$/u);await db.unsafe('drop database '+ident(name));created=false;}
  info.cleanup='complete';info.cleanedAt=new Date().toISOString();save();
  rmSync(dump,{force:true});await db.end();return{...info,journal};
 };
 try{
  const env={...process.env,PGHOST:endpoint.hostname,PGPORT:endpoint.port,PGUSER:decodeURIComponent(endpoint.username),PGPASSWORD:decodeURIComponent(endpoint.password),PGDATABASE:decodeURIComponent(endpoint.pathname.slice(1))};
  // Credentials are environment-only. Child diagnostics remain private.
  const logfd=openSync(log,'wx',0o600),dumpfd=openSync(dump,'wx',0o600);closeSync(dumpfd);
  try{await db.begin('isolation level repeatable read read only',async tx=>{
   const [s]=await tx`select pg_export_snapshot() snapshot,current_user owner,current_database() database,(pg_control_system()).system_identifier::text system_identifier,current_setting('server_version_num') server_version`;
   const [encoding]=await tx`select pg_encoding_to_char(encoding) encoding,datcollate,datctype from pg_database where datname=current_database()`;
   info.source={...s,...encoding};info.extensions=await tx`select e.extname,n.nspname schema from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname in ('btree_gist','pgcrypto','uuid-ossp') order by e.extname`;const structure=await schemaFingerprint(tx,true);writeFileSync(dir+'/source-structure.json',JSON.stringify(structure),{mode:0o600});info.sourceFingerprint=createHash('sha256').update(JSON.stringify(structure)).digest('hex');info.stage='dumping';save();
   execFileSync(binaries+'pg_dump',['--schema-only','--no-publications','--no-subscriptions',...info.schemas.map(n=>'--schema='+n),'--format=custom','--snapshot='+s.snapshot,'--file='+dump],{env,stdio:['ignore',logfd,logfd],timeout:120000});
  });
  assert.equal(statSync(dump).mode&0o777,0o600);info.dumpSha256=createHash('sha256').update(readFileSync(dump)).digest('hex');
  info.stage='creating';save();
  await db.unsafe('create database '+ident(name)+' template template0 encoding '+literal(info.source.encoding)+' lc_collate '+literal(info.source.datcollate)+' lc_ctype '+literal(info.source.datctype));created=true;info.databaseCreated=true;save();
  const cloneUrl=new URL(endpoint);cloneUrl.pathname='/'+name;clone=postgres(cloneUrl.toString(),{max:1,prepare:false,onnotice:()=>{}});
  assert.equal((await clone`select current_database() name`)[0].name,name);
  assert.equal((await clone`select count(*)::integer n from pg_tables where schemaname='public'`)[0].n,0);
  await clone`drop schema public`;
  const entries=execFileSync(binaries+'pg_restore',['--list',dump],{encoding:'utf8',stdio:['ignore','pipe',logfd]}).split('\n');
  info.excludedForeignRoleDefaults=entries.filter(line=>line.includes(' DEFAULT ACL ')&&!line.trimEnd().endsWith(' '+info.source.owner));
  const toc=dir+'/restore.list';writeFileSync(toc,entries.filter(line=>!info.excludedForeignRoleDefaults.includes(line)).join('\n'),{mode:0o600});save();
  const restore=section=>execFileSync(binaries+'pg_restore',['--no-owner','--exit-on-error','--single-transaction','--section='+section,'--use-list='+toc,'--dbname='+name,dump],{env:{...env,PGDATABASE:name},stdio:['ignore',logfd,logfd],timeout:120000});
  restore('pre-data');
  for(const extension of info.extensions){assert.ok(['btree_gist','pgcrypto','uuid-ossp'].includes(extension.extname));await clone.unsafe('create extension if not exists '+ident(extension.extname)+' with schema '+ident(extension.schema));}
  restore('post-data');
  }finally{closeSync(logfd);}
  const [actual]=await clone`select current_database() database,(pg_control_system()).system_identifier::text system_identifier`;
  assert.equal(actual.database,name);assert.equal(actual.system_identifier,info.source.system_identifier);
  info.restoredPublicHashes=await allPublicHashes(clone);const restored=await schemaFingerprint(clone,true);writeFileSync(dir+'/restored-structure.json',JSON.stringify(restored),{mode:0o600});info.restoredFingerprint=createHash('sha256').update(JSON.stringify(restored)).digest('hex');
  assert.ok(Object.values(info.restoredPublicHashes).every(r=>r.count===0),'No source table rows may be copied');
  info.restoredAuthRowCount=0;for(const table of await clone`select tablename from pg_tables where schemaname='auth'`){const [count]=await clone.unsafe('select count(*)::integer n from auth.'+ident(table.tablename));info.restoredAuthRowCount+=count.n;}assert.equal(info.restoredAuthRowCount,0,'No auth/session rows may be copied');assert.equal(info.restoredFingerprint,info.sourceFingerprint);
  await clone.unsafe(readFileSync(new URL('../../supabase/migrations/20260930161000_phase5_programplan_catalog_seed.sql',import.meta.url),'utf8'));
  info.fixtureDataSource='repository public pinned catalog plus rollback-only synthetic fixtures';info.authOwnerLimitation='Schema-only auth definitions restored under local fixture database owner; future-object defaults for other DB owners omitted; no auth/OIDC or full-cluster equivalence claimed';
  info.stage='verified';info.verifiedAt=new Date().toISOString();save();
  const verified=async()=>{
   assert.ok(created&&!closing&&clone,'Owned snapshot is no longer available');
   const [identity]=await clone`select current_database() database,(pg_control_system()).system_identifier::text system_identifier`;
   assert.equal(identity.database,name);assert.equal(identity.system_identifier,info.source.system_identifier);
  };
  const connect=async()=>{
   await verified();const url=new URL(endpoint);url.pathname='/'+name;
   const connection=postgres(url.toString(),{max:1,prepare:false,onnotice:()=>{}});extraConnections.add(connection);
   try{const [identity]=await connection`select current_database() database,(pg_control_system()).system_identifier::text system_identifier`;
    assert.equal(identity.database,name);assert.equal(identity.system_identifier,info.source.system_identifier);return connection;
   }catch(error){await connection.end();extraConnections.delete(connection);throw error;}
  };
  const withPrivateTarget=async callback=>{
   assert.equal(typeof callback,'function');await verified();
   const adminUrl=new URL(endpoint),workerUrl=new URL(target.worker.dbUrl);
   assert.equal(workerUrl.hostname,endpoint.hostname);assert.equal(workerUrl.port,endpoint.port);assert.equal(workerUrl.pathname,endpoint.pathname);
   assert.equal(decodeURIComponent(workerUrl.username),'skolplattform_worker');
   adminUrl.pathname='/'+name;workerUrl.pathname='/'+name;
   // Credentials are callback-local only. Never include these URLs in evidence,
   // console output, journal, Git, or a configuration for the active application.
   return callback({dbUrl:adminUrl.toString(),workerDbUrl:workerUrl.toString(),database:name,sourceProject:target.projectId,provenance:{...info,journal}});
  };
  return{db:clone,provenance:{...info,journal},connect,withPrivateTarget,cleanup:clean};
 }catch(error){info.stage='failed';info.failureCode=error.code??'snapshot_failed';save();try{await clean();}catch(e){info.cleanup='failed';info.cleanupFailure=e.code??'cleanup_failed';save();}throw new Error('Isolated snapshot failed; private journal '+journal,{cause:error});}
}
