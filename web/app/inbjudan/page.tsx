'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FUNCTION_LABEL, type AccessFunction } from '@/lib/access-rules.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import { Button } from '@/components/ui/button';

const TOKEN_KEY = 'sp_invite';

type RedeemResponse = {
  customer: { id: string; name: string };
  assignments: { id: string; function: AccessFunction }[];
};

export default function InvitationPage() {
  const [token, setToken] = useState('');
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState<RedeemResponse | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);

  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    const fromLogin = window.sessionStorage.getItem(TOKEN_KEY) ?? '';
    window.sessionStorage.removeItem(TOKEN_KEY);
    const value = fromHash || fromLogin;
    queueMicrotask(() => setToken(value));
    if (fromHash) window.history.replaceState(null, '', '/inbjudan');
    void api.get('/api/session').then(() => setAuthenticated(true)).catch((error) => {
      setAuthenticated(!(error instanceof ApiError && error.status === 401));
    });
  }, []);

  function login(stepUp = false) {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    const path = stepUp
      ? '/api/auth/login?step_up=1&till=/inbjudan'
      : '/api/auth/login?till=/inbjudan';
    window.location.assign(path);
  }

  async function redeem() {
    setBusy(true);
    setMessage(null);
    setNeedsMfa(false);
    try {
      const result = await api.post<RedeemResponse>('/api/inbjudan/losen', { token });
      window.sessionStorage.removeItem(TOKEN_KEY);
      setRedeemed(result);
      setToken('');
    } catch (error) {
      if (error instanceof ApiError && error.code === 'mfa_required') {
        setMessage('Åtgärden kräver verifiering med engångskod.');
        setNeedsMfa(true);
      } else if (error instanceof ApiError && (error.code === 'invitation_invalid' || error.status === 404)) {
        setMessage('Inbjudan är inte giltig.');
      } else if (error instanceof ApiError && error.status === 401) {
        setAuthenticated(false);
      } else {
        setMessage('Inbjudan kunde inte lösas in. Försök igen.');
      }
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    window.sessionStorage.removeItem(TOKEN_KEY);
    setToken('');
    window.location.assign('/');
  }

  if (redeemed) {
    const functions = redeemed.assignments.map((item) => FUNCTION_LABEL[item.function]).join(', ');
    return <main className="blocked-start"><h1>Inbjudan är inlöst</h1><p>Medlemskap skapat i {redeemed.customer.name}. Du har {functions}.</p><Link className="button" href="/">Till arbetsytan</Link></main>;
  }

  return (
    <main className="blocked-start">
      <h1>Lös in inbjudan</h1>
      {!token && <output role="alert">Inbjudan är inte giltig.</output>}
      {authenticated === null && <output>Kontrollerar inloggningen…</output>}
      {authenticated === false && <Button onClick={() => login(false)} disabled={!token}>Logga in först</Button>}
      {authenticated === true && <Button onClick={() => void redeem()} disabled={!token || busy}>{busy ? 'Löser in…' : 'Bekräfta inbjudan'}</Button>}
      {message && <output role="alert">{message}</output>}
      {needsMfa && <Button onClick={() => login(true)}>Verifiera med engångskod</Button>}
      <Button variant="ghost" onClick={cancel}>Avbryt</Button>
    </main>
  );
}
