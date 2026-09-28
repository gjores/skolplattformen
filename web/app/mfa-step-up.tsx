'use client';

import { Button } from '@/components/ui/button';
import { leaveWithoutPrompt } from '@/lib/unsaved-changes.tsx';

/**
 * Verifiering med engångskod (step-up) när serverns MFA-bevis saknas eller är
 * äldre än 8 timmar. Åtgärden måste kunna nås där felet visas: en modal dialog
 * fångar fokus och gör sidan bakom oåtkomlig, så dialoger med mfa_required
 * visar denna ruta själva i stället för att hänvisa till arbetsytan.
 *
 * Servern prövar fortfarande beviset (utfärdare, klient, profil, amr och ålder);
 * knappen startar bara inloggningen hos identitetsleverantören.
 */
export function startStepUp(returnTo = '/'): void {
  // Endast en intern sökväg. Anroparen skickar bara ofarliga urvalsparametrar
  // (aldrig sökord, elev-ID eller personnummer); servern prövar returvägen igen.
  const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';
  // Användaren har själv valt att lämna sidan för verifiering. Formulärets
  // uppgifter sparas inte; texten i rutan säger det.
  leaveWithoutPrompt();
  window.location.assign(`/api/auth/login?step_up=1&till=${encodeURIComponent(safe)}`);
}

export default function MfaStepUpNotice({ message, detail, className, returnTo }: {
  message: string;
  detail?: string;
  className?: string;
  /** Återkomstadress efter verifieringen, t.ex. elevlistans urval. */
  returnTo?: string;
}) {
  return (
    <div role="alert" className={`validation-warning mfa-notice ${className ?? ''}`.trim()}>
      <span>{message}{detail ? <> {detail}</> : null}</span>
      <Button type="button" onClick={() => startStepUp(returnTo)}>Verifiera med engångskod</Button>
    </div>
  );
}
