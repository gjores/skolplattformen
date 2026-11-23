'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SchemaForslag, SchemaKvalitetsrad, SchemaKvalitetsval, SchemaTerm } from '@/lib/schema-contract.ts';
import { clock, dayName, PERIOD } from './delat.ts';

export const kvalitetsnyckel = ({ slag, ref }: SchemaKvalitetsval) => JSON.stringify([slag, ref]);
export const sammaKvalitetsval = (a: SchemaKvalitetsval, b: SchemaKvalitetsval) => a.term === b.term && a.slag === b.slag && a.ref === b.ref;
const minuter = (min: number) => min < 60 ? `${min} min` : `${Math.floor(min / 60)} tim ${min % 60 ? `${min % 60} min` : ''}`.trim();
const skoldag = (r: SchemaKvalitetsrad) => r.kortasteDag === r.langstaDag ? minuter(r.langstaDag) : `${minuter(r.kortasteDag)}–${minuter(r.langstaDag)}`;
const sluttid = (r: SchemaKvalitetsrad) => `${dayName(r.sluttid.dag)} ${clock(r.sluttid.min)}`;

export function Schemakvalitet({ forslag, rader, val, senGrans, onVal, onOpen, onProva, disabled, kanProva, stale, checking }: {
  forslag: SchemaForslag; rader: SchemaKvalitetsrad[] | undefined; val: SchemaKvalitetsval | null;
  senGrans: number | null;
  onVal: (val: SchemaKvalitetsval | null) => void; onOpen: (lesson: string, term: SchemaTerm) => void;
  onProva: (val: SchemaKvalitetsval, knapp: HTMLButtonElement) => void;
  disabled: boolean; kanProva: boolean; stale: boolean; checking: boolean;
}) {
  const id = useId();
  const terminer = forslag.time.terms.map(t => t.term);
  const term = val && terminer.includes(val.term) ? val.term : terminer[0];
  const namn = new Map((['klass', 'grupp'] as const).flatMap(slag => forslag.resurser[slag].map(r => [
    kvalitetsnyckel({ slag, ref: r.ref, term }), `${slag === 'klass' ? 'Klass' : 'Undervisningsgrupp'} · ${r.name}`,
  ])));
  const rang = (r: SchemaKvalitetsrad) => Math.max(0, r.sluttid.min - (senGrans ?? 1440));
  const sorterade = (rader ?? []).filter(r => namn.has(kvalitetsnyckel(r))).sort((a, b) =>
    (b.hal?.min ?? 0) - (a.hal?.min ?? 0) || rang(b) - rang(a) || b.langstaDag - a.langstaDag
    || namn.get(kvalitetsnyckel(a))!.localeCompare(namn.get(kvalitetsnyckel(b))!, 'sv'));
  const urval = sorterade.filter(r => r.term === term);
  const rad = (val && urval.find(r => sammaKvalitetsval(r, val))) || urval[0];
  const valdResurs = rad && kvalitetsnyckel(rad);
  const valjTermin = (ny: SchemaTerm) => {
    const iTermin = sorterade.find(r => r.term === ny && kvalitetsnyckel(r) === valdResurs) ?? sorterade.find(r => r.term === ny);
    onVal(iTermin ?? { term: ny, slag: 'klass', ref: '' });
  };
  return <section className="min-w-0 rounded-lg border border-border bg-card px-5 py-4 space-y-3" aria-labelledby={`${id}-rubrik`}>
    <h3 className="section-heading" id={`${id}-rubrik`}>Elevernas skoldagar</h3>
    {stale ? <p className="schema-note">Ta fram ett aktuellt schemaförslag för att se kvalitetsmåtten.</p>
      : !rader ? <p className="schema-note">{checking ? 'Kontrollerar grundschemat…' : 'Kör en schemakontroll för att läsa in kvalitetsmåtten.'}</p>
      : <>
        <p className="schema-note">Måtten gäller grundveckan och visar yttervärden bland elevernas olika gruppscheman. Raster och lunch räknas av från håltiden.</p>
        <div className="flex flex-wrap gap-3">
          {terminer.length > 1 && <label className="grid gap-1.5">Termin för kvalitetsmått
            <select value={term} onChange={e => valjTermin(e.target.value as SchemaTerm)}>
              {terminer.map(t => <option key={t} value={t}>{PERIOD[t]}</option>)}
            </select>
          </label>}
          {rad && <label className="grid min-w-0 max-w-full gap-1.5">Klass eller undervisningsgrupp
            <select className="max-w-full" value={valdResurs} onChange={e => onVal(urval.find(r => kvalitetsnyckel(r) === e.target.value) ?? null)}>
              {urval.map(r => <option key={kvalitetsnyckel(r)} value={kvalitetsnyckel(r)}>{namn.get(kvalitetsnyckel(r))}{r.hal ? ` · ${minuter(r.hal.min)} hål` : ''}</option>)}
            </select>
          </label>}
        </div>
        {rad ? <>
          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            <div><dt className="schema-note">Längsta hål</dt><dd className="font-medium">{rad.hal ? `${minuter(rad.hal.min)} · ${dayName(rad.hal.dag)} ${clock(rad.hal.fran)}–${clock(rad.hal.till)}` : 'Ingen håltid'}</dd></div>
            <div><dt className="schema-note">Senaste sluttid</dt><dd className="font-medium">{sluttid(rad)}{rang(rad) > 0 && ` · ${minuter(rang(rad))} efter skolans gräns`}</dd></div>
            <div><dt className="schema-note">Skoldagens längd</dt><dd className="font-medium">{skoldag(rad)}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {rad.hal && <Button type="button" variant="outline" data-kvalitet-pass disabled={disabled} onClick={() => onOpen(rad.hal!.pass, rad.term)}>Visa passet efter hålet</Button>}
            {!rad.hal && rang(rad) > 0 && <Button type="button" variant="outline" data-kvalitet-pass disabled={disabled} onClick={() => onOpen(rad.sluttid.pass, rad.term)}>Visa det sena passet</Button>}
            <Button type="button" variant="outline" disabled={disabled || !kanProva} onClick={e => onProva(rad, e.currentTarget)}>Pröva en förbättring</Button>
          </div>
        </> : <p className="schema-note">Inga kvalitetsmått för terminen. Det behövs placerade pass och elevunderlag.</p>}
        {rad && (forslag.members.classesWithoutPupils.length > 0 || forslag.members.groupsWithoutMembers.length > 0 || forslag.members.withoutChoice.length > 0)
          && <p className="schema-note">Vissa klasser eller grupper har ofullständigt elevunderlag. Måtten gäller de elevgrupper som kunnat följas.</p>}
      </>}
  </section>;
}

export function Kvalitetsjamforelse({ forslag, val, fore, efter }: {
  forslag: SchemaForslag; val: SchemaKvalitetsval; fore?: SchemaKvalitetsrad[]; efter?: SchemaKvalitetsrad[];
}) {
  const namn = forslag.resurser[val.slag].find(r => r.ref === val.ref)?.name;
  const a = fore?.find(r => sammaKvalitetsval(r, val)), b = efter?.find(r => sammaKvalitetsval(r, val));
  if (!namn || !a || !b) return <p className="schema-note">Kvalitetsmått för vald klass eller undervisningsgrupp saknas i jämförelsen.</p>;
  const matt = [
    ['Längsta hål', minuter(a.hal?.min ?? 0), minuter(b.hal?.min ?? 0)],
    ['Senaste sluttid', sluttid(a), sluttid(b)],
    ['Skoldagens längd', skoldag(a), skoldag(b)],
  ];
  const skillnad = (a.hal?.min ?? 0) - (b.hal?.min ?? 0);
  return <div className="space-y-2">
    <h3 className="section-heading">{namn} · {PERIOD[val.term]}</h3>
    {skillnad !== 0 && <p>Längsta hålet blir {minuter(Math.abs(skillnad))} {skillnad > 0 ? 'kortare' : 'längre'} med förslaget.</p>}
    <Table aria-label={`Kvalitetsmått för ${namn}`}>
      <TableHeader><TableRow><TableHead>Mått</TableHead><TableHead>Nuvarande</TableHead><TableHead>Prövat förslag</TableHead></TableRow></TableHeader>
      <TableBody>{matt.map(([etikett, nu, provat]) => <TableRow key={etikett}><TableCell className="whitespace-normal">{etikett}</TableCell>
        <TableCell className="whitespace-normal">{nu}</TableCell><TableCell className="whitespace-normal">{provat}</TableCell></TableRow>)}</TableBody>
    </Table>
    {matt.every(([, nu, provat]) => nu === provat) && <p className="schema-note">De här måtten är lika i båda förslagen.</p>}
  </div>;
}
