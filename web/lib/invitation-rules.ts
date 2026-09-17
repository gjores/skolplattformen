export const INVITABLE_FUNCTIONS = ['kundadmin', 'granskare'] as const;

export type Grant = { function: (typeof INVITABLE_FUNCTIONS)[number] };

export type InvitationRedeemability =
  | 'ok'
  | 'expired'
  | 'used'
  | 'issuer_mismatch'
  | 'subject_mismatch';

export function newInvitationToken(bytes: Uint8Array): string {
  if (bytes.byteLength !== 32) throw new Error('En inbjudningstoken måste bestå av exakt 32 bytes');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export async function tokenHashHex(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function invitationIsRedeemable(
  invitation: {
    expiresAt: Date;
    usedAt: Date | null;
    expectedIssuer: string;
    expectedSubject: string;
  },
  context: { now: Date; issuer: string; subject: string },
): InvitationRedeemability {
  if (invitation.usedAt !== null) return 'used';
  if (invitation.expiresAt.getTime() <= context.now.getTime()) return 'expired';
  if (invitation.expectedIssuer !== context.issuer) return 'issuer_mismatch';
  if (invitation.expectedSubject !== context.subject) return 'subject_mismatch';
  return 'ok';
}

export function parseGrants(spec: string): Grant[] {
  const values = spec.split(',').map((value) => value.trim()).filter(Boolean);
  if (
    values.length === 0 ||
    values.some((value) => !(INVITABLE_FUNCTIONS as readonly string[]).includes(value))
  ) {
    throw new Error('Inbjudan får bara ge kundadmin eller granskare');
  }
  if (new Set(values).size !== values.length) throw new Error('Varje behörighet får anges en gång');
  return values.map((value) => ({ function: value as Grant['function'] }));
}

export function ttlToExpiry(ttl: string, now: Date): Date {
  const match = /^(\d+)([smhd])$/u.exec(ttl);
  if (!match) throw new Error('Ogiltig giltighetstid; använd s, m, h eller d');
  const amount = Number(match[1]);
  const multiplier = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[
    match[2] as 's' | 'm' | 'h' | 'd'
  ];
  const duration = amount * multiplier;
  if (!Number.isSafeInteger(duration)) throw new Error('Ogiltig giltighetstid');
  if (duration > 30 * 86_400_000) throw new Error('Giltighetstiden får vara högst 30 dagar');
  return new Date(now.getTime() + duration);
}
