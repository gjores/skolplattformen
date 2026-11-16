// Endast den riktiga datumdialogen med syntetiskt kalenderunderlag; ingen lagring eller serverkontroll.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DatumFlytt } from '../../app/schema/datum-flytt';
import { datumFixture } from '../../lib/schema-datum-fixture.mjs';
import { schemaDatumOriginal } from '../../lib/schema-datum';
import '../../app/globals.css';
function Preview() {
  const [saved, setSaved] = useState('Ingen ändring'), [open, setOpen] = useState(true), x = datumFixture();
  const f = { ...x.f, period: new URLSearchParams(location.search).get('period') === 'lasar' ? 'lasar' as const : 'ht' as const };
  const occurrence = schemaDatumOriginal(f, { lesson: x.of('Franska')!.id, originalDate: '2026-11-03' })!;
  return <main className="p-4"><output data-saved>{saved}</output>{open && <DatumFlytt occurrence={occurrence} forslag={f} busy={false} error={null} salScope={null} datedOverrides={[]} onSessionLost={() => {}} onSave={change => setSaved(JSON.stringify(change))} onClose={() => setOpen(false)} onBase={() => setSaved('Grundschema valt')}/>}</main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
