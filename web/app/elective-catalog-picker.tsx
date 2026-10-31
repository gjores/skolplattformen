'use client';
import { useMemo } from 'react';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox';
import { parseProgramplanCatalog } from '@/lib/programplan-catalog.ts';
import artifact from '@/lib/programplan-catalog.generated.json';
import { PROGRAMPLAN_LANGUAGES, PROGRAMPLAN_LANGUAGE_LADDERS, programplanLanguageName } from '@/lib/programplan-languages.ts';
import { nationalTimplan } from '@/lib/timplan-model.ts';
import type { ElectiveOption } from '@/lib/elective-block-contract.ts';
const catalog = parseProgramplanCatalog(artifact);
export const electiveCatalogId = catalog.catalogId;
const levels = catalog.subjects.flatMap(subject => subject.items.map(item => ({ ...item, subjectCode: subject.code, subjectName: subject.name })));
const levelByCode = new Map(levels.map(level => [level.code, level]));
const grNames: Record<string, string> = { ...Object.fromEntries(nationalTimplan.flatMap(subject => subject.code ? [[subject.code, subject.name]] : [])), GRGRSVE01: 'Svenska', GRGRSVA01: 'Svenska som andraspråk', GRGRENG01: 'Engelska', GRGRMSP01: 'Moderna språk', GRGRMOD01: 'Moderna språk' };
export function electiveLanguageRule(code: string) {
  const ladder = PROGRAMPLAN_LANGUAGE_LADDERS.find(value => value.steps.some(step => step.itemCode === code));
  return { required: ladder?.languageRequired ?? ['GRGRMSP01', 'GRGRMOD01'].includes(code), fixed: ladder?.languageCode ?? null };
}
export function electiveOptionLabel(option: Pick<ElectiveOption, 'levelCode' | 'language'>) {
  const level = levelByCode.get(option.levelCode);
  const title = level ? (level.name.startsWith(level.subjectName) ? level.name : `${level.subjectName} – ${level.name}`) : grNames[option.levelCode] ?? option.levelCode;
  return `${option.language ? `${programplanLanguageName(option.language)} · ` : ''}${title}`.slice(0, 200);
}
type Item = { key: string; label: string; name: string; code: string; subjectCode: string; points: number | null; language: string | null };
const normalize = (text: string) => text.toLocaleLowerCase('sv').normalize('NFD').replace(/\p{Diacritic}/gu, '');
export default function ElectiveCatalogPicker({ id, option, allowed, disabled, error, onSelect }: {
  id: string; option: ElectiveOption; allowed: string[]; disabled: boolean; error?: string; onSelect: (option: ElectiveOption) => void;
}) {
  const items = useMemo(() => allowed.flatMap(code => {
    const level = levelByCode.get(code), rule = electiveLanguageRule(code);
    const languages = rule.required ? PROGRAMPLAN_LANGUAGES.filter(language => !rule.fixed || language.code === rule.fixed).map(language => language.code) : [null];
    return languages.map(language => {
      const name = electiveOptionLabel({ levelCode: code, language });
      return { key: `${code}:${language ?? ''}`, name, label: `${name}${level ? ` · ${level.points} p` : ''} · ${code}`, code, subjectCode: level?.subjectCode ?? code, points: level?.points ?? null, language };
    });
  }), [allowed]);
  const selected = items.find(item => item.code === option.levelCode && item.language === option.language) ?? (option.levelCode ? { key: `${option.levelCode}:${option.language ?? ''}`, label: `${electiveOptionLabel(option)} · ${option.levelCode}`, name: electiveOptionLabel(option), code: option.levelCode, subjectCode: option.subjectCode, points: option.points, language: option.language } : null);
  return <div className="elective-catalog-picker"><label htmlFor={id}>Ämne, kurs eller nivå</label>
    <Combobox<Item> items={items} value={selected} disabled={disabled} itemToStringLabel={item => item.label} itemToStringValue={item => item.key}
      isItemEqualToValue={(a, b) => a.key === b.key} filter={(item, query) => normalize(query).split(/\s+/).every(word => normalize(item.label).includes(word))}
      onValueChange={item => { if (item) onSelect({ ...option, subjectCode: item.subjectCode, levelCode: item.code, points: item.points, language: item.language, name: !option.name.trim() || option.name === electiveOptionLabel(option) ? item.name : option.name }); }}>
      <ComboboxInput id={id} placeholder="Sök exempelvis spanska 1, engelska eller ämneskod" aria-invalid={!!error} aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`} disabled={disabled}/>
      <ComboboxContent className="elective-catalog-popup"><ComboboxEmpty>Inga träffar i timplansramens tillåtna utbud. Prova ämnesnamn, språk eller kod.</ComboboxEmpty>
        <ComboboxList>{(item: Item) => <ComboboxItem key={item.key} value={item}><span>{item.label}</span></ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
    <small id={`${id}-help`} className="elective-muted">Sök i den inlästa Skolverketskatalogen. Endast innehåll som ryms i timplansramen kan väljas.</small>
    {error && <p id={`${id}-error`} className="elective-field-error">{error}</p>}
  </div>;
}
