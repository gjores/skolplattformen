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
  const result = await fetchRegistryUnit('99999908', async (url) => {
    assert.equal(url, 'https://api.skolverket.se/skolenhetsregistret/v2/school-units/99999908');
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
