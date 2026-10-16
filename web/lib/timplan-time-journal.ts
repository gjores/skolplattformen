import { aplHashCanonical } from './apl-plan.ts';
import { parseAplJournalScope, type AplJournalScope } from './apl-plan-journal.ts';
import { gymShape } from './gym-timplan.ts';
import { parseTimplanTimeCommand, type TimplanTimeCommand } from './timplan-time-command.ts';

/** Browser recovery data, never proof of authority. Every server call rechecks the current mandate. */
export type TimplanTimeJournalScope = AplJournalScope;
export type TimplanTimeJournal = { version: 1; scope: TimplanTimeJournalScope; request: TimplanTimeCommand; requestHash: string };
export type TimplanTimeJournalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export class TimplanTimeJournalError extends Error {
  readonly code: string;
  constructor(code: string) {
    super('Sparförsöket kunde inte kontrolleras. Behåll underlaget och läs sparstatus innan du försöker igen.');
    this.name = 'TimplanTimeJournalError'; this.code = code;
  }
}
function fail(code: string): never { throw new TimplanTimeJournalError(code); }
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(value)) fail('invalid_journal_hash');
  return value;
}
export async function timplanTimeJournalStorageKey(scope: TimplanTimeJournalScope): Promise<string> {
  return `timplan-time:${await aplHashCanonical(['timplan_time_journal_scope_v1', JSON.stringify(parseAplJournalScope(scope))])}`;
}
async function requestHash(scope: TimplanTimeJournalScope, request: TimplanTimeCommand): Promise<string> {
  // Preserve array order: semantic APL content hashing deliberately sorts arrays, but command replay must be exact.
  return aplHashCanonical(['timplan_time_journal_request_v1', JSON.stringify(scope), JSON.stringify(request)]);
}
export async function createTimplanTimeJournal(scopeValue: TimplanTimeJournalScope, requestValue: TimplanTimeCommand): Promise<TimplanTimeJournal> {
  const scope = parseAplJournalScope(scopeValue), request = parseTimplanTimeCommand(requestValue);
  if (scope.planId !== request.planId) fail('wrong_journal_scope');
  return { version: 1, scope, request, requestHash: await requestHash(scope, request) };
}
export async function parseTimplanTimeJournal(value: unknown, expectedScope: TimplanTimeJournalScope): Promise<TimplanTimeJournal> {
  const r = gymShape(value, ['version', 'scope', 'request', 'requestHash']);
  if (r.version !== 1) fail('invalid_journal_version');
  const scope = parseAplJournalScope(r.scope);
  if (JSON.stringify(scope) !== JSON.stringify(parseAplJournalScope(expectedScope))) fail('wrong_journal_scope');
  const journal = await createTimplanTimeJournal(scope, parseTimplanTimeCommand(r.request));
  if (journal.requestHash !== hash(r.requestHash)) fail('changed_journal_request');
  return journal;
}
function read(storage: TimplanTimeJournalStorage, key: string): string | null {
  try { return storage.getItem(key); } catch { return fail('journal_storage_unavailable'); }
}
async function decode(raw: string, scope: TimplanTimeJournalScope): Promise<TimplanTimeJournal> {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail('invalid_journal_json'); }
  return parseTimplanTimeJournal(value, scope);
}
/** Use sessionStorage so another tab cannot replace this tab's uncertain operation. Await before sending a mutation. */
export async function persistTimplanTimeJournal(storage: TimplanTimeJournalStorage, value: TimplanTimeJournal, scope: TimplanTimeJournalScope): Promise<TimplanTimeJournal> {
  const journal = await parseTimplanTimeJournal(value, scope), key = await timplanTimeJournalStorageKey(scope), previous = read(storage, key);
  if (previous !== null && (await decode(previous, scope)).requestHash !== journal.requestHash) fail('pending_journal_exists');
  // No asynchronous gap between the final comparison, write and read-back.
  if (read(storage, key) !== previous) fail('journal_changed');
  const encoded = JSON.stringify(journal);
  try { storage.setItem(key, encoded); } catch { return fail('journal_storage_unavailable'); }
  const persisted = read(storage, key);
  if (persisted !== encoded) fail('journal_not_persisted');
  return decode(persisted, scope);
}
export async function loadTimplanTimeJournal(storage: TimplanTimeJournalStorage, scope: TimplanTimeJournalScope): Promise<TimplanTimeJournal | null> {
  const raw = read(storage, await timplanTimeJournalStorageKey(scope));
  return raw === null ? null : decode(raw, scope);
}
/** Only the caller's exact completed/definitively resolved attempt may be removed. Never clear all storage. */
export async function removeTimplanTimeJournal(storage: TimplanTimeJournalStorage, expected: TimplanTimeJournal, scope: TimplanTimeJournalScope): Promise<void> {
  const journal = await parseTimplanTimeJournal(expected, scope), key = await timplanTimeJournalStorageKey(scope), raw = read(storage, key);
  if (raw === null) return;
  if ((await decode(raw, scope)).requestHash !== journal.requestHash || read(storage, key) !== raw) fail('journal_changed');
  try { storage.removeItem(key); } catch { return fail('journal_storage_unavailable'); }
  if (read(storage, key) !== null) fail('journal_not_removed');
}
