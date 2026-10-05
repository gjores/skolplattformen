import { epochChanged } from './access-rules.ts';

export type SessionMessage = { type: 'epoch'; epoch: number } | { type: 'logged-out' };
export type LockReason = 'context' | 'logged-out';

const NAME = 'skolplattform-session';
const FALLBACK_KEY = `${NAME}:control`;

const ERROR_TEXT: Record<string, string> = {
  no_session: 'Du är inte inloggad.',
  session_expired: 'Din session har gått ut. Logga in igen.',
  session_revoked: 'Din session har avslutats. Logga in igen.',
  no_context: 'Välj ett uppdrag för att fortsätta.',
  membership_blocked: 'Medlemskapet är spärrat.',
  customer_closed: 'Kunden är stängd.',
  mfa_required: 'Åtgärden kräver verifiering med engångskod.',
  forbidden: 'Du saknar behörighet för åtgärden.',
  assignment_expired: 'Uppdragets giltighetstid har gått ut.',
  assignment_ended: 'Uppdraget är avslutat.',
  assignment_upcoming: 'Uppdraget har inte börjat gälla ännu.',
  invitation_invalid: 'Inbjudan är inte giltig.',
  conflict: 'Uppgiften har ändrats. Ladda om och försök igen.',
  context_changed: 'Arbetskontexten har ändrats. Ladda om sidan.',
  registry_unavailable: 'Skolenhetsregistret svarar inte just nu.',
  db_unreachable: 'Tjänsten kan inte nå databasen just nu.',
  csrf: 'Begäran kunde inte verifieras. Ladda om sidan och försök igen.',
  idp_registration_failed: 'Identitetsregistreringen kunde inte slutföras.',
  login_state_invalid: 'Inloggningen kunde inte slutföras. Försök igen.',
  not_found: 'Objektet finns inte eller är inte tillgängligt i din kontext.',
  bad_request: 'Uppgifterna kunde inte behandlas. Kontrollera formuläret.',
  audit_unavailable: 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.',
  programplan_locked: 'Planen har startat eller arkiverats och kan inte längre ändras. Listan har lästs om.',
  programplan_in_use: 'Utbildningen används av klasser, elevplaceringar, timplaner eller tillstånd och kan inte tas bort.',
  programplan_unit_packages_in_use: 'Skolan har tidigare sparat utbud kopplat till planen. Kopplingen bevaras och skolan kan därför inte tas bort här.',
  programplan_block_packages_in_use: 'Blocket används av tidigare sparat utbud. Uppgifterna bevaras och blockets poäng kan därför inte ändras eller blocket tas bort här.',
  programplan_start_passed: 'Utbildningen har redan startat. En ny plan kan bara skapas för en kull som inte har börjat.',
};

function isSessionMessage(value: unknown): value is SessionMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; epoch?: unknown };
  if (candidate.type === 'logged-out') return true;
  return (
    candidate.type === 'epoch' &&
    typeof candidate.epoch === 'number' &&
    Number.isSafeInteger(candidate.epoch) &&
    candidate.epoch >= 0
  );
}

export function shouldLock(
  state: { knownEpoch: number | null },
  message: unknown,
): { lock: boolean; reason?: LockReason } {
  if (!isSessionMessage(message)) return { lock: false };
  if (message.type === 'logged-out') return { lock: true, reason: 'logged-out' };
  if (state.knownEpoch !== null && epochChanged(state.knownEpoch, message.epoch)) {
    return { lock: true, reason: 'context' };
  }
  return { lock: false };
}

export function reduceEpochHeader(
  knownEpoch: number | null,
  header: string | null,
): { changed: boolean; epoch: number | null } {
  if (header === null || !/^\d+$/u.test(header)) return { changed: false, epoch: knownEpoch };
  const epoch = Number(header);
  if (!Number.isSafeInteger(epoch) || epoch < 0) return { changed: false, epoch: knownEpoch };
  return { changed: epochChanged(knownEpoch, epoch), epoch };
}

export function messageText(code: string): string {
  return ERROR_TEXT[code] ?? `Något gick fel (kod: ${code}).`;
}

export function announce(message: SessionMessage): void {
  if (typeof window === 'undefined') return;
  const BroadcastChannelCtor = (window as unknown as { BroadcastChannel?: typeof BroadcastChannel })
    .BroadcastChannel;
  if (BroadcastChannelCtor) {
    const channel = new BroadcastChannelCtor(NAME);
    channel.postMessage(message);
    channel.close();
    return;
  }
  // Endast kontrollmetadata lagras och posten tas bort direkt efter storage-signalen.
  window.localStorage.setItem(FALLBACK_KEY, JSON.stringify({ message, nonce: Date.now() }));
  window.localStorage.removeItem(FALLBACK_KEY);
}

export function onSessionMessage(handler: (message: unknown) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const BroadcastChannelCtor = (window as unknown as { BroadcastChannel?: typeof BroadcastChannel })
    .BroadcastChannel;
  if (BroadcastChannelCtor) {
    const channel = new BroadcastChannelCtor(NAME);
    channel.addEventListener('message', (event) => handler(event.data));
    return () => channel.close();
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key !== FALLBACK_KEY || event.newValue === null) return;
    try {
      const parsed = JSON.parse(event.newValue) as { message?: unknown };
      handler(parsed.message);
    } catch {
      // Felaktiga kontrollsignaler ska inte påverka sessionen.
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
