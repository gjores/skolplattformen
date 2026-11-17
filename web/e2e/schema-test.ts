/** Gemensam syntetisk server för gränssnittsprov. Verklig lagring/mandat prövas i den skyddade integrationskedjan. */
import { test as base, expect, type BrowserContext } from '@playwright/test';
import { parseSchemaDraftSave, schemaDraftHash, type SchemaDraft, type SchemaDraftReceipt, type SchemaDraftSave, type SchemaDraftStatusRequest } from '../lib/schema-draft-contract.ts';
import { sammaGrund, type SchemaForslag, type SchemaKontroll } from '../lib/schema-contract.ts';
import proposal from './schema-fixture';
import checked from './fixtures/schema-kontroll.json' with { type: 'json' };
export { expect };
export type { Page, BrowserContext } from '@playwright/test';
export type SchemaDraftTestServer = { saves: SchemaDraftSave[]; reads: number; statusChecks: SchemaDraftStatusRequest[]; drafts: Map<string, SchemaDraft>;
  failSave: boolean; failRead: boolean; loseReply: boolean; delaySave: number; delayRead: number; replyDelay: number; statusUnavailable: boolean; corruptReceipt: boolean; corruptDocument: boolean };
const headers = { 'X-Context-Epoch': '1' };
const scopeKey = (r: {unitId:string;schoolYear:number;period:string}) => `${r.unitId}:${r.schoolYear}:${r.period}`;
/** Samma hashbindning som klienten kräver, med en uttryckligt syntetisk källa. Kan även seedas för återöppningsprov. */
export async function schemaTestDraft(input: SchemaDraftSave, source: SchemaForslag, control: SchemaKontroll | null = null, old?: SchemaDraft) {
  const at = new Map(input.placements.map(p => [p.lesson, p])), base = input.basisVillkor ? structuredClone(source) : null;
  if (base) {
    base.unitId = input.unitId; base.schoolYear = input.schoolYear; base.period = input.period; base.villkor = input.basisVillkor!; base.grundFingerprint = input.grundFingerprint!; base.locks = input.locks;
    base.lessons = base.lessons.map(l => { const p = at.get(l.id); return { ...l, day: p?.day ?? null, startMin: p?.startMin ?? null, roomId: p?.room ?? null, locked: input.locks.some(x => x.lesson === l.id) }; });
    base.metrics = { ...base.metrics, placed: input.placements.length, unplaced: base.lessons.length - input.placements.length };
    base.status = base.metrics.unplaced > 0 ? 'time_limit' : 'complete';
  }
  const sourceHash = `sha256:${'a'.repeat(64)}`;
  const document = { documentVersion: 1 as const, base, basisVillkor: input.basisVillkor, workingVillkor: input.workingVillkor, placements: input.placements, locks: input.locks,
    intentional: input.intentional, datedOverrides: input.datedOverrides, activityTypes: input.activityTypes,
    control: base ? { ...(control ?? checked.clash), ...(control ? {} : { violations: [], total: 0 }), contractVersion: base.contractVersion, grundFingerprint: base.grundFingerprint,
      fingerprint: base.fingerprint, metrics: base.metrics, teachings: base.teachings, trims: base.trims, rooms: Object.fromEntries(input.placements.filter(p => p.room).map(p => [p.lesson, p.room!])) } : null,
    requiresRecalculation: !base || !sammaGrund(input.basisVillkor!, input.workingVillkor), source: { planId: null, planRevision: 0, calendarVersionId: null, calendarVersion: null,
      lessonSources: base?.lessons.map(l => ({ lesson: l.id, ref: `undervisning:synthetic:${l.id}`, term: l.term, ordinal: 1 })) ?? [], digest: sourceHash } };
  const savedAt = new Date().toISOString(), draft: SchemaDraft = { ...document, id: old?.id ?? crypto.randomUUID(), name: input.name,
    revision: input.expectedRevision + 1, savedAt, contentHash: await schemaDraftHash(document), sourceHash, stale: false };
  const receipt: SchemaDraftReceipt = { commandId: input.commandId, draftId: draft.id, revision: draft.revision, requestHash: await schemaDraftHash(input), contentHash: draft.contentHash, savedAt, replayed: false };
  return { draft, receipt };
}
export async function mockSchemaDrafts(context: BrowserContext): Promise<SchemaDraftTestServer> {
  const server: SchemaDraftTestServer = { saves: [], reads: 0, statusChecks: [], drafts: new Map(), failSave: false, failRead: false, loseReply: false,
    delaySave: 0, delayRead: 0, replyDelay: 0, statusUnavailable: false, corruptReceipt: false, corruptDocument: false };
  const receipts = new Map<string, SchemaDraftReceipt>();
  let source = proposal as unknown as SchemaForslag, control: SchemaKontroll | null = null;
  context.on('response', async response => {
    try {
      if (!response.ok()) return;
      const path = new URL(response.url()).pathname;
      if (path === '/api/schema/forslag') source = await response.json() as SchemaForslag;
      if (path === '/api/schema/aktiviteter') { const body = await response.json(); source = body.forslag; control = body.kontroll; }
      if (path === '/api/schema/kontroll') control = await response.json() as SchemaKontroll;
    } catch { /* Ett avbrutet browserprov kan stänga sidan mitt i svarsläsningen. */ }
  });
  const returnedDraft = (draft: SchemaDraft | null) => server.corruptDocument && draft ? { ...draft, workingVillkor: { ...draft.workingVillkor, breakMin: draft.workingVillkor.breakMin === 10 ? 15 : 10 } } : draft;
  const returnedReceipt = (receipt: SchemaDraftReceipt) => server.corruptReceipt ? { ...receipt, requestHash: `sha256:${'b'.repeat(64)}` } : receipt;
  // Underlaget före första förslaget (05.2-SM-UXF-11): otillgängligt som standard, så att äldre prov behåller läget "bara salen går att välja". Prov som behöver det lägger en egen rutt.
  await context.route('**/api/schema/underlag', route => route.fulfill({ headers, status: 503, json: { code: 'unavailable' } }));
  // Skolans salregister (05.2-SM-UXF-23): otillgängligt som standard, så att äldre prov behåller utkastets egna villkor. Prov som behöver det använder mockSkolsalar.
  for (const rutt of ['las', 'spara']) await context.route(`**/api/schema/salregister/${rutt}`, route => route.fulfill({ headers, status: 503, json: { code: 'unavailable' } }));
  await context.route('**/api/schema/utkast/las', async route => {
    const input = route.request().postDataJSON(); server.reads++;
    if (server.delayRead) await new Promise(r => setTimeout(r, server.delayRead));
    if (server.failRead) return route.fulfill({ headers, status: 503, json: { code: 'unavailable' } });
    return route.fulfill({headers,json:{...input,draft:returnedDraft(server.drafts.get(scopeKey(input))??null)}});
  });
  await context.route('**/api/schema/utkast/status', route => {
    const input = route.request().postDataJSON() as SchemaDraftStatusRequest; server.statusChecks.push(input);
    if (server.statusUnavailable) return route.fulfill({ headers, status: 503, json: { code: 'unavailable' } });
    const {commandId,draftId:_,...scope}=input,receipt=receipts.get(commandId)??null;
    return route.fulfill({headers,json:{...scope,state:receipt?'completed':'not_found',found:!!receipt,receipt:receipt?returnedReceipt(receipt):null}});
  });
  await context.route('**/api/schema/utkast/spara', async route => {
    const input = parseSchemaDraftSave(route.request().postDataJSON()); server.saves.push(input);
    if (server.delaySave) await new Promise(r=>setTimeout(r,server.delaySave));
    if (server.failSave) return route.fulfill({headers,status:503,json:{code:'unavailable'}});
    const {contractVersion,unitId,schoolYear,period}=input,scope={contractVersion,unitId,schoolYear,period},old=server.drafts.get(scopeKey(scope));
    const existing=receipts.get(input.commandId);
    if (existing && old) return route.fulfill({headers,json:{...scope,draft:old,receipt:{...existing,replayed:true}}});
    if ((old?.revision??0)!==input.expectedRevision) return route.fulfill({headers,status:409,json:{code:'conflict',details:{reason:'schema_draft_conflict'}}});
    const { draft, receipt } = await schemaTestDraft(input, source, control, old);
    server.drafts.set(scopeKey(scope),draft);receipts.set(input.commandId,receipt);
    if(server.loseReply){server.loseReply=false;return route.abort('failed');}
    if (server.replyDelay) await new Promise(r => setTimeout(r, server.replyDelay));
    return route.fulfill({headers,json:{...scope,draft:returnedDraft(draft),receipt:returnedReceipt(receipt)}}).catch(() => {});
  });
  return server;
}
/** Simulerat salregister för skolan med optimistisk revision, i minnet för sidan. */
export async function mockSkolsalar(page: import('@playwright/test').Page, start: import('../lib/skolsalar.ts').SchemaSkolsalar | null = null) {
  const server = { document: start, revision: start ? 1 : 0, saves: [] as import('../lib/skolsalar.ts').SkolsalarSpara[] };
  const register = () => server.document ? { revision: server.revision, contentHash: `sha256:${'c'.repeat(64)}`, savedAt: new Date().toISOString(), document: server.document } : null;
  await page.route('**/api/schema/salregister/las', route => { const { contractVersion, unitId } = route.request().postDataJSON(); return route.fulfill({ headers, json: { contractVersion, unitId, register: register() } }); });
  await page.route('**/api/schema/salregister/spara', route => {
    const input = route.request().postDataJSON(); server.saves.push(input);
    if (input.expectedRevision !== server.revision) return route.fulfill({ headers, status: 409, json: { code: 'conflict', details: { reason: 'school_rooms_conflict' } } });
    server.document = input.document; server.revision++;
    return route.fulfill({ headers, json: { contractVersion: input.contractVersion, unitId: input.unitId, register: register(), replayed: false } });
  });
  return server;
}
export const test=base.extend<{schemaDraftServer:SchemaDraftTestServer}>({schemaDraftServer:[async({context},use)=>{await use(await mockSchemaDrafts(context));},{auto:true}]});
