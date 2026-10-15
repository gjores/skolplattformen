import {gymShape,gymText,gymUuid,gymInteger,parseGymTimplanCreateRequest,type GymTimplanCreateRequest} from './gym-timplan.ts';
import {parseNamedTimplanCreateRequest,parseNamedTimplanRenameRequest,type NamedTimplanCreateRequest,type NamedTimplanRenameRequest} from './named-timplan.ts';
export type TimplanJournal = {version:1;scope:string;unitId:string;offeringId:string;schoolName:string;sourceVersion:number;previousName:string;preserved:number;cleared:number;seriesId:string|null} & (
 {kind:'new';request:NamedTimplanCreateRequest}|{kind:'version';request:GymTimplanCreateRequest}|{kind:'rename';request:NamedTimplanRenameRequest});
export function parseTimplanJournal(value:unknown,scope:string):TimplanJournal {
 const r=gymShape(value,['version','scope','unitId','offeringId','schoolName','sourceVersion','previousName','preserved','cleared','seriesId','kind','request']);
 if(r.version!==1||r.scope!==scope)throw Error('wrong_journal_scope');
 const base={version:1 as const,scope,unitId:gymUuid(r.unitId),offeringId:gymUuid(r.offeringId),schoolName:gymText(r.schoolName,200),sourceVersion:gymInteger(r.sourceVersion,2147483647,1),previousName:gymText(r.previousName,200),preserved:gymInteger(r.preserved),cleared:gymInteger(r.cleared),seriesId:r.seriesId===null?null:gymUuid(r.seriesId)};
 if(r.kind==='new'){const request=parseNamedTimplanCreateRequest(r.request);if(request.unitId!==base.unitId||base.seriesId!==null)throw Error('wrong_new_scope');return {...base,kind:'new',request};}
 if(r.kind==='version'){const request=parseGymTimplanCreateRequest(r.request);if(request.unitId!==base.unitId||!request.predecessorPlanId||!base.seriesId)throw Error('wrong_version_scope');return {...base,kind:'version',request};}
 if(r.kind==='rename'){const request=parseNamedTimplanRenameRequest(r.request);if(request.seriesId!==base.seriesId)throw Error('wrong_rename_scope');return {...base,kind:'rename',request};}
 throw Error('wrong_journal_kind');
}
