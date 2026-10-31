import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ElectiveChoiceForm from '../../app/elective-choice-form';
import '../../app/elective-blocks.css';
function Preview() {
  const [selected, setSelected] = useState<string[]>([]), [sent, setSent] = useState<string[]>([]);
  const single = new URLSearchParams(location.search).has('single');
  return <main className="elective-self-page elective-workspace"><h1>Gör ditt val</h1>
    <ElectiveChoiceForm title="Individuellt val" minChoices={single ? 1 : 2} maxChoices={single ? 1 : 2} selected={selected} onChange={setSelected}
      options={Array.from({ length: 8 }, (_, index) => ({ id: String(index + 1), name: index === 0 ? 'Franska' : index === 1 ? 'Spanska' : `Alternativ ${index + 1}`, description: 'Ett syntetiskt erbjudande', ...(index === 7 ? { unavailableReason: 'Kan inte väljas i den här valomgången' } : {}) }))}/>
    <button disabled={selected.length !== (single ? 1 : 2)} onClick={() => setSent(selected)}>Lämna val</button>
    <output aria-label="Inlämnade val">{sent.join(',')}</output>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
