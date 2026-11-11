import test from 'node:test';
import assert from 'node:assert/strict';
import {EXPECTED_DELTA,NEW_FUNCTIONS,REPLACED_FUNCTIONS,NEW_TABLE_COLUMNS,ADDED_COLUMNS,NEW_INDEXES,NEW_TRIGGERS,assertLasarTransition} from './lasar-install-schema.mjs';

// A synthetic catalog, never an expected catalog learned from applying the package.
// The tests deliberately change one independent security or preservation property at a time.
const oldColumn=(relname,attname,type,attnum,attnotnull=false)=>({relname,attname,type,attnum,attnotnull,attidentity:'',attgenerated:'',acl:null,default_value:null});
const relation=(relname,index=false)=>({relname,relkind:index?'i':'r',acl:'owner-all',owner:'10',relrowsecurity:!index,relforcerowsecurity:!index,options:null});
const indexDef=(name,spec)=>`CREATE ${spec.unique?'UNIQUE ':''}INDEX ${name} ON public.${spec.table} USING btree (${spec.columns.join(', ')})${spec.where?' WHERE '+spec.where:''}`;
const replacements={school_year_group_days_pkey:{table:'school_year_group_days',columns:['school_year_id','group_ref','day'],unique:true},school_year_short_weeks_pkey:{table:'school_year_short_weeks',columns:['school_year_id','group_ref'],unique:true}};
function fixture(){
 const b={functions:REPLACED_FUNCTIONS.map(signature=>({signature,definition:'old '+signature,owner:'10',acl:/^lasar_(read|command|status)\(/.test(signature)?'owner-worker-execute':'owner-execute'})),tables:[],columns:[],constraints:[],indexes:[],triggers:[],policies:[]};
 b.functions.push({signature:'tjanst_school_weeks(uuid,integer)',definition:'retained dependent reader',owner:'10',acl:'original'});
 const cols={school_year_group_days:[['school_year_id','uuid',true],['group_key','text',true],['day','date',true],['cause','group_off_cause',true],['note','text',false]],school_year_short_weeks:[['school_year_id','uuid',true],['group_key','text',true],['column_id','text',true],['weekday','smallint',true],['reason','text',true]],school_years:[['id','uuid',true],['organizer_id','uuid',true],['unit_id','uuid',true],['start_year','integer',true]],lasar_commands:[['unit_id','uuid',true],['school_year_id','uuid',true]]};
 for(const[table,entries]of Object.entries(cols)){b.tables.push(relation(table));for(const[i,[name,type,notNull]]of entries.entries())b.columns.push(oldColumn(table,name,type,i+1,notNull));}
 const oldIndices={school_year_group_days_pkey:{table:'school_year_group_days',columns:['school_year_id','group_key','day'],unique:true},school_year_short_weeks_pkey:{table:'school_year_short_weeks',columns:['school_year_id','group_key'],unique:true},school_year_group_days_year_idx:{table:'school_year_group_days',columns:['school_year_id','group_key'],unique:false}};
 for(const[name,spec]of Object.entries(oldIndices)){b.tables.push(relation(name,true));b.indexes.push({tablename:spec.table,indexname:name,indexdef:indexDef(name,spec)});for(const[i,column]of spec.columns.entries())b.columns.push(oldColumn(name,column,b.columns.find(c=>c.relname===spec.table&&c.attname===column).type,i+1));if(name.endsWith('_pkey'))b.constraints.push({relname:spec.table,conname:name,definition:`PRIMARY KEY (${spec.columns.join(', ')})`,convalidated:true});}
 const a=structuredClone(b);
 for(const f of a.functions)if(REPLACED_FUNCTIONS.includes(f.signature))f.definition='new '+f.signature;
 a.functions.push(...NEW_FUNCTIONS.map(signature=>({signature,definition:'new '+signature,owner:'10',acl:['lasar_overview(jsonb)','lasar_summary(jsonb)'].includes(signature)?'owner-worker-execute':'owner-execute'})));
 a.tables=a.tables.filter(t=>!EXPECTED_DELTA.tables.removed.includes(t.relname));
 a.tables.push(...Object.keys(NEW_TABLE_COLUMNS).map(t=>relation(t)),...Object.keys(NEW_INDEXES).map(t=>relation(t,true)));
 a.columns=a.columns.filter(c=>!EXPECTED_DELTA.columns.removed.includes(c.relname+'.'+c.attname));
 for(const c of a.columns)if(EXPECTED_DELTA.columns.changed.includes(c.relname+'.'+c.attname))c.attnotnull=false;
 for(const[table,specs]of Object.entries({...NEW_TABLE_COLUMNS,...ADDED_COLUMNS})){
  const offset=b.columns.filter(c=>c.relname===table).length;
  for(const[i,spec]of specs.entries())a.columns.push({...oldColumn(table,spec.name,spec.type,offset+i+1,spec.notNull),attgenerated:spec.generated,default_value:spec.generated?'CASE scope WHEN arskurs THEN offering_id column_id WHEN klass THEN class_id END':spec.defaultValue});
 }
 for(const[name,spec]of Object.entries({...NEW_INDEXES,...replacements}))for(const[i,column]of spec.columns.map(c=>c.replace(/ DESC$/,'' )).entries())if(!a.columns.some(c=>c.relname===name&&c.attname===column))a.columns.push(oldColumn(name,column,(a.columns.find(c=>c.relname===spec.table&&c.attname===column)??(()=>{throw Error('missing column '+spec.table+'.'+column);})()).type,i+1));
 a.indexes=a.indexes.filter(i=>i.indexname!=='school_year_group_days_year_idx');
 for(const i of a.indexes)i.indexdef=indexDef(i.indexname,replacements[i.indexname]);
 a.indexes.push(...Object.entries(NEW_INDEXES).map(([name,spec])=>({tablename:spec.table,indexname:name,indexdef:indexDef(name,spec)})));
 for(const c of a.constraints)c.definition=`PRIMARY KEY (${replacements[c.conname].columns.join(', ')})`;
 for(const key of EXPECTED_DELTA.constraints.added){const split=key.indexOf(': ');if(split>=0)a.constraints.push({relname:key.slice(0,split),conname:'generated_fk_name',definition:key.slice(split+2),convalidated:true});else{const[table,name]=key.split('.'),spec=NEW_INDEXES[name];a.constraints.push({relname:table,conname:name,definition:spec?`${name.endsWith('_pkey')?'PRIMARY KEY':'UNIQUE'} (${spec.columns.join(', ')})`:'CHECK (true)',convalidated:true});}}
 a.triggers=NEW_TRIGGERS.map(t=>({relname:t.table,tgname:t.name,definition:`CREATE TRIGGER ${t.name} BEFORE ${t.events} ON public.${t.table} FOR EACH ${t.statement?'STATEMENT':'ROW'} EXECUTE FUNCTION ${t.fn}()`,tgenabled:'O'}));
 return{before:b,after:a};
}
test('static inventory accepts its explicitly scoped synthetic transition',()=>{const{before,after}=fixture();assert.doesNotThrow(()=>assertLasarTransition(before,after));});
test('an unrelated dependent reader replacement is refused',()=>{const{before,after}=fixture();after.functions.find(f=>f.signature.startsWith('tjanst_school_weeks')).definition='changed';assert.throws(()=>assertLasarTransition(before,after),/unexpected_functions_delta/);});
test('adding a third Worker entrypoint is refused even for an allowed new function',()=>{const{before,after}=fixture();after.functions.find(f=>f.signature==='lasar_review_guard()').acl='owner-worker-execute';assert.throws(()=>assertLasarTransition(before,after),/new_function_rights/);});
test('changing original function owner or ACL is refused',()=>{for(const prop of ['owner','acl']){const{before,after}=fixture();after.functions.find(f=>f.signature==='lasar_command(jsonb)')[prop]='other';assert.throws(()=>assertLasarTransition(before,after),/old_function_rights_changed/);}});
test('new table security and column grants stay closed',()=>{for(const prop of ['acl','relforcerowsecurity','relrowsecurity']){const{before,after}=fixture();after.tables.find(t=>t.relname==='school_year_frames')[prop]=prop==='acl'?'owner-and-worker':false;assert.throws(()=>assertLasarTransition(before,after));}});
test('the four nullable changes do not allow a new default or type change',()=>{for(const prop of ['type','default_value']){const{before,after}=fixture();after.columns.find(c=>c.relname==='lasar_commands'&&c.attname==='unit_id')[prop]='changed';assert.throws(()=>assertLasarTransition(before,after),/unexpected_old_column_change/);}});
test('new nullable reference must have no default or identity',()=>{for(const prop of ['default_value','attidentity']){const{before,after}=fixture();after.columns.find(c=>c.relname==='school_years'&&c.attname==='frame_id')[prop]='changed';assert.throws(()=>assertLasarTransition(before,after));}});
test('primary keys cannot silently stay on historical group_key',()=>{const{before,after}=fixture();after.indexes.find(i=>i.indexname==='school_year_group_days_pkey').indexdef=after.indexes.find(i=>i.indexname==='school_year_group_days_pkey').indexdef.replace('group_ref','group_key');assert.throws(()=>assertLasarTransition(before,after),/unexpected_indexes_delta|new_or_replaced_index_definition/);});
test('new trigger cannot switch events or be disabled',()=>{for(const prop of ['definition','tgenabled']){const{before,after}=fixture();after.triggers[0][prop]='changed';assert.throws(()=>assertLasarTransition(before,after));}});
test('unvalidated or additional constraints and RLS policies are refused',()=>{for(const change of [a=>{a.constraints.at(-1).convalidated=false;},a=>{a.constraints.push({relname:'school_years',conname:'surprise',definition:'CHECK (true)',convalidated:true});},a=>{a.policies.push({tablename:'school_year_frames',policyname:'surprise'});}]){const{before,after}=fixture();change(after);assert.throws(()=>assertLasarTransition(before,after));}});
test('already applied schema cannot be replayed as another transition',()=>{const{after}=fixture();assert.throws(()=>assertLasarTransition(after,after),/unexpected_functions_delta/);});
