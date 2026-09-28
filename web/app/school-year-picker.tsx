'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { schoolYearLabel, type RegisterScope } from '@/lib/pupil-register-model.ts';

export type RegisterSetup = {
  schoolYears: number[];
  currentSchoolYear: number;
  scope: RegisterScope;
  endsAt: string | null;
  approverName: string | null;
  purposeCode: string | null;
  serverNow: string;
};

export default function SchoolYearPicker({ setup, value, onChange, disabled = false }: {
  setup: RegisterSetup; value: number; onChange: (year: number) => void; disabled?: boolean;
}) {
  const index = setup.schoolYears.indexOf(value);
  const previous = setup.schoolYears[index - 1];
  const next = setup.schoolYears[index + 1];
  return <fieldset className="pupil-school-year" aria-label="Läsår">
    <Button variant="outline" size="icon" disabled={disabled || previous === undefined} aria-label={`Föregående läsår${previous === undefined ? '' : `, ${schoolYearLabel(previous)}`}`} onClick={() => onChange(previous)}><ChevronLeft size={20} aria-hidden="true" /></Button>
    <label htmlFor="lasar">Läsår</label>
    <select id="lasar" value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))}>
      {setup.schoolYears.map(year => <option key={year} value={year}>{schoolYearLabel(year)}{year === setup.currentSchoolYear ? ' (nu)' : ''}</option>)}
    </select>
    <Button variant="outline" size="icon" disabled={disabled || next === undefined} aria-label={`Nästa läsår${next === undefined ? '' : `, ${schoolYearLabel(next)}`}`} onClick={() => onChange(next)}><ChevronRight size={20} aria-hidden="true" /></Button>
  </fieldset>;
}
