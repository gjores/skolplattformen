'use client';
// Panelen ”Undervisning som läsåret rymmer” i skyddad drift (fas 05.1.1, plan 05;
// UI-SPEC avsnitt 1 rad 13, A-05, A-09, A-17, A-18). Samma markup och klasser som
// demons panel (lasar-parts.tsx), men data kommer ur läsningens `teaching` och
// `groups` i stället för demons timplanstillstånd:
// - Skoldagar per veckodag ur modellens `summarize`.
// - Timplanens timmar ur skolans fastställda timplaner för läsåret; IM-klasser
//   har en veckoram och får ingen årstimme (A-17).
// - Lärotider per klass bara för klasser med stabilt classId som finns bland
//   läsningens grupper och har en timplanskoppling; annars den dokumenterade raden.
// - Schemats pass visas inte (05.2), och inga antal per klass ur personregistret (A-18).
// - I ramvyn visas bara veckodagarna (A-05).
//
// SS 12000 (SIS OpenAPI 2.1.0, SS12000:2020, avsedd kompatibilitet): classId
// motsvarar Group (groupType=Klass); offeringId är en lokal studieväg, inte Programme.
import { Fragment } from 'react';
import type { LasarTeaching } from '@/lib/lasar-contract.ts';
import { arskursGroupId, groupsFromRefs, klassGroupId, type LasarGroupRef } from '@/lib/lasar-groups.ts';
import {
  causeLabel,
  groupSummary,
  hoursPerSchoolDay,
  requiredWeeklyMinutes,
  schoolWeeks,
  weekdayNames,
  type SchoolYear,
  type StudentGroup,
  type Summary,
} from '@/lib/lasar-model.ts';
import { num } from './lasar-calendar.tsx';

export const LASAR_CLASS_MISSING = 'Lärotider per klass visas när klassernas avvikande dagar är knutna till klassregistret.';

const columnLabel = (columnId: string) =>
  columnId === 'vecka' ? 'Per vecka' : columnId.startsWith('ak') ? `Åk ${columnId.slice(2)}` : `År ${columnId.slice(2)}`;

function safeGroups(refs: LasarGroupRef[]): StudentGroup[] {
  try { return groupsFromRefs(refs); } catch { return []; }
}

type PlanRow = { id: string; education: string; column: string; hours: number; days: number; fewer: number };
type ImRow = { id: string; education: string; weekly: number };

export function ProtectedLasarTeaching({ sy, summary, teaching, groupRefs, frame }: {
  sy: SchoolYear;
  summary: Summary;
  teaching: LasarTeaching;
  groupRefs: LasarGroupRef[];
  /** Ramvyn (A-05): bara skoldagar per veckodag. */
  frame: boolean;
}) {
  const groups = safeGroups(groupRefs);
  const byId = new Map(groups.map((g) => [g.id, g]));
  const educationName = (offeringId: string) => groupRefs.find((r) => r.offeringId === offeringId)?.educationName ?? 'Timplan';
  const im = new Set(teaching.imClassIds);

  // En rad per timplanskolumn och fastställd timplan; varje årskurs räknas på sina egna undervisningsdagar.
  const planRows: PlanRow[] = [];
  const imRows: ImRow[] = [];
  const seen = new Set<string>();
  for (const c of teaching.classes) {
    if (seen.has(c.timplanId)) continue;
    seen.add(c.timplanId);
    if (im.has(c.classId)) {
      const weekly = c.rows.find((r) => r.columnId === 'vecka')?.hours ?? c.rows[0]?.hours ?? 0;
      imRows.push({ id: c.timplanId, education: educationName(c.offeringId), weekly });
      continue;
    }
    for (const r of c.rows) {
      const group = r.columnId === 'vecka' ? undefined : byId.get(arskursGroupId(c.offeringId, r.columnId));
      const own = group ? groupSummary(sy, group, groups) : undefined;
      planRows.push({
        id: `${c.timplanId}:${r.columnId}`, education: educationName(c.offeringId), column: group?.name ?? columnLabel(r.columnId),
        hours: r.hours, days: own?.days ?? summary.skoldagar, fewer: own?.fewer ?? 0,
      });
    }
  }

  // Klasser med stabilt ID bland läsningens grupper och en timplanskoppling (A-09).
  const classRows = teaching.classes.flatMap((c) => {
    const group = byId.get(klassGroupId(c.classId));
    if (!group) return [];
    const own = groupSummary(sy, group, groups);
    const hours = im.has(c.classId) || !c.columnId ? undefined : c.rows.find((r) => r.columnId === c.columnId)?.hours;
    return [{ c, group, own, hours, im: im.has(c.classId) }];
  });

  const max = Math.max(...summary.perWeekday);
  const min = Math.min(...summary.perWeekday);
  return (
    <section className="ly-teaching">
      <div className="section-heading">
        <h3>Undervisning som läsåret rymmer</h3>
        <span className="cell-secondary">
          {num(summary.skoldagar)} skoldagar = {num(schoolWeeks(summary.skoldagar), 1)} skolveckor om fem dagar
        </span>
      </div>
      <div className="ly-teaching-grid">
        <div>
          <h4>Skoldagar per veckodag</h4>
          <ol className="ly-weekdays">
            {summary.perWeekday.map((n, i) => (
              <li key={weekdayNames[i]} className={n === min && max - min >= 4 ? 'ly-weekday-low' : ''}>
                <span>{weekdayNames[i]}</span>
                <i aria-hidden="true" style={{ width: `${(n / Math.max(1, max)) * 100}%` }} />
                <strong>{num(n)}</strong>
              </li>
            ))}
          </ol>
          <p className="cell-secondary">
            En lektion om 60 minuter som ligger varje {weekdayNames[summary.perWeekday.indexOf(min)]} ger {num(min)} timmar under läsåret; varje {weekdayNames[summary.perWeekday.indexOf(max)]} ger {num(max)}. Skoldagarna ska vara så jämnt fördelade som möjligt.
          </p>
        </div>
        {!frame && (
          <div>
            <h4>Timplanens timmar med läsårets skoldagar</h4>
            {planRows.length === 0 && imRows.length === 0 ? (
              <p className="cell-secondary">Ingen fastställd timplan att räkna på. Fastställ en timplan under Timplaner.</p>
            ) : (
              <div className="tp-grid-scroll">
                <table className="tp-grid ly-teaching-table">
                  <thead>
                    <tr>
                      <th scope="col">Utbildning</th>
                      <th scope="col">Timmar per läsår</th>
                      <th scope="col">Undervisningsdagar</th>
                      <th scope="col">Kräver per vecka</th>
                      <th scope="col">Per skoldag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planRows.map((r, i) => {
                      const minutes = requiredWeeklyMinutes(r.hours, r.days);
                      const first = i === 0 || planRows[i - 1].education !== r.education;
                      return (
                        <Fragment key={r.id}>
                          {first && (
                            <tr className="tp-block-row">
                              <th scope="rowgroup" colSpan={5}>{r.education}</th>
                            </tr>
                          )}
                          <tr>
                            <th scope="row" className="tp-row-head"><span className="tp-row-name">{r.column}</span></th>
                            <td>{num(r.hours)}</td>
                            <td className={r.fewer ? 'ly-fewer' : ''}>
                              {num(r.days)}
                              {r.fewer ? <small className="tp-minutes">{num(r.fewer)} färre än skolan</small> : null}
                            </td>
                            <td>{num(minutes)} min<small className="tp-minutes">{num(minutes / 60, 1)} timmar</small></td>
                            <td>{num(hoursPerSchoolDay(r.hours, r.days), 1)} timmar</td>
                          </tr>
                        </Fragment>
                      );
                    })}
                    {imRows.map((r) => (
                      <Fragment key={r.id}>
                        <tr className="tp-block-row">
                          <th scope="rowgroup" colSpan={5}>{r.education}</th>
                        </tr>
                        <tr className="ly-im-row">
                          <th scope="row" className="tp-row-head">
                            <span className="tp-row-name">Veckoram</span>
                            <span className="tp-row-meta"><em>{num(r.weekly)} timmar per vecka</em></span>
                          </th>
                          <td><span className="tp-zero">–</span><small className="tp-minutes">ingen årstimme</small></td>
                          <td>{num(summary.skoldagar)}</td>
                          <td>{num(r.weekly * 60)} min<small className="tp-minutes">{num(r.weekly, 1)} timmar</small></td>
                          <td>{num(r.weekly / 5, 1)} timmar</td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="cell-secondary">
              Timplanen anger timmar om 60 minuter per läsår. Här fördelas de på läsårets skolveckor; raster ingår inte. Undervisning som ställs in måste läggas ut igen för att timmarna ska nås.
              {imRows.length > 0 && ' Introduktionsprogrammet har en veckoram; individuell fördelning visas inte här, och inga årstimmar beräknas.'}
            </p>
          </div>
        )}
      </div>
      {!frame && (classRows.length > 0 ? (
        <div className="ly-schedule">
          <h4>Lärotider per klass</h4>
          <div className="tp-grid-scroll">
            <table className="tp-grid ly-teaching-table">
              <thead>
                <tr>
                  <th scope="col">Klass</th>
                  <th scope="col">Undervisningsdagar</th>
                  <th scope="col">Skäl till avvikelse</th>
                  <th scope="col">Per skoldag</th>
                </tr>
              </thead>
              <tbody>
                {classRows.map(({ c, group, own, hours, im: isIm }) => (
                  <tr key={c.classId}>
                    <th scope="row" className="tp-row-head">
                      <span className="tp-row-name">{group.name}</span>
                      <span className="tp-row-meta"><em>{group.educationName}{group.columnId ? '' : isIm ? ' · veckoram' : ' · utanför timplanens årskurser'}</em></span>
                    </th>
                    <td className={own.fewer ? 'ly-fewer' : ''}>
                      {num(own.days)}
                      {own.fewer ? <small className="tp-minutes">{num(own.fewer)} färre än skolan</small> : null}
                    </td>
                    <td className="ly-causes">
                      {own.shortWeek && <span>Fyra dagar i veckan, ledig {weekdayNames[own.shortWeek.weekday]}</span>}
                      {own.byCause.filter((x) => !x.recurring).map((x) => (
                        <span key={x.cause}>{causeLabel[x.cause]} · {num(x.days)} dagar</span>
                      ))}
                      {!own.shortWeek && own.byCause.length === 0 && <span className="tp-zero">följer skolans dagar</span>}
                    </td>
                    <td>{hours ? `${num(hoursPerSchoolDay(hours, own.days), 1)} timmar` : <span className="tp-zero">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cell-secondary">
            Klasserna kommer ur klassregistret med sin timplanskoppling för läsåret och ärver sin årskurs avvikelser. Timmarna per skoldag är
            timplanens timmar för klassens årskurs fördelade på klassens egna undervisningsdagar. Introduktionsprogrammet har en veckoram och visas utan timmar per skoldag.
          </p>
        </div>
      ) : (
        <p className="cell-secondary ly-class-missing">{LASAR_CLASS_MISSING}</p>
      ))}
    </section>
  );
}
