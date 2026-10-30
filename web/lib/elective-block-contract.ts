import { tjanstHashCanonical } from './tjanst-contract.ts';
/** Internal elective offering contract. These objects do not claim an SS 12000 export. */
export const ELECTIVE_CONTRACT_VERSION = 'elective_block_v1' as const;
export const ELECTIVE_BLOCK_KINDS = ['modernLanguage', 'individualChoice', 'specialization', 'languageChoice', 'schoolChoice'] as const;
export const ELECTIVE_ACTIONS = ['save_block', 'apply_groups', 'set_policy', 'open_round', 'close_round', 'record_choice', 'confirm_choice', 'save_placement', 'end_placement'] as const;
export type ElectiveBlockKind = typeof ELECTIVE_BLOCK_KINDS[number];
export type ElectiveScope = { unitId: string; schoolYear: number };
export type ElectiveNeedBasis = 'terms' | 'even_split' | 'weekly_calendar';
export type ElectiveSource = ElectiveScope & {
  classId: string; className: string; sourceKey: string; rowKey: string; label: string;
  linkRevision: number; timplanId: string; timplanVersion: number; seriesId: string;
  column: string; schoolform: 'gymnasium' | 'grundskola' | 'introduktionsprogram';
  needHt: number | null; needVt: number | null; needBasis: ElectiveNeedBasis;
  blockKind: ElectiveBlockKind; allowedOptionCodes: string[];
};
export type ElectiveOption = { id: string; name: string; subjectCode: string; levelCode: string; language: string | null; points: number | null };
export type ElectiveGroupDraft = { id: string; optionId: string; name: string; startsOn: string; endsOn: string;
  classIds: string[]; sourceKeys: string[]; estimatedPupils: number | null };
export type ElectiveGroup = ElectiveGroupDraft & { memberCount: number | null; membershipRevision: number };
export type ElectiveBlockDraft = { id: string; kind: ElectiveBlockKind; name: string; startsOn: string; endsOn: string;
  sourceRefs: ElectiveSource[]; options: ElectiveOption[]; groups: ElectiveGroupDraft[] };
export type ElectiveBlock = Omit<ElectiveBlockDraft, 'groups'> & { revision: number; applied: boolean; groups: ElectiveGroup[] };
export type ElectivePolicy = { unitId: string; revision: number; guardianConfirmation: boolean | null };
export type ElectivePupil = { id: string; name: string; classIds: string[] };
export type ElectiveRound = { id: string; blockId: string; blockRevision: number; revision: number; offeringRevision: number;
  policyRevision: number; guardianConfirmation: boolean; opensAt: string; closesAt: string; status: 'open' | 'closed';
  minChoices: number; maxChoices: number; optionIds: string[]; pupilIds: string[] | null };
export const ELECTIVE_CHOICE_STATES = ['stale_offer','policy_missing','guardian_bindings_missing','guardian_declined','awaiting_guardian','ready_for_confirmation','confirmed'] as const;
export type ElectiveChoiceState = typeof ELECTIVE_CHOICE_STATES[number];
export type ElectiveChoice = { id: string; roundId: string; pupilId: string; offeringRevision: number; revision: number;
  selectedOptionIds: string[]; submittedAt: string; confirmedAt: string | null; state: ElectiveChoiceState };
export type ElectiveRequiredGuardian = { bindingId: string; revision: number };
export type ElectiveGuardianConfirmation = { id: string; bindingId: string; bindingRevision: number; choiceId: string;
  choiceRevision: number; offeringRevision: number; decision: 'approve' | 'decline'; decidedAt: string };
export type ElectivePlacement = { id: string; groupId: string; pupilId: string; choiceId: string; choiceRevision: number;
  startsOn: string; endsOn: string | null; revision: number };
export type ElectiveRead = ElectiveScope & { contractVersion: typeof ELECTIVE_CONTRACT_VERSION; schoolName: string; revision: number;
  canManage: boolean; canReadPupils: boolean; policy: ElectivePolicy; sources: ElectiveSource[]; blocks: ElectiveBlock[];
  pupils: ElectivePupil[] | null; rounds: ElectiveRound[]; choices: ElectiveChoice[] | null; placements: ElectivePlacement[] | null };
type ElectiveBaseCommand = ElectiveScope & { commandId: string; expectedRevision: number };
export type ElectiveCommand = ElectiveBaseCommand & (
  { action: 'save_block'; payload: { expectedBlockRevision: number | null; block: ElectiveBlockDraft } }
  | { action: 'apply_groups'; payload: { blockId: string; expectedBlockRevision: number } }
  | { action: 'set_policy'; payload: { guardianConfirmation: boolean } }
  | { action: 'open_round'; payload: { roundId: string; blockId: string; expectedBlockRevision: number; opensAt: string;
      closesAt: string; minChoices: number; maxChoices: number; pupilIds: string[] } }
  | { action: 'close_round'; payload: { roundId: string; expectedRoundRevision: number } }
  | { action: 'record_choice'; payload: { roundId: string; pupilId: string; offeringRevision: number; expectedChoiceRevision: number | null; selectedOptionIds: string[] } }
  | { action: 'confirm_choice'; payload: { choiceId: string; expectedChoiceRevision: number } }
  | { action: 'save_placement'; payload: { placementId: string; choiceId: string; expectedChoiceRevision: number; groupId: string;
      startsOn: string; endsOn: string | null; previousPlacementId: string | null } }
  | { action: 'end_placement'; payload: { placementId: string; expectedPlacementRevision: number; endsOn: string } }
);
export type ElectiveCommandRef = ElectiveScope & { commandId: string; action: ElectiveCommand['action']; payloadHash: string };
export type ElectiveReceipt = ElectiveScope & { commandId: string; action: ElectiveCommand['action']; payloadHash: string; revision: number;
  objectId: string | null; objectRevision: number; replayed: boolean };
export type ElectiveStatusReply = ElectiveScope & { commandId: string } & (
  { status: 'not_found'; receipt: null } | { status: 'found'; receipt: ElectiveReceipt & { replayed: true } }
);
export class ElectiveBlockError extends Error {
  readonly code: string;
  constructor(code = 'elective_invalid') { super(code); this.code = code; this.name = 'ElectiveBlockError'; }
}
export function electiveFail(code = 'elective_invalid'): never { throw new ElectiveBlockError(code); }
export function electiveShape(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) electiveFail();
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== keys.length || keys.some(k => !Object.hasOwn(r, k)) || Object.keys(r).some(k => !keys.includes(k))) electiveFail();
  return r;
}
export function electiveUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)) electiveFail();
  return value.toLowerCase();
}
export function electiveInteger(value: unknown, min = 0, max = 2147483647): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) electiveFail(); return value;
}
export function electiveText(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value || value.length > max || value !== value.trim() || /[\p{Cc}\p{Cf}]/u.test(value)) electiveFail();
  for (let i=0;i<value.length;i++) { const n=value.charCodeAt(i);if(n>=0xd800&&n<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))electiveFail();}else if(n>=0xdc00&&n<=0xdfff)electiveFail(); }
  return value;
}
export function electiveDate(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/u.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) electiveFail(); return value;
}
export function electiveInstant(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))) electiveFail();
  electiveDate(value.slice(0,10));return new Date(value).toISOString();
}
export function electiveBoolean(value: unknown): boolean { if(typeof value!=='boolean')electiveFail();return value; }
export function electiveArray<T>(value: unknown, parser: (v: unknown) => T, max = 2000): T[] {
  if (!Array.isArray(value) || value.length > max) electiveFail(); return value.map(parser);
}
export function electiveEnum<const T extends readonly string[]>(value: unknown, values: T): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) electiveFail(); return value as T[number];
}
function unique<T>(rows: T[], key: (row:T) => unknown): T[] { if(new Set(rows.map(key)).size!==rows.length)electiveFail('elective_duplicate');return rows; }
export function electiveIds(value: unknown, max = 2000): string[] { return unique(electiveArray(value,electiveUuid,max),x=>x); }
function revision(value: unknown): number { return electiveInteger(value,1); }
function nullable<T>(value: unknown, parser: (v: unknown) => T): T|null { return value === null ? null : parser(value); }
function period(startsOn: string, endsOn: string | null): void { if(endsOn!==null&&endsOn<startsOn)electiveFail('elective_period'); }
export function parseElectiveScope(value: unknown): ElectiveScope { const r=electiveShape(value,['unitId','schoolYear']);return scopeFields(r); }
function scopeFields(r: Record<string,unknown>): ElectiveScope { return {unitId:electiveUuid(r.unitId),schoolYear:electiveInteger(r.schoolYear,1900,9998)}; }
function sameScope(a:ElectiveScope,b:ElectiveScope):void{if(a.unitId!==b.unitId.toLowerCase()||a.schoolYear!==b.schoolYear)electiveFail('elective_scope');}
export function parseElectiveSource(value: unknown): ElectiveSource {
  const r=electiveShape(value,['unitId','schoolYear','classId','className','sourceKey','rowKey','label','linkRevision','timplanId','timplanVersion','seriesId','column','schoolform','needHt','needVt','needBasis','blockKind','allowedOptionCodes']);
  const scope=scopeFields(r),classId=electiveUuid(r.classId),rowKey=electiveText(r.rowKey,160),sourceKey=electiveText(r.sourceKey,250),column=electiveText(r.column,16);
  const schoolform=electiveEnum(r.schoolform,['gymnasium','grundskola','introduktionsprogram']);
  if(sourceKey!==`class_timplan:${classId}:${scope.schoolYear}:${rowKey}`||(schoolform==='gymnasium'?!/^ar[1-3]$/u.test(column):schoolform==='grundskola'?!/^ak[1-9]$/u.test(column):column!=='vecka'))electiveFail('elective_source_identity');
  return {...scope,classId,className:electiveText(r.className),sourceKey,rowKey,label:electiveText(r.label,300),linkRevision:electiveInteger(r.linkRevision),
    timplanId:electiveUuid(r.timplanId),timplanVersion:revision(r.timplanVersion),seriesId:electiveUuid(r.seriesId),column,
    schoolform,needHt:nullable(r.needHt,v=>electiveInteger(v,0,6000000)),needVt:nullable(r.needVt,v=>electiveInteger(v,0,6000000)),
    needBasis:electiveEnum(r.needBasis,['terms','even_split','weekly_calendar']),blockKind:electiveEnum(r.blockKind,ELECTIVE_BLOCK_KINDS),
    allowedOptionCodes:unique(electiveArray(r.allowedOptionCodes,v=>electiveText(v,80)),x=>x)};
}
export function parseElectiveOption(value: unknown): ElectiveOption {
  const r=electiveShape(value,['id','name','subjectCode','levelCode','language','points']);return {id:electiveUuid(r.id),name:electiveText(r.name),subjectCode:electiveText(r.subjectCode,80),levelCode:electiveText(r.levelCode,80),language:nullable(r.language,v=>electiveText(v,80)),points:nullable(r.points,v=>electiveInteger(v,1,2500))};
}
export function parseElectiveGroupDraft(value:unknown):ElectiveGroupDraft{
  const r=electiveShape(value,['id','optionId','name','startsOn','endsOn','classIds','sourceKeys','estimatedPupils']);
  const startsOn=electiveDate(r.startsOn),endsOn=electiveDate(r.endsOn);period(startsOn,endsOn);
  return {id:electiveUuid(r.id),optionId:electiveUuid(r.optionId),name:electiveText(r.name),startsOn,endsOn,classIds:electiveIds(r.classIds),sourceKeys:unique(electiveArray(r.sourceKeys,v=>electiveText(v,250)),x=>x),estimatedPupils:nullable(r.estimatedPupils,v=>electiveInteger(v,0,10000))};
}
function groupFromRead(value:unknown):ElectiveGroup{
  const r=electiveShape(value,['id','optionId','name','startsOn','endsOn','classIds','sourceKeys','estimatedPupils','memberCount','membershipRevision']);
  const {memberCount,membershipRevision,...draft}=r;
  return {...parseElectiveGroupDraft(draft),memberCount:nullable(memberCount,v=>electiveInteger(v,0,10000)),membershipRevision:revision(membershipRevision)};
}
export function parseElectiveBlockDraft(value:unknown):ElectiveBlockDraft{
  const r=electiveShape(value,['id','kind','name','startsOn','endsOn','sourceRefs','options','groups']);
  const startsOn=electiveDate(r.startsOn),endsOn=electiveDate(r.endsOn);period(startsOn,endsOn);
  const sourceRefs=unique(electiveArray(r.sourceRefs,parseElectiveSource,100),s=>s.sourceKey),kind=electiveEnum(r.kind,ELECTIVE_BLOCK_KINDS);
  const options=unique(electiveArray(r.options,parseElectiveOption,100),o=>o.id),groups=unique(electiveArray(r.groups,parseElectiveGroupDraft,200),g=>g.id);
  if(!sourceRefs.length||!options.length)electiveFail('elective_source_missing');
  if(startsOn!==`${sourceRefs[0].schoolYear}-07-01`||endsOn!==`${sourceRefs[0].schoolYear+1}-06-30`)electiveFail('elective_period_time_source');
  for(const source of sourceRefs){sameScope(source,sourceRefs[0]);if(source.blockKind!==kind)electiveFail('elective_frame_mismatch');}
  for(const option of options){if((kind==='modernLanguage'||kind==='languageChoice')&&!option.language)electiveFail('elective_language_required');if(sourceRefs.some(s=>!s.allowedOptionCodes.includes(option.levelCode)))electiveFail('elective_option_not_allowed');}
  const keys=new Map(sourceRefs.map(s=>[s.sourceKey,s]));
  for(const group of groups){if(!options.some(o=>o.id===group.optionId)||!group.sourceKeys.length||!group.classIds.length||group.startsOn!==startsOn||group.endsOn!==endsOn)electiveFail('elective_group_reference');
    const sources=group.sourceKeys.map(k=>keys.get(k));if(sources.some(s=>!s)||sources.length!==group.classIds.length||sources.some(s=>!group.classIds.includes(s!.classId)))electiveFail('elective_group_reference');}
  return {id:electiveUuid(r.id),kind,name:electiveText(r.name),startsOn,endsOn,sourceRefs,options,groups};
}
export function parseElectiveBlock(value:unknown):ElectiveBlock{
  const r=electiveShape(value,['id','kind','name','startsOn','endsOn','sourceRefs','options','groups','revision','applied']);
  const groups=electiveArray(r.groups,groupFromRead,200),{revision:rev,applied,...draft}=r;
  const block=parseElectiveBlockDraft({...draft,groups:groups.map(({memberCount:_n,membershipRevision:_r,...g})=>g)});
  return {...block,groups,revision:revision(rev),applied:electiveBoolean(applied)};
}
export function electiveDraftFromBlock(block:ElectiveBlock):ElectiveBlockDraft{
  const {revision:_revision,applied:_applied,...draft}=block;
  return {...draft,groups:draft.groups.map(({memberCount:_n,membershipRevision:_r,...g})=>g)};
}
export function parseElectivePolicy(value:unknown):ElectivePolicy{const r=electiveShape(value,['unitId','revision','guardianConfirmation']);return {unitId:electiveUuid(r.unitId),revision:revision(r.revision),guardianConfirmation:nullable(r.guardianConfirmation,electiveBoolean)};}
export function parseElectiveRound(value:unknown):ElectiveRound{
  const r=electiveShape(value,['id','blockId','blockRevision','revision','offeringRevision','policyRevision','guardianConfirmation','opensAt','closesAt','status','minChoices','maxChoices','optionIds','pupilIds']);
  const opensAt=electiveInstant(r.opensAt),closesAt=electiveInstant(r.closesAt),minChoices=electiveInteger(r.minChoices,1,100),maxChoices=electiveInteger(r.maxChoices,minChoices,100),optionIds=electiveIds(r.optionIds,100);
  if(opensAt>=closesAt||optionIds.length<maxChoices)electiveFail('elective_round_rule');
  return {id:electiveUuid(r.id),blockId:electiveUuid(r.blockId),blockRevision:revision(r.blockRevision),revision:revision(r.revision),offeringRevision:revision(r.offeringRevision),policyRevision:revision(r.policyRevision),guardianConfirmation:electiveBoolean(r.guardianConfirmation),opensAt,closesAt,status:electiveEnum(r.status,['open','closed']),minChoices,maxChoices,optionIds,pupilIds:nullable(r.pupilIds,electiveIds)};
}
export function parseElectiveChoice(value:unknown):ElectiveChoice{const r=electiveShape(value,['id','roundId','pupilId','offeringRevision','revision','selectedOptionIds','submittedAt','confirmedAt','state']);return {id:electiveUuid(r.id),roundId:electiveUuid(r.roundId),pupilId:electiveUuid(r.pupilId),offeringRevision:revision(r.offeringRevision),revision:revision(r.revision),selectedOptionIds:electiveIds(r.selectedOptionIds,100),submittedAt:electiveInstant(r.submittedAt),confirmedAt:nullable(r.confirmedAt,electiveInstant),state:electiveEnum(r.state,ELECTIVE_CHOICE_STATES)};}
export function parseElectiveGuardianConfirmation(value:unknown):ElectiveGuardianConfirmation{const r=electiveShape(value,['id','bindingId','bindingRevision','choiceId','choiceRevision','offeringRevision','decision','decidedAt']);return {id:electiveUuid(r.id),bindingId:electiveUuid(r.bindingId),bindingRevision:revision(r.bindingRevision),choiceId:electiveUuid(r.choiceId),choiceRevision:revision(r.choiceRevision),offeringRevision:revision(r.offeringRevision),decision:electiveEnum(r.decision,['approve','decline']),decidedAt:electiveInstant(r.decidedAt)};}
export function parseElectivePlacement(value:unknown):ElectivePlacement{const r=electiveShape(value,['id','groupId','pupilId','choiceId','choiceRevision','startsOn','endsOn','revision']);const startsOn=electiveDate(r.startsOn),endsOn=nullable(r.endsOn,electiveDate);period(startsOn,endsOn);return {id:electiveUuid(r.id),groupId:electiveUuid(r.groupId),pupilId:electiveUuid(r.pupilId),choiceId:electiveUuid(r.choiceId),choiceRevision:revision(r.choiceRevision),startsOn,endsOn,revision:revision(r.revision)};}
export function parseElectiveRead(value:unknown,expected:ElectiveScope):ElectiveRead{
  const r=electiveShape(value,['contractVersion','unitId','schoolYear','schoolName','revision','canManage','canReadPupils','policy','sources','blocks','pupils','rounds','choices','placements']),scope=scopeFields(r);sameScope(scope,expected);
  if(r.contractVersion!==ELECTIVE_CONTRACT_VERSION)electiveFail('elective_contract_version');
  const canReadPupils=electiveBoolean(r.canReadPupils),policy=parseElectivePolicy(r.policy),sources=unique(electiveArray(r.sources,parseElectiveSource),s=>s.sourceKey),blocks=unique(electiveArray(r.blocks,parseElectiveBlock,250),b=>b.id),rounds=unique(electiveArray(r.rounds,parseElectiveRound,500),r=>r.id);
  if(policy.unitId!==scope.unitId)electiveFail('elective_scope');for(const source of [...sources,...blocks.flatMap(b=>b.sourceRefs)])sameScope(source,scope);
  const pupils=nullable(r.pupils,v=>unique(electiveArray(v,x=>{const p=electiveShape(x,['id','name','classIds']);return {id:electiveUuid(p.id),name:electiveText(p.name),classIds:electiveIds(p.classIds)};},10000),p=>p.id)),choices=nullable(r.choices,v=>unique(electiveArray(v,parseElectiveChoice,10000),c=>c.id)),placements=nullable(r.placements,v=>unique(electiveArray(v,parseElectivePlacement,20000),p=>p.id));
  if(!canReadPupils&&(pupils!==null||choices!==null||placements!==null||rounds.some(x=>x.pupilIds!==null)||blocks.some(b=>b.groups.some(g=>g.memberCount!==null))))electiveFail('elective_pupil_scope');
  if(canReadPupils&&(pupils===null||choices===null||placements===null))electiveFail('elective_pupil_scope');
  return {contractVersion:ELECTIVE_CONTRACT_VERSION,...scope,schoolName:electiveText(r.schoolName),revision:revision(r.revision),canManage:electiveBoolean(r.canManage),canReadPupils,policy,sources,blocks,pupils,rounds,choices,placements};
}
export function parseElectiveCommand(value:unknown):ElectiveCommand{
  const r=electiveShape(value,['commandId','unitId','schoolYear','expectedRevision','action','payload']),scope=scopeFields(r),base={...scope,commandId:electiveUuid(r.commandId),expectedRevision:revision(r.expectedRevision)},action=electiveEnum(r.action,ELECTIVE_ACTIONS);
  switch(action){
    case 'save_block':{const p=electiveShape(r.payload,['expectedBlockRevision','block']),block=parseElectiveBlockDraft(p.block);for(const source of block.sourceRefs)sameScope(source,scope);return {...base,action,payload:{expectedBlockRevision:nullable(p.expectedBlockRevision,revision),block}};}
    case 'apply_groups':{const p=electiveShape(r.payload,['blockId','expectedBlockRevision']);return {...base,action,payload:{blockId:electiveUuid(p.blockId),expectedBlockRevision:revision(p.expectedBlockRevision)}};}
    case 'set_policy':{const p=electiveShape(r.payload,['guardianConfirmation']);return {...base,action,payload:{guardianConfirmation:electiveBoolean(p.guardianConfirmation)}};}
    case 'open_round':{const p=electiveShape(r.payload,['roundId','blockId','expectedBlockRevision','opensAt','closesAt','minChoices','maxChoices','pupilIds']),opensAt=electiveInstant(p.opensAt),closesAt=electiveInstant(p.closesAt),minChoices=electiveInteger(p.minChoices,1,100),maxChoices=electiveInteger(p.maxChoices,minChoices,100),pupilIds=electiveIds(p.pupilIds,10000);if(opensAt>=closesAt||!pupilIds.length)electiveFail('elective_round_rule');return {...base,action,payload:{roundId:electiveUuid(p.roundId),blockId:electiveUuid(p.blockId),expectedBlockRevision:revision(p.expectedBlockRevision),opensAt,closesAt,minChoices,maxChoices,pupilIds}};}
    case 'close_round':{const p=electiveShape(r.payload,['roundId','expectedRoundRevision']);return {...base,action,payload:{roundId:electiveUuid(p.roundId),expectedRoundRevision:revision(p.expectedRoundRevision)}};}
    case 'record_choice':{const p=electiveShape(r.payload,['roundId','pupilId','offeringRevision','expectedChoiceRevision','selectedOptionIds']);return {...base,action,payload:{roundId:electiveUuid(p.roundId),pupilId:electiveUuid(p.pupilId),offeringRevision:revision(p.offeringRevision),expectedChoiceRevision:nullable(p.expectedChoiceRevision,revision),selectedOptionIds:electiveIds(p.selectedOptionIds,100)}};}
    case 'confirm_choice':{const p=electiveShape(r.payload,['choiceId','expectedChoiceRevision']);return {...base,action,payload:{choiceId:electiveUuid(p.choiceId),expectedChoiceRevision:revision(p.expectedChoiceRevision)}};}
    case 'save_placement':{const p=electiveShape(r.payload,['placementId','choiceId','expectedChoiceRevision','groupId','startsOn','endsOn','previousPlacementId']),startsOn=electiveDate(p.startsOn),endsOn=nullable(p.endsOn,electiveDate);period(startsOn,endsOn);return {...base,action,payload:{placementId:electiveUuid(p.placementId),choiceId:electiveUuid(p.choiceId),expectedChoiceRevision:revision(p.expectedChoiceRevision),groupId:electiveUuid(p.groupId),startsOn,endsOn,previousPlacementId:nullable(p.previousPlacementId,electiveUuid)}};}
    case 'end_placement':{const p=electiveShape(r.payload,['placementId','expectedPlacementRevision','endsOn']);return {...base,action,payload:{placementId:electiveUuid(p.placementId),expectedPlacementRevision:revision(p.expectedPlacementRevision),endsOn:electiveDate(p.endsOn)}};}
  }
}
export function parseElectiveCommandRef(value:unknown):ElectiveCommandRef{
  const r=electiveShape(value,['unitId','schoolYear','commandId','action','payloadHash']),scope=scopeFields(r);
  if(typeof r.payloadHash!=='string'||!/^[a-f0-9]{64}$/u.test(r.payloadHash))electiveFail('elective_payload_hash');
  return {...scope,commandId:electiveUuid(r.commandId),action:electiveEnum(r.action,ELECTIVE_ACTIONS),payloadHash:r.payloadHash};
}
export async function createElectiveCommandRef(value:ElectiveCommand):Promise<ElectiveCommandRef>{
  const command=parseElectiveCommand(value);
  return {...scopeFields(command),commandId:command.commandId,action:command.action,payloadHash:await electiveHash(command)};
}
export function parseElectiveReceipt(value:unknown,expected:ElectiveCommandRef):ElectiveReceipt{
  const r=electiveShape(value,['unitId','schoolYear','commandId','action','payloadHash','revision','objectId','objectRevision','replayed']),scope=scopeFields(r);sameScope(scope,expected);
  const ref=parseElectiveCommandRef({unitId:scope.unitId,schoolYear:scope.schoolYear,commandId:r.commandId,action:r.action,payloadHash:r.payloadHash});
  if(ref.commandId!==expected.commandId||ref.action!==expected.action||ref.payloadHash!==expected.payloadHash)electiveFail('elective_receipt_mismatch');
  return {...ref,revision:revision(r.revision),objectId:nullable(r.objectId,electiveUuid),objectRevision:revision(r.objectRevision),replayed:electiveBoolean(r.replayed)};
}
export function parseElectiveStatusReply(value:unknown,expected:ElectiveCommandRef):ElectiveStatusReply{
  const r=electiveShape(value,['unitId','schoolYear','commandId','status','receipt']),scope=scopeFields(r);sameScope(scope,expected);const commandId=electiveUuid(r.commandId);if(commandId!==expected.commandId)electiveFail('elective_receipt_mismatch');
  if(r.status==='not_found'){if(r.receipt!==null)electiveFail();return {...scope,commandId,status:'not_found',receipt:null};}
  if(r.status!=='found')electiveFail();const receipt=parseElectiveReceipt(r.receipt,expected);if(!receipt.replayed)electiveFail();return {...scope,commandId,status:'found',receipt:{...receipt,replayed:true}};
}
export function electiveGroupSourceKey(groupId:string,schoolYear:number):string{return `teaching_group:${electiveUuid(groupId)}:${electiveInteger(schoolYear,1900,9998)}`;}
export function canonicalElectiveJson(value:unknown):string{
  if(value===null||typeof value==='boolean'||typeof value==='string'||typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return `[${value.map(canonicalElectiveJson).join(',')}]`;
  if(value&&typeof value==='object'){const r=value as Record<string,unknown>;return `{${Object.keys(r).sort().map(k=>`${JSON.stringify(k)}:${canonicalElectiveJson(r[k])}`).join(',')}}`;}
  return electiveFail();
}
export async function electiveHash(value:unknown):Promise<string>{return (await tjanstHashCanonical(value)).slice('sha256:'.length);}
