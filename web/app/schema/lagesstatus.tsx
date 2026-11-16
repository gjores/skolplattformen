import { schemaLage, schemaLagesBrickor } from '@/lib/schema-status.ts';
import type { SchemaForslagLesson } from '@/lib/schema-contract.ts';

/** Tid, sal och kapacitet som tre besked (05.2-SM-UXF-12). Ingen samlad klarstatus. */
export function Lagesstatus({ lessons }: { lessons: SchemaForslagLesson[] }) {
  return <>{schemaLagesBrickor(schemaLage(lessons)).map(b => <span key={b.omrade} data-lage={b.omrade} className={`status-badge ${b.ton}`}>{b.text}</span>)}</>;
}
