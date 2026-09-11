import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registryAddress, addressText } from './registry-address.ts';
import {
  createOrganisationState,
  addUnitFromRegistry,
  applyRegistryUnit,
  appointPrincipal,
  unitStaff,
} from './organisation-model.ts';

test('besöksadress väljs framför postadress oavsett ordning', () => {
  const a = registryAddress([
    { type: 'POSTADRESS', streetAddress: 'Box 1', locality: 'Göteborg' },
    {
      type: 'BESOKSADRESS',
      streetAddress: 'Bellmansgatan 6',
      postalCode: '41128',
      locality: 'Göteborg',
    },
  ]);
  assert.equal(addressText(a), 'Bellmansgatan 6, 41128 Göteborg');
  assert.equal(registryAddress(null), undefined);
  assert.equal(addressText(registryAddress([])), 'Adress saknas i registret');
  assert.equal(
    registryAddress([
      { type: 'POSTADRESS', address: { streetAddress: 'Box 1' } },
    ]).street,
    'Box 1',
  );
});
const registry = {
  code: '12345678',
  name: 'Testimport',
  status: 'AKTIV',
  municipalityCode: '1480',
  schoolTypes: ['GR', 'GY'],
  programmes: { gy: ['SA'] },
  organizer: { name: 'Exempel', type: 'ENSKILD' },
  headMaster: 'Enligt registret',
  address: {
    street: 'Skolgatan 1',
    postalCode: '12345',
    locality: 'Exempelstad',
  },
};
test('import väljer registertyper och adress utan att utse registrets rektor', () => {
  const s = addUnitFromRegistry(
    createOrganisationState(),
    'huvudman',
    registry,
  );
  const u = s.units.find((u) => u.code === registry.code);
  assert.deepEqual(
    u.schoolTypes.map((t) => t.code),
    ['GR', 'GY'],
  );
  assert.deepEqual(u.address, registry.address);
  assert.equal(unitStaff(s, u.id).filter((a) => a.role === 'rektor').length, 0);
});
test('HM utser rektor och registeruppdatering skriver inte över uppdraget', () => {
  let s = addUnitFromRegistry(createOrganisationState(), 'huvudman', registry);
  s = appointPrincipal(
    s,
    'huvudman',
    registry.code,
    undefined,
    'Lokalt utsedd',
  );
  s = applyRegistryUnit(s, 'huvudman', {
    ...registry,
    headMaster: 'Nytt registernamn',
  });
  assert.equal(
    unitStaff(s, registry.code).find((a) => a.role === 'rektor').name,
    'Lokalt utsedd',
  );
  assert.throws(
    () => appointPrincipal(s, 'rektor', registry.code, undefined, 'Försök'),
    /huvudmannen/,
  );
  assert.throws(
    () => appointPrincipal(s, 'huvudman', registry.code, undefined, ' '),
    /namn/,
  );
});
test('byte ersätter bara skolans rektorsuppdrag och bevarar andra skolor', () => {
  let s = addUnitFromRegistry(createOrganisationState(), 'huvudman', registry);
  s = appointPrincipal(s, 'huvudman', registry.code, 'rektor-robin');
  s = appointPrincipal(s, 'huvudman', registry.code, undefined, 'Ny rektor');
  assert.deepEqual(s.assignments.find((a) => a.id === 'rektor-robin').unitIds, [
    '99999901',
  ]);
  assert.equal(
    unitStaff(s, registry.code).filter((a) => a.role === 'rektor').length,
    1,
  );
});
