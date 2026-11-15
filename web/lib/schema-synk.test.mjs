import test from 'node:test';
import assert from 'node:assert/strict';
import { fonsterUrl, parseFonsterTarget, sakerFonsteruppsattning, schemaDraftId, skapaSchemaSynk } from './schema-synk.ts';
import { sakerArbetsvy, tomtSamlingFilter } from './schema-samling.ts';

function setup() {
  const ports = [], packets = []; let time = 1000;
  const port = () => {
    const listeners = new Set(), current = { on: true,
      postMessage: data => { packets.push(structuredClone(data)); for (const peer of ports) if (peer !== current && peer.on) for (const listener of peer.listeners) listener({ data: structuredClone(data) }); },
      listeners, addEventListener: (_, f) => listeners.add(f), removeEventListener: (_, f) => listeners.delete(f), close: () => { current.on = false; } };
    ports.push(current); return current;
  };
  let state = { value: 0, undo: [] }, childState = null, hostStatus = null, childStatus = null, opened = [], blocked = false;
  const host = skapaSchemaSynk({ role: 'host', id: 'host-00000001', port: port(), now: () => time, getState: () => state, applyState: () => assert.fail(), onStatus: s => { hostStatus = s; }, blocked: () => blocked, onWindows: v => { opened = v; },
    onAction: action => { if (action === 'undo') state = { value: state.undo.at(-1), undo: state.undo.slice(0, -1) }; else state = { value: action, undo: [...state.undo, state.value] }; host.publish(); } });
  const childPort = port();
  const child = skapaSchemaSynk({ role: 'child', id: 'child-0000001', view: { view: 'folj' }, port: childPort, now: () => time, getState: () => assert.fail(), applyState: s => { childState = s; }, onAction: () => assert.fail(), onStatus: s => { childStatus = s; } });
  return { host, child, packets, childPort, state: () => state, childState: () => childState, hostStatus: () => hostStatus, childStatus: () => childStatus,
    opened: () => opened, advance: n => { time += n; }, setBlocked: b => { blocked = b; }, receive: data => { for (const f of childPort.listeners) f({ data }); } };
}

test('åtgärd från B går till A och tillbaka; ångra från B använder huvudfönstrets historik', () => {
  const s = setup(); assert.deepEqual(s.childState(), { value: 0, undo: [] });
  assert.equal(s.child.action(42), true); assert.deepEqual(s.childState(), { value: 42, undo: [0] }); assert.equal(s.state().value, 42);
  s.child.action('undo'); assert.equal(s.state().value, 0); assert.deepEqual(s.childState(), s.state());
  assert.equal(s.hostStatus().windows, 2); assert.equal(s.childStatus().version, 2);
});

test('missad version begär helt tillstånd och gamla kommandon får inte ändra utkastet', () => {
  const s = setup(); s.childPort.on = false; s.host.action(7); s.childPort.on = true;
  assert.equal(s.childState().value, 0); s.host.tick();
  assert.equal(s.childState().value, 7); assert.equal(s.packets.at(-1).type, 'state');
  const old = s.packets.find(p => p.type === 'state');
  const lastVersion = s.childStatus().version;
  s.receive({ ...old, to: undefined }); assert.equal(s.childStatus().version, lastVersion); assert.equal(s.childState().value, 7);
  // Fördröjt kommando läst på version n-1 avvisas och fullständigt tillstånd skickas i retur.
  s.childPort.postMessage({ protocol: 1, from: 'child-0000001', type: 'action', owner: 'host-00000001', version: 0, action: 999, command: 'stale' });
  assert.equal(s.state().value, 7);
});

test('stängt eller onåbart huvudfönster stänger barnets ändringar; ingen optimistisk flytt', () => {
  const s = setup(); s.setBlocked(true); s.child.action(9); assert.equal(s.state().value, 0); assert.equal(s.childState().value, 0);
  s.setBlocked(false); s.host.disconnect(); assert.equal(s.childStatus().live, false); assert.equal(s.child.action(99), false); assert.equal(s.childState().value, 0);
  const stale = setup(); stale.advance(1801); stale.childPort.on = false; stale.child.tick(); assert.equal(stale.childStatus().live, false); assert.equal(stale.child.action(4), false);
});

test('huvudfönstrets nya instans ger helt tillstånd efter omladdning och byter ägare', () => {
  const s = setup(); s.host.disconnect();
  s.receive({ protocol: 1, from: 'host-00000002', owner: 'host-00000002', type: 'state', version: 0, state: { value: 3, undo: [] } });
  assert.equal(s.childStatus().live, true); assert.equal(s.childStatus().version, 0); assert.equal(s.childState().value, 3);
  s.receive({ protocol: 1, from: 'host-00000001', owner: 'host-00000001', type: 'state', version: 9, state: { value: 999, undo: [] } });
  assert.equal(s.childState().value, 3);
  s.child.action(8); assert.equal(s.packets.at(-1).owner, 'host-00000002');
});

test('fönsteradress och arbetsvy innehåller aldrig elevurval eller främmande fält', () => {
  const url = fonsterUrl('52a10000-0000-4000-8000-000000000001', 2026, 'draft-0000001', { view: 'elev', resource: 'pupil-private' });
  assert.equal(url.includes('private'), false);
  const parsed = parseFonsterTarget(new URL(url, 'https://example.test').searchParams); assert.equal(parsed.fonster.view, 'elev'); assert.equal(parsed.fonster.resource, undefined);
  assert.equal(parseFonsterTarget(new URLSearchParams('skola=x&lasar=2026&utkast=draft-0000001&vy=folj')), null);
  const windows = [{ view: 'folj' }, { view: 'elev', resource: 'hemligt' }, { view: 'larare', resource: 'larare-2', pupilId: 'hemligt' }, { view: 'tid' }, { view: 'later' }];
  assert.deepEqual(sakerFonsteruppsattning(windows), [{ view: 'folj' }, { view: 'elev' }, { view: 'larare' }, { view: 'tid' }]);
  const safe = sakerArbetsvy({ id: 'v1', name: 'Vyer', resources: [], layers: {}, filter: tomtSamlingFilter(), color: 'amne', compact: false, day: 0, windows });
  assert.equal(JSON.stringify(safe).includes('hemligt'), false); assert.equal(safe.windows.length, 4);
});

test('bara utkastets slumpnummer finns i sessionStorage; samma skola/läsår/uppdrag återansluter', () => {
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const a = schemaDraftId(storage, 'scope', 'school', 2026, () => 'draft-0000001'), b = schemaDraftId(storage, 'scope', 'school', 2026, () => assert.fail());
  assert.equal(a, b); assert.equal([...store.values()][0], 'draft-0000001');
  assert.notEqual(schemaDraftId(storage, 'other', 'school', 2026, () => 'draft-0000002'), a);
  assert.equal(schemaDraftId({ getItem: () => { throw Error(); }, setItem: () => { throw Error(); } }, 'scope', 'school', 2026, () => 'draft-0000003'), 'draft-0000003');
});

test('arbetsvyns fönsterlista följer bara anslutna fönster och stryker stängda vyer', () => {
  const s = setup(); assert.deepEqual(s.opened(), [{ view: 'folj' }]); s.child.disconnect(); assert.deepEqual(s.opened(), []); assert.equal(s.hostStatus().windows, 1);
});

test('villkor och ångra-steg i samma UI-händelse valideras tillsammans mot läst version', () => {
  const s = setup(); s.child.actions([2, 3]); assert.deepEqual(s.state(), { value: 3, undo: [0, 2] }); assert.deepEqual(s.childState(), s.state());
});

test('stabila resursreferenser bevaras över nya förslag medan löpnummer stryks', () => {
  const vals = sakerFonsteruppsattning([{ view: 'vecka', resource: 'klass:52a10000-0000-4000-8000-000000000001' }, { view: 'larare', resource: 'larare-1' }, { view: 'larare', resource: 'larare:52a10000-0000-4000-8000-000000000002' }, { view: 'sal', resource: 'sal:Provsal 1' }]);
  assert.equal(vals[0].resource, 'klass:52a10000-0000-4000-8000-000000000001'); assert.equal(vals[1].resource, undefined); assert.equal(vals[2].resource, 'larare:52a10000-0000-4000-8000-000000000002'); assert.equal(vals[3].resource, 'sal:Provsal 1');
});
