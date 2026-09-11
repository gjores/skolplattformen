#!/usr/bin/env node
// Positiva regressionsflöden mot det disponibla lokala baseline-målet (BASE-01, D-07).
//
//   export PATH="/opt/homebrew/opt/node@25/bin:$PATH"
//   node work/pilot/verify-baseline-db.mjs
//
// Baseline-målet innehåller exakt de sex migrationer som taggen fas1-baslinje
// har, med anonym inloggning kvar så som arbetsversionen var. Skriptet loggar
// därför in på samma sätt som den gamla appen (signInAnonymously +
// bootstrap_demo_profile). Det är tillåtet ENDAST här: målet är disponibelt,
// lokalt och skapat av work/pilot/prepare-local.mjs (D-08). Mot det skyddade
// målet eller molnet är denna väg stängd respektive förbjuden — skriptet
// kräver assertTarget('baseline') och vägrar andra kedjor.
//
// Flödena skriver riktiga rader med egna fixturer (slumpad skolenhetskod),
// läser om dem och städar i finally exakt de skolenheter som skapades. Ett
// FAIL i ett flöde är ett resultat för baslinjerapporten (plan 01-09), inte
// något som döljs här.
//
// Exit 0 = alla flöden PASS, exit 1 = något flöde FAIL/REFUSED/setup-fel,
// exit 3 = BLOCKED (målet är inte förberett eller inte startat).

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';

// @supabase/supabase-js finns bara i web/node_modules; appens klientlager importeras inte.
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const resultPath = path.join(root, 'work', 'pilot', 'results', 'baseline-db.json');

// ---------------------------------------------------------------------------
// Målskydd: bara baseline, med exakt sex migrationer och känd baslinjerevision.
// ---------------------------------------------------------------------------
let manifest;
try {
  manifest = await assertTarget('baseline');
  if (!Array.isArray(manifest.migrations) || !(manifest.migrations.length === 6) || !manifest.baselineRef) {
    throw new Error(`REFUSED: baseline-målet har fel migrationskedja (${manifest.migrations?.length ?? 0} migrationer, baselineRef ${manifest.baselineRef ?? 'saknas'})`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(message.startsWith('BLOCKED:') ? 3 : 1);
}

// ---------------------------------------------------------------------------
// Hjälpare
// ---------------------------------------------------------------------------
const db = createClient(manifest.apiUrl, manifest.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const checked = async q => {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
};
const randomCode = () => String(90000000 + Math.floor(Math.random() * 9999999));
const DECIDED = '2026-09-11';

function psql(sql) {
  return execFileSync('psql', [manifest.dbUrl, '-Atc', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const flows = [];
async function flow(name, fn) {
  try {
    const detail = await fn();
    flows.push({ flow: name, status: 'PASS', detail });
    console.log(`PASS ${name}: ${detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    flows.push({ flow: name, status: 'FAIL', detail });
    console.error(`FAIL ${name}: ${detail}`);
  }
}

const unitIds = [];
async function createUnit(name) {
  const unit = await checked(
    db.from('school_units').insert({ organizer_id: org, code: randomCode(), name, municipality_code: '0000' }).select('id').single(),
  );
  unitIds.push(unit.id);
  return unit.id;
}
const saveClassTimplan = row =>
  checked(db.from('class_timplans').upsert(row, { onConflict: 'unit_id,class_name,start_year' }).select());
const loadClassTimplans = unitId => checked(db.from('class_timplans').select('*').eq('unit_id', unitId));
const copyCohort = (sourceId, year) => checked(db.rpc('copy_offering_cohort', { source_id: sourceId, target_year: year }));

// ---------------------------------------------------------------------------
// Inloggning som den gamla appen gjorde — bara mot det disponibla baseline-målet.
// ---------------------------------------------------------------------------
let org;
let sessionUserId = null;
{
  const signIn = await db.auth.signInAnonymously();
  if (signIn.error) {
    console.error(`Anonym inloggning misslyckades i baseline-målet: ${signIn.error.message}`);
    process.exit(1);
  }
  sessionUserId = signIn.data.user?.id ?? null;
  await checked(db.rpc('bootstrap_demo_profile', { display_name: 'Baslinjeprov' }));
  org = await checked(db.rpc('current_organizer_id'));
  assert.ok(org, 'current_organizer_id gav inget');
}

// ---------------------------------------------------------------------------
// Flöden
// ---------------------------------------------------------------------------
try {
  // 1. Utbildning + kurs/nivå-tillägg + fastställande + skrivskydd
  let unitA; let sourceId; let ppId;
  await flow('utbildning-och-kurs-niva', async () => {
    unitA = await createUnit('Tillfällig kontroll av elevkullar');
    const source = await checked(
      db.from('offerings').insert({
        organizer_id: org, unit_id: unitA, kind: 'gymnasium', name: 'Kontroll SA',
        program_code: 'SA25', orientation_code: 'SASAP', cohort: 'Elever som börjar HT 2026',
      }).select('id').single(),
    );
    sourceId = source.id;
    const pp = await checked(
      db.from('point_plans').insert({ organizer_id: org, offering_id: sourceId, version: 1, specialization: ['ENGE3000X'] }).select('id').single(),
    );
    ppId = pp.id;
    // kurs/nivå-tillägg i utkastet
    await checked(db.from('point_plans').update({ specialization: ['ENGE3000X', 'HIST3000X'] }).eq('id', ppId));
    const reread = await checked(db.from('point_plans').select('specialization,status').eq('id', ppId).single());
    assert.deepEqual(reread.specialization, ['ENGE3000X', 'HIST3000X']);
    assert.equal(reread.status, 'utkast');
    // fastställ
    await checked(db.from('point_plans').update({ status: 'faststalld', decided_on: DECIDED }).eq('id', ppId));
    const decided = await checked(db.from('point_plans').select('status,decided_on').eq('id', ppId).single());
    assert.equal(decided.status, 'faststalld');
    assert.equal(decided.decided_on, DECIDED);
    // fastställd plan ändras inte (trigger guard_decided_point_plan)
    await assert.rejects(
      () => checked(db.from('point_plans').update({ specialization: ['ENGE3000X'] }).eq('id', ppId)),
      /fastställd poängplan ändras inte/,
    );
    const still = await checked(db.from('point_plans').select('specialization').eq('id', ppId).single());
    assert.deepEqual(still.specialization, ['ENGE3000X', 'HIST3000X']);
    return 'gymnasieutbildning skapad, kurs/nivå tillagd (2 nivåer vid omläsning), fastställd, ändring av fastställd plan nekad';
  });

  // 2. Kullkopiering som fristående utkast
  let tpId; let copiedId; let copiedTpId;
  await flow('kullkopiering-fristaende', async () => {
    assert.ok(sourceId, 'förutsätter flöde 1');
    const tp = await checked(
      db.from('timplans').insert({ organizer_id: org, offering_id: sourceId, version: 1, basis: 'Poängplan v1' }).select('id').single(),
    );
    tpId = tp.id;
    await checked(db.from('timplan_cells').insert({ timplan_id: tpId, row_id: 'ENGE3000X', hours: [0, 50, 50] }));
    await checked(db.from('timplans').update({ status: 'faststalld', decided_on: DECIDED }).eq('id', tpId));

    copiedId = await copyCohort(sourceId, 2027);
    const copied = await checked(db.from('offerings').select('*').eq('id', copiedId).single());
    assert.equal(copied.cohort, 'Elever som börjar HT 2027');
    assert.equal(copied.status, 'planerad');
    assert.equal(copied.unit_id, unitA);
    const copiedPP = await checked(db.from('point_plans').select('*').eq('offering_id', copiedId).single());
    assert.equal(copiedPP.status, 'utkast');
    assert.equal(copiedPP.decided_on, null);
    assert.deepEqual(copiedPP.specialization, ['ENGE3000X', 'HIST3000X']);
    const copiedTP = await checked(db.from('timplans').select('*').eq('offering_id', copiedId).single());
    copiedTpId = copiedTP.id;
    assert.equal(copiedTP.status, 'utkast');
    const copiedCells = await checked(db.from('timplan_cells').select('row_id,hours').eq('timplan_id', copiedTpId));
    assert.deepEqual(copiedCells, [{ row_id: 'ENGE3000X', hours: [0, 50, 50] }]);

    await assert.rejects(() => copyCohort(sourceId, 2027), /redan/);
    await assert.rejects(() => copyCohort(sourceId, 2026), /efter/);

    const originalCells = await checked(db.from('timplan_cells').select('row_id,hours').eq('timplan_id', tpId));
    assert.deepEqual(originalCells, [{ row_id: 'ENGE3000X', hours: [0, 50, 50] }]);
    const originalTP = await checked(db.from('timplans').select('status').eq('id', tpId).single());
    assert.equal(originalTP.status, 'faststalld');
    assert.equal((await loadClassTimplans(unitA)).length, 0);
    return 'kopia HT 2027 planerad med poängplan/timplan som utkast (decided_on null, samma nivåer/celler); dubblett och tidigare kull nekas; källan oförändrad; inga klasskopplingar skapade';
  });

  // 3. Klass–timplanskoppling som fast version
  await flow('klass-timplan-fast-version', async () => {
    assert.ok(copiedTpId, 'förutsätter flöde 2');
    const b = { unit_id: unitA, class_name: 'SA27A', start_year: 2027, timplan_id: copiedTpId, column_id: 'ar1' };
    await assert.rejects(() => saveClassTimplan(b), /fastställd/);
    await checked(db.from('timplans').update({ status: 'faststalld', decided_on: DECIDED }).eq('id', copiedTpId));
    await saveClassTimplan(b);
    let rows = await loadClassTimplans(unitA);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].timplan_id, copiedTpId);
    assert.equal(rows[0].column_id, 'ar1');
    await assert.rejects(() => saveClassTimplan({ ...b, column_id: 'ak8' }), /årskurs/);
    await saveClassTimplan({ ...b, column_id: 'ar2' });
    rows = await loadClassTimplans(unitA);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].column_id, 'ar2');
    const otherUnit = await createUnit('Tillfällig kontroll av skolgräns');
    await assert.rejects(() => saveClassTimplan({ ...b, unit_id: otherUnit }), /annan skolenhet/);
    // Ett senare beslut får inte tyst flytta klassen till nyaste versionen.
    await checked(db.from('timplans').update({ status: 'ersatt' }).eq('id', copiedTpId));
    rows = await loadClassTimplans(unitA);
    assert.equal(rows[0].timplan_id, copiedTpId);
    await checked(db.from('class_timplans').delete().match({ unit_id: unitA, class_name: 'SA27A', start_year: 2027 }));
    assert.equal((await loadClassTimplans(unitA)).length, 0);
    return 'koppling nekas före beslut, sparas efter, ogiltig kolumn och annan skolenhet nekas, ersatt version behåller samma timplan_id, borttagning ger 0 rader';
  });

  // 4. Grundskola: timplan utan poängplan och årskurskolumner
  await flow('grundskola-timplan', async () => {
    const unitG = await createUnit('Tillfällig kontroll av grundskola');
    const gr = await checked(
      db.from('offerings').insert({
        organizer_id: org, unit_id: unitG, kind: 'grundskola', name: 'Kontroll GR',
        grades: [1, 2, 3, 4, 5, 6, 7, 8, 9], cohort: 'Läsåret 2026/27',
      }).select('id').single(),
    );
    const tpG = await checked(
      db.from('timplans').insert({ organizer_id: org, offering_id: gr.id, version: 1, basis: 'Timplan grundskola' }).select('id').single(),
    );
    await checked(db.from('timplan_cells').insert({ timplan_id: tpG.id, row_id: 'GRGRSVE01', hours: [100, 100, 100, 100, 100, 100, 100, 100, 100] }));
    await checked(db.from('timplans').update({ status: 'faststalld', decided_on: DECIDED }).eq('id', tpG.id));
    const g = { unit_id: unitG, class_name: '4A', start_year: 2026, timplan_id: tpG.id, column_id: 'ak4' };
    await saveClassTimplan(g);
    const rows = await loadClassTimplans(unitG);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].column_id, 'ak4');
    assert.equal(rows[0].timplan_id, tpG.id);
    await assert.rejects(() => saveClassTimplan({ ...g, column_id: 'ar1' }), /årskurs/);
    assert.equal((await loadClassTimplans(unitG))[0].column_id, 'ak4');
    return 'grundskoleutbildning (åk 1–9, ingen poängplan) med fastställd timplan; klass 4A kopplad till ak4; gymnasiekolumn ar1 nekas';
  });
} finally {
  // Städning: exakt de skolenheter som skapades här, plus deras klasskopplingar.
  for (const id of unitIds) {
    try {
      await checked(db.from('class_timplans').delete().eq('unit_id', id));
      await checked(db.from('school_units').delete().eq('id', id));
    } catch (error) {
      console.error(`Städning misslyckades för skolenhet ${id}: ${error.message}`);
    }
  }
  await db.auth.signOut({ scope: 'local' });
  // Sessionens anonyma provanvändare och dess demoprofil lämnas kvar: den
  // refereras av organisation_events (kopieringens händelselogg, actor =
  // auth.uid()) och loggrader ska inte raderas av ett prov. Målet är
  // disponibelt och återställs med prepare-local.mjs --fresh.
  console.log(`Sessionens anonyma provanvändare: ${sessionUserId} (kvar i det disponibla målet)`);
  console.log(`Tillfälliga skolenheter borttagna: ${unitIds.length}; kvar med namn 'Tillfällig kontroll%': ${psql("select count(*) from public.school_units where name like 'Tillfällig kontroll%'")}`);
}

const status = flows.length === 4 && flows.every(f => f.status === 'PASS') ? 'PASS' : 'FAIL';
const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const result = {
  kind: 'baseline-db',
  date: new Date().toISOString(),
  target: { projectId: manifest.projectId, migrations: manifest.migrations.length, baselineRef: manifest.baselineRef },
  revision,
  flows,
  status,
};
fs.mkdirSync(path.dirname(resultPath), { recursive: true });
fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`\n${status}: ${flows.filter(f => f.status === 'PASS').length}/${flows.length} flöden. Skrivet till ${path.relative(root, resultPath)}`);
process.exit(status === 'PASS' ? 0 : 1);
