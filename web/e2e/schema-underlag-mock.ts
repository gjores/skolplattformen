// Syntetiskt underlag före första förslaget för gränssnittsprov (05.2-SM-UXFLODE). Salar och salbehov räknas med appens egna funktioner,
// så att provens salbild följer villkoren som servern skulle ha gjort. Elevantalet är påhittat: 22 per klass, okänt för Klass 3.
import type { Page } from '@playwright/test';
import rawForslag from './schema-fixture';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaVillkor } from '../lib/schema-contract.ts';
import { gallandeSalbehov, lampligaSalar } from '../lib/schema-salregister.ts';
import { aktivitetsPassId } from '../lib/schema-aktiviteter.ts';

export const headers = { 'X-Context-Epoch': '1' };
export const bas = { ...rawForslag, contractVersion: SCHEMA_CONTRACT_VERSION } as unknown as SchemaForslag;
const klassnamn = new Map(bas.classes.map(c => [c.id, c.name]));
export const elever = (klasser: string[]) => klasser.includes('Klass 3') ? null : 22 * klasser.length;
/** Passens salar enligt villkoren: salregistrets ID och salbehovens snitt, som i `buildSchemaUnderlag`. */
export function medSalar(f: SchemaForslag, villkor: SchemaVillkor): SchemaForslag {
  const register = villkor.salregister;
  f.villkor = villkor; f.rooms = register ? register.salar.map(s => ({ id: s.id, name: s.name })) : villkor.salar.map((name, i) => ({ id: `sal-${i + 1}`, name }));
  if (!register) return f;
  f.lessons = f.lessons.map(l => {
    if (l.egenAktivitet) return l;
    const klasser = l.classIds.map(id => klassnamn.get(id) ?? id), rad = bas.fordelning.find(r => r.title === l.title && r.classes.join() === klasser.join()) ?? bas.fordelning.find(r => r.title === l.title)!;
    const g = gallandeSalbehov(villkor.salbehov, rad.ref, rad.title), antal = elever(rad.classes);
    if (!g) return { ...l, roomIds: [], sal: { undervisning: rad.ref, lage: 'obesvarat' as const, kalla: null, elever: antal } };
    const urval = lampligaSalar(register, g.behov, antal);
    return { ...l, roomIds: urval.tillatna, roomId: l.roomId !== null && urval.tillatna.includes(l.roomId) ? l.roomId : null,
      sal: { undervisning: rad.ref, lage: g.behov.lage, kalla: g.kalla, elever: antal, ...(urval.hinder ? { hinder: urval.hinder } : {}), ...(urval.tillatna.length ? { kapacitet: urval.kapacitet } : {}) } };
  });
  return f;
}
/** Underlaget utan beräkning: samma pass, inget lagt. */
export function olagt(villkor: SchemaVillkor): SchemaForslag {
  const f = structuredClone(bas);
  f.lessons = f.lessons.map(l => ({ ...l, day: null, startMin: null, roomId: null })); f.status = 'cancelled'; delete f.locks;
  // Egna aktiviteter i villkoren blir egna pass, olagda som allt annat i underlaget.
  for (const a of villkor.aktiviteter ?? []) f.lessons.push({ id: aktivitetsPassId(a.id), title: a.name,
    classIds: a.classRefs.flatMap(ref => { const n = f.resurser.klass.findIndex(c => c.ref === ref); return n >= 0 ? [`grupp-${n + 1}`] : []; }),
    teacherIds: a.teacherRefs.flatMap(ref => { const n = f.resurser.larare.findIndex(t => t.ref === ref); return n >= 0 ? [`larare-${n + 1}`] : []; }), roomIds: [], roomId: null, durationMin: a.durationMin,
    marginMin: 0, marginBeforeMin: 0, vacant: false, term: null, day: null, startMin: null, egenAktivitet: { id: a.id, typId: a.typId, typ: a.typ, veckor: a.veckor, visibleFor: a.visibleFor } });
  f.metrics = { ...f.metrics, lessons: f.lessons.length, placed: 0, unplaced: f.lessons.length };
  return medSalar(f, villkor);
}
export async function mockUnderlag(page: Page) {
  const bodies: { villkor: SchemaVillkor }[] = [];
  await page.route('**/api/schema/underlag', route => {
    const body = route.request().postDataJSON() as { villkor: SchemaVillkor }; bodies.push(body);
    return route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, beraknat: false, forslag: olagt(body.villkor) } });
  });
  return bodies;
}
/** Räknar varje anrop som skulle ha startat en beräkning. Proven för förutsättningar ska aldrig göra ett. */
export async function utanBerakning(page: Page) {
  const anrop: unknown[] = [];
  for (const rutt of ['forslag', 'diagnos']) await page.route(`**/api/schema/${rutt}`, route => { anrop.push(route.request().postDataJSON()); return route.abort(); });
  return anrop;
}
/** Ett beräknat förslag med fixturens lagda pass och salbilden enligt villkoren. Passen har tid men ingen sal. */
export function lagt(villkor: SchemaVillkor): SchemaForslag { return medSalar(structuredClone(bas), villkor); }
