import type { SchemaForslag, SchemaForslagLesson } from './schema-contract.ts';
import { samlingResurser, type SamlingResurs } from './schema-samling.ts';
import type { SchemaSparrResurs } from './schema-utkast.ts';

export const VECKORESURSER = {
  klass: { namn: 'Klass', grupp: 'Klasser' },
  grupp: { namn: 'Undervisningsgrupp', grupp: 'Undervisningsgrupper' },
  larare: { namn: 'Lärare', grupp: 'Lärare' },
  sal: { namn: 'Sal', grupp: 'Salar' },
  amne: { namn: 'Ämne', grupp: 'Ämnen' },
} as const;
type Slag = keyof typeof VECKORESURSER;
export type Veckoresurs = { key: string; id: string; slag: Slag; name: string; lektioner?: ReadonlySet<string>; villkor?: SchemaSparrResurs };

export function veckoresurser(f: SchemaForslag, grupper: SamlingResurs[] = []): Veckoresurs[] {
  const register = new Map(grupper.map(r => [r.key, r]));
  const bas = samlingResurser(f);
  const kandaGrupper = new Map(f.resurser.grupp.map(g => [`grupp:${g.ref}`, g]));
  const klassnycklar = new Set(f.resurser.klass.map(r => `klass:${r.ref}`));
  const mappar = bas.filter(r => r.slag !== 'elev' && !kandaGrupper.has(r.key)).map((r): Veckoresurs => {
    // Klassen och läraren använder matchningen mellan förslagets ID och källreferensen i Samlingsvyn.
    const slag = r.slag === 'klass' && !klassnycklar.has(r.key) && Number(r.id.replace('grupp-', '')) > f.resurser.klass.length
      ? 'grupp' : r.slag as Exclude<SamlingResurs['slag'], 'elev'>;
    const ref = r.key.slice(r.key.indexOf(':') + 1);
    return { key: r.key, id: r.id, slag, name: r.name,
      ...(slag === 'sal' || ref !== r.id ? { villkor: { slag, ref, namn: r.name } } : {}),
      ...(slag === 'grupp' ? { lektioner: new Set(r.lessons) } : {}) };
  });
  const aktiviteter = new Map(f.villkor.aktiviteter?.map(a => [a.id, a.groupRefs]));
  const gruppass = new Map<string, Set<string>>();
  for (const pass of f.lessons) {
    const kalle = /^undervisning:(?:teaching_group|study_group):([^:]+)(?::(\d{4}))?$/u.exec(pass.undervisning ?? '');
    const refs = pass.egenAktivitet ? aktiviteter.get(pass.egenAktivitet.id) ?? []
      : kalle && (!kalle[2] || Number(kalle[2]) === f.schoolYear) ? [kalle[1]] : [];
    for (const ref of refs) {
      const ids = gruppass.get(ref) ?? new Set<string>();
      ids.add(pass.id);
      gruppass.set(ref, ids);
    }
  }
  for (const [key, g] of kandaGrupper) {
    const last = register.get(key), direkt = bas.find(r => r.key === key);
    const lektioner = last ? new Set(last.lessons) : new Set([...(direkt?.lessons ?? []), ...(gruppass.get(g.ref) ?? [])]);
    mappar.push({ key, id: last?.id ?? direkt?.id ?? g.ref, name: g.name, slag: 'grupp', lektioner, villkor: { slag: 'grupp', ref: g.ref, namn: g.name } });
  }
  // Underlagets övriga val kan sakna utlagda pass, exempelvis en klass i en terminsvy.
  const medPass = new Set(mappar.map(r => r.key));
  for (const slag of ['klass', 'larare'] as const) for (const r of f.resurser[slag]) {
    const key = `${slag}:${r.ref}`;
    if (!medPass.has(key)) mappar.push({ key, id: r.ref, name: r.name, slag, villkor: { slag, ref: r.ref, namn: r.name } });
  }
  for (const name of new Set([...f.resurser.amne.map(r => r.name), ...f.lessons.filter(l => !l.egenAktivitet).map(l => l.title)])) {
    mappar.push({ key: `amne:${name}`, id: name, name, slag: 'amne', villkor: { slag: 'amne', ref: name, namn: name } });
  }
  // Grupper som kunde identifieras först i gruppläsningen ska bara visas under sin stabila referens.
  const lastaId = new Set(grupper.map(g => g.id));
  return mappar.filter(r => r.slag !== 'grupp' || kandaGrupper.has(r.key) || !lastaId.has(r.id));
}

export function veckoresursPass(r: Veckoresurs | undefined, l: SchemaForslagLesson): boolean {
  switch (r?.slag) {
    case 'klass': return l.classIds.includes(r.id);
    case 'larare': return l.teacherIds.includes(r.id);
    case 'grupp': return r.lektioner?.has(l.id) ?? false;
    case 'sal': return l.roomId === r.id;
    case 'amne': return !l.egenAktivitet && l.title === r.name;
    default: return false;
  }
}
