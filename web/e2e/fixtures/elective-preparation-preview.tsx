import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedElectivePreparation from '../../app/protected-elective-preparation';
import ElectivePreparationLauncher from '../../app/elective-preparation-launcher';
import { UnsavedChangesProvider, useHasUnsaved, confirmDiscard } from '../../lib/unsaved-changes';
import { setKnownEpoch } from '../../lib/server-client';
import { identity, scope, grScope } from './elective-preparation-data';
import '../../app/globals.css';
setKnownEpoch(1);
const query = new URLSearchParams(location.search);
function Preview() {
  const [destination, setDestination] = useState(''), [, refresh] = useState(0);
  const blocked = useHasUnsaved('navigation-block:'), dirty = useHasUnsaved();
  const current = query.has('gr') ? grScope : scope;
  const go = (value: string) => { if (!blocked && (!dirty || confirmDiscard())) setDestination(value); };
  const openBlocks = (context: {unitId:string;schoolYear:number}) => go(`Valbara block för ${context.unitId} läsår ${context.schoolYear}`);
  const openTimplan = (context: typeof current) => go(`Timplaner för ${context.unitId} läsår ${context.schoolYear}`);
  if (destination) return <p>{destination}</p>;
  return <><button style={{minHeight:44,padding:'8px 16px'}} disabled={blocked} onClick={() => { if (!dirty || confirmDiscard()) setDestination('Annan arbetsyta öppnad'); }}>Till annan vy</button>
    {query.has('launcher') ? <ElectivePreparationLauncher choices={query.has('nochoices') ? [] : [{...current,label:'SA27 – godkänd timplan'}]} unitId={current.unitId} schoolYear={current.schoolYear} identityKey={identity} contextEpoch={1}
      initialIntent={query.has('intent') ? {...current,rowKey:'block:mosp'} : undefined} onSessionLost={() => setDestination('Inloggningen har avslutats')} onApplied={() => refresh(value => value + 1)} onTjanst={() => setDestination('Bemanning öppnad')} onOpenBlocks={openBlocks} onOpenSourceTimplan={openTimplan}/>
    : <ProtectedElectivePreparation scope={current} identityKey={identity} contextEpoch={1} initialRows={query.has('initial') ? ['block:mosp'] : undefined}
      onOpenBlocks={openBlocks} onOpenTimplan={openTimplan} onSessionLost={() => setDestination('Inloggningen har avslutats')} onClose={() => setDestination('Tillbaka till arbetsytan')} onApplied={blocks => setDestination(`Bemanning för ${blocks.length} befintliga block`)}/>}</>;
}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Preview/></UnsavedChangesProvider>);
