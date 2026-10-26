// 05.1-09: syntetiska användare och data för det faktiska provet av tjänstefördelningen.
// Riktig Keycloak -> GoTrue -> Worker på 127.0.0.1:3015 mot provets egen schemakopia (aldrig den skyddade databasen
// eller 3012). Bara slumpade syntetiska IdP-användare och en tillfällig exakt callback-adress läggs i den lokala realmen,
// och allt tas bort efteråt. Inga personnummer utöver repots syntetiska TEST-lista, inga riktiga namn och inga hemligheter
// i manifest eller journal (lösenord och TOTP-hemligheter finns bara i den privata journalen under /private/tmp/).
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, openSync, closeSync, unlinkSync, lstatSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertTarget } from './verify-target.mjs';
import { verifyClassCohortCallbackProof } from './phase5-class-cohort-oidc-fixtures.mjs';
import { createTjanstFixture, grantSelf, planRead, seedGy25Class, staffWithDuties } from './tjanst-fixtures.mjs';

import { capturePlanContext, yearCommand, yearCommandSend } from './tjanst-year-fixtures.mjs';
import { parseYearRequest, parseYearReply } from '../../web/lib/tjanst-year-contract.ts';
import { verifyProgramplanCatalog, resolveProgramplanBasis } from '../../web/lib/programplan-catalog.ts';
import { programplanTermRows, validateProgramplanTermDistribution } from '../../web/lib/programplan-terms.ts';
import { parseYearPlanReadReply } from '../../web/lib/tjanst-contract.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const OTP = createRequire(path.join(root, 'web/package.json'))('otpauth');
const hash = s => createHash('sha256').update(s).digest('hex');
export const TJANST_ACTUAL_BASE = 'http://127.0.0.1:3015';
/** De sju syntetiska rollerna i provet (plan 09): huvudman, rektor A, rektor B, rektor AB, administratör A, self-lärare P1 och grupplärare. */
export const TJANST_ACTUAL_ROLES = ['hm', 'principalA', 'principalB', 'principalAB', 'admin', 'teacherSelf', 'teacherGroup'];
const LOCK = path.join(root, 'work/pilot/targets/protected/idp/named-timplan-run.lock');
/** Projekten i Playwright-konfigurationen (UI-SPEC Responsive: 1440 × 900, 1024 × 768, 390 × 844 och 320 × 740). */
export const TJANST_ACTUAL_PROJECTS = ['desktop', 'desktop-small', 'phone', 'phone-small'];
export const TJANST_ACTUAL_LOGIN_ROLES = Object.freeze({desktop:['hm','principalA','principalB','principalAB','admin','teacherSelf'],
  'desktop-small':['hm','principalA','admin'],phone:['hm','principalA','principalB','teacherSelf'],'phone-small':['hm','principalA','principalB','teacherSelf']});
/** Namngivna fall per projekt. Rapporten kräver ett godkänt fall per namn; saknade redovisas som ej körda. */
const PHONE_CASES = ['Min tjänst på telefon', 'Per lärare på telefon utan redigeringskontroller', 'Bemanning på telefon utan redigeringskontroller', '44 px på telefon'];
/** 05.1-12 (WR-07): huvudmannens Visa fördelningen läser den publicerade versionen med versionId, också när rektor har ett utkast. */
const BEMANNING_PUBLISHED = 'Bemanning: Visa fördelningen visar publicerad version trots utkast';
/** 05.1-12 (CR-01, WR-02): Egen tjänst på två skolor och samläsningens regler mot riktig server. */
const TWO_SCHOOLS = 'Egen tjänst på två skolor: rektor B ger mandatet i Mandat och läraren kvitterar på B (CR-01)';
const JOINT_RULES = 'samläsning: lärarbyte på samläst rad nekas och ogiltig samläsning stoppar publicering (WR-02)';
const PHONE_TWO_SCHOOLS = 'Min tjänst med två skolkort på telefon';
export const TJANST_ACTUAL_CASES = {
  desktop: ['spår', 'GR/IM-klass i Timplaner med behov', 'okopplad klass utan nollor', 'ny version: läraren ser den tidigare', 'äldre version skrivskyddad (D-24)',
    'fördela tom cell', 'person utan konto får rader', 'annan skola och annat läsår nekas', 'specialuppdrag', 'två lärare på samma kurs', 'samläsning räknas en gång',
    'utkastlärare från rektor', 'administratör utan knapp och 403 vid publicering', 'kvittens till tjanst_feedback', 'versionshistorik med aktör och tid',
    'huvudmannens Bemanning utan beslutsknapp och 403 vid publicering', 'personal: utan konto och utkastlärare', 'andelar 60 % + 40 % sparas och 60 % + 50 % nekas med engångskod',
    'rektor B ser bara Andel här 40 %', 'tillstånd: 403', 'två flikar: den andra får 409', 'avbrutet svar återhämtas via status', 'tillstånd: laddning', 'tillstånd: loggfel',
    'tillstånd: MFA', 'tillstånd: context_changed', BEMANNING_PUBLISHED, 'tangentbord, fokus och 44 px', TWO_SCHOOLS, JOINT_RULES],
  'desktop-small': ['fördela', 'samläsning', 'publicera', 'tangentbord, fokus och 44 px'],
  phone: [...PHONE_CASES, BEMANNING_PUBLISHED, PHONE_TWO_SCHOOLS],
  'phone-small': [...PHONE_CASES, PHONE_TWO_SCHOOLS],
};

/** Stable required cases: 45 original regressions plus 38 year cases across four projects. */
export const TJANST_YEAR_CASES = Object.freeze([
  'YEAR-01 verkliga Gy25-GR-IM-behov och tomma nya lärarfält',
  'YEAR-02 historik föreslår utan att tilldela',
  'YEAR-03 aktivt val och direkt Spara tjänsteraden',
  'YEAR-04 manuellt påbörjad plan bevaras',
  'YEAR-05 namntvilling, ny klass och obelagd nivå binds till rätt ID',
  'YEAR-06 delår, giltighetsdatum och okänd behörighet',
  'YEAR-07 valfri historik fallerar men manuellt val fungerar',
  'YEAR-08 vanlig ändring efter publicering bevarar self-vyn',
  'YEAR-09 ändrad personandel via annan session nekar fryst rad',
  'YEAR-10 ändrad klasskälla via annan session nekar fryst rad',
  'YEAR-11 ny historisk publicering via annan session nekar fryst förslagsval',
  'YEAR-12 kontextlös payload nekas utan delresultat',
  'YEAR-13 explicit helgruppsflytt flyttar samläsningen och bevarar andra lärares rader',
  'YEAR-14 massarbete 100 plus 1 i påbörjad plan',
  'YEAR-15 loggfel stoppar radstöd och batchpreview',
  'YEAR-16 tappat normalt svar återhämtas med samma kommando',
  'YEAR-17 vanligt kommando och batch delar journalspärr',
  'YEAR-18 administratörens lärarval och nekade roller/skolor',
  'YEAR-19 WR10 repareras genom explicit flytt och tomkolumnsborttagning',
  'YEAR-20 tomkolumnsborttagning nekar kvarvarande uppdrag och replay är ofarligt',
  'YEAR-21 sena svar, uppdaterat stöd och storleksbyte bevarar aktiva inmatningar',
  'YEAR-22 samläsning med olika lärare nekas och äldre blandad grupp blockerar publicering',
  'YEAR-23 kursklick, samläsningsmärke och varning för APL-skillnad',
]);
export const TJANST_PHONE_YEAR_CASES = Object.freeze([
  'PHONE-YEAR-01 publicerad tjänst består under pågående ändring',
  'PHONE-YEAR-02 nya rad-, batch- och tomkolumnsåtgärder saknas',
  'PHONE-YEAR-03 aktuell publicering kan läsas och kvitteras',
  'PHONE-YEAR-04 år, delår och innehåll läsbara utan sidledsrullning',
]);
TJANST_ACTUAL_CASES.desktop.push(...TJANST_YEAR_CASES);
TJANST_ACTUAL_CASES['desktop-small'].push(...[1,2,3,4,6,13,14,17,21].map(n => TJANST_YEAR_CASES[n-1]));
TJANST_ACTUAL_CASES.phone.push(...TJANST_PHONE_YEAR_CASES);
TJANST_ACTUAL_CASES['phone-small'].push(...TJANST_PHONE_YEAR_CASES);
for (const cases of Object.values(TJANST_ACTUAL_CASES)) Object.freeze(cases);
Object.freeze(TJANST_ACTUAL_CASES);

const freezeTree = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freezeTree); Object.freeze(value); } return value; };
/** Explicit capture only. The caller then builds ONCE; request/status/retry never invoke this helper. */
export async function captureTjanstPlanHttp(fixture, page, role, request) {
  const {unitId,schoolYear,action} = request, payload = structuredClone(request.payload);
  assert.notEqual(action,'create_draft','create_draft is historical only');
  const read = async input => {
    const query = parseYearRequest(input), reply = await fixture.request(page,role,'/api/tjanst/plan/forhandsvisa',query);
    assert.equal(reply.status,200,'Explicit HTTP planning support failed: '+JSON.stringify(reply.body));
    return parseYearReply(reply.body,query);
  };
  let support;
  if (action === 'save_row') {
    support = await read({unitId,schoolYear,mode:'row',sourceKey:payload.sourceKey,rowId:payload.rowId});
    const candidate = support.candidates.find(p => p.personId === payload.personId);
    const choice = request.choice === 'unassigned' ? {kind:'unassigned',personId:null}
      : request.choice === 'manual' ? (assert.ok(candidate,'Explicit manual person is unavailable'),
        {kind:'manual',personId:candidate.personId,expectedPersonBasisHash:candidate.personBasisHash}) : structuredClone(request.choice);
    assert.ok(choice && choice.personId === payload.personId,'Explicit matching choice required');
    if (choice.kind === 'suggestion') assert.ok(support.suggestions.some(s => s.suggestionId === choice.suggestionId
      && s.personId === choice.personId && s.evidenceHash === choice.expectedEvidenceHash),'Explicit suggestion is unavailable');
    payload.planningContext = {baseVersionId:support.baseVersionId,expectedBasisHash:support.basisHash,choice};
  } else if (action === 'move' || action === 'bulk') {
    const {expectedPreviewHash: _oldHash, ...batch} = payload;
    assert.equal(batch.action,action);
    support = await read({unitId,schoolYear,mode:'batch',batch});
    assert.deepEqual(support.blockers,[],'Positive capture requires an unblocked explicit batch');
    payload.expectedPreviewHash = support.previewHash;
  } else {
    support = await read({unitId,schoolYear,mode:'catalog'});
    payload.mutationContext = {baseVersionId:support.baseVersionId,expectedBasisHash:support.basisHash};
  }
  const captured = {unitId,schoolYear,action,expectedRevision:support.currentRevision,payload};
  if (action === 'publish') {
    const reply = await fixture.request(page,role,'/api/tjanst/plan/lasa',{unitId,schoolYear});
    assert.equal(reply.status,200);
    const current = parseYearPlanReadReply(reply.body,{unitId,schoolYear});
    assert.equal(current.revision,support.currentRevision,'Capture conflict: revision changed');
    assert.equal(current.version?.id,support.baseVersionId,'Capture conflict: version changed');
    assert.equal(current.version?.status,'draft','Publish capture requires the current draft');
    captured.expectedContentHash = current.version.contentHash;
  }
  return freezeTree(captured);
}

async function ownedDatabase(db) {
  const [{name}] = await db`select current_database() name`;
  assert.match(name,/^named_timplan_[a-f0-9]{32}$/u,'Only the owned schema-only actual-test database is accepted');
  return name;
}
const fixtureContexts = new WeakMap();

function keycloakClient(target) {
  return async (route, method = 'GET', body) => {
    const auth = await fetch(target.idp.publicUrl + '/realms/master/protocol/openid-connect/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: target.idp.adminUser, password: target.idp.adminPassword }), signal: AbortSignal.timeout(15000) });
    assert.ok(auth.ok);
    const token = (await auth.json()).access_token;
    const res = await fetch(target.idp.publicUrl + '/admin/realms/' + new URL(target.idp.issuer).pathname.split('/').pop() + route, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    assert.ok(res.ok, 'Local IdP operation rejected: ' + res.status);
    const text = await res.text(); return text ? JSON.parse(text) : null;
  };
}

/**
 * Syntetiskt underlag i provets egen schemakopia (migrationerna ska vara installerade). Allt skapas i en committad
 * transaktion i en egen kund: skolor A/B/C, roller, en godkänd Gy25-klass (BF25) på skola A, fastställda GR- och
 * IM-timplaner och läsårskalender för samma läsår (klasserna skapas och kopplas av rektor i provet), en okopplad
 * GR-klass och personal. P1 har mandatet Egen tjänst. Med published=true finns dessutom en publicerad version 1
 * (förberedd med samma kommandofunktioner som Worker anropar) för telefonprojekten, som bara läser. Med linkGrim=true skapas
 * och kopplas GR-klassen SYNGR8 (åk 8) och IM-klassen SYNIM med rektors GR/IM-kommando (för desktop-small; på desktop görs
 * det i Timplaner i webbläsaren).
 * 05.1-12: P1 har andelarna 60 % på A och 40 % på B. Med schoolB=true har skola B dessutom en publicerad version 1 med en rad
 * för P1, skapad med rektor B:s kommandon. Mandatet Egen tjänst för B ges inte här, utan av rektor B i provet (CR-01).
 */
export async function seedTjanstActual(connection, { published = false, linkGrim = false, schoolB = false } = {}) {
  await ownedDatabase(connection);
  const seeded = await connection.begin(async tx => {
    await tx`set constraints all deferred`;
    const f = await createTjanstFixture(tx);
    const gy = await seedGy25Class(tx, f, 'SYNBF1');
    const Y = gy.year, A = f.schools.A;
    await f.actor(tx, 'hm');
    const grOffering = randomUUID(), imOffering = randomUUID(), grPlan = randomUUID(), imPlan = randomUUID(), loose = randomUUID();
    await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,start_year) values
     (${grOffering},${f.id(2)},${A},'grundskola','Syntetisk grundskola 7–9',${'Läsåret ' + Y + '/' + String(Y + 1).slice(2)},${[7, 8, 9]}::smallint[],${Y}),
     (${imOffering},${f.id(2)},${A},'introduktionsprogram','Syntetiskt introduktionsprogram',${'Läsåret ' + Y + '/' + String(Y + 1).slice(2)},null,${Y})`;
    await tx`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis) values(${grPlan},${f.id(2)},${grOffering},${A},1,'Syntetisk GR-timplan'),(${imPlan},${f.id(2)},${imOffering},${A},1,'Syntetisk IM-timplan')`;
    await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values
     (${grPlan},'matematik',${[100, 90, 80]}::smallint[]),(${grPlan},'engelska',${[60, 60, 60]}::smallint[]),(${grPlan},'biologi',${[70, 100, 70]}::smallint[]),
     (${imPlan},'im-ma',${[3]}::smallint[]),(${imPlan},'im-sv',${[5]}::smallint[]),(${imPlan},'im-en',${[2]}::smallint[])`;
    await tx`set local session_replication_role=replica`;
    await tx`update public.timplans set status='faststalld',decided_on=${Y + '-06-01'} where id in (${grPlan},${imPlan})`;
    const sy = (await tx`insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end,status,decided_on)
     values(${f.id(2)},${A},${Y},${Y + '-08-17'},${Y + '-12-22'},${(Y + 1) + '-01-11'},${(Y + 1) + '-06-11'},'faststalld',${Y + '-05-01'}) returning id`)[0].id;
    await tx`insert into public.school_year_days(school_year_id,day,kind) values(${sy},${Y + '-10-30'},'lovdag'),(${sy},${(Y + 1) + '-02-19'},'studiedag')`;
    await tx`set local session_replication_role=origin`;
    // En GR-klass för läsåret utan koppling: behovet är okänt, inte noll.
    await tx`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values(${loose},${f.id(1)},${f.id(2)},${A},${grOffering},'SYN9X',${Y})`;
    let grimClasses = null;
    if (linkGrim) {
      await f.actor(tx, 'principalA');
      const grim = q => tx`select public.phase51_grim_class_command(${tx.json(q)}) value`.then(r => r[0].value);
      const gr = await grim({ action: 'create', commandId: randomUUID(), planId: grPlan, expectedPlanRevision: 0, name: 'SYNGR8' });
      const im = await grim({ action: 'create', commandId: randomUUID(), planId: imPlan, expectedPlanRevision: 0, name: 'SYNIM' });
      const grId = gr.id, imId = im.id;
      assert.ok(grId && imId, 'GR/IM-klasserna skapades inte: ' + JSON.stringify({ gr, im }));
      await grim({ action: 'link', commandId: randomUUID(), classId: grId, planId: grPlan, expectedPlanRevision: 0, columnId: 'ak8', expectedLinkRevision: null, previousPlanId: null });
      await grim({ action: 'link', commandId: randomUUID(), classId: imId, planId: imPlan, expectedPlanRevision: 0, columnId: 'vecka', expectedLinkRevision: null, previousPlanId: null });
      grimClasses = { gr: grId, im: imId };
    }
    // Skola B (för rektor B): fastställd GR-plan och klassen SYNB8 kopplad till åk 8 med rektor B:s GR/IM-kommando.
    let schoolBClass = null;
    if (schoolB) {
      await f.actor(tx, 'hm');
      const bOffering = randomUUID(), bPlan = randomUUID();
      await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,start_year) values
       (${bOffering},${f.id(2)},${f.schools.B},'grundskola','Syntetisk grundskola B 7–9',${'Läsåret ' + Y + '/' + String(Y + 1).slice(2)},${[7, 8, 9]}::smallint[],${Y})`;
      await tx`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis) values(${bPlan},${f.id(2)},${bOffering},${f.schools.B},1,'Syntetisk GR-timplan B')`;
      await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${bPlan},'matematik',${[100, 90, 80]}::smallint[])`;
      await tx`set local session_replication_role=replica`;
      await tx`update public.timplans set status='faststalld',decided_on=${Y + '-06-01'} where id=${bPlan}`;
      await tx`set local session_replication_role=origin`;
      await f.actor(tx, 'principalB');
      const grim = q => tx`select public.phase51_grim_class_command(${tx.json(q)}) value`.then(r => r[0].value);
      const created = await grim({ action: 'create', commandId: randomUUID(), planId: bPlan, expectedPlanRevision: 0, name: 'SYNB8' });
      await grim({ action: 'link', commandId: randomUUID(), classId: created.id, planId: bPlan, expectedPlanRevision: 0, columnId: 'ak8', expectedLinkRevision: null, previousPlanId: null });
      schoolBClass = created.id;
    }
    // Personal: P1 (Egen tjänst på A och, i provet, på B), Tor Berg utan konto, Ulla Sund på skola A. Sara Dahl läggs upp av huvudmannen i provet.
    const p1 = await staffWithDuties(tx, f, { givenName: 'Pia', familyName: 'Ek', duties: [{ unitId: A, percent: 60, startsOn: '2026-07-01' }, { unitId: f.schools.B, percent: 40, startsOn: '2026-07-01' }] });
    let schoolBPublished = null;
    if (schoolB) {
      await f.actor(tx, 'principalB');
      const current = await planRead(tx,{unitId:f.schools.B,schoolYear:Y});
      const first = current.classes.find(c => c.classId === schoolBClass).needs.find(n => n.rowKey === 'matematik');
      await yearCommandSend(tx,await yearCommand(await capturePlanContext(tx,{unitId:f.schools.B,schoolYear:Y,action:'save_row',choice:'manual',
        payload:{rowId:null,sourceKind:'class_timplan',sourceKey:first.sourceKey,personId:p1.personId,teacherHt:1800,teacherVt:1200,comment:''}})));
      const r = (await yearCommandSend(tx,await yearCommand(await capturePlanContext(tx,{unitId:f.schools.B,schoolYear:Y,action:'publish',payload:{}})))).result;
      schoolBPublished = { id: r.detail.version.id, versionNo: r.detail.version.versionNo };
    }
    const t2 = await staffWithDuties(tx, f, { givenName: 'Tor', familyName: 'Berg', duties: [{ unitId: A, percent: 100, startsOn: '2026-07-01' }] });
    const t3 = await staffWithDuties(tx, f, { givenName: 'Ulla', familyName: 'Sund', duties: [{ unitId: A, percent: 100, startsOn: '2026-07-01' }] });
    await grantSelf(tx, f, { unitIds: [A], staffPersonId: p1.personId });
    const need = gy.timeRows[gy.aplKey];
    let publishedVersion = null;
    if (published) {
      await f.actor(tx, 'principalA');
      const current = await planRead(tx,{unitId:A,schoolYear:Y});
      const first = current.classes.find(c => c.classId === gy.classId).needs.find(n => n.rowKey === gy.aplKey);
      await yearCommandSend(tx,await yearCommand(await capturePlanContext(tx,{unitId:A,schoolYear:Y,action:'save_row',choice:'manual',
        payload:{rowId:null,sourceKind:'class_timplan',sourceKey:first.sourceKey,personId:p1.personId,teacherHt:3000,teacherVt:2400,comment:''}})));
      const r = (await yearCommandSend(tx,await yearCommand(await capturePlanContext(tx,{unitId:A,schoolYear:Y,action:'publish',payload:{}})))).result;
      publishedVersion = { id: r.detail.version.id, versionNo: r.detail.version.versionNo };
    }
    const foreignCanary = await seedForeignCanary(tx,f,Y);
    await tx`set constraints all immediate`;
    const actors = Object.fromEntries(['hm', 'principalA', 'principalB', 'principalAB', 'admin', 'teacherSelf', 'teacherGroup']
      .map(role => [role, { identityId: f.identity(role), membershipId: f.membership(role), assignmentId: f.roles[role] }]));
    const result = { foreignCanary, prefix: f.prefix, year: Y, customerId: f.id(1), organizerId: f.id(2), schools: f.schools, actors,
      gy: { classId: gy.classId, planId: gy.planId, offeringId: gy.offeringId, aplKey: gy.aplKey, schoolMinutes: need?.schoolMinutes ?? null },
      grim: { grPlan, imPlan, grOffering, imOffering, looseClassId: loose, classes: grimClasses, schoolBClass },
      people: { p1: p1.personId, t2: t2.personId, t3: t3.personId }, publishedVersion, schoolBPublished };
    fixtureContexts.set(result,f);
    return result;
  });
  return seeded;
}

/** A deliberately separate historical snapshot in the owned DB. No live/cohort helper is called.
 * The source is catalog-validated; historical decision rows are setup, never claimed as an actual decision flow. */
async function seedHistoricalGy25(t,f,seed) {
  const catalog = JSON.parse(readFileSync(path.join(root,'web/lib/programplan-catalog.generated.json'),'utf8'));
  const [{source_programplan_id:templateId}] = await t`select source_programplan_id from public.timplans where id=${seed.gy.planId}`;
  const [template] = await t`select basis_reference,term_distribution from public.point_plans where id=${templateId}`;
  const basis = {...template.basis_reference,startedOn:`${seed.year-1}-08-17`};
  const program = catalog.programs.find(p => p.code===basis.programRef.code&&p.version===basis.programRef.version);
  assert.ok(program);
  const verified = await verifyProgramplanCatalog(catalog);
  assert.equal(resolveProgramplanBasis(verified,basis).status,'resolved');
  const rowKey='foundation:IDRO:1:IDRO1000X';
  const distribution = template.term_distribution.map(r=>r.rowKey===rowKey?{...r,points:[25,25,25,25,0,0]}:r);
  assert.ok(distribution.some(r=>r.rowKey===rowKey));
  validateProgramplanTermDistribution(programplanTermRows(program,basis),distribution);
  const offeringId=randomUUID(),programId=randomUUID(),planId=randomUUID(),seriesId=randomUUID();
  await f.actor(t,'hm');
  await t`set local session_replication_role=replica`;
  await t`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year)
    values(${offeringId},${seed.organizerId},${seed.schools.A},'gymnasium','Syntetisk historisk BF25',${`Syntetisk kull ${seed.year-1}`},'BF25',${basis.orientationCode},${seed.year-1})`;
  await t`insert into public.offering_units(offering_id,unit_id,organizer_id) values(${offeringId},${seed.schools.A},${seed.organizerId})`;
  await t`insert into public.point_plans select (jsonb_populate_record(null::public.point_plans,to_jsonb(p)||jsonb_build_object(
    'id',${programId}::uuid,'offering_id',${offeringId}::uuid,'basis_reference',${t.json(basis)},'term_distribution',${t.json(distribution)},
    'decided_on',${`${seed.year-1}-06-01`}::date))).* from public.point_plans p where p.id=${templateId}`;
  const [{source}] = await t`select public.phase5_gym_timplan_source(${programId}) source`;
  await t`select public.phase5_gym_timplan_require_source(${t.json(source)})`;
  assert.deepEqual((await t`select public.phase5_plan_decision_source_blockers(${t.json(source)}) blockers`)[0].blockers,[]);
  await t`insert into public.timplan_series(id,organizer_id,offering_id,unit_id,name,normalized_name)
    values(${seriesId},${seed.organizerId},${offeringId},${seed.schools.A},'Syntetisk historik','syntetisk historik')`;
  await t`insert into public.timplans select (jsonb_populate_record(null::public.timplans,to_jsonb(p)||jsonb_build_object(
    'id',${planId}::uuid,'offering_id',${offeringId}::uuid,'source_programplan_id',${programId}::uuid,'series_id',${seriesId}::uuid,
    'gym_basis',${t.json(source)},'decided_on',${`${seed.year-1}-06-01`}::date))).* from public.timplans p where p.id=${seed.gy.planId}`;
  await t`insert into public.timplan_cells select (jsonb_populate_record(null::public.timplan_cells,to_jsonb(c)||jsonb_build_object('timplan_id',${planId}::uuid))).*
    from public.timplan_cells c where c.timplan_id=${seed.gy.planId}`;
  await t`update public.timplan_cells set hours=${[25,25,25,25,0,0]}::smallint[],allocated=array[true,true,true,true,false,false] where timplan_id=${planId} and row_id=${rowKey}`;
  await t`insert into public.timplan_time_models(plan_id,model,origin) values(${planId},'school_terms_annual_apl_v2','new')`;
  await t`insert into public.timplan_time_cells_v2(plan_id,row_key,school_minutes,annual_apl_minutes)
    select ${planId},row_key,case when row_key=${rowKey} then '[1500,1500,1500,1500,null,null]'::jsonb else school_minutes end,
      case when row_key=${rowKey} then '[0,0,null]'::jsonb else annual_apl_minutes end
    from public.timplan_time_cells_v2 where plan_id=${seed.gy.planId}`;
  await t`set local session_replication_role=origin`;
  await f.actor(t,'principalA');
  const [{revision}] = await t`select revision from public.timplans where id=${planId}`;
  const command = async q => (await t`select public.phase5_class_command(${t.json(q)}) value`)[0].value;
  const klass=await command({operation:'create',commandId:randomUUID(),planId,expectedPlanRevision:revision,name:'SYNHBF',startYear:seed.year-1});
  for(const [schoolYear,columnId] of [[seed.year-1,'ar1'],[seed.year,'ar2']]) await command({operation:'link',commandId:randomUUID(),classId:klass.id,schoolYear,planId,
    expectedPlanRevision:revision,columnId,expectedLinkRevision:null,previousPlanId:null});
  return {scope:{unitId:seed.schools.A,schoolYear:seed.year},priorScope:{unitId:seed.schools.A,schoolYear:seed.year-1},classId:klass.id,planId,offeringId,programId,
    rowKey,sourceKey:`class_timplan:${klass.id}:${seed.year}:${rowKey}`,priorSourceKey:`class_timplan:${klass.id}:${seed.year-1}:${rowKey}`,
    unprovenRowKey:'foundation:ENGE:1:ENGE2000X',unprovenSourceKey:`class_timplan:${klass.id}:${seed.year}:foundation:ENGE:1:ENGE2000X`,
    setup:'synthetic frozen historical program/timplan; catalog and term distribution validated; class links use real SQL commands'};
}

/** Call once after the old project regressions. Adds needs/history, never writes the current plan. */
export async function seedTjanstYearCases(connection,seed) {
  await ownedDatabase(connection);
  assert.ok(fixtureContexts.has(seed),'Year scenarios require this process-owned seed');
  assert.equal(seed.yearCases,undefined,'Year scenarios already seeded');
  const f=fixtureContexts.get(seed),A=seed.schools.A,Y=seed.year;
  const result=await connection.begin(async t=>{
    await t`set constraints all deferred`;
    const scope={unitId:A,schoolYear:Y},priorScope={unitId:A,schoolYear:Y-1};
    const people={};
    for(const [key,givenName,familyName,percent,startsOn,endsOn] of [
      ['fullYear','Ylva','Helår',70,`${Y-1}-07-01`,null],
      ['partYear','Yngve','Delår',30,`${Y+1}-01-11`,`${Y+1}-03-01`],
      ['twinA','Syntetisk','Samma namn',60,`${Y-1}-07-01`,null],
      ['twinB','Syntetisk','Samma namn',20,`${Y}-07-01`,null],
      ['moveTarget','Yasmine','Mottagare',100,`${Y-1}-07-01`,null],
    ]) people[key]=await staffWithDuties(t,f,{givenName,familyName,startsOn:`${Y-1}-07-01`,duties:[{unitId:A,percent,startsOn,endsOn}]});
    await f.actor(t,'principalA');
    const grim=async q=>(await t`select public.phase51_grim_class_command(${t.json(q)}) value`)[0].value;
    const classes=[];
    for(let n=1;n<=35;n++) {
      const name='SYNY'+String(n).padStart(2,'0');
      const c=await grim({action:'create',commandId:randomUUID(),planId:seed.grim.grPlan,expectedPlanRevision:0,name});
      await grim({action:'link',commandId:randomUUID(),classId:c.id,planId:seed.grim.grPlan,expectedPlanRevision:0,columnId:'ak8',expectedLinkRevision:null,previousPlanId:null});
      classes.push({id:c.id,name});
    }
    const im=await grim({action:'create',commandId:randomUUID(),planId:seed.grim.imPlan,expectedPlanRevision:0,name:'SYNYIM'});
    await grim({action:'link',commandId:randomUUID(),classId:im.id,planId:seed.grim.imPlan,expectedPlanRevision:0,columnId:'vecka',expectedLinkRevision:null,previousPlanId:null});
    const gy25=await seedHistoricalGy25(t,f,seed);
    // A distinct GR class shares its display name across years, never its identity.
    await f.actor(t,'hm');
    const priorOffering=randomUUID(),priorPlan=randomUUID();
    await t`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,start_year)
      values(${priorOffering},${seed.organizerId},${A},'grundskola','Syntetisk tidigare GR',${`Syntetiskt ${Y-1}`},${[7,8,9]}::smallint[],${Y-1})`;
    await t`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis) values(${priorPlan},${seed.organizerId},${priorOffering},${A},1,'Syntetisk tidigare GR')`;
    await t`insert into public.timplan_cells(timplan_id,row_id,hours) values(${priorPlan},'matematik',${[100,90,80]}::smallint[])`;
    await t`set local session_replication_role=replica`;
    await t`update public.timplans set status='faststalld',decided_on=${`${Y-1}-06-01`} where id=${priorPlan}`;
    await t`set local session_replication_role=origin`;
    await f.actor(t,'principalA');
    const oldClass=await grim({action:'create',commandId:randomUUID(),planId:priorPlan,expectedPlanRevision:0,name:classes[0].name});
    await grim({action:'link',commandId:randomUUID(),classId:oldClass.id,planId:priorPlan,expectedPlanRevision:0,columnId:'ak8',expectedLinkRevision:null,previousPlanId:null});
    const priorRows=[{sourceKey:`class_timplan:${oldClass.id}:${Y-1}:matematik`,personId:people.twinA.personId},
      {sourceKey:gy25.priorSourceKey,personId:people.fullYear.personId},
      {sourceKey:`class_timplan:${gy25.classId}:${Y-1}:foundation:ENGE:1:ENGE1000X`,personId:people.fullYear.personId}];
    for(const row of priorRows) await yearCommandSend(t,await yearCommand(await capturePlanContext(t,{...priorScope,action:'save_row',choice:'manual',
      payload:{rowId:null,sourceKind:'class_timplan',...row,teacherHt:600,teacherVt:600,comment:'Syntetisk tidigare planering'}})));
    const published=(await yearCommandSend(t,await yearCommand(await capturePlanContext(t,{...priorScope,action:'publish',payload:{}})))).result.detail;
    const current=await planRead(t,scope),allNeeds=current.classes.flatMap(c=>c.needs.map(n=>({...n,classId:c.classId,className:c.className??c.name})));
    const targetNeeds=classes.flatMap(c=>allNeeds.filter(n=>n.classId===c.id)).sort((a,b)=>a.sourceKey.localeCompare(b.sourceKey)).slice(0,101);
    assert.equal(targetNeeds.length,101);assert.equal(new Set(targetNeeds.map(n=>n.sourceKey)).size,101);
    const need=(classId,rowKey)=>{const n=allNeeds.find(n=>n.classId===classId&&n.rowKey===rowKey);assert.ok(n,'Real year need is missing');return {...scope,...n,rowId:null};};
    const result={scope,priorScope,people,classes,
      core:{...scope,gr:need(classes[0].id,'matematik'),im:need(im.id,'im-ma'),gy25:need(gy25.classId,gy25.rowKey)},
      grim:{...scope,grPlanId:seed.grim.grPlan,imPlanId:seed.grim.imPlan,grClassId:classes[0].id,imClassId:im.id,priorClassId:oldClass.id,priorPlanId:priorPlan},
      gy25:{...gy25,need:need(gy25.classId,gy25.rowKey),unprovenNeed:need(gy25.classId,gy25.unprovenRowKey)},
      bulk:{...scope,needs:targetNeeds,sourceKeys:targetNeeds.map(n=>n.sourceKey)},
      joint:{...scope,needs:[need(classes[1].id,'engelska'),need(im.id,'im-en')],movingPersonId:people.fullYear.personId,retainedPersonId:people.partYear.personId,targetPersonId:people.moveTarget.personId},
      history:{...priorScope,versionId:published.version.id,rows:published.rows,priorClassId:oldClass.id,newClassId:classes[0].id},
      foreignCanary:seed.foreignCanary};
    await t`set constraints all immediate`;
    return result;
  });
  seed.yearCases=result;
  return result;
}

/** Scoped foreign business fingerprint, with real person/employment/duty and version/special rows. */
export async function tjanstForeignFingerprint(db,seed) {
  await ownedDatabase(db);
  const c=seed.foreignCanary;assert.ok(c);
  const [data]=await db`select jsonb_build_object(
    'customer',(select to_jsonb(x) from public.customers x where id=${c.customerId}),
    'organizer',(select to_jsonb(x) from public.organizers x where id=${c.organizerId}),
    'school',(select to_jsonb(x) from public.school_units x where id=${c.schoolId}),
    'people',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.staff_people x where customer_id=${c.customerId}),
    'employments',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.staff_employments x where customer_id=${c.customerId}),
    'duties',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.staff_school_duties x where customer_id=${c.customerId}),
    'distributions',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.tjanst_distributions x where customer_id=${c.customerId}),
    'versions',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.tjanst_versions x where distribution_id in(select id from public.tjanst_distributions where customer_id=${c.customerId})),
    'teachers',(select coalesce(jsonb_agg(to_jsonb(x) order by version_id,staff_person_id),'[]') from public.tjanst_version_teachers x where version_id=${c.versionId}),
    'rows',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.tjanst_rows x where version_id=${c.versionId}),
    'specials',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.tjanst_special_assignments x where version_id=${c.versionId}),
    'mandates',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.access_assignments x where customer_id=${c.customerId})
  ) value`;
  assert.ok(data.value.people.length&&data.value.versions.length&&data.value.specials.length,'Foreign canary must contain actual business rows');
  return {sha256:hash(JSON.stringify(data.value)),customerId:c.customerId,counts:Object.fromEntries(Object.entries(data.value).filter(([,v])=>Array.isArray(v)).map(([k,v])=>[k,v.length]))};
}

async function seedForeignCanary(t,f,Y) {
  const foreignF={actor:(tx)=>f.actor(tx,'foreignHm')};
  const person=await staffWithDuties(t,foreignF,{givenName:'Syntetisk',familyName:'Främmande',startsOn:`${Y-1}-07-01`,duties:[{unitId:f.schools.foreign,percent:50,startsOn:`${Y-1}-07-01`}]});
  const distributionId=randomUUID(),versionId=randomUUID();
  await t`set local session_replication_role=replica`;
  await t`insert into public.tjanst_distributions(id,customer_id,organizer_id,unit_id,school_year) values(${distributionId},${f.id(3)},${f.id(4)},${f.schools.foreign},${Y})`;
  await t`insert into public.tjanst_versions(id,distribution_id,version_no,status,created_by_identity_id,created_by_assignment_id)
    values(${versionId},${distributionId},1,'draft',${f.identity('foreignHm')},${f.roles.foreignHm})`;
  await t`insert into public.tjanst_version_teachers(version_id,staff_person_id) values(${versionId},${person.personId})`;
  await t`insert into public.tjanst_special_assignments(version_id,lineage_id,kind,label,staff_person_id,ht_minutes,vt_minutes)
    values(${versionId},${randomUUID()},'annat','Syntetiskt främmande uppdrag',${person.personId},60,120)`;
  await t`update public.tjanst_versions set status='published',published_at=clock_timestamp(),published_by_identity_id=${f.identity('foreignHm')},
    published_by_assignment_id=${f.roles.foreignHm},content_hash=public.tjanst_version_hash(id) where id=${versionId}`;
  await t`set local session_replication_role=origin`;
  return {customerId:f.id(3),organizerId:f.id(4),schoolId:f.schools.foreign,personId:person.personId,distributionId,versionId,setup:'synthetic foreign frozen canary'};
}

/** The only degraded source: optional history, in this owned test DB only. Core/actor/audit remain intact. */
export async function withTjanstHistoryFailure(db, callback) {
  await ownedDatabase(db);
  const inspect=async()=> (await db`select pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner::text owner
    from pg_proc p where p.oid='public.tjanst_year_history(uuid,integer)'::regprocedure`)[0];
  const before=await inspect();assert.ok(before);
  try {
    await db.unsafe(`create or replace function public.tjanst_year_history(unit uuid,year integer) returns jsonb
      language plpgsql stable security definer set search_path=pg_catalog,public as $fault$
      begin raise exception 'Synthetic optional history failure' using errcode='P5101';end $fault$`);
    return await callback();
  } finally { await db.unsafe(before.definition);assert.deepEqual(await inspect(),before,'History source definition/owner/ACL restored'); }
}

/** Får bara anropas när den ägande webbläsarprocessen har avslutats. Läser eller skriver aldrig verksamhetsdata. */
export async function recoverTjanstOidcFixture(journalPath) {
  assert.ok(journalPath.startsWith('/private/tmp/') && journalPath.endsWith('/oidc-private.json'));
  assert.equal(realpathSync(journalPath), journalPath); const stat = lstatSync(journalPath);
  assert.ok(stat.isFile()); assert.equal(stat.mode & 0o077, 0); assert.equal(stat.uid, process.getuid());
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')); assert.equal(journal.kind, 'tjanst-owned-oidc'); assert.equal(journal.baseURL, TJANST_ACTUAL_BASE);
  assert.match(journal.runId, /^[a-f0-9-]{36}$/u); assert.ok(Array.isArray(journal.users) && journal.users.length <= TJANST_ACTUAL_ROLES.length);
  const verifiedCallbacks = journal.auth.filter(a => a.status === 'verified').length;
  if (journal.cleanup === 'complete') return { runId: journal.runId, cleanup: 'complete', deletedUsers: journal.users.length, verifiedCallbacks };
  for (const user of journal.users) { assert.ok(TJANST_ACTUAL_ROLES.includes(user.role)); assert.equal(user.username, 'tjanst-' + journal.runId + '-' + user.role.toLowerCase()); if (user.subject) assert.match(user.subject, /^[a-f0-9-]{36}$/u); }
  assert.equal(new Set(journal.users.map(u => u.username)).size, journal.users.length);
  const target = await assertTarget('protected', { requireIdp: true }), keycloak = keycloakClient(target);
  const clients = await keycloak('/clients?clientId=' + encodeURIComponent(target.idp.clientId)); assert.equal(clients.length, 1); assert.equal(clients[0].id, journal.clientId);
  for (const user of journal.users) {
    const matches = await keycloak('/users?username=' + encodeURIComponent(user.username) + '&exact=true'); assert.ok(matches.length <= 1);
    if (matches.length) { assert.equal(matches[0].username, user.username); if (user.subject) assert.equal(matches[0].id, user.subject); await keycloak('/users/' + matches[0].id, 'DELETE'); }
    assert.equal((await keycloak('/users?username=' + encodeURIComponent(user.username) + '&exact=true')).length, 0);
  }
  if (journal.redirectAdded) {
    const current = await keycloak('/clients/' + journal.clientId); assert.equal(current.clientId, target.idp.clientId);
    current.redirectUris = current.redirectUris.filter(uri => uri !== TJANST_ACTUAL_BASE + '/api/auth/callback'); await keycloak('/clients/' + journal.clientId, 'PUT', current);
    assert.equal((await keycloak('/clients/' + journal.clientId)).redirectUris.includes(TJANST_ACTUAL_BASE + '/api/auth/callback'), false);
  }
  let lockRemoved = false;
  try { if (readFileSync(LOCK, 'utf8') === journal.runId) { unlinkSync(LOCK); lockRemoved = true; } } catch (error) { if (error.code !== 'ENOENT') throw error; }
  journal.cleanup = 'complete'; journal.recoveredAfterWorkerExit = true;
  writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });
  return { runId: journal.runId, cleanup: 'complete', deletedUsers: journal.users.length, redirectRestored: true, recoveredAfterWorkerExit: true, lockRemoved, verifiedCallbacks };
}

/**
 * Binder seedens syntetiska identiteter till nya slumpade Keycloak-användare (utfärdare och subjekt byts till den lokala
 * realmens) och ger inloggning med riktig TOTP, step-up och direkta HTTP-anrop med sessionens epok.
 */
export async function createTjanstOidcFixture({ db, provenance, baseURL, evidenceDir, seed, roles = TJANST_ACTUAL_ROLES }) {
  const target = await assertTarget('protected', { requireIdp: true }), runId = randomUUID();
  assert.equal(baseURL, TJANST_ACTUAL_BASE); assert.equal((await db`select current_database() n`)[0].n, provenance.database);
  assert.ok(roles.every(r => TJANST_ACTUAL_ROLES.includes(r)));
  const lockFd = openSync(LOCK, 'wx', 0o600); writeFileSync(lockFd, runId);
  const journalPath = path.join(evidenceDir, 'oidc-private.json'), journal = { kind: 'tjanst-owned-oidc', baseURL, runId, users: [], auth: [], redirectAdded: false, cleanup: 'pending' }, actors = {};
  const save = () => writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 }); save();
  let client, closed = false;
  const keycloak = keycloakClient(target);
  const cleanup = async () => {
    if (closed) return { runId, cleanup: journal.cleanup, deletedUsers: journal.users.length, verifiedCallbacks: journal.auth.filter(a => a.status === 'verified').length };
    for (const user of journal.users) { const matches = await keycloak('/users?username=' + encodeURIComponent(user.username) + '&exact=true'); assert.ok(matches.length <= 1); if (matches.length) { assert.equal(matches[0].username, user.username); if (user.subject) assert.equal(matches[0].id, user.subject); await keycloak('/users/' + matches[0].id, 'DELETE'); } assert.equal((await keycloak('/users?username=' + encodeURIComponent(user.username) + '&exact=true')).length, 0); }
    if (journal.redirectAdded) { const current = await keycloak('/clients/' + client.id); assert.equal(current.clientId, target.idp.clientId); current.redirectUris = current.redirectUris.filter(x => x !== baseURL + '/api/auth/callback'); await keycloak('/clients/' + client.id, 'PUT', current); }
    assert.equal(readFileSync(LOCK, 'utf8'), runId); closeSync(lockFd); unlinkSync(LOCK); journal.cleanup = 'complete'; closed = true; save();
    return { runId, cleanup: journal.cleanup, deletedUsers: journal.users.length, redirectRestored: true, verifiedCallbacks: journal.auth.filter(a => a.status === 'verified').length };
  };
  try {
    const clients = await keycloak('/clients?clientId=' + encodeURIComponent(target.idp.clientId)); assert.equal(clients.length, 1); client = clients[0]; journal.clientId = client.id;
    if (!client.redirectUris.includes(baseURL + '/api/auth/callback')) { journal.redirectAdded = true; save(); await keycloak('/clients/' + client.id, 'PUT', { ...client, redirectUris: [...client.redirectUris, baseURL + '/api/auth/callback'] }); }
    assert.ok(seed?.actors, 'Seed krävs');
    for (const role of roles) {
      const seeded = seed.actors[role]; assert.ok(seeded, 'Okänd roll ' + role);
      const username = 'tjanst-' + runId + '-' + role.toLowerCase(), password = randomBytes(24).toString('base64url'), email = username + '@synthetic.example.test';
      assert.equal((await keycloak('/users?username=' + encodeURIComponent(username) + '&exact=true')).length, 0);
      const user = { username, password, email, subject: null, role, ...seeded }; journal.users.push(user); save();
      await keycloak('/users', 'POST', { username, email, firstName: 'Syntetisk', lastName: 'Tjänstprov', enabled: true, emailVerified: true, requiredActions: ['CONFIGURE_TOTP'] });
      const found = await keycloak('/users?username=' + encodeURIComponent(username) + '&exact=true'); assert.equal(found.length, 1); user.subject = found[0].id; save();
      await keycloak('/users/' + user.subject + '/reset-password', 'PUT', { type: 'password', value: password, temporary: false });
      const [bound] = await db`update public.identities set issuer=${target.idp.issuer},subject=${user.subject},email=${email} where id=${seeded.identityId} returning id`;
      assert.ok(bound, 'Seedens identitet saknas');
      assert.equal((await db`select public.assignment_is_valid(a) valid from public.access_assignments a where id=${seeded.assignmentId}`)[0].valid, true, 'Syntetisk aktör kräver ett giltigt mandat');
      actors[role] = user;
    }
    const view = async (page, role, select = false) => {
      const a = actors[role]; let r = await page.request.get(baseURL + '/api/session'); assert.equal(r.status(), 200); let v = await r.json(); assert.equal(v.identity.subject, a.subject);
      if (select && v.context?.assignmentId !== a.assignmentId) { r = await page.request.post(baseURL + '/api/context', { headers: { Origin: baseURL, 'Sec-Fetch-Site': 'same-origin', 'X-Context-Epoch': String(v.epoch) }, data: { assignmentId: a.assignmentId } }); assert.equal(r.status(), 200, 'Context selection: ' + JSON.stringify(await r.json())); r = await page.request.get(baseURL + '/api/session'); v = await r.json(); }
      assert.equal(v.context?.assignmentId, a.assignmentId); assert.equal(v.context.valid, true); a.epoch = v.epoch;
      const cookie = (await page.context().cookies(baseURL)).find(c => c.name === 'sp_session'); assert.ok(cookie);
      const [s] = await db`select id::text,identity_id::text,context_epoch::int epoch from public.app_sessions where token_hash=${Buffer.from(hash(cookie.value), 'hex')}`; assert.equal(s.identity_id, a.identityId); assert.equal(s.epoch, v.epoch);
      return { role, identityId: a.identityId, issuer: target.idp.issuer, subject: a.subject, sessionId: s.id, epoch: v.epoch, mfa: v.mfa.proof };
    };
    const audits = async role => Array.from(await db`select id::text,source,action,outcome,actor_identity_id::text,actor_issuer,actor_subject,session_id::text,details from public.security_events where actor_identity_id=${actors[role].identityId} and action='login' order by id`);
    const code = async a => { for (let n = 0; n < 130; n++) { const token = new OTP.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: OTP.Secret.fromBase32(a.secret) }).generate(); if (token !== a.lastCode) { a.lastCode = token; save(); return token; } await new Promise(resolve => setTimeout(resolve, 250)); } throw Error('Fresh OTP unavailable'); };
    const fill = async (page, a) => {
      const username = page.getByLabel(/Användarnamn|Username/i), password = page.getByRole('textbox', { name: /Lösenord|Password/i }), otp = page.getByLabel(/Engångskod|Engångslösenord|One-time code/i);
      await password.waitFor({ state: 'visible', timeout: 15000 }); if (await username.isVisible()) await username.fill(a.username); await password.fill(a.password); await page.getByRole('button', { name: /Logga in|Sign In/i }).click();
      const secret = page.locator('#kc-totp-secret-key'), manual = page.getByText(/Kan du inte (?:skanna|scanna)|Unable to scan/i);
      const next = await Promise.race([secret.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'secret'), manual.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'manual'), otp.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'otp'), page.waitForURL(u => u.origin === baseURL, { timeout: 15000 }).then(() => 'returned')]);
      if (next === 'returned') return;
      if (next === 'manual') await manual.click();
      if (next !== 'otp') { await secret.waitFor({ state: 'visible' }); a.secret = (await secret.innerText()).replaceAll(/\s/gu, ''); save(); await page.locator('input[name="totp"]').fill(await code(a)); const label = page.locator('input[name="userLabel"]'); if (await label.isVisible()) await label.fill('Isolerat tjänstprov'); await page.getByRole('button', { name: /Skicka|Spara|Logga in|Submit/i }).click(); }
      else { assert.ok(a.secret); await otp.fill(await code(a)); await page.getByRole('button', { name: /Logga in|Sign In/i }).click(); }
    };
    /**
     * Riktig inloggning. trigger: valfri UI-åtgärd (t.ex. knappen Verifiera med engångskod) som startar navigeringen i stället för page.goto.
     * @param {import('@playwright/test').Page} page
     * @param {string} role
     * @param {{ stepUp?: boolean, returnTo?: string, trigger?: (() => Promise<unknown>) | null }} [options]
     */
    const login = async (page, role, { stepUp = false, returnTo = '/', trigger = null } = {}) => {
      const a = actors[role], before = stepUp ? await view(page, role) : null, priorAudits = await audits(role), priorSessions = await db`select id::text from public.app_sessions where identity_id=${a.identityId}`;
      const attempt = { id: randomUUID(), role, identityId: a.identityId, issuer: target.idp.issuer, subject: a.subject, origin: baseURL, stepUp, viaUi: Boolean(trigger), priorAuditIds: priorAudits.map(x => x.id), priorSessionIds: priorSessions.map(s => s.id), ...(before ? { sessionId: before.sessionId, epoch: before.epoch } : {}), loginRequests: 0 };
      const callbacks = [], pending = []; journal.auth.push(attempt); save();
      const observe = req => { const u = new URL(req.url()); if (u.origin !== baseURL) return; if (u.pathname === '/api/auth/login') attempt.loginRequests++; if (u.pathname === '/api/auth/callback') { const c = { id: randomUUID(), attemptId: attempt.id, role, origin: u.origin, pathname: u.pathname, method: req.method(), navigation: req.isNavigationRequest(), status: null }; callbacks.push(c); pending.push(Promise.race([req.response(), new Promise(resolve => setTimeout(() => resolve(null), 3000))]).then(r => { if (r) c.status = r.status(); })); } };
      page.context().on('request', observe);
      try {
        if (trigger) await trigger(); else await page.goto(baseURL + '/api/auth/login?' + new URLSearchParams({ till: returnTo, ...(stepUp ? { step_up: '1' } : {}) }));
        await fill(page, a); await page.waitForURL(u => u.origin === baseURL && !u.pathname.startsWith('/api/auth'), { timeout: 30000 }); const proof = await view(page, role, true); await Promise.all(pending);
        const verified = verifyClassCohortCallbackProof({ attempt, callbacks, audits: (await audits(role)).filter(x => !attempt.priorAuditIds.includes(x.id)), session: proof, browserReturn: { origin: new URL(page.url()).origin, pathname: new URL(page.url()).pathname } }); Object.assign(attempt, { proof: verified, callbacks, status: 'verified' }); save();
        if (!proof.mfa) return login(page, role, { stepUp: true, returnTo });
        if (!trigger) await page.goto(baseURL + returnTo);
        return proof;
      } finally { page.context().off('request', observe); }
    };
    const request = async (page, role, route, input, headers = {}) => {
      assert.ok(route.startsWith('/api/') && !route.startsWith('/api/auth'));
      const r = await page.request.fetch(baseURL + route, { method: input === undefined ? 'GET' : 'POST', headers: { Origin: baseURL, 'Sec-Fetch-Site': 'same-origin', 'X-Context-Epoch': String(actors[role].epoch), ...headers }, ...(input === undefined ? {} : { data: input }), maxRetries: 0 });
      let body = null; try { body = await r.json(); } catch { body = null; }
      return { status: r.status(), body };
    };
    return {
      baseURL, seed, actors, login, request, view, cleanup,
      /** Gör sessionens MFA-bevis äldre än 8 timmar (samma mekanism som APL-provet), så att nästa skrivning kräver step-up. */
      async expireMfa(page, role) { const s = await view(page, role); await db`update public.app_sessions set auth_time=now()-interval '9 hours' where id=${s.sessionId} and identity_id=${actors[role].identityId}`; },
      proof: () => ({ runId, auth: journal.auth.map(({ id, role, stepUp, viaUi, status, proof }) => ({ id, role, stepUp, viaUi, status, proof })), cleanup: journal.cleanup }),
    };
  } catch (error) { try { await cleanup(); } catch { journal.cleanup = 'failed'; save(); } throw error; }
}
