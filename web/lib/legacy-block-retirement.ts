import type { ElectiveBlock, ElectiveCommand, ElectiveRead } from './elective-block-contract.ts';
import type { TjanstYearPlanRead } from './tjanst-contract.ts';

type LegacyPlan = Pick<TjanstYearPlanRead, 'rows'>;
export type LegacyStep =
  | { kind: 'delete_row'; rowId: string }
  | { kind: 'elective'; action: ElectiveCommand['action']; payload: ElectiveCommand['payload'] };
export type LegacyStop = 'joint_row' | 'placement_today';
export type LegacyBlock = { block: ElectiveBlock; rowIds: string[]; jointRows: number; openRounds: number; placements: number };

function dayBefore(date: string): string {
  const day = new Date(`${date}T00:00:00Z`); day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}
function livePlacements(read: ElectiveRead, block: ElectiveBlock, today: string) {
  const groups = new Set(block.groups.map(g => g.id));
  return (read.placements ?? []).filter(p => groups.has(p.groupId) && (p.endsOn === null || p.endsOn >= today));
}
/** Blocks that still hold live groups. A block with no group left no longer counts as a need. */
export function legacyBlocks(read: ElectiveRead, plan: LegacyPlan, today: string): LegacyBlock[] {
  return read.blocks.filter(b => b.groups.length > 0).map(block => {
    const groups = new Set(block.groups.map(g => g.id));
    const rows = plan.rows.filter(r => r.sourceKind === 'teaching_group' && groups.has(r.groupId));
    return { block, rowIds: rows.map(r => r.id), jointRows: rows.filter(r => r.jointGroupId).length,
      openRounds: read.rounds.filter(r => r.blockId === block.id && r.status === 'open').length,
      placements: livePlacements(read, block, today).length };
  });
}
/**
 * The next command for a block, derived only from current reads. Row IDs change when a draft is created and a lost
 * answer leaves the outcome unknown, so every step is planned afresh from what is left.
 */
export function nextLegacyStep(read: ElectiveRead, plan: LegacyPlan, blockId: string, today: string): LegacyStep | { stop: LegacyStop } | null {
  const legacy = legacyBlocks(read, plan, today).find(b => b.block.id === blockId);
  if (!legacy) return null;
  if (legacy.jointRows) return { stop: 'joint_row' };
  if (legacy.rowIds.length) return { kind: 'delete_row', rowId: legacy.rowIds[0] };
  const round = read.rounds.find(r => r.blockId === blockId && r.status === 'open');
  if (round) return { kind: 'elective', action: 'close_round', payload: { roundId: round.id, expectedRoundRevision: round.revision } };
  const placement = livePlacements(read, legacy.block, today)[0];
  if (placement) {
    // A placement counts through its last day, so it must end yesterday. A future one is withdrawn by ending the day before it starts.
    if (placement.startsOn === today) return { stop: 'placement_today' };
    const endsOn = dayBefore(placement.startsOn > today ? placement.startsOn : today);
    return { kind: 'elective', action: 'end_placement', payload: { placementId: placement.id, expectedPlacementRevision: placement.revision, endsOn } };
  }
  return { kind: 'elective', action: 'retire_group', payload: { groupId: legacy.block.groups[0].id, expectedBlockRevision: legacy.block.revision } };
}
