'use client';
import { Input } from '@/components/ui/input';
import type { Assignment } from '@/lib/organisation-model.ts';

export default function PrincipalPicker({
  id,
  assignments,
  value,
  onChange,
  name,
  onName,
  allowLater = false,
  disabled = false,
}: {
  id: string;
  assignments: Assignment[];
  value: string;
  onChange: (value: string) => void;
  name: string;
  onName: (value: string) => void;
  allowLater?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="og-principal-picker">
      <label className="field-label" htmlFor={`${id}-choice`}>
        Rektor – utses av huvudmannen
      </label>
      <select
        id={`${id}-choice`}
        className="og-select"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {allowLater ? 'Utse rektor senare' : 'Välj rektor'}
        </option>
        {assignments
          .filter((a) => a.role === 'rektor')
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        <option value="new">Lägg till en ny rektor</option>
      </select>
      {value === 'new' && (
        <>
          <label className="field-label" htmlFor={`${id}-name`}>
            Rektorns namn
          </label>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={120}
            disabled={disabled}
            onChange={(e) => onName(e.target.value)}
            placeholder="För- och efternamn"
          />
        </>
      )}
      <p className="cell-secondary">
        Uppdraget gäller i skolplattformen. Uppgifter i Skolverkets register
        ändras inte här.
      </p>
    </div>
  );
}
