import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosAction, parseSchemaDiagnos, schemaDiagnos, schemaSearchStatistics } from './schema-diagnos.ts';
import { SCHEMA_CONTRACT_VERSION, SCHEMA_MOTOR_VERSION, parseSchemaMotorStatistics, parseSchemaEngineDiagnoses, parseSchemaSolution } from './schema-contract.ts';
const problem = { version: SCHEMA_MOTOR_VERSION, id: 'prov', time: { step_min:5,start_grid_min:5,days:[{start_min:480,end_min:960}] },
  teachers:[{id:'larare-1'}], groups:[{id:'grupp-1',clusters:['kluster-1']},{id:'grupp-2',clusters:['kluster-1']}],clusters:[{id:'kluster-1',size:2}],rooms:[{id:'sal-1'}],activities:[{id:'behov-1'}],
  lessons:[{id:'pass-1',activity:'behov-1',duration_min:60,teachers:['larare-1'],groups:['grupp-1']}],rules:{break_min:0,lunch:null,same_day:'allow'},weights:{late_after_min:null} };
const u = { problem, groupRefs:{'valgrupp-ref':'grupp-2'},labels:{teachers:[{id:'larare-1',name:'Provlärare Lin'}],classes:[{id:'grupp-1',name:'Klass A'}],rooms:[{id:'sal-1',name:'Provsal Lab'}],names:{'kluster-1':'Klass A / Spanska','grupp-2':'Spanska'},
  lessons:[{id:'pass-1',activity:'behov-1',title:'Matematik',vacant:false}],activities:[{id:'behov-1',title:'Matematik',weeklyOff:false}] },
  resurser:{larare:[{ref:'teacher-ref',name:'Provlärare Lin'}],klass:[{ref:'class-ref',name:'Klass A'}],grupp:[{ref:'valgrupp-ref',name:'Spanska'}]},omitted:[] };
const d=(code,resources=['larare-1'])=>({code,message:'Lärare larare-1 har för lite tid för pass-1.',proof:true,lessons:['pass-1'],resources});
const stats = {lessons:[{lesson:'pass-1',attempts:120,moves:8,backtracks:24,ejections:3}],bottlenecks:[{code:'resource_busy',resource:'larare-1',count:16}],iterations:200};

test('fördiagnos byter motorns löpnummer till verksamhetsnamn och lärarens riktiga villkorsrad',()=>{
  const f=schemaDiagnos(u,[d('too_little_time')]);
  assert.equal(f[0].message,'Lärare Provlärare Lin har för lite tid för Matematik.');
  assert.deepEqual(f[0].resources,[{typ:'larare',id:'teacher-ref',label:'Provlärare Lin'}]);
  assert.deepEqual(f[0].action,{target:'villkor',label:'Se över tillgänglig tid och villkor',resourceId:'teacher-ref',resource:f[0].resources[0]});
  assert.deepEqual(parseSchemaDiagnos({version:SCHEMA_CONTRACT_VERSION,findings:f}),f);
});
test('klass, undervisningsgrupp och anonymt elevkluster får skilda ID och länkmål',()=>{
  const f=schemaDiagnos(u,[d('too_little_time',['grupp-1']),d('too_little_time',['grupp-2']),d('too_little_time',['kluster-1'])]);
  assert.deepEqual(f.map(x=>[x.resources[0].typ,x.resources[0].id,x.action.target]),[['klass','class-ref','villkor'],['grupp','valgrupp-ref','villkor'],['grupp','kluster-1','grupper']]);
});
test('extra undervisningsgrupp i veckans gemensamma klasslista behåller källgruppens typ och villkorsrad',()=>{
  const x=structuredClone(u);
  x.labels.classes.push({id:'grupp-2',name:'Spanska'});
  const findings=schemaDiagnos(x,[d('too_little_time',['grupp-2'])]);
  assert.deepEqual(findings[0].resources,[{typ:'grupp',id:'valgrupp-ref',label:'Spanska'}]);
  assert.equal(findings[0].action.resource.typ,'grupp');
  assert.equal(findings[0].action.resourceId,'valgrupp-ref');
  const shown=schemaSearchStatistics(x,{...stats,bottlenecks:[{code:'resource_busy',resource:'grupp-2',count:3}]});
  assert.deepEqual(shown.bottlenecks[0].resource,findings[0].resources[0]);
});
test('saknad lärare länkar tjänstefördelning, salsbrist villkor och odelbar tid passlängd',()=>{
  assert.equal(diagnosAction('group_without_teacher',[]).target,'tjanst');
  assert.equal(diagnosAction('no_room',[]).label,'Se över salar och salskrav');
  assert.equal(diagnosAction('indivisible_time',[]).label,'Se över passlängd och antal pass');
  assert.equal(diagnosAction('no_days',[]).target,'timplan');
});
test('appens odelbara tid och ofullständiga undervisning kompletterar motorn utan att egna aktiviteter blir vakanta',()=>{
  const x=structuredClone(u);x.labels.activities[0].weeklyOff=true;x.labels.lessons[0].vacant=true;
  x.labels.lessons.push({id:'egen-1',activity:'own',title:'Läxhjälp',vacant:true,egenAktivitet:{id:'egen'}});
  x.omitted=[{title:'Ingen beställd undervisning',classes:[],reason:'no_time'},{title:'Kort ämne',classes:['Klass A'],reason:'too_short'}];
  const f=schemaDiagnos(x,[]);
  assert.deepEqual(f.map(f=>f.code),['indivisible_time','too_short','group_without_teacher']);
  assert.deepEqual(f[2].lessons,['pass-1']);
  assert.equal(f[0].proof,true);assert.equal(f[1].proof,false);
});
test('sökstatistik behåller faktiska händelser och namnger endast referenser i underlaget',()=>{
  const parsed=parseSchemaMotorStatistics(stats,problem),shown=schemaSearchStatistics(u,parsed);
  assert.deepEqual(shown.lessons,[{...stats.lessons[0],title:'Matematik'}]);
  assert.deepEqual(shown.bottlenecks,[{code:'resource_busy',count:16,resource:{typ:'larare',id:'teacher-ref',label:'Provlärare Lin'}}]);
  assert.deepEqual(schemaSearchStatistics(u),{lessons:[],bottlenecks:[],iterations:0});
});
test('motorstatistik nekar saknat nytt fält, främmande pass/resurs, dubbletter, negativa tal och fler än tjugo',()=>{
  const bad=[undefined,{...stats,lessons:[{...stats.lessons[0],lesson:'pass-9'}]},{...stats,bottlenecks:[{...stats.bottlenecks[0],resource:'främmande'}]},
    {...stats,lessons:[stats.lessons[0],stats.lessons[0]]},{...stats,lessons:[{...stats.lessons[0],moves:-1}]},{...stats,lessons:Array(21).fill(stats.lessons[0])}];
  for(const s of bad)assert.throws(()=>parseSchemaMotorStatistics(s,problem));
});
test('motordiagnosen binds till underlagets referenser och proof är obligatorisk boolesk',()=>{
  assert.equal(parseSchemaEngineDiagnoses([d('too_little_time')],problem)[0].lessons[0],'pass-1');
  assert.throws(()=>parseSchemaEngineDiagnoses([{...d('x'),lessons:['främmande']}],problem));
  assert.throws(()=>parseSchemaEngineDiagnoses([{...d('x'),resources:['främmande']}],problem));
  assert.throws(()=>parseSchemaEngineDiagnoses([{...d('x'),proof:'true'}],problem));
});
test('gammalt motorsvar och nytt svar utan sökstatistik nekas tydligt',()=>{
  const raw={version:SCHEMA_MOTOR_VERSION,problem_id:'prov',status:'complete',placements:[{lesson:'pass-1',day:0,start_min:480,rooms:[]}],unplaced:[],diagnoses:[],metrics:{student_gap_min:0,teacher_gap_min:0},stats:{elapsed_ms:1},search_statistics:stats};
  assert.equal(parseSchemaSolution(raw,problem).statistics.iterations,200);
  assert.throws(()=>parseSchemaSolution({...raw,version:2},problem));
  assert.throws(()=>parseSchemaSolution({...raw,search_statistics:undefined},problem));
});
test('diagnosens klienttolk nekar gammal version, främmande länkmål och ofullständiga fynd',()=>{
  const f=schemaDiagnos(u,[d('too_little_time')])[0];
  for(const raw of [{version:SCHEMA_CONTRACT_VERSION-1,findings:[f]},{version:SCHEMA_CONTRACT_VERSION,findings:[{...f,action:{target:'extern',label:'Se här'}}]},
    {version:SCHEMA_CONTRACT_VERSION,findings:[{...f,proof:'false'}]},{version:SCHEMA_CONTRACT_VERSION,findings:[{...f,resources:null}]}]) assert.throws(()=>parseSchemaDiagnos(raw));
});

test('501 legitima vakanta pass passerar båda kontrakten som ett handlingsbart fynd',()=>{
  const x=structuredClone(u);
  x.problem.lessons=Array.from({length:501},(_,i)=>({...problem.lessons[0],id:`pass-${i+1}`,teachers:[]}));
  x.labels.lessons=x.problem.lessons.map(l=>({id:l.id,activity:'behov-1',title:'Matematik',vacant:true}));
  const raw=[{code:'group_without_teacher',message:'501 undervisningspass saknar utsedd lärare. Tilldela lärare för grupperna i tjänstefördelningen.',proof:false,
    lessons:x.problem.lessons.map(l=>l.id),resources:['grupp-1']}];
  const findings=schemaDiagnos(x,parseSchemaEngineDiagnoses(raw,x.problem));
  assert.equal(findings.length,1);assert.equal(findings[0].lessons.length,501);
  assert.equal(findings[0].action.target,'tjanst');
  assert.deepEqual(parseSchemaDiagnos({version:SCHEMA_CONTRACT_VERSION,findings}),findings);
});
test('appens fler än 500 kompletteringar ger uttrycklig gränsnotis och behåller motorns notis',()=>{
  const x=structuredClone(u);
  x.labels.activities=Array.from({length:501},(_,i)=>({id:`behov-${i+1}`,title:`Ämne ${i+1}`,weeklyOff:true}));
  const notice={code:'more_diagnoses',message:'Ytterligare 2 fynd finns i underlaget. Rätta de visade punkterna och kontrollera igen.',proof:false,lessons:[],resources:[]};
  const findings=schemaDiagnos(x,[notice]);
  assert.equal(findings.length,500);
  assert.ok(findings.some(f=>f.message===notice.message));
  assert.ok(findings.some(f=>f.code==='more_diagnoses'&&f.message.includes('Ytterligare 3 fynd från appens sammanställning')));
  assert.equal(parseSchemaDiagnos({version:SCHEMA_CONTRACT_VERSION,findings}).length,500);
});
