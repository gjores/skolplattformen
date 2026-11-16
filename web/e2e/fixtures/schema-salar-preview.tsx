import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Flyttpanel, type FlyttMal } from '../../app/schema/flytt.tsx';
import type { SchemaForslag, SchemaKontrollRequest } from '../../lib/schema-contract.ts';
import { setKnownEpoch } from '../../lib/server-client.ts';
import base from '../schema-fixture';
import '../../app/globals.css';
import '../../app/schema.css';

const roomless = new URLSearchParams(location.search).has('rooms'), locked = new URLSearchParams(location.search).has('locked');
const rooms = roomless ? [] : [{ id: 'sal-1', name: 'A101' }, { id: 'sal-2', name: 'A102' }, { id: 'sal-3', name: 'Laboratorium' }];
const lesson = { ...base.lessons[0], id: 'pass-1', title: 'Matematik', durationMin: 70, marginBeforeMin: 10, marginMin: 15, day: 1, startMin: 540,
  roomIds: roomless ? [] : ['sal-1', 'sal-2'], roomId: roomless ? null : 'sal-1' };
const forslag = { ...base, rooms, lessons: [lesson], villkor: { ...base.villkor, salar: rooms.map(r => r.name) } } as unknown as SchemaForslag;
const scope: SchemaKontrollRequest = { unitId: forslag.unitId, schoolYear: forslag.schoolYear, period: forslag.period, villkor: forslag.villkor,
  contractVersion: forslag.contractVersion, grundFingerprint: forslag.grundFingerprint, placements: [{ lesson: lesson.id, day: 1, startMin: 540, room: lesson.roomId }] };
function Preview() {
  const [target, setTarget] = useState<FlyttMal>({ day: 0, startMin: 600, room: null }), [moves, setMoves] = useState(0);
  useEffect(() => { const update = (event: Event) => setTarget(t => ({ ...t, startMin: (event as CustomEvent<number>).detail }));
    window.addEventListener('schema-sal-test-target', update); return () => window.removeEventListener('schema-sal-test-target', update); }, []);
  return <main className="schema-workspace min-w-0 p-4"><h1 className="page-heading">Flytta ett pass</h1><p>Genomförda flyttar: <output data-moves>{moves}</output></p>
    <Flyttpanel lesson={forslag.lessons[0]} forslag={forslag} target={target} checking={false} shownMin={70} extra={{ someWeeks: '', termTag: '' }}
      locked={locked ? 'Passet är låst. Lås upp det innan du flyttar det.' : undefined} salRequest={scope} roomName={id => rooms.find(r => r.id === id)?.name ?? 'Ingen sal'}
      onTarget={setTarget} onMove={() => setMoves(n => n + 1)} onPark={() => {}} onCancel={() => {}}/>
  </main>;
}
setKnownEpoch(1); createRoot(document.getElementById('root')!).render(<Preview/>);
