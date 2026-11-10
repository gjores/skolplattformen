#!/usr/bin/env node
// 05.1.1-08 (LASAR-04): överföringen av group_key till stabila referenser för utbildning och klass, prövad i SQL.
//   node work/pilot/verify-lasar-groups.mjs --ephemeral --out /private/tmp/lasar-groups.json
// Egen PostgreSQL byggd från repots migrationer utan 20261112100000_lasar_groups.sql. Varje fixtur lägger syntetiska rader i
// gammal form (ägaren skriver de gamla kolumnerna, utan att stänga av några triggrar), kör migrationen i en transaktion som
// alltid rullas tillbaka och kontrollerar utfallet: antal före = efter, 0 kvar oöverförda, fastställda kalendrar med samma
// kontrollsumma, och att okända, tvetydiga eller främmande referenser avbryter hela migrationen. Inget installerat mål ändras.
import assert from 'node:assert/strict';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createLasarFixture } from './lasar-fixtures.mjs';
import { addDays, dayInfo, proposeSchoolYear } from '../../web/lib/lasar-model.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const GROUP_MIGRATION = '20261112100000_lasar_groups.sql';
const YEAR = 2027;
const rollback = Error('expected_lasar_groups_rollback');
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ARSKURS = new RegExp(`^(arskurs:)?${UUID}:(ar[1-3]|ak[1-9]|vecka)$`, 'iu');
/** Samma indelning som migrationens förkontroll: årskurs, klass eller okänd form. */
export const formOf = key => (ARSKURS.test(key) ? 'arskurs' : /^klass:./u.test(key) ? 'klass' : 'okand');

/** Skoldagar i förslaget för skola A 2027, i ordning; gruppdagar läggs bara på skoldagar. */
function schoolDays() {
  const sy = proposeSchoolYear(YEAR, 'grupper', ['GR', 'GY']), days = [];
  for (let d = sy.ht.start; d <= sy.vt.end; d = addDays(d, 1)) if (dayInfo(sy, d).status === 'skoldag') days.push(d);
  return { sy, days };
}

/** En kalenderversion i gammal form. Rader läggs i utkastet; status sätts därefter (skydden gäller hela tiden). */
async function oldCalendar(t, f, { unit = f.schools.A, version = 1, groupDays = [], shortWeeks = [], decide = false, hash = false }) {
  const { sy } = schoolDays();
  const id = (await t`insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end,status,version)
    values(${f.id(2)},${unit},${YEAR},${sy.ht.start},${sy.ht.end},${sy.vt.start},${sy.vt.end},'utkast',${version}) returning id`)[0].id;
  for (const [day, e] of Object.entries(sy.exceptions)) await t`insert into public.school_year_days(school_year_id,day,kind,note) values(${id},${day},${e.kind},${e.note ?? null})`;
  for (const g of groupDays) await t`insert into public.school_year_group_days(school_year_id,group_key,day,cause,note) values(${id},${g.key},${g.day},${g.cause},${g.note ?? null})`;
  for (const w of shortWeeks) await t`insert into public.school_year_short_weeks(school_year_id,group_key,column_id,weekday,reason) values(${id},${w.key},${w.column},${w.weekday},${w.reason})`;
  if (decide) await t`update public.school_years set status='faststalld',decided_on='2027-05-01',content_hash=${hash ? t`public.lasar_content_hash(id)` : null} where id=${id}`;
  return id;
}
const supersede = (t, oldId, newId) => t`update public.school_years set superseded_at=clock_timestamp(),superseded_by=${newId} where id=${oldId}`;

async function rows(t) {
  return [...await t`select 'group_days' tbl, school_year_id, group_key, day::text day from public.school_year_group_days
    union all select 'short_weeks', school_year_id, group_key, null from public.school_year_short_weeks order by 1,2,3,4`];
}
const formCounts = list => list.reduce((c, r) => ({ ...c, [formOf(r.group_key)]: c[formOf(r.group_key)] + 1, total: c.total + 1 }), { arskurs: 0, klass: 0, okand: 0, total: 0 });
const decidedHashes = async t => Object.fromEntries((await t`select id, coalesce(content_hash, public.lasar_content_hash(id)) h from public.school_years
  where status='faststalld' order by id`).map(r => [r.id, r.h]));
const columnsOf = async (t, table) => (await t`select attname from pg_attribute where attrelid=${'public.' + table}::regclass and attnum>0 and not attisdropped order by attnum`).map(r => r.attname);

/**
 * Fixturerna. Varje fixtur får skolans grupper (createLasarFixture) och lägger egna rader i gammal form. `expect` är
 * 'transfer' (alla rader förs över) eller 'abort' (migrationen avbryts och ingenting ändras).
 */
function fixtures() {
  const { days } = schoolDays();
  const d = i => days[i];
  return [
    { name: 'noll rader: migrationen går igenom och rapporterar 0', expect: 'transfer', build: async (t, f) => { await oldCalendar(t, f, {}); return {}; } },
    {
      name: 'årskurs, klass och korta veckor i utkast, fastställd, fastställd med lagrad kontrollsumma och ersatt version',
      expect: 'transfer',
      build: async (t, f) => {
        const gr = f.offerings.gr, k = f.groups.classes;
        const v1 = await oldCalendar(t, f, { version: 1, decide: true, groupDays: [{ key: `${gr}:ak1`, day: d(5), cause: 'friluftsdag' }, { key: 'klass:SYN1A', day: d(6), cause: 'annat', note: 'Syntetisk utflykt' }],
          shortWeeks: [{ key: `${gr}:ak1`, column: 'ak1', weekday: 4, reason: 'Syntetiska särskilda skäl' }] });
        const v2 = await oldCalendar(t, f, { version: 2, decide: false, groupDays: [{ key: `klass:${k.im}`, day: d(7), cause: 'apl' }, { key: `arskurs:${gr}:ak3`, day: d(8), cause: 'nationellt prov' }] });
        await supersede(t, v1, v2);
        await t`update public.school_years set status='faststalld',decided_on='2027-05-02' where id=${v2}`;
        const v3 = await oldCalendar(t, f, { version: 3, groupDays: [{ key: 'klass:SA27A', day: d(9), cause: 'friluftsdag' }, { key: `${f.offerings.im}:vecka`, day: d(10), cause: 'apl' }],
          shortWeeks: [{ key: 'klass:SYN1A', column: 'ak1', weekday: 0, reason: 'Syntetiska skäl för klassen' }] });
        const other = await oldCalendar(t, f, { unit: f.schools.C, decide: true, hash: true });
        await t`update public.school_years set content_hash=public.lasar_content_hash(id) where id=${v2}`;
        return { versions: { v1, v2, v3, other }, expected: [
          { tbl: 'group_days', key: `${gr}:ak1`, scope: 'arskurs', offering_id: gr, column_id: 'ak1', class_id: null },
          { tbl: 'group_days', key: 'klass:SYN1A', scope: 'klass', offering_id: null, column_id: null, class_id: k.ak1 },
          { tbl: 'group_days', key: `klass:${k.im}`, scope: 'klass', offering_id: null, column_id: null, class_id: k.im },
          { tbl: 'group_days', key: `arskurs:${gr}:ak3`, scope: 'arskurs', offering_id: gr, column_id: 'ak3', class_id: null },
          { tbl: 'group_days', key: 'klass:SA27A', scope: 'klass', offering_id: null, column_id: null, class_id: k.gy },
          { tbl: 'group_days', key: `${f.offerings.im}:vecka`, scope: 'arskurs', offering_id: f.offerings.im, column_id: 'vecka', class_id: null },
          { tbl: 'short_weeks', key: `${gr}:ak1`, scope: 'arskurs', offering_id: gr, column_id: 'ak1', class_id: null },
          { tbl: 'short_weeks', key: 'klass:SYN1A', scope: 'klass', offering_id: null, column_id: 'ak1', class_id: k.ak1 },
        ] };
      },
    },
    {
      name: 'klassnamn som finns för två startår i samma skola och båda passar läsåret avbryter',
      expect: 'abort',
      build: async (t, f) => {
        await t`insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year) values
          (${f.id(1)},${f.id(2)},${f.schools.A},${f.offerings.gy},'SYNDUP',2026),(${f.id(1)},${f.id(2)},${f.schools.A},${f.offerings.gy},'SYNDUP',2027)`;
        await oldCalendar(t, f, { groupDays: [{ key: 'klass:SYNDUP', day: d(5), cause: 'friluftsdag' }, { key: `${f.offerings.gr}:ak1`, day: d(6), cause: 'apl' }] });
      },
    },
    { name: 'okänd form avbryter', expect: 'abort', build: async (t, f) => { await oldCalendar(t, f, { groupDays: [{ key: 'grupp:okänd', day: d(5), cause: 'friluftsdag' }] }); } },
    {
      name: 'utbildning på en annan skola avbryter',
      expect: 'abort',
      build: async (t, f) => {
        const off = randomUUID();
        await t`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,start_year) values(${off},${f.id(2)},${f.schools.B},'grundskola','Syntetisk GR B','Läsåret 2027/28',${[1, 2]}::smallint[],2027)`;
        await oldCalendar(t, f, { decide: true, groupDays: [{ key: `${off}:ak1`, day: d(5), cause: 'friluftsdag' }] });
      },
    },
    {
      name: 'klass som bara finns på en annan skola avbryter',
      expect: 'abort',
      build: async (t, f) => {
        const off = randomUUID();
        await t`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,start_year) values(${off},${f.id(2)},${f.schools.B},'grundskola','Syntetisk GR B','Läsåret 2027/28',${[1, 2]}::smallint[],2027)`;
        await t`insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year) values(${f.id(1)},${f.id(2)},${f.schools.B},${off},'SYNB1',2027)`;
        await oldCalendar(t, f, { groupDays: [{ key: 'klass:SYNB1', day: d(5), cause: 'friluftsdag' }] });
      },
    },
    {
      name: 'klass utanför läsåret (elevkull 2026 på grundskolan) avbryter',
      expect: 'abort',
      build: async (t, f) => { await oldCalendar(t, f, { groupDays: [{ key: 'klass:SYN7A', day: d(5), cause: 'friluftsdag' }] }); },
    },
    {
      name: 'kort vecka för klass vars årskurs inte stämmer med timplanskopplingen avbryter',
      expect: 'abort',
      build: async (t, f) => { await oldCalendar(t, f, { shortWeeks: [{ key: 'klass:SYN1A', column: 'ak2', weekday: 4, reason: 'Syntetiska skäl' }] }); },
    },
  ];
}

async function runFixture(db, sql, fx, f) {
  const out = { name: fx.name, expect: fx.expect };
  try {
    await db.begin(async t => {
      await t`set local statement_timeout='120s'`;
      await f.actor(t, 'hm');
      const built = (await fx.build(t, f)) ?? {};
      const before = await rows(t), hashes = await decidedHashes(t);
      out.before = formCounts(before);
      let error;
      try { await t.savepoint(u => u.unsafe(sql)); } catch (e) { error = e; }
      if (fx.expect === 'abort') {
        assert.ok(error, 'migrationen gick igenom fast den skulle avbrytas');
        assert.equal(error.code, 'P0001', `${error.code} ${error.message}`);
        assert.ok(!/SYN|SA27A/u.test(error.message), 'felet nämner ett klassnamn');
        assert.deepEqual(await rows(t), before, 'raderna ändrades fast migrationen avbröts');
        assert.ok(!(await columnsOf(t, 'school_year_group_days')).includes('scope'), 'schemat ändrades fast migrationen avbröts');
        out.aborted = true; out.message = String(error.message).slice(0, 300); out.transferred = 0;
        throw rollback;
      }
      if (error) throw error;
      const after = await t`select 'group_days' tbl, group_key, scope, offering_id, column_id, class_id, group_ref from public.school_year_group_days
        union all select 'short_weeks', group_key, scope, offering_id, column_id, class_id, group_ref from public.school_year_short_weeks order by 1,2`;
      const remaining = (await t`select (select count(*) from public.school_year_group_days where scope is null) + (select count(*) from public.school_year_short_weeks where scope is null) n`)[0].n;
      out.after = after.length; out.transferred = after.filter(r => r.scope).length; out.remaining = Number(remaining);
      assert.equal(after.length, before.length, 'antal före = efter');
      assert.equal(out.remaining, 0, 'oöverförda rader finns kvar');
      for (const e of built.expected ?? []) {
        const row = after.find(r => r.tbl === e.tbl && r.group_key === e.key);
        assert.ok(row, `${e.tbl} ${e.key} saknas`);
        assert.deepEqual({ scope: row.scope, offering_id: row.offering_id, column_id: row.column_id, class_id: row.class_id },
          { scope: e.scope, offering_id: e.offering_id, column_id: e.column_id, class_id: e.class_id }, e.key);
        assert.equal(row.group_ref, e.scope === 'arskurs' ? `arskurs:${e.offering_id}:${e.column_id}` : `klass:${e.class_id}`);
      }
      const hashesAfter = await decidedHashes(t);
      assert.deepEqual(hashesAfter, hashes, 'fastställda kalendrar har samma kontrollsumma före och efter');
      out.decided = { checked: Object.keys(hashes).length, equal: true };
      throw rollback;
    });
  } catch (e) { if (e !== rollback) throw e; }
  return out;
}

/** Schemat efter migrationen: nyckel, villkor, främmande nycklar och skydden mot nya group_key-värden och främmande referenser. */
async function schema(db, sql, f, step) {
  try {
    await db.begin(async t => {
      await t.unsafe(sql);
      await step('primärnyckeln står på stabila referenser; group_key är en nullbar historikkolumn', async () => {
        for (const [table, key] of [['school_year_group_days', 'PRIMARY KEY (school_year_id, group_ref, day)'], ['school_year_short_weeks', 'PRIMARY KEY (school_year_id, group_ref)']]) {
          const defs = (await t`select pg_get_constraintdef(oid) d from pg_constraint where conrelid=${'public.' + table}::regclass order by 1`).map(r => r.d);
          assert.ok(defs.includes(key), defs.join(' | '));
          assert.ok(defs.some(x => /FOREIGN KEY \(offering_id\) REFERENCES offerings\(id\)/u.test(x)), table);
          assert.ok(defs.some(x => /FOREIGN KEY \(class_id\) REFERENCES school_classes\(id\)/u.test(x)), table);
          const [col] = await t`select attnotnull n from pg_attribute where attrelid=${'public.' + table}::regclass and attname='group_key'`;
          assert.equal(col.n, false);
        }
      });
      const { sy, days } = schoolDays();
      const id = (await t`insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end,status,version)
        values(${f.id(2)},${f.schools.A},${YEAR},${sy.ht.start},${sy.ht.end},${sy.vt.start},${sy.vt.end},'utkast',1) returning id`)[0].id;
      const deny = async (fn, code) => { let e; try { await t.savepoint(fn); } catch (x) { e = x; } assert.ok(e, 'väntat nekande uteblev'); if (code) assert.equal(e.code, code, e.message); };
      await step('inga nya värden i group_key', async () => {
        await deny(u => u`insert into public.school_year_group_days(school_year_id,group_key,scope,class_id,day,cause) values(${id},'klass:SYN1A','klass',${f.groups.classes.ak1},${days[3]},'apl')`, '22023');
        await t`insert into public.school_year_group_days(school_year_id,scope,class_id,day,cause) values(${id},'klass',${f.groups.classes.ak1},${days[3]},'apl')`;
        await deny(u => u`update public.school_year_group_days set group_key='klass:SYN1A' where school_year_id=${id}`, '22023');
      });
      await step('utbildning och klass måste höra till kalenderns skola och läsår (T-05.1.1-24)', async () => {
        const off = randomUUID(), cls = randomUUID();
        await t`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,start_year) values(${off},${f.id(2)},${f.schools.B},'grundskola','Syntetisk GR B','Läsåret 2027/28',${[1, 2]}::smallint[],2027)`;
        await t`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values(${cls},${f.id(1)},${f.id(2)},${f.schools.B},${off},'SYNB1',2027)`;
        await deny(u => u`insert into public.school_year_group_days(school_year_id,scope,offering_id,column_id,day,cause) values(${id},'arskurs',${off},'ak1',${days[4]},'apl')`, '22023');
        await deny(u => u`insert into public.school_year_group_days(school_year_id,scope,class_id,day,cause) values(${id},'klass',${cls},${days[4]},'apl')`, '22023');
        await deny(u => u`insert into public.school_year_group_days(school_year_id,scope,class_id,day,cause) values(${id},'klass',${f.classes.group},${days[4]},'apl')`, '22023');
        await deny(u => u`insert into public.school_year_group_days(school_year_id,scope,offering_id,column_id,day,cause) values(${id},'arskurs',${f.offerings.gr},'ak7',${days[4]},'apl')`, '22023');
        await deny(u => u`insert into public.school_year_group_days(school_year_id,scope,offering_id,column_id,class_id,day,cause) values(${id},'arskurs',${f.offerings.gr},'ak1',${f.groups.classes.ak1},${days[4]},'apl')`, '23514');
        await deny(u => u`insert into public.school_year_short_weeks(school_year_id,scope,class_id,column_id,weekday,reason) values(${id},'klass',${f.groups.classes.ak1},'ak2',4,'Syntetiska skäl')`, '22023');
        await t`insert into public.school_year_short_weeks(school_year_id,scope,class_id,column_id,weekday,reason) values(${id},'klass',${f.groups.classes.ak1},'ak1',4,'Syntetiska skäl')`;
      });
      await step('migreringsflaggan godtas bara för databasens ägare inom transaktionen', async () => {
        const active = async u => (await u`select public.lasar_group_migration_active() v`)[0].v;
        assert.equal(await active(t), false);
        const sentinel = Error('flag_rollback');
        // Workern sätter flaggan och anropar en ingång (provfunktion med ägarens rättigheter, bara i den återrullade delen).
        try {
          await t.savepoint(async u => {
            await u`select set_config('app.lasar_group_migration','on:'||txid_current()::text,true)`;
            assert.equal(await active(u), true);
            await u.unsafe(`create function public.lasar_probe_flag() returns boolean language sql security definer set search_path = pg_catalog, public as 'select public.lasar_group_migration_active()'`);
            await u.unsafe('grant execute on function public.lasar_probe_flag() to skolplattform_worker');
            await u`set local session authorization skolplattform_worker`;
            await u`select set_config('app.lasar_group_migration','on:'||txid_current()::text,true)`;
            assert.equal((await u`select public.lasar_probe_flag() v`)[0].v, false);
            throw sentinel;
          });
        } catch (e) { if (e !== sentinel) throw e; }
        try {
          await t.savepoint(async u => {
            await u`select set_config('app.lasar_group_migration','on:1',true)`;
            assert.equal(await active(u), false);
            throw sentinel;
          });
        } catch (e) { if (e !== sentinel) throw e; }
        assert.equal(await active(t), false);
      });
      throw rollback;
    });
  } catch (e) { if (e !== rollback) throw e; }
}

export async function verifyLasarGroups(out) {
  const output = resolve(out);
  assert.ok((output.startsWith('/private/tmp/') || output.startsWith('/tmp/')) && output.endsWith('.json'), 'REFUSED: use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'REFUSED: output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'lasar-groups-sql', status: 'FAIL', mode: 'ephemeral', migration: GROUP_MIGRATION, cases: [], transfers: [], startedAt: new Date().toISOString(),
    limitations: ['Own ephemeral PostgreSQL built from repository migrations without the group migration; synthetic fixtures only; nothing installed',
      'Old-form rows are written by the owner through the old columns with all triggers active',
      'The actual row count in the protected target is read in the delivery pre-check (plan 16)',
      'SS 12000: class_id is Group (groupType=Klass); offering_id is a local study path, not Programme; no exchange verified'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  const record = async (name, fn) => {
    try { await fn(); report.cases.push({ name, status: 'PASS' }); }
    catch (e) { report.cases.push({ name, status: 'FAIL', code: e.code ?? null, message: String(e.message).slice(0, 500) }); }
    persist();
  };
  let source;
  try {
    persist();
    const path = resolve(root, 'supabase/migrations', GROUP_MIGRATION);
    assert.ok(existsSync(path), `Migrationen saknas: ${GROUP_MIGRATION}`);
    const sql = readFileSync(path, 'utf8');
    await record('migrationen stänger inte av triggrar och ger inga rättigheter', async () => {
      assert.ok(!/session_replication_role/iu.test(sql));
      assert.ok(!/disable\s+trigger/iu.test(sql));
      assert.equal(sql.split('\n').filter(l => !l.trim().startsWith('--') && /\bgrant\b/iu.test(l)).length, 0);
    });
    const { createEphemeralMigratedDb } = await import('./ephemeral-migrated-db.mjs');
    const e = await createEphemeralMigratedDb({ exclude: [GROUP_MIGRATION] });
    source = e; report.database = e.provenance; persist();
    const f = await e.db.begin(createLasarFixture);
    for (const fx of fixtures()) {
      await record(`överföring: ${fx.name}`, async () => {
        const result = await runFixture(e.db, sql, fx, f);
        report.transfers.push(result);
        if (fx.expect === 'abort') assert.equal(result.aborted, true);
        else assert.equal(result.remaining, 0);
      });
    }
    await schema(e.db, sql, f, record);
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', message: e.message, stack: e.stack }; }
  finally {
    try { await source?.end(); } catch (e) { report.cleanupFailure = { message: e.message }; }
    report.passed = report.cases.filter(c => c.status === 'PASS').length;
    report.failed = report.cases.filter(c => c.status !== 'PASS').length;
    if (!report.failure && !report.cleanupFailure && report.failed === 0 && report.passed > 0) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist();
  }
  console.log(report.status === 'PASS' ? `PASS: ${report.passed} fall för gruppernas överföring i SQL` : `FAIL: ${report.failed} av ${report.cases.length} fall${report.failure ? '; ' + report.failure.message : ''}`);
  for (const c of report.cases.filter(x => x.status !== 'PASS')) console.log(`  FAIL ${c.name}: ${c.code ?? ''} ${c.message ?? ''}`);
  for (const r of report.transfers) console.log(`  ${r.aborted ? 'avbruten' : 'överförd'}: ${r.name} (före ${r.before?.total ?? '?'}, överförda ${r.transferred ?? '?'}, kvar ${r.remaining ?? '-'})`);
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ephemeral = args.includes('--ephemeral'), rest = args.filter(a => a !== '--ephemeral');
  assert.ok(ephemeral, 'Use --ephemeral: the transfer is proven in an own PostgreSQL built from the migrations');
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json --ephemeral');
  await verifyLasarGroups(rest[1]);
}
