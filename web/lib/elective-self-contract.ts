import { parseElectiveRound, parseElectiveOption, parseElectiveChoice, parseElectiveGuardianConfirmation, parseElectivePolicy, electiveHash, ELECTIVE_BLOCK_KINDS, type ElectiveRound, type ElectiveOption, type ElectiveChoice, type ElectiveGuardianConfirmation, type ElectivePolicy, type ElectiveBlockKind } from './elective-block-contract.ts';
/** Separate school-attested participant authority. No personal role is inferred from these DTOs. */
export const ELECTIVE_SELF_VERSION = 'elective_self_v1' as const;
export const ELECTIVE_BINDING_VERSION = 'elective_binding_v1' as const;
export type ElectiveParticipant = 'pupil' | 'guardian';
export type BindingScope = { unitId: string; pupilId: string };
export type ParticipantScope = BindingScope & { participant: ElectiveParticipant };
export type ElectiveBinding = BindingScope & { id: string; identityId: string; participant: ElectiveParticipant;
  confirmationRequired: boolean; startsOn: string; endsOn: string | null; sourceReference: string;
  revision: number; revokedAt: string | null; attestedByAssignmentId: string };
export type BindingCommand = BindingScope & { commandId: string; expectedRevision: number } & (
  { action: 'save_binding'; payload: Pick<ElectiveBinding, 'id' | 'identityId' | 'participant' | 'confirmationRequired' | 'startsOn' | 'endsOn' | 'sourceReference'> }
  | { action: 'revoke_binding'; payload: { id: string } });
export type BindingRead = BindingScope & { contractVersion: typeof ELECTIVE_BINDING_VERSION; bindings: ElectiveBinding[] };
export type BindingReceipt = { commandId: string; identityId: string; assignmentId: string; bindingId: string; bindingRevision: number; request: BindingCommand };
export type BindingReply = { status: 'done'; receipt: BindingReceipt; binding: ElectiveBinding };
export type BindingStatus = BindingReply | { status: 'not_found'; commandId: string };
export type ParticipantAuthority = ParticipantScope & { identityId: string; bindingId: string; bindingRevision: number;
  customerId: string; organizerId: string; epoch: number; confirmationRequired: boolean };
export type SelfParticipant = ParticipantScope & { bindingId: string; bindingRevision: number; schoolName: string; pupilName: string; confirmationRequired: boolean };
export type SelfIndex = { contractVersion: typeof ELECTIVE_SELF_VERSION; epoch: number; identityReference: string; participants: SelfParticipant[] };
export class ElectiveSelfContractError extends Error { constructor(){super('Ogiltigt val- eller kontokopplingsunderlag.');this.name='ElectiveSelfContractError';} }
function bad():never{throw new ElectiveSelfContractError();}
export function selfObject(v:unknown,keys:readonly string[]):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))bad();const r=v as Record<string,unknown>;if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k)))bad();return r;}
export function selfUuid(v:unknown):string{if(typeof v!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(v))bad();return v;}
export function selfInt(v:unknown,min=1,max=2147483647):number{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)bad();return v;}
function hasControl(value:string):boolean{for(let i=0;i<value.length;i++){const n=value.charCodeAt(i);if(n<32||n===127)return true;}return false;}
export function selfText(v:unknown,max=240):string{if(typeof v!=='string'||v!==v.trim()||!v||v.length>max||hasControl(v))bad();return v;}
export function selfBool(v:unknown):boolean{if(typeof v!=='boolean')bad();return v;}
export function selfDate(v:unknown):string{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/u.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)bad();return v;}
export function selfTime(v:unknown):string{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString()!==v)bad();return v;}
function role(v:unknown):ElectiveParticipant{if(v!=='pupil'&&v!=='guardian')bad();return v;}
function match(v:BindingScope,expected:BindingScope){if(v.unitId!==expected.unitId||v.pupilId!==expected.pupilId)bad();}
export function parseBindingScope(value:unknown):BindingScope{const r=selfObject(value,['unitId','pupilId']);return{unitId:selfUuid(r.unitId),pupilId:selfUuid(r.pupilId)};}
export function parseParticipantScope(value:unknown):ParticipantScope{const r=selfObject(value,['unitId','pupilId','participant']);return{unitId:selfUuid(r.unitId),pupilId:selfUuid(r.pupilId),participant:role(r.participant)};}
function bindingPayload(value:unknown){const r=selfObject(value,['id','identityId','participant','confirmationRequired','startsOn','endsOn','sourceReference']);const p={id:selfUuid(r.id),identityId:selfUuid(r.identityId),participant:role(r.participant),confirmationRequired:selfBool(r.confirmationRequired),startsOn:selfDate(r.startsOn),endsOn:r.endsOn===null?null:selfDate(r.endsOn),sourceReference:selfText(r.sourceReference,120)};if(p.participant==='pupil'&&p.confirmationRequired||p.endsOn!==null&&p.endsOn<p.startsOn)bad();return p;}
export function parseBindingCommand(value:unknown):BindingCommand{
 const r=selfObject(value,['unitId','pupilId','commandId','expectedRevision','action','payload']);const common={unitId:selfUuid(r.unitId),pupilId:selfUuid(r.pupilId),commandId:selfUuid(r.commandId),expectedRevision:selfInt(r.expectedRevision,0)};
 if(r.action==='save_binding')return{...common,action:r.action,payload:bindingPayload(r.payload)};
 if(r.action==='revoke_binding'){const p=selfObject(r.payload,['id']);if(common.expectedRevision<1)bad();return{...common,action:r.action,payload:{id:selfUuid(p.id)}};}
 return bad();
}
export function parseBinding(value:unknown):ElectiveBinding{const r=selfObject(value,['unitId','pupilId','id','identityId','participant','confirmationRequired','startsOn','endsOn','sourceReference','revision','revokedAt','attestedByAssignmentId']);const p=bindingPayload(Object.fromEntries(['id','identityId','participant','confirmationRequired','startsOn','endsOn','sourceReference'].map(k=>[k,r[k]])));return{unitId:selfUuid(r.unitId),pupilId:selfUuid(r.pupilId),...p,revision:selfInt(r.revision),revokedAt:r.revokedAt===null?null:selfTime(r.revokedAt),attestedByAssignmentId:selfUuid(r.attestedByAssignmentId)};}
export function parseBindingRead(value:unknown,expected:BindingScope):BindingRead{const r=selfObject(value,['contractVersion','unitId','pupilId','bindings']);if(r.contractVersion!==ELECTIVE_BINDING_VERSION||!Array.isArray(r.bindings)||r.bindings.length>200)bad();const out={contractVersion:ELECTIVE_BINDING_VERSION,unitId:selfUuid(r.unitId),pupilId:selfUuid(r.pupilId),bindings:r.bindings.map(parseBinding)};match(out,expected);const seen=new Set<string>();for(const b of out.bindings){match(b,expected);if(seen.has(b.id))bad();seen.add(b.id);}return out;}
function canonical(v:unknown):string{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return'['+v.map(canonical).join(',')+']';return'{'+Object.entries(v as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';}
export function parseBindingReply(value:unknown,input:BindingCommand,actor?:{identityId:string;assignmentId:string|null}):BindingReply{const r=selfObject(value,['status','receipt','binding']);if(r.status!=='done')bad();const b=parseBinding(r.binding),v=selfObject(r.receipt,['commandId','identityId','assignmentId','bindingId','bindingRevision','request']);const receipt={commandId:selfUuid(v.commandId),identityId:selfUuid(v.identityId),assignmentId:selfUuid(v.assignmentId),bindingId:selfUuid(v.bindingId),bindingRevision:selfInt(v.bindingRevision),request:parseBindingCommand(v.request)};match(b,input);if(receipt.commandId!==input.commandId||receipt.bindingId!==input.payload.id||b.id!==receipt.bindingId||b.revision!==receipt.bindingRevision||canonical(receipt.request)!==canonical(input)||actor&&(receipt.identityId!==actor.identityId||receipt.assignmentId!==actor.assignmentId))bad();if(b.revision!==input.expectedRevision+1)bad();if(input.action==='save_binding'){if(b.revokedAt!==null||Object.entries(input.payload).some(([k,v])=>canonical(b[k as keyof ElectiveBinding])!==canonical(v)))bad();}else if(b.revokedAt===null)bad();return{status:'done',receipt,binding:b};}
export function parseBindingStatus(value:unknown,input:BindingCommand,actor?:{identityId:string;assignmentId:string|null}):BindingStatus{if(value&&typeof value==='object'&&'status'in value&&value.status==='not_found'){const r=selfObject(value,['status','commandId']);if(r.commandId!==input.commandId)bad();return{status:'not_found',commandId:selfUuid(r.commandId)};}return parseBindingReply(value,input,actor);}
export function parseParticipantAuthority(value:unknown,scope:ParticipantScope,identityId:string,epoch:number):ParticipantAuthority{const r=selfObject(value,['unitId','pupilId','identityId','bindingId','customerId','organizerId','participant','bindingRevision','confirmationRequired','epoch']);const out={unitId:selfUuid(r.unitId),pupilId:selfUuid(r.pupilId),identityId:selfUuid(r.identityId),bindingId:selfUuid(r.bindingId),customerId:selfUuid(r.customerId),organizerId:selfUuid(r.organizerId),participant:role(r.participant),bindingRevision:selfInt(r.bindingRevision),confirmationRequired:selfBool(r.confirmationRequired),epoch:selfInt(r.epoch)};match(out,scope);if(out.participant!==scope.participant||out.identityId!==identityId||out.epoch!==epoch||out.participant==='pupil'&&out.confirmationRequired)bad();return out;}
export function parseSelfParticipant(value:unknown):SelfParticipant{const r=selfObject(value,['bindingId','unitId','schoolName','pupilId','pupilName','participant','bindingRevision','confirmationRequired']);const out={bindingId:selfUuid(r.bindingId),unitId:selfUuid(r.unitId),schoolName:selfText(r.schoolName),pupilId:selfUuid(r.pupilId),pupilName:selfText(r.pupilName),participant:role(r.participant),bindingRevision:selfInt(r.bindingRevision),confirmationRequired:selfBool(r.confirmationRequired)};if(out.participant==='pupil'&&out.confirmationRequired)bad();return out;}
export function parseSelfIndex(value:unknown):SelfIndex{const r=selfObject(value,['contractVersion','epoch','identityReference','participants']);if(r.contractVersion!==ELECTIVE_SELF_VERSION||!Array.isArray(r.participants)||r.participants.length>200)bad();const participants=r.participants.map(parseSelfParticipant);if(new Set(participants.map(p=>p.bindingId)).size!==participants.length)bad();return{contractVersion:ELECTIVE_SELF_VERSION,epoch:selfInt(r.epoch),identityReference:selfUuid(r.identityReference),participants};}


/** A published offer projection deliberately omits class lists and other pupils. */
export type SelfOffer = { round: Omit<ElectiveRound,'pupilIds'>; blockName:string; blockKind:ElectiveBlockKind; startsOn:string; endsOn:string;
 needHt:number|null; needVt:number|null; needBasis:'terms'|'even_split'|'weekly_calendar'; options:ElectiveOption[] };
export type SelfPlacement = { groupId:string; groupName:string; optionId:string; startsOn:string; endsOn:string|null };
export type SelfRead = { contractVersion:typeof ELECTIVE_SELF_VERSION;epoch:number;participant:SelfParticipant;policy:ElectivePolicy;
 offers:SelfOffer[];choices:ElectiveChoice[];confirmations:ElectiveGuardianConfirmation[];placements:SelfPlacement[] };
type SelfCommandBase=ParticipantScope&{expectedBindingRevision:number;commandId:string};
export type SelfCommand=SelfCommandBase&(
 {action:'submit_choice';payload:{roundId:string;offeringRevision:number;expectedChoiceRevision:number|null;selectedOptionIds:string[]}}
 |{action:'confirm_guardian';payload:{choiceId:string;expectedChoiceRevision:number;offeringRevision:number;decision:'approve'|'decline'}});
export type SelfCommandRef=ParticipantScope&{commandId:string;action:SelfCommand['action'];payloadHash:string};
export type SelfReceipt=SelfCommandRef&{identityId:string;bindingId:string;bindingRevision:number;choiceId:string;choiceRevision:number;replayed:boolean};
export type SelfStatus=ParticipantScope&{commandId:string}&({status:'not_found';receipt:null}|{status:'found';receipt:SelfReceipt});
function list<T>(v:unknown,parse:(x:unknown)=>T,max=200):T[]{if(!Array.isArray(v)||v.length>max)bad();return v.map(parse);}
function ids(v:unknown,max=100):string[]{const out=list(v,selfUuid,max);if(new Set(out).size!==out.length)bad();return out;}
function hash(v:unknown):string{if(typeof v!=='string'||! /^[0-9a-f]{64}$/u.test(v))bad();return v;}
function selfAction(v:unknown):SelfCommand['action']{if(v!=='submit_choice'&&v!=='confirm_guardian')bad();return v;}
export function parseSelfOffer(v:unknown):SelfOffer{
 const r=selfObject(v,['round','blockName','blockKind','startsOn','endsOn','needHt','needVt','needBasis','options']);
 const raw=selfObject(r.round,['id','blockId','blockRevision','revision','offeringRevision','policyRevision','guardianConfirmation','opensAt','closesAt','status','minChoices','maxChoices','optionIds']);
 const full=parseElectiveRound({...raw,pupilIds:null});const{pupilIds:_pupils,...round}=full;
 const startsOn=selfDate(r.startsOn),endsOn=selfDate(r.endsOn),blockKind=r.blockKind;
 if(endsOn<startsOn||typeof blockKind!=='string'||!ELECTIVE_BLOCK_KINDS.includes(blockKind as ElectiveBlockKind)||!['terms','even_split','weekly_calendar'].includes(String(r.needBasis)))bad();
 const options=list(r.options,parseElectiveOption,100);if(new Set(options.map(o=>o.id)).size!==options.length||options.length!==round.optionIds.length||options.some(o=>!round.optionIds.includes(o.id)))bad();
 return{round,blockName:selfText(r.blockName,200),blockKind:blockKind as ElectiveBlockKind,startsOn,endsOn,needHt:r.needHt===null?null:selfInt(r.needHt,0,10000000),needVt:r.needVt===null?null:selfInt(r.needVt,0,10000000),needBasis:r.needBasis as SelfOffer['needBasis'],options};
}
export function parseSelfRead(v:unknown,expected:ParticipantScope&{bindingId?:string}):SelfRead{
 const r=selfObject(v,['contractVersion','epoch','participant','policy','offers','choices','confirmations','placements']);if(r.contractVersion!==ELECTIVE_SELF_VERSION)bad();
 const participant=parseSelfParticipant(r.participant);match(participant,expected);if(participant.participant!==expected.participant||expected.bindingId&&participant.bindingId!==expected.bindingId)bad();
 const policy=parseElectivePolicy(r.policy);if(policy.unitId!==participant.unitId)bad();
 const offers=list(r.offers,parseSelfOffer),choices=list(r.choices,parseElectiveChoice),confirmations=list(r.confirmations,parseElectiveGuardianConfirmation);
 if(new Set(offers.map(o=>o.round.id)).size!==offers.length||new Set(choices.map(c=>c.id)).size!==choices.length)bad();
 if(choices.some(c=>c.pupilId!==participant.pupilId||!offers.some(o=>o.round.id===c.roundId)))bad();
 if(confirmations.some(c=>c.bindingId!==participant.bindingId||!choices.some(x=>x.id===c.choiceId)))bad();
 const placements=list(r.placements,x=>{const p=selfObject(x,['groupId','groupName','optionId','startsOn','endsOn']);const startsOn=selfDate(p.startsOn),endsOn=p.endsOn===null?null:selfDate(p.endsOn);if(endsOn!==null&&endsOn<startsOn)bad();return{groupId:selfUuid(p.groupId),groupName:selfText(p.groupName,200),optionId:selfUuid(p.optionId),startsOn,endsOn};});
 return{contractVersion:ELECTIVE_SELF_VERSION,epoch:selfInt(r.epoch),participant,policy,offers,choices,confirmations,placements};
}
export function parseSelfCommand(v:unknown):SelfCommand{
 const r=selfObject(v,['unitId','pupilId','participant','expectedBindingRevision','commandId','action','payload']);
 const common={unitId:selfUuid(r.unitId),pupilId:selfUuid(r.pupilId),participant:role(r.participant),expectedBindingRevision:selfInt(r.expectedBindingRevision),commandId:selfUuid(r.commandId)};
 if(r.action==='submit_choice'){if(common.participant!=='pupil')bad();const p=selfObject(r.payload,['roundId','offeringRevision','expectedChoiceRevision','selectedOptionIds']);return{...common,action:r.action,payload:{roundId:selfUuid(p.roundId),offeringRevision:selfInt(p.offeringRevision),expectedChoiceRevision:p.expectedChoiceRevision===null?null:selfInt(p.expectedChoiceRevision),selectedOptionIds:ids(p.selectedOptionIds)}};}
 if(r.action==='confirm_guardian'){if(common.participant!=='guardian')bad();const p=selfObject(r.payload,['choiceId','expectedChoiceRevision','offeringRevision','decision']);if(p.decision!=='approve'&&p.decision!=='decline')bad();return{...common,action:r.action,payload:{choiceId:selfUuid(p.choiceId),expectedChoiceRevision:selfInt(p.expectedChoiceRevision),offeringRevision:selfInt(p.offeringRevision),decision:p.decision}};}
 return bad();
}
export function parseSelfCommandRef(v:unknown):SelfCommandRef{const r=selfObject(v,['unitId','pupilId','participant','commandId','action','payloadHash']);const out={unitId:selfUuid(r.unitId),pupilId:selfUuid(r.pupilId),participant:role(r.participant),commandId:selfUuid(r.commandId),action:selfAction(r.action),payloadHash:hash(r.payloadHash)};if(out.action==='submit_choice'&&out.participant!=='pupil'||out.action==='confirm_guardian'&&out.participant!=='guardian')bad();return out;}
export async function createSelfCommandRef(v:SelfCommand):Promise<SelfCommandRef>{const q=parseSelfCommand(v);return{unitId:q.unitId,pupilId:q.pupilId,participant:q.participant,commandId:q.commandId,action:q.action,payloadHash:await electiveHash(['elective_self_payload_v1',q])};}
export function parseSelfReceipt(v:unknown,expected:SelfCommandRef,actor?:{identityId:string;bindingId:string}):SelfReceipt{
 const r=selfObject(v,['unitId','pupilId','participant','commandId','action','payloadHash','identityId','bindingId','bindingRevision','choiceId','choiceRevision','replayed']);
 const ref=parseSelfCommandRef(Object.fromEntries(['unitId','pupilId','participant','commandId','action','payloadHash'].map(k=>[k,r[k]])));match(ref,expected);
 if(ref.participant!==expected.participant||ref.commandId!==expected.commandId||ref.action!==expected.action||ref.payloadHash!==expected.payloadHash)bad();
 const receipt={...ref,identityId:selfUuid(r.identityId),bindingId:selfUuid(r.bindingId),bindingRevision:selfInt(r.bindingRevision),choiceId:selfUuid(r.choiceId),choiceRevision:selfInt(r.choiceRevision),replayed:selfBool(r.replayed)};
 if(actor&&(receipt.identityId!==actor.identityId||receipt.bindingId!==actor.bindingId))bad();return receipt;
}
export function parseSelfStatus(v:unknown,expected:SelfCommandRef,actor?:{identityId:string;bindingId:string}):SelfStatus{
 const r=selfObject(v,['unitId','pupilId','participant','commandId','status','receipt']);const common={unitId:selfUuid(r.unitId),pupilId:selfUuid(r.pupilId),participant:role(r.participant),commandId:selfUuid(r.commandId)};match(common,expected);if(common.participant!==expected.participant||common.commandId!==expected.commandId)bad();
 if(r.status==='not_found'){if(r.receipt!==null)bad();return{...common,status:'not_found',receipt:null};}
 if(r.status!=='found')bad();const receipt=parseSelfReceipt(r.receipt,expected,actor);if(!receipt.replayed)bad();return{...common,status:'found',receipt};
}

export type BindingCommandRef=BindingScope & {commandId:string;action:BindingCommand['action'];payloadHash:string};
export function parseBindingCommandRef(value:unknown):BindingCommandRef{const r=selfObject(value,['unitId','pupilId','commandId','action','payloadHash']);if(r.action!=='save_binding'&&r.action!=='revoke_binding'||typeof r.payloadHash!=='string'||!/^[a-f0-9]{64}$/u.test(r.payloadHash))bad();return{unitId:selfUuid(r.unitId),pupilId:selfUuid(r.pupilId),commandId:selfUuid(r.commandId),action:r.action,payloadHash:r.payloadHash};}
export async function createBindingCommandRef(value:BindingCommand):Promise<BindingCommandRef>{const c=parseBindingCommand(value);return{unitId:c.unitId,pupilId:c.pupilId,commandId:c.commandId,action:c.action,payloadHash:await electiveHash(c)};}
export async function parseBindingStatusReply(value:unknown,ref:BindingCommandRef,actor?:{identityId:string;assignmentId:string|null}):Promise<BindingStatus>{
 if(value&&typeof value==='object'&&'status'in value&&value.status==='not_found'){const r=selfObject(value,['status','commandId']);if(r.commandId!==ref.commandId)bad();return{status:'not_found',commandId:selfUuid(r.commandId)};}
 const r=selfObject(value,['status','receipt','binding']),receipt=selfObject(r.receipt,['commandId','identityId','assignmentId','bindingId','bindingRevision','request']),command=parseBindingCommand(receipt.request);
 const actual=await createBindingCommandRef(command);if(canonical(actual)!==canonical(ref))bad();return parseBindingReply(value,command,actor);
}
