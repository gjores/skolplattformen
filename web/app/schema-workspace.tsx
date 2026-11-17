'use client';
// Arbetsytan i Schema. Sätter ihop modulerna under ./schema/ och äger hämtning av förslag och kontroll av ändringar (05.2-SM-YTA).
// Var passen ligger för hand hålls i utkastet (lib/schema-utkast.ts) med ångra och gör om i flera steg; en ändring görs först när kontrollen har svarat.
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { useRequestConfirm } from '@/lib/unsaved-changes.tsx';
import { SCHEMA_DRAFT_VERSION, type SchemaDraftDatedOverride } from '@/lib/schema-draft-contract.ts';
import { type SchemaSparinnehall, type SchemaSparstatus } from '@/lib/schema-spara.ts';
import { useSchemaSpara } from './schema/use-spara.ts';
import { useSchemaUnderlag } from './schema/use-underlag.ts';
import { Sparstatus } from './schema/sparstatus.tsx';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { SCHEMA_CONTRACT_VERSION, checkSchemaVillkor, defaultSchemaVillkor, parseSchemaForslag, parseSchemaKontroll, sammaGrund, villkorNyckel, type SchemaForslag, type SchemaForslagLesson, type SchemaForslagRequest,
  SchemaContractError, type SchemaKontroll, type SchemaKontrollRequest, type SchemaPeriod, type SchemaRegel, type SchemaStatus, type SchemaTerm, type SchemaVillkor, type SchemaViolation } from '@/lib/schema-contract.ts';
import { SCHEMA_DEFAULTS } from '@/lib/schema-underlag.ts';
import { arbetsvillkorSteg, aktivitetsSteg, datumSteg, avvikelseRad, avvikelseNyckel, medUtkast, medvetenKrock, medvetenGaller, medvetenMarkering, medvetenSteg, medvetnaAvvikelser, resursRefs, schemaUtkast, tomtUtkast, utkastEfter, utkastSteg, utkastLas, bytSalar, villkorSteg, type SchemaOverlay, type SchemaUtkastAtgard } from '@/lib/schema-utkast.ts';
import { parseSchemaPlacering, type SchemaPlaceringVal } from '@/lib/schema-placering.ts';
import { Placeringsforslag, type PlaceringSokning } from './schema/placering.tsx';
import { parseSchemaVillkorsforslag, tillampaSchemaVillkorsandring } from '@/lib/schema-villkorsforslag.ts';
import { Villkorsforslag, type VillkorsSokning } from './schema/villkorsforslag.tsx';
import { Lagesstatus } from './schema/lagesstatus.tsx';
import { Salar } from './schema/salar.tsx';
import { Samtidighetsblock } from './schema/block.tsx';
import { ForberedOversikt, ForutsattningarKort, Omrade, Ytval, forberedAnkare, rememberYta, storedYta, useGenomgang, type SchemaYta } from './schema/forbered.tsx';
import { schemaForbered } from '@/lib/schema-forbered.ts';
import { Salsattningspanel, type SalsattningVisning } from './schema/salsattning.tsx';
import { SALFEL, salsattningPlaceringar, tilldelaSalar } from '@/lib/schema-salsattning.ts';
import { flyttSal } from '@/lib/schema-utan-sal.ts';
import { medSkolsalar } from '@/lib/skolsalar.ts';
import { useSkolsalar } from './schema/use-skolsalar.ts';
import { fastAktivitet, lastAktivitetAndras, aktivitetsTyper, type SchemaAktivitetsTyp, type SchemaAktivitet } from '@/lib/schema-aktiviteter.ts';
import { schemaLager, type SchemaKalla } from '@/lib/schema-lager.ts';
import { DAYS, PERIOD, TERM, clock, names, ruleText, startTimes } from './schema/delat.ts';
import { FaltKalla, Lagerval, rememberLager, storedLager, visaVillkor } from './schema/lager.tsx';
import { Vecka, Teckenforklaring, veckansSpann } from './schema/vecka.tsx';
import { VeckaVal } from './schema/vecka-val.tsx';
import { UnderlagHinder } from './schema/underlag-hinder.tsx';
import { Fordelning } from './schema/fordelning.tsx';
import { schemaDatumNyckel, schemaDatumTillfallen, schemaDatumErsatt, parseSchemaDatumSvar, type SchemaDatumNyckel, type SchemaDatumTillfalle, type SchemaDatumAndring, type SchemaDatumSvar } from '@/lib/schema-datum.ts';
import { DatumFlytt } from './schema/datum-flytt.tsx';
import { grundschemaVal, schemaVeckaVal, type SchemaVeckaVal } from '@/lib/schema-vecka.ts';
import { Viloyta } from './schema/viloyta.tsx';
import { Villkor, storedVillkor } from './schema/villkor.tsx';
import { Tid, tidAvvikelser } from './schema/tid.tsx';
import { Forklaring, Regelavvikelser } from './schema/avvikelser.tsx';
import { Flyttpanel, type FlyttMal } from './schema/flytt.tsx';
import { Underlag } from './schema/underlag.tsx';
import { dra, type Mal } from './schema/dra.ts';
import { useSchemaBytLagen } from './schema/byt-lagen.ts';
import { parseSchemaDiagnos, type SchemaDiagnosFynd, type SchemaDiagnosAction, type SchemaDiagnosResurs } from '@/lib/schema-diagnos.ts';
import { ForeBerakning, SvarastAttLagga } from './schema/diagnos.tsx';
import { FonsterList, FonsterMeny, useSchemaSynk } from './schema/fonster.tsx';
import { ResursFonster } from './schema/resurs-fonster.tsx';
import { fonsterVyNamn, type SchemaFonsterTarget } from '@/lib/schema-synk.ts';
import { useSchemaMeny } from './schema/meny.tsx';
import { Folj } from './schema/folj.tsx';
import { Samling, type SamlingStart } from './schema/samling.tsx';
import { Aktiviteter } from './schema/aktiviteter.tsx';
import { andradeGrundvillkor } from '@/lib/schema-andrade-villkor.ts';
import type { NyAktivitetsTid } from './schema/aktivitet-form.tsx';
import { Villkorstabell, villkorstabellMal, type VillkorstabellMal } from './schema/villkorstabell.tsx';
import { Vyval, rememberVy, storedVy, visadVy, type SchemaVy } from './schema/vyval.tsx';
import { Passtabell, tomtTabellVal, type PassTabellVal } from './schema/passtabell.tsx';
import './valplaner.css';
import './schema.css';

const STATUS: Record<SchemaStatus, { text: string; tone: 'success' | 'warning' }> = {
  // Visas inte: ett färdigräknat förslag redovisas som tid, sal och kapacitet var för sig (05.2-SM-UXF-12).
  complete: { text: 'Beräkningen är klar', tone: 'success' },
  time_limit: { text: 'Räknetiden tog slut', tone: 'warning' },
  infeasible: { text: 'Går inte att lägga', tone: 'warning' },
  input_missing: { text: 'Underlag saknas', tone: 'warning' },
  cancelled: { text: 'Avbruten', tone: 'warning' },
};
const BASIS: Record<string, string> = { draft: 'utkast', published: 'publicerad', superseded: 'ersatt' };
const REASON: Record<string, string> = {
  schema_engine_unconfigured: 'Schemamotorn är inte ansluten i den här miljön. Inget förslag kan tas fram.',
  schema_engine_unreachable: 'Schemamotorn svarar inte. Försök igen om en stund.',
  schema_engine_busy: 'Schemamotorn räknar redan på andra förslag. Försök igen om en stund.',
  schema_engine_bad_reply: 'Schemamotorns svar kunde inte kontrolleras. Inget förslag visas.',
};
function message(error: unknown): string {
  if (error instanceof SchemaContractError) return 'Schemamotorns svar kunde inte kontrolleras. Läs om sidan och försök igen.';
  if (error instanceof ApiError) {
    if (error.issues.length) return error.issues.join(' ');
    if (error.reason && REASON[error.reason]) return REASON[error.reason];
    if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
  }
  return 'Schemaförslaget kunde inte tas fram. Försök igen.';
}
function moveMessage(error: unknown, text = 'Flytten'): string {
  if (error instanceof ApiError && error.reason === 'schema_datum_original_missing') return 'Ändringen skulle ta bort ett tillfälle som har ett datumundantag. Återställ det tillfället i datumvyn innan du ändrar grundschemat.';
  if (error instanceof ApiError && error.reason === 'schema_datum_duration_changed') return 'Ändringen påverkar längden på ett tillfälle med datumundantag. Återställ datumundantaget innan du ändrar grundschemat.';
  if (text === 'Aktiviteten') {
    if (error instanceof ApiError) {
      if (error.reason === 'schema_underlag_changed' || error.code === 'schema_underlag_changed') return 'Underlaget har ändrats. Ta fram ett nytt förslag innan du ändrar aktiviteter.';
      if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
      if (error.status === 503) return 'Schemamotorn kunde inte pröva aktiviteten. Försök igen om en stund.';
    }
    return 'Aktiviteten kunde inte kontrolleras. Försök igen.';
  }
  if (error instanceof ApiError) {
    if (error.issues.length) return error.issues.join(' ');
    if (text !== 'Flytten') {
      if (error.reason && REASON[error.reason]) return 'Schemamotorn kunde inte pröva villkoren. Försök igen om en stund.';
      if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
      return 'Villkoren kunde inte prövas mot schemat.';
    }
    if (error.reason === 'schema_underlag_changed') return 'Underlaget har ändrats sedan förslaget togs fram. Passet står kvar. Ta fram ett nytt schemaförslag för att fortsätta.';
    if (error.reason && REASON[error.reason]) return 'Schemamotorn kunde inte kontrollera flytten. Passet står kvar. Försök igen om en stund.';
    if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
  }
  return text === 'Flytten' ? 'Flytten kunde inte kontrolleras. Passet står kvar.' : 'Villkoren kunde inte prövas mot schemat.';
}
const CALENDAR: Record<string, string> = { utkast: 'utkast', forslag: 'förslag', atersand: 'återsänd', faststalld: 'fastställd' };

function placeringsFel(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.reason === 'schema_placement_invalid_baseline') return 'Rätta regelavvikelserna innan du söker placeringsförslag.';
    if (error.reason === 'schema_placement_locked_lesson') return 'Passet är låst. Lås upp det innan du söker en annan placering.';
    if (error.reason === 'schema_placement_bad_target') return 'Passet ryms inte på den valda tiden. Välj en annan dag eller starttid.';
    if (error.reason === 'schema_placement_rest_empty') return 'Viloytan är tom. Det finns inga pass att lägga.';
    if (error.reason === 'schema_placement_rooms_changed') return 'Salarna behöver kontrolleras. Kontrollera utkastet innan du söker igen.';
    if (error.reason === 'schema_underlag_changed' || error.code === 'schema_underlag_changed') return 'Underlaget har ändrats. Ta fram ett nytt schemaförslag innan du söker placeringar.';
    if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
  }
  return 'Placeringsförslagen kunde inte kontrolleras. Passen står kvar. Försök igen.';
}
const placeringsBasNyckel = (r: SchemaKontrollRequest): string => JSON.stringify({ contractVersion: r.contractVersion, unitId: r.unitId, schoolYear: r.schoolYear, period: r.period,
  villkor: r.villkor, grundFingerprint: r.grundFingerprint, placements: r.placements, locks: r.locks ?? null });

type Props = { unitId: string | null; schoolYear: number; scopeKey: string; onSessionLost: () => void; fonster?: SchemaFonsterTarget; personalLookup?: boolean };
type FlyttAtgard = Extract<SchemaUtkastAtgard, { type: 'move' | 'park' | 'swap' | 'lock' | 'undo' | 'redo' }>;
// Bara vyvalet lagras här. Själva utkastet hämtas alltid från servern för den valda perioden.
const periodKey = (unitId: string, schoolYear: number) => `schema-period:${unitId}:${schoolYear}`;
function storedPeriod(unitId: string, schoolYear: number): SchemaPeriod {
  try { const value = window.localStorage.getItem(periodKey(unitId, schoolYear)); return value === 'ht' || value === 'vt' ? value : 'lasar'; }
  catch { return 'lasar'; }
}
function rememberPeriod(unitId: string, schoolYear: number, period: SchemaPeriod) {
  try { window.localStorage.setItem(periodKey(unitId, schoolYear), period); } catch { /* Utan lokal lagring kan perioden väljas igen; utkastet finns på servern. */ }
}
export default function SchemaWorkspace(props: Props) {
  if (!props.unitId) return <section className="valplan-workspace schema-workspace"><div className="page-heading"><div><h1>Schema<span className="heading-dot">.</span></h1></div></div><p className="empty-state">Välj en skola för att ta fram ett schemaförslag.</p></section>;
  return <Workspace key={`${props.scopeKey}-${props.unitId}-${props.schoolYear}`} {...props} unitId={props.unitId}/>;
}

function Workspace({ unitId, schoolYear, scopeKey, onSessionLost, fonster, personalLookup = false }: Props & { unitId: string }) {
  const resultHeading = useId();
  const confirm = useRequestConfirm();
  const [draftName, setDraftName] = useState('Schemautkast'), [datedOverrides, setDatedOverrides] = useState<SchemaDraftDatedOverride[]>([]);
  const [datumPicked, setDatumPicked] = useState<(SchemaDatumTillfalle & { expectedInputKey: string; grundFingerprint: string; period: SchemaPeriod }) | null>(null);
  const [datumKontroll, setDatumKontroll] = useState<{ key: string; reply: SchemaDatumSvar } | null>(null), [datumKlar, setDatumKlar] = useState('');
  const dateSequence = useRef(0);
  const [activityTypes, setActivityTypes] = useState<SchemaAktivitetsTyp[]>(aktivitetsTyper);
  const [remoteSave, setRemoteSave] = useState<SchemaSparstatus>({ phase: 'loading', dirty: false, revision: 0, savedAt: null, message: null });
  const [period, setPeriod] = useState<SchemaPeriod>(() => storedPeriod(unitId, schoolYear)), [villkor, setVillkorLocal] = useState(() => storedVillkor(unitId) ?? defaultSchemaVillkor()), [shownTerm, setShownTerm] = useState<SchemaTerm>('ht');
  const [visning, setVisning] = useState<SchemaVeckaVal>(grundschemaVal);
  const issues = checkSchemaVillkor(villkor);
  // Förslaget som motorn räknade fram; tid och mått uppdateras efter varje kontroll. Var passen ligger står i utkastet.
  const [fore, setFore] = useState<{ key: string; findings: SchemaDiagnosFynd[]; releaseLocks?: boolean } | null>(null), [foreTid, setForeTid] = useState<string | null>(null);
  // Vald yta (05.2-SM-UXF-31). Utan eget val visas Förbered tills ett förslag finns.
  const [ytaVal, setYtaVal] = useState<SchemaYta | null>(() => storedYta(unitId, schoolYear)), [genomgang, setGenomgang] = useGenomgang(unitId, schoolYear);
  const valjYta = (next: SchemaYta) => { setYtaVal(next); rememberYta(unitId, schoolYear, next); };
  // Tilldela salar och behåll tiderna (05.2-SM-UXF-41): förhandsgranskningen och kontrollens svar för just den.
  const [salsattning, setSalsattning] = useState<(SalsattningVisning & { svar: SchemaKontroll | null }) | null>(null);
  const [berakningssteg, setBerakningssteg] = useState<'forbereder' | 'diagnos' | 'solve'>('diagnos');
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [base, setBase] = useState<SchemaForslag | null>(null);
  // Lagren i veckan (05.2-SM-VILLKOR-SYNS) ligger i utkastet och minns i webbläsaren.
  const [utkast, dispatchLocal] = useReducer(schemaUtkast, undefined, () => ({ ...tomtUtkast(), layers: storedLager() }));
  // Ett eget villkor som togs bort från ett fält i veckan, så att det kan ångras.
  const [borttaget, setBorttaget] = useState<{ rule: SchemaRegel; index: number } | null>(null), angraVillkor = useRef<HTMLButtonElement | null>(null), aterFalt = useRef<string | null>(null);
  const forslag = useMemo(() => base && { ...base, lessons: medUtkast(base.lessons, utkast.placements, utkast.locked) }, [base, utkast.placements, utkast.locked]);
  const [by, setBy] = useState<'class' | 'teacher'>('class'), [chosen, setChosen] = useState('');
  const [wantedResource, setWantedResource] = useState(fonster?.resource), [resourceMissing, setResourceMissing] = useState(false);
  // Flytt för hand (05.2-SM-FLYTT): en flytt görs först när motorns kontrollant har svarat, och inget sparas.
  const picked = utkast.picked, [target, setTarget] = useState<FlyttMal>({ day: 0, startMin: 0, room: null });
  // Dra och släpp (D1): passet som dras och var det hamnar om det släpps.
  const [drop, setDrop] = useState<{ lesson: string; to: Mal | null } | null>(null);
  // Kontrollens svar och villkoren det gäller (05.2-SM-VILLKOR-DIREKT): ett svar för andra villkor än de som prövas nu visas inte.
  const [kontrollSvar, setKontroll] = useState<{ svar: SchemaKontroll; villkor: string } | null>(null), [checking, setChecking] = useState(false);
  const [sokning, setSokning] = useState<PlaceringSokning | null>(null), searchRunning = useRef<AbortController | null>(null), currentPlacementKey = useRef('');
  const [villkorsSokning, setVillkorsSokning] = useState<VillkorsSokning | null>(null);
  const placementReturn = useRef<HTMLElement | null>(null), previousPlacement = useRef<PlaceringSokning | null>(null);
  // Tidsvillkor som servern ändå svarade 409 för (de ändrar vilka pass som finns), och villkor vars prövning misslyckades: prövas inte igen av sig själva.
  const [kraverNytt, setKraverNytt] = useState<string | null>(null), [misslyckat, setMisslyckat] = useState<string | null>(null);
  // Villkoren som kontroll, möjliga starttider och Följ passet prövar (05.2-SM-VILLKOR-DIREKT): nuvarande villkor när grunden är förslagets och villkoren
  // går att använda, annars förslagets. Ett ändrat tidsvillkor prövas alltså direkt; en ändrad grund kräver ett nytt förslag.
  const villkorKey = villkorNyckel(villkor), forslagetsKey = base ? villkorNyckel(base.villkor) : villkorKey;
  const grundAndrad = base !== null && (!sammaGrund(villkor, base.villkor) || kraverNytt === villkorKey);
  // Nya förslag använder årsmodellen. Återöppning och ändringar i ett äldre utkast behåller sin placeringsgrund.
  const nyttArsvillkor: SchemaVillkor = { ...villkor, timeBasis: 'lasar' };
  const provade = !base || grundAndrad || issues.length ? base?.villkor ?? villkor : villkor, provadeKey = villkorNyckel(provade);
  const kontroll = kontrollSvar && kontrollSvar.villkor === provadeKey ? kontrollSvar.svar : null;
  const [moveError, setMoveErrorState] = useState<string | null>(null), [moved, setMoved] = useState('');
  const focusMoveError = useRef(false);
  const setMoveError = useCallback((value: string | null, autofocus = true) => { focusMoveError.current = autofocus && value !== null; setMoveErrorState(value); }, []);
  const generationConsent = useRef<string | null>(null);
  const moveErrorRef = useRef<HTMLDivElement | null>(null), searchSequence = useRef(0);
  // Följ passet (05.2-SM-FOLJ): passet panelen visar, och om panelen är låst till det i stället för att följa markeringen.
  // Villkor i tabell (05.2-SM-VILLKORSTABELL) är en vy i vyväljaren; `villkorMal` är raden som "Ändra" på ett fält i veckan öppnar.
  const [villkorMal, setVillkorMal] = useState<VillkorstabellMal | null>(null);
  const [folj, setFolj] = useState<{ lesson: string; locked: boolean } | null>(null), foljRubrik = useRef<HTMLHeadingElement | null>(null), foljFokus = useRef(false);
  // Vyväljaren (05.2-SM-PASSTABELL): veckan och tabellerna visar samma utkast. Tabellens filter och sortering står kvar när man byter vy.
  const [vy, setVy] = useState<SchemaVy>(() => fonster && ['folj', 'samling', 'pass', 'villkor'].includes(fonster.view) ? fonster.view as SchemaVy : fonster ? 'vecka' : storedVy()), [tabellVal, setTabellVal] = useState<PassTabellVal>(tomtTabellVal);
  const [samlingStart, setSamlingStart] = useState<SamlingStart | null>(null), foljFran = useRef<SchemaVy>('vecka');
  const [aktivitetsStart, setAktivitetsStart] = useState<NyAktivitetsTid | null>(null);
  const andraFalt = (k: SchemaKalla) => { const m = villkorstabellMal(k, villkor); if (m) { setVillkorMal({ ...m, nr: Date.now() }); setVy('villkor'); rememberVy('villkor'); } else visaVillkor(k); };
  const tabell = useRef<HTMLDivElement | null>(null), visaFokus = useRef<string | null>(null);
  const resursvy = useRef<HTMLDivElement | null>(null);
  const running = useRef<AbortController | null>(null), week = useRef<HTMLDivElement | null>(null), focus = useRef<string | null>(null), dayField = useRef<HTMLSelectElement | null>(null), rest = useRef<HTMLDivElement | null>(null), skipClick = useRef(false);
  /** Passet att lägga fokus på: knappen i veckan, eller radens aktiva cell i passtabellen. */
  const passElement = useCallback((id: string): HTMLElement | null => {
    const rad = tabell.current?.querySelector<HTMLElement>(`tr[data-lesson="${id}"]`);
    return week.current?.querySelector<HTMLElement>(`[data-lesson="${id}"]`) ?? rad?.querySelector<HTMLElement>('[tabindex="0"]') ?? rad?.querySelector<HTMLElement>('[data-col="1"]')
      ?? resursvy.current?.querySelector<HTMLElement>(`[data-schema-pass="${id}"]`) ?? rest.current?.querySelector<HTMLElement>(`[data-schema-rest-lesson="${id}"]`) ?? null;
  }, []);

  const snapshot: SchemaSparinnehall = {
    name: draftName.trim(), basisVillkor: base?.villkor ?? null, workingVillkor: villkor, grundFingerprint: base?.grundFingerprint ?? null,
    placements: forslag?.lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]) ?? [],
    locks: utkastLas(utkast), intentional: utkast.intentional, datedOverrides, activityTypes,
  };
  const spara = useSchemaSpara({ scope: { contractVersion: SCHEMA_DRAFT_VERSION, unitId, schoolYear, period }, enabled: !fonster, snapshot, onSessionLost,
    onLoad: draft => {
      setDatumPicked(null);
      setDraftName(draft?.name ?? 'Schemautkast');
      setBase(draft?.base ?? null);
      setVillkorLocal(draft?.workingVillkor ?? villkor);
      setDatedOverrides(draft?.datedOverrides ?? []);
      setActivityTypes(draft?.activityTypes ?? activityTypes);
      const restored = schemaUtkast({ ...tomtUtkast(), layers: utkast.layers }, { type: 'reset', forslag: draft?.base ? { lessons: draft.base.lessons, locks: draft.locks } : { lessons: [] } });
      dispatchLocal({ type: 'hydrate', state: { ...restored, intentional: draft?.intentional ?? [] } });
      setKontroll(draft?.base && draft.control ? { svar: draft.control, villkor: villkorNyckel(draft.basisVillkor!) } : null);
      setChosen(draft?.base?.classes[0]?.id ?? ''); setBy('class'); setFolj(null); setFore(null); setSokning(null); setError(null); setMoveError(null); setMoved('');
      setKraverNytt(null); setMisslyckat(null);
    },
  });
  const sparstatus = fonster ? remoteSave : spara.state;
  const byterGrund = base !== null && (grundAndrad || sparstatus.phase === 'stale' || period !== base.period || !sammaGrund(nyttArsvillkor, base.villkor));
  const gamlaPassregler = byterGrund ? villkor.egna.filter(r => r.slag === 'pass') : [];
  const berakningsVillkor: SchemaVillkor = gamlaPassregler.length ? { ...nyttArsvillkor, egna: nyttArsvillkor.egna.filter(r => r.slag !== 'pass') } : nyttArsvillkor;
  const redigeringStoppad = !spara.ready || sparstatus.phase === 'loading' || sparstatus.phase === 'stale';
  // Underlaget före första förslaget (05.2-SM-UXF-11): resurser, undervisningar och pass utan placering. Blir aldrig utkastets bas.
  // Skolans salregister (05.2-SM-UXF-23) läses en gång per skolenhet. Utkastets spegel följer registret utan att bli ett steg i Ångra.
  const skolsalar = useSkolsalar({ unitId, enabled: !fonster, onSessionLost });
  // Justeras under renderingen (Reacts mönster för tillstånd som följer annat tillstånd); omvandlingen är idempotent och stannar efter ett varv.
  const medSkolansSalar = !fonster && skolsalar.status === 'ok' ? medSkolsalar(villkor, skolsalar.register?.document ?? null) : villkor;
  if (medSkolansSalar !== villkor) setVillkorLocal(medSkolansSalar);
  // Med salregister läses det också när ett förslag finns, så att passens tillåtna salar, elevantal och kapacitet följer registret och salbehoven (05.2-SM-UXF-21).
  const salNyckel = villkor.salregister ? villkorNyckel([villkor.salregister, villkor.salbehov ?? [], villkor.egna.filter(r => r.typ === 'sal')]) : '';
  const underlagLas = useSchemaUnderlag({ enabled: !fonster && (!base || (!!villkor.salregister && !grundAndrad)) && spara.ready && sparstatus.phase !== 'loading' && !busy && issues.length === 0,
    request: { unitId, schoolYear, period: base?.period ?? period, villkor: base ? villkor : berakningsVillkor }, extra: salNyckel, onSessionLost });
  const salbild = forslag && underlagLas.forslag && underlagLas.forslag.grundFingerprint === forslag.grundFingerprint ? underlagLas.forslag : null;
  const forutsattningar = salbild ?? forslag ?? underlagLas.forslag;
  const yta: SchemaYta = fonster ? 'schema' : ytaVal ?? (base ? 'schema' : 'forbered'), visaForbered = yta === 'forbered';
  const antalLas = Object.keys(utkast.locked).length;
  // Checklistan räknas bara när Förbered visas: den behövs inte i Lägg schema eller i utlyfta fönster och ska inte fördröja synk efter en flytt.
  const forberedPunkter = useMemo(() => visaForbered ? schemaForbered({ kalla: forutsattningar, villkor, las: antalLas }) : [], [visaForbered, forutsattningar, villkor, antalLas]);
  // Passen med aktuell salbild: var de ligger kommer från utkastet, vilka salar de får ha från den senaste läsningen.
  const passMedSal = useMemo(() => { if (!forslag) return []; if (!salbild) return forslag.lessons; const by = new Map(salbild.lessons.map(l => [l.id, l]));
    return forslag.lessons.map(l => { const u = by.get(l.id); return u ? { ...l, roomIds: u.roomIds, sal: u.sal } : l; }); }, [forslag, salbild]);
  async function bytPeriod(next: SchemaPeriod) {
    if (next === period || busy || checking || !spara.ready) return;
    if (!await spara.flush()) return;
    rememberPeriod(unitId, schoolYear, next);
    setBase(null); dispatchLocal({ type: 'reset', forslag: { lessons: [] } }); setDatedOverrides([]); setKontroll(null); setFolj(null); setPeriod(next);
  }
  async function lasServerversion() {
    if (sparstatus.dirty && !await confirm({ title: 'Läs serverns version?', description: 'Dina lokala ändringar ersätts med det senast sparade utkastet på servern.', confirmLabel: 'Läs serverns version', cancelLabel: 'Behåll lokala ändringar' })) return;
    spara.read();
  }

  // Huvudfönstret äger reducer, nätanrop och ångring. Elevlistor och lokala resursval ingår inte i det delade tillståndet.
  type Delat = { base: typeof base; utkast: typeof utkast; villkor: typeof villkor; kontrollSvar: typeof kontrollSvar; period: SchemaPeriod;
    busy: boolean; checking: boolean; sparstatus: SchemaSparstatus; draftName: string; datedOverrides: typeof datedOverrides; activityTypes: typeof activityTypes; error: typeof error; moveError: typeof moveError; moved: string; kraverNytt: typeof kraverNytt; misslyckat: typeof misslyckat; fore: typeof fore; datumKontroll: typeof datumKontroll; datumKlar: string; sokning: typeof sokning; villkorsSokning: typeof villkorsSokning };
  type SynkAtgard = { typ: 'utkast'; action: SchemaUtkastAtgard } | { typ: 'andra'; action: FlyttAtgard } | { typ: 'villkor'; value: SchemaVillkor }
    | { typ: 'arbetsvillkor'; value: SchemaVillkor } | { typ: 'run'; continueAnyway: boolean; releaseLocks?: boolean } | { typ: 'pick'; id: string } | { typ: 'search'; value: SchemaPlaceringVal }
    | { typ: 'date'; key: SchemaDatumNyckel; change: SchemaDatumAndring | null; expectedInputKey: string; grundFingerprint: string; period: SchemaPeriod } | { typ: 'apply-condition'; index: number; key: string } | { typ: 'apply-placement'; index: number; key: string } | { typ: 'close-placement' } | { typ: 'intent'; key: string; on: boolean };
  const synk = useSchemaSynk<Delat, SynkAtgard>({ unitId, schoolYear, scopeKey, fonster,
    state: { base, utkast, villkor, kontrollSvar, period, busy, checking, sparstatus, draftName, datedOverrides, activityTypes, error, moveError, moved, kraverNytt, misslyckat, fore, datumKontroll, datumKlar, sokning, villkorsSokning },
    blocked: busy || checking,
    onState: state => {
      if (state.base && (state.base.unitId !== unitId || state.base.schoolYear !== schoolYear)) return;
      if (state.base && wantedResource) {
        const match = [...resursRefs(state.base)].find(([, ref]) => `${ref.slag}:${ref.ref}` === wantedResource);
        setResourceMissing(!match);
        if (match) { setBy(match[1].slag === 'larare' ? 'teacher' : 'class'); setChosen(match[0]); }
      }
      setBase(state.base); dispatchLocal({ type: 'hydrate', state: state.utkast }); setVillkorLocal(state.villkor); setKontroll(state.kontrollSvar);
      setPeriod(state.period); setBusy(state.busy); setChecking(state.checking); setError(state.error); setMoveError(state.moveError); setMoved(state.moved);
      setKraverNytt(state.kraverNytt); setMisslyckat(state.misslyckat); setFore(state.fore);
      setDatumKontroll(state.datumKontroll); if (state.base?.grundFingerprint !== base?.grundFingerprint || state.period !== period || state.sparstatus.phase === 'stale' || state.datumKlar !== datumKlar) setDatumPicked(null); setDatumKlar(state.datumKlar);
      setSokning(state.sokning); setVillkorsSokning(state.villkorsSokning); setRemoteSave(state.sparstatus); setDraftName(state.draftName); setDatedOverrides(state.datedOverrides); setActivityTypes(state.activityTypes);
      if (fonster?.view === 'folj' && state.utkast.picked) setFolj(f => f?.locked ? f : { lesson: state.utkast.picked!, locked: false });
      if (fonster && state.base && state.utkast.picked && state.utkast.picked !== picked) {
        const lesson = medUtkast(state.base.lessons, state.utkast.placements).find(l => l.id === state.utkast.picked);
        if (lesson) { const day = lesson.day ?? 0, starts = startTimes(state.base, day, lesson.durationMin + lesson.marginMin, lesson.marginBeforeMin);
          setTarget({ day, startMin: lesson.startMin ?? starts[0] ?? state.base.days[day].startMin, room: lesson.roomId }); }
      }
    },
    onAction: action => {
      if (running.current) return;
      if (action.typ === 'utkast') {
        const change = action.action;
        if (['pick', 'select', 'tool', 'layer', 'villkor'].includes(change.type) ||
          (change.type === 'undo' || change.type === 'redo') && villkorSteg(utkast[change.type].at(-1))) dispatchLocal(change);
      }
      else if (action.typ === 'villkor') setVillkorLocal(action.value);
      else if (action.typ === 'arbetsvillkor') andraArbetsvillkor(action.value);
      else if (action.typ === 'andra') void andra(action.action);
      else if (action.typ === 'run') void run(action.continueAnyway, action.releaseLocks);
      else if (action.typ === 'pick') { const lesson = forslag?.lessons.find(l => l.id === action.id); if (lesson) pick(lesson); }
      else if (action.typ === 'search') void sokPlacering(action.value);
      else if (action.typ === 'date') {
        if (!forslag || action.grundFingerprint !== forslag.grundFingerprint || action.period !== forslag.period || action.expectedInputKey !== JSON.stringify(datumInput())) { setMoveError('Schemat har ändrats sedan datumdialogen öppnades. Välj tillfället igen; inget har ändrats.'); return; }
        void andraDatum(action.key, action.change, undefined, action.expectedInputKey);
      }
      else if (action.typ === 'apply-condition') void genomforVillkorsforslag(action.index, action.key);
      else if (action.typ === 'apply-placement') void genomforPlacering(action.index, action.key);
      else if (action.typ === 'close-placement') stangPlacering();
      else if (action.typ === 'intent') {
        const violation = kontroll?.violations.find(v => avvikelseNyckel(v) === action.key); if (violation) markeraMedveten(violation, action.on);
      }
    } });
  function dispatch(action: SchemaUtkastAtgard) { if (fonster) { synk.send({ typ: 'utkast', action }); return; } dispatchLocal(action); }
  function setVillkor(value: SchemaVillkor) { if (fonster) { synk.send({ typ: 'villkor', value }); return; } setVillkorLocal(value); }
  function andraArbetsvillkor(value: SchemaVillkor, text = 'Villkor för schemat') {
    if (fonster) { synk.send({ typ: 'arbetsvillkor', value }); return; }
    if (villkorNyckel(value) === villkorNyckel(villkor)) return;
    dispatchLocal({ type: 'arbetsvillkor', fore: villkor, efter: value, text });
    setVillkorLocal(value);
  }
  function setTabellVillkor(value: SchemaVillkor) {
    if (villkorNyckel({ ...value, egna: [] }) === villkorNyckel({ ...villkor, egna: [] })) setVillkor(value);
    else andraArbetsvillkor(value);
  }
  useEffect(() => {
    if (!moveError || !focusMoveError.current || document.querySelector('[role=dialog]')) return;
    moveErrorRef.current?.focus(); moveErrorRef.current?.scrollIntoView({ block: 'center' });
  }, [moveError]);

  useEffect(() => {
    if (sokning) { previousPlacement.current = sokning; return; }
    const previous = previousPlacement.current;
    if (!previous) return;
    previousPlacement.current = null;
    const origin = placementReturn.current, id = previous.request.lesson ?? previous.result?.suggestions[0]?.changes[0]?.lesson;
    placementReturn.current = null;
    const frame = requestAnimationFrame(() => {
      const current = previous.request.grundFingerprint === base?.grundFingerprint;
      const available = origin?.isConnected && origin.getClientRects().length > 0 && !origin.matches('[disabled],[aria-disabled="true"]');
      const target = current && available ? origin : current && id ? passElement(id) : null;
      (target ?? rest.current?.querySelector<HTMLElement>('button:not([disabled])') ?? document.querySelector<HTMLElement>('.schema-undo button:not([disabled])') ?? document.querySelector<HTMLElement>('.schema-controls button[type="submit"]'))?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [sokning, base?.grundFingerprint, passElement]);
  useEffect(() => () => { running.current?.abort(); searchRunning.current?.abort(); }, []);
  useEffect(() => { if (picked && !visaFokus.current) dayField.current?.focus(); }, [picked]);
  // Visa i veckan (05.2-SM-PASSTABELL): när veckan är ritad får passet fokus och rullas fram.
  useEffect(() => {
    const el = visaFokus.current ? week.current?.querySelector<HTMLElement>(`[data-lesson="${visaFokus.current}"]`) : null;
    if (!el) return;
    visaFokus.current = null; el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center' });
  });
  useEffect(() => { if (folj && foljFokus.current) { foljFokus.current = false; foljRubrik.current?.focus(); } }, [folj]);
  // Efter Ta bort står fokus på Ångra; efter Ångra på fältet igen.
  useEffect(() => {
    if (borttaget) { angraVillkor.current?.focus(); return; }
    if (aterFalt.current) week.current?.querySelector<HTMLElement>(`[data-source="${aterFalt.current}"] button`)?.focus();
    aterFalt.current = null;
  }, [borttaget]);
  // Efter flytt eller avbrott går fokus tillbaka till passet, så att tangentbordet inte tappar sin plats.
  useEffect(() => {
    if (!focus.current || picked) return;
    passElement(focus.current)?.focus();
    focus.current = null;
  }, [picked, forslag, passElement]);

  async function run(continueAnyway = false, releaseLocks = false) {
    if (fonster) { synk.send({ typ: 'run', continueAnyway, releaseLocks }); return; }
    if (!spara.ready || busy || issues.length || running.current) return;
    const locks = sparstatus.phase === 'stale' || releaseLocks ? [] : utkastLas(utkast);
    if (locks.length && base && (period !== base.period || !sammaGrund(berakningsVillkor, base.villkor))) {
      setError('Låsen hör till det tidigare underlaget. Lås upp passen innan du ändrar perioden eller passens uppdelning.'); return;
    }
    const request: SchemaForslagRequest = { unitId, schoolYear, period, villkor: berakningsVillkor, ...(base && locks.length ? { locks: { grundFingerprint: base.grundFingerprint, placements: locks } } : {}) };
    const key = JSON.stringify(request), consentKey = JSON.stringify([key, datedOverrides, utkast.placements, gamlaPassregler]);
    const continuing = continueAnyway && fore?.key === key;
    const controller = new AbortController(); running.current = controller; setBusy(true); setBerakningssteg('forbereder'); setError(null);
    try {
      if ((datedOverrides.length || gamlaPassregler.length) && (!continuing || generationConsent.current !== consentKey)) {
        const passnamn = gamlaPassregler.slice(0, 5).map(r => base?.lessons.find(l => l.id === r.ref)?.title ?? r.ref).join(', ');
        const datumtext = datedOverrides.length ? ` och ${datedOverrides.length} datumändringar` : '';
        const passregeltext = gamlaPassregler.length ? ` ${gamlaPassregler.length} villkor för enskilda pass tas bort eftersom det nya mönstret får nya pass: ${passnamn}${gamlaPassregler.length > 5 ? ', med flera' : ''}. Klassernas, gruppernas, lärarnas och ämnenas villkor behålls.` : '';
        if (!await confirm({ title: 'Räkna om hela grundschemat?', description: `Det nya förslaget ersätter placeringarna${datumtext}.${passregeltext} Omtaget går inte att ångra i arbetsytan.`, confirmLabel: gamlaPassregler.length ? 'Ta fram utan passregler' : 'Räkna om schemat', cancelLabel: 'Behåll nuvarande schema' })) return;
        generationConsent.current = consentKey;
      }
      if (controller.signal.aborted) return;
      if (sparstatus.phase !== 'stale' && !await spara.flush()) { setError('Spara det nuvarande utkastet innan du tar fram ett nytt förslag. Dina ändringar finns kvar här.'); return; }
      if (controller.signal.aborted) return;
      searchRunning.current?.abort(); searchRunning.current = null; setSokning(null); setVillkorsSokning(null);
      if (!continuing) {
        setBerakningssteg('diagnos');
        const findings = parseSchemaDiagnos(await api.post<unknown>('/api/schema/diagnos', request, controller.signal));
        if (controller.signal.aborted) return;
        setFore({ key, findings, releaseLocks });
        if (findings.length) return;
      }
      setBerakningssteg('solve');
      const next = parseSchemaForslag(await api.post<unknown>('/api/schema/forslag', request, controller.signal), request);
      if (controller.signal.aborted) return;
      generationConsent.current = null; spara.acceptNewBasis(); setDatedOverrides([]); setDatumPicked(null);
      setBase(next); setVillkor(next.villkor); dispatch({ type: 'reset', forslag: next }); valjYta('schema'); setFolj(null); setShownTerm('ht'); setBy('class'); setChosen(next.classes[0]?.id ?? '');
      setVisning(grundschemaVal());
      setKontroll(null); setKraverNytt(null); setMisslyckat(null); setMoveError(null); setMoved('');
    } catch (caught) {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setError(message(caught));
    } finally { if (running.current === controller) { running.current = null; setBusy(false); } }
  }

  /** Pass vars nuvarande sal kontrollen har underkänt: de får en ny sal i tilldelningen om en är ledig. */
  const salkrockar = () => new Set((kontroll?.violations ?? []).filter(v => (SALFEL as readonly string[]).includes(v.code)).flatMap(v => v.lessons));
  /** Förhandsgranskning (05.2-SM-UXF-41): salarna väljs i appen och hela schemat prövas av motorns kontroll. Inget ändras i utkastet. */
  async function forhandsgranskaSalar() {
    if (!base || !forslag || redigeringStoppad || busy || checking || running.current || grundAndrad || issues.length) return;
    const nyckel = salsattningsNyckel;
    const resultat = tilldelaSalar(passMedSal, { rooms: (salbild ?? forslag).rooms, egna: provade.egna, lasta: new Set(Object.keys(utkast.locked)), datum: new Set(datedOverrides.map(a => a.lesson)), krockar: salkrockar() });
    if (!resultat.tilldelade.length) { setSalsattning({ resultat, kontroll: { status: 'ok' }, nyckel, svar: null }); return; }
    const ny = new Map(resultat.tilldelade.map(t => [t.lesson, t.till]));
    const lessons = forslag.lessons.map(l => ny.has(l.id) ? { ...l, roomId: ny.get(l.id)! } : l);
    const controller = new AbortController(); running.current = controller; setChecking(true); setMoveError(null);
    try {
      const checked = await kontrollera(base, lessons, controller);
      if (controller.signal.aborted) return;
      const fore = new Set((kontroll?.violations ?? []).map(avvikelseNyckel));
      const nya = checked.violations.filter(v => !fore.has(avvikelseNyckel(v)) && v.lessons.some(id => ny.has(id)));
      const bytta = resultat.tilldelade.filter(t => (checked.rooms[t.lesson] ?? null) !== t.till);
      const texter = [...nya.map(v => v.message), ...bytta.map(t => `${t.title}: kontrollen godtog inte den föreslagna salen.`)];
      setSalsattning({ resultat, kontroll: texter.length ? { status: 'avvikelser', texter: texter.slice(0, 10) } : { status: 'ok' }, nyckel, svar: checked });
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setMoveError(moveMessage(caught, 'Förhandsgranskningen av salarna'));
    } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
  }
  /** Använd: alla föreslagna salar läggs i utkastet som ett steg i Ångra. Dag och starttid kommer oförändrade från utkastet. */
  function anvandSalar() {
    if (!base || !forslag || !salsattning?.svar || salsattning.kontroll.status !== 'ok' || salsattning.nyckel !== salsattningsNyckel || redigeringStoppad || busy || checking || running.current) return;
    const tilldelade = salsattning.resultat.tilldelade, svar = salsattning.svar;
    const action: SchemaUtkastAtgard = { type: 'placement', lesson: tilldelade[0].lesson, placements: salsattningPlaceringar(forslag.lessons, tilldelade), rooms: svar.rooms };
    if (schemaUtkast(utkast, action) === utkast) { setMoveError('Salarna stämmer inte längre med utkastets pass och lås. Inget har ändrats. Förhandsgranska igen.'); return; }
    dispatch(action); setBase({ ...base, teachings: svar.teachings, trims: svar.trims, metrics: svar.metrics }); setKontroll({ svar, villkor: provadeKey });
    setMoved(`Salar tilldelade för ${tilldelade.length} pass. Ingen tid har ändrats. Ångra återställer alla salar i ett steg.`); setSalsattning(null);
  }

  /** Kontroll av underlaget utan beräkning (05.2-SM-UXF-31): samma fördiagnos som före ett förslag, men inget schema läggs. */
  async function kontrolleraUnderlag() {
    if (!spara.ready || busy || issues.length || running.current) return;
    const locks = sparstatus.phase === 'stale' ? [] : utkastLas(utkast);
    const request: SchemaForslagRequest = { unitId, schoolYear, period, villkor: berakningsVillkor, ...(base && locks.length ? { locks: { grundFingerprint: base.grundFingerprint, placements: locks } } : {}) };
    const controller = new AbortController(); running.current = controller; setBusy(true); setBerakningssteg('diagnos'); setError(null);
    try {
      const findings = parseSchemaDiagnos(await api.post<unknown>('/api/schema/diagnos', request, controller.signal));
      if (controller.signal.aborted) return;
      setFore({ key: JSON.stringify(request), findings }); setForeTid(new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }));
    } catch (caught) {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setError(message(caught));
    } finally { if (running.current === controller) { running.current = null; setBusy(false); } }
  }

  function pick(l: SchemaForslagLesson) {
    if (fonster) { synk.send({ typ: 'pick', id: l.id }); return; }
    if (!forslag || checking) return;
    if (skipClick.current) return;
    if (fastAktivitet(l, provade)) { setMoveError('Aktiviteten har fast tid. Ändra eller ta bort den i aktivitetslistan.'); return; }
    const day = l.day ?? 0, starts = startTimes(forslag, day, l.durationMin + l.marginMin, l.marginBeforeMin);
    setTarget({ day, startMin: l.startMin !== null && starts.includes(l.startMin) ? l.startMin : starts[0] ?? forslag.days[day].startMin, room: l.roomId });
    dispatch({ type: 'pick', lesson: l.id }); setMoveError(null);
    // Följ passet följer markeringen tills panelen låses.
    setFolj(f => f && !f.locked ? { ...f, lesson: l.id } : f);
  }
  /**
   * Flyttar ett pass, lägger det på viloytan, ångrar eller gör om. Passet behåller sin sal om ingen annan anges; utan sal väljer servern en ledig.
   * Hela schemat kontrolleras om med placeringarna ändringen ger, och utkastet ändras först när kontrollen har svarat.
   */
  async function andra(atgard: FlyttAtgard) {
    // Med salregister behåller ett flyttat pass sin sal bara där den är ledig; annars blir det utan sal (05.2-SM-UXF-43).
    const egenSal = atgard.type === 'move' ? utkast.placements[atgard.lesson]?.room ?? null : null;
    const action: FlyttAtgard = atgard.type === 'move' && provade.salregister ? { ...atgard, room: flyttSal(egenSal, atgard.room,
      bytLagen.lagen?.lesson === atgard.lesson ? bytLagen.lagen.positions.find(p => p.day === atgard.day && p.startMin === atgard.startMin) : undefined) } : atgard;
    const tappadSal = action.type === 'move' && egenSal !== null && action.room === null ? roomName(egenSal) || 'Salen' : null;
    if (fonster) { synk.send({ typ: 'andra', action }); return; }
    if (redigeringStoppad || checking || busy || running.current) return;
    if (action.type === 'move' || action.type === 'park' || action.type === 'swap') {
      const changing = new Set([action.lesson, ...(action.type === 'swap' ? [action.other] : action.fler ?? [])]);
      if (datedOverrides.some(a => changing.has(a.lesson))) { setMoveError('Passet har ändrade datumtillfällen. Återställ dem i datumvyn innan du flyttar passet i grundschemat, eller ändra bara det valda tillfället.'); return; }
    }
    if (action.type === 'lock') {
      dispatch(action); setMoveError(null); setMoved(action.locked ? 'Passens tider är låsta inför nästa beräkning.' : 'Passens lås är borttagna.'); return;
    }
    if ((action.type === 'move' || action.type === 'park' || action.type === 'swap') && forslag?.lessons.some(l =>
      (l.id === action.lesson || (action.type === 'swap' ? l.id === action.other : action.fler?.includes(l.id))) && fastAktivitet(l, provade))) {
      setMoveError('Aktiviteten har fast tid. Ändra eller ta bort den i aktivitetslistan.'); return;
    }
    if (action.type === 'undo' || action.type === 'redo') {
      const step = utkast[action.type].at(-1);
      if (datumSteg(step)) {
        await andraDatum(null, null, { type: action.type, overrides: step.datum[action.type === 'undo' ? 'fore' : 'efter'] }); return;
      }
      if (arbetsvillkorSteg(step) || villkorSteg(step)) {
        const value = arbetsvillkorSteg(step) ? step.arbetsvillkor[action.type === 'undo' ? 'fore' : 'efter'] : { ...villkor, egna: action.type === 'undo' ? step.villkor : step.efter };
        if (arbetsvillkorSteg(step) && step.platser && base && forslag) {
          const at = step.platser[action.type === 'undo' ? 'fore' : 'efter'], controller = new AbortController();
          running.current = controller; setChecking(true);
          try {
            const checked = await kontrollera(base, medUtkast(forslag.lessons, at), controller, value);
            if (controller.signal.aborted) return;
            setKontroll({ svar: checked, villkor: villkorNyckel(value) });
            setBase({ ...base, teachings: checked.teachings, trims: checked.trims, metrics: checked.metrics });
            setVillkorLocal(value); dispatch({ ...action, rooms: checked.rooms }); setMoveError(null); setMoved(`${action.type === 'undo' ? 'Ångrat' : 'Gjort om'}: villkor och placering tillsammans.`);
          } catch (caught) {
            if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
            if (!controller.signal.aborted) setMoveError(moveMessage(caught));
          } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
          return;
        }
        setVillkorLocal(value); dispatch(action); setMoveError(null);
        if (borttaget && value.egna.some(r => villkorNyckel(r) === villkorNyckel(borttaget.rule))) setBorttaget(null);
        setMoved(`${action.type === 'undo' ? 'Ångrat' : 'Gjort om'}: ${step.text}.`); return;
      }
      if (medvetenSteg(step)) { dispatch(action); setMoved(`${action.type === 'undo' ? 'Ångrat' : 'Gjort om'}: markering av medveten krock.`); return; }
      if (aktivitetsSteg(step)) {
        if (redigeringStoppad || !base || checking || busy) return;
        const snapshot = action.type === 'undo' ? step.aktiviteter.fore : step.aktiviteter.efter;
        // Ett senare val i det vanliga villkorsformuläret hör inte till aktivitetssteget.
        const restoredVillkor = { ...villkor, aktiviteter: snapshot.villkor.aktiviteter ?? [] };
        if (!sammaGrund(restoredVillkor, snapshot.villkor) || checkSchemaVillkor(restoredVillkor).length > 0) {
          setMoveError('Villkoren för passens uppdelning har ändrats eller innehåller fel. Återställ dem för att kunna ångra eller göra om aktivitetsändringen.'); return;
        }
        const controller = new AbortController();
        running.current = controller; setChecking(true); setMoveError(null);
        try {
          const reply = await kontrollera(snapshot.forslag, snapshot.forslag.lessons, controller, restoredVillkor);
          if (controller.signal.aborted) return;
          setBase({ ...snapshot.forslag, teachings: reply.teachings, trims: reply.trims, metrics: reply.metrics });
          setVillkor(restoredVillkor); dispatch({ ...action, rooms: reply.rooms }); setFolj(null);
          setKontroll({ svar: reply, villkor: villkorNyckel(restoredVillkor) }); setKraverNytt(null); setMisslyckat(null);
          setMoved(`${action.type === 'undo' ? 'Ångrat' : 'Gjort om'}: ${step.text}.`);
        } catch (caught) {
          if (controller.signal.aborted) return;
          if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
          setMoveError(moveMessage(caught));
        } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
        return;
      }
    }
    const next = utkastEfter(utkast, action), lessonId = action.type === 'undo' || action.type === 'redo' ? utkastSteg(utkast, action.type) : action.lesson;
    const before = base?.lessons.find(l => l.id === lessonId);
    if (!next && (action.type === 'move' || action.type === 'park' || action.type === 'swap')) { setMoveError('Ändringen kan inte göras. Lås upp berörda pass och välj tider inom veckan.'); return; }
    if (!base || !next || !before || checking || busy) return;
    const kontrollerade = action.type === 'swap' ? bytSalar(base, next, [action.lesson, action.other]) : next;
    const lessons = medUtkast(base.lessons, kontrollerade), controller = new AbortController(), key = provadeKey;
    running.current = controller;
    setChecking(true); setMoveError(null); setMoved('');
    try {
      const reply = await kontrollera(base, lessons, controller);
      await kontrolleraDatumKandidat(base, lessons, controller);
      setBase({ ...base, teachings: reply.teachings, trims: reply.trims, metrics: reply.metrics });
      dispatch({ ...action, rooms: reply.rooms });
      focus.current = before.id; setKontroll({ svar: reply, villkor: key });
      const { day, startMin } = next[before.id], fler = action.type === 'park' ? action.fler?.length ?? 0 : 0;
      setMoved(action.type === 'swap' ? `Passen har bytt dag och starttid. ${reply.total ? `${reply.total} regelavvikelser.` : 'Inga regelavvikelser.'}` : `${fler ? `${fler + 1} pass ligger nu på viloytan` : `${before.title} ${day === null || startMin === null ? 'ligger nu på viloytan' : `ligger nu ${DAYS[day].toLowerCase()} ${clock(startMin)}`}`}.${tappadSal ? ` Passet är utan sal: ${tappadSal} var inte ledig då.` : ''} ${reply.total === 0 ? 'Inga regelavvikelser.' : `${reply.total} ${reply.total === 1 ? 'regelavvikelse' : 'regelavvikelser'}.`}`);
    } catch (caught) {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      if (kraver(caught)) return;
      setMoveError(moveMessage(caught));
    } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
  }
  /** Kontrollen av placeringarna med villkoren som prövas och förslagets grund. */
  async function kontrollera(f: SchemaForslag, lessons: SchemaForslagLesson[], controller: AbortController, villkoren = provade): Promise<SchemaKontroll> {
    const request: SchemaKontrollRequest = { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period: f.period, villkor: villkoren, grundFingerprint: f.grundFingerprint,
      ...(utkastLas(utkast).length ? { locks: { grundFingerprint: f.grundFingerprint, placements: utkastLas(utkast) } } : {}),
      placements: lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]) };
    return parseSchemaKontroll(await api.post<unknown>('/api/schema/kontroll', request, controller.signal), f.grundFingerprint);
  }
  async function kontrolleraDatumKandidat(f: SchemaForslag, lessons: SchemaForslagLesson[], controller: AbortController, villkoren = provade) {
    if (!datedOverrides.length) return;
    const locks = utkastLas(utkast), request = { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period: f.period, villkor: villkoren, grundFingerprint: f.grundFingerprint,
      placements: lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]),
      ...(locks.length ? { locks: { grundFingerprint: f.grundFingerprint, placements: locks } } : {}), datedOverrides, dates: [] };
    parseSchemaDatumSvar(await api.post<unknown>('/api/schema/datum', request, controller.signal), request);
  }
  function placeringsBas(): SchemaKontrollRequest | null {
    if (!forslag) return null;
    const locks = utkastLas(utkast);
    return { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period: forslag.period, villkor: provade, grundFingerprint: forslag.grundFingerprint,
      placements: forslag.lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]),
      ...(locks.length ? { locks: { grundFingerprint: forslag.grundFingerprint, placements: locks } } : {}) };
  }
  function stangPlacering() {
    if (fonster) { synk.send({ typ: 'close-placement' }); return; }
    searchRunning.current?.abort(); searchRunning.current = null; setSokning(null); setVillkorsSokning(null);
  }
  async function sokPlacering(value: SchemaPlaceringVal) {
    const origin = document.activeElement;
    if (origin instanceof HTMLElement && !origin.closest('[data-schema-placement-panel]')) placementReturn.current = origin;
    if (fonster) { synk.send({ typ: 'search', value }); return; }
    const input = placeringsBas();
    if (!input || !forslag) { setMoveError('Ta fram ett schemaförslag innan du söker placeringar.'); return; }
    if (busy || checking || running.current) { setMoveError('En kontroll eller beräkning pågår. Vänta tills den är klar och sök sedan igen.'); return; }
    if (grundAndrad || issues.length) { setMoveError('Ta fram ett nytt förslag med giltiga villkor innan du söker placeringar.'); return; }
    if (value.lesson && forslag.lessons.some(l => l.id === value.lesson && (utkast.locked[l.id] || fastAktivitet(l, provade)))) { setMoveError('Passet är låst. Lås upp det innan du söker en annan placering.'); return; }
    searchRunning.current?.abort();
    const controller = new AbortController(), request = { ...input, ...value }, key = `${JSON.stringify(request)}:${++searchSequence.current}`, inputKey = JSON.stringify({ base: placeringsBasNyckel(input), villkor: villkorKey });
    searchRunning.current = controller; setSokning({ request, key, inputKey, result: null, loading: true, error: null }); setVillkorsSokning(null); setMoveError(null);
    try {
      const result = parseSchemaPlacering(await api.post<unknown>('/api/schema/placering', request, controller.signal), request, forslag.lessons.map(l => l.id), forslag.links);
      if (controller.signal.aborted || searchRunning.current !== controller) return;
      setSokning({ request, key, inputKey, result, loading: false, error: null });
      if (!result.suggestions.length && value.lesson && forslag.lessons.find(l => l.id === value.lesson)?.day === null) {
        const conditionRequest = { ...input, lesson: value.lesson, depth: value.depth };
        setVillkorsSokning({ key, inputKey, request: conditionRequest, result: null, loading: true, error: null });
        try {
          const answer = parseSchemaVillkorsforslag(await api.post<unknown>('/api/schema/villkorsforslag', conditionRequest, controller.signal), conditionRequest, forslag.lessons.map(l => l.id), forslag.links);
          if (controller.signal.aborted || searchRunning.current !== controller) return;
          setVillkorsSokning({ key, inputKey, request: conditionRequest, result: answer, loading: false, error: null });
        } catch (caught) {
          if (controller.signal.aborted || searchRunning.current !== controller) return;
          if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
          setVillkorsSokning({ key, inputKey, request: conditionRequest, result: null, loading: false, error: placeringsFel(caught) });
        }
      }
    } catch (caught) {
      if (controller.signal.aborted || searchRunning.current !== controller) return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setSokning({ request, key, inputKey, result: null, loading: false, error: placeringsFel(caught) });
    } finally { if (searchRunning.current === controller) searchRunning.current = null; }
  }
  async function genomforPlacering(index: number, key: string) {
    if (fonster) { synk.send({ typ: 'apply-placement', index, key }); return; }
    if (!base || !forslag || !sokning?.result || sokning.loading || running.current || busy || checking) return;
    if (key !== sokning.key || currentPlacementKey.current !== sokning.inputKey || grundAndrad || issues.length) {
      setSokning(s => s && { ...s, error: 'Utkastet har ändrats. Sök igen innan du godkänner ett förslag.' }); return;
    }
    let verified;
    try { verified = parseSchemaPlacering(sokning.result, sokning.request, forslag.lessons.map(l => l.id), forslag.links); }
    catch { setSokning(s => s && { ...s, error: 'Förslaget kunde inte kontrolleras. Inga pass har ändrats. Sök igen.' }); return; }
    const candidate = verified.suggestions[index];
    if (!candidate || !Number.isSafeInteger(index)) return;
    const wanted = new Map(candidate.placements.map(p => [p.lesson, p]));
    const lessons = forslag.lessons.map(l => { const p = wanted.get(l.id); return { ...l, day: p?.day ?? null, startMin: p?.startMin ?? null, roomId: p?.room ?? null }; });
    const controller = new AbortController(), inputKey = sokning.inputKey;
    running.current = controller; setChecking(true); setMoveError(null); setSokning(s => s && { ...s, error: null });
    try {
      const checked = await kontrollera(base, lessons, controller, sokning.request.villkor);
      if (controller.signal.aborted || currentPlacementKey.current !== inputKey) { setSokning(s => s && { ...s, error: 'Utkastet har ändrats under kontrollen. Sök igen; inga pass har ändrats.' }); return; }
      if (checked.total !== 0 || candidate.placements.some(p => (checked.rooms[p.lesson] ?? null) !== p.room)) {
        setSokning(s => s && { ...s, error: 'Förslaget klarade inte den nya kontrollen oförändrat. Inga pass har ändrats. Sök igen med aktuellt underlag.' }); return;
      }
      await kontrolleraDatumKandidat(base, lessons, controller, sokning.request.villkor);
      const action: SchemaUtkastAtgard = { type: 'placement', lesson: candidate.changes[0]?.lesson ?? sokning.request.lesson ?? '', placements: candidate.placements };
      if (schemaUtkast(utkast, action) === utkast) { setSokning(s => s && { ...s, error: 'Förslaget stämmer inte längre med utkastets pass och lås. Inga pass har ändrats.' }); return; }
      dispatch(action); setBase({ ...base, status: checked.metrics.unplaced === 0 ? 'complete' : base.status, teachings: checked.teachings, trims: checked.trims, metrics: checked.metrics }); setKontroll({ svar: checked, villkor: provadeKey });
      setMoved(`Placeringsförslaget är genomfört. ${candidate.changes.length} pass har fått ny placering i ett steg. Inga regelavvikelser.`); setSokning(null);
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setSokning(s => s && { ...s, error: placeringsFel(caught) });
    } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
  }
  async function genomforVillkorsforslag(index: number, key: string) {
    if (fonster) { synk.send({ typ: 'apply-condition', index, key }); return; }
    const search = villkorsSokning;
    if (redigeringStoppad || !base || !forslag || !search?.result || search.loading || busy || checking || running.current) return;
    if (key !== search.key || currentPlacementKey.current !== search.inputKey || grundAndrad || issues.length) {
      setVillkorsSokning(s => s && { ...s, error: 'Utkastet har ändrats. Sök igen innan du godkänner.' }); return;
    }
    let candidate;
    try { candidate = parseSchemaVillkorsforslag(search.result, search.request, forslag.lessons.map(l => l.id), forslag.links).suggestions[index]; }
    catch { setVillkorsSokning(s => s && { ...s, error: 'Villkorsförslaget kunde inte kontrolleras. Inget har ändrats. Sök igen.' }); return; }
    if (!candidate || !Number.isSafeInteger(index)) return;
    const nextVillkor = tillampaSchemaVillkorsandring(search.request.villkor, candidate.change);
    const wanted = new Map(candidate.placement.placements.map(p => [p.lesson, p]));
    const lessons = forslag.lessons.map(l => { const p = wanted.get(l.id); return { ...l, day: p?.day ?? null, startMin: p?.startMin ?? null, roomId: p?.room ?? null }; });
    const controller = new AbortController(); running.current = controller; setChecking(true); setMoveError(null);
    try {
      const checked = await kontrollera(base, lessons, controller, nextVillkor);
      if (controller.signal.aborted || currentPlacementKey.current !== search.inputKey) return;
      if (checked.total !== 0 || candidate.placement.placements.some(p => (checked.rooms[p.lesson] ?? null) !== p.room)) {
        setVillkorsSokning(s => s && { ...s, error: 'Alternativet klarade inte den nya kontrollen. Inget har ändrats. Sök igen.' }); return;
      }
      await kontrolleraDatumKandidat(base, lessons, controller, nextVillkor);
      const action: SchemaUtkastAtgard = { type: 'arbetsvillkor', fore: villkor, efter: nextVillkor, placements: candidate.placement.placements, text: candidate.change.message };
      if (schemaUtkast(utkast, action) === utkast) throw new SchemaContractError();
      dispatch(action); setVillkorLocal(nextVillkor);
      setBase({ ...base, teachings: checked.teachings, trims: checked.trims, metrics: checked.metrics });
      setKontroll({ svar: checked, villkor: villkorNyckel(nextVillkor) });
      setSokning(null); setVillkorsSokning(null); setMoved('Villkorsändringen och placeringen är genomförda. Ångra återställer båda tillsammans.');
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setVillkorsSokning(s => s && { ...s, error: placeringsFel(caught) });
    } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
  }
  function datumInput(overrides = datedOverrides, dates: string[] = []) {
    const input = placeringsBas();
    return input ? { ...input, datedOverrides: overrides, dates: [...new Set(dates)].sort() } : null;
  }
  function valjDatum(key: SchemaDatumNyckel | SchemaDatumTillfalle) {
    if (!forslag || redigeringStoppad || busy || checking) return;
    const k = 'originalDate' in key && 'lesson' in key && typeof key.lesson === 'object' ? { lesson: key.lesson.id, originalDate: key.originalDate } : key as SchemaDatumNyckel;
    if (utkast.locked[k.lesson]) { setMoveError('Passet är låst. Lås upp det i grundschemat innan du ändrar ett tillfälle.'); return; }
    if (grundAndrad || issues.length) { setMoveError('Ta fram ett nytt förslag med de ändrade villkoren innan du ändrar ett datumtillfälle.'); return; }
    const date = datedOverrides.find(a => schemaDatumNyckel(a) === schemaDatumNyckel(k))?.date ?? k.originalDate;
    const o = schemaDatumTillfallen(forslag, { mode: 'intervall', from: date, to: date, monday: '' }, datedOverrides).find(o => o.key === schemaDatumNyckel(k));
    if (!o) { setMoveError('Tillfället finns inte längre i det aktuella schemat. Välj tillfället igen.'); return; }
    dispatch({ type: 'pick', lesson: null }); setDatumPicked({ ...o, expectedInputKey: JSON.stringify(datumInput()), grundFingerprint: forslag.grundFingerprint, period: forslag.period }); setMoveError(null);
  }
  async function andraDatum(key: SchemaDatumNyckel | null, change: SchemaDatumAndring | null, history?: { type: 'undo' | 'redo'; overrides: SchemaDatumAndring[] }, expectedInputKey?: string) {
    if (expectedInputKey && expectedInputKey !== JSON.stringify(datumInput())) { setMoveError('Schemat har ändrats sedan datumdialogen öppnades. Välj tillfället igen; inget har ändrats.'); return; }
    if (fonster && key && forslag) { synk.send({ typ: 'date', key, change, expectedInputKey: expectedInputKey ?? JSON.stringify(datumInput()), grundFingerprint: forslag.grundFingerprint, period: forslag.period }); return; }
    if (redigeringStoppad || !forslag || busy || checking || running.current || grundAndrad || issues.length) return;
    const next = history?.overrides ?? (key ? schemaDatumErsatt(datedOverrides, key, change) : datedOverrides);
    const input = datumInput(next, [...datedOverrides.flatMap(a => [a.originalDate, a.date]), ...(key ? [key.originalDate] : []), ...(change ? [change.date] : [])]);
    if (!input) return;
    const controller = new AbortController(); running.current = controller; setChecking(true); setMoveError(null);
    try {
      const reply = parseSchemaDatumSvar(await api.post<unknown>('/api/schema/datum', input, controller.signal), input);
      if (controller.signal.aborted) return;
      if (history) dispatch({ type: history.type }); else dispatch({ type: 'datum', fore: datedOverrides, efter: reply.datedOverrides, text: change ? 'Ändrat datumtillfälle' : 'Återställt datumtillfälle' });
      setDatedOverrides(reply.datedOverrides); setDatumPicked(null); setDatumKlar(`${key ? schemaDatumNyckel(key) : 'history'}:${++dateSequence.current}`);
      setDatumKontroll({ key: JSON.stringify({ ...input, dates: [] }), reply });
      setMoved(`${history ? history.type === 'undo' ? 'Datumändringen är ångrad.' : 'Datumändringen är gjord igen.' : 'Tillfället är ändrat.'} Grundschemat har samma placeringar.${reply.total ? ` ${reply.total} regelavvikelser på de kontrollerade datumen.` : ''}`);
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      const text = caught instanceof ApiError && caught.reason === 'schema_datum_date_invalid' ? 'Välj en undervisningsdag inom läsåret för deltagarnas klasser.'
        : caught instanceof ApiError && caught.reason === 'schema_datum_duration_changed' ? 'Tillfällets längd har ändrats i underlaget. Välj tillfället igen.'
        : caught instanceof ApiError && caught.reason === 'schema_datum_original_missing' ? 'Det ursprungliga tillfället finns inte längre. Återställ datumändringen innan du ändrar grundschemat.'
        : 'Datumändringen kunde inte kontrolleras. Inget har ändrats. Kontrollera datum, tid och deltagarnas giltighet och försök igen.';
      setMoveError(text);
    } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
  }
  function markeraMedveten(violation: SchemaViolation, on: boolean) {
    if (!medvetenKrock(violation)) return;
    if (fonster) { synk.send({ typ: 'intent', key: avvikelseNyckel(violation), on }); return; }
    if (!forslag || busy || checking || running.current || villkorKey !== provadeKey || issues.length || !kontroll?.violations.some(v => avvikelseNyckel(v) === avvikelseNyckel(violation))) return;
    dispatch({ type: 'intent', mark: medvetenMarkering(violation, utkast.placements, provadeKey, forslag.grundFingerprint), on });
    setMoved(on ? 'Avvikelsen är markerad som medveten krock. Regelbrottet finns kvar.' : 'Markeringen som medveten krock är borttagen. Regelbrottet finns kvar.');
  }
  /** Aktiviteter ändrar bara utkastet; servern bevarar befintliga undervisningspass och prövar samtliga placeringar. */
  async function andraAktiviteter(aktiviteter: SchemaAktivitet[], text: string): Promise<boolean> {
    // Före första förslaget (05.2-SM-UXF-31) är aktiviteten ett villkor som alla andra: den sparas i utkastet och underlaget läses om. Inget beräknas.
    if (!base && !fonster && !redigeringStoppad && !busy && !running.current) { andraArbetsvillkor({ ...villkor, aktiviteter }, text); return true; }
    if (redigeringStoppad || fonster || !base || !forslag || checking || busy || running.current) return false;
    if (issues.length) { setMoveError(`Rätta villkoren först: ${issues.join(' ')} Dina val i aktiviteten finns kvar.`); return false; }
    if (grundAndrad) {
      const changed = andradeGrundvillkor(base.villkor, villkor);
      setMoveError(`Du har ändrat ${changed.length ? changed.join(', ') : 'hur undervisningen kan delas upp'}. Ta fram ett nytt schemaförslag med de villkoren innan du lägger till eller ändrar aktiviteten. Dina val finns kvar i formuläret.`); return false;
    }
    if (lastAktivitetAndras(villkor.aktiviteter ?? [], aktiviteter, Object.keys(utkast.locked))) {
      setMoveError('Lås upp aktiviteten innan du ändrar eller tar bort den.'); return false;
    }
    const nextVillkor = { ...villkor, aktiviteter }, controller = new AbortController();
    running.current = controller; setChecking(true); setMoveError(null); setMoved('');
    try {
      const raw = await api.post<unknown>('/api/schema/aktiviteter', { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period: base.period,
        villkor: nextVillkor, previousVillkor: villkor, grundFingerprint: base.grundFingerprint, placements: placeringar }, controller.signal);
      if (controller.signal.aborted) return false;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 2 || !('forslag' in raw) || !('kontroll' in raw)) throw new SchemaContractError();
      const next = parseSchemaForslag(raw.forslag, { unitId, schoolYear, period: base.period, villkor: nextVillkor });
      const checked = parseSchemaKontroll(raw.kontroll, next.grundFingerprint);
      await kontrolleraDatumKandidat(next, next.lessons, controller, nextVillkor);
      dispatch({ type: 'aktiviteter', fore: { forslag, villkor }, efter: { forslag: next, villkor: nextVillkor }, text });
      setBase(next); setVillkor(nextVillkor); setKontroll({ svar: checked, villkor: villkorNyckel(nextVillkor) });
      setKraverNytt(null); setMisslyckat(null); setFolj(null);
      setMoved(`${text}. ${checked.total === 0 ? 'Inga regelavvikelser.' : `${checked.total} regelavvikelser.`}`);
      return true;
    } catch (caught) {
      if (controller.signal.aborted) return false;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return false; }
      setMoveError(moveMessage(caught, 'Aktiviteten')); return false;
    } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
  }
  /** 409 för ändrade tidsvillkor: de ändrar ändå vilka pass som finns, så kontrollen går tillbaka till förslagets villkor tills ett nytt förslag tas fram. */
  function kraver(caught: unknown): boolean {
    if (!(caught instanceof ApiError && caught.reason === 'schema_underlag_changed') || !base || provadeKey === forslagetsKey) return false;
    setKraverNytt(villkorKey); setMoveError(null);
    return true;
  }
  /**
   * Ändrade villkor (en ny spärr, ångra och gör om av ett villkor, en ändring i formuläret) prövas direkt: kontrollen körs om med nuvarande placeringar
   * och de villkor som prövas. Inget pass flyttas; salarna följer kontrollens val.
   */
  async function provaVillkor() {
    if (!base || checking || busy) return;
    const controller = new AbortController(), key = provadeKey;
    running.current = controller;
    setChecking(true); setMoveError(null); setMoved('');
    try {
      const reply = await kontrollera(base, medUtkast(base.lessons, utkast.placements), controller);
      setBase({ ...base, teachings: reply.teachings, trims: reply.trims, metrics: reply.metrics });
      dispatch({ type: 'salar', rooms: reply.rooms }); setKontroll({ svar: reply, villkor: key });
      setMoved(`Villkoren är prövade mot schemat. ${reply.total === 0 ? 'Inga regelavvikelser.' : `${reply.total} ${reply.total === 1 ? 'regelavvikelse' : 'regelavvikelser'}.`}`);
    } catch (caught) {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      if (kraver(caught)) return;
      setMisslyckat(key); setMoveError(moveMessage(caught, 'Villkoren'), false);
    } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
  }
  // Kontrollen gäller förslagets villkor tills den har körts om; körs om en stund efter att villkoren som prövas har ändrats (formuläret ändras tecken för tecken).
  const provat = kontrollSvar?.villkor ?? forslagetsKey;
  useEffect(() => {
    if (fonster || !base || checking || busy || provat === provadeKey || misslyckat === provadeKey) return;
    const timer = setTimeout(() => void provaVillkor(), 300);
    return () => clearTimeout(timer);
  });
  const span = forslag ? veckansSpann(forslag.days) : { start: 0, end: 0 };
  function grab(e: ReactPointerEvent<HTMLElement>, l: SchemaForslagLesson) {
    if (!forslag || checking || busy) return;
    if (fastAktivitet(l, provade) || utkast.locked[l.id] || utkast.tool === 'las' || e.shiftKey) return;
    dra(e, l, { forslag, grid: week.current, rest: rest.current, start: span.start, end: span.end, skipClick,
      onHover: to => setDrop({ lesson: l.id, to }), onEnd: () => setDrop(null),
      onDrop: to => {
        if (to.suggest && to.day !== null && to.startMin !== null) { void sokPlacering({ mode: 'target', lesson: l.id, target: { day: to.day, startMin: to.startMin, room: l.roomId }, depth: 1 }); return; }
        if (utkast.tool === 'byt') { if (to.other) void andra({ type: 'swap', lesson: l.id, other: to.other }); else setMoveError('Släpp på det pass som ska byta plats.'); return; }
        const fler = utkast.selected.includes(l.id) ? utkast.selected.filter(id => id !== l.id) : [];
        void andra(to.day === null || to.startMin === null ? { type: 'park', lesson: l.id, fler } : { type: 'move', lesson: l.id, day: to.day, startMin: to.startMin, fler });
      } });
  }
  /** Öppnar Följ passet för ett pass (knappen vid markerat pass, dubbelklick, tangenten F). Låst panel låses till det nya passet. */
  function foljPass(id: string) {
    const lesson = forslag?.lessons.find(l => l.id === id);
    if (!lesson) return;
    if (fastAktivitet(lesson, provade)) dispatch({ type: 'pick', lesson: id });
    else pick(lesson);
    if (vy !== 'folj') foljFran.current = vy;
    setVy('folj');
    foljFokus.current = true; setFolj(f => ({ lesson: id, locked: f?.locked ?? false }));
  }
  const foljHandelser = {
    onDoubleClick: (e: { target: EventTarget }) => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-lesson]')?.dataset.lesson; if (id) foljPass(id); },
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return;
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-lesson]')?.dataset.lesson;
      if (id) { e.preventDefault(); foljPass(id); }
    },
  };
  const steps = utkast.undo.filter(x => !datumSteg(x) && !villkorSteg(x) && !arbetsvillkorSteg(x) && !aktivitetsSteg(x) && !medvetenSteg(x)).length, pickedLesson = forslag?.lessons.find(l => l.id === picked) ?? null;
  const flagged = new Set(kontroll?.violations.flatMap(v => v.lessons));
  /** Varför passet avviker, ur kontrollens svar (05.2-SM-VILLKOR-DIREKT). */
  const avvikelse = (l: SchemaForslagLesson) => forslag && flagged.has(l.id) ? avvikelseRad(forslag, provade.egna, kontroll!.violations.filter(v => v.lessons.includes(l.id)).map(v => v.code), l) : null;
  const foljtId = folj ? !folj.locked && picked ? picked : folj.lesson : null;
  const foljt = foljtId ? forslag?.lessons.find(l => l.id === foljtId) ?? null : null;
  const placeringar = forslag?.lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]) ?? [];
  const placementBase = placeringsBas(), placementInputKey = placementBase ? JSON.stringify({ base: placeringsBasNyckel(placementBase), villkor: villkorKey }) : '';
  useEffect(() => { currentPlacementKey.current = placementInputKey; }, [placementInputKey]);
  const intentionalKeys = medvetnaAvvikelser(utkast, kontroll?.violations ?? [], villkorKey, forslag?.grundFingerprint ?? '');
  const intentionalPass = [...new Set((kontroll?.violations ?? []).filter(v => intentionalKeys.has(avvikelseNyckel(v))).flatMap(v => v.lessons))];
  const keepIntent = useMemo(() => (utkast.intentional ?? []).filter(m => medvetenGaller(m, utkast.placements, villkorKey, forslag?.grundFingerprint ?? '') && (!kontroll || kontroll.violations.some(v => medvetenKrock(v) && avvikelseNyckel(v) === m.key))).map(m => m.key), [utkast.intentional, utkast.placements, villkorKey, kontroll, forslag?.grundFingerprint]);
  useEffect(() => { if (!fonster && (utkast.intentional ?? []).length > keepIntent.length) dispatchLocal({ type: 'intent-prune', keys: keepIntent }); }, [fonster, utkast.intentional, keepIntent]);

  const bytLagen = useSchemaBytLagen({ forslag, villkor: provade, lesson: drop?.lesson ?? picked, placements: placeringar, userLocks: utkastLas(utkast), unitId, schoolYear, onSessionLost });
  const options = forslag ? (by === 'class' ? forslag.classes : forslag.teachers) : [];
  const selected = options.some(o => o.id === chosen) ? chosen : options[0]?.id ?? '';
  const selectedRef = forslag ? resursRefs(forslag).get(selected) : undefined;
  const windowResource = selectedRef ? `${selectedRef.slag}:${selectedRef.ref}` : undefined;
  const termpass = forslag?.lessons.some(l => l.term !== null) ?? false;
  const byTerm = termpass || forslag?.villkor.timeBasis === 'lasar' && forslag.time.terms.length > 1;
  const termTag = (l: SchemaForslagLesson) => l.term ? ` · ${l.term.toUpperCase()}` : '';
  const mine = (l: SchemaForslagLesson) => (l.term === null || l.term === shownTerm) && (by === 'class' ? l.classIds : l.teacherIds).includes(selected);
  // Justerad längd (05.2-SM-TIMPLAN-VECKA, W3): det passet kortas alla veckor i den termin som visas syns i veckan; kortning vissa veckor står i text.
  const viewTerm: SchemaTerm = !forslag || forslag.period === 'lasar' ? shownTerm : forslag.period;
  const datumVal = forslag ? schemaVeckaVal(forslag, viewTerm, visning) : visning;
  const trimOf = (l: SchemaForslagLesson) => forslag?.trims.find(x => x.lesson === l.id && x.term === (l.term ?? viewTerm)) ?? null;
  const shownMin = (l: SchemaForslagLesson) => l.durationMin - (trimOf(l)?.fixedMin ?? 0);
  const someWeeks = (l: SchemaForslagLesson) => { const n = trimOf(l)?.extraCount ?? 0; return n ? ` · kortare ${n === 1 ? 'en vecka' : `${n} veckor`}` : ''; };
  const roomName = (id: string | null) => (salbild ?? forslag)?.rooms.find(r => r.id === id)?.name ?? '';
  // Passets egna villkor med text (05.2-SM-VILLKOR-SYNS): justerad längd mot grundschemat (W6), kortning vissa veckor och salskrav.
  const passRader = (l: SchemaForslagLesson) => {
    const trim = trimOf(l), n = trim?.extraCount ?? 0, rooms = l.roomIds.map(roomName).filter(Boolean);
    return [intentionalPass.includes(l.id) ? 'Medveten krock · regelavvikelse kvar' : '', trim?.fixedMin ? `${shownMin(l)} min · ${l.durationMin} i grundschemat` : '', n ? `kortare ${n === 1 ? 'en vecka' : `${n} veckor`}` : '',
      rooms.length && (l.roomId === null || rooms.length > 1) ? `Salskrav: ${rooms.join(' eller ')}` : ''].filter(Boolean);
  };
  const detail = (l: SchemaForslagLesson) => forslag ? [by === 'class' ? (l.vacant && l.teacherIds.length === 0 ? 'Ingen lärare' : names(l.teacherIds, forslag.teachers)) : names(l.classIds, forslag.classes), roomName(l.roomId)].filter(Boolean).join(' · ') : '';
  const dragged = drop ? forslag?.lessons.find(l => l.id === drop.lesson) ?? null : null;
  const unplaced = forslag?.lessons.filter(l => l.day === null) ?? [];
  const shown = forslag?.lessons.filter(l => l.day !== null && l.startMin !== null && (datumVal.mode === 'grundschema' ? mine(l) : (by === 'class' ? l.classIds : l.teacherIds).includes(selected))) ?? [];
  const d = SCHEMA_DEFAULTS;
  const { deviating, off } = tidAvvikelser(forslag);
  // Villkoren som lager för den klass eller lärare som visas. Lagren följer villkoren i formuläret, så att en ändring syns direkt.
  const allaITerminen = forslag?.lessons.filter(l => l.term === null || l.term === shownTerm) ?? [];
  const lager = forslag ? schemaLager(villkor, forslag, { slag: by === 'class' ? 'klass' : 'larare', ref: selected }, { lessons: shown, alla: allaITerminen, layers: utkast.layers }) : null;
  const egnaSyns = lager ? Object.values(lager.kallor).filter(k => k.typ === 'egen').length : 0;
  const villkorAndrade = forslag !== null && villkorKey !== forslagetsKey;
  const NAMN = { onskemal: 'Sena pass (undviks)', 'band-marginal': 'Marginal före eller efter pass' };
  function taBort(k: Extract<SchemaKalla, { typ: 'egen' }>) {
    const rule = villkor.egna[k.index];
    if (!rule) return;
    const efter = villkor.egna.filter((_, i) => i !== k.index);
    dispatch({ type: 'villkor', fore: villkor.egna, efter, text: 'Borttaget villkor' });
    setVillkor({ ...villkor, egna: efter }); setBorttaget({ rule, index: k.index });
  }
  function angra() {
    if (!borttaget || checking || busy) return;
    aterFalt.current = `egna:${borttaget.index}`;
    const step = utkast.undo.at(-1);
    if (villkorSteg(step) && step.text === 'Borttaget villkor' && villkorNyckel(step.efter) === villkorNyckel(villkor.egna)) { void andra({ type: 'undo' }); return; }
    const efter = [...villkor.egna.slice(0, borttaget.index), borttaget.rule, ...villkor.egna.slice(borttaget.index)];
    dispatch({ type: 'villkor', fore: villkor.egna, efter, text: 'Återställt borttaget villkor' }); setVillkor({ ...villkor, egna: efter }); setBorttaget(null);
  }
  // Verktygsfält, snabbmeny, spärrar och tangentbord i veckan (05.2-SM-MENY).
  const meny = useSchemaMeny({ forslag, utkast, dispatch, villkor, setVillkor, shown, alla: allaITerminen, visad: selected, unplaced, kallor: lager?.kallor ?? {}, length: shownMin, checking, week,
    synlig: visadVy(vy, true, true, foljt !== null) === 'vecka', andra: action => void andra(action), pick, taBort, folj: foljPass, andraVillkor: andraFalt,
    foresla: lesson => void sokPlacering({ mode: 'lesson', lesson, target: null, depth: 1 }),
    minsta: time => { if (picked) void sokPlacering({ mode: 'target', lesson: picked, target: { day: time.day, startMin: time.startMin, room: pickedLesson?.roomId ?? null }, depth: 1 }); },
    gemensam: time => { setSamlingStart({ nr: Date.now(), resources: [selected], time, common: true }); setVy('samling'); rememberVy('samling'); },
    onOpenWindow: l => { if (fastAktivitet(l, provade)) dispatch({ type: 'pick', lesson: l.id }); else pick(l); synk.open({ view: 'folj' }); },
    nyAktivitet: fonster ? undefined : time => { const ref = forslag ? resursRefs(forslag).get(selected) : undefined;
      const resurs = ref && (ref.slag === 'klass' || ref.slag === 'grupp' || ref.slag === 'larare' || ref.slag === 'sal') ? { slag: ref.slag, ref: ref.ref } : undefined;
      setAktivitetsStart({ day: time.day, startMin: time.startMin, nr: Date.now(), resurs }); } });
  /** Visa i veckan (05.2-SM-PASSTABELL): veckan för passets klass (eller lärare) och termin, med passet markerat och i fokus. */
  function visaIVeckan(l: SchemaForslagLesson) {
    if (!forslag) return;
    if (!mine(l) || l.term !== null && l.term !== shownTerm) {
      const klass = l.classIds.find(id => forslag.classes.some(c => c.id === id));
      if (klass) { setBy('class'); setChosen(klass); } else if (l.teacherIds[0]) { setBy('teacher'); setChosen(l.teacherIds[0]); }
      if (l.term) setShownTerm(l.term);
    }
    setVy('vecka'); rememberVy('vecka');
    visaFokus.current = l.id;
    if (picked !== l.id) pick(l);
  }
  function diagnosVillkor(resource?: SchemaDiagnosResurs) {
    if (resource?.id.startsWith('kluster-')) { diagnosMal({ target: 'grupper', label: 'Öppna undervisningsgrupper' }); return; }
    if (forslag && resource) {
      const flik = resource.typ === 'undervisning' ? 'amne' : resource.typ;
      setVillkorMal({ flik, ref: resource.id, nr: Date.now() }); setVy('villkor');
    } else {
      const box = document.querySelector<HTMLDetailsElement>('details.schema-villkor');
      if (box) { box.open = true; box.scrollIntoView({ block: 'center' }); box.querySelector<HTMLElement>('input,select,button')?.focus(); }
    }
  }
  function diagnosMal(action: SchemaDiagnosAction) {
    if (action.target === 'villkor') { diagnosVillkor(action.resource); return; }
    const view = { tjanst: 'tjanst', grupper: 'undervisningsgrupper', timplan: 'timplaner' }[action.target];
    window.open(`/?${new URLSearchParams({ vy: view, planeringsskola: unitId, planeringslasar: String(schoolYear) })}`, '_blank', 'noopener');
  }
  const tabellAtgarder = (l: SchemaForslagLesson) => ({ ...meny.passAtgarder(l), visaIVeckan: l.day !== null ? () => visaIVeckan(l) : undefined });
  const tabellRubrik = (l: SchemaForslagLesson) => l.day === null ? `${l.title} · på viloytan` : `${l.title} · ${meny.text(l).slice(l.title.length + 1)}`;
  const markerade = flagged;
  const falt = (o: SchemaOverlay, label: string, content: ReactNode) => {
    const k = o.sourceId ? lager?.kallor[o.sourceId] : undefined;
    return k && forslag ? <FaltKalla label={label} kalla={k} villkor={villkor} resurser={forslag.resurser} onAndra={andraFalt} onTaBort={taBort}>{content}</FaltKalla> : null;
  };

  // Ångra, gör om, Följ passet och beskeden om ändrade villkor gäller utkastet och står i både veckan och tabellen (05.2-SM-PASSTABELL).
  const gemensamt = forslag && <>
    <div className="schema-moves rounded-lg border border-border bg-card p-3">
      <div className="schema-undo" aria-label="Ångra och gör om ändringar">
        <Button type="button" variant="outline" disabled={utkast.undo.length === 0 || checking} onClick={() => void andra({ type: 'undo' })}>{datumSteg(utkast.undo.at(-1)) ? 'Ångra senaste datumändring' : medvetenSteg(utkast.undo.at(-1)) ? 'Ångra medveten krock' : aktivitetsSteg(utkast.undo.at(-1)) ? 'Ångra senaste aktivitet' : (villkorSteg(utkast.undo.at(-1)) || arbetsvillkorSteg(utkast.undo.at(-1))) ? 'Ångra senaste villkor' : 'Ångra senaste flytt'}</Button>
        <Button type="button" variant="outline" disabled={utkast.redo.length === 0 || checking} onClick={() => void andra({ type: 'redo' })}>Gör om</Button>
        {/* Följ passet (05.2-SM-FOLJ) vid markerat pass; även dubbelklick eller tangenten F på ett pass. */}
        {pickedLesson && vy !== 'folj' && <Button type="button" variant="outline" title="Även dubbelklick eller tangenten F på ett pass" onClick={() => foljPass(pickedLesson.id)}>Följ passet</Button>}
      </div>
      {meny.meddelande}
    </div>
    {borttaget && <output className="schema-borttaget"><span className="schema-note">Villkoret är borttaget: {ruleText(borttaget.rule, forslag.resurser)}. Det gäller inte nästa förslag.</span>
      <Button ref={angraVillkor} type="button" variant="outline" disabled={busy || checking} focusableWhenDisabled className="aria-disabled:pointer-events-none aria-disabled:opacity-50" onClick={angra}>Ångra borttagningen</Button></output>}
    {villkorAndrade && <p className="schema-note" data-villkor-andrade={grundAndrad ? 'grund' : issues.length ? 'fel' : 'tid'}>{grundAndrad
      ? kraverNytt === villkorKey
        ? 'Ändringen kräver ett nytt förslag: villkoren ändrar hur passen kan delas på veckans dagar. Flytt, kontroll och möjliga starttider följer förslagets villkor tills du tar fram ett nytt förslag.'
        : 'Ändringen kräver ett nytt förslag. Längsta och kortaste pass, passlängd, antal pass och salarna avgör vilka pass som finns. Flytt, kontroll och möjliga starttider följer förslagets villkor tills du tar fram ett nytt förslag.'
      : issues.length
        ? 'Villkoren har ändrats men har fel. Kontrollen följer förslagets villkor tills felen är rättade.'
        : 'Villkoren har ändrats sedan förslaget togs fram. Kontrollen, möjliga starttider och Följ passet prövar de ändrade villkoren direkt. Passen ligger kvar tills du flyttar dem eller tar fram ett nytt förslag.'}</p>}
  </>;
  // Villkor i tabell (05.2-SM-VILLKORSTABELL): samma villkor och utkast som veckan, med ångra och beskeden ovanför.
  const villkorsvy: ReactNode | undefined = forslag ? <>
    <Villkorstabell villkor={villkor} setVillkor={setTabellVillkor} dispatch={dispatch} forslag={forslag} kontroll={kontroll} disabled={busy || checking} mal={villkorMal} onOpen={() => synk.open({ view: 'villkor' })}/>
  </> : undefined;
  const samlingsvy = forslag ? <div ref={resursvy}>
    <Samling intentional={intentionalPass} forslag={forslag} villkor={provade} placements={placeringar} layers={utkast.layers} term={viewTerm} picked={picked}
      violations={[...flagged]} locked={Object.keys(utkast.locked)} windows={synk.opened} onOpenWindows={synk.openSet} onOpen={() => synk.open({ view: 'samling' })} start={samlingStart} onSessionLost={onSessionLost}
      onLayer={(layer, on) => { dispatch({ type: 'layer', layer, on }); rememberLager({ ...utkast.layers, [layer]: on }); }}
      onPick={id => { const l = forslag.lessons.find(x => x.id === id); if (l) pick(l); }}/>
  </div> : undefined;
  const foljvy = forslag && foljt ? <div ref={resursvy}>
    <Folj intentional={intentionalPass} key={foljt.id} forslag={forslag} lesson={foljt} placements={placeringar} villkor={provade} userLocks={utkastLas(utkast)} locked={folj!.locked} checking={checking || busy} headingRef={foljRubrik} term={shownTerm}
      onPick={id => { const l = forslag.lessons.find(x => x.id === id); if (l) meny.onPick(l); }}
      onSwap={() => meny.passAtgarder(foljt).byt?.()}
      onSuggest={() => void sokPlacering({ mode: 'lesson', lesson: foljt.id, target: null, depth: 1 })}
      onLock={locked => setFolj(f => f && { ...f, lesson: foljt.id, locked })} onOpen={() => synk.open({ view: 'folj' })} onClose={() => {
        setFolj(null); setVy(foljFran.current === 'folj' ? 'vecka' : foljFran.current);
        requestAnimationFrame(() => passElement(foljt.id)?.focus());
      }} onSessionLost={onSessionLost}
      onMove={p => void andra({ type: 'move', lesson: foljt.id, day: p.day, startMin: p.startMin, room: p.room })}/>
  </div> : undefined;
  const datumRequest = datumInput(), datumInputKey = JSON.stringify(datumRequest);
  if (datumPicked && (redigeringStoppad || datumPicked.expectedInputKey !== datumInputKey || datumPicked.grundFingerprint !== forslag?.grundFingerprint || datumPicked.period !== forslag?.period)) setDatumPicked(null);
  const datumSvar = datumKontroll?.key === datumInputKey ? datumKontroll.reply : null;
  useEffect(() => {
    if (fonster || redigeringStoppad || !datedOverrides.length || !datumInputKey || datumInputKey === 'null' || datumKontroll?.key === datumInputKey) return;
    const request = JSON.parse(datumInputKey) as NonNullable<ReturnType<typeof datumInput>>, controller = new AbortController();
    void api.post<unknown>('/api/schema/datum', request, controller.signal).then(raw => {
      if (!controller.signal.aborted) setDatumKontroll({ key: datumInputKey, reply: parseSchemaDatumSvar(raw, request) });
    }).catch(caught => { if (!controller.signal.aborted) { if (caught instanceof ApiError && caught.status === 401) onSessionLost(); else setMoveError('Datumändringarna kunde inte kontrolleras. De finns kvar; försök igen innan du ändrar schemat.'); } });
    return () => controller.abort();
  }, [fonster, redigeringStoppad, datedOverrides.length, datumInputKey, datumKontroll?.key, onSessionLost, setMoveError]);
  const aktivaLas = utkastLas(utkast);
  const recoveryLocks = (grundAndrad || byterGrund) && aktivaLas.length > 0;
  const recoveryKey = JSON.stringify({ unitId, schoolYear, period, villkor: berakningsVillkor, ...(base && aktivaLas.length && !recoveryLocks ? { locks: { grundFingerprint: base.grundFingerprint, placements: aktivaLas } } : {}) });
  const diagnosAktuell = fore?.key === recoveryKey ? fore : null;
  const recoveryFore = fore?.key === recoveryKey ? fore : null;
  // Ytorna Förbered och Lägg schema (05.2-SM-UXF-31) visar samma utkast. Formuläret för regler och aktivitetslistan finns på båda och ritas där ytan står.
  const meddelanden = <>
    <output aria-live="polite" className="schema-note">{busy ? berakningssteg === 'forbereder' ? 'Förbereder ett nytt schemaförslag…' : berakningssteg === 'diagnos' ? 'Kontrollerar underlaget före beräkning…' : `Schemamotorn räknar. Det tar upp till ${d.solveTimeMs / 1000} sekunder.` : ''}</output>
    {!sokning && diagnosAktuell && diagnosAktuell.findings.length > 0 && <ForeBerakning findings={diagnosAktuell.findings} busy={busy || checking} onContinue={() => void run(true, diagnosAktuell.releaseLocks)} onTarget={diagnosMal}/>}
    {error && <div className="valplan-alert" role="alert"><p>{error}</p></div>}
    {moveError && <div ref={moveErrorRef} tabIndex={-1} className="valplan-alert" role="alert"><p>{moveError}</p></div>}
    {forslag && forslag.metrics.lessons === 0 && <UnderlagHinder forslag={forslag} onTeaching={() => diagnosMal({ target: 'tjanst', label: 'Öppna tjänstefördelningen' })} onNeeds={() => diagnosMal({ target: 'timplan', label: 'Öppna timplanerna' })}/>}
    {!forslag && !busy && !error && <p className="empty-state">Inget förslag ännu. Välj vad schemat gäller, se över villkoren och ta fram ett schemaförslag.</p>}
  </>;
  const regelformId = `${resultHeading}-regler`;
  // Utkastet och villkoren som en förhandsgranskning av salar gäller. Ändras något av dem är den inaktuell.
  const salsattningsNyckel = JSON.stringify([utkast.placements, utkast.locked, provadeKey, salNyckel, datedOverrides.length]);
  const underkanda = salkrockar(), utanSal = passMedSal.filter(l => l.day !== null && l.roomIds.length > 0 && (l.roomId === null || !l.roomIds.includes(l.roomId) || underkanda.has(l.id))).length;
  const salsattningsvy = forslag && !fonster && <Salsattningspanel utanSal={utanSal} visning={salsattning} inaktuell={!!salsattning && salsattning.nyckel !== salsattningsNyckel} busy={busy || checking} roomName={roomName}
    stopp={redigeringStoppad ? 'Utkastet behöver läsas eller sparas innan salar kan tilldelas.' : grundAndrad ? 'Underlaget har ändrats. Ta fram ett nytt förslag innan salar tilldelas.' : issues.length ? 'Rätta felen i villkoren först.' : null}
    onForhandsgranska={() => void forhandsgranskaSalar()} onAnvand={anvandSalar} onAvbryt={() => setSalsattning(null)}/>;
  // Vad nästa Ångra avser, i klartext.
  const senasteSteg = utkast.undo.at(-1), angraText = senasteSteg && arbetsvillkorSteg(senasteSteg) ? `Ångra: ${senasteSteg.text.charAt(0).toLocaleLowerCase('sv')}${senasteSteg.text.slice(1)}` : 'Ångra';
  const taFramKnapp = <Button type="submit" form={regelformId} variant={sokning || diagnosAktuell?.findings.length ? 'outline' : 'default'} disabled={busy || checking || issues.length > 0}>{busy ? 'Räknar…' : 'Ta fram schemaförslag'}</Button>;
  const regelform = !fonster && <form id={regelformId} className="schema-controls" onSubmit={e => { e.preventDefault(); void run(); }}>
      <label>Schemat gäller<select value={period} disabled={busy || checking || !spara.ready} onChange={e => void bytPeriod(e.target.value as SchemaPeriod)}>
        <option value="lasar">{PERIOD.lasar}</option><option value="ht">{PERIOD.ht}</option><option value="vt">{PERIOD.vt}</option></select></label>
      {!visaForbered && <Button type="submit" variant={sokning || diagnosAktuell?.findings.length ? 'outline' : 'default'} disabled={busy || checking || issues.length > 0}>{busy ? 'Räknar…' : 'Ta fram schemaförslag'}</Button>}
      <p className="schema-note schema-wide">Ämnenas sammanlagda tid för läsåret kommer från timplanen, via tjänstefördelningen. Ett gemensamt veckomönster används på hösten och våren när undervisningen och lärarna är desamma. Tid och kortningar räknas över årets faktiska lektionstillfällen. Undervisning som bara går en termin ligger kvar där.</p>
      <Villkor value={villkor} disabled={busy || checking} issues={issues} resurser={forutsattningar?.resurser ?? null} forslag={forslag} onChange={andraArbetsvillkor}
        resurserBesked={issues.length ? 'Rätta felen i villkoren för att läsa klasser, grupper, ämnen och lärare från underlaget.' : underlagLas.error ?? 'Läser klasser, grupper, ämnen och lärare från underlaget…'}/>
    </form>;
  const aktivitetsvy = (f: SchemaForslag) => <Aktiviteter personalLookup={personalLookup} onSessionLost={onSessionLost} activityTypes={activityTypes} onTypesChange={setActivityTypes} forslag={f} villkor={villkor} lessons={f.lessons} busy={busy || checking} onChange={andraAktiviteter} saveError={error ?? moveError}
        recoveryAction={(grundAndrad || error || !!recoveryFore?.findings.length) && <div className="grid gap-3">
          {!!recoveryFore?.findings.length && <div><p className="font-medium">Kontroll före nytt förslag</p><ul className="list-disc pl-5">{recoveryFore.findings.map((f, i) => <li key={i}>{f.message}</li>)}</ul></div>}
          <p className="text-muted-foreground">Ett nytt förslag räknar om passens placeringar. Formuläret för aktiviteten står kvar.</p>
          {grundAndrad && aktivaLas.length > 0 && <p>De {aktivaLas.length} låsta passen hör till den tidigare uppdelningen. Med knappen nedan släpper du låsen i det nya förslaget. Om beräkningen misslyckas finns de gamla låsen och dina formulärval kvar.</p>}
          <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={busy || checking || issues.length > 0} onClick={() => void run(!!recoveryFore?.findings.length, grundAndrad && aktivaLas.length > 0)}>{busy ? 'Tar fram nytt schemaförslag…' : grundAndrad && aktivaLas.length > 0 ? `Lås upp ${aktivaLas.length} pass och ta fram nytt förslag${recoveryFore?.findings.length ? ' ändå' : ''}` : recoveryFore?.findings.length ? 'Ta fram nytt förslag ändå och behåll formuläret' : 'Ta fram nytt förslag och behåll formuläret'}</Button>
        </div>}
        start={aktivitetsStart} onStartHandled={() => setAktivitetsStart(null)}/>;
  if (fonster && !synk.live) return <section className="valplan-workspace schema-workspace"><FonsterList synk={synk} title={fonsterVyNamn[fonster.view]}/><p className="empty-state">Väntar på huvudfönstret. Inga ändringar kan göras innan kontakten är tillbaka.</p></section>;
  return <section className="valplan-workspace schema-workspace">
    <FonsterList synk={synk} title={fonster ? fonsterVyNamn[fonster.view] : 'Arbetsytan'}><FonsterMeny synk={synk} disabled={!forslag} resource={windowResource}/></FonsterList>
    {!fonster && <div className="page-heading"><div><h1>Schema<span className="heading-dot">.</span></h1><p>Läsår {planningYearLabel(schoolYear)}. Schemat utgår från skolans tjänstefördelning och sparas som utkast på servern.</p></div></div>}
    <Sparstatus state={sparstatus} name={draftName} disabled={busy || checking || !spara.ready} child={!!fonster} onName={setDraftName} onSave={() => void spara.flush()} onRead={() => void lasServerversion()} onNew={() => void run()}/>
    {!fonster && <Ytval yta={yta} onYta={valjYta}/>}
    {forslag && !visaForbered && datedOverrides.length > 0 && <section className="rounded-lg border border-border bg-card p-4 space-y-2" aria-label="Datumändringar">
      <h2 className="section-heading">{datedOverrides.length} {datedOverrides.length === 1 ? 'ändrat tillfälle' : 'ändrade tillfällen'}</h2>
      <p className="text-sm text-muted-foreground">Datum, tid och sal gäller bara tillfällena. Grundschemat behåller sina placeringar.</p>
      {!datumSvar && <output>Kontrollerar datumändringar…</output>}
      {datumSvar?.violations.map((v, i) => <p key={i} className="text-destructive" role="alert">{v.date}: {v.message}</p>)}
      {datumSvar?.timeChanges.map(t => <p key={`${t.ref}:${t.term}`} className={t.deviation ? 'text-destructive' : ''}>{forslag.teachings.find(x => x.ref === t.ref)?.title}: {PERIOD[t.term]} {t.deltaMin > 0 ? '+' : ''}{t.deltaMin} minuter. {t.plannedMin} av {t.needMin} minuter från timplanen. {t.deviation ? 'Tiden behöver ses över.' : ''}</p>)}
      <ul className="divide-y divide-border">{datedOverrides.map(a => <li key={schemaDatumNyckel(a)} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{forslag.lessons.find(l => l.id === a.lesson)?.title} · {a.originalDate} → {a.date} {clock(a.startMin)}</span><Button type="button" variant="outline" disabled={busy || checking || redigeringStoppad} onClick={() => valjDatum(a)}>Ändra tillfället</Button></li>)}</ul>
    </section>}
    {forslag && datumPicked && <DatumFlytt salScope={placeringsBas()} datedOverrides={datedOverrides} onSessionLost={onSessionLost} key={datumPicked.key} occurrence={datumPicked} forslag={forslag} busy={busy || checking} error={moveError} onSave={change => void andraDatum({ lesson: datumPicked.lesson.id, originalDate: datumPicked.originalDate }, change, undefined, datumPicked.expectedInputKey)} onClose={() => setDatumPicked(null)} onBase={() => { const l = forslag.lessons.find(l => l.id === datumPicked.lesson.id); setDatumPicked(null); setVisning(grundschemaVal()); if (l) pick(l); }}/>}
    <fieldset className="contents" disabled={redigeringStoppad}>
    {gemensamt}
    {visaForbered && <>
      {!forslag && (utkast.undo.length > 0 || utkast.redo.length > 0) && <div className="schema-moves rounded-lg border border-border bg-card p-3"><div className="schema-undo" aria-label="Ångra och gör om ändringar">
        <Button type="button" variant="outline" disabled={utkast.undo.length === 0 || busy} onClick={() => void andra({ type: 'undo' })}>{angraText}</Button>
        <Button type="button" variant="outline" disabled={utkast.redo.length === 0 || busy} onClick={() => void andra({ type: 'redo' })}>Gör om</Button></div>
        <output aria-live="polite" className="schema-note">{moved}</output></div>}
      <ForberedOversikt punkter={forberedPunkter} genomgang={genomgang} disabled={busy} onGenomgang={setGenomgang}/>
      <ForutsattningarKort punkter={forberedPunkter} busy={busy || checking || issues.length > 0 || !spara.ready} kontrollera={() => void kontrolleraUnderlag()} taFram={taFramKnapp}
        provning={forslag ? { typ: 'forslag', status: forslag.status === 'complete' ? 'beräkningen blev klar' : STATUS[forslag.status].text.toLocaleLowerCase('sv'), inaktuellt: grundAndrad } : diagnosAktuell ? { typ: 'kontroll', fynd: diagnosAktuell.findings.length, tid: foreTid } : { typ: 'inte' }}
        kvalitet={forslag && forslag.metrics.lessons > 0 ? <div className="space-y-2"><p className="flex flex-wrap gap-2"><Lagesstatus lessons={passMedSal}/></p>
          {forslag.metrics.placed > 0 && <p>Håltid per vecka: elever {forslag.metrics.studentGapMin} min, lärare {forslag.metrics.teacherGapMin} min.</p>}</div> : null}/>
    </>}
    {forslag && !visaForbered && forslag.villkor.timeBasis !== 'lasar' && !fonster && <section aria-label="Gemensamt läsårsmönster" className="rounded-lg border border-border bg-card p-4 space-y-2">
      <h2 className="section-heading">Gemensamt läsårsmönster</h2>
      <p>Det här utkastet räknades med separata terminstider. Ett nytt förslag räknar ämnenas tid över hela läsåret och behåller samma veckomönster på hösten och våren när undervisningen och lärarna är desamma.</p>
      <p className="schema-note">Det sparade utkastet ligger kvar tills ett nytt förslag är framtaget.</p>
      <Button type="button" variant="outline" disabled={busy || checking || issues.length > 0 || !spara.ready} onClick={() => void run(Boolean(recoveryFore?.findings.length), recoveryLocks)}>
        {recoveryLocks ? `Lås upp ${aktivaLas.length} pass och ta fram läsårsmönster` : 'Ta fram gemensamt läsårsmönster'}
      </Button>
    </section>}
    {visaForbered && <>
      {meddelanden}
      <Omrade id="underlag" titel="Underlag">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3" data-underlag={forutsattningar ? 'last' : underlagLas.error ? 'fel' : 'laser'}>
          {underlagLas.error && <div className="flex flex-wrap items-center gap-3"><output>{underlagLas.error}</output><Button type="button" variant="outline" onClick={underlagLas.reload}>Läs underlaget igen</Button></div>}
          {!forutsattningar && !underlagLas.error && <output className="schema-note">{issues.length ? 'Underlaget läses när felen i villkoren är rättade.' : 'Läser underlaget…'}</output>}
          {forutsattningar && <>
            <p>{forutsattningar.fordelning.length} undervisningar, {forutsattningar.resurser.klass.length} klasser, {forutsattningar.resurser.grupp.length} grupper och {forutsattningar.resurser.larare.length} lärare är lästa. Med de här villkoren blir det {forutsattningar.lessons.length} pass per vecka. {forslag ? '' : 'Inget schemaförslag är beräknat.'}</p>
            <p className="schema-note">{forutsattningar.basis ? `Underlag: tjänstefördelning version ${forutsattningar.basis.versionNo} (${BASIS[forutsattningar.basis.status] ?? forutsattningar.basis.status}).` : 'Skolan har ingen tjänstefördelning för läsåret; bara behoven är underlag.'}{underlagLas.loading ? ' Läser om efter ändrade villkor…' : ''}</p>
          </>}
        </div>
        {forslag && <Underlag forslag={forslag}/>}
      </Omrade>
      <Omrade id="lektioner" titel="Lektioner och block">
        {forutsattningar && forutsattningar.fordelning.length > 0 ? <details className="rounded-lg border border-border bg-card p-3"><summary className="cursor-pointer font-medium">Antal lektioner per undervisning</summary><Fordelning forslag={forutsattningar} villkor={villkor} kontroll={forslag ? kontroll : null} disabled={busy || checking} onChange={andraArbetsvillkor}/></details>
          : <p className="empty-state">Undervisningarna visas när underlaget är läst.</p>}
        <Samtidighetsblock villkor={villkor} kalla={forutsattningar} disabled={busy || checking} onChange={andraArbetsvillkor}/>
      </Omrade>
      <Omrade id="salar" titel="Salar">
      {!fonster && <Salar villkor={villkor} kalla={forutsattningar} disabled={busy || checking} onChange={andraArbetsvillkor} skola={skolsalar}
        besked={issues.length ? 'Rätta felen i villkoren för att läsa undervisningarna från underlaget.' : underlagLas.error ?? 'Läser undervisningarna från underlaget…'}/>}
      </Omrade>
      <Omrade id="larartider" titel="Lärartider och fasta tider">
        <p className="schema-note">Spärrad och tillåten tid och längsta dag per lärare anges i tabellen under fliken Lärare. En lärare utan tidsvillkor räknas som tillgänglig hela skoldagen.</p>
        {forutsattningar ? <details className="rounded-lg border border-border bg-card p-3"><summary className="cursor-pointer font-medium">Villkor i tabell</summary>
          <Villkorstabell villkor={villkor} setVillkor={setTabellVillkor} dispatch={dispatch} forslag={forutsattningar} kontroll={forslag ? kontroll : null} disabled={busy || checking} mal={villkorMal}/></details>
          : <p className="empty-state">Lärarna visas när underlaget är läst.</p>}
      </Omrade>
      <Omrade id="aktiviteter" titel="Aktiviteter och nationella prov">
        <p className="schema-note">Skolans återkommande aktiviteter läggs in här så att schemat läggs runt dem. Val av nationella prov är inte byggt; provtid räknas ännu inte in i ämnenas tid.</p>
        {forutsattningar ? aktivitetsvy(forutsattningar) : <p className="empty-state">Aktiviteter kan läggas till när underlaget är läst.</p>}
      </Omrade>
    </>}
    {/* Formuläret ligger på samma plats i båda ytorna, så att dess öppna läge och pågående val finns kvar när ytan byts. */}
    <section id={visaForbered ? forberedAnkare('regler') : undefined} aria-labelledby={visaForbered ? `${forberedAnkare('regler')}-rubrik` : undefined} className={visaForbered ? 'space-y-3 scroll-mt-4' : 'contents'} data-omrade={visaForbered ? 'regler' : undefined}>
      {visaForbered && <div className="section-heading"><h2 id={`${forberedAnkare('regler')}-rubrik`} tabIndex={-1}>Regler och önskemål</h2></div>}
      {regelform}
    </section>
    {visaForbered && <>
      <Omrade id="mal" titel="Mål för schemat">
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">{forberedPunkter.find(p => p.id === 'mal')!.varden.map(text => <p key={text}>{text}.</p>)}
          <p className="schema-note">{forberedPunkter.find(p => p.id === 'mal')!.kontroll.join(' ')} Klockslaget för sena pass ändras under Regler och önskemål.</p></div>
      </Omrade>
    </>}
    {!visaForbered && meddelanden}

    {forslag && sokning && <Placeringsforslag search={sokning} forslag={forslag} stale={placementInputKey !== sokning.inputKey} checking={checking || busy}
      onDepth={depth => void sokPlacering({ mode: sokning.request.mode, lesson: sokning.request.lesson, target: sokning.request.target, depth })} onApply={(index, key) => void genomforPlacering(index, key)} onClose={stangPlacering}>
      {villkorsSokning && villkorsSokning.key === sokning.key && <Villkorsforslag search={villkorsSokning} forslag={forslag} stale={placementInputKey !== villkorsSokning.inputKey} disabled={busy || checking} onApply={(i, key) => void genomforVillkorsforslag(i, key)}/>}
    </Placeringsforslag>}
    {forslag && !visaForbered && <>
      <div className="schema-summary" aria-labelledby={resultHeading}>
        <h2 id={resultHeading} className="sr-only">Schemaförslag</h2>
        {forslag.status !== 'complete' && <span className={`status-badge ${STATUS[forslag.status].tone}`}>Förslag · {STATUS[forslag.status].text}</span>}
        {forslag.metrics.lessons > 0 && <Lagesstatus lessons={passMedSal}/>}
        {forslag.metrics.lessons > 0 && <span className={`status-badge ${off ? 'warning' : forslag.villkor.timeBasis === 'lasar' && forslag.period !== 'lasar' ? '' : 'success'}`}>{off ? `Avviker från timplanen · ${off}` : forslag.villkor.timeBasis === 'lasar' && forslag.period !== 'lasar' ? 'Årsberäknad terminsdel' : 'Tiden följer timplanen'}</span>}
        {steps > 0 && <span className="status-badge warning">Ändrat för hand · {steps} {steps === 1 ? 'flytt' : 'flyttar'}</span>}
        {kontroll && kontroll.total > 0 && <span className="status-badge warning">{kontroll.total} {kontroll.total === 1 ? 'regelavvikelse' : 'regelavvikelser'}</span>}
        {egnaSyns > 0 && <span className="status-badge">{egnaSyns} {egnaSyns === 1 ? 'eget villkor syns' : 'egna villkor syns'} i veckan</span>}
        <p>{PERIOD[forslag.period]}. {forslag.metrics.placed} av {forslag.metrics.lessons} pass har fått en tid.</p>
        <p className="schema-note">{forslag.basis ? `Underlag: tjänstefördelning version ${forslag.basis.versionNo} (${BASIS[forslag.basis.status] ?? forslag.basis.status}).` : 'Skolan har ingen tjänstefördelning för läsåret; bara behoven är underlag.'}
          {forslag.time.source === 'kalender'
            ? ` Tid: ${forslag.time.schoolDays} skoldagar${forslag.time.terms.length > 1 ? ` (${forslag.time.terms.map(t => `${t.term.toUpperCase()} ${t.schoolDays}`).join(', ')})` : ''} enligt läsårskalendern version ${forslag.time.version} (${CALENDAR[forslag.time.status ?? ''] ?? forslag.time.status}${forslag.time.current ? ', gällande' : ''}).`
            : ` Läsårskalender saknas för läsåret: ${forslag.time.weeks} lika veckor har antagits.`}
          {forslag.metrics.placed > 0 && ` Håltid per vecka: elever ${forslag.metrics.studentGapMin} min, lärare ${forslag.metrics.teacherGapMin} min.`}</p>
      </div>

      {salsattningsvy}
      {forslag.metrics.lessons > 0 && !fonster && <details className="rounded-lg border border-border bg-card p-3"><summary className="cursor-pointer font-medium">Antal lektioner per undervisning</summary><Fordelning forslag={forslag} villkor={villkor} kontroll={kontroll} disabled={busy || checking} onChange={andraArbetsvillkor}/></details>}
      {fonster && ['larare', 'sal', 'elev'].includes(fonster.view) && <ResursFonster intentional={intentionalPass} forslag={forslag} villkor={provade} placements={placeringar} layers={utkast.layers} term={viewTerm} picked={picked} slag={fonster.view === 'larare' ? 'larare' : fonster.view === 'sal' ? 'sal' : 'elev'} initialResource={fonster.resource} onPick={id => { const l = forslag.lessons.find(x => x.id === id); if (l) pick(l); }} onLayer={(layer, on) => dispatch({ type: 'layer', layer, on })} onSessionLost={onSessionLost} onTerm={setShownTerm}/>}
      {fonster?.view === 'viloyta' && <Viloyta restRef={rest} lessons={unplaced} forslag={forslag} over={false} dragging={null} disabled={checking} termTag={termTag} onGrab={grab} onPick={pick} onFollow={foljPass} onSuggest={lesson => void sokPlacering({ mode: 'lesson', lesson, target: null, depth: 1 })} onSuggestAll={() => void sokPlacering({ mode: 'rest', lesson: null, target: null, depth: 1 })}/>}
      {fonster?.view === 'vecka' && resourceMissing && <div className="empty-state"><p>Resursen i arbetsvyn finns inte i det här underlaget. Välj aktivt vilken klass eller grupp du vill visa.</p><label>Välj klass eller grupp<select value="" onChange={e => { setBy('class'); setChosen(e.target.value); setWantedResource(undefined); setResourceMissing(false); }}><option value="">Välj resurs</option>{forslag.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>}
      {forslag.lessons.length > 0 && !(fonster?.view === 'vecka' && resourceMissing) && (!fonster || ['vecka', 'folj', 'samling', 'pass', 'villkor'].includes(fonster.view)) && <>
        {['vecka', 'pass'].includes(visadVy(vy, villkorsvy !== undefined, samlingsvy !== undefined, foljvy !== undefined)) &&
          <VeckaVal forslag={forslag} term={viewTerm} value={visning} onChange={value => { setVisning(value); dispatch({ type: 'pick', lesson: null }); }}/>}
        {/* Vyväljaren (05.2-SM-PASSTABELL): veckan och tabellerna visar samma utkast. Ångra, flyttpanelen och Följ passet är gemensamma. */}
        <Vyval utlyft={!!fonster} vy={vy} onVy={setVy} villkor={villkorsvy} samling={samlingsvy} folj={foljvy} veckaVal={<>
            <fieldset><legend className="sr-only">Visa schema för</legend>
              <Button type="button" variant={by === 'class' ? 'secondary' : 'outline'} aria-pressed={by === 'class'} onClick={() => { setBy('class'); setWantedResource(undefined); }}>Klass</Button>
              <Button type="button" variant={by === 'teacher' ? 'secondary' : 'outline'} aria-pressed={by === 'teacher'} disabled={forslag.teachers.length === 0} onClick={() => { setBy('teacher'); setWantedResource(undefined); }}>Lärare</Button>
            </fieldset>
            <label>{by === 'class' ? 'Klass eller grupp' : 'Lärare'}<select value={selected} onChange={e => { setChosen(e.target.value); setWantedResource(undefined); }}>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          </>} vecka={<>
          {byTerm && <div className="schema-filter"><fieldset><legend className="schema-note">{termpass ? 'Vissa pass går bara en termin.' : 'Samma grundmönster gäller båda terminerna.'} Visa veckan under</legend>
            {forslag.time.terms.map(t => <Button key={t.term} type="button" variant={shownTerm === t.term ? 'secondary' : 'outline'} aria-pressed={shownTerm === t.term} onClick={() => setShownTerm(t.term)}>{TERM[t.term]}</Button>)}</fieldset></div>}
                <div className="schema-verktygsrad">{datumVal.mode === 'grundschema' ? meny.verktyg : <p className="schema-note">Välj ett tillfälle för att ändra just den dagens lektion.</p>}
            <Lagerval layers={utkast.layers} onChange={(layer, on) => { dispatch({ type: 'layer', layer, on }); rememberLager({ ...utkast.layers, [layer]: on }); }}/></div>
          <output aria-live="polite" className="schema-note schema-drag-status">{drop || picked ? bytLagen.loading ? 'Läser möjliga starttider…' : bytLagen.error ?? bytLagen.status(drop?.to ?? target) : ''}</output>
          <div className="schema-folj-lyssnare" {...(datumVal.mode === 'grundschema' ? foljHandelser : {})}>
          <div className="schema-vecka-rad">{(datumVal.mode === 'grundschema' ? meny.wrap : (node: ReactNode) => node)(<Vecka gridRef={week} days={forslag.days} lessons={shown} picked={picked} drop={drop && dragged ? { ...drop, length: dragged.durationMin } : null} flagged={markerade} disabled={checking}
            locked={l => fastAktivitet(l, provade) || !!utkast.locked[l.id]}
            length={shownMin} detail={l => `${detail(l)}${termTag(l)}`} extra={l => [...passRader(l), avvikelse(l) ?? ''].filter(Boolean)} onGrab={grab} onPick={meny.onPick}
            overlays={[...(lager?.overlays ?? []), ...bytLagen.overlays]} bands={lager?.bands} dimmed={lager?.dimmed} falt={falt} namn={NAMN} {...meny.veckaProps}
            datum={{ forslag, overrides: datedOverrides }} onOccurrence={valjDatum} kalender={forslag.time.calendar} visning={datumVal} trims={forslag.trims} classId={by === 'class' ? selected : null}/>)}{meny.panel}</div>
          </div>
          <Teckenforklaring lessons={shown} picked={picked} flagged={markerade} overlays={[...(lager?.overlays ?? []), ...bytLagen.overlays]} bands={lager?.bands} dimmed={lager?.dimmed} namn={NAMN}/>
        </>} pass={<>
                <div className="schema-folj-lyssnare" {...foljHandelser}>
            <Passtabell datedOverrides={datedOverrides} onDatum={valjDatum} forslag={forslag} violations={kontroll?.violations ?? null} egna={provade.egna} term={viewTerm} visning={datumVal} picked={picked} checking={checking || busy}
              intentional={intentionalPass} val={tabellVal} onVal={setTabellVal} atgarder={tabellAtgarder} rubrik={tabellRubrik} tabellRef={tabell}
              onParkera={ids => void andra({ type: 'park', lesson: ids[0], fler: ids.slice(1) })}
              onLas={(ids, locked) => { if (ids[0]) void andra({ type: 'lock', lesson: ids[0], fler: ids.slice(1), locked }); }}
              onAvbryt={() => { if (pickedLesson) { focus.current = pickedLesson.id; dispatch({ type: 'pick', lesson: null }); } }}/>
          </div>
        </>}/>
        {visadVy(vy, villkorsvy !== undefined, true, foljvy !== undefined) === 'vecka' && <>
          <div className="schema-folj-lyssnare" {...foljHandelser}>
          <Viloyta restRef={rest} lessons={unplaced} forslag={forslag} over={drop?.to?.day === null} dragging={drop?.lesson ?? null} disabled={checking} termTag={termTag} onGrab={grab} onPick={pick} onFollow={foljPass} onSuggest={lesson => void sokPlacering({ mode: 'lesson', lesson, target: null, depth: 1 })} onSuggestAll={() => void sokPlacering({ mode: 'rest', lesson: null, target: null, depth: 1 })} onOpen={() => synk.open({ view: 'viloyta' })}/>
          </div>
        </>}
      </>}

      {pickedLesson && <Flyttpanel salRequest={placeringsBas() ?? undefined} onSessionLost={onSessionLost} lesson={pickedLesson} forslag={forslag} target={target} checking={checking || busy} locked={fastAktivitet(pickedLesson, provade) ? 'Aktiviteten har fast tid. Ändra den i aktivitetslistan.' : utkast.locked[pickedLesson.id] ? 'Passet är låst. Lås upp det innan du flyttar det.' : undefined} shownMin={shownMin(pickedLesson)}
        extra={{ someWeeks: someWeeks(pickedLesson), termTag: termTag(pickedLesson) }} roomName={roomName} dayRef={dayField} onTarget={setTarget}
        status={bytLagen.loading ? 'läser möjliga starttider…' : bytLagen.error ?? bytLagen.status(target)} sal={passMedSal.find(l => l.id === pickedLesson.id)?.sal}
        onSuggest={() => void sokPlacering({ mode: 'lesson', lesson: pickedLesson.id, target: null, depth: 1 })}
        onTargetSuggest={() => void sokPlacering({ mode: 'target', lesson: pickedLesson.id, target, depth: 1 })}
        onMove={() => void andra({ type: 'move', lesson: pickedLesson.id, day: target.day, startMin: target.startMin, room: target.room, fler: utkast.selected.includes(pickedLesson.id) ? utkast.selected.filter(id => id !== pickedLesson.id) : [] })}
        onPark={() => void andra({ type: 'park', lesson: pickedLesson.id, fler: utkast.selected.includes(pickedLesson.id) ? utkast.selected.filter(id => id !== pickedLesson.id) : [] })}
        onCancel={() => { focus.current = pickedLesson.id; dispatch({ type: 'pick', lesson: null }); }}/>}
      <output aria-live="polite" className="schema-note">{checking ? 'Schemat kontrolleras mot reglerna.' : moved}</output>
      {(!fonster || fonster.view === 'avvikelser') && <Regelavvikelser kontroll={kontroll} onOpen={() => synk.open({ view: 'avvikelser' })} intentional={intentionalKeys} onIntent={markeraMedveten} disabled={busy || checking || villkorKey !== provadeKey}/>}
      {fonster?.view === 'avvikelser' && !kontroll && <p className="empty-state">Kontrollen körs när förslaget ändras. Inga kontrollresultat finns ännu.</p>}
      {!fonster && <><Forklaring diagnoses={forslag.diagnoses}/>
      <SvarastAttLagga statistics={forslag.statistics} onFollow={foljPass} onCondition={diagnosVillkor}/></>}
      {(!fonster || fonster.view === 'tid' || fonster.view === 'veckor') && <Tid forslag={forslag} deviating={deviating} off={off} mode={fonster?.view === 'veckor' ? 'veckor' : fonster?.view === 'tid' ? 'tid' : 'all'} onOpen={() => synk.open({ view: 'tid' })} onOpenWeeks={() => synk.open({ view: 'veckor' })}/>}
      {!fonster && <><Underlag forslag={forslag}/>{aktivitetsvy(forslag)}</>}
    </>}
    </fieldset>
  </section>;
}
