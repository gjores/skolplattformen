import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { lasarContentCanonical, lasarContentHash, LASAR_CONTENT_PREFIX } from './lasar-content.ts';
import { tjanstCanonicalSerialize } from './tjanst-contract.ts';

const vectorFile = JSON.parse(readFileSync(new URL('../../supabase/tests/lasar_content_hash_vectors.json', import.meta.url), 'utf8'));
const byName = Object.fromEntries(vectorFile.vectors.map((v) => [v.name, v]));
const full = () => structuredClone(byName['fullt innehåll'].input);

test('lasarContentHash ger samma kanoniska form och sha256 som vektorerna i lasar_content_hash_vectors.json', async () => {
  assert.equal(vectorFile.kind, 'lasar-content-hash-vectors');
  assert.ok(vectorFile.vectors.length >= 5);
  for (const name of ['tom', 'en lovdag', 'gruppdag', 'kort vecka', 'ramversion']) assert.ok(byName[name], name);
  for (const v of vectorFile.vectors) {
    assert.deepEqual(lasarContentCanonical(v.input), v.canonicalArray, v.name);
    assert.equal(tjanstCanonicalSerialize(lasarContentCanonical(v.input)), v.canonical, v.name);
    assert.equal(await lasarContentHash(v.input), v.sha256, v.name);
    assert.equal('sha256:' + createHash('sha256').update(Buffer.from(v.canonical, 'utf8')).digest('hex'), v.sha256, v.name);
  }
});

test('kanoniska formen börjar med prefixet lasar_content_v1', () => {
  assert.equal(LASAR_CONTENT_PREFIX, 'lasar_content_v1');
  assert.equal(lasarContentCanonical(byName.tom.input)[0], 'lasar_content_v1');
});

test('lasarContentHash är oberoende av nyckelordning', async () => {
  assert.equal(byName['fullt innehåll, nycklar i omvänd ordning'].sha256, byName['fullt innehåll'].sha256);
  const c = full();
  const shuffled = {
    version: c.version, frameVersionId: c.frameVersionId, shortWeeks: c.shortWeeks,
    groupDays: Object.fromEntries(Object.entries(c.groupDays).reverse().map(([g, days]) => [g, Object.fromEntries(Object.entries(days).reverse())])),
    exceptions: Object.fromEntries(Object.entries(c.exceptions).reverse().map(([d, e]) => [d, e.note === undefined ? { kind: e.kind } : { note: e.note, kind: e.kind }])),
    terms: { vt: { end: c.terms.vt.end, start: c.terms.vt.start }, ht: { end: c.terms.ht.end, start: c.terms.ht.start } },
  };
  assert.equal(await lasarContentHash(shuffled), await lasarContentHash(c));
});

test('lasarContentHash ändras när en dag, en terminskant, en gruppdag, en kort vecka, ramversionen eller versionsnumret ändras', async () => {
  const original = await lasarContentHash(full());
  const variants = {
    'ny dag': (c) => { c.exceptions['2026-12-01'] = { kind: 'studiedag', note: 'Planering' }; },
    'ändrat slag': (c) => { c.exceptions['2026-10-26'].kind = 'studiedag'; },
    'ändrad anteckning': (c) => { c.exceptions['2026-10-26'].note = 'Höstlov v44'; },
    'borttagen dag': (c) => { delete c.exceptions['2026-10-27']; },
    terminskant: (c) => { c.terms.vt.end = '2027-06-10'; },
    gruppdag: (c) => { c.groupDays['arskurs:51a10000-0000-4000-8000-000000000001:ak1']['2026-09-18'] = { cause: 'apl' }; },
    'kort vecka': (c) => { c.shortWeeks['arskurs:51a10000-0000-4000-8000-000000000001:ak1'].weekday = 0; },
    ramversion: (c) => { c.frameVersionId = '51a10000-0000-4000-8000-0000000000f2'; },
    versionsnummer: (c) => { c.version = 4; },
  };
  const seen = new Set([original]);
  for (const [name, change] of Object.entries(variants)) {
    const c = full();
    change(c);
    const hash = await lasarContentHash(c);
    assert.notEqual(hash, original, name);
    assert.ok(!seen.has(hash), name);
    seen.add(hash);
  }
});

test('kanoniska formen nekar ogiltigt versionsnummer', () => {
  for (const version of [0, -1, 1.5, '1']) assert.throws(() => lasarContentCanonical({ ...byName.tom.input, version }), String(version));
});
