#!/usr/bin/env node
// SOURCE-ONLY PROPOSAL 05-43. Never activate or call the target during preparation.
// Activation requires independent review and actual C16+C04x2+L36+G38+O36 evidence.
const SOURCE_ONLY = false;
const BASE_URL = 'http://127.0.0.1:3060';
const OPERATOR_PINS = [
 'PHASE5_CONTEXT_ACTUAL_REPORT','PHASE5_CONTEXT_APPROVED_SOURCE_REVISION',
 'PHASE5_CONTEXT_WRITE_ACTUAL_REPORT','PHASE5_CONTEXT_WRITE_APPROVED_SOURCE_REVISION',
 'PHASE5_LIST_ACTUAL_REPORT','PHASE5_LIST_APPROVED_SOURCE_REVISION',
 'PHASE5_GYM_ACTUAL_REPORT','PHASE5_GYM_APPROVED_SOURCE_REVISION',
];
const HELP = `SOURCE-ONLY 05-43 release proposal; actual execution disabled.
Usage: node work/pilot/verify-planning-year-release.mjs --help
       node work/pilot/verify-planning-year-release.mjs --dry-run --target protected --base-url ${BASE_URL}
Proposed activated verification: --target protected --base-url ${BASE_URL}
 --other-report <immutable O36.json> --other-source-revision <independently approved Git40>
 --artifact-dir <exact last isolated tested dist-protected> --out <new immutable reservedFAIL JSON> --completion-out <new unique completion JSON>
 --review-manifest <ROOT reviewed JSON> --review-manifest-sha256 <independently approved SHA256>
 --final-source-revision <ROOT Git40> --final-build-revision <ROOT Git40>
 --final-context-report <separate final C16.json> --final-context-source-revision <ROOT Git40>
All eight operator pins must be supplied outside the reports. No build, grant,
apply, reset, cleanup, deployment, browser rerun or child mutation is automatic.
Help/dry-run execute before filesystem imports, Git, target checks or network.
`;
const PLAN = [
 {step:1,kind:'offline-read',operation:'Validate eight independent operator pins and immutable C16/C04x2/L36/G38/O36 reports',runAutomatically:false},
 {step:2,kind:'offline-read',operation:'Validate actual SQL/API/performance/SEARCH evidence against its historical Git bytes; reject failures/deferred completion',runAutomatically:false},
 {step:3,kind:'offline-read',operation:'Bind every historical source/build closure and exact last O36 artifact; preserve first FAIL files',runAutomatically:false},
 {step:4,kind:'fresh-read-only',operation:'Explicit protected3060: full catalog/rawACL/RLS/journal, exact28 grants/closed helpers, whole15 and all audit/identity hashes',runAutomatically:false},
 {step:5,kind:'conditional-owner-work',operation:'Only changed or missing components return a bounded owner command; stop before any new fixture',runAutomatically:false},
 {step:6,kind:'documentation',operation:'Root reviews proven handbok changes, runs npm run docs:build once; separate human five-step result awaiting_user if unanswered',runAutomatically:false},
 {step:7,kind:'separate-transfer',operation:'Copy exact last tested artifact to3012 after reviewed transfer manifest; retain old hashed assets/private vars; read-only health/reopen',runAutomatically:false},
];
export function parseReleaseArgs(argv) {
 const o = {help:false,dryRun:false,target:null,baseURL:null,otherReport:null,otherSource:null,artifactDir:null,out:null,completionOut:null,reviewManifest:null,reviewManifestSha256:null,finalSource:null,finalBuild:null,finalContextReport:null,finalContextSource:null};
 const fields = {'--target':'target','--base-url':'baseURL','--other-report':'otherReport','--other-source-revision':'otherSource','--artifact-dir':'artifactDir','--out':'out','--completion-out':'completionOut','--review-manifest':'reviewManifest','--review-manifest-sha256':'reviewManifestSha256','--final-source-revision':'finalSource','--final-build-revision':'finalBuild','--final-context-report':'finalContextReport','--final-context-source-revision':'finalContextSource'};
 const seen = new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];if(seen.has(flag))throw Error('DUPLICATE_ARGUMENT');seen.add(flag);
  if(flag==='--help'){o.help=true;continue;}if(flag==='--dry-run'){o.dryRun=true;continue;}
  if(!Object.hasOwn(fields,flag)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('INVALID_ARGUMENT');o[fields[flag]]=argv[++i];
 }
 if(o.help){if(argv.length!==1)throw Error('HELP_MUST_BE_PURE');return o;}
 if(o.target!=='protected'||o.baseURL!==BASE_URL)throw Error('EXPLICIT_PROTECTED_3060_REQUIRED');
 if(!o.dryRun&&(!o.otherReport||!/^[a-f0-9]{40}$/u.test(o.otherSource??'')||!o.artifactDir||!o.out||!o.completionOut||o.out===o.completionOut||!o.reviewManifest||!/^[a-f0-9]{64}$/u.test(o.reviewManifestSha256??'')||![o.finalSource,o.finalBuild,o.finalContextSource].every(v=>/^[a-f0-9]{40}$/u.test(v??''))||!o.finalContextReport))throw Error('EXPLICIT_RELEASE_EVIDENCE_REQUIRED');
 return o;
}
// Closed structural inventories are inherited from the reviewed preparation.
// All specSHA come from the independently ROOT-reviewed manifest; no obsolete
// preparation hash is silently selected as an actual completed proof.
const INVENTORIES = {
 "C": {
  "runtime": [
   "web/app/planning-context.tsx",
   "web/app/planning-context.css",
   "web/app/context-switch.tsx",
   "web/app/protected-programplan-flow.tsx",
   "web/app/protected-programplan-lifecycle.tsx",
   "web/app/school-year-picker.tsx",
   "web/app/pupil-register-workspace.tsx"
  ],
  "tools": [
   "web/e2e/phase5-planning-year-context.spec.ts",
   "web/playwright.phase5-planning-year.config.ts"
  ],
  "spec": "web/e2e/phase5-planning-year-context.spec.ts",
  "total": 16,
  "prefix": "C",
  "cases": [
   1,
   2,
   3,
   4,
   5,
   6,
   7,
   8
  ],
  "attachment": "source-build.json"
 },
 "L": {
  "runtime": [
   "web/app/protected-plan-list.tsx",
   "web/app/protected-plan-list.css",
   "web/app/protected-planning-overview.tsx",
   "web/app/protected-programplan-list.tsx",
   "web/app/protected-programplan-workspace.tsx",
   "web/app/protected-programplan-flow.tsx",
   "web/app/protected-programplan-board.tsx",
   "web/app/protected-programplan.css",
   "web/app/protected-gym-timplan-hours.tsx",
   "web/app/protected-gym-timplan.css",
   "web/app/protected-gym-timplan-workspace.tsx",
   "web/app/protected-home.tsx",
   "web/app/planning-context.tsx",
   "web/app/planning-context.css",
   "web/lib/protected-plan-location.ts"
  ],
  "tools": [
   "work/pilot/phase5-planning-year-list-fixtures.mjs",
   "web/e2e/phase5-planning-year-lists.spec.ts",
   "web/playwright.phase5-planning-year.config.ts"
  ],
  "spec": "web/e2e/phase5-planning-year-lists.spec.ts",
  "total": 36,
  "prefix": "L",
  "cases": [
   1,
   2,
   3,
   4,
   5,
   6,
   7,
   8,
   9,
   10,
   11,
   12,
   13,
   14,
   15,
   16,
   17,
   18
  ],
  "attachment": "source-build-dependencies.json"
 },
 "G": {
  "runtime": [
   "web/app/protected-home.tsx",
   "web/app/planning-context.tsx",
   "web/app/planning-context.css",
   "web/lib/protected-plan-location.ts",
   "web/lib/planning-year-model.ts",
   "web/app/context-switch.tsx",
   "web/app/protected-programplan-flow.tsx",
   "web/app/protected-programplan-lifecycle.tsx",
   "web/app/protected-plan-list.tsx",
   "web/app/protected-plan-list.css",
   "web/app/protected-planning-overview.tsx",
   "web/app/protected-programplan-list.tsx",
   "web/app/protected-programplan-workspace.tsx",
   "web/app/protected-programplan-board.tsx",
   "web/app/protected-programplan.css",
   "web/app/protected-gym-timplan-workspace.tsx",
   "web/app/protected-gym-timplan-hours.tsx",
   "web/app/protected-gym-timplan.css"
  ],
  "tools": [
   "work/pilot/phase5-planning-year-gym-fixtures.mjs",
   "web/e2e/phase5-planning-year-gym.spec.ts",
   "work/pilot/phase5-planning-year-list-fixtures.mjs",
   "web/e2e/phase5-planning-year-lists.spec.ts",
   "web/e2e/phase5-planning-year-context.spec.ts",
   "web/playwright.phase5-planning-year.config.ts"
  ],
  "spec": "web/e2e/phase5-planning-year-gym.spec.ts",
  "total": 38,
  "prefix": "G",
  "cases": [
   1,
   2,
   3,
   4,
   5,
   6,
   7,
   8,
   9,
   10,
   11,
   12,
   13,
   14,
   15,
   16,
   17,
   18,
   19
  ],
  "attachment": "source-build-dependencies.json"
 },
 "O": {
  "runtime": [
   "web/app/protected-home.tsx",
   "web/app/protected-timplan-workspace.tsx",
   "web/app/protected-timplan.css",
   "web/app/planning-context.tsx",
   "web/app/planning-context.css",
   "web/lib/protected-plan-location.ts",
   "web/lib/protected-timplan.ts",
   "web/lib/planning-year-contract.ts",
   "web/lib/planning-year-model.ts",
   "web/app/protected-plan-list.tsx",
   "web/app/protected-plan-list.css",
   "web/app/protected-planning-overview.tsx"
  ],
  "tools": [
   "work/pilot/phase5-planning-year-other-fixtures.mjs",
   "web/e2e/phase5-planning-year-other.spec.ts",
   "work/pilot/phase5-planning-year-gym-fixtures.mjs",
   "web/e2e/phase5-planning-year-gym.spec.ts",
   "work/pilot/phase5-planning-year-list-fixtures.mjs",
   "web/e2e/phase5-planning-year-lists.spec.ts",
   "web/e2e/phase5-planning-year-context.spec.ts",
   "web/playwright.phase5-planning-year.config.ts"
  ],
  "spec": "web/e2e/phase5-planning-year-other.spec.ts",
  "total": 36,
  "prefix": "O",
  "cases": [
   1,
   2,
   3,
   4,
   5,
   6,
   7,
   8,
   9,
   10,
   11,
   12,
   13,
   14,
   15,
   16,
   17,
   18
  ],
  "attachment": "source-build-dependencies.json"
 },
 "C04": {
  "runtime": [
   "web/app/planning-context.tsx",
   "web/app/planning-context.css",
   "web/app/context-switch.tsx",
   "web/app/protected-programplan-flow.tsx",
   "web/app/protected-programplan-lifecycle.tsx",
   "web/app/school-year-picker.tsx",
   "web/app/pupil-register-workspace.tsx"
  ],
  "tools": [
   "web/e2e/phase5-planning-year-context.spec.ts",
   "web/playwright.phase5-planning-year.config.ts"
  ],
  "spec": "web/e2e/phase5-planning-year-context.spec.ts",
  "total": 2,
  "prefix": "C",
  "cases": [
   4
  ],
  "attachment": "source-build.json"
 }
};
const COMMON_TOOL_CLOSURE = [
 "work/pilot/phase5-planning-year-fixtures.mjs",
 "work/pilot/phase5-gym-timplan-fixtures.mjs",
 "work/pilot/phase5-programplan-browser-fixtures.mjs",
 "work/pilot/verify-target.mjs",
 "work/pilot/verify-programplan-locks.mjs",
 "work/pilot/prepare-programplan-user-trial.mjs",
 "work/pilot/apply-planning-year-migration.mjs",
 "work/pilot/apply-gym-timplan-migration.mjs",
 "work/pilot/verify-programplan-api.mjs",
 "work/pilot/verify-planning-year-api.mjs",
 "work/pilot/apply-planning-year-grants.mjs",
 "supabase/tests/phase5_programplan_drafts.test.sql",
 "supabase/migrations/20261006120000_phase5_planning_year_reads.sql",
 "supabase/migrations/20261006121000_phase5_worker_planning_year_reads.sql",
 "web/e2e/helpers/keycloak.ts",
 "web/playwright.phase5-planning-year.config.ts",
 "web/scripts/run-mode.mjs",
 "web/scripts/preview-worker.mjs",
 "web/scripts/preview-worker-modules.mjs",
 "web/package.json",
 "web/package-lock.json"
];
const BUILD_ROOTS=['web/app','web/lib','web/components','web/hooks','web/public','web/package.json','web/package-lock.json','web/vite.config.ts','web/tsconfig.json'];
const PROJECTS=['planning-year-desktop','planning-year-phone'];
export function invariant(ok,reason){if(!ok)throw Error(reason);}
// Audit-failure scenario images are legitimate positive proof; only cleanup closure attachments fail this gate.
export function hasUnsafeCleanupAttachment(attachments){
 return attachments.some(a=>/cleanup-(?:deferred|failure)/u.test(a.name));
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Reviewed bootstrap closure. Full immutable module SHA pins make the listed
// relative import graph auditable and prevent new/unlisted imports from being
// introduced merely by a permissive operator manifest. Type-only and lazy
// literal imports are conservatively included. No repo module is loaded here.
export const BOOTSTRAP_IMPORTS=Object.freeze({
 "web/lib/audit-export.ts":Object.freeze({sha256:"fefcb88eebab73b1cc9affc3eb4d799ffd0422b1cc405c8f6171f81a616f894c",repoImports:Object.freeze([]),externalImports:Object.freeze([])}),
 "web/lib/common.ts":Object.freeze({sha256:"0574a2f35fa82d62c6221e69744735bdd631ae1215e8a6c6154060759c2fadde",repoImports:Object.freeze([]),externalImports:Object.freeze([])}),
 "web/lib/gym-timplan.ts":Object.freeze({sha256:"5724d7c225e654476a7955d52e144d88909b126dcc66587df3c0b977edff70b6",repoImports:Object.freeze(["web/lib/programplan-catalog.ts", "web/lib/programplan-terms-contract.ts", "web/lib/programplan-terms.ts", "web/lib/protected-timplan.ts"]),externalImports:Object.freeze([])}),
 "web/lib/organisation-model.ts":Object.freeze({sha256:"8f7945121dc8d1ed03fb57fc7a0f83975fec38db72383265c78bf453a8eeb022",repoImports:Object.freeze(["web/lib/common.ts", "web/lib/registry-address.ts", "web/lib/syllabus.ts"]),externalImports:Object.freeze([])}),
 "web/lib/planning-year-contract.ts":Object.freeze({sha256:"ecb70c3addd4b53561b76511f16d8954ad65725fa2186d473b8e8e8004616d6e",repoImports:Object.freeze(["web/lib/gym-timplan.ts", "web/lib/planning-year-model.ts", "web/lib/protected-timplan.ts", "web/lib/pupil-register-model.ts", "web/lib/timplan-model.ts"]),externalImports:Object.freeze([])}),
 "web/lib/planning-year-model.ts":Object.freeze({sha256:"4888187e9b296737646515296dffd8fed8e78afdcf0355714a8bbbe7dfc263f9",repoImports:Object.freeze(["web/lib/gym-timplan.ts", "web/lib/pupil-register-model.ts"]),externalImports:Object.freeze([])}),
 "web/lib/programplan-catalog.ts":Object.freeze({sha256:"91bbc8024f539a25cb61f498047c052d66a81d37419572f857608a1612cb945c",repoImports:Object.freeze(["web/lib/programplan-choice-blocks.ts"]),externalImports:Object.freeze([])}),
 "web/lib/programplan-choice-blocks.ts":Object.freeze({sha256:"6c4223e2143b60bf45196a26e3ebeaf173f6ce1215980a5ab2e3c1cdaddf8e92",repoImports:Object.freeze(["web/lib/programplan-catalog.ts", "web/lib/programplan-terms.ts"]),externalImports:Object.freeze([])}),
 "web/lib/programplan-contract.ts":Object.freeze({sha256:"de699634c9e2221444e5ce36640f934cfc5d89ae0c0a59bd0649efd1179f9e2d",repoImports:Object.freeze(["web/lib/programplan-catalog.ts", "web/lib/programplan-choice-blocks.ts"]),externalImports:Object.freeze([])}),
 "web/lib/programplan-lifecycle.ts":Object.freeze({sha256:"8aa23155b2254cd230f5397d942f707e1fdf76f08ff20d87139c19db94d92338",repoImports:Object.freeze(["web/lib/programplan-catalog.ts"]),externalImports:Object.freeze([])}),
 "web/lib/programplan-table.ts":Object.freeze({sha256:"9c1ecdbebdb0bfdbf293dbb9c4abdf3626adc04407424e2dd1d64892de201d17",repoImports:Object.freeze(["web/lib/programplan-catalog.ts", "web/lib/programplan-choice-blocks.ts"]),externalImports:Object.freeze([])}),
 "web/lib/programplan-terms-contract.ts":Object.freeze({sha256:"bfb3e01fc65a42daae70f3eba660f9dc72a0f8c6de59803193cdbb8e041c3eb9",repoImports:Object.freeze(["web/lib/programplan-catalog.ts", "web/lib/programplan-terms.ts"]),externalImports:Object.freeze([])}),
 "web/lib/programplan-terms.ts":Object.freeze({sha256:"bed02c4e2d13c09fc6666fd2ada579224101d2ec78884b44ded2a95928e7e000",repoImports:Object.freeze(["web/lib/programplan-catalog.ts", "web/lib/programplan-choice-blocks.ts", "web/lib/programplan-table.ts"]),externalImports:Object.freeze([])}),
 "web/lib/programplan-workspace-contract.ts":Object.freeze({sha256:"f35e2eec36470ab6a5f014d207ab27e7744488edb6a70c94e45291647d14438e",repoImports:Object.freeze(["web/lib/programplan-catalog.ts", "web/lib/programplan-lifecycle.ts"]),externalImports:Object.freeze([])}),
 "web/lib/protected-timplan.ts":Object.freeze({sha256:"895ff46deaba7dcc66fcc41fb3d16cf657aca7b773a5c5e816ad4148a1a5d8cf",repoImports:Object.freeze(["web/lib/timplan-model.ts"]),externalImports:Object.freeze([])}),
 "web/lib/pupil-register-model.ts":Object.freeze({sha256:"9857b2089f2b0b74cb88f437132e199bc426f3a8fa2163c68293a5d71f7ec2e5",repoImports:Object.freeze(["web/lib/audit-export.ts"]),externalImports:Object.freeze([])}),
 "web/lib/registry-address.ts":Object.freeze({sha256:"dacb86f69ef8f7694a32ed1c18d62c3e1aec6741c22d6fec755058323d499850",repoImports:Object.freeze([]),externalImports:Object.freeze([])}),
 "web/lib/syllabus-snapshot.ts":Object.freeze({sha256:"0df0daf7cf05394e069bc0d3c1b60303482516fa3be8048de0332c02e7f082a9",repoImports:Object.freeze(["web/lib/syllabus.ts"]),externalImports:Object.freeze([])}),
 "web/lib/syllabus.ts":Object.freeze({sha256:"08331e61e6fb18a9fbc98c87066f64a79e5a54144d6bb347e0af1d5c894f1ee5",repoImports:Object.freeze(["web/lib/syllabus-snapshot.ts"]),externalImports:Object.freeze([])}),
 "web/lib/timplan-model.ts":Object.freeze({sha256:"d6c546418513cb78b99ef0096e25b1c17356a5810314a07a36e063518140dd49",repoImports:Object.freeze(["web/lib/common.ts", "web/lib/organisation-model.ts", "web/lib/syllabus.ts"]),externalImports:Object.freeze([])}),
 "work/pilot/apply-gym-timplan-migration.mjs":Object.freeze({sha256:"87069500c6a45a236959a40d0816683b5accfc19ec2958ffdff1ff8ce664355e",repoImports:Object.freeze(["work/pilot/verify-programplan-api.mjs", "work/pilot/verify-target.mjs"]),externalImports:Object.freeze(["node:crypto", "node:fs", "node:module", "node:path", "node:url"])}),
 "work/pilot/apply-planning-year-migration.mjs":Object.freeze({sha256:"45cf6cc5db0c500ce254c0d3991eb53d7b47621bc914fc0eb905439ab0019015",repoImports:Object.freeze(["work/pilot/apply-gym-timplan-migration.mjs", "work/pilot/verify-programplan-api.mjs", "work/pilot/verify-target.mjs"]),externalImports:Object.freeze(["node:crypto", "node:fs", "node:module", "node:path", "node:url"])}),
 "work/pilot/phase5-gym-timplan-fixtures.mjs":Object.freeze({sha256:"163a42fb1427e007e00a25a7ca567e83416f448848d9491bf14cf14bcb27ef5c",repoImports:Object.freeze(["web/lib/programplan-terms.ts", "work/pilot/phase5-programplan-browser-fixtures.mjs", "work/pilot/verify-target.mjs"]),externalImports:Object.freeze(["node:child_process", "node:crypto", "node:fs", "node:module", "node:path", "node:url"])}),
 "work/pilot/phase5-planning-year-fixtures.mjs":Object.freeze({sha256:"c868e836a312d7a90068b639d9cd112215468546c3036ef0f4b8228cfb5608d7",repoImports:Object.freeze(["work/pilot/apply-planning-year-migration.mjs", "work/pilot/phase5-gym-timplan-fixtures.mjs", "work/pilot/verify-target.mjs"]),externalImports:Object.freeze(["node:child_process", "node:crypto", "node:fs", "node:module", "node:path", "node:url"])}),
 "work/pilot/phase5-planning-year-search-fixtures.mjs":Object.freeze({sha256:"1e27792a69f6898c6900df6b2881063a8edd6e48165f71e8d6e84db9b90b224a",repoImports:Object.freeze(["web/lib/programplan-choice-blocks.ts", "web/lib/programplan-terms.ts", "work/pilot/apply-planning-year-migration.mjs", "work/pilot/phase5-planning-year-fixtures.mjs", "work/pilot/verify-target.mjs"]),externalImports:Object.freeze(["node:crypto", "node:module"])}),
 "work/pilot/phase5-programplan-browser-fixtures.mjs":Object.freeze({sha256:"51b947176323157c748979ae9c8cf0e4d5ccad967dbe176c40cb70b6b30d8e79",repoImports:Object.freeze(["web/lib/programplan-choice-blocks.ts", "web/lib/programplan-lifecycle.ts", "work/pilot/prepare-programplan-user-trial.mjs", "work/pilot/verify-programplan-locks.mjs", "work/pilot/verify-target.mjs"]),externalImports:Object.freeze(["node:child_process", "node:crypto", "node:fs", "node:module", "node:path", "node:url"])}),
 "work/pilot/prepare-programplan-user-trial.mjs":Object.freeze({sha256:"3d65d776ee3f4a3d95d1d407e649a9eee8d7ce32a8f93886db77443f6843521f",repoImports:Object.freeze(["web/lib/programplan-catalog.ts", "web/lib/programplan-choice-blocks.ts", "web/lib/programplan-lifecycle.ts", "web/lib/programplan-workspace-contract.ts", "work/pilot/verify-target.mjs"]),externalImports:Object.freeze(["node:crypto", "node:fs", "node:module", "node:url"])}),
 "work/pilot/verify-planning-year-api.mjs":Object.freeze({sha256:"d38cdbcab647cf751da8f0ea8c74570c4abdad8cd61a9b1d522bb33775633e5b",repoImports:Object.freeze(["work/pilot/apply-gym-timplan-migration.mjs", "work/pilot/apply-planning-year-migration.mjs", "work/pilot/phase5-planning-year-fixtures.mjs", "work/pilot/verify-programplan-api.mjs", "work/pilot/verify-target.mjs"]),externalImports:Object.freeze(["node:crypto", "node:fs", "node:module", "node:os", "node:path", "node:url"])}),
 "work/pilot/verify-planning-year-foundation.mjs":Object.freeze({sha256:"0d18dc223fadbb2bb035febaf3d01f63d1adc63dd31e4fa7b87fa390e2ccf147",repoImports:Object.freeze(["web/lib/planning-year-contract.ts", "work/pilot/apply-gym-timplan-migration.mjs", "work/pilot/apply-planning-year-migration.mjs", "work/pilot/phase5-programplan-browser-fixtures.mjs", "work/pilot/verify-programplan-api.mjs", "work/pilot/verify-target.mjs"]),externalImports:Object.freeze(["node:assert/strict", "node:child_process", "node:crypto", "node:fs", "node:module", "node:path", "node:url"])}),
 "work/pilot/verify-planning-year-read-performance.mjs":Object.freeze({sha256:"60751ac7b7ea548b2c63901bb937df3e1072ba3e80a393cc646bf0cdfe2eafd1",repoImports:Object.freeze(["web/lib/planning-year-contract.ts", "work/pilot/apply-gym-timplan-migration.mjs", "work/pilot/apply-planning-year-migration.mjs", "work/pilot/phase5-planning-year-fixtures.mjs", "work/pilot/verify-planning-year-api.mjs", "work/pilot/verify-planning-year-foundation.mjs", "work/pilot/verify-programplan-api.mjs", "work/pilot/verify-target.mjs"]),externalImports:Object.freeze(["node:child_process", "node:crypto", "node:fs", "node:module", "node:path", "node:perf_hooks", "node:url"])}),
 "work/pilot/verify-planning-year-search-details.mjs":Object.freeze({sha256:"c2838818a0e440b2d93b8bd98596df8ad92c56d28cdd6f27eb4b1900a824f578",repoImports:Object.freeze(["web/lib/planning-year-contract.ts", "work/pilot/apply-gym-timplan-migration.mjs", "work/pilot/apply-planning-year-migration.mjs", "work/pilot/phase5-planning-year-fixtures.mjs", "work/pilot/phase5-planning-year-search-fixtures.mjs", "work/pilot/verify-planning-year-api.mjs", "work/pilot/verify-planning-year-foundation.mjs", "work/pilot/verify-planning-year-read-performance.mjs", "work/pilot/verify-programplan-api.mjs", "work/pilot/verify-target.mjs"]),externalImports:Object.freeze(["node:child_process", "node:crypto", "node:fs", "node:module", "node:path", "node:perf_hooks", "node:url"])}),
 "work/pilot/verify-programplan-api.mjs":Object.freeze({sha256:"626cf54e147a8f13dbb7888be0062de8d08323c6b583599e0a1d17364dac73fe",repoImports:Object.freeze(["web/lib/programplan-catalog.ts", "web/lib/programplan-contract.ts", "web/lib/programplan-lifecycle.ts", "work/pilot/verify-programplan-locks.mjs", "work/pilot/verify-target.mjs"]),externalImports:Object.freeze(["node:child_process", "node:crypto", "node:fs", "node:module", "node:os", "node:path", "node:url"])}),
 "work/pilot/verify-programplan-locks.mjs":Object.freeze({sha256:"e44ccd314deb546e6dc3ffb5f3a962098497935e6c1a333e45808348ff1de0a1",repoImports:Object.freeze(["web/lib/programplan-catalog.ts", "web/lib/programplan-choice-blocks.ts", "web/lib/programplan-lifecycle.ts", "work/pilot/verify-target.mjs"]),externalImports:Object.freeze(["node:assert/strict", "node:child_process", "node:crypto", "node:fs/promises", "node:module", "node:path", "node:url"])}),
 "work/pilot/verify-target.mjs":Object.freeze({sha256:"984729588773c910a3f016bf1e42a0f9503caa22a21c8b702621cec75a3b009f",repoImports:Object.freeze([]),externalImports:Object.freeze(["node:child_process", "node:fs", "node:path", "node:url"])}),
});
export const BOOTSTRAP_DATA=Object.freeze({"web/package.json": "3211f1f9d8c153a59526c07bf1dfb57bb81ec600bb3bb825e96a4973fb6e2909", "web/package-lock.json": "049041fed97cb867113772a3dc909d51adb85dec8ff4acf53020ea11ba938190"});
export function validateBootstrapInventory(hashes){
 invariant(hashes!==null&&typeof hashes==='object'&&!Array.isArray(hashes)&&Object.getPrototypeOf(hashes)===Object.prototype,'BOOTSTRAP_HASH_MAP');
 for(const [file,entry]of Object.entries(BOOTSTRAP_IMPORTS)){
  invariant(entry.repoImports.every(p=>Object.hasOwn(BOOTSTRAP_IMPORTS,p))&&entry.externalImports.every(p=>p.startsWith('node:')),'CLOSED_BOOTSTRAP_IMPORT_GRAPH');
  const descriptor=Object.getOwnPropertyDescriptor(hashes,file);
  invariant(descriptor&&descriptor.get===undefined&&descriptor.set===undefined&&descriptor.value===entry.sha256,'MANDATORY_PINNED_BOOTSTRAP_MODULE');
 }
 for(const [file,digest]of Object.entries(BOOTSTRAP_DATA)){
  const descriptor=Object.getOwnPropertyDescriptor(hashes,file);
  invariant(descriptor&&descriptor.get===undefined&&descriptor.set===undefined&&descriptor.value===digest,'MANDATORY_BOOTSTRAP_PACKAGE_INPUT');
 }
 return [...Object.keys(BOOTSTRAP_IMPORTS),...Object.keys(BOOTSTRAP_DATA)].sort();
}

const SHA256=/^[a-f0-9]{64}$/u,GIT40=/^[a-f0-9]{40}$/u;
const exactKeys=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&Object.getPrototypeOf(o)===Object.prototype&&Reflect.ownKeys(o).every(k=>typeof k==='string'&&Object.getOwnPropertyDescriptor(o,k)?.get===undefined&&Object.getOwnPropertyDescriptor(o,k)?.set===undefined)&&same(Object.keys(o).sort(),[...keys].sort());
const releasePath=p=>typeof p==='string'&&/^work\/pilot\/results\/[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/u.test(p);
const relativeSource=p=>typeof p==='string'&&!p.startsWith('/')&&!p.split('/').some(v=>v==='..'||v==='.'||v==='')&&!/[\0\\\r\n]/u.test(p);
// Proposed closed schemas. ROOT supplies actual files and approves their raw SHA;
// no example manifest/seal with fabricated positive values is emitted by us.
export function validateReleaseReview(m,o,env){
 invariant(exactKeys(m,['kind','target','baseURL','finalSourceRevision','finalBuildRevision','sourceHashes','specPins','operatorPins','other','finalContext','artifactSeal']),'CLOSED_REVIEW_MANIFEST');
 invariant(m.kind==='phase5-planning-year-release-root-review-v1'&&m.target==='protected'&&m.baseURL===BASE_URL,'REVIEW_TARGET');
 invariant(GIT40.test(m.finalSourceRevision)&&GIT40.test(m.finalBuildRevision)&&m.finalSourceRevision===o.finalSource&&m.finalBuildRevision===o.finalBuild,'INDEPENDENT_FINAL_SOURCE_BUILD');
 invariant(exactKeys(m.specPins,['C','C04','L','G','O'])&&Object.values(m.specPins).every(h=>SHA256.test(h)),'REVIEWED_FIVE_SPEC_PINS');
 invariant(exactKeys(m.operatorPins,OPERATOR_PINS),'EXACT_EIGHT_OPERATOR_PINS');
 for(const [i,key]of OPERATOR_PINS.entries())invariant(typeof env[key]==='string'&&env[key]===m.operatorPins[key]&&(i%2?GIT40.test(env[key]):releasePath(env[key])),'INDEPENDENT_OPERATOR_PIN');
 invariant(exactKeys(m.other,['report','approvedSourceRevision'])&&releasePath(m.other.report)&&GIT40.test(m.other.approvedSourceRevision)&&m.other.report===o.otherReport&&m.other.approvedSourceRevision===o.otherSource,'INDEPENDENT_OTHER_PIN');
 invariant(exactKeys(m.finalContext,['report','approvedSourceRevision','specSha256','reportSha256'])&&releasePath(m.finalContext.report)&&GIT40.test(m.finalContext.approvedSourceRevision)&&SHA256.test(m.finalContext.specSha256)&&SHA256.test(m.finalContext.reportSha256)&&m.finalContext.report===o.finalContextReport&&m.finalContext.approvedSourceRevision===o.finalContextSource,'INDEPENDENT_SEPARATE_FINAL_C16');
 invariant(exactKeys(m.artifactSeal,['report','sha256'])&&releasePath(m.artifactSeal.report)&&SHA256.test(m.artifactSeal.sha256),'ROOT_ARTIFACT_SEAL_PIN');
 const hashes=m.sourceHashes;invariant(hashes&&Object.getPrototypeOf(hashes)===Object.prototype&&Object.keys(hashes).length>0&&Reflect.ownKeys(hashes).every(k=>typeof k==='string'&&relativeSource(k)&&Object.getOwnPropertyDescriptor(hashes,k)?.get===undefined&&Object.getOwnPropertyDescriptor(hashes,k)?.set===undefined&&SHA256.test(hashes[k])),'REVIEWED_SOURCE_HASH_MAP');
 return m;
}
export function validateFinalArtifactSeal(seal,launch,{review,prior,runtimeClosureSha256,artifactFiles,sha}){
 invariant(exactKeys(seal,['kind','target','baseURL','finalSourceRevision','finalBuildRevision','otherReportSha256','otherApprovedSourceRevision','runtimeClosureSha256','artifactFiles','artifactInventorySha256','recordedDuringActualO','launchProof']),'CLOSED_FINAL_ARTIFACT_SEAL');
 invariant(seal.kind==='phase5-planning-year-tested-artifact-seal-v1'&&seal.target==='protected'&&seal.baseURL===BASE_URL&&seal.recordedDuringActualO===true,'ACTUAL_O_ARTIFACT_RECORD_REQUIRED');
 invariant(seal.finalSourceRevision===review.finalSourceRevision&&seal.finalBuildRevision===review.finalBuildRevision&&seal.otherReportSha256===prior.O.reportSha256&&seal.otherApprovedSourceRevision===prior.O.approvedSourceRevision&&seal.runtimeClosureSha256===runtimeClosureSha256,'FINAL_ARTIFACT_TESTED_SOURCE');
 invariant(Array.isArray(seal.artifactFiles)&&seal.artifactFiles.length>0&&same(seal.artifactFiles,artifactFiles)&&seal.artifactInventorySha256===sha(Buffer.from(JSON.stringify(artifactFiles))),'EXACT_TESTED_ARTIFACT_FILES');
 invariant(exactKeys(seal.launchProof,['report','sha256'])&&releasePath(seal.launchProof.report)&&SHA256.test(seal.launchProof.sha256),'INDEPENDENT_LAUNCH_PROOF_RAW_PIN');
 invariant(exactKeys(launch,['kind','target','baseURL','sourceRevision','buildRevision','artifactInventorySha256','recordedBeforeOtherCases','completionKnown']),'CLOSED_TESTED_LAUNCH_PROOF');
 invariant(launch.kind==='phase5-planning-year-isolated-tested-launch-v1'&&launch.target==='protected'&&launch.baseURL===BASE_URL&&launch.sourceRevision===prior.O.approvedSourceRevision&&launch.buildRevision===review.finalBuildRevision&&launch.artifactInventorySha256===seal.artifactInventorySha256&&launch.recordedBeforeOtherCases===true&&launch.completionKnown===true,'ROOT_REVIEWED_ACTUAL_TESTED_LAUNCH');
}
export function validateSearchFinal(e,rollback,applied,search,performance,readSource,sha){
 const exact=(a,b)=>Array.isArray(a)&&same([...a].sort(),[...b].sort());
 invariant(e?.kind==='phase5-planning-year-search-details'&&e.mode==='applied'&&e.status==='PASS'&&e.complete===true&&e.target==='protected'&&e.scope==='local-synthetic-only'&&e.reset===false&&e.rollback===true&&e.failure==null&&e.databaseRecoveryRequired===false,'COMPLETE_SEARCH_FINAL');
 invariant(e.originalDefinitionHash===rollback.originalDefinitionHash&&e.candidateDefinitionHash===rollback.candidateDefinitionHash&&same(e.dependencyHashes,rollback.dependencyHashes)&&e.workerBuildRevision===applied.workerBuildRevision,'SEARCH_FINAL_APPLIED_DEPENDENCIES');
 invariant(same(e.beforeCatalog,applied.afterCatalog)&&same(e.beforeCatalog,e.afterCatalog)&&e.baselineFingerprint===applied.afterFingerprint&&e.baselineFingerprint===e.finalFingerprint&&search.searchCatalogFingerprint(e.afterCatalog)===e.finalFingerprint,'SEARCH_FINAL_CATALOG');
 invariant(same(e.beforeAcl,applied.afterAcl)&&same(e.beforeAcl,e.afterAcl)&&exact(e.beforeWorkerFunctions,search.SEARCH_WORKER_ENTRIES)&&exact(e.afterWorkerFunctions,search.SEARCH_WORKER_ENTRIES),'SEARCH_FINAL_RAW28');
 invariant(search.searchWholeRowsValid(e.originalHashes)&&same(e.originalHashes,applied.finalHashes)&&same(e.originalHashes,e.finalHashes)&&search.searchAnchorsValid(e.originalAnchors,e.finalOriginalAnchors)&&search.searchAnchorsValid(e.finalAllAnchors,e.finalAllAnchors),'SEARCH_FINAL_WHOLE15_ALL_ANCHORS');
 invariant(['functionsAndJournalPreserved','aclUnchanged','originalBusinessPreserved','originalTimestampsPreserved','originalAuditPreserved','identityAnchorsPreserved'].every(k=>e[k]===true)&&Array.isArray(e.checks)&&e.checks.length>0&&e.checks.every(k=>k.ok===true),'SEARCH_FINAL_ALL_PRESERVATION_CHECKS');
 invariant(search.searchSqlCompleted(e.sql)&&search.exactSearchTap(e.sql.tap,search.SEARCH_SQL_TAP_TOTAL)&&e.sqlProof?.ok===true,'SEARCH_FINAL_SQL271');
 invariant(search.searchSqlProof([...e.sqlProof.core.map(c=>'PLANNING_SEARCH_PARITY|'+JSON.stringify(c)),...e.sqlProof.matches.map(c=>'PLANNING_SEARCH_MATCH|'+JSON.stringify(c))].join('\n')).ok,'SEARCH_FINAL_RECOMPUTED_PARITY');
 for(const k of ['original','candidate']){const s=e.originalSql?.[k];invariant(search.searchSqlCompleted(s)&&search.exactSearchTap(s.tap,93)&&s.parity?.ok===true&&exact(s.parity.cases.map(c=>c.name),performance.PERFORMANCE_ORIGINAL_PARITY_CASES)&&s.parity.cases.every(c=>c.ok===true),'SEARCH_FINAL_ORIGINAL93_18');}
 invariant(e.searchApi?.ok===true&&e.searchApi.cleanupDeferred===false&&e.searchApi.setupUnknown===false&&e.searchApi.failure==null&&search.searchCasesComplete(e.searchApi.cases,search.SEARCH_API_CASES)&&search.searchTimingsComplete(e.searchApi.samples)&&e.performance?.ok===true,'SEARCH_FINAL_COMPLETE_HTTP');
 invariant(e.cleanupStatus==='PASS'&&search.searchCleanupPreserved(e.cleanup)&&e.fullApiStatus==='PASS'&&e.fullApi?.cases===15&&SHA256.test(e.fullApi.sha256??'')&&e.fullApi.workerBuildRevision===e.workerBuildRevision,'SEARCH_FINAL_FULL_API_CLEANUP');
 invariant(e.sourceHash===sha(readSource(`supabase/migrations/${search.SEARCH_MIGRATION}`))&&e.testHash===sha(readSource(search.SEARCH_TEST)),'SEARCH_FINAL_SQL_SOURCE_BYTES');
}

// V3: hash and parser consume one identical sealed read, never a second read.
export function parseSealedJson(sealed,hash,approvedRawSha256=null){
 invariant(Buffer.isBuffer(sealed?.bytes)&&typeof sealed.digest==='string'&&hash(sealed.bytes)===sealed.digest,'SEALED_BYTES_DIGEST_MISMATCH');
 if(approvedRawSha256!==null)invariant(sealed.digest===approvedRawSha256,'INDEPENDENT_FINAL_C16_RAW_REPORT_SHA');
 return JSON.parse(sealed.bytes.toString());
}
export function validateOwnedFileIdentity(expected,current,reason){
 invariant(expected?.isFile()&&current?.isFile()&&!current.isSymbolicLink()&&expected.dev===current.dev&&expected.ino===current.ino&&expected.nlink===1&&current.nlink===1&&(expected.mode&0o777)===0o600&&(current.mode&0o777)===0o600,reason);
}
export function writeJsonFd(ops,fd,value){
 const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');ops.ftruncateSync(fd,0);let written=0;
 while(written<bytes.length){const n=ops.writeSync(fd,bytes,written,bytes.length-written,written);invariant(Number.isSafeInteger(n)&&n>0&&n<=bytes.length-written,'RESULT_WRITE_INCOMPLETE');written+=n;}
 ops.fsyncSync(fd);return bytes;
}
export function closeOwnedReleaseFiles(ops,{lock,out,lockFd,outFd,ownedLockStat,reservedStat,dbClosed}){
 let failure=null,ownershipChecked=false,reservedClosed=false,lockClosed=false,lockReleased=false;
 if(lockFd!==undefined){try{validateOwnedFileIdentity(ownedLockStat,ops.fstatSync(lockFd),'OWN_SERIAL_LOCK_CHANGED');validateOwnedFileIdentity(ownedLockStat,ops.lstatSync(lock),'OWN_SERIAL_LOCK_CHANGED');if(outFd!==undefined){validateOwnedFileIdentity(reservedStat,ops.fstatSync(outFd),'OWN_RESERVED_RESULT_CHANGED');validateOwnedFileIdentity(reservedStat,ops.lstatSync(out),'OWN_RESERVED_RESULT_CHANGED');}ownershipChecked=true;}catch{failure={code:'RELEASE_FILE_OWNERSHIP_REFUSED'};}}
 if(outFd!==undefined){try{ops.closeSync(outFd);reservedClosed=true;}catch{failure??={code:'RESERVED_RESULT_CLOSE_UNKNOWN'};}}
 if(lockFd!==undefined){try{ops.closeSync(lockFd);lockClosed=true;}catch{failure??={code:'SERIAL_LOCK_CLOSE_UNKNOWN'};}
  if(ownershipChecked&&lockClosed&&reservedClosed&&dbClosed){try{validateOwnedFileIdentity(ownedLockStat,ops.lstatSync(lock),'OWN_SERIAL_LOCK_CHANGED');ops.unlinkSync(lock);lockReleased=true;}catch{failure??={code:'SERIAL_LOCK_RELEASE_REFUSED'};}}
 }
 return {ownershipChecked,reservedClosed,lockClosed,lockReleased,failure};
}
export function completedReleaseStatus({verificationComplete,readCompletionKnown,dbClosed,reservedClosed,lockClosed,lockReleased,failure}){
 const complete=!failure&&verificationComplete===true&&readCompletionKnown===true&&dbClosed===true&&reservedClosed===true&&lockClosed===true&&lockReleased===true;
 return {status:complete?'PASS':'FAIL',complete};
}
// Separate completion publication after closure. The immutable reserved FAIL
// survives every publication error; no rename/copy/foreign overwrite fallback.
export function publishCompletion(ops,full,value){
 let fd,own,closeAttempted=false,stage='OPEN';
 try{
  fd=ops.openSync(full,ops.constants.O_WRONLY|ops.constants.O_CREAT|ops.constants.O_EXCL|ops.constants.O_NOFOLLOW,0o600);
  stage='IDENTITY';own=ops.fstatSync(fd);validateOwnedFileIdentity(own,ops.lstatSync(full),'COMPLETION_FILE_IDENTITY');
  stage='WRITE_FSYNC';writeJsonFd(ops,fd,value);stage='CLOSE';closeAttempted=true;ops.closeSync(fd);return;
 }catch{
  const failed={...value,status:'FAIL',complete:false,failure:value.failure??{code:'COMPLETION_PUBLICATION_REFUSED'},completionFailure:{stage,code:'COMPLETION_PUBLICATION_REFUSED'}};
  // Downgrade only a file exclusively created by this call, using its own FD or
  // an inode-checked NOFOLLOW FD after uncertain close. Existing/foreign outputs
  // are never opened for writing. This is failure preservation, not a rerun.
  if(own){let failureFd;
   try{
    failureFd=closeAttempted?ops.openSync(full,ops.constants.O_WRONLY|ops.constants.O_NOFOLLOW):fd;
    validateOwnedFileIdentity(own,ops.fstatSync(failureFd),'COMPLETION_FAILURE_FILE_CHANGED');
    validateOwnedFileIdentity(own,ops.lstatSync(full),'COMPLETION_FAILURE_FILE_CHANGED');
    writeJsonFd(ops,failureFd,failed);ops.closeSync(failureFd);
   }catch{/* Reserved FAIL remains the immutable evidence if IO itself is broken. */}
  }else if(fd!==undefined&&!closeAttempted){try{ops.closeSync(fd);}catch{/* Never convert unknown publication into PASS. */}}
  throw Error('COMPLETION_PUBLICATION_REFUSED');
 }
}

// Lazily imported only in the proposed activated path. Importing this draft or
// invoking help/dry-run cannot load a target validator, fixture or subprocess.
async function verifyActivatedEvidence(o){
 const fs=await import('node:fs'),path=await import('node:path'),crypto=await import('node:crypto'),cp=await import('node:child_process'),url=await import('node:url');
 const root=fs.realpathSync(process.cwd()),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 const repoRead=p=>fs.readFileSync(path.join(root,p));
 const tool=async p=>import(url.pathToFileURL(path.join(root,p)).href);
 const git=(...args)=>cp.execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:32*1024*1024});
 const gitRead=(revision,file)=>git('show',`${revision}:${file}`);
 const reports=new Set(),attachments=new Set(),inputSeals=new Map();
 function sealedRead(file){
  invariant(typeof file==='string'&&file.length>0,'EVIDENCE_PATH_REQUIRED');
  const full=path.resolve(root,file);let cursor=path.parse(full).root;
  for(const part of full.slice(cursor.length).split(path.sep)){cursor=path.join(cursor,part);const stat=fs.lstatSync(cursor);invariant(!stat.isSymbolicLink(),'EVIDENCE_SYMLINK');}
  const stat=fs.lstatSync(full);invariant(stat.isFile()&&stat.nlink===1&&fs.realpathSync(full)===full&&[path.join(root,'work/pilot/results'),path.join(root,'web/test-results')].some(parent=>full.startsWith(parent+path.sep)),'EVIDENCE_PATH_SCOPE');
  const bytes=fs.readFileSync(full);const digest=sha(bytes);invariant(!inputSeals.has(full)||inputSeals.get(full)===digest,'EVIDENCE_CHANGED_DURING_VALIDATION');inputSeals.set(full,digest);return {full,bytes,digest};
 }
 function report(file,approvedRawSha256=null){const sealed=sealedRead(file);reports.add(sealed.full);return {full:sealed.full,bytes:sealed.bytes,value:parseSealedJson(sealed,sha,approvedRawSha256)};}
 function attachment(a){
  if(a.path){const sealed=sealedRead(a.path);attachments.add(sealed.full);return parseSealedJson(sealed,sha);}
  invariant(typeof a.body==='string','ATTACHMENT_MISSING');return JSON.parse(Buffer.from(a.body,'base64').toString());
 }
 const reviewed=report(o.reviewManifest);invariant(sha(reviewed.bytes)===o.reviewManifestSha256,'INDEPENDENT_REVIEW_MANIFEST_SHA');
 const review=validateReleaseReview(reviewed.value,o,process.env);
 const bootstrapFiles=validateBootstrapInventory(review.sourceHashes);
 const startingHead=git('rev-parse','HEAD').toString().trim();invariant(startingHead===o.finalSource,'EXPLICIT_FINAL_HEAD_BEFORE_TOOL_IMPORT');
 for(const file of bootstrapFiles)invariant(sha(gitRead(startingHead,file))===review.sourceHashes[file]&&sha(repoRead(file))===review.sourceHashes[file],'BOOTSTRAP_GIT_WORKING_BYTES_BEFORE_IMPORT');
 for(const [file,digest]of Object.entries(review.sourceHashes))invariant(sha(gitRead(startingHead,file))===digest&&sha(repoRead(file))===digest,'REVIEWED_BYTES_BEFORE_TOOL_IMPORT');
 invariant(git('status','--porcelain','--',...Object.keys(review.sourceHashes)).toString()==='','REVIEWED_SOURCE_CLEAN_BEFORE_TOOL_IMPORT');
 const inventories=Object.fromEntries(Object.entries(INVENTORIES).map(([k,v])=>[k,{...v,specSha:review.specPins[k]}]));
 inventories.FinalC={...inventories.C,specSha:review.finalContext.specSha256};
 const search=await tool('work/pilot/verify-planning-year-search-details.mjs');
 const api=await tool('work/pilot/verify-planning-year-api.mjs');
 const foundation=await tool('work/pilot/apply-planning-year-migration.mjs');
 const performance=await tool('work/pilot/verify-planning-year-read-performance.mjs');
 const exact=(a,b)=>Array.isArray(a)&&same([...a].sort(),[...b].sort());
 function tree(revision,paths){return git('ls-tree','-r','-z',revision,'--',...paths).toString().split('\0').filter(Boolean).map(line=>{
  const m=/^(100644|100755) blob [a-f0-9]{40}\t(.+)$/u.exec(line);invariant(m,'NONREGULAR_SOURCE_TREE');return m[2];}).sort();}
 function buildClosure(source,build){
  const keep=p=>!p.includes('/e2e/')&&!/\.test\.[^/]+$/u.test(p),a=tree(source,BUILD_ROOTS).filter(keep),b=tree(build,BUILD_ROOTS).filter(keep);
  invariant(a.length&&same(a,b),'BUILD_PATH_CLOSURE');
  return sha(Buffer.from(JSON.stringify(a.map(p=>{const h=sha(gitRead(source,p));invariant(sha(gitRead(build,p))===h,'BUILD_BYTE_CLOSURE');return [p,h];}))));
 }
 function cleanup(c,phase){
  invariant(api.planningCleanupPreserved(c),'AUDIT_IDENTITY_OWNED_CLEANUP');
  for(const key of ['originalBusiness','finalBusiness']){
   invariant(exact(Object.keys(c[key]??{}),foundation.PLANNING_TABLES),'EXACT_WHOLE15_KEYS');
   for(const v of Object.values(c[key]))invariant(exact(Object.keys(v),['count','sha256'])&&Number.isSafeInteger(v.count)&&v.count>=0&&/^[a-f0-9]{64}$/u.test(v.sha256??''),'WHOLE15_COUNT_HASH');
  }
  invariant(same(c.originalBusiness,c.finalBusiness),'WHOLE15_PRESERVATION');
  for(const [a,b]of [['originalAuditHash','finalAuditHash'],['originalIdentityHash','finalIdentityHash']])invariant(/^[a-f0-9]{64}$/u.test(c[a]??'')&&c[a]===c[b],'ORIGINAL_AUDIT_IDENTITY_HASHES');
  if(!['C','C04','FinalC'].includes(phase))invariant(same(c.listRemaining,{classes:0,bindings:0,versions:0}),'LIST_CLEANUP');
  if(phase==='G'||phase==='O')invariant(same(c.gymYearRemaining,{plans:0}),'GYM_CLEANUP');
  if(phase==='O')invariant(same(c.otherYearRemaining,{plans:0,offerings:0,classes:0}),'OTHER_CLEANUP');
 }
 const dependencyFiles={final38:'phase5-38-api-final',performanceRollback:'phase5-38-read-performance-rollback',performanceFinal:'phase5-38-read-performance-final',performanceApi:'phase5-38-read-performance-api-final'};
 const bundle=Object.fromEntries(Object.entries(dependencyFiles).map(([k,n])=>[k,report(`work/pilot/results/${n}.json`).value]));
 search.validateSearchDependencies(bundle,gitRead,repoRead);
 const rb=report('work/pilot/results/phase5-40-search-details-rollback.json'),ap=report('work/pilot/results/phase5-40-search-details-apply.json'),sf=report('work/pilot/results/phase5-40-search-details-final.json');
 search.validateSearchRollback(rb.value,p=>gitRead(rb.value.sourceCommit,p));search.validateSearchApplied(ap.value,rb.value,p=>gitRead(ap.value.sourceCommit,p));
 search.validateHistoricalSources(sf.value,search.SEARCH_SOURCE_PATHS,gitRead);
 invariant(sf.value.status==='PASS'&&sf.value.complete===true&&sf.value.mode==='applied'&&sf.value.databaseRecoveryRequired===false&&sf.value.fullApiStatus==='PASS'&&sf.value.cleanupStatus==='PASS','SEARCH_FINAL_COMPLETE');
 invariant(search.searchCasesComplete(sf.value.searchApi?.cases,search.SEARCH_API_CASES)&&search.searchTimingsComplete(sf.value.searchApi?.samples)&&search.searchCleanupPreserved(sf.value.cleanup),'ACTUAL_SEARCH_API_TIMING_CLEANUP');
 validateSearchFinal(sf.value,rb.value,ap.value,search,performance,p=>gitRead(sf.value.sourceCommit,p),sha);
 const searchApiFinal=report('work/pilot/results/phase5-40-search-details-api-final.json');
 performance.validatePerformanceBaseApi(searchApiFinal.value,p=>gitRead(searchApiFinal.value.sourceCommit,p));
 invariant(sha(Buffer.from(JSON.stringify(searchApiFinal.value)))===sf.value.fullApi.sha256&&searchApiFinal.value.workerBuildRevision===sf.value.workerBuildRevision,'SEARCH_FINAL_RAW_FULL_API');
 const cleanupBaselines=[],finalContextAnchors=[];const prior={};
 function validateBrowser(name,reportPath,approved){
  const inv=inventories[name];invariant(/^[a-f0-9]{40}$/u.test(approved??''),'INDEPENDENT_APPROVED_SOURCE_REQUIRED');
  const r=report(reportPath,name==='FinalC'?review.finalContext.reportSha256:null),e=r.value;invariant(same(e.errors,[])&&e.stats.expected===inv.total&&e.stats.unexpected===0&&e.stats.skipped===0&&e.stats.flaky===0,'COMPLETE_BROWSER_COUNTS');
  invariant(e.config.workers===1&&e.config.maxFailures===1&&exact(e.config.projects.map(p=>p.name),PROJECTS)&&e.config.projects.every(p=>p.retries===0),'SERIAL_FAIL_FAST_PROJECTS');
  const all=[];const walk=s=>{for(const spec of s.specs??[])for(const entry of spec.tests??[])all.push({spec,entry});for(const child of s.suites??[])walk(child);};for(const s of e.suites??[])walk(s);
  invariant(all.length===inv.total,'NO_HIDDEN_OTHER_CASES');const seen=new Set(),proofs=new Map();
  for(const {spec,entry}of all){
   invariant(Array.isArray(entry.results)&&entry.results.length===1&&Array.isArray(entry.results[0].attachments),'RESULT_ATTACHMENT_ARRAY');
   if(name==='C04')invariant(spec.title==='C04: verklig pågående timskrivning spärrar år/skola/vy/Back/uppdrag/utloggning tills kvittens','EXACT_C04_WRITE_TITLE');
   const m=new RegExp(`^${inv.prefix}(\\d{2}):`).exec(spec.title),caseId=m?Number(m[1]):null;
   invariant(caseId!==null&&inv.cases.includes(caseId)&&PROJECTS.includes(entry.projectName),'EXACT_NAMED_CASE_PROJECT');
   const key=`${entry.projectName}:${caseId}`;invariant(!seen.has(key),'DUPLICATE_CASE');seen.add(key);
   invariant(spec.ok===true&&entry.status==='expected'&&entry.results.length===1,'SINGLE_REAL_RESULT');const result=entry.results[0];
   invariant(result.status==='passed'&&result.retry===0&&!result.error&&!(result.errors?.length),'NO_RETRY_FAILURE');
   invariant(!hasUnsafeCleanupAttachment(result.attachments),'NO_DEFERRED_COMPLETION');
   const cs=result.attachments.filter(a=>a.name==='cleanup.json');invariant(cs.length===1,'ONE_OWNED_CLEANUP');const cleaned=attachment(cs[0]);cleanup(cleaned,name);cleanupBaselines.push(cleaned.originalBusiness);if(name==='FinalC')finalContextAnchors.push({audit:cleaned.afterRetainedAudit,identities:cleaned.afterRetainedAnchors});
   const ss=result.attachments.filter(a=>a.name==='source-build.json'||a.name==='source-build-dependencies.json');
   for(const a of ss){
    invariant(a.name===inv.attachment&&!proofs.has(entry.projectName),'ONE_SOURCE_BUILD_PER_PROJECT');const evidence=attachment(a),proof=evidence.proof??evidence;
    invariant(proof.sourceRevision===approved&&/^[a-f0-9]{40}$/u.test(proof.buildRevision??''),'OPERATOR_SOURCE_BUILD');
    const files=[...inv.runtime,...inv.tools];invariant(exact(Object.keys(evidence.sourceHashes??{}),files),'CLOSED_ATTACHMENT_HASH_KEYS');
    for(const file of files)invariant(evidence.sourceHashes[file]===sha(gitRead(approved,file)),'HISTORICAL_ATTACHMENT_BYTES');
    invariant(evidence.sourceHashes[inv.spec]===inv.specSha,'REVIEWED_COMPLETION_SPEC_PIN');
    const closure=[...new Set([...COMMON_TOOL_CLOSURE,...inv.tools,...(['C','C04','FinalC'].includes(name)?[]:['work/pilot/phase5-planning-year-search-fixtures.mjs','work/pilot/phase5-planning-year-list-fixtures.mjs',...search.SEARCH_SOURCE_PATHS]),...(name==='G'||name==='O'?['work/pilot/phase5-planning-year-gym-fixtures.mjs',INVENTORIES.C.spec,INVENTORIES.L.spec]:[])])].sort();
    invariant(same(tree(approved,closure),closure),'COMPLETE_HISTORICAL_HELPER_CHAIN');
    if(name==='L'||name==='G')invariant(same(evidence.dependencyReports,{performance:sha(repoRead('work/pilot/results/phase5-38-read-performance-final.json')),search:sha(sf.bytes)}),'EXACT_BACKEND_DEPENDENCY_REPORTS');
    if(name==='O')invariant(same(evidence.actualPrerequisites,{context:prior.C,contextWrite:prior.C04,lists:prior.L,gym:prior.G}),'O_BOUND_EXACT_PREDECESSOR_REPORTS');
    proofs.set(entry.projectName,{sourceRevision:approved,buildRevision:proof.buildRevision,sourceHashes:evidence.sourceHashes,runtimeClosureSha256:buildClosure(approved,proof.buildRevision),toolClosureSha256:sha(Buffer.from(JSON.stringify(closure.map(file=>[file,sha(gitRead(approved,file))]))))});
   }
  }
  for(const project of PROJECTS)for(const n of inv.cases)invariant(seen.has(`${project}:${n}`),'MISSING_NAMED_CASE');
  invariant(exact([...proofs.keys()],PROJECTS)&&same(proofs.get(PROJECTS[0]),proofs.get(PROJECTS[1])),'SAME_OWN_SOURCE_BUILD_TWO_DEVICES');
  const own=proofs.get(PROJECTS[0]);return {reportSha256:sha(r.bytes),cases:inv.total,approvedSourceRevision:approved,workerBuildRevision:own.buildRevision,runtimeClosureSha256:own.runtimeClosureSha256,toolClosureSha256:own.toolClosureSha256};
 }
 // Sequential predecessor validation. Different approved phase trees are legitimate.
 for(const [name,reportEnv,sourceEnv]of [['C',OPERATOR_PINS[0],OPERATOR_PINS[1]],['L',OPERATOR_PINS[4],OPERATOR_PINS[5]],['G',OPERATOR_PINS[6],OPERATOR_PINS[7]],['C04',OPERATOR_PINS[2],OPERATOR_PINS[3]]])prior[name]=validateBrowser(name,process.env[reportEnv],process.env[sourceEnv]);
 prior.O=validateBrowser('O',o.otherReport,o.otherSource);
 prior.FinalC=validateBrowser('FinalC',o.finalContextReport,o.finalContextSource);
 invariant(finalContextAnchors.length===16,'FINAL_C16_ALL_ANCHOR_ATTACHMENTS');
 finalContextAnchors.sort((a,b)=>b.audit.count-a.audit.count);const terminalAnchors=finalContextAnchors[0];
 for(const a of finalContextAnchors.filter(a=>a.audit.count===terminalAnchors.audit.count))invariant(same(a,terminalAnchors),'AMBIGUOUS_TERMINAL_C16_ANCHORS');
 invariant(prior.FinalC.workerBuildRevision===o.finalBuild&&prior.O.workerBuildRevision===o.finalBuild,'SAME_FINAL_TESTED_BUILD');
 for(const baseline of cleanupBaselines)invariant(same(baseline,sf.value.finalHashes),'ALL_BROWSER_WHOLE15_APPROVED_BASELINE');
 // Require independent final-artifact source/build closure; no build is run here.
 const current=git('rev-parse','HEAD').toString().trim();invariant(current===o.finalSource,'EXPLICIT_FINAL_HEAD');
 const runtimeClosureSha256=buildClosure(prior.O.approvedSourceRevision,current);
 invariant(buildClosure(o.finalSource,o.finalBuild)===runtimeClosureSha256&&buildClosure(prior.FinalC.approvedSourceRevision,current)===runtimeClosureSha256,'FINAL_C_FULL_RUNTIME_CLOSURE');
 const fullSources=[...new Set([...tree(current,BUILD_ROOTS),...bootstrapFiles,...COMMON_TOOL_CLOSURE,...search.SEARCH_SOURCE_PATHS,...Object.values(inventories).flatMap(i=>i.tools),'work/pilot/verify-planning-year-release.mjs'])].sort();
 invariant(exact(Object.keys(review.sourceHashes),fullSources),'ROOT_REVIEWED_FULL_SOURCE_INVENTORY');
 for(const f of fullSources)invariant(review.sourceHashes[f]===sha(gitRead(current,f))&&sha(repoRead(f))===review.sourceHashes[f],'FINAL_SOURCE_GIT_AND_WORKING_BYTES');
 invariant(git('status','--porcelain','--',...fullSources).toString()==='','FINAL_SOURCE_CLEAN');
 const artifactDir=fs.realpathSync(path.resolve(root,o.artifactDir));invariant(artifactDir===path.join(root,'web/dist-protected'),'EXACT_ISOLATED_ARTIFACT_PATH');
 const mark=JSON.parse(fs.readFileSync(path.join(artifactDir,'build-mode.json'),'utf8'));invariant(mark.mode==='protected'&&mark.revision===prior.O.workerBuildRevision,'LAST_ACTUAL_O36_ARTIFACT_REVISION');
 const artifactFiles=[];const privateFile=p=>/(^|\/)(?:\.dev\.vars(?:\..*)?|\.env(?:\..*)?)$/u.test(p);
 function artifactWalk(dir,relative='',collector=artifactFiles){
  for(const name of fs.readdirSync(dir).sort()){const p=relative?relative+'/'+name:name;if(privateFile(p))continue;
   const full=path.join(dir,name),s=fs.lstatSync(full);invariant(!s.isSymbolicLink()&&(!s.isFile()||s.nlink===1),'ARTIFACT_SYMLINK_OR_HARDLINK');
   if(s.isDirectory())artifactWalk(full,p,collector);else{invariant(s.isFile(),'ARTIFACT_NONREGULAR');collector.push([p,sha(fs.readFileSync(full))]);}}
 }
 artifactWalk(artifactDir);invariant(artifactFiles.length>0,'EMPTY_ARTIFACT');
 // The following seals are ROOT-owned actual evidence, not generated here.
 const sealed=report(review.artifactSeal.report);invariant(sha(sealed.bytes)===review.artifactSeal.sha256,'REVIEWED_ARTIFACT_SEAL_RAW_SHA');
 const launch=report(sealed.value.launchProof.report);invariant(sha(launch.bytes)===sealed.value.launchProof.sha256,'REVIEWED_LAUNCH_RAW_SHA');
 validateFinalArtifactSeal(sealed.value,launch.value,{review,prior,runtimeClosureSha256,artifactFiles,sha});
 const artifactInventorySha256=sha(Buffer.from(JSON.stringify(artifactFiles)));
 const revalidateInputs=()=>{for(const [file,digest]of inputSeals)invariant(sealedRead(file).digest===digest,'INPUT_EVIDENCE_CHANGED');};
 const revalidateArtifact=()=>{const fresh=[];artifactWalk(artifactDir,'',fresh);invariant(same(fresh,artifactFiles),'TESTED_ARTIFACT_CHANGED');};
 revalidateInputs();revalidateArtifact();
 // Exclusive owner lock and exclusive0600 result are acquired BEFORE target
 // validation/import or the first DB read. No overwrite, backup fallback or retry.
 const out=path.resolve(root,o.out),outParent=path.dirname(out),resultsDir=fs.realpathSync(path.join(root,'work/pilot/results'));
 invariant(outParent===resultsDir&&/^phase5-planning-year-release-[a-z0-9-]+\.json$/u.test(path.basename(out))&&!inputSeals.has(out),'NEW_CANONICAL_RELEASE_OUTPUT');
 invariant(fs.realpathSync(outParent)===outParent,'OUTPUT_PARENT_SYMLINK');
 let parentCursor=path.parse(outParent).root;for(const part of outParent.slice(parentCursor.length).split(path.sep)){parentCursor=path.join(parentCursor,part);invariant(!fs.lstatSync(parentCursor).isSymbolicLink(),'OUTPUT_ANCESTOR_SYMLINK');}
 const completionOut=path.resolve(root,o.completionOut);
 invariant(path.dirname(completionOut)===resultsDir&&/^phase5-planning-year-release-[a-z0-9-]+-completion\.json$/u.test(path.basename(completionOut))&&completionOut!==out&&!inputSeals.has(completionOut),'NEW_UNIQUE_COMPLETION_OUTPUT');
 const lock=path.join(resultsDir,'.phase5-planning-year-release.lock');let lockFd,outFd,db,before,after,failure=null,readCompletionKnown=false,targetReadStarted=false,transactionCompleted=false,verificationComplete=false,dbClosed=false,lockClosed=false,reservedClosed=false,lockReleased=false,ownedLockStat=null,reservedSha256=null,reservedStat=null,stage='OFFLINE_VALIDATED';
 const writeResult=(fd,value)=>{const bytes=writeJsonFd(fs,fd,value);return sha(bytes);};
 const result={kind:'phase5-planning-year-release-read-only',status:'FAIL',complete:false,target:'protected',baseURL:BASE_URL,scope:'local-synthetic-only',reset:false,mutations:false,notFullPhaseProof:true,userTrial:'awaiting_user',reviewManifestSha256:o.reviewManifestSha256,sourceRevision:o.finalSource,workerBuildRevision:o.finalBuild,sourceHashes:review.sourceHashes,artifactInventorySha256,artifactSealSha256:review.artifactSeal.sha256,approvedTerminalFinalContextAnchors:terminalAnchors,actualEvidence:prior};
 try{
  lockFd=fs.openSync(lock,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
  ownedLockStat=fs.fstatSync(lockFd);
  outFd=fs.openSync(out,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
  invariant(fs.fstatSync(outFd).nlink===1&&(fs.fstatSync(outFd).mode&0o777)===0o600,'EXCLUSIVE0600_RESULT');
  reservedStat=fs.fstatSync(outFd);
  reservedSha256=writeResult(outFd,{...result,stage:'RESERVED_BEFORE_TARGET_READ',reserved:true,completionPath:path.relative(root,completionOut)});
  stage='OUTPUT_RESERVED';
  const targetTool=await tool('work/pilot/verify-target.mjs'),module=await import('node:module');
  // requireRunning:false avoids spawning supabase/status; no3012/process checks.
  const target=await targetTool.assertTarget('protected',{requireRunning:false,requireIdp:false});
  stage='TARGET_MANIFEST_VALIDATED';
  const postgres=module.createRequire(path.join(root,'web/package.json'))('postgres');
  db=postgres(target.dbUrl,{max:1,prepare:false,connect_timeout:10,idle_timeout:5,onnotice:()=>{},connection:{application_name:'phase5_release_read_only'}});
  targetReadStarted=true;stage='CONNECTING_READ_ONLY';
  await db.begin('isolation level read committed read only',async tx=>{
   stage='READ_ONLY_TRANSACTION';
   const [settings]=await tx`select current_setting('transaction_read_only') readonly, current_setting('transaction_isolation') isolation`;
   invariant(settings.readonly==='on'&&settings.isolation==='read committed','READ_ONLY_FRESH_SNAPSHOT_ISOLATION');
   await tx`set local statement_timeout='30s'`;
   const [owned]=await tx`select pg_try_advisory_xact_lock(5520) locked`;invariant(owned.locked===true,'SERIAL_TARGET_OWNER_LOCK');
   const snapshot=async prefix=>{stage=prefix+'_CATALOG';const catalog=await search.readSearchCatalog(tx);stage=prefix+'_RAW_ACL';const acl=await (await tool('work/pilot/apply-gym-timplan-migration.mjs')).gymAcl(tx);stage=prefix+'_WHOLE15';const business=await foundation.planningBusinessHashes(tx);stage=prefix+'_ALL_ANCHORS';const anchors=await search.searchAuditAnchors(tx);stage=prefix+'_AUDITED_IDENTITY_ANCHORS';const identityRows=await tx`select to_jsonb(i) row from public.identities i where exists(select 1 from public.security_events e where e.actor_identity_id=i.id) order by i.id`;const auditedIdentityAnchors={count:identityRows.length,sha256:sha(Buffer.from(JSON.stringify(identityRows.map(r=>r.row))))};return {catalog,acl,business,anchors,auditedIdentityAnchors};};
   before=await snapshot('BEFORE');
   invariant(same(before.catalog,sf.value.afterCatalog)&&search.searchCatalogFingerprint(before.catalog)===sf.value.finalFingerprint&&same(before.acl,sf.value.afterAcl)&&same(before.business,sf.value.finalHashes),'FRESH_APPROVED_CATALOG_RAW_ACL_WHOLE15');
   invariant(before.acl.filter(a=>a.granted).length===28&&exact(before.acl.filter(a=>a.granted).map(a=>a.f),search.SEARCH_WORKER_ENTRIES),'EXACT28_PRIVATE_HELPERS_CLOSED');
   invariant(search.searchAnchorsValid(before.anchors,before.anchors),'ALL_CURRENT_AUDIT_IDENTITIES_HASHES');
   // ALL SQL audit and audited identity JS hashes match the strongest final-C
   // cleanup before a new current snapshot is accepted. Formats stay separate.
   invariant(same(before.anchors.audit,terminalAnchors.audit)&&same(before.auditedIdentityAnchors,terminalAnchors.identities),'FRESH_LAST_FINAL_C_AUDIT_IDENTITY_ANCHORS');
   after=await snapshot('AFTER');invariant(same(before,after),'READ_ONLY_FULL_PRESERVATION');
  });
  transactionCompleted=true;readCompletionKnown=true;revalidateInputs();revalidateArtifact();
  invariant(git('rev-parse','HEAD').toString().trim()===o.finalSource,'FINAL_HEAD_CHANGED');
  verificationComplete=true;
 }catch(error){failure={stage,sqlState:/^[A-Z0-9]{5}$/u.test(error?.code??'')?error.code:null,code:typeof error?.message==='string'&&/^[A-Z][A-Z0-9_]{0,100}$/u.test(error.message)?error.message:'RELEASE_READ_ONLY_REFUSED'};}
 finally{
  // The reserved evidence is immutable FAIL. Completion publication occurs only
  // after target work and every owned DB/file/lock closure has settled.
  try{if(db)await db.end({timeout:5});dbClosed=true;}catch{failure??={code:'RELEASE_CONNECTION_CLOSE_UNKNOWN'};readCompletionKnown=false;}
  const fileClosure=closeOwnedReleaseFiles(fs,{lock,out,lockFd,outFd,ownedLockStat,reservedStat,dbClosed});
  ({lockClosed,reservedClosed,lockReleased}=fileClosure);failure??=fileClosure.failure;lockFd=undefined;outFd=undefined;
  const safeSnapshot=s=>s?{catalogFingerprint:search.searchCatalogFingerprint(s.catalog),rawAclSha256:sha(Buffer.from(JSON.stringify(s.acl))),business:s.business,allAnchors:s.anchors,auditedIdentityAnchors:s.auditedIdentityAnchors}:null;
  const completionStatus=completedReleaseStatus({verificationComplete,readCompletionKnown,dbClosed,lockClosed,reservedClosed,lockReleased,failure});
  Object.assign(result,{...completionStatus,before:safeSnapshot(before),after:safeSnapshot(after),targetReadStarted,transactionCompleted,readCompletionKnown,stage,failure,mutationAttempted:false,reruns:[],transfer3012:'NOT_RUN',closure:{dbClosed,lockClosed,reservedClosed,lockReleased},reservedEvidence:reservedSha256?{path:path.relative(root,out),sha256:reservedSha256}:null,requiresSuccessfulCommandExit:true});
  // No target/source/artifact access follows lock release; publication only.
  if(reservedSha256!==null){
   try{publishCompletion(fs,completionOut,result);}catch{result.status='FAIL';result.complete=false;failure??={code:'COMPLETION_PUBLICATION_REFUSED'};result.failure=failure;}
  }
 }
 invariant(result.status==='PASS'&&result.complete&&readCompletionKnown,'RELEASE_READ_ONLY_FAILED');
 return result;
}
export async function main(argv=process.argv.slice(2)){
 const o=parseReleaseArgs(argv);
 if(o.help){process.stdout.write(HELP);return;}
 if(o.dryRun){process.stdout.write(JSON.stringify({kind:'phase5-planning-year-release-proposal',status:'SOURCE_ONLY',target:'protected',baseURL:BASE_URL,notFullPlanProof:true,operatorPins:OPERATOR_PINS,serial:true,failFast:true,steps:PLAN},null,2)+'\n');return;}
 if(SOURCE_ONLY)throw Error('SOURCE_ONLY_PROPOSAL_NOT_ACTIVATED');
 await verifyActivatedEvidence(o);
}
// Direct-entry detection uses no filesystem, subprocess or target initialization.
if(process.argv[1]?.replaceAll('\\','/').endsWith('/verify-planning-year-release.mjs'))await main().catch(()=>{
 process.stderr.write('REFUSED: release evidence or read-only preservation incomplete; existing reports are untouched.\n');process.exitCode=1;
});
