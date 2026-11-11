// 05.1.1-16. Static catalog inventory reviewed from the seven immutable calendar migrations.
// No expected inventory is learned from an installation result. Source bytes are bound by apply-lasar.
import assert from 'node:assert/strict';
export const NEW_FUNCTIONS = Object.freeze([
  "lasar_change_request_guard()",
  "lasar_change_request_json(uuid,integer)",
  "lasar_class_in_year(school_classes,offering_kind,integer)",
  "lasar_clear_group_days(school_years,jsonb)",
  "lasar_clear_short_week(school_years,jsonb)",
  "lasar_column_label(text)",
  "lasar_copy_check(jsonb,jsonb,boolean)",
  "lasar_copy_comment(integer,boolean)",
  "lasar_copy_easter(date)",
  "lasar_copy_shift(date,integer)",
  "lasar_create_copy(access_assignments,uuid,integer,jsonb)",
  "lasar_create_from_frame(access_assignments,uuid,integer,school_year_frames)",
  "lasar_editable_from(school_years)",
  "lasar_find_group(school_years,jsonb)",
  "lasar_frame_calendar_json(school_year_frames)",
  "lasar_frame_command(access_assignments,app_sessions,jsonb,jsonb,text,text,uuid,integer,uuid,integer,text)",
  "lasar_frame_content_hash(uuid)",
  "lasar_frame_create_copy(access_assignments,integer,jsonb)",
  "lasar_frame_create_proposal(access_assignments,integer,jsonb)",
  "lasar_frame_day_editable(school_year_frames,date)",
  "lasar_frame_days_from(school_year_frames,jsonb)",
  "lasar_frame_days_guard()",
  "lasar_frame_detail(access_assignments,integer,uuid)",
  "lasar_frame_event(uuid,text,text)",
  "lasar_frame_events_guard()",
  "lasar_frame_exceptions_json(uuid)",
  "lasar_frame_guard()",
  "lasar_frame_history(school_year_frames)",
  "lasar_frame_latest(uuid,integer)",
  "lasar_frame_lock(access_assignments,integer,uuid)",
  "lasar_frame_new_version(access_assignments,school_year_frames)",
  "lasar_frame_ref(uuid)",
  "lasar_frame_reset(school_year_frames,jsonb)",
  "lasar_frame_set_days(school_year_frames,jsonb)",
  "lasar_frame_set_notes(school_year_frames,jsonb)",
  "lasar_frame_set_term(school_year_frames,jsonb)",
  "lasar_frame_terms_from(jsonb)",
  "lasar_frame_terms_json(school_year_frames)",
  "lasar_group_days_json(uuid)",
  "lasar_group_effective(jsonb)",
  "lasar_group_migration_active()",
  "lasar_group_ref_guard()",
  "lasar_group_rule_check(jsonb,jsonb,jsonb,jsonb,jsonb)",
  "lasar_groups(uuid,integer)",
  "lasar_mode(uuid,integer)",
  "lasar_mode_affected(uuid,integer)",
  "lasar_mode_locked(integer)",
  "lasar_offering_at(offerings,uuid)",
  "lasar_offering_columns(offerings,integer)",
  "lasar_op_dates(jsonb)",
  "lasar_organizer_types(uuid)",
  "lasar_overview(jsonb)",
  "lasar_past_check(school_years,jsonb)",
  "lasar_past_state_ok(text,uuid,jsonb,boolean)",
  "lasar_reopen(school_years,text)",
  "lasar_resolve_review(access_assignments,uuid,uuid,jsonb)",
  "lasar_review_count_text(uuid,uuid)",
  "lasar_review_guard()",
  "lasar_review_insert(uuid,uuid,jsonb)",
  "lasar_review_json(uuid,uuid)",
  "lasar_review_require(uuid,uuid)",
  "lasar_school_frame_guard()",
  "lasar_set_group_days(school_years,jsonb)",
  "lasar_set_short_week(school_years,jsonb)",
  "lasar_short_weeks_json(uuid)",
  "lasar_summary(jsonb)",
  "lasar_summary_stat(uuid)",
  "lasar_take_frame_changes(school_years,jsonb)",
  "lasar_teaching(uuid,integer)",
  "lasar_timplan_hours(timplans,offerings)"
]);
export const REPLACED_FUNCTIONS = Object.freeze([
  "guard_decided_school_year()",
  "guard_school_year_days()",
  "lasar_audit(text,text,uuid,jsonb)",
  "lasar_calendar_json(school_years)",
  "lasar_command(jsonb)",
  "lasar_content_hash(uuid)",
  "lasar_detail(access_assignments,uuid,integer,uuid)",
  "lasar_history(school_years)",
  "lasar_history_add(uuid,text,text)",
  "lasar_read(jsonb)",
  "lasar_rules(uuid)",
  "lasar_status(jsonb)",
  "lasar_target(jsonb)"
]);

const col=(name,type,notNull=false,defaultValue=null,generated='')=>({name,type,notNull,defaultValue,generated});
export const NEW_TABLE_COLUMNS=Object.freeze({
 school_year_change_requests:[col('id','uuid',true,'gen_random_uuid()'),col('school_year_id','uuid',true),col('unit_id','uuid',true),col('start_year','integer',true),col('status','text',true,"'open'::text"),col('reason','text',true),col('answer','text'),col('requested_by_assignment','uuid',true),col('answered_by_assignment','uuid'),col('requested_at','timestamp with time zone',true,'clock_timestamp()'),col('answered_at','timestamp with time zone'),col('opened_version_id','uuid')],
 school_year_frame_settings:[col('organizer_id','uuid',true),col('start_year','integer',true),col('mode','text',true),col('revision','integer',true,'1'),col('updated_at','timestamp with time zone',true,'clock_timestamp()'),col('updated_by_assignment','uuid',true)],
 school_year_frames:[col('id','uuid',true,'gen_random_uuid()'),col('organizer_id','uuid',true),col('start_year','integer',true),col('version','integer',true),col('status','text',true,"'utkast'::text"),col('revision','integer',true,'1'),col('ht_start','date',true),col('ht_end','date',true),col('vt_start','date',true),col('vt_end','date',true),col('previous_id','uuid'),col('published_at','timestamp with time zone'),col('published_on','date'),col('published_by_assignment','uuid'),col('message','text'),col('content_hash','text'),col('created_at','timestamp with time zone',true,'clock_timestamp()'),col('created_by_assignment','uuid',true)],
 school_year_frame_days:[col('frame_id','uuid',true),col('day','date',true),col('kind','school_day_kind',true),col('note','text')],
 school_year_frame_events:[col('id','uuid',true,'gen_random_uuid()'),col('frame_id','uuid',true),col('action','text',true),col('comment','text',true),col('actor_identity_id','uuid',true),col('session_id','uuid',true),col('membership_id','uuid',true),col('assignment_id','uuid',true),col('created_at','timestamp with time zone',true,'clock_timestamp()')],
 school_year_review_items:[col('id','uuid',true,'gen_random_uuid()'),col('school_year_id','uuid'),col('frame_id','uuid'),col('item_id','text',true),col('ordinal','integer',true),col('source_date','date'),col('kind','text',true),col('reason','text',true),col('note','text'),col('suggested_date','date'),col('target_date','date'),col('group_ref','text'),col('edge','text'),col('short_week','jsonb'),col('resolution','text'),col('resolved_by_assignment','uuid'),col('resolved_at','timestamp with time zone'),col('created_at','timestamp with time zone',true,'clock_timestamp()')],
});
export const ADDED_COLUMNS=Object.freeze({
 school_year_group_days:[col('scope','text',true),col('offering_id','uuid'),col('column_id','text'),col('class_id','uuid'),col('group_ref','text',true,null,'s')],
 school_year_short_weeks:[col('scope','text',true),col('offering_id','uuid'),col('class_id','uuid'),col('group_ref','text',true,null,'s')],
 school_years:[col('frame_id','uuid'),col('frame_ack_id','uuid')],lasar_commands:[col('frame_id','uuid')],
});
const index=(table,columns,unique=false,where=null)=>({table,columns,unique,where});
export const NEW_INDEXES=Object.freeze({
 school_year_group_days_arskurs:index('school_year_group_days',['school_year_id','offering_id','column_id','day'],true,"(scope = 'arskurs'::text)"),
 school_year_group_days_klass:index('school_year_group_days',['school_year_id','class_id','day'],true,"(scope = 'klass'::text)"),
 school_year_group_days_offering_idx:index('school_year_group_days',['offering_id'],false,'(offering_id IS NOT NULL)'),school_year_group_days_class_idx:index('school_year_group_days',['class_id'],false,'(class_id IS NOT NULL)'),
 school_year_short_weeks_arskurs:index('school_year_short_weeks',['school_year_id','offering_id','column_id'],true,"(scope = 'arskurs'::text)"),school_year_short_weeks_klass:index('school_year_short_weeks',['school_year_id','class_id'],true,"(scope = 'klass'::text)"),
 school_year_short_weeks_offering_idx:index('school_year_short_weeks',['offering_id'],false,'(offering_id IS NOT NULL)'),school_year_short_weeks_class_idx:index('school_year_short_weeks',['class_id'],false,'(class_id IS NOT NULL)'),
 school_year_change_requests_pkey:index('school_year_change_requests',['id'],true),school_year_change_requests_one_open:index('school_year_change_requests',['unit_id','start_year'],true,"(status = 'open'::text)"),school_year_change_requests_year_idx:index('school_year_change_requests',['unit_id','start_year','requested_at DESC']),
 school_year_frame_settings_pkey:index('school_year_frame_settings',['organizer_id','start_year'],true),
 school_year_frames_pkey:index('school_year_frames',['id'],true),school_year_frames_version_key:index('school_year_frames',['organizer_id','start_year','version'],true),school_year_frames_scope_key:index('school_year_frames',['id','organizer_id','start_year'],true),school_year_frames_one_open:index('school_year_frames',['organizer_id','start_year'],true,"(status = 'utkast'::text)"),
 school_year_frame_days_pkey:index('school_year_frame_days',['frame_id','day'],true),school_year_frame_events_pkey:index('school_year_frame_events',['id'],true),school_year_frame_events_frame_idx:index('school_year_frame_events',['frame_id','created_at DESC']),
 school_year_review_items_pkey:index('school_year_review_items',['id'],true),school_year_review_items_year_key:index('school_year_review_items',['school_year_id','item_id'],true),school_year_review_items_frame_key:index('school_year_review_items',['frame_id','item_id'],true),
 school_years_id_unit_year_key:index('school_years',['id','unit_id','start_year'],true),school_years_frame_idx:index('school_years',['frame_id'],false,'(frame_id IS NOT NULL)'),school_years_frame_ack_idx:index('school_years',['frame_ack_id'],false,'(frame_ack_id IS NOT NULL)'),
});
const REPLACED_INDEXES={school_year_group_days_pkey:index('school_year_group_days',['school_year_id','group_ref','day'],true),school_year_short_weeks_pkey:index('school_year_short_weeks',['school_year_id','group_ref'],true)};
const NEW_TABLES=Object.keys(NEW_TABLE_COLUMNS),REMOVED_INDEX='school_year_group_days_year_idx';
const keys=(table,names)=>names.map(name=>`${table}.${name}`);
const FK=(table,columns,target,targetColumns=['id'])=>`${table}: FOREIGN KEY (${columns.join(', ')}) REFERENCES ${target}(${targetColumns.join(', ')})`;
const NEW_CHECK_KEYS=[
 ...keys('school_year_group_days',['school_year_group_days_scope','school_year_group_days_ref','school_year_group_days_column']),...keys('school_year_short_weeks',['school_year_short_weeks_scope','school_year_short_weeks_ref']),
 ...keys('school_years',['school_years_id_unit_year_key','school_years_frame_pair']),...keys('lasar_commands',['lasar_commands_target']),
 ...keys('school_year_change_requests',['school_year_change_requests_pkey','school_year_change_requests_start_year_check','school_year_change_requests_status_check','school_year_change_requests_reason_check','school_year_change_requests_answer_check','school_year_change_requests_answered','school_year_change_requests_declined','school_year_change_requests_opened']),
 ...keys('school_year_frame_settings',['school_year_frame_settings_pkey','school_year_frame_settings_start_year_check','school_year_frame_settings_mode_check','school_year_frame_settings_revision_check']),
 ...keys('school_year_frames',['school_year_frames_pkey','school_year_frames_version_key','school_year_frames_scope_key','school_year_frames_start_year_check','school_year_frames_version_check','school_year_frames_status_check','school_year_frames_revision_check','school_year_frames_message_check','school_year_frames_content_hash_check','school_year_frames_terms','school_year_frames_published','school_year_frames_not_self']),
 ...keys('school_year_frame_days',['school_year_frame_days_pkey','school_year_frame_days_note_check']),...keys('school_year_frame_events',['school_year_frame_events_pkey','school_year_frame_events_action_check','school_year_frame_events_comment_check']),
 ...keys('school_year_review_items',['school_year_review_items_pkey','school_year_review_items_year_key','school_year_review_items_frame_key','school_year_review_items_item_id_check','school_year_review_items_ordinal_check','school_year_review_items_kind_check','school_year_review_items_reason_check','school_year_review_items_note_check','school_year_review_items_group_ref_check','school_year_review_items_edge_check','school_year_review_items_short_week_check','school_year_review_items_resolution_check','school_year_review_items_target','school_year_review_items_resolved']),
];
const NEW_FK_KEYS=[
 ...['school_year_group_days','school_year_short_weeks'].flatMap(table=>[FK(table,['offering_id'],'offerings'),FK(table,['class_id'],'school_classes')]),
 FK('school_year_change_requests',['unit_id'],'school_units'),FK('school_year_change_requests',['requested_by_assignment'],'access_assignments'),FK('school_year_change_requests',['answered_by_assignment'],'access_assignments'),FK('school_year_change_requests',['opened_version_id'],'school_years'),FK('school_year_change_requests',['school_year_id','unit_id','start_year'],'school_years',['id','unit_id','start_year']),
 FK('school_year_frame_settings',['organizer_id'],'organizers'),FK('school_year_frame_settings',['updated_by_assignment'],'access_assignments'),FK('school_year_frames',['organizer_id'],'organizers'),FK('school_year_frames',['previous_id'],'school_year_frames'),FK('school_year_frames',['published_by_assignment'],'access_assignments'),FK('school_year_frames',['created_by_assignment'],'access_assignments'),
 FK('school_year_frame_days',['frame_id'],'school_year_frames'),FK('school_year_frame_events',['frame_id'],'school_year_frames'),FK('school_year_frame_events',['actor_identity_id'],'identities'),FK('school_year_frame_events',['session_id'],'app_sessions'),FK('school_year_frame_events',['membership_id'],'memberships'),FK('school_year_frame_events',['assignment_id'],'access_assignments'),
 FK('school_years',['frame_id','organizer_id','start_year'],'school_year_frames',['id','organizer_id','start_year']),FK('school_years',['frame_ack_id','organizer_id','start_year'],'school_year_frames',['id','organizer_id','start_year']),FK('lasar_commands',['frame_id'],'school_year_frames'),FK('school_year_review_items',['school_year_id'],'school_years'),FK('school_year_review_items',['frame_id'],'school_year_frames'),FK('school_year_review_items',['resolved_by_assignment'],'access_assignments'),
];
const trigger=(table,name,events,fn,statement=false)=>({table,name,events,fn,statement});
export const NEW_TRIGGERS=Object.freeze([
 trigger('school_year_group_days','school_year_group_days_refs','INSERT OR UPDATE','lasar_group_ref_guard'),trigger('school_year_short_weeks','school_year_short_weeks_refs','INSERT OR UPDATE','lasar_group_ref_guard'),
 trigger('school_year_change_requests','school_year_change_requests_guard','DELETE OR UPDATE','lasar_change_request_guard'),trigger('school_year_change_requests','school_year_change_requests_no_truncate','TRUNCATE','lasar_change_request_guard',true),
 trigger('school_year_frames','school_year_frames_guard','DELETE OR UPDATE','lasar_frame_guard'),trigger('school_year_frames','school_year_frames_no_truncate','TRUNCATE','lasar_frame_guard',true),
 trigger('school_year_frame_days','school_year_frame_days_guard','INSERT OR DELETE OR UPDATE','lasar_frame_days_guard'),trigger('school_year_frame_days','school_year_frame_days_no_truncate','TRUNCATE','lasar_frame_days_guard',true),
 trigger('school_year_frame_events','school_year_frame_events_guard','DELETE OR UPDATE','lasar_frame_events_guard'),trigger('school_year_frame_events','school_year_frame_events_no_truncate','TRUNCATE','lasar_frame_events_guard',true),
 trigger('school_years','school_years_frame_guard','INSERT OR UPDATE OF frame_id, frame_ack_id','lasar_school_frame_guard'),trigger('school_year_review_items','school_year_review_items_guard','DELETE OR UPDATE','lasar_review_guard'),trigger('school_year_review_items','school_year_review_items_no_truncate','TRUNCATE','lasar_review_guard',true),
]);
export const signature=s=>s.replaceAll('public.','').replaceAll(', ',',');
const indexColumns=spec=>spec.columns.map(name=>name.replace(/ DESC$/u,''));
const addedIndexColumns=Object.entries(NEW_INDEXES).flatMap(([name,spec])=>keys(name,indexColumns(spec)));
export const EXPECTED_DELTA=Object.freeze({
 functions:{added:NEW_FUNCTIONS,removed:[],changed:REPLACED_FUNCTIONS},
 tables:{added:[...NEW_TABLES,...Object.keys(NEW_INDEXES)],removed:[REMOVED_INDEX],changed:[]},
 columns:{added:[...Object.entries(NEW_TABLE_COLUMNS).flatMap(([table,cols])=>keys(table,cols.map(c=>c.name))),...Object.entries(ADDED_COLUMNS).flatMap(([table,cols])=>keys(table,cols.map(c=>c.name))),...addedIndexColumns,'school_year_group_days_pkey.group_ref','school_year_short_weeks_pkey.group_ref'],removed:[...keys(REMOVED_INDEX,['school_year_id','group_key']),'school_year_group_days_pkey.group_key','school_year_short_weeks_pkey.group_key'],changed:['school_year_group_days.group_key','school_year_short_weeks.group_key','lasar_commands.unit_id','lasar_commands.school_year_id']},
 constraints:{added:[...NEW_CHECK_KEYS,...NEW_FK_KEYS],removed:[],changed:['school_year_group_days.school_year_group_days_pkey','school_year_short_weeks.school_year_short_weeks_pkey']},
 indexes:{added:Object.entries(NEW_INDEXES).map(([name,spec])=>`${spec.table}.${name}`),removed:[`school_year_group_days.${REMOVED_INDEX}`],changed:Object.entries(REPLACED_INDEXES).map(([name,spec])=>`${spec.table}.${name}`)},
 triggers:{added:NEW_TRIGGERS.map(t=>`${t.table}.${t.name}`),removed:[],changed:[]},policies:{added:[],removed:[],changed:[]},
});
const constraintKey=c=>/^FOREIGN KEY /u.test(c.definition)?`${c.relname}: ${c.definition.replaceAll('public.','')}`:`${c.relname}.${c.conname}`;
const KEYS={functions:f=>signature(f.signature),tables:t=>t.relname,columns:c=>`${c.relname}.${c.attname}`,constraints:constraintKey,indexes:i=>`${i.tablename}.${i.indexname}`,triggers:t=>`${t.relname}.${t.tgname}`,policies:p=>`${p.tablename}.${p.policyname}`};
const sorted=items=>[...items].sort();
const normalized=s=>({...s,constraints:s.constraints.filter(c=>!/^NOT NULL /u.test(c.definition))});
const uniqueMap=(items,key)=>{const map=new Map(items.map(item=>[key(item),item]));assert.equal(map.size,items.length,'duplicate_catalog_key');return map;};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function delta(before,after,key){const old=uniqueMap(before,key),next=uniqueMap(after,key);return{added:sorted([...next.keys()].filter(k=>!old.has(k))),removed:sorted([...old.keys()].filter(k=>!next.has(k))),changed:sorted([...old.keys()].filter(k=>next.has(k)&&!same(old.get(k),next.get(k))))};}
const sortedDelta=d=>Object.fromEntries(Object.entries(d).map(([key,value])=>[key,sorted(value)]));
const compact=s=>s.replace(/\s+/gu,' ').trim();
const indexDefinition=(name,spec)=>`CREATE ${spec.unique?'UNIQUE ':''}INDEX ${name} ON public.${spec.table} USING btree (${spec.columns.join(', ')})${spec.where?' WHERE '+spec.where:''}`;

/** Exact inventory and original-object preservation. New CHECK/function bodies are supplied solely by
 * the registry-hash-bound reviewed SQL. No broad AST/cast/boolean normalization is used. The caller also
 * binds the complete resulting catalog fingerprint for the later, separately approved apply. */
export function assertLasarTransition(beforeValue,afterValue){
 const before=normalized(beforeValue),after=normalized(afterValue);
 for(const[part,key]of Object.entries(KEYS))assert.deepEqual(delta(before[part],after[part],key),sortedDelta(EXPECTED_DELTA[part]),'unexpected_'+part+'_delta');
 const oldFunctions=uniqueMap(before.functions,KEYS.functions),newFunctions=uniqueMap(after.functions,KEYS.functions);
 for(const[sig,prior]of oldFunctions){const current=newFunctions.get(sig);assert.ok(current);assert.deepEqual([current.owner,current.acl],[prior.owner,prior.acl],'old_function_rights_changed');}
 const entrypoint=oldFunctions.get('lasar_read(jsonb)'),helper=oldFunctions.get('lasar_audit(text,text,uuid,jsonb)');assert.ok(entrypoint&&helper,'expected_calendar_baseline');
 for(const sig of NEW_FUNCTIONS){const f=newFunctions.get(sig),acl=['lasar_overview(jsonb)','lasar_summary(jsonb)'].includes(sig)?entrypoint.acl:helper.acl;assert.equal(f.owner,entrypoint.owner,'new_function_owner');assert.equal(f.acl,acl,'new_function_rights');}
 const oldTables=uniqueMap(before.tables,KEYS.tables),newTables=uniqueMap(after.tables,KEYS.tables),indexSibling=oldTables.get('school_year_group_days_pkey');assert.ok(indexSibling,'expected_index_baseline');
 for(const table of NEW_TABLES){const t=newTables.get(table);assert.equal(t.relkind,'r');assert.equal(t.owner,indexSibling.owner);assert.equal(t.acl,indexSibling.acl);assert.equal(t.relrowsecurity,true);assert.equal(t.relforcerowsecurity,true);assert.equal(t.options,null);}
 for(const name of Object.keys(NEW_INDEXES)){const t=newTables.get(name);assert.deepEqual({...t,relname:indexSibling.relname},indexSibling,'new_index_metadata');}
 const oldColumns=uniqueMap(before.columns,KEYS.columns),newColumns=uniqueMap(after.columns,KEYS.columns);
 for(const key of EXPECTED_DELTA.columns.changed){const old=oldColumns.get(key),current=newColumns.get(key);assert.equal(old.attnotnull,true);assert.deepEqual(current,{...old,attnotnull:false},'unexpected_old_column_change');}
 for(const[table,cols]of Object.entries({...NEW_TABLE_COLUMNS,...ADDED_COLUMNS}))for(const[c,spec]of cols.entries()){
  const actual=newColumns.get(`${table}.${spec.name}`),offset=NEW_TABLES.includes(table)?0:before.columns.filter(x=>x.relname===table).length;
  assert.equal(actual.attnum,offset+c+1,'new_column_order');assert.equal(actual.type.replaceAll('public.',''),spec.type,'new_column_type');assert.equal(actual.attnotnull,spec.notNull,'new_column_nullability');assert.equal(actual.attidentity,'');assert.equal(actual.attgenerated,spec.generated);assert.equal(actual.acl,null);
  if(spec.generated){assert.ok(typeof actual.default_value==='string'&&actual.default_value.includes('scope')&&actual.default_value.includes('offering_id')&&actual.default_value.includes('class_id')&&actual.default_value.includes('column_id')&&!actual.default_value.includes('group_key'),'generated_group_ref_definition');}
  else assert.equal(actual.default_value,spec.defaultValue,'new_column_default');
 }
 for(const[name,spec]of Object.entries({...NEW_INDEXES,...REPLACED_INDEXES})){
  const def=after.indexes.find(i=>i.indexname===name);assert.equal(compact(def.indexdef),indexDefinition(name,spec),'new_or_replaced_index_definition');
  for(const[i,column]of indexColumns(spec).entries()){
   const actual=newColumns.get(`${name}.${column}`),source=newColumns.get(`${spec.table}.${column}`);assert.ok(actual&&source);assert.equal(actual.attnum,i+1);assert.equal(actual.type,source.type);assert.equal(actual.attidentity,'');assert.equal(actual.attgenerated,'');assert.equal(actual.default_value,null);assert.equal(actual.acl,null);
  }
 }
 const constraints=uniqueMap(after.constraints,KEYS.constraints);
 for(const key of EXPECTED_DELTA.constraints.added)assert.equal(constraints.get(key).convalidated,true,'new_constraint_not_validated');
 for(const[name,spec]of Object.entries(NEW_INDEXES).filter(([name])=>name.endsWith('_pkey')||name.endsWith('_key'))){const c=constraints.get(`${spec.table}.${name}`);assert.ok(c,'new_key_constraint_missing');assert.equal(c.definition,`${name.endsWith('_pkey')?'PRIMARY KEY':'UNIQUE'} (${spec.columns.join(', ')})`,'new_key_constraint_definition');}
 for(const[table,definition]of [['school_year_group_days','PRIMARY KEY (school_year_id, group_ref, day)'],['school_year_short_weeks','PRIMARY KEY (school_year_id, group_ref)']]){const c=constraints.get(`${table}.${table}_pkey`);assert.equal(c.definition,definition);assert.equal(c.convalidated,true);}
 for(const spec of NEW_TRIGGERS){const t=after.triggers.find(t=>t.relname===spec.table&&t.tgname===spec.name);assert.equal(t.tgenabled,'O');assert.equal(compact(t.definition),`CREATE TRIGGER ${spec.name} BEFORE ${spec.events} ON public.${spec.table} FOR EACH ${spec.statement?'STATEMENT':'ROW'} EXECUTE FUNCTION ${spec.fn}()`,'new_trigger_definition');}
 return Object.fromEntries(Object.entries(EXPECTED_DELTA).map(([part,d])=>[part,Object.fromEntries(Object.entries(d).map(([kind,list])=>[kind,list.length]))]));
}

/** Effective grants as well as raw ACL preservation: new helpers/tables stay closed. */
export async function assertLasarPrivileges(tx,beforeStructure){
 assert.ok(beforeStructure?.functions?.some(f=>signature(f.signature)==='lasar_read(jsonb)'),'calendar_baseline_required');
 const entrypoints=['lasar_read(jsonb)','lasar_command(jsonb)','lasar_status(jsonb)','lasar_overview(jsonb)','lasar_summary(jsonb)'];
 for(const sig of [...NEW_FUNCTIONS,'lasar_read(jsonb)','lasar_command(jsonb)','lasar_status(jsonb)']){
  for(const role of ['anon','authenticated','service_role','skolplattform_worker']){
   const[{allowed}]=await tx`select has_function_privilege(${role},${'public.'+sig},'EXECUTE') allowed`;
   assert.equal(allowed,role==='skolplattform_worker'&&entrypoints.includes(sig),'unexpected_effective_function_grant');
  }
  const[{open}]=await tx`select exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=${'public.'+sig}::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') open`;assert.equal(open,false,'public_function_execute');
 }
 for(const table of NEW_TABLES){
  for(const role of ['anon','authenticated','service_role','skolplattform_worker']){
   const[{allowed,columns}]=await tx`select has_table_privilege(${role},${'public.'+table},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed,has_any_column_privilege(${role},${'public.'+table},'SELECT,INSERT,UPDATE,REFERENCES') columns`;assert.equal(allowed,false,'new_table_grant');assert.equal(columns,false,'new_column_grant');
  }
  const[{rls,forced,policies,publicGrant}]=await tx`select c.relrowsecurity rls,c.relforcerowsecurity forced,(select count(*)::integer from pg_policies p where p.schemaname='public' and p.tablename=c.relname) policies,exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0) as "publicGrant" from pg_class c where c.oid=${'public.'+table}::regclass`;
  assert.equal(rls,true);assert.equal(forced,true);assert.equal(policies,0);assert.equal(publicGrant,false);
 }
 return{newFunctions:NEW_FUNCTIONS.length,workerEntrypoints:entrypoints.length,newTables:NEW_TABLES.length};
}
