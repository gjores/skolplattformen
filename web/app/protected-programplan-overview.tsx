'use client';

import { BookOpen, GraduationCap, Layers, ListChecks, UserRound, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Programplan } from '@/lib/programplan-contract.ts';
import type { ProgramplanWorkspace } from '@/lib/programplan-workspace-contract.ts';

type Props = { workspace: ProgramplanWorkspace; plan: Programplan | null; sourceAvailable: boolean; onNext: () => void };
export default function ProgramplanOverview({ workspace, plan, sourceAvailable, onNext }: Props) {
  const program = sourceAvailable ? workspace.catalog.program : null;
  const orientation = program?.orientations.find(o=>o.code===workspace.education.orientationCode);
  const choices = plan?.basisReference?.specializationRefs;
  const sourceSelected = workspace.catalog.status === 'selected' && !!program;
  return <section className="pp-overview" aria-label="Programplanens delar och val">
    <h3>Programplanens delar — vad kan du välja?</h3>
    <p>Se först vad som hör till programmet. Välj sedan vilka fördjupningsnivåer skolan ska erbjuda i den här utbildningen.</p>
    <div className="pp-map-group"><h4>Programgrund · läs från underlaget</h4>
      <div className="pp-map-grid">
        <article className="pp-map-card"><BookOpen aria-hidden="true"/><h5>Gymnasiegemensamma ämnen</h5><span className="pp-map-tag">Gemensam grund</span><p>Ämnen som ingår på nationella program. Omfattningen beror på programmet.</p>{sourceSelected?<a href="#pp-national-0">Visa ämnena i underlaget</a>:<small>Välj underlag via Nästa steg för att se ämnena.</small>}</article>
        <article className="pp-map-card"><GraduationCap aria-hidden="true"/><h5>Programgemensamma ämnen</h5><span className="pp-map-tag">Gemensamt inom programmet</span><p>Ämnen som ger just det här programmet dess gemensamma innehåll.</p>{sourceSelected?<a href="#pp-national-1">Visa ämnena i underlaget</a>:<small>Ämnena visas när du har valt underlag.</small>}</article>
        <article className="pp-map-card"><Layers aria-hidden="true"/><h5>Inriktningsämnen</h5><span className="pp-map-tag">Följer utbildningens inriktning</span><p>{orientation?`Vald inriktning: ${orientation.name}.`:sourceSelected&&program.orientations.length===0?'Programmet har ingen inriktning.':workspace.education.orientationCode?'Inriktningen är angiven för utbildningen. Namnet visas när underlaget har valts.':'Ingen inriktning är angiven för utbildningen.'}</p>{orientation?<a href="#pp-national-2">Visa inriktningens ämnen</a>:<small>Inriktningen ändras inte i den här vyn.</small>}</article>
      </div>
    </div>
    <div className="pp-map-bridge" aria-hidden="true">+</div>
    <div className="pp-map-group"><h4>Fördjupning, elevens val och eget arbete</h4>
      <div className="pp-map-grid">
        <article className="pp-map-card pp-map-editable"><ListChecks aria-hidden="true"/><h5>Programfördjupning</h5><span className="pp-map-tag">Du väljer nivåer här</span><p>Skolans utbud av fördjupning. Här lägger du till enskilda nivåer i utbildningens utkast.</p><p className="pp-map-state">{choices?choices.length===1?'Sparat i planen: 1 nivå.':`Sparat i planen: ${choices.length} nivåer.`:plan?'Äldre val finns. Koppla dem till underlag före ändring.':'Inga fördjupningsval sparade ännu.'}</p><Button variant="outline" onClick={onNext}>Visa nästa steg för fördjupningen</Button><small>Paket kan ännu inte väljas här.</small></article>
        <article className="pp-map-card pp-map-individual"><UserRound aria-hidden="true"/><h5>Individuellt val</h5><span className="pp-map-tag">Eleven väljer ur skolans utbud</span><p>Val som gäller den enskilda eleven. De hanteras separat från utbildningens fördjupningslista.</p><small>Elevens val görs inte i den här vyn.</small></article>
        <article className="pp-map-card"><PencilLine aria-hidden="true"/><h5>Gymnasiearbete</h5><span className="pp-map-tag">Ingår i utbildningen</span><p>Elevens avslutande arbete hör till programmet och är en egen del av utbildningen.</p><small>Arbetet planeras inte i den här vyn.</small></article>
      </div>
    </div>
    <aside className="pp-map-alternatives"><strong>Val finns också i programgrunden.</strong><p>Exempelvis svenska eller svenska som andraspråk. Alternativ i underlaget väljs inte automatiskt. De visas vid ämnet och kan inte avgöras med fördjupningsväljaren.</p></aside>
    <p className="pp-map-caption">Översikt över nationella program; ingen automatisk kontroll av hela utbildningens regler eller poängram. <a href="https://utbildningsguiden.skolverket.se/gymnasieskolan/gymnasieskolans-program/gymnasieprogrammens-olika-delar" target="_blank" rel="noreferrer">Läs Skolverkets förklaring av programmens delar</a>.</p>
  </section>;
}
