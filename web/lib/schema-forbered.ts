/**
 * Förbered-ytans checklista (05.2-SM-UXF-31). Sju områden med aktuella värden, maskinens kontroll och ett innehållsavtryck.
 * Människans genomgång sparas med avtrycket; ändras områdets innehåll är genomgången inaktuell. Maskinen bockar aldrig av något,
 * och en saknad uppgift räknas aldrig som fritt utrymme. Bara värden som faktiskt räknas visas; det som inte är byggt står som det.
 */
import { checkSchemaVillkor, type SchemaForslag, type SchemaVillkor } from './schema-contract.ts';
import { saltabellRader } from './schema-saltabell.ts';
import type { NationellaProvDocument } from './nationella-prov.ts';

export const FORBERED_OMRADEN = ['underlag', 'lektioner', 'salar', 'larartider', 'aktiviteter', 'regler', 'mal'] as const;
export type ForberedOmrade = typeof FORBERED_OMRADEN[number];
export const FORBERED_TITEL: Record<ForberedOmrade, string> = { underlag: 'Underlag', lektioner: 'Lektioner och block', salar: 'Salar', larartider: 'Lärartider och fasta tider',
  aktiviteter: 'Aktiviteter och nationella prov', regler: 'Regler och önskemål', mal: 'Mål för schemat' };
/** `saknas`: uppgifter som saknas i området. `nasta`: uppgiften i klartext när något saknas. `atgard`: knappens text. */
export type ForberedPunkt = { id: ForberedOmrade; titel: string; varden: string[]; kontroll: string[]; saknas: number; nasta: string | null; atgard: string; avtryck: string };
export type ForberedIndata = { kalla: SchemaForslag | null; villkor: SchemaVillkor; /** Låsta pass i utkastet. */ las: number;
  provplan?: NationellaProvDocument | null; provbokningsfel?: number; provlasning?: 'laddar' | 'klar' | 'fel' | 'ej-tillamplig' };
export type Genomgang = Partial<Record<ForberedOmrade, { avtryck: string; at: string }>>;
export type GenomgangsStatus = 'aterstar' | 'genomgangen' | 'andrat';

const kl = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const n = (antal: number, en: string, flera: string) => `${antal} ${antal === 1 ? en : flera}`;
/** Kort avtryck av ett områdes innehåll (FNV-1a). Ingen säkerhetsfunktion: det visar bara att innehållet ändrats sedan genomgången. */
export function forberedAvtryck(value: unknown): string {
  // Fälten sorteras, så att samma innehåll ger samma avtryck oavsett i vilken ordning fälten råkar ligga efter sparning och omläsning.
  const sorterad = (x: unknown): unknown => Array.isArray(x) ? x.map(sorterad) : x !== null && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sorterad((x as Record<string, unknown>)[k])])) : x;
  const text = JSON.stringify(sorterad(value)) ?? ''; let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function schemaForbered({ kalla, villkor: v, las, provplan, provbokningsfel = 0, provlasning }: ForberedIndata): ForberedPunkt[] {
  const punkt = (id: ForberedOmrade, atgard: string, innehall: unknown, del: Pick<ForberedPunkt, 'varden' | 'kontroll'> & Partial<Pick<ForberedPunkt, 'saknas' | 'nasta'>>): ForberedPunkt =>
    ({ id, titel: FORBERED_TITEL[id], atgard, saknas: del.saknas ?? 0, nasta: del.nasta ?? null, varden: del.varden, kontroll: del.kontroll, avtryck: forberedAvtryck(innehall) });
  const olast = { varden: ['Underlaget är inte läst'], kontroll: ['Kan inte kontrolleras förrän underlaget är läst.'] };
  const pass = kalla?.lessons.filter(l => !l.egenAktivitet) ?? [];
  // Underlag: det som hämtas från tjänstefördelning, timplan, kalender och elevgrupper.
  const obemannade = new Set(pass.filter(l => l.vacant).map(l => l.sal?.undervisning ?? `${l.title}|${l.classIds.join()}`)).size;
  const underlag = !kalla ? punkt('underlag', 'Visa', null, { ...olast, saknas: 1, nasta: 'Läs underlaget' }) : punkt('underlag', 'Visa',
    [kalla.basis, kalla.time.source, kalla.time.version, kalla.time.schoolDays, kalla.fordelning.map(r => [r.ref, r.title, r.classes]), kalla.members, obemannade, kalla.omitted], {
      varden: [kalla.basis ? `Tjänstefördelning version ${kalla.basis.versionNo}` : 'Ingen tjänstefördelning för läsåret',
        kalla.time.source === 'kalender' ? `Läsårskalender version ${kalla.time.version}, ${kalla.time.schoolDays} skoldagar` : 'Läsårskalender saknas: lika veckor antas',
        n(kalla.fordelning.length, 'undervisning', 'undervisningar'), ...(obemannade ? [`${n(obemannade, 'undervisning', 'undervisningar')} utan lärare`] : [])],
      kontroll: [kalla.members.classesWithoutPupils.length || kalla.members.groupsWithoutMembers.length
        ? `Elever saknas för ${[kalla.members.classesWithoutPupils.length ? n(kalla.members.classesWithoutPupils.length, 'klass', 'klasser') : '', kalla.members.groupsWithoutMembers.length ? n(kalla.members.groupsWithoutMembers.length, 'grupp', 'grupper') : ''].filter(Boolean).join(' och ')}: krockar och kapacitet kan inte kontrolleras för dem.`
        : 'Elever finns för alla klasser och grupper.', ...(kalla.omitted.length ? [`${n(kalla.omitted.length, 'behov', 'behov')} i timplanen ger inget pass.`] : [])],
      saknas: (kalla.basis ? 0 : 1) + obemannade,
      nasta: !kalla.basis ? 'Skolan saknar tjänstefördelning för läsåret' : obemannade ? `${n(obemannade, 'undervisning saknar', 'undervisningar saknar')} lärare i tjänstefördelningen` : null });
  // Lektioner och block: hur timplanens tid delas i pass.
  const valda = v.fordelning?.length ?? 0, begransade = kalla?.fordelning.filter(r => r.begransning).length ?? 0;
  const egnaBlock = v.block ?? [], blockStatus = kalla?.block ?? [], blockProblem = blockStatus.filter(b => b.status !== 'aktivt');
  const lektioner = punkt('lektioner', 'Visa', [v.fordelning ?? [], v.minLessonMin, v.maxLessonMin, v.sameDay, v.timeBasis ?? null, v.egna.filter(r => r.typ === 'langd' || r.typ === 'antal'), egnaBlock], !kalla ? olast : {
    varden: [`${n(pass.length, 'pass', 'pass')} per vecka`, `Pass på ${v.minLessonMin}–${v.maxLessonMin} minuter`,
      v.sameDay === 'forbid' ? 'Samma ämne högst en gång per dag' : v.sameDay === 'avoid' ? 'Samma ämne samma dag undviks' : 'Samma ämne får ligga flera gånger samma dag',
      `${valda} av ${kalla.fordelning.length} undervisningar har valt lektionsantal`, n(egnaBlock.length, 'eget samtidighetsblock', 'egna samtidighetsblock')],
    kontroll: [begransade ? `${n(begransade, 'undervisning har', 'undervisningar har')} en begränsning i fördelningen.` : 'Timplanens tid går att dela på passen.',
      ...blockProblem.map(b => `Samtidighetsblocket ${b.namn} ${b.status === 'hinder' ? 'har ett hinder' : 'är inaktuellt'} och används inte.`)],
    saknas: blockProblem.length, nasta: blockProblem.length ? `${n(blockProblem.length, 'samtidighetsblock behöver', 'samtidighetsblock behöver')} ses över` : null });
  // Salar: register och salbehov.
  const rader = kalla ? saltabellRader(kalla, v) : [], obesvarade = rader.filter(r => r.behov === null).length, hinder = rader.filter(r => r.hinder).length;
  const register = v.salregister, okandaPlatser = register?.salar.filter(s => s.platser === null).length ?? 0, okandKapacitet = rader.filter(r => r.kapacitetOkand).length;
  const salar = punkt('salar', 'Ange salbehov', [v.salar, v.salregister ?? null, v.salbehov ?? [], v.egna.filter(r => r.typ === 'sal' || r.slag === 'sal')], !kalla ? olast : {
    varden: [register ? n(register.salar.length, 'sal', 'salar') : v.salar.length ? `${n(v.salar.length, 'sal', 'salar')} som namn, inget salregister` : 'Inget salregister',
      `${rader.length - obesvarade} av ${rader.length} undervisningar har salbehov`, ...(obesvarade ? [`${obesvarade} obesvarade`] : [])],
    kontroll: [...(hinder ? [`${n(hinder, 'undervisning har', 'undervisningar har')} ingen lämplig sal.`] : []), ...(okandaPlatser ? [`Platser saknas för ${n(okandaPlatser, 'sal', 'salar')}.`] : []),
      okandKapacitet ? `Kapaciteten är inte kontrollerad för ${n(okandKapacitet, 'undervisning', 'undervisningar')}.` : !hinder && !okandaPlatser ? 'Inga hinder bland de besvarade salbehoven.' : ''].filter(Boolean),
    saknas: (register && register.salar.length ? 0 : 1) + obesvarade + hinder,
    nasta: !register || !register.salar.length ? 'Lägg till skolans salar i salregistret' : obesvarade ? `Ange salbehov för ${n(obesvarade, 'undervisning', 'undervisningar')}` : hinder ? `${n(hinder, 'undervisning saknar', 'undervisningar saknar')} lämplig sal` : null });
  // Lärartider och fasta tider.
  const lararregler = v.egna.filter(r => r.slag === 'larare' && (r.typ === 'sparrad' || r.typ === 'tillaten' || r.typ === 'dag'));
  const medVillkor = new Set(lararregler.map(r => r.ref)).size, fasta = (v.aktiviteter ?? []).filter(a => a.tid.typ === 'fast').length;
  const larartider = punkt('larartider', 'Komplettera', [lararregler, v.teacherMaxMinPerDay, las, (v.aktiviteter ?? []).filter(a => a.tid.typ === 'fast')], !kalla ? olast : {
    varden: [`${medVillkor} av ${kalla.teachers.length} lärare har egna tidsvillkor`, n(las, 'låst pass', 'låsta pass'), `${n(fasta, 'aktivitet', 'aktiviteter')} med fast tid`,
      ...(v.teacherMaxMinPerDay ? [`Högst ${v.teacherMaxMinPerDay / 60} timmar undervisning per dag`] : [])],
    kontroll: ['En lärare utan tidsvillkor räknas som tillgänglig hela skoldagen. Appen kan inte avgöra om det är ett svar eller en saknad uppgift.'] });
  // Aktiviteter och nationella prov.
  const bokningar = provplan?.bokningar ?? [];
  const provuppgift = provlasning === 'ej-tillamplig' ? null : provlasning === 'fel' ? 'Läs in provplanen' : provlasning === 'laddar' ? 'Vänta på provplanen'
    : provbokningsfel ? 'Kontrollera provbokningarna mot aktuellt underlag' : !provplan?.granskad ? 'Gå igenom nationella prov' : null;
  const aktiviteter = punkt('aktiviteter', 'Visa', [v.aktiviteter ?? [], provplan ?? null, provbokningsfel, provlasning ?? null], {
    varden: [n(v.aktiviteter?.length ?? 0, 'egen aktivitet', 'egna aktiviteter'), ...(provlasning === 'ej-tillamplig' ? [] : [
      provlasning === 'laddar' ? 'Läser provplanen' : provlasning === 'fel' ? 'Provplanen gick inte att läsa'
        : provplan?.granskad && !bokningar.length ? 'Inga prov bekräftade' : n(bokningar.length, 'provbokning', 'provbokningar')])],
    kontroll: provlasning === 'ej-tillamplig' ? ['Egna aktiviteter räknas separat från undervisningstiden.']
      : [provlasning === 'fel' || provlasning === 'laddar' ? 'Bokningarna kontrolleras när provplanen är läst.'
      : provbokningsfel ? `${n(provbokningsfel, 'provbokning behöver', 'provbokningar behöver')} ses över.`
        : provplan?.granskad ? 'Provplanen är genomgången.' : 'Provplanen behöver gås igenom.', 'Provtid redovisas separat från undervisningstiden.'],
    saknas: provuppgift ? Math.max(1, provbokningsfel) : 0, nasta: provuppgift });
  // Regler och önskemål.
  const fel = checkSchemaVillkor(v), tid = v.egna.filter(r => r.slag !== 'larare' && (r.typ === 'sparrad' || r.typ === 'tillaten')).length, marginaler = v.egna.filter(r => r.typ === 'marginal').length;
  const utanTraff = kalla?.egnaUtanTraff.length ?? 0;
  const regler = punkt('regler', 'Visa', [v.days, v.breakMin, v.startGridMin, v.lunch, v.lateAfterMin, v.studentMaxMinPerDay, v.egna.filter(r => r.slag !== 'larare' && r.typ !== 'sal' && r.typ !== 'langd' && r.typ !== 'antal')], {
    varden: [`Skoldag ${kl(Math.min(...v.days.map(d => d.startMin)))}–${kl(Math.max(...v.days.map(d => d.endMin)))}`, v.lunch ? `Lunch ${v.lunch.lengthMin} minuter mellan ${kl(v.lunch.startMin)} och ${kl(v.lunch.endMin)}` : 'Ingen lunchregel',
      `Rast ${v.breakMin} minuter`, `${n(tid, 'spärr eller tillåten tid', 'spärrar och tillåtna tider')}`, n(marginaler, 'marginal', 'marginaler')],
    kontroll: [fel.length ? fel[0] : 'Inga fel i villkoren.', ...(utanTraff ? [`${n(utanTraff, 'eget villkor träffar', 'egna villkor träffar')} inget i underlaget.`] : [])],
    saknas: fel.length ? 1 : 0, nasta: fel.length ? 'Rätta felen i villkoren' : null });
  // Mål för schemat: motorns nuvarande ordning. Egen prioritering är inte byggd.
  const mal = punkt('mal', 'Visa', ['standard', v.lateAfterMin], {
    varden: ['Standardordning: elevernas och lärarnas håltid, sena pass och samma ämne samma dag', v.lateAfterMin === null ? 'Inget klockslag för sena pass' : `Pass efter ${kl(v.lateAfterMin)} räknas som sena`],
    kontroll: ['Egen prioritering går inte att välja ännu. Obligatoriska krav påverkas inte av målen.'] });
  return [underlag, lektioner, salar, larartider, aktiviteter, regler, mal];
}

export const genomgangsStatus = (p: ForberedPunkt, g: Genomgang): GenomgangsStatus => !g[p.id] ? 'aterstar' : g[p.id]!.avtryck === p.avtryck ? 'genomgangen' : 'andrat';
/** Första området där uppgifter saknas, annars första området utan aktuell genomgång. Inget område låses. */
export function nastaUppgift(punkter: ForberedPunkt[], g: Genomgang): { omrade: ForberedOmrade; text: string; skal: string; atgard: string } | null {
  const saknas = punkter.find(p => p.saknas > 0 && p.nasta);
  if (saknas) return { omrade: saknas.id, text: saknas.nasta!, atgard: saknas.atgard,
    skal: saknas.id === 'salar' ? 'Obesvarat betyder inte att sal inte behövs, och räknas inte som klart i kontrollen.' : 'En saknad uppgift räknas inte som fritt utrymme.' };
  const ogenomgangen = punkter.find(p => genomgangsStatus(p, g) !== 'genomgangen');
  if (!ogenomgangen) return null;
  return { omrade: ogenomgangen.id, atgard: 'Visa', text: `Gå igenom ${ogenomgangen.titel.toLocaleLowerCase('sv')}`,
    skal: genomgangsStatus(ogenomgangen, g) === 'andrat' ? 'Innehållet har ändrats sedan området gicks igenom.' : 'Området är inte genomgånget.' };
}
export function parseGenomgang(raw: unknown): Genomgang {
  const result: Genomgang = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  for (const id of FORBERED_OMRADEN) {
    const x = (raw as Record<string, unknown>)[id];
    if (x && typeof x === 'object' && typeof (x as Record<string, unknown>).avtryck === 'string' && /^[0-9a-f]{8}$/u.test((x as { avtryck: string }).avtryck) && typeof (x as Record<string, unknown>).at === 'string'
      && !Number.isNaN(Date.parse((x as { at: string }).at))) result[id] = { avtryck: (x as { avtryck: string }).avtryck, at: (x as { at: string }).at };
  }
  return result;
}
