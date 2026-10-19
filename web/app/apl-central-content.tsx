'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AplCentralItem, AplCentralSelection, AplContent } from '@/lib/apl-plan.ts';
import { syllabusRefFromRowKey, type CentralLevel } from '@/lib/syllabus-central.ts';
import { loadCentralSubject } from '@/lib/syllabus-central-load.ts';
import centralIndex from '@/lib/syllabus-central.index.json';

export const CENTRAL_CATALOG_ID = centralIndex.catalogId;
type Loaded = { state: 'loading' } | { state: 'missing' } | { state: 'ready'; level: CentralLevel; subjectName: string };

function useCentralLevel(rowKey: string): Loaded | null {
  const ref = syllabusRefFromRowKey(rowKey), key = ref ? `${ref.subject}-${ref.version}:${ref.level}` : null;
  const [loaded, setLoaded] = useState<{ key: string; value: Loaded } | null>(null);
  useEffect(() => {
    if (!key) return;
    let live = true;
    const [subjectVersion, level] = key.split(':'), dash = subjectVersion.lastIndexOf('-');
    loadCentralSubject(subjectVersion.slice(0, dash), Number(subjectVersion.slice(dash + 1))).then(subject => {
      const found = subject?.levels.find(l => l.code === level);
      if (live) setLoaded({ key, value: found && subject ? { state: 'ready', level: found, subjectName: subject.name } : { state: 'missing' } });
    }).catch(() => { if (live) setLoaded({ key, value: { state: 'missing' } }); });
    return () => { live = false; };
  }, [key]);
  if (!key) return null;
  return loaded?.key === key ? loaded.value : { state: 'loading' };
}

/** Kryssrutor för ämnesnivåns centrala innehåll. Ordningen följer ämnesplanen. */
export function AplCentralPicker({ rowKey, value, disabled, onChange }: {
  rowKey: string; value: AplCentralSelection | undefined; disabled: boolean; onChange: (value: AplCentralSelection | undefined) => void;
}) {
  const loaded = useCentralLevel(rowKey);
  if (!loaded) return <p>Centralt innehåll kan väljas först när kursen är en bestämd ämnesnivå.</p>;
  if (loaded.state === 'loading') return <output>Läser ämnesplanens centrala innehåll…</output>;
  const selected = value?.items ?? [];
  const current = value === undefined || value.catalogId === CENTRAL_CATALOG_ID;
  const catalogItems = loaded.state === 'ready' ? loaded.level.sections.flatMap(s => s.items.map(i => ({ itemKey: i.key, heading: s.heading, text: i.text }))) : [];
  const known = new Set(current ? catalogItems.map(i => i.itemKey) : []);
  const stale = selected.filter(i => !known.has(i.itemKey));
  const emit = (items: AplCentralItem[]) => onChange(items.length ? { catalogId: current ? CENTRAL_CATALOG_ID : value!.catalogId, items } : undefined);
  const toggle = (item: AplCentralItem, on: boolean) => {
    const keys = new Set(selected.map(i => i.itemKey)); if (on) keys.add(item.itemKey); else keys.delete(item.itemKey);
    emit([...catalogItems.filter(i => keys.has(i.itemKey)), ...stale.filter(i => keys.has(i.itemKey))]);
  };
  const count = selected.length - stale.length;
  return <details className="apl-details apl-central" open={selected.length > 0 || undefined}>
    <summary>Centralt innehåll ({count} av {catalogItems.length} valda)</summary>
    {loaded.state === 'missing' || catalogItems.length === 0
      ? <p>Appens katalog anger inget centralt innehåll för den här nivån. Beskriv innehållet under Arbetsmoment eller Övrigt innehåll.</p>
      : <><p>Kryssa i de delar av ämnesplanens centrala innehåll som eleven ska arbeta med på arbetsplatsen.</p>
        {!current && <p className="apl-notice">Valen gjordes mot en äldre katalog. Ta bort dem och välj på nytt ur den aktuella ämnesplanen.</p>}
        {loaded.level.sections.map((section, index) => <fieldset key={index} className="apl-central-section" disabled={disabled || !current}>
          {section.heading && <legend>{section.heading}</legend>}
          {section.items.map(item => { const entry = { itemKey: item.key, heading: section.heading, text: item.text };
            return <label key={item.key} className="apl-check"><input type="checkbox" checked={selected.some(i => i.itemKey === item.key)} onChange={e => toggle(entry, e.target.checked)}/>{item.text}</label>; })}
        </fieldset>)}</>}
    {stale.length > 0 && <div className="apl-notice"><p>Dessa sparade punkter finns inte i appens aktuella katalog för nivån:</p>
      <ul>{stale.map(i => <li key={i.itemKey}>{i.text}</li>)}</ul>
      <Button variant="outline" disabled={disabled} onClick={() => emit(selected.filter(i => known.has(i.itemKey)))}>Ta bort punkter som inte finns i katalogen</Button></div>}
  </details>;
}

/** Läsvy av en innehållspost: kurs, arbetsmoment, valt centralt innehåll och övrigt innehåll. */
export function AplContentSummary({ content, name }: { content: AplContent; name?: string }) {
  const loaded = useCentralLevel(content.rowKey);
  const shown = name ?? (loaded?.state === 'ready' ? `${loaded.subjectName} ${loaded.level.name}` : 'Ämnesinnehåll');
  const groups: { heading: string | null; items: AplCentralItem[] }[] = [];
  for (const item of content.central?.items ?? []) {
    const last = groups.at(-1);
    if (last && last.heading === item.heading) last.items.push(item); else groups.push({ heading: item.heading, items: [item] });
  }
  return <li className="apl-content-summary"><strong>{shown}</strong>: {content.description || 'Arbetsmoment behöver beskrivas'}
    {groups.length > 0 && <div><p>Centralt innehåll ({content.central!.items.length} {content.central!.items.length === 1 ? 'punkt' : 'punkter'}):</p>
      <ul>{groups.flatMap((group, index) => group.heading ? [<li key={index}><em>{group.heading}</em><ul>{group.items.map(i => <li key={i.itemKey}>{i.text}</li>)}</ul></li>] : group.items.map(i => <li key={i.itemKey}>{i.text}</li>))}</ul></div>}
    {content.otherContent && <p className="whitespace-pre-wrap break-words">Övrigt innehåll: {content.otherContent}</p>}
  </li>;
}
