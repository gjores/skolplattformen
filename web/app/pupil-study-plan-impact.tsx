'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { api, ApiError } from '@/lib/server-client.ts';
import {
  parseStudyPlanReadReply, parseStudyPlanReadRequest, type StudyPlanImpact, type StudyPlanImpactOption,
  type StudyPlanImpactTarget, type StudyPlanOptionsReply, type StudyPlanScope,
} from '@/lib/study-plan-contract.ts';

type Props = {
  scope: StudyPlanScope;
  initialOn: string;
  placementStartsOn: string;
  placementEndsOn: string | null;
  onSessionLost: () => void;
  onOpenClassChange?: () => void;
};

const control = 'min-h-[var(--control-height)]';
const selectWidth = 'w-full max-w-full [&_select]:min-h-[var(--control-height)]';
const resultLabels = {
  same_level: 'Samma nivå', follow_up: 'Behöver följas upp', review_education: 'Utbildningen behöver granskas', unknown: 'Underlag saknas',
};
const changeLabels = {
  same_level: 'Samma nivå', new_level: 'Annan nivå eller annat språk', missing_group: 'Undervisningsgrupp behöver följas upp', needs_review: 'Behöver följas upp',
};
const issueLabels: Record<string, string> = {
  class_source_missing: 'Det saknas tidigare klasstillhörighet för datumet.',
  group_course_missing: 'Undervisningsgruppens ämnesnivå saknas i underlaget.',
  plan_missing: 'Det finns ingen gällande studieplan på jämförelsedatumet.',
  plan_level_missing: 'Nivån behöver kontrolleras mot elevens studieplan.',
  separate_parallel_set: 'Grupperna tillhör olika parallelluppsättningar. Ändringen behöver hanteras separat i gruppflödet.',
  group_membership_overlap: 'Eleven har redan ett överlappande medlemskap i parallellgruppen.',
  group_date_outside_period: 'Kontrollera att medlemskapet ryms inom gruppens och elevens perioder.',
  group_ends_earlier: 'Målgruppen slutar tidigare. Följ upp elevens planerade studiedatum.',
  target_offering_changed: 'Målklassen hör till en annan utbildning. Jämförelsen utgår från elevens nuvarande studieväg.',
  class_group_follow_up: 'Undervisningsgruppen hör till elevens tidigare klass. Följ upp grupptillhörigheten.',
  class_period_overlap: 'En annan klasstillhörighet berörs av det valda datumet.',
  group_period_outside: 'Kontrollera att medlemskapet ryms inom gruppens och elevens perioder.',
  group_overlap: 'Eleven har redan ett överlappande medlemskap i parallellgruppen.',
  different_parallel_set: 'Grupperna tillhör olika parallelluppsättningar. Ändringen behöver hanteras separat i gruppflödet.',
  planned_period_review: 'Följ upp elevens planerade studiedatum mot gruppens period.',
  group_membership_ends: 'Följ upp undervisningen efter sista medlemsdagen.',
};

function summarizeParticipation(value: StudyPlanImpact['levels'][number]['before']) {
  if (!value) return 'Ingen grupp';
  return value.name + ' · ' + value.startsOn + ' till och med ' + value.endsOn;
}

function Compared({ impact, on, options, target }: {
  impact: StudyPlanImpact; on: string; options: StudyPlanImpactOption[]; target: StudyPlanImpactTarget;
}) {
  const currentClass = options.find(item => item.kind === 'class' && item.classId === impact.sources.classId);
  const targetClass = target.kind === 'class_move' ? options.find(item => item.kind === 'class' && item.classId === target.classId) : null;
  const issues = [...new Set(impact.issues.map(issue => issueLabels[issue.code] ?? 'Kontrollera uppgiften i skolans klass- eller gruppunderlag.'))];
  return <div className="grid min-w-0 gap-3 rounded-lg border border-border p-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className={'status-badge' + (impact.result === 'same_level' ? ' success' : '')}>{resultLabels[impact.result]}</span>
      <span className="text-sm">Jämfört {impact.comparedOn}</span>
    </div>
    {impact.comparedOn !== on && <p className="text-sm">Du valde {on}. Bytet kan börja från källmedlemskapets första dag, {impact.comparedOn}.</p>}
    {impact.plan && <p className="text-sm text-muted-foreground">Studieplanens version {impact.plan.revision}</p>}
    {impact.sourceRemainder !== undefined && <p className="text-sm">
      {impact.sourceRemainder ? 'Tidigare medlemskap skulle gälla till och med ' + impact.sourceRemainder.endsOn + '.'
        : 'Det tidigare medlemskapet skulle återtas före starten.'}
    </p>}
    {target.kind === 'class_move' && <dl className="grid gap-2 text-sm sm:grid-cols-2">
      <div><dt className="font-medium">Klass före ändringen</dt><dd>{impact.sources.className ?? currentClass?.name ?? 'Uppgift saknas'}</dd></div>
      <div><dt className="font-medium">Föreslagen klass</dt><dd>{impact.sources.targetClassName ?? targetClass?.name ?? 'Uppgift saknas'}</dd></div>
    </dl>}
    {issues.length > 0 && <ul className="list-disc pl-5 text-sm">{issues.map(message => <li key={message}>{message}</li>)}</ul>}
    {impact.levels.length > 0 && <ul className="grid list-none gap-2 p-0">
      {impact.levels.map((level, index) => <li key={level.ref.itemCode + '/' + (level.ref.languageCode ?? '') + '/' + index}
        className="grid min-w-0 gap-2 rounded-lg border border-border p-3 text-sm">
        <p className="font-medium wrap-anywhere">{level.label}</p>
        <span className="status-badge w-fit">{changeLabels[level.change]}</span>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div><dt className="font-medium">Före ändringen</dt><dd className="wrap-anywhere">{summarizeParticipation(level.before)}</dd></div>
          <div><dt className="font-medium">Efter föreslagen ändring</dt><dd className="wrap-anywhere">{summarizeParticipation(level.after)}</dd></div>
        </dl>
      </li>)}
    </ul>}
    {impact.sources.groups.length > 0 && <details>
      <summary className={control + ' cursor-pointer py-2 font-medium'}>Jämförda gruppversioner</summary>
      <ul className="list-none p-0 text-sm">
        {impact.sources.groups.map(group => <li key={group.groupId + '/' + (group.membershipId ?? '')}>
          {options.find(option => option.kind !== 'class' && option.groupId === group.groupId)?.name ?? 'Undervisningsgrupp'}
          {' · version ' + group.revision + ' · ' + group.startsOn + ' till och med ' + group.endsOn}
        </li>)}
      </ul>
    </details>}
  </div>;
}

export default function PupilStudyPlanImpact({ scope, initialOn, placementStartsOn, placementEndsOn, onSessionLost, onOpenClassChange }: Props) {
  const [open, setOpen] = useState(false);
  const [on, setOn] = useState(initialOn);
  const [options, setOptions] = useState<StudyPlanOptionsReply | null>(null);
  const [kind, setKind] = useState<StudyPlanImpactTarget['kind']>('class_move');
  const [classId, setClassId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [membershipId, setMembershipId] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [result, setResult] = useState<{ target: StudyPlanImpactTarget; impact: StudyPlanImpact } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const current = useRef<AbortController | null>(null);
  const id = useId();

  useEffect(() => () => current.current?.abort(), []);

  function clearResult() {
    current.current?.abort();
    setBusy(false);
    setMessage('');
    setResult(null);
  }

  async function read(view: 'options' | 'impact', target?: StudyPlanImpactTarget) {
    clearResult();
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    try {
      const request = parseStudyPlanReadRequest({ ...scope, on, view, ...(target ? { target } : {}) });
      const reply = parseStudyPlanReadReply(await api.post<unknown>('/api/studieplaner/lasa', request, controller.signal), request);
      if (controller.signal.aborted) return;
      if (reply.view === 'options') {
        setOptions(reply);
        if (reply.status === 'unavailable') setMessage('Underlag saknas för valt datum.');
      } else if (reply.view === 'impact') {
        if (reply.status === 'compared') setResult({ target: reply.target, impact: reply.impact });
        else setMessage('Underlag saknas för den valda ändringen.');
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) { onSessionLost(); return; }
      if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
        setOptions(null);
        setMessage('Jämförelsen är inte tillgänglig i ditt aktuella uppdrag.');
      } else {
        setMessage('Jämförelsen kunde inte hämtas. Kontrollera datum och vald ändring.');
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }

  function changeDate(value: string) {
    clearResult(); setOptions(null); setOn(value); setClassId(''); setGroupId(''); setMembershipId(''); setEndsOn('');
  }

  function chosenTarget(): StudyPlanImpactTarget | null {
    switch (kind) {
      case 'class_move': return classId ? { kind, classId } : null;
      case 'group_add': return groupId && endsOn && endsOn >= on ? { kind, groupId, startsOn: on, endsOn } : null;
      case 'group_move': return membershipId && groupId ? { kind, membershipId, toGroupId: groupId } : null;
      case 'group_end': return membershipId ? { kind, membershipId } : null;
    }
  }

  const items = options?.options ?? [];
  const memberships = items.filter((item): item is Extract<StudyPlanImpactOption, { kind: 'membership' }> => item.kind === 'membership'
    && (kind !== 'group_end' || item.startsOn <= on));
  const membership = memberships.find(item => item.membershipId === membershipId);
  const firstTargetDay = kind === 'group_move' && membership && membership.startsOn > on ? membership.startsOn : on;
  const groups = items.filter((item): item is Extract<StudyPlanImpactOption, { kind: 'group' }> => item.kind === 'group'
    && item.startsOn <= firstTargetDay && item.endsOn >= firstTargetDay
    && (kind !== 'group_move' || !membership || item.groupId !== membership.groupId));
  const group = groups.find(item => item.groupId === groupId);
  const target = chosenTarget();

  return <section className="grid min-w-0 gap-3" aria-busy={busy}>
    <Button variant="outline" className="w-fit" aria-expanded={open} onClick={() => {
      if (open) { clearResult(); setOptions(null); } setOpen(!open);
    }}>{open ? 'Stäng jämförelsen' : 'Jämför förändring'}</Button>
    {open && <div className="grid min-w-0 gap-3 rounded-lg border border-border p-3">
      <h3 className="font-semibold">Klass- och gruppändringar</h3>
      <p className="text-sm text-muted-foreground">Jämför först. Genomför ändringen i det ordinarie klass- eller gruppflödet.</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void read('options'); }}>
        <div><label htmlFor={id + '-on'}>Jämförelsedatum</label>
          <Input id={id + '-on'} type="date" className={control} required min={placementStartsOn} max={placementEndsOn ?? undefined}
            value={on} onChange={event => changeDate(event.target.value)} /></div>
        <Button variant="outline" type="submit" disabled={busy || !on}>Hämta alternativ</Button>
      </form>
      {options?.status === 'available' && <form className="grid min-w-0 gap-2" onSubmit={event => {
        event.preventDefault(); if (target) void read('impact', target);
      }}>
        <div className="grid min-w-0 gap-1">
          <label htmlFor={id + '-kind'}>Typ av förändring</label>
          <NativeSelect id={id + '-kind'} className={selectWidth} value={kind} onChange={event => {
            clearResult(); setKind(event.target.value as StudyPlanImpactTarget['kind']); setClassId(''); setGroupId(''); setMembershipId(''); setEndsOn('');
          }}>
            <NativeSelectOption value="class_move">Byt klass</NativeSelectOption>
            <NativeSelectOption value="group_add">Lägg till i undervisningsgrupp</NativeSelectOption>
            <NativeSelectOption value="group_move">Byt undervisningsgrupp</NativeSelectOption>
            <NativeSelectOption value="group_end">Avsluta gruppmedlemskap</NativeSelectOption>
          </NativeSelect>
        </div>
        {kind === 'class_move' && <div className="grid min-w-0 gap-1">
          <label htmlFor={id + '-class'}>Målklass</label>
          <NativeSelect id={id + '-class'} className={selectWidth} value={classId} required onChange={event => { clearResult(); setClassId(event.target.value); }}>
            <NativeSelectOption value="">Välj klass</NativeSelectOption>
            {items.map(item => item.kind === 'class' ? <NativeSelectOption key={item.classId} value={item.classId}>{item.name}</NativeSelectOption> : null)}
          </NativeSelect>
        </div>}
        {(kind === 'group_move' || kind === 'group_end') && <div className="grid min-w-0 gap-1">
          <label htmlFor={id + '-membership'}>Medlemskap</label>
          <NativeSelect id={id + '-membership'} className={selectWidth} value={membershipId} required onChange={event => {
            clearResult(); setMembershipId(event.target.value); setGroupId('');
          }}>
            <NativeSelectOption value="">Välj medlemskap</NativeSelectOption>
            {memberships.map(item => <NativeSelectOption key={item.membershipId} value={item.membershipId}>
              {item.name}{memberships.some(other => other.groupId === item.groupId && other.membershipId !== item.membershipId) && ' · från ' + item.startsOn}
            </NativeSelectOption>)}
          </NativeSelect>
          {membership && <p className="wrap-anywhere text-sm">{membership.name} · {membership.startsOn} till och med {membership.endsOn}</p>}
          <p className="text-sm text-muted-foreground">{kind === 'group_end' ? 'Jämförelsedatumet är sista medlemsdagen.' : 'Jämförelsedatumet är den önskade första dagen i målgruppen.'}</p>
        </div>}
        {(kind === 'group_move' || kind === 'group_add') && <div className="grid min-w-0 gap-1">
          <label htmlFor={id + '-group'}>Målgrupp</label>
          <NativeSelect id={id + '-group'} className={selectWidth} value={groupId} required onChange={event => {
            clearResult(); const newGroup = groups.find(item => item.groupId === event.target.value);
            setGroupId(event.target.value);
            setEndsOn(newGroup ? placementEndsOn && placementEndsOn < newGroup.endsOn ? placementEndsOn : newGroup.endsOn : '');
          }}>
            <NativeSelectOption value="">Välj undervisningsgrupp</NativeSelectOption>
            {groups.map(item => <NativeSelectOption key={item.groupId} value={item.groupId}>{item.name}</NativeSelectOption>)}
          </NativeSelect>
        </div>}
        {kind === 'group_add' && group && <div className="grid min-w-0 gap-1">
          <label htmlFor={id + '-end'}>Sista dag i gruppen</label>
          <Input id={id + '-end'} type="date" className={control} required min={on}
            max={placementEndsOn && placementEndsOn < group.endsOn ? placementEndsOn : group.endsOn}
            value={endsOn} onChange={event => { clearResult(); setEndsOn(event.target.value); }} />
        </div>}
        <Button variant="outline" className="w-fit" disabled={busy || !target} type="submit">Visa jämförelse</Button>
      </form>}
      {busy && <output>Hämtar jämförelseunderlag…</output>}
      {message && <output className="validation-warning">{message}</output>}
      {result && <>
        <Compared impact={result.impact} target={result.target} on={on} options={items} />
        {result.target.kind === 'class_move' ? onOpenClassChange
          ? <Button variant="outline" className="w-fit" onClick={onOpenClassChange}>Öppna klassbytet</Button>
          : <p className="text-sm text-muted-foreground">Klassbytet registreras från Klasstillhörighet på elevkortet.</p>
          : <Button variant="outline" className="w-fit" nativeButton={false} render={<Link href="/?vy=undervisningsgrupper" />}>
            Öppna undervisningsgrupper
          </Button>}
      </>}
    </div>}
  </section>;
}
