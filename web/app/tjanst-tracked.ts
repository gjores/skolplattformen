import { api, ApiError } from '@/lib/server-client.ts';
import { parseStatusReply, TjanstContractError, type TjanstCommandRef } from '@/lib/tjanst-contract.ts';
import { loadTjanstJournal, persistTjanstJournal, removeTjanstJournal, TjanstJournalError, type TjanstJournal, type TjanstJournalScope } from '@/lib/tjanst-journal.ts';

/**
 * Spårad skrivning för Min tjänst och Personal (UI-SPEC Beteendekontrakt 6). Journalen sparas före anropet och innehåller
 * bara family, commandId, operation och mål. Uteblir svaret avgör statuskvittot med samma commandId; ingen automatisk ny skrivning.
 */
export type TrackedResult<R> = { ok: true; reply: R }
  | { ok: false; failure: 'explicit'; error: ApiError }
  | { ok: false; failure: 'pending' | 'journal' | 'session' | 'not_saved' | 'unknown' };
export const TRACKED_TEXT = {
  pending: 'Ett tidigare sparförsök behöver kontrolleras först. Hämta aktuellt läge.',
  journal: 'Ändringen kunde inte förberedas i den här fliken. Inget har skickats.',
  session: 'Inloggningen har upphört.',
  not_saved: 'Ändringen sparades inte. Dina uppgifter finns kvar i formuläret.',
  unknown: 'Det gick inte att avgöra om ändringen sparades. Hämta aktuellt läge innan du försöker igen.',
  checking: 'Svaret uteblev. Vi kontrollerar om ändringen sparades.',
} as const;

export async function trackedCommand<R extends { receipt: { commandId: string } }>(scope: TjanstJournalScope | null, ref: TjanstCommandRef, path: string, body: unknown,
  parse: (value: unknown) => R, hooks: { onChecking?: () => void; onSessionLost?: () => void } = {}): Promise<TrackedResult<R>> {
  if (!scope) return { ok: false, failure: 'journal' };
  let journal: TjanstJournal;
  try { journal = await persistTjanstJournal(window.sessionStorage, scope, ref); }
  catch (caught) { return { ok: false, failure: caught instanceof TjanstJournalError && caught.code === 'pending_journal_exists' ? 'pending' : 'journal' }; }
  const forget = async () => { try { await removeTjanstJournal(window.sessionStorage, journal); } catch { /* Journalen kontrolleras vid nästa visning. */ } };
  try {
    const reply = parse(await api.post(path, body));
    await forget();
    return { ok: true, reply };
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 401) { hooks.onSessionLost?.(); return { ok: false, failure: 'session' }; }
    if (caught instanceof ApiError && caught.hasExplicitCode) { await forget(); return { ok: false, failure: 'explicit', error: caught }; }
    hooks.onChecking?.();
    try {
      const status = parseStatusReply(await api.post(path.replace(/\/[a-z]+$/u, '/status'), { command: ref }), ref, parse);
      await forget();
      return status.state === 'completed' ? { ok: true, reply: status.result } : { ok: false, failure: 'not_saved' };
    } catch { return { ok: false, failure: 'unknown' }; }
  }
}

/** Efter omladdning: ett kvarlämnat försök för samma mål avgörs med status. null när inget försök finns. */
export async function recoverTracked(scope: TjanstJournalScope | null, template: TjanstCommandRef): Promise<null | 'completed' | 'not_completed' | 'unknown'> {
  if (!scope) return null;
  let journal: TjanstJournal | null;
  try { journal = await loadTjanstJournal(window.sessionStorage, scope, template); } catch { return null; }
  if (!journal) return null;
  try {
    const ref = journal.command;
    const status = parseStatusReply(await api.post(`/api/tjanst/${ref.family === 'self' ? 'egen' : ref.family}/status`, { command: ref }), ref, value => {
      const receipt = (value as { receipt?: { commandId?: unknown } } | null)?.receipt;
      if (!receipt || typeof receipt.commandId !== 'string') throw new TjanstContractError();
      return value as { receipt: { commandId: string } };
    });
    await removeTjanstJournal(window.sessionStorage, journal);
    return status.state === 'completed' ? 'completed' : 'not_completed';
  } catch { return 'unknown'; }
}
