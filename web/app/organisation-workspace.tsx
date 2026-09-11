'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCheck,
  CircleCheck,
  Database,
  Download,
  ExternalLink,
  FileCheck2,
  GraduationCap,
  History,
  Info,
  MessageSquareText,
  Paperclip,
  Plus,
  School,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { listPrograms, snapshotInfo } from '@/lib/syllabus.ts';
import PrincipalPicker from './principal-picker';
import { addressText } from '@/lib/registry-address.ts';
import TimplanClasses from './timplan-classes';
import { copyCohort, cohortYear, type ClassTimplan } from '@/lib/cohort-model.ts';
import { copyCohortInDatabase, loadClassTimplans, saveClassTimplan, deleteClassTimplan } from '@/lib/cohort-store.ts';
import { today } from '@/lib/common.ts';
import {
  createOrganisationState,
  schoolTypeNames,
  appointPrincipal,
  activeUnit,
  unitOfferings,
  unitStaff,
  unitsForRole,
  assignUnit,
  selectUnit,
  addUnitFromRegistry,
  removeUnit,
  applyRegistryUnit,
  setGrades,
  suggestOfferings,
  addOffering,
  updateOffering,
  removeOffering,
  addPermit,
  removePermit,
  permitStatus,
  registryComparison,
  registryStatusName,
  createPointPlan,
  togglePick,
  approvePointPlan,
  addPointPlanComment,
  pointPlanBlocks,
  pointPlanIssues,
  specializationOptions,
  currentPointPlan,
  openPointPlan,
  offeringTitle,
  studyPathCode,
  roleLabel,
  type Offering,
  type OfferingKind,
  type OrganisationState,
  type Permit,
  type RegistryUnit,
  type Role,
} from '@/lib/organisation-model.ts';
import {
  createTimplanState,
  deriveEducations,
  currentPlan,
  openPlan,
  type TimplanState,
} from '@/lib/timplan-model.ts';
import {
  createLasarState,
  setRole as setLasarRole,
  type LasarState,
} from '@/lib/lasar-model.ts';
import {
  loadTimplans,
  persistTimplans,
  loadSchoolYears,
  persistSchoolYears,
} from '@/lib/planning-store.ts';
import { hasBackend } from '@/lib/supabase.ts';
import {
  loadOrganisation,
  saveUnitFromRegistry,
  savePrincipal,
  updateUnitFromRegistry,
  saveGrades,
  deleteUnit,
  saveOffering,
  updateOfferingRow,
  deleteOffering,
  savePermit,
  deletePermit,
  saveAssignmentUnit,
  savePointPlanDraft,
  savePointPlanPicks,
  savePointPlanEvent,
  decidePointPlan,
} from '@/lib/organisation-store.ts';
import TimplanView, { StatusPill, type Blocked } from './timplan-view';
import LasarView, { type ScheduleSource } from './lasar-view';

export type OrganisationView = 'unit' | 'offerings' | 'pointplans' | 'timplan' | 'lasar';

const num = (n: number) => n.toLocaleString('sv-SE');
const titles: Record<OrganisationView, { title: string; sub: string; index: string }> = {
  unit: { title: 'Skolenheter', sub: 'Huvudmannens skolor: vilka de är, vilka skolformer och vilket register.', index: '01' },
  offerings: { title: 'Utbildningar', sub: 'Vilka studievägar skolenheten har, med tillstånd och kull.', index: '02' },
  pointplans: { title: 'Poängplaner', sub: 'Nationella block ur katalogen. Programfördjupningen väljs här.', index: '03' },
  timplan: { title: 'Timplaner', sub: 'Rektorn föreslår timmarna. Huvudmannen fastställer dem.', index: '04' },
  lasar: { title: 'Läsår och skoldagar', sub: 'Vilka dagar som är skoldagar, lov och studiedagar, och hur mycket undervisning de rymmer.', index: '05' },
};
const kindLabel: Record<OfferingKind, string> = {
  grundskola: 'Grundskola',
  gymnasium: 'Nationellt program',
  introduktionsprogram: 'Introduktionsprogram',
};
const offeringStatusLabel = { planerad: 'Planerad', aktiv: 'Aktiv', avvecklas: 'Avvecklas' } as const;

const emptyPermit = (): Omit<Permit, 'id'> => ({
  issuer: 'Skolinspektionen',
  reference: '',
  decided: '',
  validFrom: '',
  validTo: '',
  scope: '',
});

type Candidate = { code: string; name: string; status: string };
type LookupResult = {
  error?: string;
  unit?: RegistryUnit;
  units?: Candidate[];
  organizer?: { name: string; organizationNumber: string; type: string };
  source: string;
};

export default function OrganisationWorkspace({
  view,
  role,
  schedule,
  preview: groundExample = false,
  onPreview,
}: {
  view: OrganisationView;
  role: Role;
  schedule?: ScheduleSource;
  preview?: boolean;
  onPreview: () => void;
}) {
  const backend = hasBackend && !groundExample;
  const initialOrganisation = () => {
    const initial = createOrganisationState();
    return groundExample ? {...initial, units:initial.units.map(u=>({...u,schoolTypes:u.schoolTypes.filter(t=>t.code==='GR')})),offerings:initial.offerings.filter(o=>o.kind==='grundskola')} : initial;
  };
  const [copyYear,setCopyYear] = useState<number | null>(null);
  const [copyBusy,setCopyBusy] = useState(false);
  const copyPending = useRef(false);
  const [bindings,setBindings] = useState<ClassTimplan[]>([]);
  const [bindingsUnit,setBindingsUnit] = useState('');
  const [org, setOrg] = useState<OrganisationState | null>(backend ? null : initialOrganisation);
  const [loading, setLoading] = useState(backend);
  const [saving, setSaving] = useState(false);
  const [tp, setTp] = useState<{ plans: TimplanState['plans'] }>(() => ({
    plans: backend ? [] : createTimplanState(initialOrganisation()).plans,
  }));
  // Läsårets dagar ändras per skolenhet i sessionen; exemplet seedas per enhet
  // eftersom skolenheterna kommer ur databasen och inte har en fast kod.
  const [lyByUnit, setLyByUnit] = useState<Record<string, LasarState['years']>>({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [offeringId, setOfferingId] = useState('sa25');
  const [planId, setPlanId] = useState<string | null>(null);

  // Skolenheter: uppslag i registret, för uppdatering och för ny skolenhet.
  const [lookupCode, setLookupCode] = useState('');
  const [lookupMode,setLookupMode] = useState<'organizer'|'unit'>('organizer');
  const [principalChoice,setPrincipalChoice] = useState('');
  const [principalName,setPrincipalName] = useState('');
  const [appointing,setAppointing] = useState(false);
  const [importBusy,setImportBusy] = useState(false);
  const importPending = useRef(false);
  const lookupGeneration = useRef(0);
  const [lookupOrganizer, setLookupOrganizer] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidatesFor, setCandidatesFor] = useState('');
  const [preview, setPreview] = useState<{ unit: RegistryUnit; source: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [suggested, setSuggested] = useState<{ unitId: string; picks: Record<string, { on: boolean; orientation: string; cohort: string }> } | null>(null);

  // Utbildningar: nytt och tillstånd.
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ kind: 'gymnasium' as OfferingKind, programCode: 'SA25', orientationCode: 'SASAP', name: '', localCode: '', cohort: 'Elever som börjar HT 2027' });
  const [permitDraft, setPermitDraft] = useState(emptyPermit);
  const [permitFor, setPermitFor] = useState<string | null>(null);

  // Poängplan: beslut och kommentar.
  const [decision, setDecision] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!backend) return;
    let alive = true;
    loadOrganisation(20)
      .then((state) => alive && setOrg(state))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Kunde inte läsa från databasen.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [backend]);

  const lasarUnitId = org ? activeUnit(org).id : '';
  const bindingsLoading = backend && bindingsUnit !== lasarUnitId;
  const lasarUnitTypes = org ? activeUnit(org).schoolTypes.map((t) => t.code).join(',') : '';
  const seededYears = useMemo(
    () => (backend || !lasarUnitId ? [] : createLasarState(lasarUnitId, lasarUnitTypes.split(',').filter(Boolean)).years),
    [backend, lasarUnitId, lasarUnitTypes],
  );

  // Timplanerna hör till utbildningarna och läsåren till skolenheten, så båda
  // läses när grunden är på plats. Utan backend ligger de kvar i sessionen.
  useEffect(() => {
    if (!backend || !org) return;
    let alive = true;
    loadTimplans(deriveEducations(org))
      .then((plans) => alive && setTp({ plans }))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Kunde inte läsa timplaner.'));
    return () => {
      alive = false;
    };
  }, [backend, org]);
  useEffect(() => {
    if (!backend || !lasarUnitId) return;
    let alive = true;
    loadSchoolYears(lasarUnitId, lasarUnitTypes.split(',').filter(Boolean))
      .then((years) => alive && setLyByUnit((prev) => ({ ...prev, [lasarUnitId]: years })))
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Kunde inte läsa läsår.'));
    return () => {
      alive = false;
    };
  }, [backend, lasarUnitId, lasarUnitTypes]);

  useEffect(() => {
    if (!backend || !lasarUnitId) return;
    let alive=true;
    loadClassTimplans(lasarUnitId).then(rows=>{if(alive)setBindings(rows);})
      .catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setBindingsUnit(lasarUnitId);});
    return ()=>{alive=false;};
  },[backend,lasarUnitId]);

  if (loading || !org)
    return (
      <div className="admin-workspace">
        <div className="admin-empty og-loading">
          <Database size={28} />
          <h2>{loading ? 'Läser huvudmannens uppgifter…' : 'Kunde inte läsa från databasen'}</h2>
          <p>{loading ? 'Skolenheter, utbildningar och beslut hämtas från databasen.' : error}</p>
        </div>
      </div>
    );

  const unit = activeUnit(org);
  const offerings = unitOfferings(org, unit.id);
  const timplanRole: 'rektor' | 'huvudman' = role === 'huvudman' ? 'huvudman' : 'rektor';
  const allEducations = deriveEducations(org);
  const tpState: TimplanState = {
    role: timplanRole,
    educations: allEducations.filter((e) => offerings.some((o) => o.id === e.id)),
    plans: tp.plans,
  };
  const lasarState: LasarState = setLasarRole({ role: 'rektor', years: lyByUnit[unit.id] ?? seededYears }, timplanRole);
  const blocked: Blocked[] = offerings
    .filter((o) => !allEducations.some((e) => e.id === o.id))
    .map((o) => ({ id: o.id, name: offeringTitle(o), reason: openPointPlan(o) ? 'Poängplanen är ett utkast; fastställ den först.' : 'Poängplan saknas.' }));

  /** Ändring som bara gäller gränssnittet, till exempel vald skolenhet. */
  function run(fn: (s: OrganisationState) => OrganisationState, message?: string) {
    if (!org) return false;
    try {
      setOrg(fn(org));
      setError('');
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ändringen kunde inte genomföras.');
      return false;
    }
  }

  /**
   * Ändring som ska bestå: modellen prövar den först, databasen skriver den,
   * och resultatet läses tillbaka. Utan backend stannar den i sessionen.
   */
  async function persist(
    validate: (s: OrganisationState) => OrganisationState,
    save: (next: OrganisationState) => Promise<unknown>,
    message?: string,
  ) {
    if (!org) return false;
    let next: OrganisationState;
    try {
      next = validate(org);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ändringen kunde inte genomföras.');
      return false;
    }
    setOrg(next);
    setError('');
    if (!backend) {
      if (message) setNotice(message);
      return true;
    }
    setSaving(true);
    try {
      await save(next);
      const fresh = await loadOrganisation(20);
      setOrg(current => ({...fresh, activeUnitId:fresh.units.some(u=>u.id===current?.activeUnitId) ? current!.activeUnitId : fresh.activeUnitId}));
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ändringen kunde inte sparas.');
      // Läs tillbaka det som faktiskt står i databasen.
      try {
        const fresh = await loadOrganisation(20);
      setOrg(current => ({...fresh, activeUnitId:fresh.units.some(u=>u.id===current?.activeUnitId) ? current!.activeUnitId : fresh.activeUnitId}));
      } catch {
        setOrg(org);
      }
      return false;
    } finally {
      setSaving(false);
    }
  }
  /**
   * Timplaner och läsår följer samma väg som huvudmannens grund: modellen
   * prövar ändringen, gränssnittet visar den direkt, databasen får skillnaden,
   * och misslyckas skrivningen läses tillståndet tillbaka ur databasen.
   */
  function runLasar(fn: (s: LasarState) => LasarState, message?: string) {
    const before = lasarState.years;
    let next: LasarState;
    try {
      next = fn(lasarState);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ändringen kunde inte genomföras.');
      return false;
    }
    setLyByUnit((prev) => ({ ...prev, [unit.id]: next.years }));
    setError('');
    if (message) setNotice(message);
    if (!backend) return true;
    const unitId = unit.id;
    const types = unit.schoolTypes.map((t) => t.code);
    void (async () => {
      setSaving(true);
      try {
        await persistSchoolYears(next.years, before, unitId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Läsåret kunde inte sparas.');
      }
      try {
        const fresh = await loadSchoolYears(unitId, types);
        setLyByUnit((prev) => ({ ...prev, [unitId]: fresh }));
      } catch {
        /* Läsningen misslyckades också; felet ovan står kvar. */
      }
      setSaving(false);
    })();
    return true;
  }
  function runTimplan(fn: (s: TimplanState) => TimplanState, message?: string) {
    const before = tp.plans;
    let next: TimplanState;
    try {
      next = fn({ ...tpState, educations: allEducations });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ändringen kunde inte genomföras.');
      return false;
    }
    setTp({ plans: next.plans });
    setError('');
    if (message) setNotice(message);
    if (!backend || !org) return true;
    const educations = deriveEducations(org);
    void (async () => {
      setSaving(true);
      try {
        await persistTimplans(next.plans, before);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Timplanen kunde inte sparas.');
      }
      try {
        setTp({ plans: await loadTimplans(educations) });
      } catch {
        /* Läsningen misslyckades också; felet ovan står kvar. */
      }
      setSaving(false);
    })();
    return true;
  }

  async function lookup(params: string) {
    const generation=++lookupGeneration.current;
    setPreview(null);
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/skolenhet?${params}`);
      const payload = (await response.json()) as LookupResult;
      if (generation!==lookupGeneration.current)return;
      if (!response.ok || payload.error) throw new Error(payload.error ?? `Registret svarade ${response.status}.`);
      if (payload.unit) {
        setPreview({ unit: payload.unit, source: payload.source });
      } else if (payload.units) {
        setCandidates(payload.units);
        setCandidatesFor(payload.organizer ? `${payload.organizer.name} (${payload.organizer.organizationNumber})` : 'vald huvudman');
        setPreview(null);
        if (!payload.units.length) setError('Inga skolenheter hittades.');
      }
    } catch (e) {
      if(generation===lookupGeneration.current)setError(e instanceof Error ? e.message : 'Registret kunde inte nås.');
    } finally {
      if(generation===lookupGeneration.current)setBusy(false);
    }
  }
  function resetLookup() {
    lookupGeneration.current++;
    setBusy(false);
    setPrincipalChoice('');setPrincipalName('');
    setPreview(null);
    setCandidates([]);
    setCandidatesFor('');
    setLookupCode('');setLookupOrganizer('');setLookupMode('organizer');
  }
  async function addUnit() {
    if (!preview || !org || importPending.current) return;
    const registry=preview.unit;
    importPending.current=true;setImportBusy(true);setError('');
    try {
      let next=addUnitFromRegistry(org,role,registry,preview.source);
      if(principalChoice)next=appointPrincipal(next,role,registry.code,principalChoice==='new'?undefined:principalChoice,principalName);
      if(backend){
        const id=await saveUnitFromRegistry(next.units.find(u=>u.code===registry.code)!,registry,preview.source,principalChoice&&principalChoice!=='new'?principalChoice:undefined,principalChoice==='new'?principalName:undefined);
        const fresh=await loadOrganisation(20);setOrg({...fresh,activeUnitId:id});
      } else setOrg(next);
      const picks: Record<string,{on:boolean;orientation:string;cohort:string}>={};
      for(const s of suggestOfferings(next,registry.code))picks[s.programCode??s.kind]={on:s.inCatalog,orientation:s.orientations[0]?.code??'',cohort:s.kind==='gymnasium'?'Elever som börjar HT 2027':'Läsåret 2027/28'};
      setSuggested({unitId:registry.code,picks});setPreview(null);setCandidates([]);
      setNotice(`${registry.name} är tillagd. Skoltyper och adress har hämtats från registret.`);
    } catch(e){setError(e instanceof Error?e.message:'Skolenheten kunde inte sparas.');}
    finally{importPending.current=false;setImportBusy(false);}
  }
  async function createSuggested() {
    if (!suggested || !org) return;
    const unitId = org.units.find((u) => u.code === suggested.unitId)?.id ?? suggested.unitId;
    const wanted = suggestOfferings(org, unitId)
      .filter((s) => s.inCatalog && suggested.picks[s.programCode ?? s.kind]?.on)
      .map((s) => {
        const pick = suggested.picks[s.programCode ?? s.kind];
        return {
          unitId,
          kind: s.kind,
          name: s.kind === 'gymnasium' ? (s.orientations.find((o) => o.code === pick.orientation)?.name ?? s.name) : s.name,
          programCode: s.programCode,
          orientationCode: s.orientations.length ? pick.orientation : undefined,
          cohort: pick.cohort,
        };
      });
    const ok = await persist(
      (s) => wanted.reduce((state, input) => addOffering(state, role, input), s),
      async (next) => {
        for (const input of wanted) {
          const created = next.offerings.find((o) => o.unitId === unitId && o.name === input.name && o.programCode === input.programCode);
          if (created) await saveOffering(created);
        }
      },
      wanted.length
        ? `${wanted.length} utbildning${wanted.length > 1 ? 'ar' : ''} skapad${wanted.length > 1 ? 'e' : ''} som planerade. Tillstånd och poängplaner läggs till per utbildning.`
        : 'Inga utbildningar skapades.',
    );
    if (ok) {
      setSuggested(null);
      setAdding(false);
    }
  }

  const selected = offerings.find((o) => o.id === offeringId) ?? offerings[0];
  const isPrincipal = role === 'huvudman';
  const canShape = role === 'huvudman' || role === 'rektor';
  const comparison = registryComparison(org, unit.id);
  const programs = listPrograms();
  const draftProgram = programs.find((p) => p.code === draft.programCode);

  const lookupForm = (fieldId: string) => (
    <>
      <fieldset className="registry-search-mode" aria-label="Sök skola med">
        <Button variant={lookupMode==='organizer'?'default':'outline'} disabled={busy||importBusy} aria-pressed={lookupMode==='organizer'} onClick={()=>{setLookupMode('organizer');setPreview(null);setCandidates([]);setError('');}}>Organisationsnummer</Button>
        <Button variant={lookupMode==='unit'?'default':'outline'} disabled={busy||importBusy} aria-pressed={lookupMode==='unit'} onClick={()=>{setLookupMode('unit');setPreview(null);setCandidates([]);setError('');}}>Skolenhetskod</Button>
      </fieldset>
      <p className="og-text">{lookupMode==='organizer'?'Ange huvudmannens organisationsnummer och välj sedan en av skolorna.':'Ange skolenhetskoden för att hämta skolan direkt.'}</p>
      <label className="field-label" htmlFor={fieldId}>{lookupMode==='organizer'?'Organisationsnummer':'Skolenhetskod'}</label>
      <form className="og-lookup" onSubmit={e=>{e.preventDefault();const value=lookupMode==='organizer'?lookupOrganizer:lookupCode;if(!busy&&(lookupMode==='organizer'?/^\d{10}$/:/^\d{8}$/).test(value))void lookup(`${lookupMode==='organizer'?'huvudman':'kod'}=${value}`);}}>
        <Input id={fieldId} inputMode="numeric" disabled={busy||importBusy} placeholder={lookupMode==='organizer'?'t.ex. 556357-1248':'8 siffror'} value={lookupMode==='organizer'?lookupOrganizer:lookupCode} onChange={e=>{const value=e.target.value.replace(/\D/g,'');if(lookupMode==='organizer')setLookupOrganizer(value);else setLookupCode(value);setPreview(null);setCandidates([]);setError('');}}/>
        <Button type="submit" disabled={busy||importBusy||!(lookupMode==='organizer'?/^\d{10}$/:/^\d{8}$/).test(lookupMode==='organizer'?lookupOrganizer:lookupCode)}>{busy?'Hämtar…':lookupMode==='organizer'?'Hämta skolor':'Hämta skola'}</Button>
      </form>
      {candidates.length > 0 && (
        <div className="og-candidates">
          {candidatesFor && <p className="cell-secondary">{candidates.length} skolenheter, {candidatesFor}</p>}
          {candidates.slice(0, 60).map((c) => (
            <button key={c.code} disabled={busy||importBusy} onClick={() => { setLookupCode(c.code); void lookup(`kod=${c.code}`); }}>
              <span>{c.name}</span>
              <small>{c.code} · {registryStatusName(c.status)}{org.units.some((u) => u.code === c.code) ? ' · finns redan' : ''}</small>
            </button>
          ))}
          {candidates.length > 60 && <p className="cell-secondary">… och {candidates.length - 60} till. Ange skolenhetskoden direkt.</p>}
        </div>
      )}
      {preview && (
        <div className="og-preview">
          <strong>{preview.unit.name}</strong>
          <span>{preview.unit.code} · {registryStatusName(preview.unit.status)}</span>
          <span>{preview.unit.organizer.name} ({preview.unit.organizer.type === 'ENSKILD' ? 'enskild' : preview.unit.organizer.type.toLocaleLowerCase('sv')})</span>
          <span>Kommun: {preview.unit.municipalityName ?? preview.unit.municipalityCode}</span>
          <span>Adress: {addressText(preview.unit.address)}</span>
          <span>Skoltyp: {preview.unit.schoolTypes.map(t=>schoolTypeNames[t]??t).join(' och ') || 'Saknas i registret'} · hämtas automatiskt</span>
          {Object.entries(preview.unit.programmes).map(([type, list]) => (
            <span key={type}>Program ({type.toUpperCase()}): {list.join(', ')}</span>
          ))}
          <span>Rektor enligt registret: {preview.unit.headMaster ?? 'Ej angiven'}. Huvudmannen utser rektor separat.</span>
          <span>Ändrad i registret {preview.unit.modified ?? '—'}, uttag {preview.unit.extractDate?.slice(0, 10) ?? '—'}</span>
        </div>
      )}
    </>
  );

  const heading = (
    <>
      <div className="admin-heading">
        <div>
          <div className="admin-kicker">
            <span>{roleLabel[role].toLocaleUpperCase('sv')}</span>
            <span className="kicker-line" /> {org.organizer.name.toLocaleUpperCase('sv')}
          </div>
          <h1>
            {titles[view].title}
            <span className="admin-page-number">/{titles[view].index}</span>
          </h1>
          <p>{titles[view].sub}</p>
        </div>
        <div className="admin-heading-actions">
          <Button variant="outline" onClick={onPreview}>{groundExample ? 'Tillbaka till mina skolor' : 'Visa grundskoleexempel'}</Button>
          {view === 'unit' && isPrincipal && (
            <Button onClick={() => { setAdding(true); setSuggested(null); resetLookup(); setError(''); }}>
              <Plus size={17} /> Lägg till skolenhet
            </Button>
          )}
          {view === 'offerings' && isPrincipal && (
            <Button onClick={() => { setCreating(true); setError(''); }}>
              <Plus size={17} /> Lägg till utbildning
            </Button>
          )}
        </div>
      </div>
      <div className="admin-context">
        <span className="context-school">
          <GraduationCap size={16} />
          {unitsForRole(org, role).length > 1 ? (
            <select
              className="og-unit-switch"
              aria-label="Skolenhet"
              value={unit.id}
              onChange={(e) => {
                run((s) => selectUnit(s, e.target.value));
                setOfferingId('');
                setPlanId(null);
              }}
            >
              {unitsForRole(org, role).map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          ) : (
            unit.name
          )}
          <small className="og-code">{unit.code}</small>
        </span>
        <span>{unit.schoolTypes.map((t) => t.name).join(' & ') || 'Inga skolformer'}</span>
        <span>{unit.organizer.type} huvudman</span>
        <span className="context-demo">
          {saving ? (
            <span className="og-saving">Sparar…</span>
          ) : backend ? (
            'Exempelroll utan behörighetskontroll · ändringar sparas i databasen'
          ) : (
            groundExample ? 'Grundskoleexempel · sparas inte i databasen' : 'Exempelroll utan behörighetskontroll · ändringar gäller denna session'
          )}
        </span>
      </div>
      {notice && (
        <output className="admin-notice">
          <CheckCheck size={17} />
          <span>{notice}</span>
          <button aria-label="Stäng meddelandet" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </output>
      )}
      {error && view !== 'timplan' && view !== 'lasar' && !adding && !creating && !deciding && (
        <div className="validation-warning og-error">
          <p>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </p>
        </div>
      )}
    </>
  );

  const addDialog = (
    <Dialog open={adding} onOpenChange={(open) => { if (!open && !importBusy) { lookupGeneration.current++;setBusy(false);setAdding(false); setSuggested(null); } }}>
      <DialogContent className="admin-dialog og-add-dialog" showCloseButton={false}>
        <div className="dialog-eyebrow">
          <span>NY SKOLENHET</span>
          <span>{suggested ? 'STEG 2 AV 2' : 'STEG 1 AV 2'}</span>
        </div>
        {!suggested ? (
          <>
            <DialogTitle>Sök upp skolenheten i registret</DialogTitle>
            <DialogDescription>
              Börja med organisationsnummer eller skolenhetskod. Adress och skoltyp fylls i från Skolverkets register. Skolenheten läggs till under {org.organizer.name}.
            </DialogDescription>
            {lookupForm('import-registry-search')}
            {preview&&<PrincipalPicker id="import-principal" assignments={org.assignments} value={principalChoice} onChange={setPrincipalChoice} name={principalName} onName={setPrincipalName} allowLater disabled={importBusy}/>}
            {error && (
              <div className="validation-warning"><p><AlertTriangle size={16} /><span>{error}</span></p></div>
            )}
            <div className="dialog-actions">
              <Button variant="ghost" disabled={importBusy} onClick={() => {lookupGeneration.current++;setBusy(false);setAdding(false);}}>Avbryt</Button>
              <Button disabled={busy||importBusy||!preview||(principalChoice==='new'&&!principalName.trim())||org.units.some((u) => u.code === preview.unit.code)} onClick={addUnit}>
                <Download size={15} /> {importBusy?'Sparar…':'Lägg till skolenhet'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogTitle>Utbildningar enligt registret</DialogTitle>
            <DialogDescription>
              Registret anger skolenhetens skolformer och program. Bekräfta vilka som ska läggas upp som planerade utbildningar; inriktning väljs per program. Tillstånd och poängplan läggs till efteråt.
            </DialogDescription>
            <div className="og-suggestions">
              {suggestOfferings(org, org.units.find(u=>u.code===suggested.unitId)?.id ?? suggested.unitId).map((s) => {
                const key = s.programCode ?? s.kind;
                const pick = suggested.picks[key] ?? { on: false, orientation: '', cohort: '' };
                return (
                  <div key={key} className={`og-suggestion ${pick.on ? 'active' : ''}`}>
                    <label aria-label={`Skapa ${s.name}`}>
                      <input
                        type="checkbox"
                        checked={pick.on}
                        disabled={!s.inCatalog}
                        onChange={(e) => setSuggested({ ...suggested, picks: { ...suggested.picks, [key]: { ...pick, on: e.target.checked } } })}
                      />
                      <span>
                        <strong>{s.name}</strong>
                        <small>{s.kind === 'gymnasium' ? `${s.registryCode} i registret · ${s.programCode ?? 'saknas i Gy25-katalogen'}` : kindLabel[s.kind]}</small>
                      </span>
                    </label>
                    {s.orientations.length > 0 && (
                      <select className="og-select" aria-label={`Inriktning för ${s.name}`} value={pick.orientation} onChange={(e) => setSuggested({ ...suggested, picks: { ...suggested.picks, [key]: { ...pick, orientation: e.target.value } } })}>
                        {s.orientations.map((o) => (
                          <option key={o.code} value={o.code}>{o.name} ({o.code})</option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
              {suggestOfferings(org, org.units.find(u=>u.code===suggested.unitId)?.id ?? suggested.unitId).length === 0 && <p className="og-text">Registret anger inga program för skolenheten. Lägg till utbildningar under Utbildningar.</p>}
            </div>
            {error && (
              <div className="validation-warning"><p><AlertTriangle size={16} /><span>{error}</span></p></div>
            )}
            <div className="dialog-actions">
              <Button variant="ghost" onClick={() => { setSuggested(null); setAdding(false); }}>Hoppa över</Button>
              <Button onClick={createSuggested}>Skapa utbildningar</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );

  if (view === 'timplan')
    return (
      <div className="admin-workspace timplan-workspace">
        {heading}
        <TimplanView state={tpState} apply={runTimplan} blocked={blocked} error={error} clearError={() => setError('')}
          renderClasses={(plan,education)=><TimplanClasses key={`${unit.id}:${education.id}:${plan.id}`} unitId={unit.id} plan={plan} education={education} plans={tp.plans}
            bindings={bindings.filter(b=>b.unitId===unit.id)} loading={bindingsLoading}
            classNames={(schedule?.classes??[]).filter(c=>c.kind===education.kind).map(c=>c.name)}
            onSave={async b=>{if(backend)await saveClassTimplan(b);setBindings(rows=>[...rows.filter(x=>!(x.unitId===b.unitId&&x.className===b.className&&x.startYear===b.startYear)),b]);}}
            onRemove={async b=>{if(backend)await deleteClassTimplan(b);setBindings(rows=>rows.filter(x=>!(x.unitId===b.unitId&&x.className===b.className&&x.startYear===b.startYear)));}}/>}
        />
      </div>
    );

  if (view === 'lasar')
    return (
      <div className="admin-workspace timplan-workspace">
        {heading}
        <LasarView
          state={lasarState}
          apply={runLasar}
          unitId={unit.id}
          unitName={unit.name}
          schoolTypes={unit.schoolTypes.map((t) => t.code)}
          timplans={tpState}
          bindings={bindings.filter(b=>b.unitId===unit.id)}
          classes={schedule?.classes ?? []}
          schedule={schedule}
          error={error}
          clearError={() => setError('')}
        />
      </div>
    );

  if (view === 'unit') {
    const gr = unit.schoolTypes.find((t) => t.code === 'GR');
    return (
      <div className="admin-workspace">
        {heading}
        <div className="og-layout og-layout-units">
          <aside className="tp-directory">
            <div className="directory-heading">
              <h2>Huvudmannens skolor</h2>
              <span>{org.units.length}</span>
            </div>
            {unitsForRole(org, role).map((u) => (
              <button key={u.id} aria-label={`Visa ${u.name}`} className={'tp-directory-item ' + (u.id === unit.id ? 'active' : '')} onClick={() => { run((s) => selectUnit(s, u.id)); setOfferingId(''); setPlanId(null); }}>
                <span>
                  <strong>{u.name}</strong>
                  <small>{u.code} · {u.municipality.name} · {unitOfferings(org, u.id).length} utbildningar</small>
                </span>
                <span className="tp-directory-status">
                  <span className={`tp-status ${u.status === 'Aktiv' || u.status === 'Exempel' ? 'tp-status-fastställd' : 'tp-status-återsänd'}`}>{u.status}</span>
                </span>
              </button>
            ))}
            {isPrincipal && (
              <button className="tp-directory-item og-add-unit" aria-label="Lägg till skolenhet" onClick={() => { setAdding(true); setSuggested(null); resetLookup(); setError(''); }}>
                <span><strong><Plus size={14} /> Lägg till skolenhet</strong><small>Sök upp den i Skolenhetsregistret</small></span>
              </button>
            )}
            <div className="tp-directory-note">
              <School size={15} />
              <p>{org.organizer.name}{org.organizer.organizationNumber ? `, ${org.organizer.organizationNumber}` : ''}. Godkännande avser viss utbildning vid viss skolenhet i viss kommun (Skollagen 2 kap. 5 §).</p>
            </div>
          </aside>
          <section className="og-main">
            <div className="og-card">
              <div className="section-heading">
                <h3>
                  <Building2 size={17} /> {unit.name}
                </h3>
                <span className="cell-secondary">
                  Källa: {unit.source.name}
                  {unit.source.fetched ? `, hämtad ${unit.source.fetched}` : ''}
                  {unit.source.modified ? `, ändrad i registret ${unit.source.modified}` : ''}
                </span>
              </div>
              <dl className="pupil-facts og-facts">
                <div><dt>Skolenhetskod</dt><dd>{unit.code}</dd></div>
                <div><dt>Namn</dt><dd>{unit.name}</dd></div>
                <div><dt>Huvudman</dt><dd>{unit.organizer.name}<small>{unit.organizer.type}{unit.organizer.organizationNumber ? ` · ${unit.organizer.organizationNumber}` : ''}</small></dd></div>
                <div><dt>Kommun</dt><dd>{unit.municipality.name}<small>{unit.municipality.code}</small></dd></div>
                <div><dt>Adress</dt><dd>{unit.address ? addressText(unit.address) : 'Adress saknas. Uppdatera från registret.'}</dd></div>
                <div><dt>Rektor utsedd av huvudmannen</dt><dd>{unitStaff(org,unit.id).filter(a=>a.role==='rektor').map(a=>a.name).join(', ')||'Inte utsedd'}{isPrincipal&&<Button variant="outline" onClick={()=>{setPrincipalChoice(unitStaff(org,unit.id).find(a=>a.role==='rektor')?.id??'');setPrincipalName('');setAppointing(true);setError('');}}>Utse rektor</Button>}</dd></div>
                <div><dt>Status</dt><dd>{unit.status}</dd></div>
              </dl>
              <div className="og-unit-actions">
                {unit.source.url && (
                  <a className="og-link" href={unit.source.url} target="_blank" rel="noreferrer">
                    Posten i Skolenhetsregistret <ExternalLink size={13} />
                  </a>
                )}
                {isPrincipal && org.units.length > 1 && (
                  <button className="text-link og-remove" onClick={() => void persist((s) => removeUnit(s, role, unit.id), () => deleteUnit(unit.id, unit.name), 'Skolenheten togs bort.')}>
                    <Trash2 size={13} /> Ta bort skolenheten
                  </button>
                )}
              </div>
            </div>
            <div className="og-card">
              <div className="section-heading">
                <h3>Skolformer och stadier</h3>
              </div>
              {unit.schoolTypes.map((t) => (
                <div key={t.code} className="og-schooltype">
                  <strong>{t.name}</strong>
                  {t.code === 'GR' && (
                    <div className="og-grades">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
                        <label key={g} className={t.grades?.includes(g) ? 'active' : ''}>
                          <input
                            type="checkbox"
                            checked={t.grades?.includes(g) ?? false}
                            disabled={!isPrincipal}
                            onChange={(e) => {
                              const next = e.target.checked ? [...(t.grades ?? []), g] : (t.grades ?? []).filter((x) => x !== g);
                              void persist((s) => setGrades(s, role, unit.id, next), () => saveGrades(unit.id, next));
                            }}
                          />
                          Åk {g}
                        </label>
                      ))}
                      <span className="cell-secondary">
                        Stadier: {[t.grades?.some((g) => g <= 3) && 'låg', t.grades?.some((g) => g >= 4 && g <= 6) && 'mellan', t.grades?.some((g) => g >= 7) && 'hög'].filter(Boolean).join(', ') || 'inga'}. Registret anger inte årskurser; huvudmannen sätter dem. Timplanen prövas per helt stadium.
                      </span>
                    </div>
                  )}
                  {t.code === 'GY' && (
                    <span className="cell-secondary">
                      Program enligt registret: {t.programmes?.length ? t.programmes.join(', ') : 'inga angivna'}
                    </span>
                  )}
                </div>
              ))}
              {!gr && <p className="cell-secondary">Skolenheten har ingen grundskola; grundskolans timplan är inte tillämplig.</p>}
            </div>
            <div className="og-card">
              <div className="section-heading">
                <h3>
                  <Users size={17} /> Elevregister
                </h3>
                <span className="cell-secondary">{num(unit.pupilRegister.count)} elever</span>
              </div>
              <p className="og-text">
                Källa: {unit.pupilRegister.source}. {unit.pupilRegister.note} En elev är inskriven vid exakt en skolenhet.
              </p>
            </div>
            <div className="og-card">
              <div className="section-heading">
                <h3>Lärare vid skolenheten</h3>
                <span className="cell-secondary">{unitStaff(org, unit.id).filter(a=>a.role==='larare').length} läraruppdrag</span>
              </div>
              <p className="og-text">
                En lärare kan tjänstgöra vid flera skolenheter. {role === 'rektor' ? 'Du som rektor tilldelar lärarnas uppdrag här.' : 'Rektor ansvarar för lärarnas uppdrag. Här visas den aktuella tilldelningen.'}
              </p>
              <div className="og-staff">
                {org.assignments.filter(a=>a.role==='larare').map((a) => {
                  const here = a.unitIds.includes(unit.id);
                  return (
                    <label key={a.id} aria-label={`${a.name} vid ${unit.name}`} className={`og-staff-row ${here ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={here}
                        disabled={role !== 'rektor' || saving}
                        onChange={(e) => void persist((s) => assignUnit(s, role, a.id, unit.id, e.target.checked), () => saveAssignmentUnit(a.id, unit.id, e.target.checked))}
                      />
                      <span>
                        <strong>{a.name}</strong>
                        <small>{a.role === 'rektor' ? 'Rektor' : 'Lärare'} · {a.unitIds.length ? a.unitIds.map((id) => org.units.find((u) => u.id === id)?.name ?? id).join(', ') : 'inget uppdrag'}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="og-card">
              <div className="section-heading">
                <h3>Utbud mot registret</h3>
                <span className="cell-secondary">{offerings.length} utbildningar vid skolenheten</span>
              </div>
              {!comparison.known ? (
                <p className="og-text">Skolenheten är ett lokalt exempel. Uppdatera den ur Skolenhetsregistret för att jämföra utbudet med registrets program.</p>
              ) : comparison.missingInRegistry.length || comparison.notOffered.length ? (
                <ul className="tp-warnings">
                  {comparison.missingInRegistry.map((p) => (
                    <li key={p}><Info size={14} /> {p} finns i utbudet men inte som program i registret. Huvudmannen anmäler ändringar i verksamheten till Skolverket.</li>
                  ))}
                  {comparison.notOffered.map((p) => (
                    <li key={p}><Info size={14} /> Registret anger {p}, som saknas i utbudet.</li>
                  ))}
                </ul>
              ) : (
                <div className="validation-success"><CircleCheck size={17} /> Utbudet stämmer med registrets program.</div>
              )}
            </div>
          </section>
          <aside className="og-side">
            <div className="og-card">
              <div className="section-heading">
                <h3>
                  <Search size={17} /> Uppdatera ur Skolenhetsregistret
                </h3>
              </div>
              {!adding && lookupForm('update-registry-search')}
              {preview && !adding && (
                isPrincipal ? (
                  <Button
                    className="og-apply"
                    disabled={org.units.some((u) => u.code === preview.unit.code && u.id !== unit.id)}
                    onClick={() =>
                      void persist(
                        (s) => applyRegistryUnit(s, role, preview.unit, preview.source),
                        (next) => updateUnitFromRegistry(unit.id, activeUnit(next), preview.unit, preview.source),
                        `${unit.name} har nu uppgifterna för ${preview.unit.name}.`,
                      ).then((ok) => ok && resetLookup())
                    }
                  >
                    <Download size={15} /> Använd för {unit.name}
                  </Button>
                ) : (
                  <span className="cell-secondary">Bara huvudmannen kan byta skolenhetens grunduppgifter.</span>
                )
              )}
            </div>
            <div className="og-card og-log">
              <div className="section-heading">
                <h3><History size={16} /> Händelser</h3>
              </div>
              {org.log.length === 0 && <p className="cell-secondary">Inga ändringar denna session.</p>}
              <div className="admin-history">
                {org.log.slice(0, 8).map((h) => (
                  <div key={h.id}>
                    <span>{roleLabel[h.role]} · {h.time}</span>
                    <strong>{h.action}</strong>
                    <p>{h.comment}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
        {addDialog}
      <Dialog open={appointing} onOpenChange={open=>{if(!importBusy)setAppointing(open);}}>
        <DialogContent className="admin-dialog" showCloseButton={false}>
          <DialogTitle>Utse rektor för {unit.name}</DialogTitle><DialogDescription>Huvudmannen väljer rektor. Ett tidigare rektorsuppdrag vid skolan ersätts; uppdrag vid andra skolor behålls.</DialogDescription>
          <PrincipalPicker id="appoint-principal" assignments={org.assignments} value={principalChoice} onChange={setPrincipalChoice} name={principalName} onName={setPrincipalName} disabled={importBusy}/>
          {error&&<p role="alert" className="validation-warning">{error}</p>}
          <div className="dialog-actions"><Button variant="ghost" disabled={importBusy} onClick={()=>setAppointing(false)}>Avbryt</Button>
          <Button disabled={importBusy||!principalChoice||(principalChoice==='new'&&!principalName.trim())} onClick={()=>void(async()=>{
            if(importPending.current)return;importPending.current=true;setImportBusy(true);
            const ok=await persist(s=>appointPrincipal(s,role,unit.id,principalChoice==='new'?undefined:principalChoice,principalName),()=>savePrincipal(unit.id,principalChoice==='new'?undefined:principalChoice,principalChoice==='new'?principalName:undefined),'Rektorn är utsedd.');
            if(ok)setAppointing(false);importPending.current=false;setImportBusy(false);
          })()}>Spara rektorsuppdrag</Button></div>
        </DialogContent>
      </Dialog>
      </div>
    );
  }

  if (view === 'offerings') {
    const status = selected ? permitStatus(org, selected) : null;
    return (
      <div className="admin-workspace">
        {heading}
        <div className="og-layout og-layout-wide">
          <section className="og-main">
            <div className="register-surface">
              {offerings.length === 0 ? (
                <div className="admin-empty">
                  <h2>Inga utbildningar vid {unit.name}</h2>
                  <p>Huvudmannen lägger till utbildningar, gärna utifrån registrets program.</p>
                </div>
              ) : (
                <table className="admin-table og-table">
                  <thead>
                    <tr>
                      <th>Utbildning</th>
                      <th>Studieväg</th>
                      <th>Kull</th>
                      <th>Status</th>
                      <th>Tillstånd</th>
                      <th>Poängplan</th>
                      <th>Timplan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offerings.map((o) => {
                      const permit = permitStatus(org, o);
                      const pp = currentPointPlan(o);
                      const ppOpen = openPointPlan(o);
                      const tpOpen = openPlan(tpState, o.id);
                      const tpCurrent = currentPlan(tpState, o.id);
                      return (
                        <tr key={o.id} data-state={selected?.id === o.id ? 'selected' : undefined}>
                          <td>
                            <button className="pupil-link" aria-label={`Visa ${o.name}`} onClick={() => { setOfferingId(o.id); setError(''); }}>
                              <span>
                                <strong>{o.kind === 'gymnasium' ? offeringTitle(o) : o.name}</strong>
                                <small>{kindLabel[o.kind]}{o.grades ? ` · årskurs ${o.grades[0]}–${o.grades[o.grades.length - 1]}` : ''}</small>
                              </span>
                            </button>
                          </td>
                          <td><code className="og-code">{studyPathCode(o)}</code>{o.localCode && <span className="cell-secondary">{o.localCode}</span>}</td>
                          <td className="mentor-cell">{o.cohort}</td>
                          <td><span className={`a-status ${o.status === 'aktiv' ? '' : 'amber'}`}><span />{offeringStatusLabel[o.status]}</span></td>
                          <td><span className={`a-status ${permit.level === 'ok' ? '' : 'amber'}`}><span />{permit.level === 'ok' ? permit.text : permit.level === 'error' ? 'Saknas' : 'Ej registrerat'}</span></td>
                          <td>{o.kind !== 'gymnasium' ? <span className="cell-secondary">Ej tillämplig</span> : ppOpen ? <span className="tp-status tp-status-utkast">Utkast v{ppOpen.version}</span> : pp ? <span className="tp-status tp-status-fastställd">Fastställd v{pp.version}</span> : <span className="tp-status tp-status-none">Saknas</span>}</td>
                          <td>{tpOpen ? <StatusPill status={tpOpen.status} short /> : tpCurrent ? <StatusPill status="fastställd" short /> : <span className="tp-status tp-status-none">Saknas</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div className="table-summary">
                <span>{offerings.length} utbildningar · {offerings.filter((o) => o.status === 'aktiv').length} aktiva · {unit.name}</span>
                <span>Katalog hämtad {snapshotInfo.fetched}</span>
              </div>
            </div>
          </section>
          <aside className="og-side">
            {selected && status && (
              <div className="og-card">
                <div className="section-heading">
                  <h3>{selected.kind === 'gymnasium' ? offeringTitle(selected) : selected.name}</h3>
                </div>
                {isPrincipal && <Button variant="outline" onClick={()=>{setCopyYear(cohortYear(selected.cohort)+1);setError('');}}>Kopiera till ny elevkull</Button>}
                <dl className="pupil-facts og-facts">
                  <div><dt>Slag</dt><dd>{kindLabel[selected.kind]}</dd></div>
                  <div><dt>Studieväg</dt><dd>{studyPathCode(selected)}{selected.localCode ? <small>Lokal kod {selected.localCode}</small> : null}</dd></div>
                  <div><dt>Kull</dt><dd>{selected.cohort}</dd></div>
                  <div><dt>Status</dt><dd>{offeringStatusLabel[selected.status]}</dd></div>
                </dl>
                {isPrincipal && (
                  <div className="og-edit">
                    <label className="field-label" htmlFor="og-name">Lokalt namn</label>
                    <Input
                      id="og-name"
                      value={selected.name}
                      onChange={(e) => run((s) => updateOffering(s, role, selected.id, { name: e.target.value }))}
                      onBlur={(e) => void persist((s) => updateOffering(s, role, selected.id, { name: e.target.value }), () => updateOfferingRow(selected.id, { name: e.target.value }))}
                    />
                    <label className="field-label" htmlFor="og-local">Lokal kod</label>
                    <Input
                      id="og-local"
                      value={selected.localCode ?? ''}
                      placeholder="t.ex. ESBIF-FOT"
                      onChange={(e) => run((s) => updateOffering(s, role, selected.id, { localCode: e.target.value }))}
                      onBlur={(e) => void persist((s) => updateOffering(s, role, selected.id, { localCode: e.target.value }), () => updateOfferingRow(selected.id, { localCode: e.target.value }))}
                    />
                    <label className="field-label" htmlFor="og-cohort">Kull eller läsår</label>
                    <Input
                      id="og-cohort"
                      value={selected.cohort}
                      onChange={(e) => run((s) => updateOffering(s, role, selected.id, { cohort: e.target.value }))}
                      onBlur={(e) => void persist((s) => updateOffering(s, role, selected.id, { cohort: e.target.value }), () => updateOfferingRow(selected.id, { cohort: e.target.value }))}
                    />
                    <label className="field-label" htmlFor="og-status">Status</label>
                    <select id="og-status" className="og-select" value={selected.status} onChange={(e) => void persist((s) => updateOffering(s, role, selected.id, { status: e.target.value as Offering['status'] }), () => updateOfferingRow(selected.id, { status: e.target.value as Offering['status'] }))}>
                      <option value="planerad">Planerad</option>
                      <option value="aktiv">Aktiv</option>
                      <option value="avvecklas">Avvecklas</option>
                    </select>
                  </div>
                )}
                <div className="section-heading og-permits-heading">
                  <h3><FileCheck2 size={16} /> Tillstånd och beslut</h3>
                  <span className={`a-status ${status.level === 'ok' ? '' : 'amber'}`}><span />{status.level === 'ok' ? 'Gäller' : status.level === 'error' ? 'Saknas' : 'Ej registrerat'}</span>
                </div>
                {status.level !== 'ok' && <p className="og-text og-warn">{status.text}</p>}
                {selected.permits.map((p) => (
                  <div key={p.id} className="og-permit">
                    <strong>{p.issuer} · {p.reference}</strong>
                    <span>Beslut {p.decided} · gäller från {p.validFrom}{p.validTo ? ` till ${p.validTo}` : ''}</span>
                    {p.scope && <span>{p.scope}</span>}
                    {p.file && <span className="og-file"><Paperclip size={13} /> {p.file.name} ({Math.round(p.file.size / 1024)} kB)</span>}
                    {isPrincipal && (
                      <button className="text-link" onClick={() => void persist((s) => removePermit(s, role, selected.id, p.id), () => deletePermit(p.id), 'Tillståndet togs bort.')}>
                        <Trash2 size={13} /> Ta bort
                      </button>
                    )}
                  </div>
                ))}
                {isPrincipal && permitFor !== selected.id && (
                  <Button variant="outline" onClick={() => { setPermitFor(selected.id); setPermitDraft(emptyPermit()); }}>
                    <Plus size={15} /> Registrera tillstånd
                  </Button>
                )}
                {isPrincipal && permitFor === selected.id && (
                  <div className="og-edit og-permit-form">
                    <label className="field-label" htmlFor="pm-issuer">Utfärdare</label>
                    <select id="pm-issuer" className="og-select" value={permitDraft.issuer} onChange={(e) => setPermitDraft({ ...permitDraft, issuer: e.target.value as Permit['issuer'] })}>
                      <option value="Skolinspektionen">Skolinspektionen (godkännande)</option>
                      <option value="Skolverket">Skolverket (särskild variant m.m.)</option>
                      <option value="Huvudmannens beslut">Huvudmannens eget beslut</option>
                    </select>
                    <label className="field-label" htmlFor="pm-ref">Diarienummer eller referens</label>
                    <Input id="pm-ref" value={permitDraft.reference} placeholder="t.ex. SI 2026:0873" onChange={(e) => setPermitDraft({ ...permitDraft, reference: e.target.value })} />
                    <div className="og-two">
                      <div>
                        <label className="field-label" htmlFor="pm-decided">Beslutsdatum</label>
                        <Input id="pm-decided" type="date" value={permitDraft.decided} onChange={(e) => setPermitDraft({ ...permitDraft, decided: e.target.value })} />
                      </div>
                      <div>
                        <label className="field-label" htmlFor="pm-from">Gäller från</label>
                        <Input id="pm-from" type="date" value={permitDraft.validFrom} onChange={(e) => setPermitDraft({ ...permitDraft, validFrom: e.target.value })} />
                      </div>
                    </div>
                    <label className="field-label" htmlFor="pm-to">Gäller till (valfritt)</label>
                    <Input id="pm-to" type="date" value={permitDraft.validTo ?? ''} onChange={(e) => setPermitDraft({ ...permitDraft, validTo: e.target.value })} />
                    <label className="field-label" htmlFor="pm-scope">Vad beslutet omfattar</label>
                    <Textarea id="pm-scope" rows={2} value={permitDraft.scope} placeholder="Program, inriktning, skolenhet, kommun, eventuellt elevantal." onChange={(e) => setPermitDraft({ ...permitDraft, scope: e.target.value })} />
                    <label className="field-label" htmlFor="pm-file">Bifoga beslutet</label>
                    <input
                      id="pm-file"
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        setPermitDraft({ ...permitDraft, file: f ? { name: f.name, size: f.size, type: f.type } : undefined });
                      }}
                    />
                    <span className="cell-secondary">Filen lagras inte i exemplet; namn, storlek och typ registreras.</span>
                    <div className="dialog-actions">
                      <Button variant="ghost" onClick={() => setPermitFor(null)}>Avbryt</Button>
                      <Button
                        onClick={() => {
                          const permit = { ...permitDraft, validTo: permitDraft.validTo || undefined };
                          void persist((s) => addPermit(s, role, selected.id, permit), () => savePermit(selected.id, permit), 'Tillståndet är registrerat.').then((ok) => ok && setPermitFor(null));
                        }}
                      >
                        Registrera
                      </Button>
                    </div>
                  </div>
                )}
                {isPrincipal && selected.status === 'planerad' && (
                  <button className="text-link og-remove" onClick={() => void persist((s) => removeOffering(s, role, selected.id), () => deleteOffering(selected.id, selected.name), 'Utbildningen togs bort.')}>
                    <Trash2 size={13} /> Ta bort utbildningen
                  </button>
                )}
              </div>
            )}
            <div className="og-card">
              <p className="og-text">
                Godkännande av enskild huvudman avser viss utbildning vid viss skolenhet i viss kommun (Skollagen 2 kap. 5 §). Nya program eller inriktningar kräver ny ansökan till Skolinspektionen senast 31 januari året före start. Två profiler på samma studieväg är inte en särskild variant så länge avvikelsen är under 300 poäng.
              </p>
            </div>
          </aside>
        </div>
        <Dialog open={copyYear!==null} onOpenChange={open=>{if(!open&&!copyBusy)setCopyYear(null);}}>
          <DialogContent className="admin-dialog" showCloseButton={false}>
            <DialogTitle>Kopiera till ny elevkull</DialogTitle>
            <DialogDescription>{selected?.name} · {selected?.cohort}. Senaste poängplanens kursval och timplanens timmar kopieras till nya utkast. Tillstånd, beslut, klasser och elever följer inte med.</DialogDescription>
            <label className="field-label" htmlFor="copy-cohort-year">Nya kullens startår</label>
            <Input id="copy-cohort-year" type="number" min={selected?cohortYear(selected.cohort)+1:2000} max={2100} value={copyYear??''} onChange={e=>setCopyYear(Number(e.target.value))} disabled={copyBusy}/>
            {error&&<p role="alert" className="validation-warning">{error}</p>}
            <div className="dialog-actions"><Button variant="ghost" disabled={copyBusy} onClick={()=>setCopyYear(null)}>Avbryt</Button>
              <Button disabled={copyBusy} onClick={()=>void (async()=>{
                if(!selected||copyYear===null||copyPending.current)return;
                copyPending.current=true;setCopyBusy(true);setError('');
                try {
                  const next=copyCohort(org,tp.plans,role,selected.id,copyYear);
                  if(backend){
                    const id=await copyCohortInDatabase(selected.id,copyYear);
                    const fresh=await loadOrganisation(20);
                    setOrg({...fresh,activeUnitId:unit.id});setOfferingId(id);setPlanId(null);
                  } else {setOrg(next.org);setTp({plans:next.plans});setOfferingId(next.offering.id);setPlanId(null);}
                  setCopyYear(null);setNotice(`Ny elevkull skapad: ${next.offering.cohort}. Granska utkasten före beslut.`);
                } catch(e){setError(e instanceof Error?e.message:'Kopian kunde inte skapas.');}
                finally{copyPending.current=false;setCopyBusy(false);}
              })()}>{copyBusy?'Kopierar…':'Skapa ny elevkull'}</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={creating} onOpenChange={(open) => { if (!open) setCreating(false); }}>
          <DialogContent className="admin-dialog" showCloseButton={false}>
            <div className="dialog-eyebrow">
              <span>UTBILDNING</span>
              <span>{unit.name.toLocaleUpperCase('sv')}</span>
            </div>
            <DialogTitle>Lägg till utbildning</DialogTitle>
            <DialogDescription>
              Program och inriktning väljs ur Skolverkets katalog. Det lokala namnet skiljer profiler på samma studieväg åt.
            </DialogDescription>
            <label className="field-label" htmlFor="new-kind">Slag</label>
            <select id="new-kind" className="og-select" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as OfferingKind })}>
              <option value="gymnasium">Nationellt program i gymnasieskolan</option>
              <option value="grundskola">Grundskola</option>
              <option value="introduktionsprogram">Introduktionsprogram</option>
            </select>
            {draft.kind === 'gymnasium' && (
              <>
                <label className="field-label" htmlFor="new-program">Program (Gy25)</label>
                <select
                  id="new-program"
                  className="og-select"
                  value={draft.programCode}
                  onChange={(e) => {
                    const program = programs.find((p) => p.code === e.target.value);
                    setDraft({ ...draft, programCode: e.target.value, orientationCode: program?.orientations[0]?.code ?? '' });
                  }}
                >
                  {programs.map((p) => (
                    <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                  ))}
                </select>
                {draftProgram && draftProgram.orientations.length > 0 && (
                  <>
                    <label className="field-label" htmlFor="new-orientation">Inriktning</label>
                    <select id="new-orientation" className="og-select" value={draft.orientationCode} onChange={(e) => setDraft({ ...draft, orientationCode: e.target.value })}>
                      {draftProgram.orientations.map((o) => (
                        <option key={o.code} value={o.code}>{o.name} ({o.code}, {o.points} p)</option>
                      ))}
                    </select>
                  </>
                )}
              </>
            )}
            <label className="field-label" htmlFor="new-name">Lokalt namn</label>
            <Input id="new-name" value={draft.name} placeholder={draft.kind === 'gymnasium' ? 'Profilens namn, t.ex. Foto och rörlig bild' : 'Namn'} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            {draft.kind === 'gymnasium' && (
              <>
                <label className="field-label" htmlFor="new-local">Lokal kod (valfri)</label>
                <Input id="new-local" value={draft.localCode} placeholder="t.ex. ESBIF-FOT" onChange={(e) => setDraft({ ...draft, localCode: e.target.value })} />
              </>
            )}
            <label className="field-label" htmlFor="new-cohort">Kull eller läsår</label>
            <Input id="new-cohort" value={draft.cohort} onChange={(e) => setDraft({ ...draft, cohort: e.target.value })} />
            {error && (
              <div className="validation-warning"><p><AlertTriangle size={16} /><span>{error}</span></p></div>
            )}
            <div className="dialog-actions">
              <Button variant="ghost" onClick={() => setCreating(false)}>Avbryt</Button>
              <Button
                onClick={() => {
                  const input = { ...draft, unitId: unit.id };
                  void persist(
                    (s) => addOffering(s, role, input),
                    (next) => saveOffering(next.offerings[next.offerings.length - 1]),
                    `${draft.name} är tillagd som planerad utbildning vid ${unit.name}.`,
                  ).then((ok) => {
                    if (!ok) return;
                    setCreating(false);
                    setDraft({ ...draft, name: '', localCode: '' });
                  });
                }}
              >
                Lägg till
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Poängplaner
  const gymnasiums = offerings.filter((o) => o.kind === 'gymnasium');
  const offering = gymnasiums.find((o) => o.id === offeringId) ?? gymnasiums[0];
  const plans = offering ? [...offering.pointPlans].sort((a, b) => b.version - a.version) : [];
  const plan = offering ? (plans.find((p) => p.id === planId) ?? openPointPlan(offering) ?? currentPointPlan(offering) ?? plans[0]) : undefined;
  const blocks = offering ? pointPlanBlocks(offering, plan) : [];
  const issues = offering && plan ? pointPlanIssues(offering, plan) : [];
  const ppErrors = issues.filter((i) => i.level === 'error');
  const options = offering ? specializationOptions(offering) : [];
  const editable = Boolean(plan && plan.status === 'utkast' && canShape);
  const fordjupning = blocks.find((b) => b.id === 'fordjupning');
  const chosenPoints = fordjupning?.levels.reduce((n, l) => n + l.points, 0) ?? 0;
  const bySubject = new Map<string, typeof options>();
  for (const l of options) bySubject.set(l.subject, [...(bySubject.get(l.subject) ?? []), l]);

  return (
    <div className="admin-workspace">
      {heading}
      <div className="tp-layout">
        <aside className="tp-directory">
          <div className="directory-heading">
            <h2>Nationella program</h2>
            <span>{gymnasiums.length}</span>
          </div>
          {gymnasiums.map((o) => {
            const open = openPointPlan(o);
            const current = currentPointPlan(o);
            return (
              <button key={o.id} className={'tp-directory-item ' + (offering?.id === o.id ? 'active' : '')} onClick={() => { setOfferingId(o.id); setPlanId(null); setError(''); }}>
                <span>
                  <strong>{o.name}</strong>
                  <small>{studyPathCode(o)} · {o.cohort}</small>
                </span>
                <span className="tp-directory-status">
                  {open ? <span className="tp-status tp-status-utkast">Utkast v{open.version}</span> : current ? <span className="tp-status tp-status-fastställd">v{current.version}</span> : <span className="tp-status tp-status-none">Saknas</span>}
                </span>
              </button>
            );
          })}
          <div className="tp-directory-note">
            <Info size={15} />
            <p>Grundskola och introduktionsprogram har ingen poängplan; deras timplan respektive utbildningsplan finns under Timplaner.</p>
          </div>
        </aside>
        <section className="tp-canvas">
          {!offering ? (
            <div className="admin-empty">
              <h2>Inga nationella program vid {unit.name}</h2>
              <p>Huvudmannen lägger till utbildningar under Utbildningar.</p>
            </div>
          ) : (
            <>
              <div className="tp-cover">
                <div>
                  <span className="admin-kicker">POÄNGPLAN · {studyPathCode(offering)}{offering.localCode ? ` · ${offering.localCode}` : ''}</span>
                  <h2>{offeringTitle(offering)}</h2>
                  <p>{offering.cohort} · Skolverkets katalog hämtad {snapshotInfo.fetched}</p>
                </div>
                {plan && (
                  <div className="tp-cover-side">
                    <span className={`tp-status tp-status-${plan.status}`}>{plan.status === 'utkast' ? 'Utkast' : plan.status === 'fastställd' ? 'Fastställd' : 'Ersatt'}</span>
                    <span>Version {plan.version}</span>
                    {plan.decidedOn && <span>Fastställd {plan.decidedOn}</span>}
                  </div>
                )}
              </div>
              <div className="tp-frame-line">
                <span><Info size={14} /> Gymnasieförordningen 4 kap. 5–7 §§ · 2 500 gymnasiepoäng</span>
                {plans.length > 1 && (
                  <fieldset className="tp-versions">
                    <legend className="sr-only">Version</legend>
                    {plans.map((v) => (
                      <button key={v.id} aria-pressed={plan?.id === v.id} onClick={() => setPlanId(v.id)}>
                        v{v.version} · {v.status}
                      </button>
                    ))}
                  </fieldset>
                )}
              </div>
              <div className="tp-workflow">
                <div className="tp-workflow-text">
                  {!plan && 'Ingen poängplan ännu. Rektor eller huvudman påbörjar en; huvudmannen fastställer.'}
                  {plan?.status === 'utkast' && 'Utkast. Rektor och huvudman väljer programfördjupning ur Skolverkets lista; huvudmannen fastställer.'}
                  {plan?.status === 'fastställd' && 'Fastställd poängplan. Timplanen och elevernas studieplaner bygger på den. Ändringar görs i en ny version.'}
                  {plan?.status === 'ersatt' && 'Ersatt version, visas som historik.'}
                </div>
                <div className="tp-workflow-actions">
                  {canShape && !openPointPlan(offering) && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        void persist(
                          (s) => createPointPlan(s, role, offering.id),
                          (next) => {
                            const created = openPointPlan(next.offerings.find((o) => o.id === offering.id)!)!;
                            return savePointPlanDraft(offering.id, created.version, created.specialization, created.history[0]?.comment ?? '');
                          },
                          'Ett nytt utkast är påbörjat.',
                        )
                      }
                    >
                      <Plus size={15} /> {currentPointPlan(offering) ? 'Ny version' : 'Påbörja poängplan'}
                    </Button>
                  )}
                  {isPrincipal && plan?.status === 'utkast' && (
                    <Button disabled={ppErrors.length > 0} onClick={() => { setDeciding(true); setDecision(''); }}>
                      <CircleCheck size={15} /> Fastställ
                    </Button>
                  )}
                </div>
              </div>
              {plan && (
                <>
                  <div className="tp-grid-scroll">
                    <table className="tp-grid tp-grid-points">
                      <thead>
                        <tr>
                          <th scope="col">Ämne och nivå</th>
                          <th scope="col">Kod</th>
                          <th scope="col">Poäng</th>
                        </tr>
                      </thead>
                      <tbody>
                        {blocks.map((b) => (
                          <>
                            <tr key={b.id} className="tp-block-row">
                              <th scope="rowgroup" colSpan={3}>
                                {b.name}
                                <span>{num(b.levels.reduce((n, l) => n + l.points, 0))} av {num(b.required)} poäng{b.id === 'fordjupning' ? ' · väljs av huvudmannen' : b.id === 'individuellt' ? ' · elevens val inom huvudmannens utbud' : ''}</span>
                              </th>
                            </tr>
                            {b.levels.map((l) => (
                              <tr key={l.code} className={l.fixed ? '' : 'og-picked'}>
                                <th scope="row" className="tp-row-head"><span className="tp-row-name">{l.name}</span></th>
                                <td><code className="og-code">{l.subjectCode ? l.code : '—'}</code></td>
                                <td className="tp-total">{num(l.points)}</td>
                              </tr>
                            ))}
                            {b.id === 'fordjupning' && b.levels.length === 0 && (
                              <tr><td colSpan={3} className="cell-secondary og-empty-row">Inga nivåer valda.</td></tr>
                            )}
                          </>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row">Summa</th>
                          <td aria-label="Ingen kod" />
                          <td className={`tp-total ${blocks.reduce((n, b) => n + b.levels.reduce((m, l) => m + l.points, 0), 0) !== 2500 ? 'tp-error' : ''}`}>
                            <strong>{num(blocks.reduce((n, b) => n + b.levels.reduce((m, l) => m + l.points, 0), 0))}</strong>
                            <small>av 2 500</small>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="tp-below">
                    <section className="tp-checks">
                      <div className="section-heading">
                        <h3>Programfördjupning</h3>
                        <span className={ppErrors.length ? 'a-status amber' : 'a-status'}>
                          <span />
                          {num(chosenPoints)} av {num(fordjupning?.required ?? 0)} poäng
                        </span>
                      </div>
                      {issues.length > 0 && (
                        <div className="validation-warning">
                          {issues.map((i) => (
                            <p key={i.text}><AlertTriangle size={16} /><span>{i.text}</span></p>
                          ))}
                        </div>
                      )}
                      {issues.length === 0 && (
                        <div className="validation-success"><CircleCheck size={17} /> Poängplanen omfattar 2 500 poäng och fördjupningen är komplett.</div>
                      )}
                      {editable ? (
                        <div className="og-picker">
                          <p className="cell-secondary">Skolverkets föreskrivna utbud för {offering.programCode}. Nivåer som redan ingår i studievägen visas inte.</p>
                          {[...bySubject.entries()].map(([subject, levels]) => (
                            <div key={subject} className="og-picker-subject">
                              <strong>{subject}</strong>
                              <div>
                                {levels.map((l) => (
                                  <label key={l.code} className={plan.specialization.includes(l.code) ? 'active' : ''}>
                                    <input
                                      type="checkbox"
                                      checked={plan.specialization.includes(l.code)}
                                      onChange={() =>
                                        void persist(
                                          (s) => togglePick(s, role, offering.id, plan.id, l.code),
                                          (next) => savePointPlanPicks(plan.id, openPointPlan(next.offerings.find((o) => o.id === offering.id)!)!.specialization),
                                        )
                                      }
                                    />
                                    {l.name.replace(`${subject}, `, '')} <small>{l.points} p</small>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="og-text">{plan.status === 'utkast' ? 'Bara rektor och huvudman ändrar utkastet.' : 'Skapa en ny version för att ändra programfördjupningen.'}</p>
                      )}
                    </section>
                    <section className="tp-history">
                      <div className="section-heading">
                        <h3><History size={16} /> Samtal och beslut</h3>
                      </div>
                      {plan.status !== 'ersatt' && canShape && (
                        <div className="tp-comment-box">
                          <Textarea aria-label="Ny kommentar" rows={2} value={note} placeholder={`Kommentera som ${roleLabel[role].toLocaleLowerCase('sv')}…`} onChange={(e) => setNote(e.target.value)} />
                          <Button
                            variant="outline"
                            onClick={() =>
                              void persist(
                                (s) => addPointPlanComment(s, role, offering.id, plan.id, note),
                                () => savePointPlanEvent(plan.id, role, 'Kommentar', note.trim()),
                              ).then((ok) => ok && setNote(''))
                            }
                          >
                            <MessageSquareText size={15} /> Kommentera
                          </Button>
                        </div>
                      )}
                      <div className="admin-history tp-entries">
                        {plan.history.map((h) => (
                          <div key={h.id}>
                            <span>{roleLabel[h.role]} · {h.time}</span>
                            <strong>{h.action}</strong>
                            <p>{h.comment}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </>
              )}
              <div className="plan-boundary">
                <Info size={17} />
                <p>
                  Gymnasiegemensamma, programgemensamma ämnen och inriktning kommer ur Skolverkets katalog och kan inte ändras lokalt. Individuellt val och utökat eller reducerat program hanteras i elevens studieplan, inte här. Yrkesprogrammens bortvalsbara nivåer stöds inte än.
                </p>
              </div>
            </>
          )}
        </section>
      </div>
      <Dialog open={deciding} onOpenChange={(open) => { if (!open) setDeciding(false); }}>
        <DialogContent className="admin-dialog" showCloseButton={false}>
          {offering && plan && (
            <>
              <div className="dialog-eyebrow">
                <span>{offeringTitle(offering).toLocaleUpperCase('sv')}</span>
                <span>VERSION {plan.version}</span>
              </div>
              <DialogTitle>Fastställ poängplanen</DialogTitle>
              <DialogDescription>
                Huvudmannen beslutar vilka ämnen och nivåer som erbjuds som programfördjupning (Gymnasieförordningen 4 kap. 6 §). Timplanen och elevernas studieplaner bygger därefter på denna version.
              </DialogDescription>
              <label className="field-label" htmlFor="pp-decision">Beslut</label>
              <Textarea id="pp-decision" rows={3} value={decision} placeholder="Till exempel styrelse, datum och diarienummer." onChange={(e) => setDecision(e.target.value)} />
              {error && (
                <div className="validation-warning"><p><AlertTriangle size={16} /><span>{error}</span></p></div>
              )}
              <div className="dialog-actions">
                <Button variant="ghost" onClick={() => setDeciding(false)}>Avbryt</Button>
                <Button
                  onClick={() => {
                    void persist(
                      (s) => approvePointPlan(s, role, offering.id, plan.id, decision),
                      () => decidePointPlan(offering.id, plan.id, plan.version, today, decision.trim()),
                      `Poängplanen för ${offering.name} är fastställd.`,
                    ).then((ok) => ok && setDeciding(false));
                  }}
                >
                  Fastställ
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
