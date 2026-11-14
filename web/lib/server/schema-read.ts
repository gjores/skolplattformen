/**
 * Läsningen bakom schemaunderlaget, gemensam för förslag och kontroll (05.2-SM-KOPPLING K2, -ELEVER-KALENDER E1/E4, -FLYTT F2).
 * Tjänstefördelningen läses med sin behörighet och granskningshändelse; elevernas gruppmedlemskap och läsårskalendern läses
 * i samma transaktion med sina egna läsfunktioner, behörigheter och granskningshändelser.
 */
import type { Context } from './authz.ts';
import { readElectiveBlocks } from './elective-block.ts';
import { logEvent } from './events.ts';
import { lasarRead } from './lasar.ts';
import { readStudyGroups } from './study-groups.ts';
import { planRead } from './tjanst.ts';
import type { SchemaForslagRequest } from '../schema-contract.ts';
import { schemaTime } from '../schema-kalender.ts';
import { mergeSchemaMembers, type SchemaBasis } from '../schema-underlag.ts';

export async function readSchemaBasis(request: Request, tx: Parameters<typeof planRead>[0], ctx: Context, input: SchemaForslagRequest) {
  const scope = { unitId: input.unitId, schoolYear: input.schoolYear }, target = { kind: 'school' as const, unitId: input.unitId };
  const result = await planRead(tx, scope, ctx);
  const elective = await readElectiveBlocks(tx, ctx, scope), study = await readStudyGroups(tx, ctx, scope);
  // Den gällande fastställda kalendern går före ett senare utkast.
  let lasar = await lasarRead(tx, { target, schoolYear: input.schoolYear, versionId: null }, ctx);
  const current = lasar.body.versions.find(v => v.current);
  if (current && lasar.body.calendar?.versionId !== current.versionId) lasar = await lasarRead(tx, { target, schoolYear: input.schoolYear, versionId: current.versionId }, ctx);
  for (const extra of [elective.event, study.event, lasar.event]) await logEvent(tx, { ...ctx, request }, { ...extra, outcome: 'ok' });
  const basis: SchemaBasis = { members: mergeSchemaMembers([{ pupils: elective.body.pupils, memberships: elective.body.placements }, { pupils: study.body.pupils, memberships: study.body.memberships }]),
    time: schemaTime(lasar.body, result.body.classes.map(c => c.classId)) };
  // Elevernas namn, bara de som läsningarna gav med användarens egen behörighet (Följ passet, 05.2-SM-FOLJ). Stannar på servern utom i elevväljaren.
  const pupilNames = new Map([...elective.body.pupils ?? [], ...study.body.pupils].map(p => [p.id, p.name] as const));
  return { plan: result.body, basis, event: result.event, pupilNames };
}
