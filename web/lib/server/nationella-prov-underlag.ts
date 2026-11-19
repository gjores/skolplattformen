/** Katalogen hämtas med samma skolenhets- och läsårsmandat som källvyerna. Inga elevuppgifter lämnar servern. */
import type { NationellaProvUnderlag } from '../nationella-prov.ts';
import { schemaTime } from '../schema-kalender.ts';
import { nationellaProvDeltagare } from '../nationella-prov-deltagare.ts';
import type { Context } from './authz.ts';
import type { Tx } from './db.ts';
import { logEvent } from './events.ts';
import { lasarRead } from './lasar.ts';
import { readSkolsalar } from './skolsalar.ts';
import { personalRead, planRead } from './tjanst.ts';

export async function readNationellaProvUnderlag(tx: Tx, ctx: Context, unitId: string, schoolYear: number): Promise<NationellaProvUnderlag> {
  const target = { kind: 'school' as const, unitId };
  let lasar = await lasarRead(tx, { target, schoolYear, versionId: null }, ctx);
  const current = lasar.body.versions.find(v => v.current);
  if (current && lasar.body.calendar?.versionId !== current.versionId) {
    lasar = await lasarRead(tx, { target, schoolYear, versionId: current.versionId }, ctx);
  }
  await logEvent(tx, ctx, { ...lasar.event, outcome: 'ok' });
  if (!lasar.body.schoolTypes.includes('GY')) return { gallerGymnasiet: false, deltagare: [], salar: [], vakter: [], skoldagar: null };
  const plan = await planRead(tx, { unitId, schoolYear }, ctx);
  await logEvent(tx, ctx, { ...plan.event, outcome: 'ok' });
  const salar = (await readSkolsalar(tx, ctx, unitId))?.document.salar.map(({ id, name }) => ({ id, name })) ?? [];
  const vakter = new Map(plan.body.teachers.filter(t => !t.draft).map(t => [t.personId, t.displayName]));
  if (ctx.accessFunction === 'rektor') {
    const personal = await personalRead(tx, { unitId }, ctx);
    await logEvent(tx, ctx, { ...personal.event, outcome: 'ok' });
    vakter.clear();
    for (const p of personal.body.people) {
      if (p.status === 'active' && p.duties.some(d => d.unitId === unitId && d.startsOn <= `${schoolYear + 1}-06-30`
        && (d.endsOn === null || d.endsOn >= `${schoolYear}-07-01`))) {
        vakter.set(p.id, `${p.givenName} ${p.familyName}`.trim());
      }
    }
  }
  const time = schemaTime(lasar.body, plan.body.classes.map(c => c.classId));
  const { ht, vt } = time.terms;
  return { gallerGymnasiet: true, deltagare: nationellaProvDeltagare(plan.body), salar,
    vakter: [...vakter].map(([ref, name]) => ({ ref, name })).sort((a, b) => a.name.localeCompare(b.name, 'sv') || a.ref.localeCompare(b.ref)),
    ...(ht.span && vt.span && { terminer: { ht: ht.span, vt: vt.span } }),
    skoldagar: time.dates?.filter(d => d.schoolDay && d.term !== null).map(d => d.date) ?? null };
}
