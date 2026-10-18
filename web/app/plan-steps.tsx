import './plan-steps.css';

// Gemensam stegvisning för utbildningens arbetsmoment. Endast visning; navigering
// och skrivspärrar ligger kvar i respektive arbetsyta.
export type PlanStep = 'programplan' | 'timplan' | 'apl';

const steps: Record<PlanStep, { label: string; detail: string }> = {
  programplan: { label: 'Programplan', detail: 'fördela poäng' },
  timplan: { label: 'Timplan', detail: 'fördela timmar' },
  apl: { label: 'APL-planering', detail: 'planera perioder' },
};

export default function PlanSteps({ current, apl, className = '' }: { current: PlanStep; apl: boolean; className?: string }) {
  const shown: PlanStep[] = apl ? ['programplan', 'timplan', 'apl'] : ['programplan', 'timplan'];
  const at = shown.indexOf(current);
  return <ol className={`plan-steps ${className}`.trim()} aria-label="Utbildningens arbetsmoment">
    {shown.map((step, i) => <li key={step} aria-current={step === current ? 'step' : undefined} data-before={i < at || undefined}>
      <span className="plan-steps-number" aria-hidden="true">{i + 1}</span>
      <span className="plan-steps-text"><strong>{steps[step].label}</strong><small>{steps[step].detail}</small></span>
    </li>)}
  </ol>;
}
