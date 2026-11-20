'use client';
// Beräkningsläget (05.2-SM-UXF-54) lägger sig över arbetsytan medan schemamotorn tar fram ett förslag eller fortsätter förbättra.
// Motorn söker under räknetiden och skickar inget mellanläge. Förloppet visar förbrukad räknetid. Miniveckan illustrerar sökningen och är inte schemat.
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { DAYS } from './delat.ts';
import './berakning.css';

/** Vilken beräkning som pågår och när motorns räknetid började (`performance.now()`). Arbetsytan sätter det; `avbrutet` ger beskedet efter Avbryt. */
export type Motorlage = { typ: 'nytt' | 'fortsatt'; sedan: number | null; avbrutet?: boolean };
type Fas = 'diagnos' | 'solve' | 'kontroll';
type Lage = 'klart' | 'pagar' | 'vantar';

// Fem dagar med sex pass. Ordningen sprider passen över veckan, och sex rutor förblir lediga.
const ORDNING = [6, 17, 1, 23, 12, 8, 20, 3, 15, 10, 27, 0, 21, 5, 18, 2, 11, 26, 7, 22, 4, 14, 9, 19];
const LEDIGA = [13, 16, 24, 25, 28, 29];
const PASS = ORDNING.length, RUTOR = PASS + LEDIGA.length;
const DAGAR = DAYS.slice(0, 5).map(d => d.slice(0, 3));
const TICK_MS = 200, BYTE_MS = 2_000, MARKOR_MS = 600;
const LAGE: Record<Lage, string> = { klart: 'Klart', pagar: 'Pågår', vantar: 'Väntar' };
const ruta = (c: number, extra: Record<string, string> = {}) => ({ '--dag': c % 5, '--rad': Math.floor(c / 5), ...extra }) as CSSProperties;

// Vid minskad rörelse fylls veckan utan sökmarkör och byten.
const LUGN = '(prefers-reduced-motion: reduce)';
function lyssnaLugn(andrad: () => void) {
  const fraga = window.matchMedia(LUGN);
  fraga.addEventListener('change', andrad);
  return () => fraga.removeEventListener('change', andrad);
}
const arLugn = () => window.matchMedia(LUGN).matches;

export function Berakningslage({ oppen, motor, steg, solveTimeMs, onAvbryt, aterFokus }: {
  oppen: boolean; motor: Motorlage | null; steg: 'diagnos' | 'solve'; solveTimeMs: number; onAvbryt: () => void;
  /** Var fokus hamnar när läget stängs. Utan element går fokus till det som hade fokus före. */
  aterFokus: () => HTMLElement | null;
}) {
  const rubrik = useRef<HTMLHeadingElement | null>(null);
  const [nu, setNu] = useState(0);
  useEffect(() => {
    if (!oppen) return;
    const id = window.setInterval(() => setNu(performance.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, [oppen]);
  const lugn = useSyncExternalStore(lyssnaLugn, arLugn, () => false);
  const typ = motor?.typ ?? 'nytt';
  const forbrukat = steg === 'solve' && motor?.sedan != null ? Math.max(0, nu - motor.sedan) : 0;
  const fas: Fas = steg === 'diagnos' ? 'diagnos' : forbrukat >= solveTimeMs ? 'kontroll' : 'solve';

  // Ett nytt förslag fylls i takt med räknetiden. Fortsätt förbättra börjar med en fylld vecka.
  const lagdaVid = (t: number) => typ === 'fortsatt' ? PASS : Math.min(PASS, Math.floor(PASS * t / solveTimeMs));
  const lagda = fas === 'diagnos' ? 0 : fas === 'kontroll' ? PASS : lagdaVid(forbrukat);
  const rutor = [...ORDNING];
  const byten = lugn || fas === 'diagnos' ? 0 : Math.floor(Math.min(forbrukat, solveTimeMs) / BYTE_MS);
  for (let k = 1; k <= byten; k++) {
    const n = lagdaVid(k * BYTE_MS), a = k * 5 % n, b = (k * 11 + 3) % n;
    if (n >= 4 && a !== b) [rutor[a], rutor[b]] = [rutor[b], rutor[a]];
  }
  let markor: number | null = null;
  if (fas === 'solve' && !lugn) {
    const hopp = Math.floor(forbrukat / MARKOR_MS);
    if (lagda < PASS) {
      const per = solveTimeMs / PASS, andra = [...LEDIGA, ...rutor.slice(lagda + 1)];
      markor = (forbrukat - lagda * per) / per >= 0.55 ? rutor[lagda] : andra[(hopp * 7 + lagda) % andra.length];
    } else markor = LEDIGA[hopp * 5 % LEDIGA.length];
  }

  const sekunder = solveTimeMs / 1000, gatt = Math.min(sekunder, forbrukat / 1000);
  const tidText = `${Math.floor(gatt)} av ${sekunder} sekunder`;
  const not = fas === 'diagnos' ? 'Underlaget kontrolleras. Räknetiden börjar sedan.'
    : fas === 'kontroll' ? 'Räknetiden är slut. Resultatet kontrolleras innan det visas.'
    : typ === 'fortsatt' ? 'Motorn söker bättre placeringar från ditt schema så länge räknetiden räcker.'
    : 'Motorn lägger passen och söker bättre placeringar så länge räknetiden räcker.';
  const steglista: [string, Lage][] = typ === 'fortsatt'
    ? [['Sökning från ditt schema', fas === 'kontroll' ? 'klart' : 'pagar'], ['Kontroll av resultatet', fas === 'kontroll' ? 'pagar' : 'vantar']]
    : [['Kontroll av underlaget', fas === 'diagnos' ? 'pagar' : 'klart'], ['Placering av passen', fas === 'diagnos' ? 'vantar' : fas === 'solve' ? 'pagar' : 'klart'],
      ['Kontroll av resultatet', fas === 'kontroll' ? 'pagar' : 'vantar']];

  // Har arbetsytan redan flyttat fokus, till exempel till Före beräkning eller granskningen, står det kvar. Annars väljer arbetsytan mål.
  const tillbaka = () => {
    const aktiv = document.activeElement;
    if (aktiv instanceof HTMLElement && aktiv !== document.body && !aktiv.closest('.schema-berakning')) return false;
    return aterFokus() ?? true;
  };

  return <Dialog open={oppen} disablePointerDismissal onOpenChange={open => { if (!open) onAvbryt(); }}>
    <DialogContent showCloseButton={false} initialFocus={rubrik} finalFocus={tillbaka} data-fas={fas}
      className="schema-berakning max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-6 sm:max-w-xl">
      <DialogHeader>
        <p className="folj-overrad">Schemamotorn</p>
        <DialogTitle ref={rubrik} tabIndex={-1} className="text-xl leading-tight font-semibold tracking-tight outline-none">{typ === 'fortsatt' ? 'Förbättrar schemat' : 'Tar fram schemaförslag'}</DialogTitle>
        <DialogDescription>{typ === 'fortsatt'
          ? 'Schemamotorn utgår från dina placeringar och söker bättre. Inget ändras förrän du har granskat resultatet.'
          : 'Schemamotorn lägger passen efter villkoren och söker bättre placeringar. Utkastet ändras först när förslaget är klart.'}</DialogDescription>
      </DialogHeader>
      <div className="schema-berakning-vecka" aria-hidden="true">
        {DAGAR.map(d => <span key={d} className="schema-berakning-dag">{d}</span>)}
        <div className="schema-berakning-ytan">
          {Array.from({ length: RUTOR }, (_, c) => <span key={`ruta-${c}`} className="schema-berakning-plats" style={ruta(c)}/>)}
          {rutor.slice(0, lagda).map((c, i) => <span key={`pass-${i}`} className="schema-berakning-pass" style={ruta(c, { '--w1': `${45 + i * 17 % 40}%`, '--w2': `${25 + i * 13 % 35}%` })}/>)}
          {markor !== null && <span className="schema-berakning-provar" style={ruta(markor)}/>}
          {fas !== 'solve' && <span className="schema-berakning-skanna"/>}
        </div>
      </div>
      <div className="grid gap-2">
        <Progress value={gatt} max={sekunder} getAriaValueText={() => tidText} className="schema-berakning-tid">
          <ProgressLabel>Räknetid</ProgressLabel>
          <ProgressValue>{() => tidText}</ProgressValue>
        </Progress>
        <p className="schema-berakning-not" aria-live="polite">{not}</p>
      </div>
      <ol className="schema-berakning-steg" aria-label="Beräkningens steg">
        {steglista.map(([namn, lage]) => <li key={namn} data-lage={lage}>
          <span className="schema-berakning-ikon" aria-hidden="true">{lage === 'klart' ? <CheckIcon/> : lage === 'pagar' ? <Spinner aria-hidden="true"/> : <span className="schema-berakning-punkt"/>}</span>
          <span className="schema-berakning-namn">{namn}</span>
          <span className={lage === 'klart' ? 'status-badge success' : lage === 'pagar' ? 'status-badge' : 'schema-berakning-vantar'}>{LAGE[lage]}</span>
        </li>)}
      </ol>
      <DialogFooter className="-mx-6 -mb-6 border-border px-6 sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Om du avbryter ligger utkastet kvar som det är.</p>
        <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={onAvbryt}>Avbryt beräkningen</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
