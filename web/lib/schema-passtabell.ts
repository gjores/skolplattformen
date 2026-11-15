// Alla pass i en tabell (05.2-SM-PASSTABELL, research Q128–Q132): en rad per pass ur utkastets placeringar, också passen på viloytan.
// Rena funktioner utan React: rader, status ur kontrollens svar, filter, sökning, sortering och gruppering per undervisning.
// Tabellen och veckan är två vyer av samma utkast. Inget sparas, och tabellen visar namn och förslagets löpnummer, inga externa ID.
import type { SchemaForslag, SchemaRegel, SchemaTerm, SchemaViolation } from './schema-contract.ts';
import { avvikelseRad, resursRefs } from './schema-utkast.ts';
import { schemaDateText, schemaTillfallen, type SchemaVeckaVal } from './schema-vecka.ts';
import { aktivitetsVeckorText } from './schema-aktiviteter.ts';

export type PassStatus = 'lagd' | 'viloyta' | 'avvikelse' | 'last';
export const PASS_STATUS: Record<PassStatus, string> = { last: 'Låst', lagd: 'Lagd', viloyta: 'Viloyta', avvikelse: 'Regelavvikelse' };
const VECKODAGAR = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
const klocka = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** En rad i passtabellen. `dag` och `start` är null för pass på viloytan. Namnen är förslagets; id är förslagets löpnummer. */
export type PassRad = {
  id: string; undervisning: string;
  /** Daterad rad har eget rad-ID men meny och flytt använder fortfarande grundschemats pass-ID. */
  lessonId?: string; datum?: string;
  aktivitetTyp?: string;
  aktivitetVeckor?: string;
  /** Undervisningen raden hör till: ämnet och klasserna, som i Tid över läsåret. */
  nyckel: string;
  klasser: { id: string; namn: string }[]; grupper: { id: string; namn: string }[]; larare: { id: string; namn: string }[];
  /** Pass utan lärare i underlaget. */
  vakant: boolean;
  salId: string | null; sal: string;
  dag: number | null; start: number | null;
  /** Längd som den visas i veckan (justerad längd för terminen), och längden i grundschemat. */
  langd: number; grundLangd: number;
  termin: SchemaTerm | null;
  /** Tillfällen som är kortare vissa veckor ("kortare n veckor"). */
  kortareVeckor: number;
  marginalFore: number; marginalEfter: number;
  status: PassStatus;
  last?: boolean;
  /** Orsaken till en regelavvikelse, ur kontrollens svar. */
  orsak: string | null;
  /** Text för sökning, i gemener. */
  sok: string;
};

export type PassTabellUnderlag = Pick<SchemaForslag, 'lessons' | 'classes' | 'teachers' | 'rooms' | 'resurser' | 'trims' | 'period'> & Partial<Pick<SchemaForslag, 'time'>>;

/** Undervisningens nyckel: ämnet och klassernas namn i bokstavsordning, så att den kan jämföras med Tid över läsåret. */
export const undervisningsNyckel = (titel: string, klasser: string[]) => `${titel}|${[...klasser].sort((a, b) => a.localeCompare(b, 'sv')).join(',')}`;

/**
 * Passtabellens rader. `term` är terminen veckan visar: ett pass som går hela läsåret visas med sin längd den terminen, som i veckan.
 * `violations` är kontrollens svar för villkoren som prövas (null när ingen kontroll har körts); `egna` är de egna villkor som prövas.
 */
export function passRader(f: PassTabellUnderlag, term: SchemaTerm, violations: SchemaViolation[] | null, egna: SchemaRegel[], visning?: SchemaVeckaVal): PassRad[] {
  if (visning && visning.mode !== 'grundschema' && f.time?.calendar) {
    const base = new Map(passRader(f, term, violations, egna).map(r => [r.id, r]));
    return schemaTillfallen({ lessons: f.lessons, trims: f.trims, time: f.time }, visning).flatMap(o => {
      const r = base.get(o.lesson.id);
      return r ? [{ ...r, id: o.key, lessonId: o.lesson.id, datum: o.date, langd: o.length, termin: o.term, kortareVeckor: 0,
        sok: `${r.sok} ${o.date} ${schemaDateText(o.date)}`.toLocaleLowerCase('sv-SE') }] : [];
    });
  }
  const refs = resursRefs(f), klass = new Map(f.classes.map(c => [c.id, c.name])), larare = new Map(f.teachers.map(t => [t.id, t.name])), salar = new Map(f.rooms.map(r => [r.id, r.name]));
  const trims = new Map(f.trims.map(t => [`${t.lesson}|${t.term}`, t]));
  const perPass = new Map<string, SchemaViolation[]>();
  for (const v of violations ?? []) for (const id of v.lessons) { const list = perPass.get(id); if (list) list.push(v); else perPass.set(id, [v]); }
  return f.lessons.map(l => {
    const delar = l.classIds.map(id => ({ id, namn: klass.get(id) ?? '', slag: refs.get(id)?.slag }));
    const klasser = delar.filter(x => x.slag !== 'grupp').map(({ id, namn }) => ({ id, namn })), grupper = delar.filter(x => x.slag === 'grupp').map(({ id, namn }) => ({ id, namn }));
    const lar = l.teacherIds.map(id => ({ id, namn: larare.get(id) ?? '' }));
    const trim = trims.get(`${l.id}|${l.term ?? (f.period === 'lasar' ? term : f.period)}`);
    const lagd = l.day !== null && l.startMin !== null, brott = lagd ? perPass.get(l.id) ?? [] : [];
    const status: PassStatus = !lagd ? 'viloyta' : brott.length ? 'avvikelse' : l.locked ? 'last' : 'lagd';
    const orsak = brott.length ? avvikelseRad(f, egna, brott.map(v => v.code), l) ?? brott[0].message : null;
    const sal = l.roomId ? salar.get(l.roomId) ?? '' : '';
    const rad: Omit<PassRad, 'sok'> = {
      id: l.id, undervisning: l.title, nyckel: undervisningsNyckel(l.title, klasser.map(x => x.namn)), klasser, grupper, larare: lar, vakant: l.vacant && l.teacherIds.length === 0,
      salId: l.roomId, sal, dag: lagd ? l.day : null, start: lagd ? l.startMin : null, langd: l.durationMin - (trim?.fixedMin ?? 0), grundLangd: l.durationMin,
      termin: l.term, kortareVeckor: trim?.extraCount ?? 0, marginalFore: l.marginBeforeMin, marginalEfter: l.marginMin, status, last: !!l.locked, orsak,
      ...(l.egenAktivitet ? { aktivitetTyp: l.egenAktivitet.typ, aktivitetVeckor: aktivitetsVeckorText(l.egenAktivitet.veckor) } : {}),
    };
    const sok = [rad.undervisning, ...klasser.map(x => x.namn), ...grupper.map(x => x.namn), ...lar.map(x => x.namn), sal, rad.dag === null ? 'viloyta' : VECKODAGAR[rad.dag],
      rad.start === null ? '' : klocka(rad.start), PASS_STATUS[status], orsak ?? '', rad.aktivitetTyp ?? ''].join(' ').toLocaleLowerCase('sv-SE');
    return { ...rad, sok };
  });
}

// ── Filter ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type PassFilterTyp = 'klass' | 'grupp' | 'larare' | 'sal' | 'dag' | 'status' | 'termin';
export const PASS_FILTER: { typ: PassFilterTyp; namn: string }[] = [
  { typ: 'klass', namn: 'Klass' }, { typ: 'grupp', namn: 'Grupp' }, { typ: 'larare', namn: 'Lärare' }, { typ: 'sal', namn: 'Sal' },
  { typ: 'dag', namn: 'Dag' }, { typ: 'status', namn: 'Status' }, { typ: 'termin', namn: 'Termin' },
];
/** Ett valt filter. `varde` är löpnummer (klass, grupp, lärare, sal), dagens nummer, status, terminen (`ht`, `vt`) eller `viloyta` för dag. */
export type PassFilter = { typ: PassFilterTyp; varde: string };

/** Filtrets värde för raden: de värden raden har för filtertypen. */
function varden(r: PassRad, typ: PassFilterTyp): string[] {
  switch (typ) {
    case 'klass': return r.klasser.map(x => x.id);
    case 'grupp': return r.grupper.map(x => x.id);
    case 'larare': return r.vakant ? ['ingen'] : r.larare.map(x => x.id);
    case 'sal': return [r.salId ?? 'ingen'];
    case 'dag': return [r.dag === null ? 'viloyta' : String(r.dag)];
    case 'status': return r.last && r.status !== 'last' ? [r.status, 'last'] : [r.status];
    // Ett pass som går hela läsåret går båda terminerna.
    case 'termin': return r.termin ? [r.termin] : ['ht', 'vt'];
  }
}

/** Valbara värden per filtertyp, med namn, ur raderna. Ordningen är förslagets (klasser, lärare), veckans (dagar) eller bokstavsordning (salar). */
export function filterVal(rader: PassRad[]): Record<PassFilterTyp, { varde: string; namn: string }[]> {
  const samla = (pick: (r: PassRad) => { id: string; namn: string }[]) => {
    const seen = new Map<string, string>();
    for (const r of rader) for (const x of pick(r)) if (!seen.has(x.id)) seen.set(x.id, x.namn);
    return [...seen].map(([varde, namn]) => ({ varde, namn })).sort((a, b) => lopnummer(a.varde) - lopnummer(b.varde) || a.namn.localeCompare(b.namn, 'sv'));
  };
  const salar = samla(r => r.salId ? [{ id: r.salId, namn: r.sal }] : []).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  const dagar = [...new Set(rader.map(r => r.dag))].sort((a, b) => (a ?? 99) - (b ?? 99));
  return {
    klass: samla(r => r.klasser), grupp: samla(r => r.grupper),
    larare: [...samla(r => r.larare), ...rader.some(r => r.vakant) ? [{ varde: 'ingen', namn: 'Ingen lärare' }] : []],
    sal: [...salar, ...rader.some(r => r.salId === null) ? [{ varde: 'ingen', namn: 'Ingen sal' }] : []],
    dag: dagar.map(d => d === null ? { varde: 'viloyta', namn: 'Viloytan' } : { varde: String(d), namn: VECKODAGAR[d] ?? `Dag ${d + 1}` }),
    status: (['lagd', 'last', 'avvikelse', 'viloyta'] as const).filter(s => rader.some(r => r.status === s || s === 'last' && r.last)).map(s => ({ varde: s, namn: PASS_STATUS[s] })),
    termin: (['ht', 'vt'] as const).filter(t => rader.some(r => r.termin === null || r.termin === t)).map(t => ({ varde: t, namn: t === 'ht' ? 'Höstterminen' : 'Vårterminen' })),
  };
}
const lopnummer = (id: string) => Number(/-(\d+)$/u.exec(id)?.[1] ?? Number.MAX_SAFE_INTEGER);

/**
 * Raderna som filtren och sökningen släpper igenom. Flera värden av samma filtertyp räcker att en stämmer (eller); olika filtertyper ska alla stämma (och).
 * Sökningen gäller undervisning, klass, grupp, lärare, sal, dag, tid och status, och varje ord ska finnas.
 */
export function filtreraPass(rader: PassRad[], filter: PassFilter[], sok = ''): PassRad[] {
  const perTyp = new Map<PassFilterTyp, Set<string>>();
  for (const x of filter) { const set = perTyp.get(x.typ); if (set) set.add(x.varde); else perTyp.set(x.typ, new Set([x.varde])); }
  const ord = sok.toLocaleLowerCase('sv-SE').split(/\s+/u).filter(Boolean), typer = [...perTyp];
  if (!typer.length && !ord.length) return rader;
  return rader.filter(r => typer.every(([typ, set]) => varden(r, typ).some(v => set.has(v))) && ord.every(o => r.sok.includes(o)));
}

// ── Sortering ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type PassKolumn = 'undervisning' | 'klass' | 'grupper' | 'larare' | 'sal' | 'dag' | 'tid' | 'langd' | 'termin' | 'veckor' | 'marginal' | 'status';
export const PASS_KOLUMNER: { id: PassKolumn; namn: string }[] = [
  { id: 'undervisning', namn: 'Undervisning' }, { id: 'klass', namn: 'Klass' }, { id: 'grupper', namn: 'Grupper' }, { id: 'larare', namn: 'Lärare' },
  { id: 'sal', namn: 'Sal' }, { id: 'dag', namn: 'Dag' }, { id: 'tid', namn: 'Tid' }, { id: 'langd', namn: 'Längd' }, { id: 'termin', namn: 'Termin' },
  { id: 'veckor', namn: 'Veckor' }, { id: 'marginal', namn: 'Marginal' }, { id: 'status', namn: 'Status' },
];
export type PassSortering = { kolumn: PassKolumn; stigande: boolean };
const STATUS_ORDNING: Record<PassStatus, number> = { avvikelse: 0, last: 1, lagd: 2, viloyta: 3 };
const TERMIN_ORDNING = { ht: 0, vt: 1, bada: 2 } as const;
/** Veckans ordning: dag och tid, pass på viloytan sist. */
const veckoOrdning = (a: PassRad, b: PassRad) => (a.datum ?? '').localeCompare(b.datum ?? '') || (a.dag ?? 99) - (b.dag ?? 99) || (a.start ?? 0) - (b.start ?? 0);
const namnLista = (x: { namn: string }[]) => x.map(y => y.namn).join(', ');

/** Nycklar för sortering per kolumn, räknade en gång per rad så att 1 000 pass sorteras snabbt. Text jämförs i svensk ordning. */
function nyckelFor(r: PassRad, kolumn: PassKolumn): string | number {
  switch (kolumn) {
    case 'undervisning': return r.undervisning.toLocaleLowerCase('sv-SE');
    case 'klass': return namnLista(r.klasser).toLocaleLowerCase('sv-SE');
    case 'grupper': return namnLista(r.grupper).toLocaleLowerCase('sv-SE');
    case 'larare': return (r.vakant ? '' : namnLista(r.larare)).toLocaleLowerCase('sv-SE');
    case 'sal': return r.sal.toLocaleLowerCase('sv-SE');
    case 'dag': return r.datum ? `${r.datum} ${klocka(r.start ?? 0)}` : (r.dag ?? 99) * 10000 + (r.start ?? 0);
    case 'tid': return (r.start ?? 9999) * 100 + (r.dag ?? 99);
    case 'langd': return r.langd;
    case 'termin': return TERMIN_ORDNING[r.termin ?? 'bada'];
    case 'veckor': return r.kortareVeckor;
    case 'marginal': return r.marginalFore + r.marginalEfter;
    case 'status': return STATUS_ORDNING[r.status];
  }
}
const sv = new Intl.Collator('sv-SE', { numeric: true });

/** Sorterar på en kolumn. Lika värden följer veckans ordning och sedan förslagets löpnummer, så att ordningen är stabil. */
export function sorteraPass(rader: PassRad[], s: PassSortering): PassRad[] {
  const keyed = rader.map(r => ({ r, k: nyckelFor(r, s.kolumn) })), dir = s.stigande ? 1 : -1;
  keyed.sort((a, b) => {
    const c = typeof a.k === 'number' ? a.k - (b.k as number) : sv.compare(a.k, b.k as string);
    return c * dir || veckoOrdning(a.r, b.r) || lopnummer(a.r.id) - lopnummer(b.r.id);
  });
  return keyed.map(x => x.r);
}

// ── Gruppering per undervisning ──────────────────────────────────────────────────────────────────────────────────────────────────
/** En undervisning i tabellen: planerad tid och timplanens tid, samma tal som i Tid över läsåret. `tid` är null när undervisningen saknas där. */
export type PassGrupp = { nyckel: string; undervisning: string; klasser: string[]; rader: PassRad[]; tid: { planeradMin: number; timplanMin: number; utanTid: number } | null };

/**
 * Raderna grupperade per undervisning, i ordningen som undervisningens första rad har efter sorteringen. Raderna i en grupp behåller sorteringen.
 * Tiden hämtas ur förslagets undervisningar (`teachings`), som Tid över läsåret visar, med samma ämne och klasser.
 */
export function grupperaPass(rader: PassRad[], teachings: SchemaForslag['teachings']): PassGrupp[] {
  const tid = new Map(teachings.map(t => [undervisningsNyckel(t.title, t.classes), t])), grupper = new Map<string, PassGrupp>();
  for (const r of rader) {
    const g = grupper.get(r.nyckel);
    if (g) { g.rader.push(r); continue; }
    const t = tid.get(r.nyckel);
    grupper.set(r.nyckel, { nyckel: r.nyckel, undervisning: r.undervisning, klasser: r.klasser.map(x => x.namn), rader: [r],
      tid: t ? { planeradMin: t.plannedMin, timplanMin: t.needMin, utanTid: t.unplaced } : null });
  }
  return [...grupper.values()];
}

// ── Text i cellerna ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const dagText = (r: Pick<PassRad, 'dag' | 'datum'>) => r.dag === null ? 'Viloytan' : `${VECKODAGAR[r.dag] ?? `Dag ${r.dag + 1}`}${r.datum ? ` ${schemaDateText(r.datum)}` : ''}`;
export const tidText = (r: Pick<PassRad, 'start' | 'langd'>) => r.start === null ? '–' : `${klocka(r.start)}–${klocka(r.start + r.langd)}`;
export const terminText = (r: Pick<PassRad, 'termin'>) => r.termin === 'ht' ? 'HT' : r.termin === 'vt' ? 'VT' : 'HT och VT';
export const veckorText = (r: Pick<PassRad, 'kortareVeckor' | 'aktivitetVeckor'>) => r.aktivitetVeckor ?? (r.kortareVeckor === 0 ? '' : `kortare ${r.kortareVeckor === 1 ? 'en vecka' : `${r.kortareVeckor} veckor`}`);
export const marginalText = (r: Pick<PassRad, 'marginalFore' | 'marginalEfter'>) => r.marginalFore + r.marginalEfter === 0 ? '' : `${r.marginalFore || '–'} · ${r.marginalEfter || '–'} min`;

/** Passet i ett ord för skärmläsare och menyns rubrik: ämne, klass, dag och tid eller viloytan. */
export const radNamn = (r: PassRad) => `${r.undervisning}, ${namnLista(r.klasser) || namnLista(r.grupper) || 'ingen klass'}, ${r.dag === null ? 'på viloytan' : `${dagText(r).toLowerCase()} ${tidText(r)}`}`;

