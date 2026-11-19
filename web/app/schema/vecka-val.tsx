'use client';
import { useId, type ReactNode } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { SchemaForslag, SchemaTerm } from '@/lib/schema-contract.ts';
import { addSchemaDays, schemaVeckaVal, schemaVeckor, type SchemaVeckaVal } from '@/lib/schema-vecka.ts';
import './vecka-val.css';

export function VeckaVal({ forslag, term, value, onChange, terminsval }: {
  forslag: SchemaForslag; term: SchemaTerm; value: SchemaVeckaVal; onChange: (next: SchemaVeckaVal) => void; terminsval?: ReactNode;
}) {
  const id = useId(), calendar = forslag.time.calendar, val = schemaVeckaVal(forslag, term, value);
  const weeks = schemaVeckor(calendar, forslag.period === 'lasar' ? term : forslag.period), at = weeks.findIndex(w => w.monday === val.monday);
  const later = calendar && val.from ? addSchemaDays(val.from, 27) : '', max = calendar ? later < calendar.end ? later : calendar.end : '';
  return <section className="schema-datumval" aria-label="Grundschema eller faktiska tillfällen">
    <div className="schema-datumval-rad">
      <span id={`${id}-visa`}>Visa:</span>
      <ToggleGroup value={[val.mode]} multiple={false} aria-labelledby={`${id}-visa`} className="schema-datumval-lagen"
        onValueChange={values => { const mode = values[0] as SchemaVeckaVal['mode'] | undefined; if (mode) onChange({ ...val, mode }); }}>
        <ToggleGroupItem value="grundschema">Grundschema</ToggleGroupItem>
        <ToggleGroupItem value="vecka" disabled={!calendar} aria-describedby={!calendar ? `${id}-saknas` : undefined}>Vecka</ToggleGroupItem>
        <ToggleGroupItem value="intervall" disabled={!calendar} aria-describedby={!calendar ? `${id}-saknas` : undefined}>Datumintervall</ToggleGroupItem>
      </ToggleGroup>
      {terminsval}
      {val.mode === 'vecka' && <div className="schema-veckoblad">
        <Button variant="outline" aria-label="Föregående vecka" disabled={at <= 0} onClick={() => onChange({ ...val, monday: weeks[at - 1].monday })}><ChevronLeftIcon aria-hidden="true"/></Button>
        <label>Vecka<select value={val.monday} onChange={e => onChange({ ...val, monday: e.target.value })}>{weeks.map(w => <option key={w.monday} value={w.monday}>{w.label}</option>)}</select></label>
        <Button variant="outline" aria-label="Nästa vecka" disabled={at < 0 || at >= weeks.length - 1} onClick={() => onChange({ ...val, monday: weeks[at + 1].monday })}><ChevronRightIcon aria-hidden="true"/></Button>
      </div>}
      {val.mode === 'intervall' && calendar && <div className="schema-datumintervall">
        <label htmlFor={`${id}-fran`}>Från<Input id={`${id}-fran`} type="date" min={calendar.start} max={calendar.end} value={val.from} onChange={e => {
          const from = e.target.value;
          if (!from || from < calendar.start || from > calendar.end) return;
          const limit = addSchemaDays(from, 27), last = limit < calendar.end ? limit : calendar.end;
          onChange({ ...val, from, to: val.to < from ? from : val.to > last ? last : val.to });
        }}/></label>
        <label htmlFor={`${id}-till`}>Till<Input id={`${id}-till`} type="date" min={val.from} max={max} value={val.to} onChange={e => { if (e.target.value >= val.from && e.target.value <= max) onChange({ ...val, to: e.target.value }); }}/></label>
        <span className="schema-note">Högst fyra veckor.</span>
      </div>}
    </div>
    {!calendar && <p id={`${id}-saknas`} className="schema-note">Faktiska datum saknas i underlaget.</p>}
    {val.mode !== 'grundschema' && <><output className="schema-note schema-flytt-alla">Ändringar här gäller ett enskilt tillfälle. Välj en lektion för att ändra datum, tid eller sal. Grundschemat ändras bara när du uttryckligen väljer det.</output>
        {forslag.lessons.some(l => 'egenAktivitet' in l && l.egenAktivitet) && <p className="schema-note">Egna aktiviteter visas från grundschemat. Deras faktiska veckor och kalenderavvikelser är ännu inte fastställda.</p>}</>}
  </section>;
}
