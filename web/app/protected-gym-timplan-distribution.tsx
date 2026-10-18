'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { gymTimplanCanEdit, gymTimplanTotals, isGymTimplanV2, parseGymTimplan, type GymTimplan } from '@/lib/gym-timplan.ts';
import { gymTimplanGut, gymTimplanAplSuggestionRows, suggestGymTimplanHours, suggestGymTimplanTimeV2, type GymTimplanDistributionMode } from '@/lib/gym-timplan-distribution.ts';
import { parseAplReadReply, type AplPlan } from '@/lib/apl-plan.ts';
import { VOCATIONAL_GY25_CODES } from '@/lib/programplan-profile.ts';
import { timplanTimeTotals, formatTimplanMinutes } from '@/lib/timplan-time.ts';
import MfaStepUpNotice from './mfa-step-up';

type Props = { plan: GymTimplan; onClose: () => void; onSaved: (plan: GymTimplan) => void; onComplete: () => void; onSecurityFailure: (error: unknown) => boolean };
const totalHours = (plan: GymTimplan) => isGymTimplanV2(plan) ? timplanTimeTotals(plan).totalMinutes / 60 : gymTimplanTotals(plan).total;
const message = (error: unknown) => error instanceof Error ? error.message : 'Underlaget kunde inte läsas. Försök igen.';

/** A proposal is based on a fresh, jointly revision-checked plan and APL snapshot. Never retries a write. */
export default function ProtectedGymTimplanDistribution(props: Props) {
  const callbacks = useRef(props); useLayoutEffect(() => { callbacks.current = props; }, [props]);
  const [basis, setBasis] = useState<{ plan: GymTimplan; apl: AplPlan | null } | null>(null);
  const [includeApl, setIncludeApl] = useState(false), [aplTotal, setAplTotal] = useState('345'), [aplRows, setAplRows] = useState<string[]>([]);
  const [total, setTotal] = useState(''), [mode, setMode] = useState<GymTimplanDistributionMode>('fill-empty');
  const [busy, setBusy] = useState(true), [reviewing, setReviewing] = useState(false), [unread, setUnread] = useState(false), [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [mfa, setMfa] = useState(false);
  const active = useRef(true), operation = useRef(false), controller = useRef<AbortController | null>(null);
  async function read(signal: AbortSignal) {
    const plan = parseGymTimplan(await api.post('/api/timplaner/gym/lasa', { planId: callbacks.current.plan.id }, signal), callbacks.current.plan.id);
    let apl: AplPlan | null = null;
    if (!isGymTimplanV2(plan) && VOCATIONAL_GY25_CODES.some(code => code === plan.source.education.programCode)) {
      const reply = parseAplReadReply(await api.post('/api/timplaner/gym/apl/lasa', { planId: plan.id }, signal), { planId: plan.id });
      if ((reply.timplanRevision ?? reply.revision) !== plan.revision) throw new Error('Timplanen ändrades medan underlaget hämtades. Läs aktuell timplan igen.');
      apl = reply.plan;
    }
    return { plan, apl };
  }
  async function load(initial = false) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(null); setMfa(false); setReviewing(false);
    const c = new AbortController(); controller.current = c;
    try {
      const fresh = await read(c.signal); if (!active.current) return;
      setBasis(fresh); callbacks.current.onSaved(fresh.plan); setUnread(false); setUncertain(false);
      if (initial) {
        const existing = totalHours(fresh.plan), gut = gymTimplanGut(fresh.plan), choices = gymTimplanAplSuggestionRows(fresh.plan);
        setTotal(String(Math.ceil(Math.max(existing, gut?.hours ?? 0)) || ''));
        setIncludeApl(isGymTimplanV2(fresh.plan) && !!gut?.vocational && choices.length > 0);
        setAplRows(choices.map(row => row.key));
        setAplTotal(String(Math.max(345, isGymTimplanV2(fresh.plan) ? Math.ceil(timplanTimeTotals(fresh.plan).aplMinutes / 60) : 0)));
      }
      else setNotice('Aktuell timplan är hämtad. Kontrollera den sparade totalsumman och granska ett nytt förslag innan du sparar.');
    } catch (caught) { if (active.current && !callbacks.current.onSecurityFailure(caught)) { setError(message(caught)); setUnread(true); setMfa(caught instanceof ApiError && caught.code === 'mfa_required'); } }
    finally { operation.current = false; if (active.current) setBusy(false); }
  }
  useEffect(() => { active.current = true; queueMicrotask(() => { if (active.current) void load(true); }); return () => { active.current = false; controller.current?.abort(); }; }, []);
  const gut = basis ? gymTimplanGut(basis.plan) : null;
  let proposal: ReturnType<typeof suggestGymTimplanHours> | ReturnType<typeof suggestGymTimplanTimeV2> | null = null, proposalError: string | null = null;
  if (basis && !unread) {
    try {
      if (!/^\d+$/u.test(total)) throw new Error('Ange total undervisningstid i hela timmar.');
      if (includeApl && !/^\d+$/u.test(aplTotal)) throw new Error('Ange APL-totalen i hela timmar.');
      if (includeApl && Number(aplTotal) < 345) throw new Error('Ange minst 345 timmar APL.');
      if (includeApl && aplRows.length === 0) throw new Error('Välj minst ett ämne för APL-förslaget.');
      proposal = isGymTimplanV2(basis.plan) ? suggestGymTimplanTimeV2(basis.plan, Number(total), mode, includeApl ? { totalHours: Number(aplTotal), rowKeys: aplRows } : undefined) : suggestGymTimplanHours(basis.plan, Number(total), mode, basis.apl);
    } catch (caught) { proposalError = message(caught); }
  }
  const canSave = basis && gymTimplanCanEdit(basis.plan) && proposal && proposal.changedRows.length > 0 && !busy && !unread && !mfa;
  async function save() {
    if (operation.current || !canSave || !reviewing || !basis) return;
    operation.current = true; setBusy(true); setError(null); setNotice(null);
    const c = new AbortController(); controller.current = c;
    try {
      const expected = proposal!;
      const sameHours = (plan: GymTimplan) => {
        if ('timeRows' in expected) return isGymTimplanV2(plan) && Object.keys(plan.timeRows).length === Object.keys(expected.timeRows).length && Object.entries(expected.timeRows).every(([key, row]) => {
          const saved = plan.timeRows[key]; return saved && row.schoolMinutes.every((n, i) => saved.schoolMinutes[i] === n) && row.annualAplMinutes.every((n, i) => saved.annualAplMinutes[i] === n);
        });
        return !isGymTimplanV2(plan) && Object.keys(plan.hours).length === Object.keys(expected.hours).length && Object.entries(expected.hours).every(([key, values]) => plan.hours[key]?.every((value, i) => value === values[i]));
      };
      const reply = parseGymTimplan(await api.post('/api/timplaner/gym/fordela', { planId: basis.plan.id, expectedRevision: basis.plan.revision, totalHours: Number(total), mode, ...(isGymTimplanV2(basis.plan) ? {commandId: crypto.randomUUID(), ...(includeApl ? { apl: { totalHours: Number(aplTotal), rowKeys: aplRows } } : {})} : {}) }, c.signal), basis.plan.id);
      if (reply.revision !== basis.plan.revision + (isGymTimplanV2(basis.plan) ? 1 : expected.changedRows.length) || !sameHours(reply)) throw new Error('Sparsvaret stämmer inte med förslaget.');
      const fresh = await read(c.signal); if (!active.current) return;
      callbacks.current.onSaved(fresh.plan);
      if (fresh.plan.revision !== reply.revision || !sameHours(fresh.plan)) {
        setBasis(fresh); setReviewing(false); setNotice('Fördelningen sparades, men timplanen har ändrats igen. Aktuella timmar visas. Granska ett nytt förslag om du vill ändra dem.');
      } else callbacks.current.onComplete();
    } catch (caught) {
      if (!active.current || callbacks.current.onSecurityFailure(caught)) return;
      setReviewing(false);
      if (caught instanceof ApiError && caught.hasExplicitCode && caught.code === 'mfa_required') { setMfa(true); setError(caught.message); }
      else { setUnread(true); setUncertain(true); setError('Fördelningen kunde inte bekräftas. Läs aktuell timplan innan du gör ett nytt förslag. Ingen begäran skickas igen automatiskt.'); }
    } finally { operation.current = false; if (active.current) setBusy(false); }
  }
  const change = () => { setReviewing(false); setError(null); setNotice(null); };
  return <Dialog open onOpenChange={open => { if (!open && !busy && !uncertain) props.onClose(); }}><DialogContent className="gt-distribution-dialog" showCloseButton={!busy && !uncertain}>
    <DialogTitle>Autofördela undervisningstid</DialogTitle>
    <DialogDescription>Ange timmar för hela timplanen, alla tre årskurser. Förslaget följer programplanens poäng. APL ingår i totalen.</DialogDescription>
    {busy && <output>{reviewing ? 'Sparar fördelningen…' : 'Hämtar aktuellt underlag…'}</output>}
    {error && <p className="gt-distribution-warning" role="alert">{error}</p>}
    {notice && <output>{notice}</output>}
    {mfa && <MfaStepUpNotice message="Verifiera med engångskod innan du fördelar timmar." detail="Efter verifieringen öppnar du Autofördela timmar och granskar ett nytt förslag."/>}
    {basis && <>
      <p><strong>{basis.plan.series?.name ?? basis.plan.source.education.name}</strong> · {basis.plan.schoolName} · version {basis.plan.version}</p>
      <div className="gt-distribution-gut"><strong>Garanterad undervisningstid (GUT)</strong><p>{gut ? `Minst ${gut.hours.toLocaleString('sv-SE')} timmar för programmets kända Gy25-profil.` : 'GUT kan inte fastställas automatiskt för detta underlag. Kontrollera vilken miniminivå som gäller.'}</p>{!reviewing && <details><summary>Om GUT och förslaget</summary><p>En timme är 60 minuter. GUT är en miniminivå; skolan kan planera fler timmar. Poängfördelningen ger ett startförslag, ingen garanti för ämnenas behov eller faktiskt genomförd undervisning.</p><a href="https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/undervisningstid-larotider-och-schema" target="_blank" rel="noreferrer">Skolverkets information om undervisningstid</a></details>}</div>
      {!reviewing && <fieldset disabled={busy || unread || mfa} className="gt-distribution-fields"><legend>Välj total och fördelning</legend>
        <label className="gt-distribution-total">Total undervisningstid (timmar)<input inputMode="numeric" type="text" value={total} onChange={e => { change(); setTotal(e.target.value); }}/></label>
        <label><input type="radio" name="distribution-mode" value="fill-empty" checked={mode === 'fill-empty'} onChange={() => { change(); setMode('fill-empty'); }}/><span>Fyll bara tomma celler<small>{isGymTimplanV2(basis.plan) ? 'Behåller angivna skoltimmar, även noll. APL hanteras enligt valet nedan.' : 'Behåller alla angivna timmar, även noll.'}</small></span></label>
        <label><input type="radio" name="distribution-mode" value="replace" checked={mode === 'replace'} onChange={() => { change(); setMode('replace'); }}/><span>{isGymTimplanV2(basis.plan) ? 'Fördela om skoltimmarna' : 'Fördela om alla timmar'}<small>{isGymTimplanV2(basis.plan) ? 'Ersätter skoltimmarna. Befintlig APL-tid minskas inte.' : 'Ersätter befintliga timmar i hela planen.'}</small></span></label>
        {isGymTimplanV2(basis.plan) && <div className="gt-distribution-apl-options">
          <label><input type="checkbox" checked={includeApl} onChange={e => { change(); setIncludeApl(e.target.checked); }}/><span>Föreslå APL-timmar<small>Behåller befintlig APL och fördelar det som saknas till vald APL-total.</small></span></label>
          {includeApl && <>
            <label className="gt-distribution-total">APL totalt (timmar)<input type="text" inputMode="numeric" value={aplTotal} onChange={e => { change(); setAplTotal(e.target.value); }}/></label>
            <p>Minst 345 timmar i årsramen. APL ingår i den totala undervisningstiden. Perioder och veckor planeras senare.</p>
            <details><summary>Ämnen som får förslag på APL ({aplRows.length})</summary><p>Förvalet omfattar specificerade yrkesämnen. Anpassa urvalet till vad eleverna kan lära sig på arbetsplatsen. Poängen styr fördelningen mellan ämnen och årskurser.</p>
              {gymTimplanAplSuggestionRows(basis.plan).map(row => <label key={row.key}><input type="checkbox" checked={aplRows.includes(row.key)} onChange={e => { change(); setAplRows(current => e.target.checked ? [...current, row.key] : current.filter(key => key !== row.key)); }}/><span>{`APL i ${row.name} ${row.levelName}`}</span></label>)}
            </details>
            <p>Tomma APL-fält utan tilldelning blir 0. Befintliga APL-timmar behålls även i ämnen som inte är valda.</p>
          </>}
        </div>}
      </fieldset>}
      {reviewing && <p><strong>{mode === 'fill-empty' ? 'Fyll bara tomma celler' : isGymTimplanV2(basis.plan) ? 'Fördela om skoltimmarna' : 'Fördela om alla timmar'}</strong></p>}
      <p>Sparat nu: <strong>{totalHours(basis.plan).toLocaleString('sv-SE')} timmar</strong>.</p>
      {gut && /^\d+$/u.test(total) && <p className={Number(total) < gut.hours ? 'gt-distribution-warning' : undefined}>{Number(total) < gut.hours ? `${gut.hours - Number(total)} timmar saknas till GUT. ${includeApl ? 'Höj totalen för att skapa ett förslag med tillräcklig undervisningstid och APL.' : 'Förslaget kan sparas som utkast men behöver kompletteras inför beslut.'}` : `${Number(total) - gut.hours} timmar över GUT.`}</p>}
      {basis && isGymTimplanV2(basis.plan) ? <p>Befintlig APL: <strong>{formatTimplanMinutes(timplanTimeTotals(basis.plan).aplMinutes)} timmar</strong>. {includeApl ? 'Förslaget fyller på årsramen till vald APL-total och fördelar resten på skola HT och VT. Granska ämnesfördelningen före sparandet.' : 'Förslaget fördelar återstående tid på skola HT och VT. Års-APL ändras inte.'} Perioder ändras inte.{!includeApl && timplanTimeTotals(basis.plan).missingAplCells > 0 && ' Det finns obesvarade APL-celler; förslaget gör inte planen komplett.'}</p> : gut?.vocational && <p>APL ingår i totalen och läggs inte ovanpå. Sparad APL-tid bevaras som miniminivå per ämne och termin. Återstående timmar fördelas efter poängen. Ändrad undervisningstid kan kräva en ny rektorsbekräftelse av APL.</p>}
      {!isGymTimplanV2(basis.plan) && gut?.vocational && <p>För att få förslag på nya APL-timmar: stäng dialogen och välj Granska byte till skola och APL i timplanen.</p>}
      {proposalError && !busy && <p className="gt-distribution-warning" role="alert">{proposalError}</p>}
      {proposal && <section aria-label="Fördelningsförslag" className="gt-distribution-preview"><h3>{reviewing ? 'Granska före sparande' : 'Förslag för hela planen'}</h3><p><strong>{('totalMinutes' in proposal ? proposal.totalMinutes / 60 : proposal.total).toLocaleString('sv-SE')} timmar totalt</strong> · {proposal.changedRows.length} rader ändras{mode === 'fill-empty' ? ` · ${('keptMinutes' in proposal ? proposal.keptMinutes / 60 : proposal.keptHours).toLocaleString('sv-SE')} timmar behålls` : ''}.</p><div className="gt-distribution-years">{[0,1,2].map(y => <div key={y}><strong>Årskurs {y + 1}</strong><span>{'yearMinutes' in proposal! ? formatTimplanMinutes(proposal.yearMinutes[y]) : proposal!.terms[y * 2] + proposal!.terms[y * 2 + 1]} timmar</span><small>{'termMinutes' in proposal! ? `Skola HT ${formatTimplanMinutes(proposal.termMinutes[y * 2])} · VT ${formatTimplanMinutes(proposal.termMinutes[y * 2 + 1])} · APL ${formatTimplanMinutes(proposal.annualAplMinutes[y])}` : `HT ${proposal!.terms[y * 2]} · VT ${proposal!.terms[y * 2 + 1]}`}</small></div>)}</div><p>Granska ämnenas behov i tabellen efteråt.</p>{proposal.changedRows.length === 0 && <p>Inga timmar behöver ändras. Välj en annan total eller ändra fördelningssätt.</p>}</section>}
      {includeApl && proposal && 'timeRows' in proposal && <details open={reviewing || undefined}><summary>Granska APL per ämne och årskurs</summary><div className="gt-distribution-apl-preview"><table><caption>APL-förslag i timmar. Befintlig tid ingår.</caption><thead><tr><th scope="col">Ämne och nivå</th>{[1,2,3].map(year => <th key={year} scope="col">Åk {year}</th>)}</tr></thead><tbody>{basis.plan.rows.filter(row => proposal && 'timeRows' in proposal && proposal.timeRows[row.key].annualAplMinutes.some(n => (n ?? 0) > 0)).map(row => <tr key={row.key}><th scope="row">{row.name} {row.levelName}</th>{[0,1,2].map(year => <td key={year}>{proposal && 'timeRows' in proposal ? formatTimplanMinutes(proposal.timeRows[row.key].annualAplMinutes[year]) || '—' : ''}</td>)}</tr>)}</tbody></table></div><p>Förslaget bedömer inte centralt innehåll eller arbetsplatsens lämplighet. Kontrollera ämnenas behov och APL-innehåll i den senare planeringen.</p></details>}
      {!gymTimplanCanEdit(basis.plan) && <p role="alert">Den aktuella timplanen kan inte ändras. Stäng dialogen och kontrollera status och behörighet.</p>}
    </>}
    <div className="gt-dialog-actions"><Button variant="outline" disabled={busy || uncertain} onClick={props.onClose}>Avbryt</Button>{unread ? <Button disabled={busy || mfa} onClick={() => void load()}>Läs aktuell timplan</Button> : reviewing ? <><Button variant="outline" disabled={busy} onClick={() => setReviewing(false)}>Ändra förslag</Button><Button disabled={!canSave} onClick={() => void save()}>Spara fördelning</Button></> : <Button disabled={!canSave} onClick={() => setReviewing(true)}>Granska fördelning</Button>}</div>
  </DialogContent></Dialog>;
}
