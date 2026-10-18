import { aplHashCanonical, parseAplCommand, parseAplReadReply, parseAplStatusReply,
  type AplCommand, type AplStatusReply } from './apl-plan.ts';
import { gymInteger, gymShape, gymUuid } from './gym-timplan.ts';

/** Browser recovery data, never proof of authority. Every server call rechecks the current mandate. */
export type AplJournalScope = { identityKey: string; customerId: string; membershipId: string; assignmentId: string;
  organizerId: string; unitId: string; planId: string; planVersion: number; accessFunction: 'rektor' | 'administrator' | 'huvudman' };
export type AplJournal = { version: 1; scope: AplJournalScope; request: AplCommand; requestHash: string };
export type AplJournalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type AplRecovery = { state: 'retry_exact' | 'needs_review' | 'completed_current' | 'completed_historical';
  journal: AplJournal; status: AplStatusReply; reloadRequired: boolean };

export class AplJournalError extends Error {
  readonly code: string;
  constructor(code: string) {
    super('Sparförsöket kunde inte kontrolleras. Behåll underlaget och läs sparstatus innan du försöker igen.');
    this.name = 'AplJournalError'; this.code = code;
  }
}
function fail(code: string): never { throw new AplJournalError(code); }
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) fail('invalid_journal_hash');
  return value;
}
export function parseAplJournalScope(value: unknown): AplJournalScope {
  const r = gymShape(value, ['identityKey', 'customerId', 'membershipId', 'assignmentId', 'organizerId', 'unitId', 'planId', 'planVersion', 'accessFunction']);
  if (r.accessFunction !== 'rektor' && r.accessFunction !== 'administrator' && r.accessFunction !== 'huvudman') fail('invalid_journal_role');
  return { identityKey: hash(r.identityKey), customerId: gymUuid(r.customerId), membershipId: gymUuid(r.membershipId),
    assignmentId: gymUuid(r.assignmentId), organizerId: gymUuid(r.organizerId), unitId: gymUuid(r.unitId),
    planId: gymUuid(r.planId), planVersion: gymInteger(r.planVersion, 2147483647, 1), accessFunction: r.accessFunction };
}
/** Stable through reload/MFA. No names, emails, raw subjects or session epochs are stored in the journal. */
export async function aplJournalIdentityKey(issuer: string, subject: string): Promise<string> {
  if (typeof issuer !== 'string' || typeof subject !== 'string' || !issuer || !subject || issuer.length > 4096 || subject.length > 4096)
    fail('invalid_journal_identity');
  return aplHashCanonical(['apl_journal_identity_v1', issuer, subject]);
}
export async function aplJournalStorageKey(scope: AplJournalScope): Promise<string> {
  return `apl-plan:${await aplHashCanonical(['apl_journal_scope_v1', JSON.stringify(parseAplJournalScope(scope))])}`;
}
async function requestHash(scope: AplJournalScope, request: AplCommand): Promise<string> {
  // Preserve array order: semantic APL content hashing deliberately sorts arrays, but command replay must be exact.
  return aplHashCanonical(['apl_journal_request_v1', JSON.stringify(scope), JSON.stringify(request)]);
}
export async function createAplJournal(scopeValue: AplJournalScope, requestValue: AplCommand): Promise<AplJournal> {
  const scope = parseAplJournalScope(scopeValue), request = parseAplCommand(requestValue);
  if (scope.planId !== request.planId || request.action === 'confirm' && scope.accessFunction !== 'rektor' || request.action === 'review' && scope.accessFunction !== 'huvudman' || request.action !== 'review' && scope.accessFunction === 'huvudman') fail('wrong_journal_scope');
  return { version: 1, scope, request, requestHash: await requestHash(scope, request) };
}
export async function parseAplJournal(value: unknown, expectedScope: AplJournalScope): Promise<AplJournal> {
  const r = gymShape(value, ['version', 'scope', 'request', 'requestHash']);
  if (r.version !== 1) fail('invalid_journal_version');
  const scope = parseAplJournalScope(r.scope);
  if (JSON.stringify(scope) !== JSON.stringify(parseAplJournalScope(expectedScope))) fail('wrong_journal_scope');
  const journal = await createAplJournal(scope, parseAplCommand(r.request));
  if (journal.requestHash !== hash(r.requestHash)) fail('changed_journal_request');
  return journal;
}
function read(storage: AplJournalStorage, key: string): string | null {
  try { return storage.getItem(key); } catch { return fail('journal_storage_unavailable'); }
}
async function decode(raw: string, scope: AplJournalScope): Promise<AplJournal> {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail('invalid_journal_json'); }
  return parseAplJournal(value, scope);
}
/** Use sessionStorage so another tab cannot replace this tab's uncertain operation. Await before sending a mutation. */
export async function persistAplJournal(storage: AplJournalStorage, value: AplJournal, scope: AplJournalScope): Promise<AplJournal> {
  const journal = await parseAplJournal(value, scope), key = await aplJournalStorageKey(scope), previous = read(storage, key);
  if (previous !== null && (await decode(previous, scope)).requestHash !== journal.requestHash) fail('pending_journal_exists');
  // No asynchronous gap between the final comparison, write and read-back.
  if (read(storage, key) !== previous) fail('journal_changed');
  const encoded = JSON.stringify(journal);
  try { storage.setItem(key, encoded); } catch { return fail('journal_storage_unavailable'); }
  const persisted = read(storage, key);
  if (persisted !== encoded) fail('journal_not_persisted');
  return decode(persisted, scope);
}
export async function loadAplJournal(storage: AplJournalStorage, scope: AplJournalScope): Promise<AplJournal | null> {
  const raw = read(storage, await aplJournalStorageKey(scope));
  return raw === null ? null : decode(raw, scope);
}
/** Only the caller's exact completed/definitively resolved attempt may be removed. Never clear all storage. */
export async function removeAplJournal(storage: AplJournalStorage, expected: AplJournal, scope: AplJournalScope): Promise<void> {
  const journal = await parseAplJournal(expected, scope), key = await aplJournalStorageKey(scope), raw = read(storage, key);
  if (raw === null) return;
  if ((await decode(raw, scope)).requestHash !== journal.requestHash || read(storage, key) !== raw) fail('journal_changed');
  try { storage.removeItem(key); } catch { return fail('journal_storage_unavailable'); }
  if (read(storage, key) !== null) fail('journal_not_removed');
}
/** A stored receipt is history, not a new editable snapshot. The caller always uses a fresh gym/APL read after completion. */
export async function recoverAplJournal(value: AplJournal, scopeValue: AplJournalScope, statusValue: unknown, liveValue: unknown): Promise<AplRecovery> {
  const scope = parseAplJournalScope(scopeValue), journal = await parseAplJournal(value, scope);
  const status = parseAplStatusReply(statusValue, { command: journal.request });
  const live = parseAplReadReply(liveValue, { planId: scope.planId });
  const details = status.state === 'completed' ? [live, status.result.detail] : [live];
  if (details.some(detail => detail.organizerId !== scope.organizerId || detail.confirmations.some(event => event.unitId !== scope.unitId)))
    fail('wrong_journal_scope');
  if (status.state === 'not_found') {
    const mayRetry = live.revisionScope === journal.request.revisionScope && live.revision === journal.request.expectedRevision
      && (journal.request.revisionScope !== 'apl' || live.timplanRevision === journal.request.expectedTimplanRevision)
      && (journal.request.action === 'review' ? live.capabilities.canReview && live.contentHash === journal.request.expectedContentHash
        : live.capabilities.canSave && (journal.request.action === 'save' || live.capabilities.canConfirm && live.contentHash === journal.request.expectedContentHash));
    return { state: mayRetry ? 'retry_exact' : 'needs_review', journal, status, reloadRequired: !mayRetry };
  }
  const receipt = status.result.receipt;
  if (live.revisionScope !== status.result.detail.revisionScope) return { state: 'completed_historical', journal, status, reloadRequired: true };
  if (live.revision < receipt.revision || live.revision === receipt.revision && live.contentHash !== receipt.contentHash)
    return { state: 'needs_review', journal, status, reloadRequired: true };
  return { state: live.revision === receipt.revision ? 'completed_current' : 'completed_historical', journal, status,
    reloadRequired: true };
}
