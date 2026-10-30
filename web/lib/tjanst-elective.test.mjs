import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTjanstSourceKey, parseTjanstAnySourceKey, tjanstGroupSourceKey, parseTjanstRow, parseTjanstTeachingGroup, parsePlanReadReply, parseSelfReadReply } from './tjanst-contract.ts';
import { schoolSums } from './tjanst-model.ts';
import { projectYearRows, createYearRowEditor, selectYearTeacher, yearRowSavePayload } from './tjanst-year-model.ts';
const id=n=>`75300300-0000-4000-8000-${String(n).padStart(12,'0')}`;
const key=`teaching_group:${id(1)}:2027`;
const source={unitId:id(2),schoolYear:2027,classId:id(3),className:'SA27',sourceKey:`class_timplan:${id(3)}:2027:block:iv1`,frameSourceKey:`class_timplan:${id(3)}:2027:block:iv1`,timeDetailRef:null,rowKey:'block:iv1',label:'Individuellt val',linkRevision:0,timplanId:id(4),timplanVersion:1,seriesId:id(5),column:'ar1',schoolform:'gymnasium',needHt:3000,needVt:3000,needBasis:'terms',blockKind:'individualChoice',allowedOptionCodes:['BILD1000X']};
const group={groupId:id(1),blockId:id(6),optionId:id(7),name:'Bild grupp1',subjectCode:'BILD',levelCode:'BILD1000X',language:null,label:'Bild – Nivå1',groupRevision:1,classIds:[id(3)],sourceRefs:[source],sourceKind:'teaching_group',sourceKey:key,rowKey:`group:${id(1)}`,needHt:3000,needVt:3000,needBasis:'terms',stale:false};
const row={id:id(8),lineageId:id(9),sourceKind:'teaching_group',sourceKey:key,classId:null,groupId:id(1),classIds:[id(3)],sourceRefs:[source],groupRevision:1,rowKey:`group:${id(1)}`,personId:id(10),teacherHt:3000,teacherVt:3000,needHt:3000,needVt:3000,needBasis:'terms',stale:false,jointGroupId:null,comment:''};
test('gruppkälla har eget ID och inget första klass-ID',()=>{assert.equal(tjanstGroupSourceKey(id(1),2027),key);assert.deepEqual(parseTjanstSourceKey('teaching_group',key),{sourceKind:'teaching_group',classId:null,groupId:id(1),schoolYear:2027,rowKey:`group:${id(1)}`});assert.deepEqual(parseTjanstAnySourceKey(key),parseTjanstSourceKey('teaching_group',key));assert.throws(()=>parseTjanstSourceKey('class_timplan',key));});
test('gruppbehov och lagrad tilldelning bevarar klasser och källreferenser uttryckligt',()=>{assert.deepEqual(parseTjanstTeachingGroup(group,{unitId:id(2),schoolYear:2027}),group);assert.deepEqual(parseTjanstRow(row),row);assert.throws(()=>parseTjanstRow({...row,classId:id(3)}));assert.throws(()=>parseTjanstTeachingGroup({...group,classIds:[id(99)]},{unitId:id(2),schoolYear:2027}));assert.throws(()=>parseTjanstTeachingGroup(group,{unitId:id(99),schoolYear:2027}));});
test('samma visningsnamn kopplar inte två grupper och källor kan vara frysta gamla snapshot',()=>{const other={...group,groupId:id(20),sourceKey:tjanstGroupSourceKey(id(20),2027),rowKey:`group:${id(20)}`,stale:true};assert.equal(parseTjanstTeachingGroup(other,{unitId:id(2),schoolYear:2027}).groupId,id(20));assert.equal(parseTjanstRow({...row,stale:true}).sourceRefs[0].timplanId,id(4));});

test('grupper visas som egna behov utan att kräva falska klasser i planläsningen',()=>{
 const q={unitId:id(2),schoolYear:2027},read={contractVersion:'tjanst_v1',...q,schoolName:'Provskola',revision:0,version:null,versions:[],teachers:[],classes:[],rows:[],groups:[group],specials:[],joints:[],actions:['save_row'],blockers:[],capabilities:{canEdit:true,canPublish:false,canReadHistory:true}};
 assert.equal(parsePlanReadReply(read,q).groups[0].groupId,id(1));
 assert.throws(()=>parsePlanReadReply({...read,groups:[{...group,sourceRefs:[{...source,unitId:id(99)}]}]},q));
});
test('obemannade grupper ingår en gång i skolans rest och bemannade i lärarsumman',()=>{
 const empty=schoolSums([],[],[],[],[],[group]);assert.deepEqual(empty.unallocated,{ht:3000,vt:3000});
 const assigned=schoolSums([],[row],[],[],[],[group]);assert.deepEqual(assigned.unallocated,{ht:0,vt:0});assert.deepEqual(assigned.teaching,{ht:3000,vt:3000});
 const projected=projectYearRows([],[],[],[group]);assert.equal(projected.length,1);assert.equal(projected[0].need.classId,null);assert.equal(projected[0].need.groupId,id(1));
});
test('samma årsväg ger verklig teaching_group-payload med explicit lärarval',()=>{
 const support={contractVersion:'tjanst_year_v1',unitId:id(2),schoolYear:2027,currentRevision:0,baseVersionId:null,basisHash:'sha256:'+('a'.repeat(64)),mode:'row',sourceKey:key,rowId:null,
  need:{sourceKind:'teaching_group',sourceKey:key,rowKey:group.rowKey,label:group.label,needHt:3000,needVt:3000,needBasis:'terms',classId:null,className:group.name,groupId:id(1),classIds:[id(3)]},
  currentRow:null,candidates:[{personId:id(10),displayName:'Syntetisk Lärare',draft:true,shareHere:null,duties:[],personBasisHash:'sha256:'+('b'.repeat(64)),qualificationStatus:'unknown'}],totalCandidates:1,recommendationStatus:'empty',suggestions:[]};
 const editor=createYearRowEditor(support);assert.equal(editor.personId,null);const selected=selectYearTeacher(editor,support,{kind:'manual',personId:id(10)}),payload=yearRowSavePayload(selected,support);
 assert.equal(payload.sourceKind,'teaching_group');assert.equal(payload.sourceKey,key);assert.equal(payload.personId,id(10));assert.equal(Object.hasOwn(payload,'classId'),false);
});

test('publicerad egen tjänst bevarar gruppidentitet och klassreferenser utan påhittad klass',()=>{
 const publishedRow={id:id(11),sourceKind:'teaching_group',className:null,groupId:id(1),groupName:group.name,classRefs:[{classId:id(3),name:'SA27'}],subjectCode:group.subjectCode,levelCode:group.levelCode,language:null,rowKey:group.rowKey,label:group.label,ht:3000,vt:3000,joint:null,sharing:null};
 const read={contractVersion:'tjanst_v1',person:{id:id(10),displayName:'Syntetisk Lärare'},capabilities:{canAck:true,canComment:true},publications:[{versionId:id(21),versionNo:1,unitId:id(2),schoolName:'Provskola',schoolYear:2027,publishedAt:'2027-07-01T00:00:00.000Z',contentHash:'sha256:'+('a'.repeat(64)),rows:[publishedRow],specials:[],acknowledgedAt:null,comments:[]}]};
 const parsed=parseSelfReadReply(read).publications[0].rows[0];assert.equal(parsed.className,null);assert.deepEqual(parsed.classRefs,publishedRow.classRefs);assert.equal(parsed.groupId,id(1));
 assert.throws(()=>parseSelfReadReply({...read,publications:[{...read.publications[0],rows:[{...publishedRow,className:'SA27'}]}]}));
});
