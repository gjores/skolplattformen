// Veckorutnätet med syntetiska lager (05.2-SM-YTA): fält, nedtoning och band ritas från fixturen, inte från villkor.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Vecka, Teckenforklaring } from '../../app/schema/vecka';
import type { SchemaForslag } from '../../lib/schema-contract';
import type { SchemaBand, SchemaDimmed, SchemaOverlay } from '../../lib/schema-utkast';
import data from './schema-forslag.json' with { type: 'json' };
import '../../app/globals.css';
import '../../app/schema.css';

const forslag = data as unknown as SchemaForslag;
const klass = forslag.classes[0].id;
const lessons = forslag.lessons.filter(l => l.day !== null && l.classIds.includes(klass) && (l.term === null || l.term === 'ht'));
const overlays: SchemaOverlay[] = [
  { day: 0, startMin: 480, endMin: 720, kind: 'sparrad', label: 'Spärrad · Klass 1 · 08:00–12:00', sourceId: 'egna:0' },
  ...[0, 1, 2, 3, 4].map(day => ({ day, startMin: 660, endMin: 780, kind: 'lunch' as const, label: 'Lunch', sourceId: 'lunch' })),
];
const dimmed: SchemaDimmed[] = [{ day: 4, startMin: 900, endMin: 990 }];
const bands: SchemaBand[] = [
  { lesson: 'pass-19', side: 'fore', minutes: 10, label: 'Omklädning 10 min' },
  { lesson: 'pass-19', side: 'efter', minutes: 15, label: 'Dusch 15 min' },
  { lesson: 'pass-13', side: 'efter', minutes: 10, label: 'Restid 10 min', kind: 'restid' },
];
const flagged = new Set(['pass-7']);
const noop = () => {};
function Preview() {
  const layers = new URLSearchParams(location.search).get('lager') !== 'nej';
  const shown = layers ? { overlays, bands, dimmed } : {};
  return <section className="valplan-workspace schema-workspace">
    <Vecka days={forslag.days} lessons={lessons} picked="pass-34" drop={null} flagged={flagged} disabled={false} length={l => l.durationMin} detail={() => 'Provlärare'} onGrab={noop} onPick={noop} {...shown}/>
    <Teckenforklaring lessons={lessons} picked="pass-34" flagged={flagged} {...shown}/>
  </section>;
}
createRoot(document.getElementById('root')!).render(<main style={{ padding: 16 }}><Preview/></main>);
