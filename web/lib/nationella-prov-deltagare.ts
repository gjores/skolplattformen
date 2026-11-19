import type { NationellaProvUnderlag, Provniva } from './nationella-prov.ts';
import { findSubject, label } from './syllabus.ts';
import type { TjanstNeed, TjanstPlanRead } from './tjanst-contract.ts';

function nivaForKod(amne: string, niva: string): Provniva | null {
  const subject = findSubject(amne);
  if (!subject || !subject.schoolTypes.includes('GY') || !subject.items.some(item => item.code === niva)) return null;
  return { amne, niva, namn: label({ subject: amne, item: niva, version: subject.version }) };
}

/** Radnyckeln i timplanen binder varje alternativ till ämneskod, version och kurs-/nivåkod. Manuell bokning har kvar undervisningen om radens koder inte går att läsa. */
function klassnivaer(rowKey: string): Provniva[] | undefined {
  const codes = /^(?:alternative:)?(?:foundation|programmeSpecific|orientation|specialization):(.+)$/u.exec(rowKey)?.[1];
  if (!codes) return;
  const nivaer = new Map<string, Provniva>();
  for (const value of codes.split('+')) {
    const match = /^(\p{L}[\p{L}\p{N}_-]*):[1-9]\d{0,5}:(\p{L}[\p{L}\p{N}_-]*)$/u.exec(value);
    const niva = match ? nivaForKod(match[1], match[2]) : null;
    // Om ett alternativ inte kan identifieras ska en träff på de övriga inte förvälja någon.
    if (!niva) return;
    nivaer.set(`${niva.amne}:${niva.niva}`, niva);
  }
  return [...nivaer.values()];
}

function undervisning(n: TjanstNeed, title: string, nivaer: Provniva[] | undefined) {
  // Tjänstefördelningens 50/50-beräkning av äldre årstimmar uppger inte när undervisningen pågår.
  const terminer = n.needBasis === 'even_split' ? undefined
    : { ...(n.needHt !== null && { ht: n.needHt > 0 }), ...(n.needVt !== null && { vt: n.needVt > 0 }) };
  return { ref: `undervisning:${n.sourceKey}`, title, ...(nivaer?.length && { nivaer }), ...(terminer && { terminer }) };
}

export function nationellaProvDeltagare(plan: Pick<TjanstPlanRead, 'classes' | 'groups'>): NationellaProvUnderlag['deltagare'] {
  const klasser = plan.classes.filter(c => c.link?.schoolform === 'gymnasium');
  const andraKlasser = new Set(plan.classes.filter(c => c.link && c.link.schoolform !== 'gymnasium').map(c => c.classId));
  return [
    ...klasser.flatMap(c => {
      const undervisningar = c.needs.filter(n => !n.organizationPending && !n.rowKey.startsWith('block:'))
        .map(n => undervisning(n, n.label, klassnivaer(n.rowKey)));
      return undervisningar.length ? [{ slag: 'klass' as const, ref: c.classId, name: c.name, undervisningar }] : [];
    }),
    ...(plan.groups ?? []).flatMap(g => {
      if (g.stale || !g.subjectCode || !g.levelCode || g.classIds.some(id => andraKlasser.has(id))) return [];
      const subject = findSubject(g.subjectCode);
      if (subject?.typeOfSyllabus === 'COURSE_SYLLABUS') return [];
      const niva = nivaForKod(g.subjectCode, g.levelCode);
      const title = niva?.namn ?? `${g.label} (${g.subjectCode} · ${g.levelCode})`;
      return [{ slag: 'grupp' as const, ref: g.groupId, name: g.name, klassRefs: [...new Set(g.classIds)],
        undervisningar: [undervisning(g, title, niva ? [niva] : undefined)] }];
    }),
  ].sort((a, b) => a.slag.localeCompare(b.slag) || a.name.localeCompare(b.name, 'sv') || a.ref.localeCompare(b.ref));
}
