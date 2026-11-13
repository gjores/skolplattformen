'use client';
// Elever och grupper, utelämnad undervisning och villkoren förslaget räknades med. Flyttat oförändrat från arbetsytan av 05.2-SM-YTA.
import type { SchemaForslag } from '@/lib/schema-contract.ts';
import { SAME_DAY, clock, daysText, hoursText, ruleText } from './delat.ts';

export function Underlag({ forslag }: { forslag: SchemaForslag }) {
  return <>
    <div className="schema-list"><h2>Elever och grupper</h2>
      {forslag.members.pupils === 0
        ? <p>Inga elever med klass eller grupp kunde läsas för läsåret. Ett valbart block läggs då som ett gemensamt pass och en grupp upptar hela sina klasser.</p>
        : <ul>
          <li>{forslag.members.pupils} elevers klasser och gruppmedlemskap under {forslag.period === 'lasar' ? 'läsåret' : 'terminen'} avgör vilka pass som inte får gå samtidigt.</li>
          {forslag.members.withoutChoice.map((x, i) => <li key={i}>{x.title}: {x.count} {x.count === 1 ? 'elev' : 'elever'} i blockets klasser har ingen grupp och räknas som lediga när blocket går.</li>)}
          {forslag.members.groupsWithoutMembers.length > 0 && <li>Grupper utan elever ({forslag.members.groupsWithoutMembers.length}): {forslag.members.groupsWithoutMembers.join(', ')}. En sådan grupp upptar hela sina klasser, eller ingen elev om den hör till ett block där andra grupper har elever.</li>}
          {forslag.members.classesWithoutPupils.length > 0 && <li>Klasser utan elever i registret: {forslag.members.classesWithoutPupils.join(', ')}. De räknas som odelade klasser.</li>}
        </ul>}</div>
    {forslag.omitted.length > 0 && <div className="schema-list"><h2>Inte med i förslaget ({forslag.omitted.length})</h2>
      <ul>{forslag.omitted.map((o, i) => <li key={i}>{o.title} · {o.classes.join(', ')}: {o.reason === 'too_short' ? `mindre än ${forslag.villkor.minLessonMin} min i veckan` : o.reason === 'no_days' ? 'inga skoldagar' : 'ingen tid angiven'}</li>)}</ul></div>}
    <div className="schema-list"><h2>Villkor och antaganden i förslaget</h2>
      <ul>
        <li>Skoldag {daysText(forslag.villkor.days)}. {forslag.villkor.breakMin} min rast mellan pass, starttider var {forslag.villkor.startGridMin}:e minut.</li>
        <li>{forslag.villkor.lunch ? `Lunch ${forslag.villkor.lunch.lengthMin} min mellan ${clock(forslag.villkor.lunch.startMin)} och ${clock(forslag.villkor.lunch.endMin)} för elever${forslag.villkor.lunch.teachers ? ' och lärare' : ''}.` : 'Ingen lunch läggs in.'}</li>
        <li>Pass om högst {forslag.villkor.maxLessonMin} min. Samma ämne samma dag: {SAME_DAY[forslag.villkor.sameDay].toLowerCase()}.{forslag.villkor.lateAfterMin !== null && ` Pass efter ${clock(forslag.villkor.lateAfterMin)} undviks.`}</li>
        {(forslag.villkor.studentMaxMinPerDay !== null || forslag.villkor.teacherMaxMinPerDay !== null) && <li>Högsta undervisningstid per dag:{forslag.villkor.studentMaxMinPerDay !== null && ` elever ${hoursText(forslag.villkor.studentMaxMinPerDay)}`}{forslag.villkor.studentMaxMinPerDay !== null && forslag.villkor.teacherMaxMinPerDay !== null && ','}{forslag.villkor.teacherMaxMinPerDay !== null && ` lärare ${hoursText(forslag.villkor.teacherMaxMinPerDay)}`}.</li>}
        <li>Timplanens tid läggs alltid ut, räknad på läsårskalenderns faktiska skoldagar: varje undervisning får timplanens tid avrundad uppåt till hela 5 minuter, varje termin. Grundschemat ger minst den tiden; det som blir över tas bort genom att pass slutar tidigare, hela pass först. Veckan visar passens justerade längd. {forslag.period === 'lasar' ? 'Undervisning med samma veckotid båda terminerna och samma lärare får samma pass hela läsåret; annars egna pass per termin.' : 'Samma veckoschema gäller hela terminen.'}</li>
        {forslag.villkor.egna.map((r, i) => <li key={i}>Eget villkor: {ruleText(r, forslag.resurser)}.{forslag.egnaUtanTraff.includes(i) && ' Träffade inget i underlaget och användes inte.'}</li>)}
        {forslag.villkor.egna.some(r => r.typ === 'marginal') && <li>Marginal till nästa lektion gäller passets lärare och elever. Den räknas in i dagens undervisningstid, och passet måste sluta marginalen före skoldagens slut.</li>}
        <li>{forslag.rooms.length > 0 ? `Salar: ${forslag.rooms.map(r => r.name).join(', ')}. Bara pass med ett salsvillkor får en sal.` : 'Inga salar är angivna; passen läggs utan sal.'}</li>
        <li>Flytt för hand kontrolleras mot samma regler som förslaget. En flytt som bryter en regel görs ändå och visas som regelavvikelse.</li>
        <li>Pass med streckad kant saknar lärare i tjänstefördelningen.</li>
      </ul></div>
  </>;
}
