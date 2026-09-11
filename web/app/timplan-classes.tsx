'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  normalizeClassBinding,
  type ClassTimplan,
} from '@/lib/cohort-model.ts';
import type { Education, Timplan } from '@/lib/timplan-model.ts';

export default function TimplanClasses({
  unitId,
  plan,
  education,
  plans,
  bindings,
  classNames,
  onSave,
  onRemove,
  loading,
}: {
  unitId: string;
  plan: Timplan;
  education: Education;
  plans: Timplan[];
  bindings: ClassTimplan[];
  classNames: string[];
  onSave: (b: ClassTimplan) => Promise<void>;
  onRemove: (b: ClassTimplan) => Promise<void>;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [column, setColumn] = useState(education.columns[0]?.id ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const rows = bindings
    .filter((b) =>
      plans.some((p) => p.id === b.timplanId && p.educationId === education.id),
    )
    .sort(
      (a, b) =>
        a.startYear - b.startYear ||
        a.className.localeCompare(b.className, 'sv'),
    );
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Kopplingen kunde inte sparas.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section id="timplan-klasser" className="class-plan-panel">
      <div className="section-heading">
        <h3>Klasser som följer timplanen</h3>
        <span className="cell-secondary">{rows.length} kopplingar</span>
      </div>
      <p className="og-text">
        Välj klass, läsår och årskurs. Kopplingen behåller sin version även när
        en ny timplan fastställs.
      </p>
      {plan.status === 'fastställd' ? (
        <form
          className="class-plan-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const b = normalizeClassBinding(
                {
                  unitId,
                  className: name,
                  startYear: year,
                  timplanId: plan.id,
                  columnId: column,
                },
                plan,
                education.columns,
              );
              await onSave(b);
              setName('');
            });
          }}
        >
          <label className="field-label" htmlFor="class-binding-name">
            Klass
            <Input
              id="class-binding-name"
              list="timplan-class-options"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                education.kind === 'grundskola' ? 't.ex. 8A' : 't.ex. SA27A'
              }
              required
              maxLength={60}
            />
          </label>
          <datalist id="timplan-class-options">
            {classNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </datalist>
          <label className="field-label" htmlFor="class-binding-year">
            Läsårets startår
            <Input
              id="class-binding-year"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              required
            />
          </label>
          <label className="field-label" htmlFor="class-binding-column">
            Årskurs i timplanen
            <select
              id="class-binding-column"
              aria-label="Årskurs i timplanen"
              className="og-select"
              value={column}
              onChange={(e) => setColumn(e.target.value)}
            >
              {education.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={busy || loading} type="submit">
            {busy ? 'Sparar…' : 'Koppla klass'}
          </Button>
          <p className="cell-secondary">
            En befintlig koppling för samma klass och läsår ersätts. Kopplingen
            gäller version {plan.version}.
          </p>
        </form>
      ) : (
        <p className="admin-notice">
          Välj en fastställd version ovan för att koppla klasser.
        </p>
      )}
      {loading && <output>Läser klasskopplingar…</output>}
      {error && (
        <p role="alert" className="validation-warning">
          {error}
        </p>
      )}
      {!loading && !rows.length && (
        <p className="cell-secondary">
          Inga klasser har kopplats till den här utbildningen ännu.
        </p>
      )}
      <ul className="class-plan-list">
        {rows.map((b) => {
          const p = plans.find((p) => p.id === b.timplanId)!;
          return (
            <li key={`${b.className}:${b.startYear}`}>
              <div>
                <strong>{b.className}</strong>
                <span>
                  {b.startYear}/{String(b.startYear + 1).slice(2)} ·{' '}
                  {education.columns.find((c) => c.id === b.columnId)?.label ??
                    b.columnId}{' '}
                  · Version {p.version}
                  {p.status === 'ersatt' ? ' (tidigare beslut)' : ''}
                </span>
              </div>
              <Button
                variant="ghost"
                disabled={busy || loading}
                aria-label={`Ta bort koppling för ${b.className} ${b.startYear}`}
                onClick={() => void run(() => onRemove(b))}
              >
                Ta bort
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
