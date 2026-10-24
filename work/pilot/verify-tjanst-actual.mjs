#!/usr/bin/env node
// 05.1-09: faktiskt Worker + OIDC + PostgreSQL + webbläsarprov av tjänstefördelningen på dator och telefon.
// Bygger inget själv. Kandidaten är en ren checkout av en commit i /private/tmp/tjanst-candidate, byggd med
// `npm ci` och `npm run build:protected` i web/. Provet kopierar bygget till en egen runtime-katalog, startar en egen
// Worker på 127.0.0.1:3015 och egen GoTrue mot en egen schemakopia (bara schema, inga rader) med fasens migrationer,
// kör Playwright med privat manifest och städar OIDC-användare, Worker, GoTrue och schemakopian. Aldrig den skyddade
// lokala databasen, aldrig 3012 och ingen installation.
// 05.1-14: före- och efterläge valideras med en gemensam, hash-låst migrationsklassificerare.
// 05.1-12 (historik): etapp 1 är installerad i målet (05.1-10). Målets migrationsjournal läses läsande innan schemakopian skapas, och i
// kopian installeras bara de migrationer i tjanstMigrations som saknas i målet. De ska vara exakt tjanstGapMigrations
// (rapportfältet pendingMigrations). migrationSources omfattar fortfarande hela tjanstMigrations, eftersom 05.1-13 jämför dem.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync, cpSync, openSync, closeSync, realpathSync, rmSync, readdirSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createNamedTimplanSnapshot, schemaFingerprint } from './named-timplan-snapshot.mjs';
import { createNamedTimplanRuntime } from './named-timplan-runtime.mjs';
import { recoverTjanstOidcFixture, TJANST_ACTUAL_BASE, TJANST_ACTUAL_CASES, TJANST_ACTUAL_PROJECTS, TJANST_ACTUAL_LOGIN_ROLES } from './tjanst-oidc-fixtures.mjs';
import { expectedTjanstWorkerEntrypoints, classifyTjanstMigrations, assertTjanstSelfMandatesSchema, TJANST_PHASE_START, TJANST_BASELINE_LENGTH, TJANST_MIGRATION_REGISTRY } from './tjanst-migration-state.mjs';
import { assertTarget } from './verify-target.mjs';
import { artifactManifest } from './verify-programplan-copy-api.mjs';
import { productSources, sha } from './apply-apl-plan.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)), require = createRequire(path.join(root, 'web/package.json'));
export const CANDIDATE = '/private/tmp/tjanst-candidate';
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const migrationSources = () => Object.fromEntries(readdirSync(path.join(root, 'supabase/migrations'))
  .filter(f => /^\d{14}_.*\.sql$/u.test(f) && f.slice(0, 14) >= TJANST_PHASE_START).sort()
  .map(f => ['supabase/migrations/' + f, sha(readFileSync(path.join(root, 'supabase/migrations', f)))]));
const verificationFiles = ['work/pilot/verify-tjanst-actual.mjs', 'work/pilot/tjanst-oidc-fixtures.mjs',
  'web/playwright.tjanst-actual.config.ts', 'web/e2e/tjanst-actual.spec.ts'];
/** De tolv öppna entrypointsen: tio för tjänstefördelningen och GR/IM-kopplingens två. */
export const WORKER_ENTRYPOINTS = ['phase51_grim_class_command(jsonb)', 'phase51_grim_class_underlag(jsonb)',
  'tjanst_personal_command(jsonb)', 'tjanst_personal_read(jsonb)', 'tjanst_personal_status(jsonb)',
  'tjanst_plan_command(jsonb)', 'tjanst_plan_read(jsonb)', 'tjanst_plan_status(jsonb)',
  'tjanst_self_command(jsonb)', 'tjanst_self_read(jsonb)', 'tjanst_self_status(jsonb)', 'tjanst_staffing_read(jsonb)'];
const PHASE_TABLES = ['staff_people', 'staff_employments', 'staff_school_duties', 'staff_person_bindings'];
/** Målanslutningen används enbart läsande; klassificeringen styr bara installation i egen schemakopia. */
export async function targetPendingMigrations() {
  const target = await assertTarget('protected'), live = require('postgres')(target.dbUrl, { max: 1, prepare: false, onnotice: () => {} });
  try {
    return await live.begin('isolation level repeatable read read only', async tx => {
      const rows = Array.from(await tx`select version,name,statements from supabase_migrations.schema_migrations order by version`);
      const journal=rows.map(r=>r.version),state=classifyTjanstMigrations({journal,sourceHashes:migrationSources()});
      const installedSources=state.installed.map(version=>{
        const row=rows.find(r=>r.version===version),entry=TJANST_MIGRATION_REGISTRY.find(m=>m.version===version);
        assert.equal(row.name,path.basename(entry.file).slice(15,-4),'Installed migration name differs from its registered file');
        assert.ok(Array.isArray(row.statements)&&row.statements.length===1&&typeof row.statements[0]==='string','Expected one exact source statement in installed phase journal');
        const sha256=sha(row.statements[0]);assert.equal(sha256,entry.sha256,'Installed migration SQL differs from the registered immutable source');
        return {version,name:row.name,statementCount:row.statements.length,sha256};
      });
      return { ...state, pending: state.pendingMigrations, fingerprint: await schemaFingerprint(tx),
        journal: { read:'read only',installed:state.installed,unknown:state.unknown,
          missing:state.pendingMigrations.map(p=>path.basename(p).slice(0,14)),
          fingerprint:{sha256:sha(JSON.stringify(rows)),count:rows.length,columns:['version','name','statements']},installedSources } };

    });
  } finally { await live.end({ timeout: 5 }); }
}

/** Hash every static or literal dynamic local module recursively; unresolved imports fail closed.
 * Package/runtime identity is bound separately by the package lock and browser/runtime reports. */
export function verificationSources({entrypoints=verificationFiles}={}) {
  const files = new Map(), ts = require('typescript'), pending=[...entrypoints];
  while(pending.length) {
    const file=pending.pop(); if(files.has(file)) continue;
    assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'));
    const absolute=path.join(root,file);assert.ok(existsSync(absolute)&&statSync(absolute).isFile(),'Missing verification dependency: '+file);
    const bytes=readFileSync(absolute);files.set(file,sha(bytes));
    if(!/\.(?:mjs|js|ts|tsx)$/u.test(file)) continue;
    const syntax=ts.createSourceFile(absolute,bytes.toString('utf8'),ts.ScriptTarget.Latest,true),imports=[];
    const visit=node=>{
      const specifier=(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))?node.moduleSpecifier
        :ts.isCallExpression(node)&&(node.expression.kind===ts.SyntaxKind.ImportKeyword
          ||ts.isIdentifier(node.expression)&&node.expression.text==='require')?node.arguments[0]:undefined;
      if(specifier&&(ts.isStringLiteral(specifier)||ts.isNoSubstitutionTemplateLiteral(specifier))&&specifier.text.startsWith('.')) imports.push(specifier.text);
      ts.forEachChild(node,visit);
    };visit(syntax);
    for(const specifier of imports) {
      const base=path.resolve(path.dirname(absolute),specifier);
      const possibilities=[base,...['.ts','.tsx','.mjs','.js','.json','/index.ts','/index.tsx','/index.mjs','/index.js'].map(ext=>base+ext)];
      const dependency=possibilities.find(p=>existsSync(p)&&statSync(p).isFile());
      assert.ok(dependency&&dependency.startsWith(root),'Unresolved local source '+specifier+' from '+file);
      const relative=path.relative(root,dependency);assert.ok(!relative.split(path.sep).includes('..'));pending.push(relative);
    }
  }
  return Object.fromEntries([...files].sort(([a],[b])=>a.localeCompare(b)));
}

/** Worker-rollens och klientrollernas rättigheter på fasens funktioner och tabeller i schemakopian. */
export async function workerGrants(db) {
  const functions = await db`select p.oid::regprocedure::text signature,
    has_function_privilege('skolplattform_worker',p.oid,'EXECUTE') worker,
    has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
    has_function_privilege('service_role',p.oid,'EXECUTE') service_role,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_execute
   from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'tjanst\\_%' or p.proname like 'phase51\\_%') order by 1`;
  const tables = await db`select c.relname,r.role,
    has_table_privilege(r.role,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') any_privilege
   from pg_class c cross join (values ('skolplattform_worker'),('anon'),('authenticated'),('service_role')) r(role)
   where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S') and (c.relname like 'tjanst\\_%' or c.relname = any(${PHASE_TABLES}))
   order by 1,2`;
  const publicTables = await db`select c.relname from pg_class c where c.relnamespace='public'::regnamespace and (c.relname like 'tjanst\\_%' or c.relname = any(${PHASE_TABLES}))
   and exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0) order by 1`;
  const open = functions.filter(f => f.worker).map(f => f.signature.replace(/^public\./u, '')).sort();
  return {
    workerExecute: open, workerExecuteCount: open.length, functionCount: functions.length,
    closedFunctions: functions.filter(f => !f.worker).length,
    clientRoleExecute: functions.filter(f => f.anon || f.authenticated || f.service_role || f.public_execute).map(f => f.signature),
    tablePrivileges: tables.filter(t => t.any_privilege).map(t => t.relname + ':' + t.role),
    tablesChecked: [...new Set(tables.map(t => t.relname))],
    publicTablePrivileges: publicTables.map(t => t.relname),
  };
}

async function runPlaywright(evidenceDir, manifestPath, baseURL, projects) {
  const log = path.join(evidenceDir, 'playwright.log'), fd = openSync(log, 'wx', 0o600);
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, 'web/node_modules/@playwright/test/cli.js'), 'test', '-c', 'playwright.tjanst-actual.config.ts', ...projects.flatMap(p => ['--project', p])], {
        cwd: path.join(root, 'web'), stdio: ['ignore', fd, fd], env: { ...process.env, PHASE5_BASE_URL: baseURL, TJANST_ACTUAL_MANIFEST: manifestPath, TJANST_ACTUAL_EVIDENCE_DIR: evidenceDir } });
      child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal, log }));
    });
  } finally { closeSync(fd); }
}

/** Sammanställer Playwrights JSON-rapport: körda, godkända, misslyckade och ej körda fall per projekt. */
function playwrightOutcome(evidenceDir) {
  const file = path.join(evidenceDir, 'playwright-actual.json'); if (!existsSync(file)) return null;
  const report = JSON.parse(readFileSync(file, 'utf8')), tests = [];
  const walk = suite => { for (const spec of suite.specs ?? []) for (const t of spec.tests ?? []) { const results = t.results ?? [];
    tests.push({ title: spec.title, project: t.projectName, status: results.length ? results.at(-1).status : 'notRun', retries: Math.max(0, results.length - 1), expected: t.expectedStatus }); }
    for (const child of suite.suites ?? []) walk(child); };
  for (const suite of report.suites ?? []) walk(suite);
  return { stats: report.stats, tests, sha256: sha(readFileSync(file)) };
}

/** Bind every manifest byte to the immutable candidate commit, including files reached from untracked imports.
 * Missing blobs fail; later checkout commits may only affect files outside this complete dependency inventory. */
export function bindCandidateSources(revision,...manifests) {
  assert.match(revision,/^[0-9a-f]{40}$/u);
  const merged={};for(const manifest of manifests) for(const [file,digest] of Object.entries(manifest)) {
    assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..')&&!/[\r\n]/u.test(file));
    if(Object.hasOwn(merged,file)) assert.equal(merged[file],digest);
    merged[file]=digest;
  }
  const files=Object.keys(merged).sort();assert.ok(files.length);
  const blobs=execFileSync('git',['cat-file','--batch'],{cwd:root,input:files.map(file=>revision+':'+file).join('\n')+'\n',maxBuffer:128*1024*1024});
  let offset=0;
  for(const file of files) {
    const end=blobs.indexOf(10,offset);assert.ok(end>=offset);
    const header=blobs.subarray(offset,end).toString('utf8'),match=/^[0-9a-f]{40} blob (\d+)$/u.exec(header);
    assert.ok(match,'Missing committed candidate source: '+file);
    const length=Number(match[1]);offset=end+1;
    assert.equal(sha(blobs.subarray(offset,offset+length)),merged[file],'Candidate source bytes differ: '+file);
    offset+=length;assert.equal(blobs[offset],10);offset++;
  }
  assert.equal(offset,blobs.length);
  return {revision,fileCount:files.length,manifestSha256:sha(JSON.stringify(Object.fromEntries(files.map(file=>[file,merged[file]])))),matched:true};
}

/** Kontrollerar att kandidaten är en ren checkout av en commit vars produktkällor är identiska med HEAD. */
function candidateProof(originalBuild, mark) {
  assert.equal(originalBuild, path.join(CANDIDATE, 'web/dist-protected'), 'Bara kandidaten i /private/tmp/tjanst-candidate är tillåten');
  const revision = git(['rev-parse', 'HEAD'], CANDIDATE);
  assert.equal(revision, mark.revision, 'Byggets revision är inte kandidatens checkout');
  assert.equal(git(['status', '--porcelain', '--untracked-files=no'], CANDIDATE), '', 'Kandidatens checkout har ändringar');
  assert.equal(git(['diff', '--name-only', mark.revision, 'HEAD', '--', 'web/app', 'web/lib', 'web/components', 'web/hooks', 'web/scripts', 'web/package.json', 'web/package-lock.json', 'web/vite.config.ts', 'web/vinext.config.ts']), '',
    'Kandidatens produktkällor skiljer sig från aktuell commit');
  return { path: CANDIDATE, revision, build: originalBuild, mark, rebuild: `git clone --no-hardlinks <repo> ${CANDIDATE} && git -C ${CANDIDATE} checkout ${revision} && cd ${CANDIDATE}/web && npm ci && npm run build:protected` };
}

export async function verifyTjanstActual({ build, out, projects = TJANST_ACTUAL_PROJECTS }) {
  const originalBuild = realpathSync(build); out = path.resolve(out);
  assert.ok(out.startsWith('/private/tmp/') && out.endsWith('.json')); assert.equal(existsSync(out), false);
  assert.ok(projects.length && projects.every(p => TJANST_ACTUAL_PROJECTS.includes(p)));
  assert.equal(new Set(projects).size,projects.length);
  const evidenceDir = out.slice(0, -5) + '-evidence'; mkdirSync(evidenceDir, { mode: 0o700 }); chmodSync(evidenceDir, 0o700);
  const mark = JSON.parse(readFileSync(path.join(originalBuild, 'build-mode.json'), 'utf8')); assert.equal(mark.mode, 'protected');
  const candidate = candidateProof(originalBuild, mark);
  const initialSources = productSources(), initialMigrations = migrationSources(), initialVerification = verificationSources();
  const candidateSourceBinding=bindCandidateSources(candidate.revision,initialSources,initialMigrations,initialVerification);
  const buildRoot = path.join(root, 'work/pilot/targets/protected/runtime/tjanst-' + randomUUID());
  cpSync(originalBuild, buildRoot, { recursive: true, filter: p => !p.endsWith('/.dev.vars') });
  const report = { kind: 'tjanst-actual-api-browser', stage:'year', suiteVersion:'tjanst-year-actual-v1',
    fullSuite:JSON.stringify(projects)===JSON.stringify(TJANST_ACTUAL_PROJECTS), requiredCases:TJANST_ACTUAL_CASES, originalArtifact:artifactManifest(originalBuild), status: 'FAIL', startedAt: new Date().toISOString(), build: mark, candidate,
    sourceRevision:candidate.revision, executionCheckoutRevision:git(['rev-parse','HEAD']), candidateSourceBinding, sources: initialSources, migrationSources: initialMigrations, verificationSources: initialVerification,
    projects, browserEvidence: {}, checks: [], notExecuted: [],
    limits: ['Egen schemakopia utan rader och bara syntetiska identiteter, skolor, klasser och personal; inga verkliga rader kopieras och inget skrivs i den skyddade databasen eller på 3012',
      'Ingen installation; målets migrationsjournal läses läsande, och bara de migrationer som saknas där (pendingMigrations, ett registrerat suffix) installeras i schemakopian av det installerade målet', 'Ingen autentiseringsattrapp: verklig Worker/OIDC/PostgreSQL. Transportprov fördröjer läsningar eller tappar ett svar efter riktig Worker-200; felinjektioner för audit och valfri historikkälla är uttryckligen begränsade till egen databas och återställs',
      'SS 12000: provet bekräftar bara intern lagring (heltalsandelar, stabila Person- och klass-ID, åtskilda behovs- och lärarminuter); inget informationsutbyte med en motpart provas',
      'Telefonprojekten läser en version som är förberedd i schemakopian med samma SQL-kommandon som Worker anropar; redigering finns bara på dator (D-15)',
      'WR-02 (märkt dataändring): lärartid för en lärare utan rad i samläsningen läggs in direkt i schemakopians utkast för att efterlikna data från före rättelsen; publiceringsspärren prövas sedan genom Worker och vyn',
      'CR-01: på dator ger rektor B Egen tjänst för skola B i Mandat-dialogen; på telefon ges samma mandat med ett direkt POST /api/kund/mandat av rektor B mot riktig server (samma payload som dialogen)',
      'Historiskt Gy25-underlag: separat syntetiskt fryst program/timplan med katalogvaliderad 2026-kull och samma IDRO-rowKey över två riktiga klasslänkar; ingen faktisk historisk beslutsprocess påstås',
      'Kalendern är syntetiskt fastställd i egen databas; ingen aktiv kalender-API eller faktisk kommunanslutning påstås',
      'Retries 0, en Playwright-worker'] };
  const save = () => writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); save();
  let snapshot, runtime, failure, target;
  try {
    target = await targetPendingMigrations(); report.targetFingerprint=target.fingerprint; report.targetJournal = target.journal; report.pendingMigrations = target.pendingMigrations; report.baselineMode = target.baselineMode; save();
    snapshot = await createNamedTimplanSnapshot(); report.snapshot = snapshot.provenance; save();
    report.baselineFingerprint = await schemaFingerprint(snapshot.db);
    // Källan ska ha samma schema som när journalen klassificerades; ingen tyst basväxling.
    assert.equal(report.snapshot.sourceFingerprint, target.fingerprint, 'Målets schema ändrades mellan journal och kopiering');
    assert.equal((await snapshot.db`select to_regprocedure('public.tjanst_plan_read(jsonb)') is not null ok`)[0].ok, true, 'Etapp 1 saknas i schemakopian');
    await assertTjanstSelfMandatesSchema(snapshot.db, { installed: target.installed.length > TJANST_BASELINE_LENGTH });
    await snapshot.db.begin(async tx => { for (const p of report.pendingMigrations) await tx.unsafe(readFileSync(path.join(root, p), 'utf8')); await tx`set constraints all immediate`; });
    report.installedFingerprint = await schemaFingerprint(snapshot.db);
    if (report.pendingMigrations.length) assert.notEqual(report.installedFingerprint, report.baselineFingerprint);
    else assert.equal(report.installedFingerprint, report.baselineFingerprint, 'Efterläget får inte skrivas om');
    await assertTjanstSelfMandatesSchema(snapshot.db, { installed: true });
    report.grants = await workerGrants(snapshot.db); save();
    assert.equal(report.grants.workerExecuteCount,13,'Year suite requires the registered thirteenth preview entrypoint');
    assert.deepEqual(report.grants.workerExecute, expectedTjanstWorkerEntrypoints({installed:target.installed,applied:report.pendingMigrations}), 'Worker ska ha exakt versionsbunden mängd öppna entrypoints');
    assert.deepEqual(report.grants.clientRoleExecute, [], 'Inga funktioner får vara öppna för public, anon, authenticated eller service_role');
    assert.deepEqual(report.grants.tablePrivileges, [], 'Inga tabellrättigheter för Worker eller klientroller');
    assert.deepEqual(report.grants.publicTablePrivileges, [], 'Inga tabellrättigheter för public');
    runtime = await createNamedTimplanRuntime({ snapshot, buildRoot, evidenceDir, port: 3015, prefix: 'tjanst' });
    report.runtime = runtime.proof; assert.equal(runtime.baseURL, TJANST_ACTUAL_BASE); save();
    const manifestPath = path.join(evidenceDir, 'browser-manifest.json');
    writeFileSync(manifestPath, JSON.stringify({ kind: 'tjanst-actual-owned-runtime', baseURL: runtime.baseURL, provenance: snapshot.provenance, projects }), { mode: 0o600, flag: 'wx' });
    report.playwright = await runPlaywright(evidenceDir, manifestPath, runtime.baseURL, projects); save();
    report.playwrightOutcome = playwrightOutcome(evidenceDir);
    for (const project of projects) {
      const file = path.join(evidenceDir, `browser-${project}.json`); if (!existsSync(file)) continue;
      const result = JSON.parse(readFileSync(file, 'utf8'));
      report.browserEvidence[project] = { path: file, sha256: sha(readFileSync(file)), result, visualReview: 'pending',
        screenshotHashes: Object.fromEntries(result.screenshots.map(s => [s.file, sha(readFileSync(path.join(evidenceDir, s.file)))])) };
      report.checks.push(...result.checks.map(c => ({ ...c, project, name: project + ': ' + c.name })));
    }
    for (const t of report.playwrightOutcome?.tests ?? []) if (t.status !== 'passed' && t.expected !== 'skipped') report.notExecuted.push({ project: t.project, test: t.title, status: t.status === 'failed' || t.status === 'timedOut' ? 'misslyckat' : 'ej kört' });
    for (const project of projects) for (const name of TJANST_ACTUAL_CASES[project]) {
      const check = report.checks.find(c => c.project === project && c.case === name);
      if (!check) report.notExecuted.push({ project, case: name, status: 'ej kört' });
    }
    report.casesPerProject = Object.fromEntries(projects.map(p => [p, { required: TJANST_ACTUAL_CASES[p].length,
      passed: new Set(report.checks.filter(c => c.project === p && c.ok === true && TJANST_ACTUAL_CASES[p].includes(c.case)).map(c=>c.case)).size }]));
    save();
    assert.equal(report.playwright.code, 0, 'Faktiskt webbläsarfel; se den privata Playwright-loggen');
    // Ett fall som inte gäller projektet hoppas över med test.skip (förväntat skipped). Ett fall som inte kördes efter ett fel
    // (serieläge) har förväntat passed och fäller provet; det redovisas som ej kört.
    assert.ok(report.playwrightOutcome && report.playwrightOutcome.tests.every(t => t.retries === 0 && (t.status === 'passed' || (t.status === 'skipped' && t.expected === 'skipped'))),
      'Alla fall ska vara godkända utan omprov');
    report.foreignCanary={};report.browsers={};
    const viewports={desktop:{width:1440,height:900},'desktop-small':{width:1024,height:768},phone:{width:390,height:664},'phone-small':{width:320,height:740}};
    for (const project of projects) {
      const result=report.browserEvidence[project]?.result;
      assert.equal(result?.status,'PASS','Projektet '+project+' är inte godkänt');
      const names=result.checks.map(c=>c.case);
      assert.equal(new Set(names).size,names.length,'Duplicate named case in '+project);
      assert.deepEqual([...names].sort(),[...TJANST_ACTUAL_CASES[project]].sort(),'Exact required cases in '+project);
      assert.ok(result.checks.every(c=>c.ok===true));
      assert.equal(result.browser?.name,project.startsWith('phone')?'webkit':'chromium','Actual resolved engine required');
      assert.ok(typeof result.browser.version==='string'&&result.browser.version.length>0);
      assert.deepEqual(result.browser.viewport,viewports[project]);report.browsers[project]=result.browser;
      assert.equal(result.foreignCanary?.unchanged,true,'Foreign data preservation required');
      assert.deepEqual(result.foreignCanary.before,result.foreignCanary.after);
      assert.match(result.foreignCanary.before.sha256,/^[a-f0-9]{64}$/u);
      for(const table of ['people','employments','duties','versions','specials']) assert.ok(result.foreignCanary.before.counts[table]>0,'Nonempty foreign '+table);
      report.foreignCanary[project]=result.foreignCanary;
    }
    assert.deepEqual(report.notExecuted, [], 'Fall saknas i rapporten');
    report.finalFingerprint = await schemaFingerprint(snapshot.db); assert.equal(report.finalFingerprint, report.installedFingerprint);
    report.finalGrants = await workerGrants(snapshot.db); assert.deepEqual(report.finalGrants, report.grants);
    report.finalSources = productSources(); report.finalMigrationSources = migrationSources(); report.finalVerificationSources = verificationSources(); report.finalArtifact = artifactManifest(buildRoot);
    assert.deepEqual(report.finalSources, initialSources); assert.deepEqual(report.finalMigrationSources, initialMigrations); assert.deepEqual(report.finalVerificationSources, initialVerification); assert.deepEqual(report.finalArtifact, runtime.proof.artifact);
    report.status = 'PASS';
  } catch (error) { failure = error; report.failureCode = error.code ?? 'ASSERTION'; report.failure = error.message; writeFileSync(path.join(evidenceDir, 'failure.txt'), String(error.stack), { mode: 0o600 }); }
  finally {
    const oidc = [], journals = [];report.oidcEvidence={};
    for (const project of projects) {
      const file = path.join(evidenceDir, `oidc-${project}.json`), journal = path.join(evidenceDir, 'oidc-' + project, 'oidc-private.json');
      if (!existsSync(journal)) continue; journals.push(project);
      const proof = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
      if(proof) report.oidcEvidence[project]={path:file,sha256:sha(readFileSync(file)),requiredRoles:TJANST_ACTUAL_LOGIN_ROLES[project],result:proof};
      if (proof?.cleanup?.cleanup === 'complete') oidc.push({ project, ...proof.cleanup });
      else try { oidc.push({ project, ...(await recoverTjanstOidcFixture(journal)) }); } catch (error) { failure ??= error; oidc.push({ project, cleanup: 'failed', code: error.code ?? 'cleanup' }); }
    }
    report.oidcCleanup = { cleanup: oidc.length === journals.length && oidc.every(p => p.cleanup === 'complete') ? 'complete' : 'incomplete', expectedFixtures: journals.length,
      verifiedCallbacks: oidc.reduce((sum, p) => sum + (p.verifiedCallbacks ?? 0), 0), fixtures: oidc };
    try {
      assert.deepEqual([...journals].sort(),[...projects].sort(),'Exactly one OIDC fixture per requested project');
      assert.deepEqual(oidc.map(p=>p.project).sort(),[...projects].sort());
      for(const item of oidc) {
        assert.equal(item.cleanup,'complete');assert.ok(item.verifiedCallbacks>0);
        const evidence=report.oidcEvidence[item.project]?.result;assert.equal(evidence?.status,'PASS');
        const auth=evidence.proof?.auth;assert.ok(Array.isArray(auth)&&auth.length>0);
        assert.ok(auth.every(a=>a.status==='verified'&&a.proof?.proofKind==='browser-return-and-server-audit'&&a.proof.attemptId===a.id));
        assert.equal(new Set(auth.map(a=>a.proof.auditId)).size,auth.length,'Login audit cannot be reused');
        assert.equal(new Set(auth.map(a=>a.proof.callbackId)).size,auth.length,'Callback cannot be reused');
        assert.equal(item.verifiedCallbacks,auth.length);
        for(const role of TJANST_ACTUAL_LOGIN_ROLES[item.project]) assert.ok(auth.some(a=>a.role===role&&!a.stepUp),'Missing real login for '+role);
      }
    } catch(error) {failure??=error;report.status='FAIL';}
    for (const [key, object] of [['runtimeCleanup', runtime], ['snapshotCleanup', snapshot]]) if (object) try { report[key] = await object.cleanup(); } catch (error) { report[key] = { cleanup: 'failed', code: error.code ?? 'cleanup' }; failure ??= error; report.status = 'FAIL'; }
    try { rmSync(buildRoot, { recursive: true, force: true }); report.buildCopyRemoved = !existsSync(buildRoot); } catch { report.buildCopyRemoved = false; }
    if (report.oidcCleanup.cleanup !== 'complete' || report.runtimeCleanup?.cleanup !== 'complete' || report.snapshotCleanup?.cleanup !== 'complete' || !report.buildCopyRemoved) report.status = 'FAIL';
    // Run after runtime/DB cleanup: the protected target is reopened only in a read-only transaction.
    if(target) try {
      const after=await targetPendingMigrations();report.finalTargetJournal=after.journal;report.finalTargetFingerprint=after.fingerprint;
      assert.equal(after.fingerprint,target.fingerprint);assert.deepEqual(after.journal,target.journal);report.targetUnchanged=true;
    } catch(error) {failure??=error;report.targetUnchanged=false;report.status='FAIL';}
    try {report.finalOriginalArtifact=artifactManifest(originalBuild);assert.deepEqual(report.finalOriginalArtifact,report.originalArtifact);report.originalArtifactPreserved=true;}
    catch(error) {failure??=error;report.originalArtifactPreserved=false;report.status='FAIL';}
    try {
      report.finalSources=productSources();report.finalMigrationSources=migrationSources();report.finalVerificationSources=verificationSources();
      assert.deepEqual(report.finalSources,initialSources);assert.deepEqual(report.finalMigrationSources,initialMigrations);assert.deepEqual(report.finalVerificationSources,initialVerification);
      report.finalCandidateSourceBinding=bindCandidateSources(candidate.revision,report.finalSources,report.finalMigrationSources,report.finalVerificationSources);
      assert.deepEqual(report.finalCandidateSourceBinding,report.candidateSourceBinding);report.finalExecutionCheckoutRevision=git(['rev-parse','HEAD']);
    } catch(error) {failure??=error;report.status='FAIL';}
    if(failure) {report.status='FAIL';report.failureCode??=failure.code??'ASSERTION';report.failure??=failure.message;}

    report.evidenceFiles = readdirSync(evidenceDir).sort();
    report.finishedAt = new Date().toISOString(); save();
  }
  console.log(`${report.status}: ${report.checks.length} faktiska kontroller av tjänstefördelningen i ${projects.length} projekt, ${report.notExecuted.length} ej körda; privat rapport ${out}`);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); assert.deepEqual([args[0], args[2]], ['--build', '--out'], 'Använd --build <dir> --out /private/tmp/<namn>.json'); assert.equal(args.length, 4);
  const report = await verifyTjanstActual({ build: args[1], out: args[3] }); if (report.status !== 'PASS') process.exitCode = 1;
}
