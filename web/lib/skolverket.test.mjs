import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRegistryUnit, toImportUnitData } from './server/skolverket.ts';

const fixture = {
  meta: { fixtureVersion: 'synthetic-registry-v1', modified: '2026-09-01' },
  data: {
    schoolUnitCode: '99999908',
    attributes: { displayName: 'Syntetisk provskola Å', municipalityCode: '0000', schoolTypes: ['GY'], schoolTypeProperties: { GY: { programmes: ['NA'] } } },
  },
  included: { type: 'organizer', attributes: { displayName: 'Syntetisk huvudman', municipalities: [{ municipalityCode: '0000', displayName: 'Exempelstad' }] } },
};

test('versionsmärkt syntetisk transport ger exakt importkontrakt och oförändrad proveniens', async () => {
  const result = await fetchRegistryUnit('99999908', async (url, options) => {
    assert.equal(url, 'https://api.skolverket.se/skolenhetsregistret/v2/school-units/99999908');
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(fixture);
  });
  assert.deepEqual(result.payload, fixture);
  const data = toImportUnitData(result.unit, new Date('2026-09-17T12:00:00Z'));
  assert.deepEqual(data.municipality, { code: '0000', name: 'Exempelstad' });
  assert.deepEqual(data.schoolTypes, [{ code: 'GY', programmes: ['NA'] }]);
  assert.equal(data.source.fetched, '2026-09-17');
  assert.equal(data.pupilRegister.source, 'Inget register kopplat');
});

test('saknad kod skiljs från nätfel, felaktigt registersvar och serverfel', async () => {
  assert.equal(await fetchRegistryUnit('99999908', async () => new Response(null, { status: 404 })), null);
  for (const transport of [
    async () => { throw new Error('network'); },
    async () => new Response(null, { status: 503 }),
    async () => Response.json({}),
    async () => Response.json({ ...fixture, data: { ...fixture.data, schoolUnitCode: '99999909' } }),
  ]) await assert.rejects(fetchRegistryUnit('99999908', transport), { message: 'registry_unavailable' });
});

test('omdirigerad skolenhet följs inte och blir ett minimerat registerfel', async () => {
  for (const status of [301, 302, 307, 308]) {
    const calls = [];
    await assert.rejects(fetchRegistryUnit('99999908', async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, 'manual');
      return new Response(null, { status, headers: { Location: 'https://foreign.invalid/school' } });
    }), { message: 'registry_unavailable' });
    assert.deepEqual(calls, ['https://api.skolverket.se/skolenhetsregistret/v2/school-units/99999908']);
  }
});

const fallbackFixture = () => ({
  ...structuredClone(fixture),
  included: { type: 'organizer', organizationNumber: '9999999999', attributes: { displayName: 'Syntetisk huvudman' } },
});

test('valfritt kommunuppslag använder manual och kompletterar endast matchande kommun', async () => {
  const payload = fallbackFixture(), calls = [];
  const result = await fetchRegistryUnit('99999908', async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    if (calls.length === 1) return Response.json(payload);
    return Response.json({ data: { attributes: { municipalities: [
      { municipalityCode: '1111', displayName: 'Annan kommun' },
      { municipalityCode: '0000', displayName: 'Exempelstad' },
    ] } } });
  });
  assert.deepEqual(calls, [
    'https://api.skolverket.se/skolenhetsregistret/v2/school-units/99999908',
    'https://api.skolverket.se/skolenhetsregistret/v2/organizers/9999999999',
  ]);
  assert.equal(result.unit.municipalityName, 'Exempelstad');
  assert.deepEqual(result.payload, payload);
});

test('fallback följer aldrig omdirigering och behåller skola vid saknat valfritt kommunnamn', async () => {
  for (const status of [301, 302, 307, 308, 404, 503]) {
    const payload = fallbackFixture(), calls = [];
    const result = await fetchRegistryUnit('99999908', async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, 'manual');
      if (calls.length === 1) return Response.json(payload);
      return new Response(null, { status, headers: { Location: 'https://foreign.invalid/organizer' } });
    });
    assert.deepEqual(calls, [
      'https://api.skolverket.se/skolenhetsregistret/v2/school-units/99999908',
      'https://api.skolverket.se/skolenhetsregistret/v2/organizers/9999999999',
    ]);
    assert.equal(result.unit.code, '99999908');
    assert.equal(result.unit.municipalityName, undefined);
    assert.deepEqual(result.payload, payload);
  }
});

test('fallback utan matchande kommun behåller skola; transportfel fortsätter avvisa uppslaget', async () => {
  let calls = 0;
  const result = await fetchRegistryUnit('99999908', async () => {
    if (++calls === 1) return Response.json(fallbackFixture());
    return Response.json({ data: { attributes: { municipalities: [{ municipalityCode: '1111', displayName: 'Annan kommun' }] } } });
  });
  assert.equal(calls, 2);
  assert.equal(result.unit.municipalityName, undefined);
  calls = 0;
  await assert.rejects(fetchRegistryUnit('99999908', async () => {
    if (++calls === 1) return Response.json(fallbackFixture());
    throw new Error('private transport diagnostics');
  }), { message: 'registry_unavailable' });
  assert.equal(calls, 2);
});
