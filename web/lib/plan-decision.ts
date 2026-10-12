import { gymShape, gymUuid, gymInteger, gymArray } from './gym-timplan.ts';
export type PlanDecisionKind = 'programplan' | 'timplan';
export type PlanDecisionAction = 'submit' | 'return' | 'approve' | 'withdraw';
export type PlanDecisionStage = 'draft' | 'submitted' | 'returned' | 'approved' | 'replaced';
export type PlanDecisionItem = { kind: PlanDecisionKind; planId: string; offeringId: string; unitId: string | null; educationName: string; schoolName: string | null; version: number; stage: PlanDecisionStage; nextActor: 'huvudman' | 'rektor' | null; task: 'prepare' | 'review' | 'revise' | 'waiting' | 'blocked' };
export type PlanDecisionInbox = { items: PlanDecisionItem[]; actionCount: number; decisionCount: number; total: number; truncated: boolean };
export type PlanDecisionDetail = Omit<PlanDecisionItem, 'task'> & { revision: number; decisionRevision: number; basisHash: string; actions: PlanDecisionAction[]; blockers: string[]; checks: { id: string; label: string }[]; history: { action: PlanDecisionAction; at: string; actorName: string; comment: string }[]; sourceInfo: string | null };
export type PlanDecisionRead = { kind: PlanDecisionKind; planId: string };
export type PlanDecisionCommand = PlanDecisionRead & { commandId: string; action: PlanDecisionAction; expectedRevision: number; expectedDecisionRevision: number; basisHash: string; comment: string; confirmedChecks: string[] };
const kinds = ['programplan', 'timplan'] as const, actions = ['submit', 'return', 'approve', 'withdraw'] as const, stages = ['draft', 'submitted', 'returned', 'approved', 'replaced'] as const;
function bad(): never { throw new TypeError('Beslutsunderlaget kunde inte kontrolleras.'); }
function choice<T extends string>(value: unknown, values: readonly T[]): T { if (typeof value !== 'string' || !values.includes(value as T)) bad(); return value as T; }
function text(value: unknown, max = 1000): string {
 if (typeof value !== 'string' || value.length > max) bad();
 for (const c of value) { const code = c.charCodeAt(0); if (code <= 8 || code === 11 || code === 12 || code >= 14 && code <= 31 || code === 127) bad(); }
 return value;
}
function hash(value: unknown): string { if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) bad(); return value; }
function unique<T>(values: T[], key: (v: T) => string = String): T[] { if (new Set(values.map(key)).size !== values.length) bad(); return values; }
function base(r: Record<string, unknown>): Omit<PlanDecisionItem, 'task'> {
 const kind = choice(r.kind, kinds), unitId = r.unitId === null ? null : gymUuid(r.unitId), schoolName = r.schoolName === null ? null : text(r.schoolName);
 if ((kind === 'timplan' && (unitId === null || schoolName === null)) || kind === 'programplan' && unitId !== null) bad();
 return { kind, planId: gymUuid(r.planId), offeringId: gymUuid(r.offeringId), unitId, educationName: text(r.educationName), schoolName, version: gymInteger(r.version, 2147483647, 1), stage: choice(r.stage, stages), nextActor: r.nextActor === null ? null : choice(r.nextActor, ['huvudman','rektor'] as const) };
}
export function parsePlanDecisionRead(value: unknown): PlanDecisionRead { const r = gymShape(value, ['kind','planId']); return { kind: choice(r.kind, kinds), planId: gymUuid(r.planId) }; }
export function parsePlanDecisionCommand(value: unknown): PlanDecisionCommand {
 const r = gymShape(value, ['kind','planId','commandId','action','expectedRevision','expectedDecisionRevision','basisHash','comment','confirmedChecks']);
 const action = choice(r.action, actions), comment = text(r.comment, 2000).trim();
 if (action === 'return' && !comment) bad();
 const confirmedChecks = unique(gymArray(r.confirmedChecks, 20).map(v => { const id = text(v, 80); if (!/^[a-z][a-z0-9-]*$/u.test(id)) bad(); return id; }));
 return { kind: choice(r.kind, kinds), planId: gymUuid(r.planId), commandId: gymUuid(r.commandId), action, expectedRevision: gymInteger(r.expectedRevision), expectedDecisionRevision: gymInteger(r.expectedDecisionRevision), basisHash: hash(r.basisHash), comment, confirmedChecks };
}
export function parsePlanDecisionDetail(value: unknown, expected: PlanDecisionRead): PlanDecisionDetail {
 const r = gymShape(value, ['kind','planId','offeringId','unitId','educationName','schoolName','version','stage','nextActor','revision','decisionRevision','basisHash','actions','blockers','checks','history','sourceInfo']);
 const item = base(r); if (item.kind !== expected.kind || item.planId !== expected.planId) bad();
 const available = unique(gymArray(r.actions, 4).map(v => choice(v, actions)));
 if (['approved','replaced'].includes(item.stage) && available.length) bad();
 const history = gymArray(r.history, 1000).map(v => { const e = gymShape(v, ['action','at','actorName','comment']); const at = text(e.at, 50); if (!Number.isFinite(Date.parse(at))) bad(); return { action: choice(e.action, actions), at, actorName: text(e.actorName), comment: text(e.comment, 2000) }; });
 return { ...item, revision: gymInteger(r.revision), decisionRevision: gymInteger(r.decisionRevision), basisHash: hash(r.basisHash), actions: available,
  blockers: unique(gymArray(r.blockers, 100).map(v => text(v, 2000))), checks: unique(gymArray(r.checks, 20).map(v => { const c = gymShape(v, ['id','label']); return { id: text(c.id, 80), label: text(c.label, 2000) }; }), c => c.id), history, sourceInfo: r.sourceInfo === null ? null : text(r.sourceInfo, 2000) };
}
export function parsePlanDecisionInbox(value: unknown): PlanDecisionInbox {
 const r = gymShape(value, ['items','actionCount','decisionCount','total','truncated']);
 const items = unique(gymArray(r.items, 500).map(v => { const row = gymShape(v, ['kind','planId','offeringId','unitId','educationName','schoolName','version','stage','nextActor','task']); return { ...base(row), task: choice(row.task, ['prepare','review','revise','waiting','blocked']) }; }), row => `${row.kind}:${row.planId}`);
 const total = gymInteger(r.total), actionCount = gymInteger(r.actionCount, total), decisionCount = gymInteger(r.decisionCount, actionCount);
 if (typeof r.truncated !== 'boolean' || items.length !== Math.min(total,500) || r.truncated !== (total > 500)) bad();
 if (!r.truncated && (actionCount !== items.filter(i => ['prepare','review','revise'].includes(i.task)).length || decisionCount !== items.filter(i => i.task === 'review').length)) bad();
 return { items, actionCount, decisionCount, total, truncated: r.truncated };
}

export type PlanDecisionQuery = { query: string; kind: PlanDecisionKind | 'all'; stage: 'all' | 'draft' | 'submitted' | 'returned'; tasks: 'all' | 'mine' | 'waiting'; page: number };
export type PlanDecisionPage = { selection: PlanDecisionQuery; items: PlanDecisionItem[]; actionCount: number; decisionCount: number; total: number; count: number; pageSize: 50 };
export const defaultPlanDecisionQuery = (): PlanDecisionQuery => ({ query: '', kind: 'all', stage: 'all', tasks: 'all', page: 1 });
export function parsePlanDecisionQuery(value: unknown): PlanDecisionQuery {
 const r = gymShape(value, ['query','kind','stage','tasks','page']), query = text(r.query, 200);
 if (query !== query.trim()) bad();
 return { query, kind: choice(r.kind, ['all',...kinds]), stage: choice(r.stage, ['all','draft','submitted','returned']), tasks: choice(r.tasks, ['all','mine','waiting']), page: gymInteger(r.page, 100000, 1) };
}
export function parsePlanDecisionPage(value: unknown, expected: PlanDecisionQuery): PlanDecisionPage {
 const r = gymShape(value, ['selection','items','actionCount','decisionCount','total','count','pageSize']);
 const selection = parsePlanDecisionQuery(r.selection);
 if (JSON.stringify(selection) !== JSON.stringify(parsePlanDecisionQuery(expected)) || r.pageSize !== 50) bad();
 const items = unique(gymArray(r.items, 50).map(v => {
  const row = gymShape(v, ['kind','planId','offeringId','unitId','educationName','schoolName','version','stage','nextActor','task']);
  return { ...base(row), task: choice(row.task, ['prepare','review','revise','waiting','blocked']) };
 }), row => `${row.kind}:${row.planId}`);
 const total = gymInteger(r.total), actionCount = gymInteger(r.actionCount, total), decisionCount = gymInteger(r.decisionCount, actionCount), count = gymInteger(r.count, total);
 if (items.length !== Math.min(50, Math.max(0, count - (selection.page - 1) * 50))) bad();
 for (const item of items) {
  const mine = ['prepare','review','revise'].includes(item.task);
  if (selection.kind !== 'all' && item.kind !== selection.kind || selection.stage !== 'all' && item.stage !== selection.stage
   || selection.tasks === 'mine' && !mine || selection.tasks === 'waiting' && mine) bad();
 }
 return { selection, items, actionCount, decisionCount, total, count, pageSize: 50 };
}
