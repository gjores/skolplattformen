import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedValplaner from '../../app/protected-valplaner';
import ProtectedProgramplanPackageDialog from '../../app/protected-programplan-package-dialog';
import { ChoiceRowDetail, ChoiceRowSummary, type ChoiceRowInfo, type ChoiceRows } from '../../app/timplan-choice-rows';
import { UnsavedChangesProvider, useHasUnsaved, useRequestDiscard } from '../../lib/unsaved-changes';
import { setKnownEpoch } from '../../lib/server-client';
import { unitId, schoolYear, id } from './valplan-data';
import '../../app/globals.css';
import '../../app/protected-gym-timplan.css';
import '../../app/protected-programplan.css';
setKnownEpoch(1);
const query = new URLSearchParams(location.search);
function ChoiceTable() {
  const [open, setOpen] = useState(false), [opened, setOpened] = useState('');
  const info: ChoiceRowInfo = { timplanId: id(11), rowKey: 'block:iv1', year: 2, schoolYear, classNames: query.has('noclasses') ? [] : ['SA26A', 'SA26B'], valplan: query.has('none') || query.has('noclasses') ? null
    : { id: id(5), name: 'Individuellt val 2027/28', courses: [{ id: id(30), name: 'Psykologi – nivå 1', points: 50, minutesHt: 1350, minutesVt: 1350 }, { id: id(31), name: 'Retorik – nivå 1', points: 100, minutesHt: 2700, minutesVt: 2700 }] } };
  const choices: ChoiceRows = { approved: !query.has('draft'), rows: new Map([[info.rowKey, info]]), open: value => setOpened(value.valplan?.id ?? 'nytt block'), openClasses: () => setOpened('klasser') };
  return <><table className="gt-matrix"><tbody><tr><th scope="row"><strong>Individuellt val</strong><span>Valbart block</span><ChoiceRowSummary choices={choices} rowKey={info.rowKey} expanded={open} controls="detail" onToggle={() => setOpen(!open)}/></th></tr>
    {open && <ChoiceRowDetail info={info} id="detail" colSpan={2}/>}</tbody></table>{opened && <output>Öppnade {opened}</output>}</>;
}
function Preview() {
  const requestDiscard = useRequestDiscard(), dirty = useHasUnsaved(), [left, setLeft] = useState(false), [saved, setSaved] = useState('');
  const [timplanId, rowKey, year] = query.get('row')?.split('|') ?? [], row = timplanId ? { timplanId, rowKey, year: Number(year) } : null;
  if (left) return <p>Annan arbetsyta öppnad</p>;
  if (query.has('rows')) return <ChoiceTable/>;
  if (query.has('package')) return <>{saved && <output>Skickat {saved}</output>}<ProtectedProgramplanPackageDialog scope="prov" unitId={unitId} units={[{ id: unitId, name: 'Provskolan', inMandate: true }]} role="rektor" kind="individualChoice" points={200}
    startedOn="2027-07-01" fixedLevelKeys={[]} options={[]} source={null} available={[]} onClose={() => setSaved('stängd')} onSaved={() => setSaved('sparat')} onSecurityFailure={() => false}/></>;
  return <main style={{ padding: 16 }}><button style={{ minHeight: 44 }} onClick={async () => { if (!dirty || await requestDiscard()) setLeft(true); }}>Till annan vy</button>
    <ProtectedValplaner unitId={unitId} schoolYear={schoolYear} scopeKey="prov" initialValplanId={query.get('open')} initialRow={row} onSessionLost={() => setLeft(true)}/></main>;
}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Preview/></UnsavedChangesProvider>);
