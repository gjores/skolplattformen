'use client';

import { ArrowRight, CalendarClock, GraduationCap, ShieldCheck, Users } from 'lucide-react';
import type { ActiveContext } from './context-switch';
import type { ProtectedView } from './protected-home';
import './workspace-start.css';
import { DecisionInbox } from './plan-decision-context';
import type { PlanDecisionItem } from '@/lib/plan-decision.ts';

export default function WorkspaceStart({ context, onNavigate, onOverview, onDecision }: {
  context: ActiveContext; onNavigate: (view: ProtectedView) => void; onOverview: () => void; onDecision: (item: PlanDecisionItem) => void;
}) {
  return <section className="workspace-start" aria-label="Start">
    <header><h1>Vad vill du arbeta med?</h1><p>Välj en uppgift för att komma igång.</p></header>
    <DecisionInbox roleLabel={context.label} onOpen={onDecision}/>
    <div className="workspace-task-grid">
      {['rektor', 'administrator'].includes(context.function) && <button className="workspace-task" onClick={() => onNavigate('elever')}>
        <Users aria-hidden="true"/><span><strong>Hitta en elev</strong><span>Sök elever, öppna elevkort och arbeta med elevregistret.</span></span><ArrowRight aria-hidden="true"/>
      </button>}
      <button className="workspace-task" onClick={onOverview}>
        <CalendarClock aria-hidden="true"/><span><strong>Planera läsåret</strong><span>Se nya och fortsättande kullar, poäng och planerade timmar.</span></span><ArrowRight aria-hidden="true"/>
      </button>
      {context.function !== 'administrator' && <button className="workspace-task" onClick={() => onNavigate('mandat')}>
        <ShieldCheck aria-hidden="true"/><span><strong>Hantera uppdrag</strong><span>Se vem som har tillgång och tilldela eller avsluta uppdrag.</span></span><ArrowRight aria-hidden="true"/>
      </button>}
    </div>
    <section className="workspace-start-planning" aria-labelledby="start-planning-title">
      <div><GraduationCap aria-hidden="true"/><h2 id="start-planning-title">Arbeta med utbildningarnas planer</h2></div>
      <p>Programplanen beskriver ämnen och poäng. I timplanen fördelar skolan undervisningstiden.</p>
      <div className="workspace-plan-shortcuts">
        <button onClick={() => onNavigate('programplaner')}><span><strong>Programplaner</strong><span>Ämnen, nivåer och poäng för gymnasiet</span></span><ArrowRight aria-hidden="true"/></button>
        <button onClick={() => onNavigate('timplaner')}><span><strong>Timplaner</strong><span>Undervisningstid för skolans utbildningar</span></span><ArrowRight aria-hidden="true"/></button>
      </div>
      <p className="workspace-start-note">Skola och läsår följer med mellan planeringsvyerna. Elevregistret har ett eget läsårsval.</p>
    </section>
  </section>;
}
