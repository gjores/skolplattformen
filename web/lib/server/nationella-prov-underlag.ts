/** Katalogen hämtas med samma skolenhets- och läsårsmandat som källvyerna. Inga elevuppgifter lämnar servern. */
import type { NationellaProvUnderlag } from '../nationella-prov.ts';
import { schemaTime } from '../schema-kalender.ts';
import { findSubject, label } from '../syllabus.ts';
import type { TjanstPlanRead } from '../tjanst-contract.ts';
import type { Context } from './authz.ts';
import type { Tx } from './db.ts';
import { logEvent } from './events.ts';
import { lasarRead } from './lasar.ts';
import { readSkolsalar } from './skolsalar.ts';
import { personalRead, planRead } from './tjanst.ts';

export function nationellaProvDeltagare(plan: Pick<TjanstPlanRead, 'classes' | 'groups'>): NationellaProvUnderlag['deltagare'] {
  const klasser = plan.classes.filter(c => c.link?.schoolform === 'gymnasium');
  const andraKlasser = new Set(plan.classes.filter(c => c.link && c.link.schoolform !== 'gymnasium').map(c => c.classId));
  return [
    ...klasser.flatMap(c => {
      const undervisningar = c.needs.filter(n => !n.organizationPending && !n.rowKey.startsWith('block:'))
        .map(n => ({ ref: `undervisning:${n.sourceKey}`, title: n.label }));
      return undervisningar.length ? [{ slag: 'klass' as const, ref: c.classId, name: c.name, undervisningar }] : [];
    }),
    ...(plan.groups ?? []).flatMap(g => {
      if (g.stale || !g.subjectCode || !g.levelCode || g.classIds.some(id => andraKlasser.has(id))) return [];
      const subject = findSubject(g.subjectCode);
      if (subject?.typeOfSyllabus === 'COURSE_SYLLABUS') return [];
      const title = subject && subject.items.some(item => item.code === g.levelCode)
        ? label({ subject: subject.code, item: g.levelCode, version: subject.version })
        : `${g.label} (${g.subjectCode} · ${g.levelCode})`;
      return [{ slag: 'grupp' as const, ref: g.groupId, name: g.name, undervisningar: [{ ref: `undervisning:${g.sourceKey}`, title }] }];
    }),
  ].sort((a, b) => a.slag.localeCompare(b.slag) || a.name.localeCompare(b.name, 'sv') || a.ref.localeCompare(b.ref));
}

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
  return { gallerGymnasiet: true, deltagare: nationellaProvDeltagare(plan.body), salar,
    vakter: [...vakter].map(([ref, name]) => ({ ref, name })).sort((a, b) => a.name.localeCompare(b.name, 'sv') || a.ref.localeCompare(b.ref)),
    skoldagar: time.dates?.filter(d => d.schoolDay && d.term !== null).map(d => d.date) ?? null };
}
