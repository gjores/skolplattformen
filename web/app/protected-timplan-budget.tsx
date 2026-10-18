import type { GymTimplan } from '@/lib/gym-timplan.ts';
import { compareTimplanMinutes, timplanBudgetMinimum } from '@/lib/timplan-budget.ts';
import { formatTimplanMinutes } from '@/lib/timplan-time.ts';

const hours = (minutes: number) => `${formatTimplanMinutes(minutes)} h`;
export default function ProtectedTimplanBudget({ plan, totalMinutes, aplMinutes, complete, pending, invalid }: {
  plan: GymTimplan; totalMinutes: number; aplMinutes: number | null; complete: boolean; pending: boolean; invalid: boolean;
}) {
  const minimum = timplanBudgetMinimum(plan);
  if (!minimum) return <section className="gt-budget" aria-label="Kontroll av planerade timmar"><strong>Timkraven behöver granskas</strong><p>Programmet, elevkullen eller poängomfattningen saknar en verifierad miniminivå. Totalen är inget besked om att timkraven är uppfyllda.</p></section>;
  const checks = [{ label: 'Undervisning totalt (GUT)', ...compareTimplanMinutes(totalMinutes, minimum.totalMinutes) },
    ...(minimum.aplMinutes === null ? [] : [{ label: 'Varav APL', ...compareTimplanMinutes(aplMinutes, minimum.aplMinutes) }])];
  return <section className="gt-budget" aria-label="Kontroll av planerade timmar">
    <strong>Räcker timmarna?</strong>
    <div className="gt-budget-checks">{checks.map(check => <div key={check.label} className={`gt-budget-check${!invalid && complete && check.sufficient ? ' gt-budget-sufficient' : ''}`}>
      <strong>{check.label}</strong><span>Planerat: {invalid ? 'Kontrollera inmatningen' : check.planned === null ? 'Inte särredovisat' : hours(check.planned)}</span>
      <span>Minst: {hours(check.minimum)}</span>
      <b>{invalid ? 'Kan inte beräknas' : check.missing === null ? 'Byt till skola och APL för att kontrollera tiden' : check.missing > 0 ? `Saknas: ${hours(check.missing)}` : complete ? 'Timnivån uppnådd' : 'Timnivån uppnådd – fyll i resterande fält'}</b>
    </div>)}</div>
    <p>{invalid ? 'Rätta ogiltiga värden i tabellen.' : pending ? 'Preliminär kontroll av dina ändringar. Invänta sparbeskedet innan du går vidare.' : !complete ? 'Kontrollen är preliminär tills alla aktiva fält är ifyllda.' : 'Kontrollen gäller hela utbildningen, även när du visar en årskurs.'} Du kan spara ett utkast med för få timmar, men timkraven måste vara uppfyllda innan planen skickas till huvudmannen eller godkänns.</p>
    {minimum.aplMinutes !== null && <p>345 timmar motsvarar 15 APL-veckor × 23 timmar i undervisningstiden. APL ingår i totalen. Perioder, innehåll och faktisk omfattning granskas senare; lärlingsutbildning kräver en större andel APL.</p>}
    <details><summary>Vad kontrolleras?</summary><p>Miniminivåerna gäller den gemensamma programplanen. Ämnen och årskurser har inte var sitt fast timkrav här. Rektor och huvudman behöver även granska varje möjlig studiegång och elevernas behov. Tillräckligt planerade timmar visar inte att undervisningen har genomförts.</p><a href="https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/undervisningstid-larotider-och-schema" target="_blank" rel="noreferrer">Skolverkets regler om undervisningstid</a></details>
  </section>;
}
