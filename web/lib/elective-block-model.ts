import { electiveFail, electiveHash, parseElectiveSource, electiveDate, electiveIds, electiveInstant, electiveUuid,
  type ElectiveSource, type ElectiveNeedBasis, type ElectiveChoice, type ElectiveRound,
  type ElectiveRequiredGuardian, type ElectiveGuardianConfirmation, type ElectiveChoiceState } from './elective-block-contract.ts';

/** A shared group's lesson is counted once. Its sources must agree, not be summed. */
export function inheritElectiveTime(input: readonly ElectiveSource[]): { needHt: number; needVt: number; needBasis: ElectiveNeedBasis } {
  if (!input.length) electiveFail('elective_source_missing');
  const sources=input.map(parseElectiveSource),first=sources[0];
  if(sources.some(s=>s.unitId!==first.unitId||s.schoolYear!==first.schoolYear))electiveFail('elective_source_scope');
  if(sources.some(s=>s.needHt===null||s.needVt===null))electiveFail('elective_time_missing');
  if(sources.some(s=>s.needHt!==first.needHt||s.needVt!==first.needVt||s.needBasis!==first.needBasis))electiveFail('elective_time_conflict');
  return {needHt:first.needHt!,needVt:first.needVt!,needBasis:first.needBasis};
}
export function validateElectiveSelection(round:ElectiveRound,pupilId:string,selected:readonly string[],offeringRevision:number,now:string):string[]{
  const ids=electiveIds(selected,100),pupil=electiveUuid(pupilId),at=electiveInstant(now);
  if(round.status!=='open'||at<round.opensAt||at>round.closesAt)electiveFail('elective_round_closed');
  if(offeringRevision!==round.offeringRevision)electiveFail('elective_stale_offer');
  if(!round.pupilIds?.includes(pupil))electiveFail('elective_pupil_not_eligible');
  if(ids.length<round.minChoices||ids.length>round.maxChoices||ids.some(id=>!round.optionIds.includes(id)))electiveFail('elective_selection');
  return ids;
}
export type { ElectiveChoiceState } from './elective-block-contract.ts';
/** The route/SQL layer supplies only currently valid required bindings. No contact-list guess. */
export function electiveChoiceState(choice:ElectiveChoice,round:Omit<ElectiveRound,'guardianConfirmation'>&{guardianConfirmation:boolean|null},
  required:readonly ElectiveRequiredGuardian[],confirmations:readonly ElectiveGuardianConfirmation[]):ElectiveChoiceState{
  if(choice.roundId!==round.id||choice.offeringRevision!==round.offeringRevision)return 'stale_offer';
  if(round.guardianConfirmation===null)return 'policy_missing';
  if(round.guardianConfirmation){
    if(!required.length)return 'guardian_bindings_missing';
    if(new Set(required.map(b=>b.bindingId)).size!==required.length)electiveFail('elective_duplicate_binding');
    const current=required.map(binding=>confirmations.filter(c=>c.bindingId===binding.bindingId&&c.bindingRevision===binding.revision
      &&c.choiceId===choice.id&&c.choiceRevision===choice.revision&&c.offeringRevision===choice.offeringRevision));
    // A binding has one decision per revision; contradictory replies are invalid evidence.
    for(const values of current)if(values.length>1)electiveFail('elective_duplicate_confirmation');
    if(current.some(values=>values[0]?.decision==='decline'))return 'guardian_declined';
    if(current.some(values=>values[0]?.decision!=='approve'))return 'awaiting_guardian';
  }
  return choice.confirmedAt===null?'ready_for_confirmation':'confirmed';
}
export type ElectiveMemberPeriod={pupilId:string;startsOn:string;endsOn:string|null};
export async function electiveMembershipFingerprint(input:readonly ElectiveMemberPeriod[]):Promise<string>{
  const rows=input.map(row=>{const pupilId=electiveUuid(row.pupilId),startsOn=electiveDate(row.startsOn),endsOn=row.endsOn===null?null:electiveDate(row.endsOn);if(endsOn!==null&&endsOn<startsOn)electiveFail('elective_period');return {pupilId,startsOn,endsOn};})
    .sort((a,b)=>a.pupilId.localeCompare(b.pupilId)||a.startsOn.localeCompare(b.startsOn)||(a.endsOn??'').localeCompare(b.endsOn??''));
  if(new Set(rows.map(r=>`${r.pupilId}:${r.startsOn}:${r.endsOn}`)).size!==rows.length)electiveFail('elective_duplicate_membership');
  return electiveHash(rows);
}
