'use client';

import { useId, useMemo } from 'react';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox';
import type { TjanstTeacher } from '@/lib/tjanst-contract.ts';

type TeacherOption = { personId: string; label: string };

/** Sökning ändrar bara listan. Endast ett uttryckligt val byter den aktiva läraren. */
export default function TjanstTeacherSelect({ teachers, personId, onTeacher }: {
  teachers: TjanstTeacher[]; personId: string; onTeacher: (personId: string) => void;
}) {
  const id = useId();
  const options = useMemo(() => {
    const sorted = [...teachers].sort((a, b) => a.displayName.localeCompare(b.displayName, 'sv') || a.personId.localeCompare(b.personId));
    const counts = new Map<string, number>(), seen = new Map<string, number>();
    for (const teacher of sorted) counts.set(teacher.displayName, (counts.get(teacher.displayName) ?? 0) + 1);
    return sorted.map(teacher => {
      const ordinal = (seen.get(teacher.displayName) ?? 0) + 1; seen.set(teacher.displayName, ordinal);
      return { personId: teacher.personId, label: `${teacher.displayName}${counts.get(teacher.displayName)! > 1 ? ` · alternativ ${ordinal}` : ''}` };
    });
  }, [teachers]);
  const selected = options.find(option => option.personId === personId) ?? null;
  return <div className="tjanst-teacher-select">
    <label htmlFor={id}>Lärare</label>
    <Combobox<TeacherOption> items={options} value={selected}
      itemToStringLabel={option => option.label} itemToStringValue={option => option.personId}
      isItemEqualToValue={(option, value) => option.personId === value.personId}
      onValueChange={option => { if (option) onTeacher(option.personId); }}>
      <ComboboxInput id={id} aria-describedby={`${id}-hint`} placeholder="Sök eller välj lärare" className="tjanst-teacher-combobox"/>
      <ComboboxContent className="tjanst-teacher-select-popup">
        <ComboboxEmpty>{options.length ? 'Ingen lärare matchar sökningen.' : 'Inga lärare finns i fördelningen ännu.'}</ComboboxEmpty>
        <ComboboxList>{(option: TeacherOption) => <ComboboxItem key={option.personId} value={option} data-person-id={option.personId}><span>{option.label}</span></ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
    <p id={`${id}-hint`}>Sök på namn. Välj i listan för att byta lärare.</p>
  </div>;
}
