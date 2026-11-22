/** En skrivkö per skola/läsår/period. Ett osäkert svar följs upp med samma kommando, aldrig en blind ny skrivning. */
import { parseSchemaDraftSave, parseSchemaDraftStatusReply, schemaDraftHash, verifySchemaDraftReadReply, verifySchemaDraftSaveReply,
  type SchemaDraft, type SchemaDraftSave, type SchemaDraftScope, type SchemaDraftStatusRequest } from './schema-draft-contract.ts';
import { tjanstCanonicalSerialize } from './tjanst-contract.ts';

export type SchemaSparinnehall = Pick<SchemaDraftSave, 'name' | 'basisVillkor' | 'workingVillkor' | 'grundFingerprint' | 'placements' | 'locks' | 'intentional' | 'datedOverrides' | 'activityTypes'>;
export type SchemaSparstatus = { phase: 'loading' | 'idle' | 'saving' | 'saved' | 'error' | 'unknown' | 'conflict' | 'stale';
  dirty: boolean; revision: number; savedAt: string | null; message: string | null };
export type SchemaSpartransport = { read: (scope: SchemaDraftScope) => Promise<unknown>; save: (input: SchemaDraftSave) => Promise<unknown>;
  status: (input: SchemaDraftStatusRequest) => Promise<unknown> };

export function schemaSparinnehall(draft: SchemaDraft): SchemaSparinnehall {
  return { name: draft.name, basisVillkor: draft.basisVillkor, workingVillkor: draft.workingVillkor, grundFingerprint: draft.base?.grundFingerprint ?? null,
    placements: draft.placements, locks: draft.locks, intentional: draft.intentional, datedOverrides: draft.datedOverrides, activityTypes: draft.activityTypes };
}
function normalisera(value: SchemaSparinnehall): SchemaSparinnehall {
  try {
    const input = parseSchemaDraftSave({ contractVersion: 1, unitId: '53111600-0000-4000-8000-000000000001', schoolYear: 2027, period: 'lasar',
      commandId: '53111600-0000-4000-8000-000000000002', draftId: null, expectedRevision: 0, ...value });
    const { name, basisVillkor, workingVillkor, grundFingerprint, placements, locks, intentional, datedOverrides, activityTypes } = input;
    return { name, basisVillkor, workingVillkor, grundFingerprint, placements, locks, intentional, datedOverrides, activityTypes };
  } catch { return value; } // Ett tillfälligt fältfel får visas och rättas i formuläret; det får aldrig skrivas.
}
export const schemaSparnyckel = (value: SchemaSparinnehall): string => {
  const clean = normalisera(value);
  try { return tjanstCanonicalSerialize(clean); } catch { return `invalid:${JSON.stringify(clean)}`; }
};
const reason = (error: unknown): string | null => error && typeof error === 'object' && 'reason' in error && typeof error.reason === 'string' ? error.reason : null;
const status = (error: unknown): number | null => error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : null;

export class SchemaSparko {
  private scope: SchemaDraftScope;
  private transport: SchemaSpartransport;
  private notify: (state: SchemaSparstatus, acknowledgedKey: string | null, draftId: string | null, contentHash: string | null) => void;
  private id: () => string;
  private active = true;
  private draftId: string | null = null;
  private contentHash: string | null = null;
  private revision = 0;
  private savedAt: string | null = null;
  private acknowledged: string | null = null;
  private target: SchemaSparinnehall | null = null;
  private command: SchemaDraftSave | null = null;
  private task: Promise<boolean> | null = null;
  private loaded = false;
  private invalidTarget = false;
  state: SchemaSparstatus = { phase: 'loading', dirty: false, revision: 0, savedAt: null, message: null };
  constructor(scope: SchemaDraftScope, transport: SchemaSpartransport, notify: SchemaSparko['notify'], id: () => string = () => crypto.randomUUID()) {
    this.scope = scope; this.transport = transport; this.notify = notify; this.id = id;
  }
  private publish(phase: SchemaSparstatus['phase'], message: string | null = null): void {
    if (!this.active) return;
    this.state = { phase, dirty: this.command !== null || !!this.target && schemaSparnyckel(this.target) !== this.acknowledged,
      revision: this.revision, savedAt: this.savedAt, message };
    this.notify(this.state, this.acknowledged, this.draftId, this.contentHash);
  }
  async load(): Promise<SchemaDraft | null> {
    this.publish('loading');
    try {
      const reply = await verifySchemaDraftReadReply(await this.transport.read(this.scope), this.scope);
      if (!this.active) return null;
      const draft = reply.draft;
      this.draftId = draft?.id ?? null; this.revision = draft?.revision ?? 0; this.savedAt = draft?.savedAt ?? null;
      this.contentHash = draft?.contentHash ?? null;
      this.target = draft ? schemaSparinnehall(draft) : null; this.acknowledged = this.target ? schemaSparnyckel(this.target) : null;
      this.command = null; this.loaded = true;
      this.publish(draft?.stale ? 'stale' : draft ? 'saved' : 'idle', draft?.stale ? 'Underlaget har ändrats sedan utkastet sparades. Det sparade schemat visas. Ta fram ett nytt förslag innan du fortsätter redigera.' : null);
      return draft;
    } catch (error) {
      this.publish('error', 'Det sparade utkastet kunde inte läsas. Försök igen innan du börjar redigera.'); throw error;
    }
  }
  update(value: SchemaSparinnehall): void {
    if (!this.active || !this.loaded) return;
    this.target = structuredClone(normalisera(value));
    if (this.invalidTarget) { this.invalidTarget = false; this.publish('idle'); return; }
    if (['conflict', 'stale', 'unknown', 'saving', 'error'].includes(this.state.phase)) { this.publish(this.state.phase, this.state.message); return; }
    this.publish(schemaSparnyckel(value) === this.acknowledged ? 'saved' : 'idle');
  }
  /** Anropas först när servern har räknat fram en ny grund från aktuella källor. */
  acceptNewBasis(): void { if (this.state.phase === 'stale') this.publish('idle'); }
  async flush(): Promise<boolean> {
    if (!this.active || !this.loaded || this.state.phase === 'conflict' || this.state.phase === 'stale') return false;
    if (this.task) return this.task;
    this.task = this.drain();
    try { return await this.task; } finally { this.task = null; }
  }
  private async drain(): Promise<boolean> {
    while (this.active && this.target && (this.command || schemaSparnyckel(this.target) !== this.acknowledged)) {
      if (this.command) {
        const checked = await this.reconcile(this.command);
        if (checked === 'stop') return false;
        if (checked === 'done') continue;
      } else {
        try { this.command = parseSchemaDraftSave({ ...this.scope, ...this.target, commandId: this.id(), draftId: this.draftId, expectedRevision: this.revision }); }
        catch {
          this.invalidTarget = true;
          this.publish('error', !this.target.name.trim() ? 'Ge utkastet ett namn för att spara.' : 'Utkastets inställningar behöver rättas innan det kan sparas. Dina ändringar finns kvar.'); return false;
        }
      }
      const input = this.command!;
      this.publish('saving');
      try {
        const reply = await verifySchemaDraftSaveReply(await this.transport.save(input), input);
        if (!this.active) return false;
        this.accept(input, reply.draft);
      } catch (error) {
        if (!this.active) return false;
        const why = reason(error), http = status(error);
        if (why === 'schema_draft_conflict' || why === 'schema_draft_command_conflict') {
          this.publish('conflict', 'En annan användare har sparat en nyare version. Dina ändringar finns kvar här. Läs serverns version för att fortsätta från den.'); return false;
        }
        if (why === 'schema_draft_source_changed') {
          this.command = null; this.publish('stale', 'Underlaget har ändrats. Dina ändringar finns kvar här. Ta fram ett nytt schemaförslag från det aktuella underlaget.'); return false;
        }
        if (http !== null && http >= 400 && http < 500) {
          this.command = null; this.publish('error', http === 401 || http === 403 ? 'Utkastet kunde inte sparas med ditt aktuella uppdrag. Dina ändringar finns kvar här.' : 'Utkastet kunde inte sparas. Dina ändringar finns kvar här. Kontrollera villkoren och försök igen.'); return false;
        }
        // Även en ogiltig kvittens kan följa på en genomförd skrivning.
        this.publish('unknown', 'Svaret från sparandet saknas eller kunde inte kontrolleras. Dina ändringar finns kvar. Kontrollera sparandet innan du lämnar sidan.');
        const checked = await this.reconcile(input);
        if (checked !== 'done') return false;
      }
    }
    if (this.active) this.publish('saved');
    return this.active;
  }
  private accept(input: SchemaDraftSave, draft: SchemaDraft): void {
    this.draftId = draft.id; this.revision = draft.revision; this.savedAt = draft.savedAt;
    this.contentHash = draft.contentHash;
    const { name, basisVillkor, workingVillkor, grundFingerprint, placements, locks, intentional, datedOverrides, activityTypes } = input;
    this.acknowledged = schemaSparnyckel({ name, basisVillkor, workingVillkor, grundFingerprint, placements, locks, intentional, datedOverrides, activityTypes });
    this.command = null;
    this.publish(this.target && schemaSparnyckel(this.target) === this.acknowledged ? 'saved' : 'idle');
  }
  private async reconcile(input: SchemaDraftSave): Promise<'done' | 'retry' | 'stop'> {
    try {
      const expected = { ...this.scope, commandId: input.commandId, draftId: input.draftId };
      const reply = parseSchemaDraftStatusReply(await this.transport.status(expected), expected);
      if (!this.active) return 'stop';
      if (!reply.receipt) return 'retry';
      if (reply.receipt.requestHash !== await schemaDraftHash(input)) throw new TypeError('Ogiltig kvittens');
      const current = await verifySchemaDraftReadReply(await this.transport.read(this.scope), this.scope);
      if (!this.active) return 'stop';
      if (!current.draft || current.draft.id !== reply.receipt.draftId || current.draft.revision !== reply.receipt.revision || current.draft.contentHash !== reply.receipt.contentHash) {
        this.publish('conflict', 'En nyare version har sparats medan svaret saknades. Dina ändringar finns kvar här.'); return 'stop';
      }
      this.accept(input, current.draft);
      if (current.draft.stale) { this.publish('stale', 'Utkastet är sparat, men underlaget har ändrats. Ta fram ett nytt förslag innan du fortsätter.'); return 'stop'; }
      return 'done';
    } catch {
      this.publish('unknown', 'Det går ännu inte att avgöra om sparandet blev klart. Dina ändringar finns kvar. Försök kontrollera sparandet igen.'); return 'stop';
    }
  }
  dispose(): void { this.active = false; this.target = null; }
}
