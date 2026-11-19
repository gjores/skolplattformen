// Ett huvudfönster äger utkastet. Bara kontrollmetadata och skolans opersonliga schemaunderlag skickas;
// elevlistor hämtas av varje vy med dess egen behörighet och ingår aldrig i synktillståndet.
export const SCHEMA_FONSTER_VYER = ['vecka', 'larare', 'sal', 'elev', 'folj', 'samling', 'viloyta', 'avvikelser', 'tid', 'veckor', 'pass', 'villkor'] as const;
export type SchemaFonsterVy = typeof SCHEMA_FONSTER_VYER[number];
export type SchemaFonsterVal = { view: SchemaFonsterVy; resource?: string };
export type SchemaFonsterTarget = SchemaFonsterVal & { draftId: string };
export type SchemaSynkStatus = { live: boolean; version: number; lastUpdated: number | null; windows: number };
export type SchemaSynkPort = { postMessage: (message: unknown) => void; addEventListener: (type: 'message', listener: (event: { data: unknown }) => void) => void; removeEventListener: (type: 'message', listener: (event: { data: unknown }) => void) => void; close: () => void };
type Message<T, A> = { protocol: 1; from: string; to?: string; type: 'hello' | 'state' | 'action' | 'beat' | 'bye'; owner?: string; version?: number; state?: T; action?: A; actions?: A[]; command?: string; windows?: number; view?: SchemaFonsterVal };
const validResource = (s: unknown): s is string => typeof s === 'string' && (/^(?:klass|grupp|larare):[a-zA-Z0-9-]{1,120}$/u.test(s) || s.startsWith('sal:') && s.length > 4 && s.length <= 204 && s.split('').every(c => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127));
const validId = (s: unknown): s is string => typeof s === 'string' && /^[a-zA-Z0-9-]{8,80}$/u.test(s);
export const fonsterVyNamn: Record<SchemaFonsterVy, string> = { vecka: 'Klassens schema', larare: 'Lärarens schema', sal: 'Salens schema', elev: 'Elevens schema', folj: 'Följ passet', samling: 'Samlingsvy', viloyta: 'Pass utan tid', avvikelser: 'Regelavvikelser', tid: 'Tid över läsåret', veckor: 'Vecka för vecka', pass: 'Pass i tabell', villkor: 'Villkor i tabell' };
export function parseFonsterTarget(value: URLSearchParams): { unitId: string; schoolYear: number; fonster: SchemaFonsterTarget } | null {
  const unitId = value.get('skola'), schoolYear = Number(value.get('lasar')), draftId = value.get('utkast'), view = value.get('vy');
  if (!unitId || !/^[a-f0-9-]{36}$/iu.test(unitId) || !Number.isInteger(schoolYear) || schoolYear < 2000 || schoolYear > 2200 || !validId(draftId) || !SCHEMA_FONSTER_VYER.includes(view as SchemaFonsterVy)) return null;
  // Stabil källreferens eller salnamn följer vyn. Körningens löpnummer och elevval följer aldrig med.
  const resource = value.get('resurs');
  return { unitId, schoolYear, fonster: { draftId, view: view as SchemaFonsterVy, ...(resource && view !== 'elev' && validResource(resource) ? { resource } : {}) } };
}
export function fonsterUrl(unitId: string, schoolYear: number, draftId: string, value: SchemaFonsterVal, path = '/schema/fonster'): string {
  const params = new URLSearchParams({ skola: unitId, lasar: String(schoolYear), utkast: draftId, vy: value.view });
  if (value.resource && value.view !== 'elev' && validResource(value.resource)) params.set('resurs', value.resource);
  return `${path}?${params}`;
}
export function sakerFonsteruppsattning(values: unknown): SchemaFonsterVal[] {
  if (!Array.isArray(values)) return [];
  return values.slice(0, 12).flatMap((v: unknown) => {
    if (!v || typeof v !== 'object' || !('view' in v) || !SCHEMA_FONSTER_VYER.includes(v.view as SchemaFonsterVy)) return [];
    if (v.view === 'elev') return [{ view: 'elev' as const }];
    const resource = 'resource' in v ? v.resource : undefined;
    return [{ view: v.view as SchemaFonsterVy, ...(typeof resource === 'string' && validResource(resource) ? { resource } : {}) }];
  });
}
export function schemaDraftId(storage: Pick<Storage, 'getItem' | 'setItem'> | null, scope: string, unitId: string, year: number, create: () => string): string {
  const key = `schema-utkast-fonster:${scope}:${unitId}:${year}`;
  try { const saved = storage?.getItem(key); if (validId(saved)) return saved; } catch { /* minnet räcker när sessionStorage nekas */ }
  const id = create();
  try { storage?.setItem(key, id); } catch { /* själva utkastet lagras aldrig */ }
  return id;
}

/** Ren, testbar transport. Alla kommandon bär läst version; inget barn gör optimistiska ändringar. */
export function skapaSchemaSynk<T, A>(o: {
  role: 'host' | 'child'; id: string; port: SchemaSynkPort; now?: () => number;
  getState: () => T; applyState: (state: T) => void; onAction: (action: A) => void;
  onStatus: (status: SchemaSynkStatus) => void; blocked?: () => boolean;
  view?: SchemaFonsterVal; onWindows?: (views: SchemaFonsterVal[]) => void;
}) {
  const now = o.now ?? Date.now, peers = new Map<string, number>(), commands = new Set<string>(), retiredOwners = new Set<string>(), views = new Map<string, SchemaFonsterVal>();
  let version = 0, owner: string | null = o.role === 'host' ? o.id : null, live = o.role === 'host', lastUpdated: number | null = null, closed = false, commandNr = 0, windowCount = 1;
  const status = () => { o.onStatus({ live, version, lastUpdated, windows: o.role === 'host' ? peers.size + 1 : windowCount }); if (o.role === 'host') o.onWindows?.([...views.values()]); };
  const post = (m: Omit<Message<T, A>, 'protocol' | 'from'>) => { if (!closed) o.port.postMessage({ protocol: 1, from: o.id, ...m }); };
  const sendState = (to?: string) => post({ type: 'state', ...(to ? { to } : {}), owner: o.id, version, windows: peers.size + 1, state: o.getState() });
  const refresh = () => { if (o.role === 'child') post({ type: 'hello', ...(o.view ? { view: o.view.view === 'elev' ? { view: 'elev' } : o.view } : {}) }); };
  const receive = (event: { data: unknown }) => {
    if (closed || !event.data || typeof event.data !== 'object') return;
    const m = event.data as Message<T, A>;
    if (m.protocol !== 1 || !validId(m.from) || m.from === o.id || m.to && m.to !== o.id) return;
    if (o.role === 'host') {
      if (m.type === 'hello' || m.type === 'action' || m.type === 'beat') { peers.set(m.from, now()); if (m.view && SCHEMA_FONSTER_VYER.includes(m.view.view)) { const safe = m.view.view === 'elev' ? { view: 'elev' as const } : sakerFonsteruppsattning([m.view])[0]; if (safe) views.set(m.from, safe); } status(); }
      if (m.type === 'hello') sendState(m.from);
      if (m.type === 'bye') { peers.delete(m.from); views.delete(m.from); status(); }
      if (m.type === 'action') {
        if (m.owner !== o.id || m.version !== version || o.blocked?.() || typeof m.command !== 'string' || m.command.length > 120 || commands.has(m.command)) { sendState(m.from); return; }
        commands.add(m.command); if (commands.size > 1000) commands.delete(commands.values().next().value!);
        const actions = Array.isArray(m.actions) ? m.actions.slice(0, 50) : m.action === undefined ? [] : [m.action];
        for (const action of actions) o.onAction(action);
      }
      return;
    }
    if ((m.type === 'state' || m.type === 'beat') && !retiredOwners.has(m.from) && validId(m.owner) && m.owner === m.from && Number.isSafeInteger(m.version) && m.version! >= 0) {
      if (m.type === 'beat') {
        if (owner !== m.owner || m.version !== version) { refresh(); return; }
        live = true; lastUpdated = now(); if (Number.isSafeInteger(m.windows) && m.windows! > 0) windowCount = m.windows!; status(); return;
      }
      if (m.state === undefined || owner === m.owner && m.version! < version) return;
      // Ett fullständigt svar är också återanslutningen efter att huvudfönstret lästs om.
      if (owner && owner !== m.owner) retiredOwners.add(owner);
      owner = m.owner; version = m.version!; if (Number.isSafeInteger(m.windows) && m.windows! > 0) windowCount = m.windows!; live = true; lastUpdated = now(); o.applyState(m.state); status();
    }
    if (m.type === 'bye' && m.from === owner) { retiredOwners.add(m.from); live = false; status(); }
  };
  o.port.addEventListener('message', receive); status(); if (o.role === 'child') refresh();
  return {
    publish() { if (!closed && o.role === 'host') { version++; lastUpdated = now(); sendState(); status(); } },
    action(action: A): boolean {
      if (closed || !live || o.blocked?.()) return false;
      if (o.role === 'host') o.onAction(action);
      else post({ type: 'action', owner: owner!, version, action, command: `${o.id}:${++commandNr}` });
      return true;
    },
    actions(actions: A[]): boolean {
      if (closed || !live || o.blocked?.() || actions.length === 0 || actions.length > 50) return false;
      if (o.role === 'host') { for (const action of actions) o.onAction(action); }
      else post({ type: 'action', owner: owner!, version, actions, command: `${o.id}:${++commandNr}` });
      return true;
    },
    refresh,
    tick() {
      if (closed) return;
      if (o.role === 'host') { for (const [id, at] of peers) if (now() - at > 4000) { peers.delete(id); views.delete(id); } status(); post({ type: 'beat', owner: o.id, version, windows: peers.size + 1 }); }
      else { if (lastUpdated !== null && now() - lastUpdated > 1800) { live = false; status(); } if (!owner || !live) refresh(); else post({ type: 'beat', owner, version, ...(o.view ? { view: o.view.view === 'elev' ? { view: 'elev' } : o.view } : {}) }); }
    },
    disconnect() { if (closed) return; post({ type: 'bye', owner: owner ?? undefined }); closed = true; live = false; status(); o.port.removeEventListener('message', receive); o.port.close(); },
  };
}
