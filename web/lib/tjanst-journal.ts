import { parseCommandRef, tjanstHashCanonical, type TjanstCommandRef, type TjanstStatusReply } from './tjanst-contract.ts';

/**
 * Minimal browser reference for an uncertain write (UI-SPEC §Beteendekontrakt 6): family, commandId, action and target only.
 * Never comment text, names, minutes or payload. Recovery reads status and the current state; it never resends automatically.
 */
export type TjanstJournalScope = { identityKey: string; assignmentId: string };
export type TjanstJournal = { version: 1; scope: TjanstJournalScope; command: TjanstCommandRef };
export type TjanstJournalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type TjanstRecovery = { state: 'completed' | 'not_completed'; journal: TjanstJournal; reloadRequired: true };

export class TjanstJournalError extends Error {
  readonly code: string;
  constructor(code: string) {
    super('Sparförsöket kunde inte kontrolleras. Läs sparstatus och läs om fördelningen innan du försöker igen.');
    this.name = 'TjanstJournalError'; this.code = code;
  }
}
function fail(code: string): never { throw new TjanstJournalError(code); }
function parseScope(value: unknown): TjanstJournalScope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_journal_scope');
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== 2 || typeof r.identityKey !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(r.identityKey)
    || typeof r.assignmentId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(r.assignmentId)) fail('invalid_journal_scope');
  return { identityKey: r.identityKey, assignmentId: r.assignmentId };
}
function ref(value: unknown): TjanstCommandRef {
  try { return parseCommandRef(value); } catch { return fail('invalid_journal_command'); }
}
/** Stable through reload and MFA; derived from issuer and subject, never stored in clear. */
export function tjanstJournalIdentityKey(issuer: string, subject: string): Promise<string> {
  if (typeof issuer !== 'string' || typeof subject !== 'string' || !issuer || !subject || issuer.length > 4096 || subject.length > 4096) fail('invalid_journal_identity');
  return tjanstHashCanonical(['tjanst_journal_identity_v1', issuer, subject]);
}
/** One key per actor and target, so a pending write blocks a second write to the same target in this tab. */
export async function tjanstJournalKey(scopeValue: TjanstJournalScope, command: TjanstCommandRef): Promise<string> {
  const scope = parseScope(scopeValue), c = ref(command), t = c.target;
  return `tjanst:${await tjanstHashCanonical(['tjanst_journal_scope_v1', scope.identityKey, scope.assignmentId, c.family, t.unitId, t.schoolYear, t.versionId, t.personId])}`;
}
function read(storage: TjanstJournalStorage, key: string): string | null {
  try { return storage.getItem(key); } catch { return fail('journal_storage_unavailable'); }
}
function decode(raw: string, scope: TjanstJournalScope): TjanstJournal {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return fail('invalid_journal_json'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid_journal');
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== 3 || r.version !== 1) fail('invalid_journal_version');
  const parsed = parseScope(r.scope);
  if (parsed.identityKey !== scope.identityKey || parsed.assignmentId !== scope.assignmentId) fail('wrong_journal_scope');
  return { version: 1, scope: parsed, command: ref(r.command) };
}
const encode = (journal: TjanstJournal) => JSON.stringify({ version: 1, scope: journal.scope, command: journal.command });
/** Await before sending the mutation. Another pending command for the same target is never replaced. */
export async function persistTjanstJournal(storage: TjanstJournalStorage, scopeValue: TjanstJournalScope, command: TjanstCommandRef): Promise<TjanstJournal> {
  const scope = parseScope(scopeValue), journal: TjanstJournal = { version: 1, scope, command: ref(command) }, key = await tjanstJournalKey(scope, journal.command);
  const previous = read(storage, key);
  if (previous !== null && decode(previous, scope).command.commandId !== journal.command.commandId) fail('pending_journal_exists');
  const encoded = encode(journal);
  try { storage.setItem(key, encoded); } catch { return fail('journal_storage_unavailable'); }
  if (read(storage, key) !== encoded) fail('journal_not_persisted');
  return journal;
}
export async function loadTjanstJournal(storage: TjanstJournalStorage, scopeValue: TjanstJournalScope, target: TjanstCommandRef): Promise<TjanstJournal | null> {
  const scope = parseScope(scopeValue), raw = read(storage, await tjanstJournalKey(scope, target));
  return raw === null ? null : decode(raw, scope);
}
/** Removes only the caller's exact attempt; never clears other entries. */
export async function removeTjanstJournal(storage: TjanstJournalStorage, journal: TjanstJournal): Promise<void> {
  const key = await tjanstJournalKey(journal.scope, journal.command), raw = read(storage, key);
  if (raw === null) return;
  if (decode(raw, journal.scope).command.commandId !== journal.command.commandId) fail('journal_changed');
  try { storage.removeItem(key); } catch { return fail('journal_storage_unavailable'); }
  if (read(storage, key) !== null) fail('journal_not_removed');
}
/** Status decides; both outcomes require a fresh read. not_completed means the user decides whether to try again. */
export function recoverTjanstJournal<T>(journal: TjanstJournal, status: TjanstStatusReply<T>): TjanstRecovery {
  return { state: status.state === 'completed' ? 'completed' : 'not_completed', journal, reloadRequired: true };
}
