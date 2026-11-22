'use client';
// Arbetsytan i Schema. Sätter ihop modulerna under ./schema/ och äger hämtning av förslag och kontroll av ändringar (05.2-SM-YTA).
// Var passen ligger för hand hålls i utkastet (lib/schema-utkast.ts) med ångra och gör om i flera steg; en ändring görs först när kontrollen har svarat.
import { useCallback, useEffect, useEffectEvent, useId, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon, CalendarDaysIcon, ChevronDownIcon, ListChecksIcon, SlidersHorizontalIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { api, ApiError } from '@/lib/server-client.ts';
import { useRequestConfirm } from '@/lib/unsaved-changes.tsx';
import { SCHEMA_DRAFT_VERSION, verifySchemaDraftResetReply, type SchemaDraftDatedOverride, type SchemaDraftResetRequest } from '@/lib/schema-draft-contract.ts';
import { type SchemaSparinnehall, type SchemaSparstatus } from '@/lib/schema-spara.ts';
import { useSchemaSpara } from './schema/use-spara.ts';
import { useSchemaUnderlag } from './schema/use-underlag.ts';
import { Sparstatus } from './schema/sparstatus.tsx';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { SCHEMA_CONTRACT_VERSION, checkSchemaVillkor, defaultSchemaVillkor, parseSchemaForslag, parseSchemaKontroll, sammaGrund, villkorNyckel, type SchemaForslag, type SchemaForslagLesson, type SchemaForslagRequest,
  SchemaContractError, type SchemaKontroll, type SchemaKontrollRequest, type SchemaPeriod, type SchemaRegel, type SchemaStatus, type SchemaTerm, type SchemaVillkor, type SchemaViolation } from '@/lib/schema-contract.ts';
import { SCHEMA_SOLVE_TIMES, SCHEMA_SOLVE_DEFAULT_MS, parseSchemaFortsatt, type SchemaFortsattRequest, type SchemaSolveTimeMs } from '@/lib/schema-fortsatt.ts';
import { FortsattGranskning, fortsattStopp, type FortsattSokning } from './schema/fortsatt.tsx';
import { arbetsvillkorSteg, aktivitetsSteg, datumSteg, avvikelseRad, avvikelseNyckel, medUtkast, medvetenKrock, medvetenGaller, medvetenMarkering, medvetenSteg, medvetnaAvvikelser, schemaUtkast, tomtUtkast, utkastEfter, utkastSteg, utkastLas, bytSalar, villkorSteg, type SchemaOverlay, type SchemaUtkastAtgard } from '@/lib/schema-utkast.ts';
import { parseSchemaPlacering, type SchemaPlaceringVal } from '@/lib/schema-placering.ts';
import { Placeringsforslag, type PlaceringSokning } from './schema/placering.tsx';
import { parseSchemaVillkorsforslag, tillampaSchemaVillkorsandring } from '@/lib/schema-villkorsforslag.ts';
import { Villkorsforslag, type VillkorsSokning } from './schema/villkorsforslag.tsx';
import { Lagesstatus } from './schema/lagesstatus.tsx';
import { Salar } from './schema/salar.tsx';
import { Samtidighetsblock } from './schema/block.tsx';
import { ForberedOmradesval, ForberedOversikt, Omrade, Omradesgenomgang, Ytval, forberedAnkare, gruppForOmrade, oppnaOmrade, rememberYta, storedYta, useGenomgang,
  type ForberedAtgard, type ForberedGrupp, type ForberedMal, type SchemaYta } from './schema/forbered.tsx';
import { GranskaUtkast, type GranskaMal } from './schema/granska.tsx';
import { JamforResurser } from './schema/jamfor-resurser.tsx';
import { schemaForbered, type ForberedOmrade } from '@/lib/schema-forbered.ts';
import { saltabellRader } from '@/lib/schema-saltabell.ts';
import { nationellaProvBokningsfel, type NationellProvbokning } from '@/lib/nationella-prov.ts';
import { Salsattningspanel, type SalsattningVisning } from './schema/salsattning.tsx';
import { SALFEL, salsattningPlaceringar, tilldelaSalar } from '@/lib/schema-salsattning.ts';
import { flyttSal } from '@/lib/schema-utan-sal.ts';
import { medSkolsalar } from '@/lib/skolsalar.ts';
import { useSkolsalar } from './schema/use-skolsalar.ts';
import { useNationellaProv } from './schema/use-nationella-prov.ts';
import { fastAktivitet, lastAktivitetAndras, aktivitetsTyper, type SchemaAktivitetsTyp, type SchemaAktivitet } from '@/lib/schema-aktiviteter.ts';
import { schemaLager, type SchemaKalla } from '@/lib/schema-lager.ts';
import { DAYS, PERIOD, TERM, clock, names, ruleText, startTimes } from './schema/delat.ts';
import { FaltKalla, Lagerval, rememberLager, storedLager, visaVillkor } from './schema/lager.tsx';
import { Vecka, Teckenforklaring, veckansSpann, type SchemaVeckoprov } from './schema/vecka.tsx';
import { Terminsjamforelse } from './schema/terminsjamforelse.tsx';
import { VeckaVal } from './schema/vecka-val.tsx';
import { UnderlagHinder } from './schema/underlag-hinder.tsx';
import { Fordelning } from './schema/fordelning.tsx';
import { schemaDatumNyckel, schemaDatumOriginal, schemaDatumTillfallen, schemaDatumErsatt, parseSchemaDatumSvar, type SchemaDatumNyckel, type SchemaDatumTillfalle, type SchemaDatumAndring, type SchemaDatumSvar } from '@/lib/schema-datum.ts';
import { DatumFlytt } from './schema/datum-flytt.tsx';
import { grundschemaVal, schemaDateText, schemaDayHeading, schemaMonday, schemaVeckaVal, schemaVisningsDagar, type SchemaVeckaVal } from '@/lib/schema-vecka.ts';
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
import { NationellaProv } from './schema/nationella-prov.tsx';
import { Provforslag } from './schema/provforslag.tsx';
import { Provhinder } from './schema/provhinder.tsx';
import { Berakningslage, type Motorlage } from './schema/berakning.tsx';
import { parseSchemaProvApplyReply, schemaProvResultHash, type SchemaProvApplyRequest, type SchemaProvforslagSvar } from '@/lib/schema-provforslag.ts';
import { parseSchemaNyttProvForslag, parseSchemaNyttProvSaveReply, type SchemaNyttProvHinder, type SchemaNyttProvSave } from '@/lib/schema-nytt-prov.ts';
import { andradeGrundvillkor } from '@/lib/schema-andrade-villkor.ts';
import type { NyAktivitetsTid } from './schema/aktivitet-form.tsx';
import { Villkorstabell, villkorstabellMal, type VillkorstabellMal } from './schema/villkorstabell.tsx';
import { Vyval, rememberVy, storedVy, visadVy, type SchemaVy } from './schema/vyval.tsx';
import { VeckoResursval } from './schema/vecko-resursval.tsx';
import { veckoresurser, veckoresursPass, type Veckoresurs } from '@/lib/schema-veckoresurser.ts';
import { parseSamlingData, type SamlingResurs } from '@/lib/schema-samling.ts';
import { Passtabell, tomtTabellVal, type PassTabellVal } from './schema/passtabell.tsx';
import './valplaner.css';
import './schema.css';

const STATUS: Record<SchemaStatus, { text: string; tone: 'success' | 'warning' }> = {
  // Visas inte: ett färdigräknat förslag redovisas som tid, sal och kapacitet var för sig (05.2-SM-UXF-12).
  complete: { text: 'Beräkningen är klar', tone: 'success' },
  time_limit: { text: 'Mer räknetid kan behövas', tone: 'warning' },
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
function message(error: unknown, planerarProv = false): string {
  if (error instanceof SchemaContractError) return 'Schemamotorns svar kunde inte kontrolleras. Läs om sidan och försök igen.';
  if (error instanceof ApiError) {
    if (error.reason === 'schema_nytt_prov_unresolved') {
      const hinder = error.schemaNyttProv;
      const detaljer = hinder && [hinder.bookings ? `${hinder.bookings} ${hinder.bookings === 1 ? 'provbokning' : 'provbokningar'} kontrollerades.` : '',
        hinder.unplaced ? `${hinder.unplaced} pass saknar tid.` : '',
        hinder.resourceIssues ? `${hinder.resourceIssues} resursproblem behöver ses över.` : '',
        hinder.remainingMinutes ? `${hinder.remainingMinutes} minuter undervisning återstår att ersätta.` : '',
        hinder.dateIssues ? `${hinder.dateIssues} ${hinder.dateIssues === 1 ? 'datumavvikelse' : 'datumavvikelser'} behöver ses över.` : ''].filter(Boolean).join(' ');
      return ['Nationella prov behöver ses över innan ett nytt schema kan sparas.', detaljer, 'Det sparade utkastet ligger kvar.'].filter(Boolean).join(' ');
    }
    if (error.reason === 'schema_nytt_prov_calendar') return 'Fastställ läsårskalendern innan du tar fram ett schema med bokade nationella prov.';
    if (error.reason === 'schema_nytt_prov_rektor') return 'En rektor behöver ta fram schemat när nationella prov är bokade.';
    if (error.reason === 'schema_nytt_prov_weekly') return 'Grundschemat fick en regelavvikelse vid slutkontrollen. Ta fram ett nytt förslag. Det sparade utkastet ligger kvar.';
    if (planerarProv && error.status === 409 && error.reason) return 'Schemat, provplanen eller underlaget har ändrats. Läs in det aktuella utkastet och ta fram ett nytt förslag.';
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
    if (error.reason === 'schema_placement_rest_empty') return 'Det finns inga pass utan tid att lägga.';
    if (error.reason === 'schema_placement_rooms_changed') return 'Salarna behöver kontrolleras. Kontrollera utkastet innan du söker igen.';
    if (error.reason === 'schema_underlag_changed' || error.code === 'schema_underlag_changed') return 'Underlaget har ändrats. Ta fram ett nytt schemaförslag innan du söker placeringar.';
    if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
  }
  return 'Placeringsförslagen kunde inte kontrolleras. Passen står kvar. Försök igen.';
}
const placeringsBasNyckel = (r: SchemaKontrollRequest): string => JSON.stringify({ contractVersion: r.contractVersion, unitId: r.unitId, schoolYear: r.schoolYear, period: r.period,
  villkor: r.villkor, grundFingerprint: r.grundFingerprint, placements: r.placements, locks: r.locks ?? null });

type Props = { unitId: string | null; schoolYear: number; scopeKey: string; schoolName?: string | null; onSessionLost: () => void; fonster?: SchemaFonsterTarget; personalLookup?: boolean };
type FlyttAtgard = Extract<SchemaUtkastAtgard, { type: 'move' | 'park' | 'swap' | 'lock' | 'undo' | 'redo' }>;
type Flyttfel = string | { tillfallen: string[] };
const datumvisning = (date: string, mode: 'vecka' | 'intervall'): SchemaVeckaVal => ({ mode, monday: schemaMonday(date), from: date, to: date });
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

function Workspace({ unitId, schoolYear, scopeKey, schoolName, onSessionLost, fonster, personalLookup = false }: Props & { unitId: string }) {
  const resultHeading = useId(), kontrollrubrik = useRef<HTMLHeadingElement | null>(null);
  const schemarubrik = useRef<HTMLHeadingElement>(null);
  const [berakningOpen, setBerakningOpen] = useState(false), berakningKnapp = useRef<HTMLButtonElement | null>(null);
  const confirm = useRequestConfirm();
  const [draftName, setDraftName] = useState('Schemautkast'), [datedOverrides, setDatedOverrides] = useState<SchemaDraftDatedOverride[]>([]);
  const [tomningsMarkor, setTomningsMarkor] = useState<{ draftId: string; revision: number } | null>(null), [tomningsfel, setTomningsfel] = useState<string | null>(null);
  const tomningsknapp = useRef<HTMLButtonElement>(null), fokuseraTomning = useRef(false);
  const [provSparat, setProvSparat] = useState<{ period: SchemaPeriod; revision: number; provrevision: number; provdag: string } | null>(null);
  const [schemalagdaProv, setSchemalagdaProv] = useState<{ period: SchemaPeriod; draftId: string; revision: number; antal: number; flyttar: number; minuter: number } | null>(null);
  const [nyttProvSparfel, setNyttProvSparfel] = useState<string | null>(null);
  const [provFranDatumvy, setProvFranDatumvy] = useState<string | null>(null);
  const provSparas = useRef(false);
  const [datumPicked, setDatumPicked] = useState<(SchemaDatumTillfalle & { expectedInputKey: string; grundFingerprint: string; period: SchemaPeriod }) | null>(null);
  const [datumKontroll, setDatumKontroll] = useState<{ key: string; reply: SchemaDatumSvar } | null>(null), [datumKlar, setDatumKlar] = useState('');
  const [datumOmprov, setDatumOmprov] = useState(0);
  const dateSequence = useRef(0);
  const [activityTypes, setActivityTypes] = useState<SchemaAktivitetsTyp[]>(aktivitetsTyper);
  const [remoteSave, setRemoteSave] = useState<SchemaSparstatus>({ phase: 'loading', dirty: false, revision: 0, savedAt: null, message: null });
  const [period, setPeriod] = useState<SchemaPeriod>(() => storedPeriod(unitId, schoolYear)), [villkor, setVillkorLocal] = useState(() => storedVillkor(unitId) ?? defaultSchemaVillkor()), [shownTerm, setShownTerm] = useState<SchemaTerm>('ht');
  const [visning, setVisning] = useState<SchemaVeckaVal>(grundschemaVal);
  const [jamforTerminer, setJamforTerminer] = useState(false);
  const issues = checkSchemaVillkor(villkor);
  // Förslaget som motorn räknade fram; tid och mått uppdateras efter varje kontroll. Var passen ligger står i utkastet.
  const [fore, setFore] = useState<{ key: string; findings: SchemaDiagnosFynd[]; releaseLocks?: boolean } | null>(null), [foreTid, setForeTid] = useState<string | null>(null);
  // Vald yta (05.2-SM-UXF-31). Utan eget val visas Förbered tills ett förslag finns.
  const [ytaVal, setYtaVal] = useState<SchemaYta | null>(() => storedYta(unitId, schoolYear)), [genomgang, setGenomgang] = useGenomgang(unitId, schoolYear);
  const [forberedGrupp, setForberedGrupp] = useState<ForberedGrupp>('underlag');
  const [forberedMal, setForberedMal] = useState<(ForberedMal & { nr: number }) | null>(null);
  const [larartabellOppet, setLarartabellOppet] = useState(false);
  const [forberedBerakningsvalOppet, setForberedBerakningsvalOppet] = useState(false);
  const forberedForslagKnapp = useRef<HTMLButtonElement>(null);
  const malnummer = useRef(0);
  const [visatPass, setVisatPass] = useState<{ mal: GranskaMal; scope: string; term: SchemaTerm; franGranskning: boolean } | null>(null);
  const [jamforOpen, setJamforOpen] = useState(false), jamforId = useId();
  const provforslagPanel = useRef<HTMLElement>(null), provGranskaRetur = useRef<HTMLElement | null>(null);
  const fokuseraProvforslag = useRef(false);
  const fokuseraProv = useRef<string | null>(null);
  const passvisningFokus = useRef<GranskaMal | null>(null), visatPassRubrik = useRef<HTMLHeadingElement | null>(null);
  const valjYta = useCallback((next: SchemaYta) => {
    if (next !== 'schema') { setVisatPass(null); setJamforOpen(false); passvisningFokus.current = null; }
    if (next !== 'forbered') { setForberedMal(null); setForberedBerakningsvalOppet(false); }
    setYtaVal(next); rememberYta(unitId, schoolYear, next);
  }, [unitId, schoolYear]);
  // Tilldela salar och behåll tiderna (05.2-SM-UXF-41): förhandsgranskningen och kontrollens svar för just den.
  const [salsattning, setSalsattning] = useState<(SalsattningVisning & { svar: SchemaKontroll | null }) | null>(null);
  const [berakningssteg, setBerakningssteg] = useState<'forbereder' | 'diagnos' | 'solve' | 'sparar-prov'>('diagnos');
  const [motor, setMotor] = useState<Motorlage | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [base, setBase] = useState<SchemaForslag | null>(null);
  const [solveTimeMs, setSolveTimeMs] = useState<SchemaSolveTimeMs>(SCHEMA_SOLVE_DEFAULT_MS);
  const [fortsatt, setFortsatt] = useState<FortsattSokning | null>(null), currentContinueKey = useRef('');
  const continueButton = useRef<HTMLButtonElement | null>(null);
  // Lagren i veckan (05.2-SM-VILLKOR-SYNS) ligger i utkastet och minns i webbläsaren.
  const [utkast, dispatchLocal] = useReducer(schemaUtkast, undefined, () => ({ ...tomtUtkast(), layers: storedLager() }));
  // Ett eget villkor som togs bort från ett fält i veckan, så att det kan ångras.
  const [borttaget, setBorttaget] = useState<{ rule: SchemaRegel; index: number } | null>(null), angraVillkor = useRef<HTMLButtonElement | null>(null), aterFalt = useRef<string | null>(null);
  const forslag = useMemo(() => base && { ...base, lessons: medUtkast(base.lessons, utkast.placements, utkast.locked) }, [base, utkast.placements, utkast.locked]);
  const [chosen, setChosen] = useState('');
  const [wantedResource, setWantedResource] = useState(fonster?.resource);
  const [veckansGruppunderlag, setVeckansGruppunderlag] = useState<{ key: string; groups: SamlingResurs[] | null } | null>(null);
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
  const [flyttfel, setMoveErrorState] = useState<Flyttfel | null>(null), [moved, setMoved] = useState('');
  const moveError = typeof flyttfel === 'string' ? flyttfel : null;
  const focusMoveError = useRef(false);
  const setMoveError = useCallback((value: Flyttfel | null, autofocus = true) => { focusMoveError.current = autofocus && value !== null; setMoveErrorState(value); }, []);
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
  const avbrytbarBerakning = useRef<AbortController | null>(null);
  const [provhinder, setProvhinder] = useState<{ nyckel: string; provrevision: number | null; request: SchemaForslagRequest; solveTimeMs: SchemaSolveTimeMs; hinder: SchemaNyttProvHinder } | null>(null);
  const provhinderRubrik = useRef<HTMLHeadingElement>(null);
  const passRubrik = useRef<HTMLHeadingElement | null>(null);
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
      setTomningsMarkor(draft?.resetUndoRevision ? { draftId: draft.id, revision: draft.revision } : null);
      setBase(draft?.base ?? null);
      setVillkorLocal(draft?.workingVillkor ?? villkor);
      setDatedOverrides(draft?.datedOverrides ?? []);
      setActivityTypes(draft?.activityTypes ?? activityTypes);
      const restored = schemaUtkast({ ...tomtUtkast(), layers: utkast.layers }, { type: 'reset', forslag: draft?.base ? { lessons: draft.base.lessons, locks: draft.locks } : { lessons: [] } });
      dispatchLocal({ type: 'hydrate', state: { ...restored, intentional: draft?.intentional ?? [] } });
      setKontroll(draft?.base && draft.control ? { svar: draft.control, villkor: villkorNyckel(draft.basisVillkor!) } : null);
      setChosen(''); setFolj(null); setFore(null); setSokning(null); setFortsatt(null); setVisatPass(null); setError(null); setMoveError(null); setMoved('');
      setKraverNytt(null); setMisslyckat(null); setProvhinder(null);
    },
  });
  const sparstatus = fonster ? remoteSave : spara.state;
  const kanAngraTomning = !!tomningsMarkor && tomningsMarkor.draftId === spara.draftId && tomningsMarkor.revision === sparstatus.revision;
  const tomningTillganglig = spara.ready && !busy && !checking && !sparstatus.dirty && sparstatus.phase === 'saved' && !grundAndrad;
  useEffect(() => {
    if (!spara.ready || !fokuseraTomning.current) return;
    fokuseraTomning.current = false;
    tomningsknapp.current?.focus({ preventScroll: true });
  }, [spara.ready]);
  const byterGrund = base !== null && (grundAndrad || sparstatus.phase === 'stale' || period !== base.period || !sammaGrund(nyttArsvillkor, base.villkor));
  const gamlaPassregler = byterGrund ? villkor.egna.filter(r => r.slag === 'pass') : [];
  const berakningsVillkor: SchemaVillkor = gamlaPassregler.length ? { ...nyttArsvillkor, egna: nyttArsvillkor.egna.filter(r => r.slag !== 'pass') } : nyttArsvillkor;
  const redigeringStoppad = !spara.ready || sparstatus.phase === 'loading' || sparstatus.phase === 'stale';
  const periodbyteStoppat = busy || checking || !spara.ready || sparstatus.phase === 'loading' || (sparstatus.phase === 'stale' && sparstatus.dirty);
  const yta: SchemaYta = fonster ? 'schema' : ytaVal ?? (base ? 'schema' : 'forbered');
  const visaForbered = yta === 'forbered', visaSchema = yta === 'schema', visaGranska = yta === 'granska';
  const oppnaForbered = useCallback((mal: ForberedMal) => {
    const nr = ++malnummer.current;
    setForberedGrupp(gruppForOmrade(mal.omrade));
    setForberedMal({ ...mal, nr });
    if (mal.omrade === 'larartider') setLarartabellOppet(true);
  }, []);
  useEffect(() => {
    if (!visaForbered || !forberedMal || forberedMal.ref) return;
    if (forberedMal.omrade === 'regler') {
      const form = document.querySelector<HTMLDetailsElement>('#forbered-regler details.schema-villkor');
      if (form) form.open = true;
    }
    oppnaOmrade(forberedMal.omrade);
  }, [visaForbered, forberedMal]);
  useEffect(() => {
    if (!visaGranska) return;
    if (fokuseraProvforslag.current) {
      fokuseraProvforslag.current = false;
      provforslagPanel.current?.focus({ preventScroll: true });
      provforslagPanel.current?.scrollIntoView({ block: 'start' });
      return;
    }
    const knapp = provGranskaRetur.current;
    provGranskaRetur.current = null;
    if (knapp?.isConnected) { knapp.focus({ preventScroll: true }); knapp.scrollIntoView({ block: 'nearest' }); }
  }, [visaGranska]);
  function visaProvforslag(provdag: string | null) {
    setProvFranDatumvy(provdag);
    provGranskaRetur.current = null;
    if (visaGranska) {
      provforslagPanel.current?.focus({ preventScroll: true });
      provforslagPanel.current?.scrollIntoView({ block: 'start' });
      return;
    }
    fokuseraProvforslag.current = true;
    valjYta('granska');
  }
  const inaktuelltUnderlag = sparstatus.phase === 'stale';
  // Underlaget före första förslaget (05.2-SM-UXF-11): resurser, undervisningar och pass utan placering. Blir aldrig utkastets bas.
  // Skolans salregister (05.2-SM-UXF-23) läses en gång per skolenhet. Utkastets spegel följer registret utan att bli ett steg i Ångra.
  const skolsalar = useSkolsalar({ unitId, enabled: !fonster, onSessionLost });
  const nationellaProv = useNationellaProv({ unitId, schoolYear, enabled: !fonster, onSessionLost });
  const provunderlag = useMemo(() => {
    const underlag = nationellaProv.underlag;
    if (!underlag || skolsalar.status !== 'ok') return underlag;
    return { ...underlag, salar: skolsalar.register?.document.salar ?? [] };
  }, [nationellaProv.underlag, skolsalar.status, skolsalar.register]);
  const provbokningsfel = useMemo(() => {
    const errors = new Map<string, string>();
    if (provunderlag) {
      for (const b of nationellaProv.document?.bokningar ?? []) {
        const fel = nationellaProvBokningsfel(personalLookup ? b : { ...b, vakter: [] }, provunderlag);
        if (fel) errors.set(b.id, fel);
      }
    }
    return errors;
  }, [nationellaProv.document, provunderlag, personalLookup]);
  // Justeras under renderingen (Reacts mönster för tillstånd som följer annat tillstånd); omvandlingen är idempotent och stannar efter ett varv.
  const medSkolansSalar = !fonster && skolsalar.status === 'ok' ? medSkolsalar(villkor, skolsalar.register?.document ?? null) : villkor;
  if (medSkolansSalar !== villkor) setVillkorLocal(medSkolansSalar);
  // Med salregister läses det också när ett förslag finns, så att passens tillåtna salar, elevantal och kapacitet följer registret och salbehoven (05.2-SM-UXF-21).
  const salNyckel = villkor.salregister ? villkorNyckel([villkor.salregister, villkor.salbehov ?? [], villkor.egna.filter(r => r.typ === 'sal')]) : '';
  const underlagLas = useSchemaUnderlag({ enabled: !fonster && (inaktuelltUnderlag || !base || (!!villkor.salregister && !grundAndrad)) && spara.ready && sparstatus.phase !== 'loading' && !busy && issues.length === 0,
    request: { unitId, schoolYear, period: inaktuelltUnderlag ? period : base?.period ?? period, villkor: base && !inaktuelltUnderlag ? villkor : berakningsVillkor },
    extra: inaktuelltUnderlag ? `aktuellt:${salNyckel}` : salNyckel, onSessionLost });
  const salbild = !inaktuelltUnderlag && forslag && underlagLas.forslag && underlagLas.forslag.grundFingerprint === forslag.grundFingerprint ? underlagLas.forslag : null;
  // Nästa beräkning använder dagens underlag. Veckovyn och kontrollerna behåller det sparade förslagets källa.
  const aktuelltUnderlag = !busy && !underlagLas.loading && !underlagLas.error && !issues.length ? underlagLas.forslag : null;
  const forutsattningar = inaktuelltUnderlag ? aktuelltUnderlag : salbild ?? forslag ?? underlagLas.forslag;
  const granskaScope = JSON.stringify([period, forslag?.grundFingerprint]);
  const passvisning = visatPass?.scope === granskaScope ? visatPass : null;
  const visatPassMal = passvisning?.mal;
  const antalLas = inaktuelltUnderlag ? 0 : Object.keys(utkast.locked).length;
  // Checklistan räknas bara när Förbered visas: den behövs inte i Lägg schema eller i utlyfta fönster och ska inte fördröja synk efter en flytt.
  const forberedPunkter = useMemo(() => visaForbered ? schemaForbered({ kalla: forutsattningar, villkor, las: antalLas, provplan: nationellaProv.document,
    provbokningsfel: provbokningsfel.size, provlasning: nationellaProv.reading ? 'laddar' : nationellaProv.readFailed ? 'fel' : provunderlag?.gallerGymnasiet === false ? 'ej-tillamplig' : 'klar' }) : [],
    [visaForbered, forutsattningar, villkor, antalLas, nationellaProv.document, provbokningsfel, nationellaProv.reading, nationellaProv.readFailed, provunderlag?.gallerGymnasiet]);
  const forberedSalar = useMemo(() => visaForbered && forutsattningar ? saltabellRader(forutsattningar, villkor) : [], [visaForbered, forutsattningar, villkor]);
  const valtForberedObjekt = useMemo(() => forberedMal?.ref ? { ref: forberedMal.ref, nr: forberedMal.nr, resurs: forberedMal.resurs } : null, [forberedMal]);
  const larartidsmal = useMemo((): VillkorstabellMal | null => forberedMal?.omrade === 'larartider'
    ? { flik: 'larare', ref: forberedMal.ref, typ: forberedMal.ref ? 'sparrad' : undefined, nr: forberedMal.nr } : null, [forberedMal]);
  // Passen med aktuell salbild: var de ligger kommer från utkastet, vilka salar de får ha från den senaste läsningen.
  const passMedSal = useMemo(() => { if (!forslag) return []; if (!salbild) return forslag.lessons; const by = new Map(salbild.lessons.map(l => [l.id, l]));
    return forslag.lessons.map(l => { const u = by.get(l.id); return u ? { ...l, roomIds: u.roomIds, sal: u.sal } : l; }); }, [forslag, salbild]);
  async function bytPeriod(next: SchemaPeriod) {
    if (next === period || periodbyteStoppat) return;
    if (sparstatus.phase !== 'stale' && !await spara.flush()) return;
    rememberPeriod(unitId, schoolYear, next);
    setForberedMal(null);
    setJamforTerminer(false);
    setTomningsMarkor(null); setTomningsfel(null);
    setSchemalagdaProv(null); setNyttProvSparfel(null); setMotor(null);
    setProvSparat(null); setProvFranDatumvy(null);
    setBase(null); dispatchLocal({ type: 'reset', forslag: { lessons: [] } }); setDatedOverrides([]); setKontroll(null); setFolj(null); setFortsatt(null); setVisatPass(null); setPeriod(next);
  }
  async function lasServerversion() {
    if (sparstatus.dirty && !await confirm({ title: 'Läs serverns version?', description: 'Dina lokala ändringar ersätts med det senast sparade utkastet på servern.', confirmLabel: 'Läs serverns version', cancelLabel: 'Behåll lokala ändringar' })) return;
    setVisatPass(null); setForberedMal(null);
    spara.read();
  }

  async function andraTomning(action: SchemaDraftResetRequest['action']) {
    const draftId = spara.draftId;
    if (fonster || !draftId || !tomningTillganglig || running.current || (action === 'clear' ? !snapshot.placements.length : !kanAngraTomning)) return;
    const controller = new AbortController();
    running.current = controller;
    setTomningsfel(null);
    try {
      if (action === 'clear') {
        const scope = [schoolName, `läsår ${planningYearLabel(schoolYear)}`, PERIOD[period]].filter(Boolean).join(' · ');
        const ok = await confirm({ title: 'Töm schema?', description: `${scope}. Tider, salar, lås, datumändringar, medvetna krockmarkeringar och villkor för enskilda pass tas bort från utkastet. Övriga schemavillkor och bokade nationella prov finns kvar. Inställningarna för återkommande aktiviteter används vid nästa beräkning. Du kan ångra tömningen tills nästa version sparas.`,
          confirmLabel: 'Töm schema', cancelLabel: 'Behåll schemat' });
        if (!ok || controller.signal.aborted) return;
      }
      setChecking(true);
      const request: SchemaDraftResetRequest = { contractVersion: SCHEMA_DRAFT_VERSION, unitId, schoolYear, period,
        commandId: crypto.randomUUID(), draftId, expectedRevision: sparstatus.revision, action };
      const raw = await api.post<unknown>('/api/schema/utkast/aterstall', request, controller.signal);
      await verifySchemaDraftResetReply(raw, request);
      if (controller.signal.aborted) return;
      setProvSparat(null); setProvFranDatumvy(null);
      if (action === 'clear') { setJamforTerminer(false); setVisning(grundschemaVal()); setVy('vecka'); }
      fokuseraTomning.current = true;
      valjYta(action === 'clear' ? 'forbered' : 'schema');
      spara.read();
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      if (caught instanceof ApiError && caught.status === 403) { setTomningsfel('Ditt aktuella uppdrag tillåter inte den här schemaändringen.'); return; }
      setTomningsfel(caught instanceof ApiError && caught.status === 409
        ? 'Utkastet eller underlaget har ändrats. Serverns aktuella utkast läses in.'
        : 'Ändringen kunde inte bekräftas. Serverns aktuella utkast läses in.');
      spara.read();
    } finally {
      if (running.current === controller) { running.current = null; setChecking(false); }
    }
  }

  async function tillampaProvforslag(svar: SchemaProvforslagSvar, commandId: string) {
    if (!personalLookup || !svar.provrevision || sparstatus.phase !== 'saved' || sparstatus.dirty || busy || checking || provSparas.current) return;
    provSparas.current = true;
    try {
      const ok = await confirm({ title: 'Lägg in provförslaget?',
        description: 'Salar och provvakter sparas i provplanen. Undervisning som krockar med proven flyttas till ersättningstillfällen i det här utkastet.',
        confirmLabel: 'Spara provförslaget', cancelLabel: 'Behåll förslaget' });
      if (!ok) return;
      setChecking(true);
      const request: SchemaProvApplyRequest = { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period,
        commandId, expectedRevision: sparstatus.revision, provrevision: svar.provrevision, grundFingerprint: svar.grundFingerprint,
        resultHash: await schemaProvResultHash(svar) };
      const receipt = parseSchemaProvApplyReply(await api.post<unknown>('/api/schema/provforslag/tillampa', request), request);
      const provdag = svar.bokningar.find(b => b.id === provFranDatumvy) ?? svar.bokningar[0];
      setProvSparat({ period, revision: receipt.revision, provrevision: receipt.provrevision, provdag: provdag.id });
      spara.read();
      nationellaProv.onReload();
    } finally { provSparas.current = false; setChecking(false); }
  }

  // Huvudfönstret äger reducer, nätanrop och ångring. Elevlistor och lokala resursval ingår inte i det delade tillståndet.
  type Delat = { base: typeof base; utkast: typeof utkast; villkor: typeof villkor; kontrollSvar: typeof kontrollSvar; period: SchemaPeriod;
    busy: boolean; checking: boolean; sparstatus: SchemaSparstatus; draftName: string; datedOverrides: typeof datedOverrides; activityTypes: typeof activityTypes; error: typeof error; flyttfel: typeof flyttfel; moved: string; kraverNytt: typeof kraverNytt; misslyckat: typeof misslyckat; fore: typeof fore; datumKontroll: typeof datumKontroll; datumKlar: string; sokning: typeof sokning; villkorsSokning: typeof villkorsSokning };
  type SynkAtgard = { typ: 'utkast'; action: SchemaUtkastAtgard } | { typ: 'andra'; action: FlyttAtgard } | { typ: 'villkor'; value: SchemaVillkor }
    | { typ: 'arbetsvillkor'; value: SchemaVillkor } | { typ: 'run'; continueAnyway: boolean; releaseLocks?: boolean } | { typ: 'pick'; id: string } | { typ: 'search'; value: SchemaPlaceringVal }
    | { typ: 'date'; key: SchemaDatumNyckel; change: SchemaDatumAndring | null; expectedInputKey: string; grundFingerprint: string; period: SchemaPeriod } | { typ: 'apply-condition'; index: number; key: string } | { typ: 'apply-placement'; index: number; key: string } | { typ: 'close-placement' } | { typ: 'intent'; key: string; on: boolean };
  const synk = useSchemaSynk<Delat, SynkAtgard>({ unitId, schoolYear, scopeKey, fonster,
    state: { base, utkast, villkor, kontrollSvar, period, busy, checking, sparstatus, draftName, datedOverrides, activityTypes, error, flyttfel, moved, kraverNytt, misslyckat, fore, datumKontroll, datumKlar, sokning, villkorsSokning },
    blocked: busy || checking,
    onState: state => {
      if (state.base && (state.base.unitId !== unitId || state.base.schoolYear !== schoolYear)) return;
      setBase(state.base); dispatchLocal({ type: 'hydrate', state: state.utkast }); setVillkorLocal(state.villkor); setKontroll(state.kontrollSvar);
      setPeriod(state.period); setBusy(state.busy); setChecking(state.checking); setError(state.error); setMoved(state.moved);
      if (JSON.stringify(state.flyttfel) !== JSON.stringify(flyttfel)) setMoveError(state.flyttfel);
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
    if (!flyttfel || !focusMoveError.current || document.querySelector('[role=dialog]')) return;
    moveErrorRef.current?.focus(); moveErrorRef.current?.scrollIntoView({ block: 'center' });
  }, [flyttfel]);

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
      (target ?? rest.current?.querySelector<HTMLElement>('button:not([disabled])') ?? document.querySelector<HTMLElement>('.schema-undo button:not([disabled])') ?? berakningKnapp.current ?? document.querySelector<HTMLElement>('.schema-controls button[type="submit"]'))?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [sokning, base?.grundFingerprint, passElement]);
  useEffect(() => () => { running.current?.abort(); searchRunning.current?.abort(); }, []);
  useEffect(() => { if (picked && !visaFokus.current && !passvisningFokus.current) (dayField.current?.matches(':enabled') ? dayField.current : passRubrik.current)?.focus(); }, [picked]);
  // Visa i veckan (05.2-SM-PASSTABELL): när veckan är ritad får passet fokus och rullas fram.
  useEffect(() => {
    const el = visaFokus.current ? week.current?.querySelector<HTMLElement>(`[data-lesson="${visaFokus.current}"]`) : null;
    if (!el) return;
    visaFokus.current = null; el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center' });
  });
  useEffect(() => {
    const mal = passvisningFokus.current;
    if (!visaSchema || !mal) return;
    const id = CSS.escape(mal.lesson);
    const selector = mal.originalDate ? `[data-occurrence="${CSS.escape(schemaDatumNyckel({ lesson: mal.lesson, originalDate: mal.originalDate }))}"]` : `[data-lesson="${id}"]`;
    const pass = week.current?.querySelector<HTMLElement>(selector) ?? (!mal.originalDate ? rest.current?.querySelector<HTMLElement>(`[data-schema-rest-lesson="${id}"]`) : null);
    const element = pass?.matches(':enabled') ? pass : visatPassRubrik.current;
    passvisningFokus.current = null;
    element?.focus({ preventScroll: true });
    element?.scrollIntoView({ block: 'center' });
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
    setNyttProvSparfel(null); setMotor(null); setProvhinder(null);
    let spararProv = false;
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
      avbrytbarBerakning.current = controller;
      searchRunning.current?.abort(); searchRunning.current = null; setSokning(null); setVillkorsSokning(null);
      if (!continuing) {
        setBerakningssteg('diagnos'); setMotor({ typ: 'nytt', sedan: null });
        const findings = parseSchemaDiagnos(await api.post<unknown>('/api/schema/diagnos', request, controller.signal));
        if (controller.signal.aborted) return;
        setFore({ key, findings, releaseLocks });
        if (findings.length) return;
      }
      setBerakningssteg('solve'); setMotor({ typ: 'nytt', sedan: performance.now() });
      const { forslag: next, provplanering } = parseSchemaNyttProvForslag(
        await api.post<unknown>('/api/schema/forslag', { ...request, solveTimeMs, planeraProv: true }, controller.signal), request);
      if (controller.signal.aborted) return;
      if (provplanering) {
        const { draftId, expectedRevision, provrevision, sourceHash, resultHash, bookings, moveCount, replacedMinutes } = provplanering;
        const saveRequest: SchemaNyttProvSave = {
          save: { contractVersion: SCHEMA_DRAFT_VERSION, unitId, schoolYear, period, commandId: crypto.randomUUID(), draftId, expectedRevision,
            name: snapshot.name, basisVillkor: next.villkor, workingVillkor: next.villkor, grundFingerprint: next.grundFingerprint,
            placements: next.lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]),
            locks: next.locks ?? [], intentional: [], datedOverrides: [], activityTypes: snapshot.activityTypes },
          prov: { provrevision, sourceHash, resultHash },
        };
        spararProv = true;
        avbrytbarBerakning.current = null;
        const raknatTill = performance.now();
        setMotor(m => m && { ...m, raknatTill }); setBerakningssteg('sparar-prov');
        const receipt = parseSchemaNyttProvSaveReply(await api.post<unknown>('/api/schema/forslag/spara', saveRequest, controller.signal), saveRequest);
        if (controller.signal.aborted) return;
        generationConsent.current = null;
        setProvSparat(null); setSchemalagdaProv({ period, draftId: receipt.draftId, revision: receipt.revision, antal: bookings, flyttar: moveCount, minuter: replacedMinutes });
        setBerakningOpen(false); setVisning(grundschemaVal()); setJamforTerminer(false); valjYta('schema');
        spara.read(); nationellaProv.onReload();
        return;
      }
      setProvSparat(null); setSchemalagdaProv(null);
      generationConsent.current = null; spara.acceptNewBasis(); setDatedOverrides([]); setDatumPicked(null); setVisatPass(null);
      setBase(next); setVillkor(next.villkor); dispatch({ type: 'reset', forslag: next }); setFortsatt(null); setBerakningOpen(false); valjYta('schema'); setFolj(null); setShownTerm('ht'); setChosen('');
      if (next.metrics.lessons > 0) requestAnimationFrame(() => { if (!document.querySelector('[role="dialog"]')) berakningKnapp.current?.focus(); });
      setVisning(grundschemaVal());
      setJamforTerminer(false);
      setKontroll(null); setKraverNytt(null); setMisslyckat(null); setMoveError(null); setMoved('');
    } catch (caught) {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      if (spararProv) {
        setNyttProvSparfel(caught instanceof ApiError && caught.status >= 400 && caught.status < 500 ? message(caught, true)
          : 'Sparandet av schemat och proven kunde inte bekräftas. Serverns aktuella utkast läses in.');
        spara.read(); nationellaProv.onReload();
      } else if (caught instanceof ApiError && caught.reason === 'schema_nytt_prov_unresolved' && caught.schemaNyttProv) {
        setProvhinder({ nyckel: key, provrevision: nationellaProv.revision, request, solveTimeMs, hinder: caught.schemaNyttProv });
      } else setError(message(caught, true));
    } finally {
      if (avbrytbarBerakning.current === controller) avbrytbarBerakning.current = null;
      if (running.current === controller) { running.current = null; setBusy(false); }
    }
  }

  /** Fortsätter från utkastet, utan att ersätta det eller tömma dess historik. */
  async function fortsattBerakning() {
    if (fonster || !forslag || !base || redigeringStoppad || grundAndrad || issues.length || busy || checking || running.current) return;
    const original = placeringsBas();
    if (!original) return;
    // Datumändrade pass får inte flyttas i grundschemat. Skydden gäller bara denna sökning, inte utkastets användarlås.
    const locks = new Map((original.locks?.placements ?? []).map(p => [p.lesson, p]));
    for (const a of datedOverrides) {
      const p = original.placements.find(p => p.lesson === a.lesson);
      if (p) locks.set(p.lesson, p);
    }
    const request: SchemaFortsattRequest = { ...original, ...(locks.size ? { locks: { grundFingerprint: original.grundFingerprint, placements: [...locks.values()] } } : {}), solveTimeMs };
    const key = currentContinueKey.current, controller = new AbortController();
    running.current = controller; setBusy(true); setError(null); setBerakningssteg('forbereder'); setMotor(null);
    searchRunning.current?.abort(); setSokning(null); setVillkorsSokning(null); setSalsattning(null);
    setFortsatt({ key, request, result: null, loading: true, error: null });
    try {
      if (!await spara.flush()) throw new Error('save_failed');
      if (controller.signal.aborted) return;
      avbrytbarBerakning.current = controller;
      setBerakningssteg('solve'); setMotor({ typ: 'fortsatt', sedan: performance.now() });
      const result = parseSchemaFortsatt(await api.post<unknown>('/api/schema/fortsatt', request, controller.signal), request);
      if (controller.signal.aborted) return;
      setFortsatt({ key, request, result, loading: false, error: null });
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      const text = caught instanceof Error && caught.message === 'save_failed' ? 'Spara det nuvarande utkastet innan du fortsätter. Dina ändringar finns kvar.'
        : caught instanceof ApiError && caught.status === 409 ? 'Underlaget har ändrats. Ta fram ett nytt schemaförslag innan du fortsätter. Ditt schema finns kvar.'
        : `${message(caught)} Ditt nuvarande schema finns kvar.`;
      setFortsatt({ key, request, result: null, loading: false, error: text });
    } finally {
      if (avbrytbarBerakning.current === controller) avbrytbarBerakning.current = null;
      if (running.current === controller) { running.current = null; setBusy(false); }
    }
  }

  function behallNuvarande() {
    if (checking) return;
    if (fortsatt?.loading) { running.current?.abort(); running.current = null; setBusy(false); }
    setFortsatt(null); requestAnimationFrame(() => { (continueButton.current?.getClientRects().length ? continueButton.current : berakningKnapp.current)?.focus(); });
  }

  /** Webbläsaren slutar vänta. Motorn kan räkna klart den pågående omgången. */
  function avbrytBerakning() {
    const controller = avbrytbarBerakning.current;
    if (!controller || controller !== running.current || !motor) return;
    if (motor.typ === 'fortsatt') { behallNuvarande(); return; }
    controller.abort(); setMotor({ ...motor, avbrutet: true });
  }

  function fokusEfterBerakning(): HTMLElement | null {
    const synlig = (el: HTMLElement | null | undefined) => el?.isConnected && el.getClientRects().length > 0 && !el.matches(':disabled') ? el : null;
    if (motor?.typ === 'fortsatt') return synlig(document.querySelector<HTMLElement>('[data-schema-continue-panel] h2')) ?? synlig(continueButton.current) ?? synlig(berakningKnapp.current);
    return synlig(provhinderRubrik.current) ?? synlig(forberedForslagKnapp.current) ?? [...document.querySelectorAll<HTMLElement>(`button[type="submit"][form="${CSS.escape(regelformId)}"]`)].map(synlig).find(el => el) ?? synlig(berakningKnapp.current) ?? schemarubrik.current;
  }

  async function anvandFortsatt() {
    const search = fortsatt;
    if (!search?.result || search.loading || !base || !forslag || busy || checking || running.current || redigeringStoppad) return;
    if (search.key !== currentContinueKey.current || grundAndrad || issues.length) {
      setFortsatt({ ...search, error: 'Schemat har ändrats. Fortsätt förbättra igen innan du använder ett förslag.' }); return;
    }
    if (fortsattStopp(search.result)) return;
    const controller = new AbortController(); running.current = controller; setChecking(true);
    try {
      const candidate = search.result.forslag, placements = candidate.lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]);
      const checked = await kontrollera(base, candidate.lessons, controller);
      await kontrolleraDatumKandidat(base, candidate.lessons, controller);
      if (controller.signal.aborted) return;
      if (currentContinueKey.current !== search.key || fortsattStopp({ ...search.result, after: checked }) || placements.some(p => (checked.rooms[p.lesson] ?? null) !== p.room)) {
        setFortsatt({ ...search, error: 'Förslaget stämmer inte längre med schemat eller klarade inte den nya kontrollen. Inget har ändrats. Fortsätt förbättra igen.' }); return;
      }
      const action: SchemaUtkastAtgard = { type: 'arbetsvillkor', fore: villkor, efter: villkor, placements, text: 'Fortsatt beräkning' };
      if (schemaUtkast(utkast, action) === utkast) { setFortsatt({ ...search, error: 'Förslaget följer inte utkastets lås. Inga pass har ändrats.' }); return; }
      dispatch(action);
      setBase({ ...base, status: candidate.status, metrics: checked.metrics, teachings: checked.teachings, trims: checked.trims, diagnoses: candidate.diagnoses, statistics: candidate.statistics, elapsedMs: candidate.elapsedMs });
      setKontroll({ svar: checked, villkor: provadeKey }); setFortsatt(null); setMoveError(null);
      setMoved('Den fortsatta beräkningen är genomförd. Ändringarna kan ångras i ett steg.'); requestAnimationFrame(() => { (continueButton.current?.getClientRects().length ? continueButton.current : berakningKnapp.current)?.focus(); });
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setFortsatt({ ...search, error: 'Förslaget kunde inte kontrolleras. Ditt nuvarande schema finns kvar. Försök igen.' });
    } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
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
    const controller = new AbortController(); running.current = controller; setBusy(true); setBerakningssteg('diagnos'); setError(null); setMotor(null);
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
    markeraPass(l);
  }
  function markeraPass(l: SchemaForslagLesson) {
    if (!forslag) return;
    const day = l.day ?? 0, starts = startTimes(forslag, day, l.durationMin + l.marginMin, l.marginBeforeMin);
    setTarget({ day, startMin: l.startMin !== null && starts.includes(l.startMin) ? l.startMin : starts[0] ?? forslag.days[day].startMin, room: l.roomId });
    dispatch({ type: 'pick', lesson: l.id }); setMoveError(null);
    if (picked === l.id && !visaFokus.current && !passvisningFokus.current) (dayField.current?.matches(':enabled') ? dayField.current : passRubrik.current)?.focus();
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
      const tillfallen = datedOverrides.filter(a => changing.has(a.lesson)).map(schemaDatumNyckel);
      if (tillfallen.length) { setMoveError({ tillfallen }); return; }
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
      setMoved(action.type === 'swap' ? `Passen har bytt dag och starttid. ${reply.total ? `${reply.total} regelavvikelser.` : 'Inga regelavvikelser.'}` : `${fler ? `${fler + 1} pass är nu utan tid` : `${before.title} ${day === null || startMin === null ? 'är nu utan tid' : `ligger nu ${DAYS[day].toLowerCase()} ${clock(startMin)}`}`}.${tappadSal ? ` Passet är utan sal: ${tappadSal} var inte ledig då.` : ''} ${reply.total === 0 ? 'Inga regelavvikelser.' : `${reply.total} ${reply.total === 1 ? 'regelavvikelse' : 'regelavvikelser'}.`}`);
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
  function hamtaTillfalle(k: SchemaDatumNyckel): SchemaDatumTillfalle | undefined {
    if (!forslag) return;
    const key = schemaDatumNyckel(k), date = datedOverrides.find(a => schemaDatumNyckel(a) === key)?.date ?? k.originalDate;
    return schemaDatumTillfallen(forslag, { mode: 'intervall', from: date, to: date, monday: '' }, datedOverrides).find(o => o.key === key);
  }
  function valjDatum(key: SchemaDatumNyckel | SchemaDatumTillfalle) {
    if (!forslag || redigeringStoppad || busy || checking) return;
    const k = 'originalDate' in key && 'lesson' in key && typeof key.lesson === 'object' ? { lesson: key.lesson.id, originalDate: key.originalDate } : key as SchemaDatumNyckel;
    if (utkast.locked[k.lesson]) { setMoveError('Passet är låst. Lås upp det i grundschemat innan du ändrar ett tillfälle.'); return; }
    if (grundAndrad || issues.length) { setMoveError('Ta fram ett nytt förslag med de ändrade villkoren innan du ändrar ett datumtillfälle.'); return; }
    const o = hamtaTillfalle(k);
    if (!o) { setMoveError('Tillfället finns inte längre i det aktuella schemat. Välj tillfället igen.'); return; }
    dispatch({ type: 'pick', lesson: null });
    setDatumPicked({ ...o, expectedInputKey: JSON.stringify(datumInput()), grundFingerprint: forslag.grundFingerprint, period: forslag.period });
    setMoveError(null);
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
      if (visaSchema && visatPassMal?.originalDate && visning.mode !== 'grundschema') {
        const current = { lesson: visatPassMal.lesson, originalDate: visatPassMal.originalDate };
        if (!key || schemaDatumNyckel(key) === schemaDatumNyckel(current)) {
          const date = reply.datedOverrides.find(a => schemaDatumNyckel(a) === schemaDatumNyckel(current))?.date ?? current.originalDate;
          const term = forslag.time.calendar?.days.find(d => d.date === date)?.term;
          if (term) setShownTerm(term);
          setVisning(datumvisning(date, passvisning?.franGranskning ? 'intervall' : visning.mode));
          passvisningFokus.current = visatPassMal;
        }
      }
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
  async function kontrolleraGranskning() {
    if (!forslag || redigeringStoppad || running.current || busy || checking) return;
    const controller = new AbortController(), key = provadeKey;
    running.current = controller;
    setChecking(true); setMoveError(null);
    if (datedOverrides.length) { setDatumKontroll(null); setDatumOmprov(n => n + 1); }
    try {
      const reply = await kontrollera(forslag, forslag.lessons, controller);
      if (!controller.signal.aborted) setKontroll({ svar: reply, villkor: key });
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      if (!kraver(caught)) setMoveError('Schemat kunde inte kontrolleras. Försök igen.');
    } finally {
      if (running.current === controller) { running.current = null; setChecking(false); }
    }
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
  const avvikelse = (l: SchemaForslagLesson) => {
    if (!forslag || !kontroll || !flagged.has(l.id)) return null;
    const fynd = kontroll.violations.filter(v => v.lessons.includes(l.id));
    return avvikelseRad(forslag, provade.egna, fynd.map(v => v.code), l) ?? fynd[0]?.message ?? null;
  };
  const foljtId = folj ? !folj.locked && picked ? picked : folj.lesson : null;
  const foljt = foljtId ? forslag?.lessons.find(l => l.id === foljtId) ?? null : null;
  const placeringar = forslag?.lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]) ?? [];
  const placementBase = placeringsBas(), placementInputKey = placementBase ? JSON.stringify({ base: placeringsBasNyckel(placementBase), villkor: villkorKey }) : '';
  useEffect(() => { currentPlacementKey.current = placementInputKey; }, [placementInputKey]);
  const continueInputKey = JSON.stringify([unitId, schoolYear, period, base?.grundFingerprint, utkast.placements, utkast.locked, villkorKey, datedOverrides]);
  useEffect(() => { currentContinueKey.current = continueInputKey; }, [continueInputKey]);
  const intentionalKeys = medvetnaAvvikelser(utkast, kontroll?.violations ?? [], villkorKey, forslag?.grundFingerprint ?? '');
  const intentionalPass = [...new Set((kontroll?.violations ?? []).filter(v => intentionalKeys.has(avvikelseNyckel(v))).flatMap(v => v.lessons))];
  const keepIntent = useMemo(() => (utkast.intentional ?? []).filter(m => medvetenGaller(m, utkast.placements, villkorKey, forslag?.grundFingerprint ?? '') && (!kontroll || kontroll.violations.some(v => medvetenKrock(v) && avvikelseNyckel(v) === m.key))).map(m => m.key), [utkast.intentional, utkast.placements, villkorKey, kontroll, forslag?.grundFingerprint]);
  useEffect(() => { if (!fonster && (utkast.intentional ?? []).length > keepIntent.length) dispatchLocal({ type: 'intent-prune', keys: keepIntent }); }, [fonster, utkast.intentional, keepIntent]);

  const gruppKey = base ? JSON.stringify([base.period, base.grundFingerprint, base.resurser.grupp]) : '';
  const gruppunderlag = veckansGruppunderlag?.key === gruppKey ? veckansGruppunderlag : null;
  const options = useMemo(() => base ? veckoresurser(base, gruppunderlag?.groups ?? []) : [], [base, gruppunderlag]);
  const match = options.find(r => r.key === (wantedResource ?? chosen));
  const resourceMissing = !!wantedResource && !match;
  const forval = options.find(r => r.id === base?.classes[0]?.id && (r.slag === 'klass' || r.slag === 'grupp')) ?? options.find(r => r.slag === 'klass') ?? options[0];
  const selected = resourceMissing ? undefined : match ?? forval;
  const windowResource = selected?.villkor ? selected.key : undefined;
  const lasVeckansGrupper = useEffectEvent((key: string, signal: AbortSignal) => {
    const request = placeringsBas();
    if (!request || !forslag) return;
    void api.post<unknown>('/api/schema/samling', request, signal)
      .then(raw => {
        if (!signal.aborted) setVeckansGruppunderlag({ key, groups: parseSamlingData(raw, forslag).resources.filter(r => r.slag === 'grupp') });
      })
      .catch((caught: unknown) => {
        if (signal.aborted) return;
        if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
        setVeckansGruppunderlag({ key, groups: null });
      });
  });
  const lasGrupper = !!gruppKey && !!base?.resurser.grupp.length && selected?.slag === 'grupp' && vy === 'vecka' && !gruppunderlag;
  useEffect(() => {
    if (!lasGrupper) return;
    const controller = new AbortController();
    lasVeckansGrupper(gruppKey, controller.signal);
    return () => controller.abort();
  }, [lasGrupper, gruppKey]);
  function valjVeckoresurs(resurs: Veckoresurs) {
    setChosen(resurs.key); setWantedResource(undefined);
    if (pickedLesson && !veckoresursPass(resurs, pickedLesson)) dispatch({ type: 'pick', lesson: null });
  }
  const termpass = forslag?.lessons.some(l => l.term !== null) ?? false;
  const kanJamforaTerminer = !fonster && forslag?.period === 'lasar' && forslag.time.terms.length > 1;
  const byTerm = termpass || kanJamforaTerminer || forslag?.villkor.timeBasis === 'lasar' && forslag.time.terms.length > 1;
  const termTag = (l: SchemaForslagLesson) => l.term ? ` · ${l.term.toUpperCase()}` : '';
  // Justerad längd (05.2-SM-TIMPLAN-VECKA, W3): det passet kortas alla veckor i den termin som visas syns i veckan; kortning vissa veckor står i text.
  const viewTerm: SchemaTerm = !forslag || forslag.period === 'lasar' ? shownTerm : forslag.period;
  const datumVal = forslag ? schemaVeckaVal(forslag, viewTerm, visning) : visning;
  const provDagar = new Map((forslag?.time.calendar ?? forutsattningar?.time.calendar)?.days.map(day => [day.date, day.term]));
  const provBokningar = [...nationellaProv.document?.bokningar ?? []]
    .filter(b => period === 'lasar' || provDagar.get(b.datum) === period)
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.startMin - b.startMin || a.id.localeCompare(b.id));
  const provDeltagare = new Map(provunderlag?.deltagare.map(d => [`${d.slag}:${d.ref}`, d]));
  const provSalar = new Map(provunderlag?.salar.map(s => [s.id, s.name]));
  const provVakter = new Map(provunderlag?.vakter.map(v => [v.ref, v.name]));
  const provNyckel = (b: NationellProvbokning) => `${b.mal.slag}:${b.mal.ref}`;
  const provNamn = (b: NationellProvbokning) => provDeltagare.get(provNyckel(b))?.name ?? options.find(r => r.key === provNyckel(b))?.name ?? 'Bokade deltagare';
  const veckansProv: SchemaVeckoprov[] = datumVal.mode === 'grundschema' ? [] : provBokningar.filter(b => {
    if (selected?.key === provNyckel(b)) return true;
    if (selected?.slag === 'sal' && b.salId) return provSalar.get(b.salId) === selected.name;
    if (selected?.slag === 'larare') return b.vakter.includes(selected.villkor?.ref ?? selected.id);
    if (selected?.slag === 'amne') return provDeltagare.get(provNyckel(b))?.undervisningar.some(u => u.ref === b.undervisning && u.title === selected.name) ?? false;
    return false;
  }).map(b => ({ id: b.id, datum: b.datum, namn: b.namn, startMin: b.startMin, slutMin: b.slutMin,
    detail: [provNamn(b), b.salId ? provSalar.get(b.salId) ?? 'Kontrollera sal' : 'Sal återstår',
      personalLookup ? b.vakter.length ? b.vakter.map(ref => provVakter.get(ref) ?? 'Vald provvakt').join(', ') : 'Provvakt återstår' : ''].filter(Boolean).join(' · ') }));
  const datumIVyn = new Set(schemaVisningsDagar(forslag?.time.calendar, datumVal).map(dag => dag.date));
  const provIDatumvy = veckansProv.find(prov => datumIVyn.has(prov.datum));
  const bokatProvIDatumvy = provBokningar.find(prov => prov.id === provIDatumvy?.id);
  const sparatProvforslag = provSparat?.period === period ? provSparat : null;
  const sparadProvdag = sparatProvforslag && provBokningar.find(b => b.id === sparatProvforslag.provdag);
  const sparatProvAktuellt = sparatProvforslag && !sparstatus.dirty && sparstatus.phase === 'saved'
    && sparstatus.revision === sparatProvforslag.revision && nationellaProv.revision === sparatProvforslag.provrevision;
  const sparadeNyaProv = schemalagdaProv && spara.ready && !sparstatus.dirty && sparstatus.phase === 'saved'
    && schemalagdaProv.period === period && schemalagdaProv.draftId === spara.draftId && schemalagdaProv.revision === sparstatus.revision ? schemalagdaProv : null;
  useEffect(() => {
    if (sparadeNyaProv && (document.activeElement === document.body || document.activeElement === schemarubrik.current)) berakningKnapp.current?.focus();
  }, [sparadeNyaProv]);
  const forstaSparadeProvdag = sparadeNyaProv && !nationellaProv.reading && !nationellaProv.readFailed
    && provBokningar.find(b => provDagar.get(b.datum) && options.some(r => r.key === provNyckel(b)));
  function visaProvdag(id: string) {
    const bokning = provBokningar.find(b => b.id === id);
    if (!bokning || !forslag?.time.calendar) return;
    const resurs = options.find(r => r.key === provNyckel(bokning)), term = provDagar.get(bokning.datum);
    if (!resurs || !term) return;
    valjVeckoresurs(resurs);
    setShownTerm(term);
    setJamforTerminer(false);
    setVisning({ mode: 'intervall', from: bokning.datum, to: bokning.datum, monday: '' });
    setVy('vecka');
    dispatch({ type: 'pick', lesson: null });
    fokuseraProv.current = id;
    valjYta('schema');
  }
  useEffect(() => {
    const id = fokuseraProv.current;
    if (!visaSchema || !id) return;
    const kort = week.current?.querySelector<HTMLElement>(`[data-prov="${CSS.escape(id)}"]`);
    if (!kort) return;
    fokuseraProv.current = null;
    kort.focus({ preventScroll: true });
    kort.scrollIntoView({ block: 'nearest' });
  }, [visaSchema, visning, selected?.key]);
  const jamforVecka = kanJamforaTerminer && jamforTerminer && datumVal.mode === 'grundschema' && visadVy(vy, true, true, foljt !== null) === 'vecka';
  const bytLagen = useSchemaBytLagen({ forslag, villkor: provade, lesson: jamforVecka ? null : drop?.lesson ?? picked, placements: placeringar, userLocks: utkastLas(utkast), unitId, schoolYear, onSessionLost });
  const valdResurs = (l: SchemaForslagLesson) => veckoresursPass(selected, l);
  const iTerm = (l: SchemaForslagLesson) => l.term === null || l.term === viewTerm;
  const trimOf = (l: SchemaForslagLesson, term = viewTerm) => forslag?.trims.find(x => x.lesson === l.id && x.term === (l.term ?? term)) ?? null;
  const shownMin = (l: SchemaForslagLesson, term = viewTerm) => l.durationMin - (trimOf(l, term)?.fixedMin ?? 0);
  const someWeeks = (l: SchemaForslagLesson) => { const n = trimOf(l)?.extraCount ?? 0; return n ? ` · kortare ${n === 1 ? 'en vecka' : `${n} veckor`}` : ''; };
  const roomName = (id: string | null) => (salbild ?? forslag)?.rooms.find(r => r.id === id)?.name ?? '';
  const passRader = (l: SchemaForslagLesson) => intentionalPass.includes(l.id) ? ['Medveten krock'] : [];
  const detail = (l: SchemaForslagLesson) => {
    if (!forslag) return '';
    const deltagare = selected?.slag === 'klass' || selected?.slag === 'grupp'
      ? l.vacant && l.teacherIds.length === 0 ? 'Ingen lärare' : names(l.teacherIds, forslag.teachers)
      : names(l.classIds, forslag.classes);
    return [deltagare, selected?.slag === 'sal' ? '' : roomName(l.roomId)].filter(Boolean).join(' · ');
  };
  const dragged = drop ? forslag?.lessons.find(l => l.id === drop.lesson) ?? null : null;
  const unplaced = forslag?.lessons.filter(l => l.day === null) ?? [];
  const resursPass = forslag?.lessons.filter(l => l.day !== null && l.startMin !== null && valdResurs(l)) ?? [];
  const shown = datumVal.mode === 'grundschema' ? resursPass.filter(iTerm) : resursPass;
  const { deviating, off } = tidAvvikelser(forslag);
  // Villkoren som lager för den klass eller lärare som visas. Lagren följer villkoren i formuläret, så att en ändring syns direkt.
  const allaITerminen = forslag?.lessons.filter(iTerm) ?? [];
  const lager = forslag && selected ? schemaLager(villkor, forslag, { ...selected, ref: selected.id }, { lessons: shown, alla: allaITerminen, layers: utkast.layers }) : null;
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
  const meny = useSchemaMeny({ forslag, utkast, dispatch, villkor, setVillkor, shown, alla: allaITerminen, visad: selected?.id ?? '', visadResurs: selected?.villkor, unplaced, kallor: lager?.kallor ?? {}, length: shownMin, checking, week,
    synlig: !jamforVecka && visadVy(vy, true, true, foljt !== null) === 'vecka', andra: action => void andra(action), pick, taBort, folj: foljPass, andraVillkor: andraFalt,
    foresla: lesson => void sokPlacering({ mode: 'lesson', lesson, target: null, depth: 1 }),
    minsta: time => { if (picked) void sokPlacering({ mode: 'target', lesson: picked, target: { day: time.day, startMin: time.startMin, room: pickedLesson?.roomId ?? null }, depth: 1 }); },
    gemensam: selected?.slag !== 'amne' ? time => { setSamlingStart({ nr: Date.now(), resources: selected ? [selected.key, selected.id] : [], time, common: true }); setVy('samling'); rememberVy('samling'); } : undefined,
    onOpenWindow: l => { if (fastAktivitet(l, provade)) dispatch({ type: 'pick', lesson: l.id }); else pick(l); synk.open({ view: 'folj' }); },
    nyAktivitet: fonster ? undefined : time => { const ref = selected?.villkor;
      const resurs = ref && (ref.slag === 'klass' || ref.slag === 'grupp' || ref.slag === 'larare' || ref.slag === 'sal') ? { slag: ref.slag, ref: ref.ref } : undefined;
      setAktivitetsStart({ day: time.day, startMin: time.startMin, nr: Date.now(), resurs }); } });
  function valjPassresurs(l: SchemaForslagLesson) {
    if (valdResurs(l)) return;
    const passar = options.filter(r => veckoresursPass(r, l));
    const resurs = passar.find(r => r.slag === selected?.slag) ?? passar[0];
    if (resurs) { setChosen(resurs.key); setWantedResource(undefined); }
  }
  /** Visa i veckan (05.2-SM-PASSTABELL): passet och dess termin får fokus i kalendern. */
  function visaIVeckan(l: SchemaForslagLesson) {
    if (!forslag) return;
    valjPassresurs(l);
    if (l.term) setShownTerm(l.term);
    setVy('vecka'); rememberVy('vecka');
    setJamforTerminer(false);
    visaFokus.current = l.id;
    if (picked !== l.id) pick(l);
  }
  function oppnaGrundpass(lessonId: string) {
    const l = forslag?.lessons.find(l => l.id === lessonId);
    setDatumPicked(null);
    setVisning(grundschemaVal());
    if (!l) return;
    valjPassresurs(l);
    if (l.term) setShownTerm(l.term);
    visaFokus.current = l.id;
    pick(l);
  }
  function oppnaJamfortPass(l: SchemaForslagLesson, term: SchemaTerm) {
    if (busy || checking) return;
    setJamforTerminer(false);
    setShownTerm(term);
    visaFokus.current = l.id;
    markeraPass(l);
  }
  function visaPassISchemat(mal: GranskaMal, franGranskning = true) {
    const l = forslag?.lessons.find(pass => pass.id === mal.lesson);
    if (!forslag || !l) return;
    const occurrence = mal.originalDate ? hamtaTillfalle({ lesson: l.id, originalDate: mal.originalDate }) : undefined;
    if (mal.originalDate && !occurrence) { setMoveError('Tillfället finns inte längre i utkastet. Kontrollera schemat igen.'); return; }
    const term = occurrence?.term ?? l.term ?? viewTerm;
    valjPassresurs(occurrence?.lesson ?? l);
    setShownTerm(term);
    setJamforTerminer(false);
    setVisning(occurrence ? datumvisning(occurrence.date, franGranskning ? 'intervall' : 'vecka') : grundschemaVal());
    setVy('vecka');
    visaFokus.current = null;
    passvisningFokus.current = mal;
    setVisatPass({ mal, term, scope: granskaScope, franGranskning });
    setJamforOpen(false);
    valjYta('schema');
    if (occurrence) { dispatch({ type: 'pick', lesson: null }); setMoveError(null); }
    else markeraPass(l);
  }
  function diagnosVillkor(resource?: SchemaDiagnosResurs) {
    if (resource?.id.startsWith('kluster-')) { diagnosMal({ target: 'grupper', label: 'Öppna undervisningsgrupper' }); return; }
    if (visaForbered) {
      oppnaForbered(resource?.typ === 'larare' ? { omrade: 'larartider', ref: resource.id } : { omrade: 'regler' });
      return;
    }
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
  const tabellRubrik = (l: SchemaForslagLesson) => l.day === null ? `${l.title} · utan tid` : `${l.title} · ${meny.text(l).slice(l.title.length + 1)}`;
  const markerade = flagged;
  const falt = (o: SchemaOverlay, label: string, content: ReactNode) => {
    const k = o.sourceId ? lager?.kallor[o.sourceId] : undefined;
    return k && forslag ? <FaltKalla label={label} kalla={k} villkor={villkor} resurser={forslag.resurser} onAndra={andraFalt} onTaBort={taBort}>{content}</FaltKalla> : null;
  };

  // Historik och besked gäller hela utkastet. Läsande genvägar kan användas medan redigeringen väntar på servern.
  const gemensamt = forslag && <>
    <div className="schema-moves schema-arbetsrad">
      <div className="schema-undo" aria-label="Ångra och gör om ändringar">
        <Button type="button" variant="outline" disabled={utkast.undo.length === 0 || checking || redigeringStoppad} onClick={() => void andra({ type: 'undo' })}>{datumSteg(utkast.undo.at(-1)) ? 'Ångra senaste datumändring' : medvetenSteg(utkast.undo.at(-1)) ? 'Ångra medveten krock' : aktivitetsSteg(utkast.undo.at(-1)) ? 'Ångra senaste aktivitet' : (villkorSteg(utkast.undo.at(-1)) || arbetsvillkorSteg(utkast.undo.at(-1))) ? 'Ångra senaste villkor' : 'Ångra senaste flytt'}</Button>
        <Button type="button" variant="outline" disabled={utkast.redo.length === 0 || checking || redigeringStoppad} onClick={() => void andra({ type: 'redo' })}>Gör om</Button>
      </div>
      {!visaForbered && (inaktuelltUnderlag || forslag.status !== 'complete') && <span className={`status-badge ${inaktuelltUnderlag ? 'warning' : STATUS[forslag.status].tone}`}>
        {inaktuelltUnderlag ? 'Inaktuellt förslag' : `Förslag · ${STATUS[forslag.status].text}`}
      </span>}
      {!fonster && <div className="schema-arbetskommandon">
        <FonsterList synk={synk}><FonsterMeny synk={synk} resource={windowResource}/></FonsterList>
        {visaSchema && <>
          <Button type="button" variant="outline" ref={berakningKnapp} aria-expanded={berakningOpen} aria-controls={`${resultHeading}-berakning`} onClick={() => setBerakningOpen(open => !open)}>Beräkning<ChevronDownIcon aria-hidden="true"/></Button>
          <Button type="button" variant="ghost" onClick={() => { kontrollrubrik.current?.focus({ preventScroll: true }); kontrollrubrik.current?.scrollIntoView({ block: 'start' }); }}><ListChecksIcon aria-hidden="true"/>Till kontrollerna</Button>
        </>}
      </div>}
      {meny.meddelande}
    </div>
    {borttaget && <output className="schema-borttaget"><span className="schema-note">Villkoret är borttaget: {ruleText(borttaget.rule, forslag.resurser)}. Det gäller inte nästa förslag.</span>
      <Button ref={angraVillkor} type="button" variant="outline" disabled={busy || checking || redigeringStoppad} focusableWhenDisabled className="aria-disabled:pointer-events-none aria-disabled:opacity-50" onClick={angra}>Ångra borttagningen</Button></output>}
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
    <Folj intentional={intentionalPass} key={`${unitId}:${schoolYear}:${forslag.period}:${forslag.grundFingerprint}`} forslag={forslag} lesson={foljt} placements={placeringar} villkor={provade} userLocks={utkastLas(utkast)} locked={folj!.locked} checking={checking || busy} headingRef={foljRubrik} term={shownTerm}
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
    }).catch(caught => { if (!controller.signal.aborted) { if (caught instanceof ApiError && caught.status === 401) onSessionLost(); else setMoveError('Datumändringarna kunde inte kontrolleras. Välj Kontrollera igen i Granska för att försöka på nytt.'); } });
    return () => controller.abort();
  }, [fonster, redigeringStoppad, datedOverrides.length, datumInputKey, datumKontroll?.key, datumOmprov, onSessionLost, setMoveError]);
  const aktivaLas = utkastLas(utkast);
  const recoveryLocks = (grundAndrad || byterGrund) && aktivaLas.length > 0;
  const recoveryKey = JSON.stringify({ unitId, schoolYear, period, villkor: berakningsVillkor, ...(base && aktivaLas.length && !recoveryLocks ? { locks: { grundFingerprint: base.grundFingerprint, placements: aktivaLas } } : {}) });
  const diagnosAktuell = fore?.key === recoveryKey ? fore : null;
  const aktuelltProvhinder = provhinder?.nyckel === recoveryKey && provhinder.provrevision === nationellaProv.revision ? provhinder : null;
  function granskaForberedOmrade(omrade: 'underlag' | 'aktiviteter') {
    valjYta('forbered');
    oppnaForbered({ omrade });
  }
  const recoveryFore = fore?.key === recoveryKey ? fore : null;
  const hinderUnderlag = inaktuelltUnderlag ? aktuelltUnderlag : forslag;
  const underlagshinder = hinderUnderlag && hinderUnderlag.metrics.lessons === 0 && <UnderlagHinder forslag={hinderUnderlag} onTeaching={() => diagnosMal({ target: 'tjanst', label: 'Öppna tjänstefördelningen' })} onNeeds={() => diagnosMal({ target: 'timplan', label: 'Öppna timplanerna' })}/>;
  // Ytorna Förbered och Lägg schema (05.2-SM-UXF-31) visar samma utkast. Formuläret för regler och aktivitetslistan finns på båda och ritas där ytan står.
  const motorlageOppet = !fonster && busy && motor !== null && berakningssteg !== 'forbereder';
  const berakningsbesked = busy && !motorlageOppet && !fortsatt?.loading ? {
    forbereder: 'Förbereder ett nytt schemaförslag…',
    diagnos: 'Kontrollerar underlaget före beräkning…',
    solve: `Schemamotorn räknar, upp till ${solveTimeMs / 1000} sekunder. Därefter kontrolleras resultatet.`,
    'sparar-prov': 'Sparar schema och nationella prov tillsammans…',
  }[berakningssteg] : '';
  const blockeradeNycklar = new Set(flyttfel && typeof flyttfel !== 'string' ? flyttfel.tillfallen : []);
  const blockeradeTillfallen = forslag && blockeradeNycklar.size ? datedOverrides
    .filter(datum => blockeradeNycklar.has(schemaDatumNyckel(datum)))
    .sort((a, b) => a.originalDate.localeCompare(b.originalDate) || a.startMin - b.startMin) : [];
  const datumHinder = forslag && blockeradeTillfallen.length > 0 && <div ref={moveErrorRef} tabIndex={-1} className="valplan-alert min-w-0" role="alert">
    <h2 className="text-base font-semibold">Grundschemat kunde inte ändras</h2>
    <p>De här tillfällena har redan ändrats. Visa ett tillfälle i veckan för att kunna ändra eller återställa det separat.</p>
    <ul className="w-full divide-y divide-border rounded-lg border border-border bg-card text-card-foreground">
      {blockeradeTillfallen.map(datum => {
        const original = schemaDatumOriginal(forslag, datum);
        const pass = original?.lesson ?? forslag.lessons.find(lesson => lesson.id === datum.lesson);
        const titel = pass ? [pass.title, names(pass.classIds, forslag.classes)].filter(Boolean).join(' · ') : 'Ändrat pass';
        const start = original?.lesson.startMin;
        const nyTid = `${clock(datum.startMin)}–${clock(datum.startMin + datum.durationMin)}`;
        const olikaSalar = original && original.lesson.roomId !== datum.room;
        return <li key={schemaDatumNyckel(datum)} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="min-w-0 space-y-1">
            <p className="font-semibold">{titel}</p>
            <dl className="grid gap-x-3 text-sm sm:grid-cols-[auto_1fr]">
              <dt>Ordinarie tillfälle</dt>
              <dd>{schemaDayHeading(datum.originalDate)}{original && start != null && ` · ${clock(start)}–${clock(start + original.length)}`}{olikaSalar && ` · ${roomName(original.lesson.roomId) || 'Ingen sal'}`}</dd>
              <dt>Ändrat tillfälle</dt>
              <dd>{schemaDayHeading(datum.date)} · {nyTid}{olikaSalar && ` · ${roomName(datum.room) || 'Ingen sal'}`}</dd>
            </dl>
          </div>
          <Button type="button" variant="outline" aria-label={`Visa tillfället för ${titel}, ${schemaDayHeading(datum.date)} ${clock(datum.startMin)}`}
            disabled={!original || busy || checking || redigeringStoppad} onClick={() => visaPassISchemat(datum, false)}>Visa tillfället</Button>
        </li>;
      })}
    </ul>
  </div>;
  const meddelanden = <>
    <output aria-live="polite" className="schema-note">{berakningsbesked || (motor?.avbrutet ? 'Beräkningen avbröts. Utkastet är oförändrat.' : '')}</output>
    {!sokning && diagnosAktuell && diagnosAktuell.findings.length > 0 && <ForeBerakning findings={diagnosAktuell.findings} busy={busy || checking} onContinue={() => void run(true, diagnosAktuell.releaseLocks)} onTarget={diagnosMal}/>}
    {error && <div className="valplan-alert" role="alert"><p>{error}</p></div>}
    {!fonster && aktuelltProvhinder && <Provhinder key={aktuelltProvhinder.nyckel} {...aktuelltProvhinder}
      headingRef={provhinderRubrik} disabled={busy || checking} onBookings={() => granskaForberedOmrade('aktiviteter')} onBasis={() => granskaForberedOmrade('underlag')}
      onBooking={(ref, resurs) => {
        valjYta('forbered');
        oppnaForbered(nationellaProv.document?.bokningar.some(b => b.id === ref)
          ? { omrade: 'aktiviteter', ref, resurs } : { omrade: 'aktiviteter' });
      }}
      onSessionLost={onSessionLost}/>}
    {nyttProvSparfel && <div className="valplan-alert" role="alert"><p>{nyttProvSparfel}</p></div>}
    {moveError && <div ref={moveErrorRef} tabIndex={-1} className="valplan-alert" role="alert"><p>{moveError}</p></div>}
    {datumHinder}
    {!inaktuelltUnderlag && underlagshinder}
    {!visaForbered && !forslag && !busy && !error && !aktuelltProvhinder && <p className="empty-state">Inget förslag ännu. Välj vad schemat gäller, se över villkoren och ta fram ett schemaförslag.</p>}
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
  const granskarForslag = !!(sokning || fortsatt || diagnosAktuell?.findings.length);
  const harPass = !!forslag?.metrics.lessons;
  const taFramKnapp = <Button type="submit" form={regelformId} variant={aktuelltProvhinder || granskarForslag || (!visaForbered && harPass) ? 'outline' : 'default'} disabled={busy || checking || issues.length > 0}>{busy ? berakningssteg === 'sparar-prov' ? 'Sparar…' : 'Räknar…' : 'Ta fram schemaförslag'}</Button>;
  const berakningsform = <form id={regelformId} className="schema-controls" onSubmit={e => { e.preventDefault(); void run(); }}>
      <label>Räknetid per omgång<select value={solveTimeMs} disabled={busy || checking} onChange={e => setSolveTimeMs(Number(e.target.value) as SchemaSolveTimeMs)}>
        {SCHEMA_SOLVE_TIMES.map(ms => <option key={ms} value={ms}>{ms / 1000} sekunder</option>)}
      </select></label>
      {!visaForbered && harPass && <Button ref={continueButton} type="button" variant={granskarForslag || grundAndrad ? 'outline' : 'default'} disabled={busy || checking || issues.length > 0 || grundAndrad || redigeringStoppad} onClick={() => void fortsattBerakning()}>Fortsätt förbättra</Button>}
      {!visaForbered && taFramKnapp}
      {!visaForbered && harPass && <p className="schema-note schema-wide">{grundAndrad ? 'Passens underlag har ändrats. Ta fram ett nytt schemaförslag för den nya uppdelningen.' : 'Fortsätt förbättra utgår från ditt nuvarande schema. Låsta pass och pass med datumändringar ligger kvar. Ett nytt schemaförslag räknar om placeringarna.'}</p>}
      <p className="schema-note schema-wide">Ämnenas sammanlagda tid för läsåret kommer från timplanen, via tjänstefördelningen. Ett gemensamt veckomönster används på hösten och våren när undervisningen och lärarna är desamma. Tid och kortningar räknas över årets faktiska lektionstillfällen. Undervisning som bara går en termin ligger kvar där.</p>
    </form>;
  const forberedBokningar = visaForbered && !nationellaProv.reading && !nationellaProv.readFailed && provunderlag?.gallerGymnasiet !== false ? nationellaProv.document?.bokningar ?? [] : [];
  const kallaForbered = forberedPunkter.find(punkt => punkt.id === 'underlag');
  const forberedUppgifter: ForberedAtgard[] = [];
  if (visaForbered) {
    const knappPerOmrade: Partial<Record<ForberedOmrade, string>> = { underlag: 'Öppna underlaget', lektioner: 'Visa lektioner och block',
      salar: 'Öppna salar', regler: 'Rätta villkoren', aktiviteter: 'Öppna provplanen' };
    const saluppgifter = forberedSalar.filter(rad => rad.behov === null || rad.hinder);
    const provfel = forberedBokningar.filter(bokning => provbokningsfel.has(bokning.id));
    for (const punkt of forberedPunkter) {
      if (!punkt.nasta || !punkt.saknas) continue;
      if (punkt.id === 'salar' && villkor.salregister?.salar.length && saluppgifter.length) {
        forberedUppgifter.push(...saluppgifter.map(rad => ({
          mal: { omrade: 'salar' as const, ref: rad.ref },
          text: [rad.title, rad.grupp].filter(Boolean).join(' · '),
          detalj: rad.hinder ?? 'Salbehov saknas.',
          knapp: 'Öppna salbehovet',
        })));
      } else if (punkt.id === 'aktiviteter' && provfel.length) {
        forberedUppgifter.unshift(...provfel.map(bokning => ({
          mal: { omrade: 'aktiviteter' as const, ref: bokning.id },
          text: [bokning.namn, provNamn(bokning), schemaDateText(bokning.datum)].join(' · '),
          detalj: provbokningsfel.get(bokning.id),
          knapp: 'Öppna provbokningen',
        })));
      } else {
        forberedUppgifter.push({ mal: { omrade: punkt.id }, text: punkt.nasta, knapp: knappPerOmrade[punkt.id] ?? punkt.atgard });
      }
    }
    if (issues.length) forberedUppgifter.sort((a, b) => Number(b.mal.omrade === 'regler') - Number(a.mal.omrade === 'regler'));
  }
  const kanOppnaSparatForslag = harPass && !inaktuelltUnderlag && !grundAndrad;
  const forberedUpptagen = busy || checking || !spara.ready;
  const nyttForberedForslag = <Button type="button" ref={forberedForslagKnapp} variant={kanOppnaSparatForslag && !busy ? 'outline' : 'default'}
    disabled={forberedUpptagen || issues.length > 0} onClick={() => { setForberedBerakningsvalOppet(false); void run(); }}>
    {busy ? berakningssteg === 'sparar-prov' ? 'Sparar…' : 'Räknar…' : 'Ta fram schemaförslag'}
  </Button>;
  const omradesgenomgang = (id: ForberedOmrade) => {
    const punkt = forberedPunkter.find(p => p.id === id);
    return punkt && <Omradesgenomgang punkt={punkt} genomgang={genomgang} onGenomgang={setGenomgang} disabled={busy || checking}/>;
  };
  const doljForbered = (id: ForberedOmrade) => forberedGrupp !== gruppForOmrade(id);
  const villkorsform = !fonster && <Villkor value={villkor} disabled={busy || checking} issues={issues} resurser={forutsattningar?.resurser ?? null} forslag={forslag} onChange={andraArbetsvillkor}
        resurserBesked={issues.length ? 'Rätta felen i villkoren för att läsa klasser, grupper, ämnen och lärare från underlaget.' : underlagLas.error ?? 'Läser klasser, grupper, ämnen och lärare från underlaget…'}/>;
  const aktivitetsvy = (f: SchemaForslag) => <Aktiviteter personalLookup={personalLookup} onSessionLost={onSessionLost} activityTypes={activityTypes} onTypesChange={setActivityTypes} forslag={f} villkor={villkor} lessons={f.lessons} busy={busy || checking} onChange={andraAktiviteter} saveError={error ?? moveError}
        recoveryAction={(grundAndrad || error || !!recoveryFore?.findings.length) && <div className="grid gap-3">
          {!!recoveryFore?.findings.length && <div><p className="font-medium">Kontroll före nytt förslag</p><ul className="list-disc pl-5">{recoveryFore.findings.map((f, i) => <li key={i}>{f.message}</li>)}</ul></div>}
          <p className="text-muted-foreground">Ett nytt förslag räknar om passens placeringar. Formuläret för aktiviteten står kvar.</p>
          {grundAndrad && aktivaLas.length > 0 && <p>De {aktivaLas.length} låsta passen hör till den tidigare uppdelningen. Med knappen nedan släpper du låsen i det nya förslaget. Om beräkningen misslyckas finns de gamla låsen och dina formulärval kvar.</p>}
          <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={busy || checking || issues.length > 0} onClick={() => void run(!!recoveryFore?.findings.length, grundAndrad && aktivaLas.length > 0)}>{busy ? 'Tar fram nytt schemaförslag…' : grundAndrad && aktivaLas.length > 0 ? `Lås upp ${aktivaLas.length} pass och ta fram nytt förslag${recoveryFore?.findings.length ? ' ändå' : ''}` : recoveryFore?.findings.length ? 'Ta fram nytt förslag ändå och behåll formuläret' : 'Ta fram nytt förslag och behåll formuläret'}</Button>
        </div>}
        start={aktivitetsStart} onStartHandled={() => setAktivitetsStart(null)}/>;
  const passAtgarder = pickedLesson ? meny.passAtgarder(pickedLesson) : null;
  const valtPass = forslag && pickedLesson && <Flyttpanel salRequest={placeringsBas() ?? undefined} onSessionLost={onSessionLost} lesson={pickedLesson} forslag={forslag} target={target} checking={checking || busy} locked={fastAktivitet(pickedLesson, provade) ? 'Aktiviteten har fast tid. Ändra den i aktivitetslistan.' : utkast.locked[pickedLesson.id] ? 'Passet är låst. Lås upp det innan du flyttar det.' : undefined} shownMin={shownMin(pickedLesson)}
        extra={{ someWeeks: someWeeks(pickedLesson), termTag: termTag(pickedLesson) }} roomName={roomName} dayRef={dayField} headingRef={passRubrik} onTarget={setTarget}
        avvikelse={avvikelse(pickedLesson)} medveten={intentionalPass.includes(pickedLesson.id)}
        status={bytLagen.loading ? 'läser möjliga starttider…' : bytLagen.error ?? bytLagen.status(target)} sal={passMedSal.find(l => l.id === pickedLesson.id)?.sal}
        verktyg={<>
          {vy !== 'folj' && <Button type="button" variant="outline" onClick={() => foljPass(pickedLesson.id)}>Följ passet</Button>}
          {passAtgarder && pickedLesson.day !== null && !fastAktivitet(pickedLesson, provade) && <>
            <Button type="button" variant="outline" disabled={busy || checking} onClick={passAtgarder.las}>{passAtgarder.last ? 'Lås upp passet' : 'Lås passet'}</Button>
            <Button type="button" variant="outline" disabled={busy || checking || passAtgarder.last} onClick={() => { passAtgarder.byt?.(); passElement(pickedLesson.id)?.focus(); }}>Byt med ett annat pass</Button>
          </>}
        </>}
        onSuggest={() => void sokPlacering({ mode: 'lesson', lesson: pickedLesson.id, target: null, depth: 1 })}
        onTargetSuggest={() => void sokPlacering({ mode: 'target', lesson: pickedLesson.id, target, depth: 1 })}
        onMove={() => void andra({ type: 'move', lesson: pickedLesson.id, day: target.day, startMin: target.startMin, room: target.room, fler: utkast.selected.includes(pickedLesson.id) ? utkast.selected.filter(id => id !== pickedLesson.id) : [] })}
        onPark={() => void andra({ type: 'park', lesson: pickedLesson.id, fler: utkast.selected.includes(pickedLesson.id) ? utkast.selected.filter(id => id !== pickedLesson.id) : [] })}
        onCancel={() => { focus.current = pickedLesson.id; dispatch({ type: 'pick', lesson: null }); }}
        flerVerktyg={passAtgarder && !fonster && <>
          <Button type="button" variant="outline" onClick={passAtgarder.villkor}>Villkor för ämnet</Button>
          {pickedLesson.day !== null && !fastAktivitet(pickedLesson, provade) && <Button type="button" variant="outline" disabled={busy || checking} onClick={passAtgarder.laggAldrig}>Lägg aldrig här</Button>}
          <Button type="button" variant="outline" onClick={passAtgarder.oppnaFonster}>Öppna i nytt fönster</Button>
        </>}/>;
  const visaHuvudvy = forslag && forslag.lessons.length > 0 && !(fonster?.view === 'vecka' && resourceMissing)
    && (!fonster || ['vecka', 'folj', 'samling', 'pass', 'villkor'].includes(fonster.view));
  const arbetsvy = visadVy(vy, villkorsvy !== undefined, samlingsvy !== undefined, foljvy !== undefined);
  const reviewLesson = visatPassMal ? forslag?.lessons.find(l => l.id === visatPassMal.lesson) : undefined;
  const reviewOccurrence = visatPassMal?.originalDate && reviewLesson ? hamtaTillfalle({ lesson: reviewLesson.id, originalDate: visatPassMal.originalDate }) : undefined;
  const visaPasskontext = passvisning?.franGranskning || reviewOccurrence && datumIVyn.has(reviewOccurrence.date) && valdResurs(reviewOccurrence.lesson);
  const visaJamfor = !!(forslag && reviewLesson && (!visatPassMal?.originalDate || reviewOccurrence));
  const granskaStale = grundAndrad || inaktuelltUnderlag || (forslag !== null && period !== forslag.period) || issues.length > 0;
  const granskaTerm = reviewOccurrence?.term ?? reviewLesson?.term ?? passvisning?.term ?? viewTerm;
  const tomning = !fonster && (kanAngraTomning || spara.draftId && snapshot.placements.length > 0) ? {
    undo: kanAngraTomning, disabled: !tomningTillganglig, onClick: () => void andraTomning(kanAngraTomning ? 'undo' : 'clear'),
  } : undefined;
  const sparbesked = <Sparstatus state={sparstatus} name={draftName} disabled={busy || checking || !spara.ready} child={!!fonster} onName={setDraftName} onSave={() => void spara.flush()} onRead={() => void lasServerversion()} onNew={() => void run()}
    tomning={tomning} tomningsknapp={tomningsknapp} tomningsfel={tomningsfel}/>;
  if (fonster && !synk.live) return <section className="valplan-workspace schema-workspace"><FonsterList synk={synk} title={fonsterVyNamn[fonster.view]}/><p className="empty-state">Väntar på huvudfönstret. Inga ändringar kan göras innan kontakten är tillbaka.</p></section>;
  return <section className="valplan-workspace schema-workspace" data-granska-pass={visaSchema && visaPasskontext ? '' : undefined}>
    {!fonster && <Berakningslage oppen={motorlageOppet} motor={motor} steg={berakningssteg === 'forbereder' ? 'diagnos' : berakningssteg}
      solveTimeMs={solveTimeMs} onAvbryt={avbrytBerakning} aterFokus={fokusEfterBerakning}/>}
    {fonster ? <>
      <FonsterList synk={synk} title={fonsterVyNamn[fonster.view]}><FonsterMeny synk={synk} disabled={!forslag} resource={windowResource}/></FonsterList>
      {sparbesked}
    </> : <header className="schema-sidhuvud">
      <div className="schema-huvudrad">
        <div className="page-heading"><div><h1 ref={schemarubrik} tabIndex={-1}>Schema<span className="heading-dot">.</span></h1><p>{schoolName ? `${schoolName} · ` : ''}Läsår {planningYearLabel(schoolYear)}</p></div></div>
        <div className="schema-utkastval">
          <label>Schemat gäller<select value={period} disabled={periodbyteStoppat} onChange={e => void bytPeriod(e.target.value as SchemaPeriod)}>
        <option value="lasar">{PERIOD.lasar}</option><option value="ht">{PERIOD.ht}</option><option value="vt">{PERIOD.vt}</option></select></label>
          {sparbesked}
        </div>
      </div>
      <Ytval yta={yta} onYta={valjYta}/>
    </header>}
    {!fonster && !forslag && <FonsterMeny synk={synk} disabled/>}
    {forslag && datumPicked && <DatumFlytt salScope={placeringsBas()} datedOverrides={datedOverrides} onSessionLost={onSessionLost} key={datumPicked.key} occurrence={datumPicked} forslag={forslag} busy={busy || checking} error={moveError} onSave={change => void andraDatum({ lesson: datumPicked.lesson.id, originalDate: datumPicked.originalDate }, change, undefined, datumPicked.expectedInputKey)} onClose={() => setDatumPicked(null)} onBase={() => oppnaGrundpass(datumPicked.lesson.id)}/>}
    {gemensamt}
    {!fonster && visaSchema && sparadeNyaProv && <section aria-label="Nationella prov i det sparade schemat" className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <output className="status-badge success">Schema och nationella prov sparade</output>
        <p className="schema-note">{sparadeNyaProv.antal} {sparadeNyaProv.antal === 1 ? 'provbokning planerad' : 'provbokningar planerade'}.
          {' '}{sparadeNyaProv.flyttar > 0 ? `${sparadeNyaProv.flyttar} ${sparadeNyaProv.flyttar === 1 ? 'lektion flyttad' : 'lektioner flyttade'} med ${sparadeNyaProv.minuter} minuters ersatt undervisningstid.` : 'Ingen undervisning behövde flyttas.'}</p>
      </div>
      {forstaSparadeProvdag && <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={() => visaProvdag(forstaSparadeProvdag.id)}>Visa provdagen</Button>}
    </section>}
    {!fonster && visaSchema && (provBokningar.length > 0 || nationellaProv.readFailed) && <details className="min-w-0 rounded-lg border border-border bg-card p-4">
      <summary className="cursor-pointer font-medium">Bokade nationella prov{provBokningar.length > 0 && <span className="ml-2 status-badge">{provBokningar.length}</span>}</summary>
      {nationellaProv.readFailed && <div className="flex flex-wrap items-center gap-2 pt-3"><p className="schema-note">Provplanen kunde inte läsas.</p><Button type="button" variant="outline" onClick={nationellaProv.onReload}>Läs in provplanen igen</Button></div>}
      {provBokningar.length > 0 && <div className="space-y-2 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="schema-note max-w-prose">Bokningen anger datum och deltagare. När rektor lägger in provförslaget tilldelas salar och provvakter och undervisningen som krockar flyttas i det här utkastet.</p>
          <Button type="button" variant="outline" onClick={() => visaProvforslag(null)}>Öppna provförslag</Button>
        </div>
        <ul className="divide-y divide-border">{provBokningar.map(b => <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <div><p className="font-medium">{b.namn} · {provNamn(b)}</p><p className="schema-note">{schemaDateText(b.datum)} · {clock(b.startMin)}–{clock(b.slutMin)}</p></div>
          {forslag?.time.calendar && provDagar.get(b.datum) && options.some(r => r.key === provNyckel(b)) && <Button type="button" variant="outline" onClick={() => visaProvdag(b.id)}
            aria-label={`Visa provdagen för ${provNamn(b)} ${schemaDateText(b.datum)}`}>Visa provdagen</Button>}
        </li>)}</ul>
      </div>}
    </details>}
    {!fonster && inaktuelltUnderlag && <>
      {!visaForbered && <section aria-labelledby={`${resultHeading}-aktuellt`} className="rounded-lg border border-border bg-card p-4 space-y-2">
        <h2 id={`${resultHeading}-aktuellt`} className="section-heading">Aktuellt underlag</h2>
        {underlagLas.error ? <div className="flex flex-wrap items-center gap-3"><output>Det aktuella schemaunderlaget kunde inte läsas.</output><Button type="button" variant="outline" onClick={underlagLas.reload}>Läs underlaget igen</Button></div>
          : aktuelltUnderlag ? <p>{aktuelltUnderlag.basis && `Tjänstefördelning version ${aktuelltUnderlag.basis.versionNo} (${BASIS[aktuelltUnderlag.basis.status] ?? aktuelltUnderlag.basis.status}). `}
            {aktuelltUnderlag.fordelning.length} undervisningar, {aktuelltUnderlag.lessons.length} pass i beräkningsunderlaget.
            {aktuelltUnderlag.lessons.length > 0 && ' Ta fram ett nytt schemaförslag för att lägga passen.'}</p>
            : <output className="schema-note">{issues.length ? 'Underlaget läses när felen i villkoren är rättade.' : busy ? 'Tar fram ett nytt underlag…' : 'Läser aktuellt underlag…'}</output>}
      </section>}
      {underlagshinder}
    </>}
    {!fonster && visaGranska && (busy || error || aktuelltProvhinder || nyttProvSparfel || motor?.avbrutet || moveError || datumHinder || (!inaktuelltUnderlag && underlagshinder)) && meddelanden}
    {!fonster && <GranskaUtkast key={granskaScope} forslag={forslag} lessons={passMedSal} kontroll={kontroll} checking={checking || busy} stale={granskaStale}
      datum={datumSvar} datedOverrides={datedOverrides} intentional={intentionalKeys} active={visaGranska}
      onIntent={redigeringStoppad || villkorKey !== provadeKey ? undefined : markeraMedveten}
      onOpen={visaPassISchemat} onToSchedule={() => valjYta('schema')}
      actions={visaGranska && forslag && <div className="space-y-3">
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={redigeringStoppad || busy || checking || granskaStale} onClick={() => void kontrolleraGranskning()}>
          {kontroll ? 'Kontrollera igen' : 'Kontrollera schemat'}
        </Button>
          <Button type="button" variant="outline" onClick={() => visaProvforslag(null)}>Till provförslaget</Button></div>
        {salsattningsvy}
      </div>}/>}
    {!fonster && <section ref={provforslagPanel} tabIndex={-1} className="scroll-mt-24" aria-label="Provgranskning" hidden={!visaGranska}>
      {sparatProvforslag && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
        <output className="status-badge success">Provförslaget är sparat i schemat.</output>
        {sparadProvdag && <Button type="button" variant="outline" disabled={!spara.ready || !sparatProvAktuellt || nationellaProv.reading}
          onClick={() => visaProvdag(sparadProvdag.id)} aria-label={`Visa sparad provdag för ${provNamn(sparadProvdag)} ${schemaDateText(sparadProvdag.datum)}`}>Visa provdagen</Button>}
      </div>}
      <Provforslag key={nationellaProv.revision ?? 'okand'} request={placementBase?.placements.length && !granskaStale ? { ...placementBase, datedOverrides, dates: [] } : null}
        disabled={redigeringStoppad || busy || checking} personalLookup={personalLookup} lessons={passMedSal} onSessionLost={onSessionLost}
        onOpenBooking={provBokningar.length ? visaProvdag : undefined} onApply={personalLookup ? tillampaProvforslag : undefined}
        canApply={sparstatus.phase === 'saved' && !sparstatus.dirty}
        onOpen={(lesson, originalDate) => {
          if (document.activeElement instanceof HTMLElement) provGranskaRetur.current = document.activeElement;
          visaPassISchemat({ lesson, originalDate });
        }}/>
    </section>}
    {!fonster && visaSchema && visatPassMal && visaPasskontext && <>
      <section className="schema-granska-kontext" aria-label={passvisning?.franGranskning ? 'Pass från granskningen' : 'Visat tillfälle'}>
        {passvisning?.franGranskning && <Button type="button" variant="ghost" onClick={() => valjYta('granska')}><ArrowLeftIcon aria-hidden="true"/>Tillbaka till granskningen</Button>}
        <div className="min-w-0">
          <h2 ref={visatPassRubrik} tabIndex={-1} className="font-semibold">{reviewLesson?.title ?? 'Passet har ändrats'}</h2>
          {reviewLesson && <p className="schema-note">{[
            forslag && names(reviewLesson.classIds, forslag.classes),
            reviewOccurrence ? `${schemaDateText(reviewOccurrence.date)} · ${clock(reviewOccurrence.lesson.startMin!)}`
              : visatPassMal.originalDate ? 'Tillfället finns inte längre i utkastet'
                : reviewLesson.day === null || reviewLesson.startMin === null ? 'Utan tid'
                  : `${TERM[granskaTerm]} · ${DAYS[reviewLesson.day]} ${clock(reviewLesson.startMin)}`,
          ].filter(Boolean).join(' · ')}</p>}
        </div>
        {reviewOccurrence && <Button type="button" variant="outline" disabled={busy || checking || redigeringStoppad} onClick={() => valjDatum(reviewOccurrence)}>Ändra tillfället</Button>}
        {visaJamfor && <Button type="button" variant="outline" aria-expanded={jamforOpen} aria-controls={jamforId} onClick={() => {
          setJamforOpen(!jamforOpen);
          if (!jamforOpen) requestAnimationFrame(() => {
            const panel = document.getElementById(jamforId);
            panel?.focus({ preventScroll: true }); panel?.scrollIntoView({ block: 'start' });
          });
        }}>Jämför resurser<ChevronDownIcon aria-hidden="true"/></Button>}
      </section>
      {visaJamfor && forslag && reviewLesson && <div id={jamforId} tabIndex={-1} hidden={!jamforOpen} className="schema-granska-jamfor">
        <JamforResurser forslag={forslag} lesson={reviewLesson} occurrence={reviewOccurrence} overrides={datedOverrides} term={granskaTerm}
          active={jamforOpen} groupRequest={placementBase} onSessionLost={onSessionLost}/>
      </div>}
    </>}
    <fieldset className="contents" disabled={redigeringStoppad}>
    {!fonster && visaSchema && <div id={`${resultHeading}-berakning`} hidden={!!forslag && !berakningOpen}>{berakningsform}</div>}
    {visaForbered && <>
      {!forslag && (utkast.undo.length > 0 || utkast.redo.length > 0) && <div className="schema-moves rounded-lg border border-border bg-card p-3"><div className="schema-undo" aria-label="Ångra och gör om ändringar">
        <Button type="button" variant="outline" disabled={utkast.undo.length === 0 || busy} onClick={() => void andra({ type: 'undo' })}>{angraText}</Button>
        <Button type="button" variant="outline" disabled={utkast.redo.length === 0 || busy} onClick={() => void andra({ type: 'redo' })}>Gör om</Button></div>
        <output aria-live="polite" className="schema-note">{moved}</output></div>}
      <ForberedOversikt kalla={kallaForbered?.varden.slice(0, 2).join(' · ') ?? 'Läser underlaget…'}
        kontroll={aktuelltProvhinder ? 'Beräkningen stannade före sparandet.'
          : diagnosAktuell ? `Underlaget kontrollerat${foreTid ? ` ${foreTid}` : ''} · ${diagnosAktuell.findings.length ? `${diagnosAktuell.findings.length} fynd` : 'inga påvisade hinder'}`
            : kanOppnaSparatForslag ? 'Ett schemaförslag finns i utkastet.'
              : inaktuelltUnderlag || harPass ? 'Underlaget har ändrats sedan förslaget togs fram.' : 'Inget schemaförslag är beräknat.'}
        primar={issues.length ? <Button type="button" onClick={() => oppnaForbered({ omrade: 'regler' })}>Rätta villkoren</Button>
          : aktuelltProvhinder ? <Button type="button" onClick={() => provhinderRubrik.current?.focus()}>Se vad som stoppade beräkningen</Button>
            : kanOppnaSparatForslag && !busy ? <Button type="button" onClick={() => valjYta('schema')}><CalendarDaysIcon aria-hidden="true"/>Öppna schemat</Button>
              : nyttForberedForslag}
        alternativ={<>
          <Button type="button" variant="outline" disabled={forberedUpptagen || issues.length > 0} onClick={() => void kontrolleraUnderlag()}>Kontrollera underlaget</Button>
          <Popover open={forberedBerakningsvalOppet} onOpenChange={setForberedBerakningsvalOppet}>
            <PopoverTrigger render={<Button type="button" variant="ghost"/>}><SlidersHorizontalIcon aria-hidden="true"/>Beräkningsval</PopoverTrigger>
            <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
              <PopoverHeader><PopoverTitle>Beräkningsval</PopoverTitle></PopoverHeader>
              <label className="grid gap-1.5 text-sm font-medium">Räknetid per omgång
                <select className="min-h-(--control-height) rounded-md border border-input bg-background px-2" value={solveTimeMs} disabled={busy || checking}
                  onChange={e => setSolveTimeMs(Number(e.target.value) as SchemaSolveTimeMs)}>
                  {SCHEMA_SOLVE_TIMES.map(ms => <option key={ms} value={ms}>{ms / 1000} sekunder</option>)}
                </select>
              </label>
              {(kanOppnaSparatForslag || aktuelltProvhinder) && <div className="mt-2 space-y-2">
                <p className="text-sm text-muted-foreground">Ett nytt förslag räknar om passens placeringar.</p>
                {!busy && nyttForberedForslag}
              </div>}
            </PopoverContent>
          </Popover>
        </>}
        uppgifter={forberedUppgifter}
        genvagar={{
          salar: villkor.salregister?.salar.length ? forberedSalar.map(rad => ({ ref: rad.ref, namn: [rad.title, rad.grupp].filter(Boolean).join(' · ') })).sort((a, b) => a.namn.localeCompare(b.namn, 'sv')) : [],
          larartider: (forutsattningar?.resurser.larare ?? []).map(larare => ({ ref: larare.ref, namn: larare.name })).sort((a, b) => a.namn.localeCompare(b.namn, 'sv', { numeric: true })),
          aktiviteter: forberedBokningar.map(bokning => ({ ref: bokning.id, namn: [bokning.namn, provNamn(bokning), schemaDateText(bokning.datum), clock(bokning.startMin)].join(' · ') })),
        }}
        onOppna={oppnaForbered}/>
      {meddelanden}
    </>}
    </fieldset>
    {visaForbered && <ForberedOmradesval grupp={forberedGrupp} onGrupp={grupp => { setForberedGrupp(grupp); setForberedMal(null); }}/>}
    {visaForbered && <Omrade id="underlag" titel="Underlag" hidden={doljForbered('underlag')} genomgang={omradesgenomgang('underlag')}>
        <div className="rounded-lg border border-border bg-card p-4 space-y-3" data-underlag={forutsattningar ? 'last' : underlagLas.error ? 'fel' : 'laser'}>
          {underlagLas.error && <div className="flex flex-wrap items-center gap-3"><output>{underlagLas.error}</output><Button type="button" variant="outline" onClick={underlagLas.reload}>Läs underlaget igen</Button></div>}
          {!forutsattningar && !underlagLas.error && <output className="schema-note">{issues.length ? 'Underlaget läses när felen i villkoren är rättade.' : 'Läser underlaget…'}</output>}
          {forutsattningar && <>
            <p>{forutsattningar.fordelning.length} undervisningar, {forutsattningar.resurser.klass.length} klasser, {forutsattningar.resurser.grupp.length} grupper och {forutsattningar.resurser.larare.length} lärare är lästa. Med de här villkoren blir det {forutsattningar.lessons.length} pass per vecka. {forslag ? '' : 'Inget schemaförslag är beräknat.'}</p>
            <p className="schema-note">{forutsattningar.basis ? `Underlag: tjänstefördelning version ${forutsattningar.basis.versionNo} (${BASIS[forutsattningar.basis.status] ?? forutsattningar.basis.status}).` : 'Skolan har ingen tjänstefördelning för läsåret; bara behoven är underlag.'}{underlagLas.loading ? ' Läser om efter ändrade villkor…' : ''}</p>
          </>}
        </div>
        {forslag && !inaktuelltUnderlag && <Underlag forslag={forslag}/>}
    </Omrade>}
    <fieldset className="contents" disabled={redigeringStoppad}>
    {visaForbered && <>
      <Omrade id="lektioner" titel="Lektioner och block" hidden={doljForbered('lektioner')} genomgang={omradesgenomgang('lektioner')}>
        {forutsattningar && forutsattningar.fordelning.length > 0 ? <details className="rounded-lg border border-border bg-card p-3"><summary className="cursor-pointer font-medium">Antal lektioner per undervisning</summary><Fordelning forslag={forutsattningar} villkor={villkor} kontroll={forslag && !inaktuelltUnderlag ? kontroll : null} disabled={busy || checking} onChange={andraArbetsvillkor}/></details>
          : <p className="empty-state">Undervisningarna visas när underlaget är läst.</p>}
        <Samtidighetsblock villkor={villkor} kalla={forutsattningar} disabled={busy || checking} onChange={andraArbetsvillkor}/>
      </Omrade>
      <Omrade id="salar" titel="Salar" hidden={doljForbered('salar')} genomgang={omradesgenomgang('salar')}>
      {!fonster && <Salar villkor={villkor} kalla={forutsattningar} disabled={busy || checking} onChange={andraArbetsvillkor} skola={skolsalar}
        mal={forberedMal?.omrade === 'salar' ? valtForberedObjekt : null}
        besked={issues.length ? 'Rätta felen i villkoren för att läsa undervisningarna från underlaget.' : underlagLas.error ?? 'Läser undervisningarna från underlaget…'}/>}
      </Omrade>
      <Omrade id="larartider" titel="Lärartider och fasta tider" hidden={doljForbered('larartider')} genomgang={omradesgenomgang('larartider')}>
        {forutsattningar ? <details open={larartabellOppet} onToggle={e => setLarartabellOppet(e.currentTarget.open)} className="rounded-lg border border-border bg-card p-3"><summary className="cursor-pointer font-medium">Villkor i tabell</summary>
          <Villkorstabell villkor={villkor} setVillkor={setTabellVillkor} dispatch={dispatch} forslag={forutsattningar} kontroll={forslag && !inaktuelltUnderlag ? kontroll : null} disabled={busy || checking} mal={larartidsmal}/></details>
          : <p className="empty-state">Lärarna visas när underlaget är läst.</p>}
      </Omrade>
      <Omrade id="aktiviteter" titel="Aktiviteter och nationella prov" hidden={doljForbered('aktiviteter')} genomgang={omradesgenomgang('aktiviteter')}>
        {provunderlag?.gallerGymnasiet === false ? <p className="schema-note">Provplanen gäller gymnasieskolan.</p> : <NationellaProv schoolYear={schoolYear} forslag={forutsattningar} document={nationellaProv.document}
          mal={forberedMal?.omrade === 'aktiviteter' ? valtForberedObjekt : null}
          deltagare={provunderlag?.deltagare ?? []} salar={provunderlag?.salar ?? []} vakter={provunderlag?.vakter ?? []} bokningsfel={provbokningsfel}
          skoldagar={provunderlag?.skoldagar} reading={nationellaProv.reading} saving={nationellaProv.saving} disabled={nationellaProv.readFailed}
          error={nationellaProv.error} onSave={nationellaProv.onSave} onReload={nationellaProv.onReload}/>}
        <h3 className="font-semibold">Återkommande aktiviteter</h3>
        {forutsattningar ? aktivitetsvy(forutsattningar) : <p className="empty-state">Aktiviteter kan läggas till när underlaget är läst.</p>}
      </Omrade>
    </>}
    {visaSchema && meddelanden}

    {!fonster && visaSchema && forslag && fortsatt && <FortsattGranskning search={fortsatt} forslag={forslag} stale={fortsatt.key !== continueInputKey} checking={checking}
      onApply={() => void anvandFortsatt()} onClose={behallNuvarande}/>}

    {!visaGranska && forslag && sokning && <Placeringsforslag search={sokning} forslag={forslag} stale={placementInputKey !== sokning.inputKey} checking={checking || busy}
      onDepth={depth => void sokPlacering({ mode: sokning.request.mode, lesson: sokning.request.lesson, target: sokning.request.target, depth })} onApply={(index, key) => void genomforPlacering(index, key)} onClose={stangPlacering}>
      {villkorsSokning && villkorsSokning.key === sokning.key && <Villkorsforslag search={villkorsSokning} forslag={forslag} stale={placementInputKey !== villkorsSokning.inputKey} disabled={busy || checking} onApply={(i, key) => void genomforVillkorsforslag(i, key)}/>}
    </Placeringsforslag>}
    {forslag && visaSchema && <>
      {fonster && ['larare', 'sal', 'elev'].includes(fonster.view) && <ResursFonster intentional={intentionalPass} forslag={forslag} villkor={provade} placements={placeringar} layers={utkast.layers} term={viewTerm} picked={picked} slag={fonster.view === 'larare' ? 'larare' : fonster.view === 'sal' ? 'sal' : 'elev'} initialResource={fonster.resource} onPick={id => { const l = forslag.lessons.find(x => x.id === id); if (l) pick(l); }} onLayer={(layer, on) => dispatch({ type: 'layer', layer, on })} onSessionLost={onSessionLost} onTerm={setShownTerm}/>}
      {fonster?.view === 'viloyta' && <Viloyta restRef={rest} lessons={unplaced} forslag={forslag} over={false} dragging={null} disabled={checking} termTag={termTag} onGrab={grab} onPick={pick} onFollow={foljPass} onSuggest={lesson => void sokPlacering({ mode: 'lesson', lesson, target: null, depth: 1 })} onSuggestAll={() => void sokPlacering({ mode: 'rest', lesson: null, target: null, depth: 1 })}/>}
      {fonster?.view === 'vecka' && resourceMissing && <div className="empty-state space-y-3"><p>Resursen i arbetsvyn finns inte i det här underlaget. Välj vilket schema du vill visa.</p><VeckoResursval resources={options} onSelect={valjVeckoresurs}/></div>}
      {visaHuvudvy && <>
        {(arbetsvy === 'vecka' || arbetsvy === 'pass') && <VeckaVal forslag={forslag} term={viewTerm} value={visning}
          terminsval={arbetsvy === 'vecka' && byTerm && <fieldset className="schema-datumval-termin"><legend className="sr-only">Visa termin</legend>
            {forslag.time.terms.map(t => <Button key={t.term} type="button" variant={!jamforVecka && viewTerm === t.term ? 'secondary' : 'outline'} aria-pressed={!jamforVecka && viewTerm === t.term} onClick={() => { setJamforTerminer(false); setShownTerm(t.term); }}>{TERM[t.term]}</Button>)}
            {kanJamforaTerminer && datumVal.mode === 'grundschema' && <Button type="button" variant={jamforVecka ? 'secondary' : 'outline'} aria-pressed={jamforVecka} onClick={() => setJamforTerminer(on => !on)}>Jämför HT och VT</Button>}
          </fieldset>}
          onChange={value => { setJamforTerminer(false); setVisning(value); dispatch({ type: 'pick', lesson: null }); }}/>}
        {/* Vyväljaren (05.2-SM-PASSTABELL): veckan och tabellerna visar samma utkast. Ångra, flyttpanelen och Följ passet är gemensamma. */}
        <Vyval utlyft={!!fonster} vy={vy} onVy={setVy} villkor={villkorsvy} samling={samlingsvy} folj={foljvy} valtPass={jamforVecka ? undefined : valtPass}
          veckaVal={<VeckoResursval resources={options} selected={selected} onSelect={valjVeckoresurs}/>}
          veckaVerktyg={<>
            {lasGrupper && <output className="schema-note">Läser undervisningsgruppens pass…</output>}
            {selected?.slag === 'grupp' && gruppunderlag?.groups === null && <div className="flex flex-wrap items-center gap-2">
              <output className="schema-note">Visar gruppens pass från utkastet. Hela gruppens schema kunde inte läsas.</output>
              <Button type="button" variant="outline" onClick={() => setVeckansGruppunderlag(null)}>Läs gruppen igen</Button>
            </div>}
            {!fonster && bokatProvIDatumvy && <section aria-label="Nationella prov i datumvyn" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
              <p className="schema-note max-w-prose">{sparatProvAktuellt ? 'Provförslaget finns i den här versionen av schemautkastet.'
                : bokatProvIDatumvy.salId && (!personalLookup || bokatProvIDatumvy.vakter.length) ? 'Granska provets resurser och undervisningen i det här utkastet.'
                  : 'Lägg in provförslaget för att tilldela provresurser och flytta undervisningen som krockar.'}</p>
              <Button type="button" variant="outline" onClick={() => visaProvforslag(bokatProvIDatumvy.id)}>Öppna provförslag</Button>
            </section>}
            {jamforVecka ? <p className="schema-note">Välj ett pass för att öppna det i sin terminsvy.</p> :
          <div className="schema-verktygsrad">{datumVal.mode === 'grundschema' ? meny.verktyg : <p className="schema-note">Välj ett tillfälle för att ändra just den dagens lektion.</p>}
            <Lagerval layers={utkast.layers} onChange={(layer, on) => { dispatch({ type: 'layer', layer, on }); rememberLager({ ...utkast.layers, [layer]: on }); }}/></div>}
        </>} vecka={jamforVecka ? <Terminsjamforelse days={forslag.days} lessons={resursPass} length={shownMin} detail={detail} extra={passRader}
          picked={picked} flagged={markerade} locked={l => fastAktivitet(l, provade) || !!utkast.locked[l.id]} disabled={busy || checking} onOpen={oppnaJamfortPass}/> : <>
          <div className="schema-folj-lyssnare" {...(datumVal.mode === 'grundschema' ? foljHandelser : {})}>
          <div className="schema-vecka-rad">{(datumVal.mode === 'grundschema' ? meny.wrap : (node: ReactNode) => node)(<Vecka gridRef={week} days={forslag.days} lessons={shown} picked={picked} drop={drop && dragged ? { ...drop, length: dragged.durationMin } : null} flagged={markerade} disabled={checking}
            pickedOccurrence={reviewOccurrence?.key} locked={l => fastAktivitet(l, provade) || !!utkast.locked[l.id]}
            length={shownMin} detail={detail} extra={passRader} onGrab={grab} onPick={meny.onPick}
            overlays={[...(lager?.overlays ?? []), ...bytLagen.overlays]} bands={lager?.bands} dimmed={lager?.dimmed} falt={falt} namn={NAMN} {...meny.veckaProps}
            datum={{ forslag, overrides: datedOverrides, matches: valdResurs }} prov={veckansProv} onOccurrence={valjDatum} kalender={forslag.time.calendar} visning={datumVal} trims={forslag.trims} classId={selected?.slag === 'klass' || selected?.slag === 'grupp' ? selected.id : null}/>)}{meny.panel}</div>
          </div>
          <output aria-live="polite" className="schema-note schema-drag-status">{drop ? bytLagen.loading ? 'Läser möjliga starttider…' : bytLagen.error ?? bytLagen.status(drop.to ?? target) : ''}</output>
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
        {arbetsvy === 'vecka' && !jamforVecka && <>
          <div className="schema-folj-lyssnare" {...foljHandelser}>
          <Viloyta restRef={rest} lessons={unplaced} forslag={forslag} over={drop?.to?.day === null} dragging={drop?.lesson ?? null} disabled={checking} termTag={termTag} onGrab={grab} onPick={pick} onFollow={foljPass} onSuggest={lesson => void sokPlacering({ mode: 'lesson', lesson, target: null, depth: 1 })} onSuggestAll={() => void sokPlacering({ mode: 'rest', lesson: null, target: null, depth: 1 })} onOpen={() => synk.open({ view: 'viloyta' })}/>
          </div>
        </>}
      </>}

      {!visaHuvudvy && valtPass}
      <output aria-live="polite" className="schema-note">{checking ? 'Schemat kontrolleras mot reglerna.' : moved}</output>
      <section className="schema-kontroller" aria-labelledby={fonster ? undefined : resultHeading}>
        {fonster ? null : <h2 id={resultHeading} ref={kontrollrubrik} tabIndex={-1} className="section-heading">Kontroller och underlag</h2>}
        <div className="schema-summary">
          {inaktuelltUnderlag && <p>Kontrollerna nedan gäller det sparade förslaget för {PERIOD[forslag.period].toLocaleLowerCase('sv-SE')}.</p>}
          {forslag.metrics.lessons > 0 && <Lagesstatus lessons={passMedSal}/>}
          {forslag.metrics.lessons > 0 && <span className={`status-badge ${off ? 'warning' : forslag.villkor.timeBasis === 'lasar' && forslag.period !== 'lasar' ? '' : 'success'}`}>{off ? `Avviker från timplanen · ${off}` : forslag.villkor.timeBasis === 'lasar' && forslag.period !== 'lasar' ? 'Årsberäknad terminsdel' : 'Tiden följer timplanen'}</span>}
          {steps > 0 && <span className="status-badge warning">Ändrat för hand · {steps} {steps === 1 ? 'flytt' : 'flyttar'}</span>}
          {kontroll && kontroll.total > 0 && <span className="status-badge warning">{kontroll.total} {kontroll.total === 1 ? 'regelavvikelse' : 'regelavvikelser'}</span>}
          {egnaSyns > 0 && <span className="status-badge">{egnaSyns} {egnaSyns === 1 ? 'eget villkor syns' : 'egna villkor syns'} i veckan</span>}
          {inaktuelltUnderlag ? <p>{forslag.metrics.lessons ? `${forslag.metrics.placed} av ${forslag.metrics.lessons} pass har fått en tid.` : 'Det sparade förslaget innehåller inga pass.'}</p>
            : <>
              <p>{PERIOD[forslag.period]}. {forslag.metrics.placed} av {forslag.metrics.lessons} pass har fått en tid.</p>
              {forslag.status === 'time_limit' && <p className="schema-note">Motorn slutade söka när omgångens räknetid var slut. Det betyder inte att schemat är omöjligt. Välj längre räknetid och Fortsätt förbättra för att arbeta vidare från de placeringar som finns.</p>}
              <p className="schema-note">{forslag.basis ? `Underlag: tjänstefördelning version ${forslag.basis.versionNo} (${BASIS[forslag.basis.status] ?? forslag.basis.status}).` : 'Skolan har ingen tjänstefördelning för läsåret; bara behoven är underlag.'}
                {forslag.time.source === 'kalender'
                  ? ` Tid: ${forslag.time.schoolDays} skoldagar${forslag.time.terms.length > 1 ? ` (${forslag.time.terms.map(t => `${t.term.toUpperCase()} ${t.schoolDays}`).join(', ')})` : ''} enligt läsårskalendern version ${forslag.time.version} (${CALENDAR[forslag.time.status ?? ''] ?? forslag.time.status}${forslag.time.current ? ', gällande' : ''}).`
                  : ` Läsårskalender saknas för läsåret: ${forslag.time.weeks} lika veckor har antagits.`}
                {forslag.metrics.placed > 0 && ` Håltid per vecka: elever ${forslag.metrics.studentGapMin} min, lärare ${forslag.metrics.teacherGapMin} min.`}</p>
            </>}
        </div>

        {salsattningsvy}
        {forslag.metrics.lessons > 0 && !fonster && <details className="rounded-lg border border-border bg-card p-3"><summary className="cursor-pointer font-medium">Antal lektioner per undervisning</summary><Fordelning forslag={forslag} villkor={villkor} kontroll={kontroll} disabled={busy || checking} onChange={andraArbetsvillkor}/></details>}
        {datedOverrides.length > 0 && <section className="rounded-lg border border-border bg-card p-4 space-y-2" aria-label="Datumändringar">
          <h2 className="section-heading">{datedOverrides.length} {datedOverrides.length === 1 ? 'ändrat tillfälle' : 'ändrade tillfällen'}</h2>
          <p className="text-sm text-muted-foreground">Datum, tid och sal gäller bara tillfällena. Grundschemat behåller sina placeringar.</p>
          {!datumSvar && <output>Kontrollerar datumändringar…</output>}
          {datumSvar?.violations.map((v, i) => <p key={i} className="text-destructive" role="alert">{v.date}: {v.message}</p>)}
          {datumSvar?.timeChanges.map(t => <p key={`${t.ref}:${t.term}`} className={t.deviation ? 'text-destructive' : ''}>{forslag.teachings.find(x => x.ref === t.ref)?.title}: {PERIOD[t.term]} {t.deltaMin > 0 ? '+' : ''}{t.deltaMin} minuter. {t.plannedMin} av {t.needMin} minuter från timplanen. {t.deviation ? 'Tiden behöver ses över.' : ''}</p>)}
          <ul className="divide-y divide-border">{datedOverrides.map(a => <li key={schemaDatumNyckel(a)} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{forslag.lessons.find(l => l.id === a.lesson)?.title} · {a.originalDate} → {a.date} {clock(a.startMin)}</span><Button type="button" variant="outline" disabled={busy || checking || redigeringStoppad} onClick={() => valjDatum(a)}>Ändra tillfället</Button></li>)}</ul>
        </section>}
        {forslag.villkor.timeBasis !== 'lasar' && !fonster && <section aria-label="Gemensamt läsårsmönster" className="rounded-lg border border-border bg-card p-4 space-y-2">
          <h2 className="section-heading">Gemensamt läsårsmönster</h2>
          <p>Det här utkastet räknades med separata terminstider. Ett nytt förslag räknar ämnenas tid över hela läsåret och behåller samma veckomönster på hösten och våren när undervisningen och lärarna är desamma.</p>
          <p className="schema-note">Det sparade utkastet ligger kvar tills ett nytt förslag är framtaget.</p>
          <Button type="button" variant="outline" disabled={busy || checking || issues.length > 0 || !spara.ready} onClick={() => void run(Boolean(recoveryFore?.findings.length), recoveryLocks)}>
            {recoveryLocks ? `Lås upp ${aktivaLas.length} pass och ta fram läsårsmönster` : 'Ta fram gemensamt läsårsmönster'}
          </Button>
        </section>}
        {(!fonster || fonster.view === 'avvikelser') && <Regelavvikelser kontroll={kontroll} onOpen={() => synk.open({ view: 'avvikelser' })} intentional={intentionalKeys} onIntent={markeraMedveten} disabled={busy || checking || villkorKey !== provadeKey}/>}
        {fonster?.view === 'avvikelser' && !kontroll && <p className="empty-state">Kontrollen körs när förslaget ändras. Inga kontrollresultat finns ännu.</p>}
        {!fonster && <><Forklaring diagnoses={forslag.diagnoses}/>
        <SvarastAttLagga statistics={forslag.statistics} onFollow={foljPass} onCondition={diagnosVillkor}/></>}
        {(!fonster || fonster.view === 'tid' || fonster.view === 'veckor') && <Tid forslag={forslag} deviating={deviating} off={off} mode={fonster?.view === 'veckor' ? 'veckor' : fonster?.view === 'tid' ? 'tid' : 'all'} onOpen={() => synk.open({ view: 'tid' })} onOpenWeeks={() => synk.open({ view: 'veckor' })}/>}
        {!fonster && <>{inaktuelltUnderlag ? <details className="rounded-lg border border-border bg-card p-3"><summary className="cursor-pointer font-medium">Underlag för det sparade förslaget</summary><Underlag forslag={forslag}/></details>
          : <Underlag forslag={forslag}/>}
          {aktivitetsvy(forslag)}</>}
      </section>
    </>}
    {/* Villkoren ligger på samma plats i båda ytorna, så att dess öppna läge och pågående val finns kvar när ytan byts. */}
    {!fonster && !visaGranska && <section id={visaForbered ? forberedAnkare('regler') : undefined} aria-labelledby={visaForbered ? `${forberedAnkare('regler')}-rubrik` : undefined} className={visaForbered ? 'space-y-3 scroll-mt-20' : 'contents'} data-omrade={visaForbered ? 'regler' : undefined} hidden={visaForbered && doljForbered('regler')}>
      {visaForbered && <div className="section-heading"><h2 id={`${forberedAnkare('regler')}-rubrik`} tabIndex={-1}>Regler och önskemål</h2></div>}
      {visaForbered && omradesgenomgang('regler')}
      {villkorsform}
    </section>}
    {visaForbered && <>
      <Omrade id="mal" titel="Mål för schemat" hidden={doljForbered('mal')} genomgang={omradesgenomgang('mal')}>
        <p className="schema-note">Klockslaget för sena pass ändras under Regler och önskemål.</p>
      </Omrade>
    </>}
    </fieldset>
  </section>;
}
