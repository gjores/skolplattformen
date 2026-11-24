import assert from 'node:assert/strict';
import test from 'node:test';
import { SCHEMA_CONTRACT_VERSION } from './schema-contract.ts';
import { schemaDatumOriginal } from './schema-datum.ts';
import { datumFixture, datumId as id } from './schema-datum-fixture.mjs';
import { schemaProvdagProjektion } from './schema-provdag-projektion.ts';
import { parseSchemaProvdagarRequest, parseSchemaProvdagarSvar, schemaProvdagarScope } from './schema-provdagar.ts';

const mandag = '2026-11-02', tisdag = '2026-11-03';
const prov = (extra = {}) => ({
  id: id(101), namn: 'Nationellt prov', undervisning: `undervisning:class_timplan:${id(10)}:2026:prov`,
  mal: { slag: 'klass', ref: id(10) }, datum: mandag, startMin: 480, slutMin: 540, tidsval: 'period',
  salId: null, vakter: [], kontrolleradDatum: mandag, ...extra,
});
const salar = [{ id: 'sal-7', name: 'Provsal A' }, { id: 'sal-6', name: 'Provsal B' }];
const underlag = (f, bokningar, datedOverrides = []) => ({
  plan: f.plan, underlag: f.underlag, forslag: f.f, datedBasis: f.datedBasis, datedOverrides, bokningar, salar,
});

test('provdagen ställer in hela ordinarie lektionen för både provklassen och annan undervisning med bokad sal eller provvakt', () => {
  const f = datumFixture({ year: true });
  const matt = f.of('Matematik'), historia = f.of('Historia');
  for (const b of [prov({ salId: 'sal-6' }), prov({ vakter: [id(21)] })]) {
    const result = schemaProvdagProjektion(underlag(f, [b]), [mandag]);
    assert.ok(result.installda.some(o => o.lesson === matt.id));
    assert.ok(result.installda.some(o => o.lesson === historia.id));
    assert.deepEqual(result.deltagare, [{ provId: id(101), refs: [id(10), id(40)] }]);
    assert.ok(!JSON.stringify(result).includes(id(80)));
    assert.equal(result.ersatta.length, 0);
  }
  const slut = matt.startMin + schemaDatumOriginal(f.f, { lesson: matt.id, originalDate: mandag }).length;
  const efter = schemaProvdagProjektion(underlag(f, [prov({ startMin: slut, slutMin: slut + 60 })]), [mandag]);
  assert.ok(!efter.installda.some(o => o.lesson === matt.id));
});

test('ett manuellt flyttat grupptillfälle prövas på måldagen med elevmedlemskapet som gäller då', () => {
  const f = datumFixture({ year: true }), inflyttad = f.change(mandag);
  const fore = schemaProvdagProjektion(underlag(f, [prov()], [inflyttad]), [mandag, tisdag]);
  assert.deepEqual(fore.installda.find(o => o.lesson === inflyttad.lesson),
    { lesson: inflyttad.lesson, originalDate: tisdag, date: mandag });
  f.datedBasis.memberships[0].startsOn = tisdag;
  const efter = schemaProvdagProjektion(underlag(f, [prov()], [inflyttad]), [mandag, tisdag]);
  assert.ok(!efter.installda.some(o => o.lesson === inflyttad.lesson));
  assert.deepEqual(efter.deltagare, [{ provId: id(101), refs: [id(10)] }]);
});

test('ett flyttat provkrockande tillfälle redovisas som ersatt även när bara den nya dagen visas', () => {
  const f = datumFixture({ year: true }), lesson = f.of('Matematik').id, key = { lesson, originalDate: mandag };
  f.datedBasis.classMemberships[0].endsOn = null;
  const a = { ...key, date: tisdag, startMin: 630, room: 'sal-1', durationMin: schemaDatumOriginal(f.f, key).length };
  const data = underlag(f, [prov()], [a]);
  const scope = parseSchemaProvdagarRequest({ ...f.request, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.underlag.grundFingerprint,
    placements: f.placements, provrevision: 4, dates: [tisdag], datedOverrides: [a] });
  const result = schemaProvdagProjektion(data, [tisdag]);
  assert.deepEqual(result.ersatta, [{ ...key, date: tisdag }]);
  assert.deepEqual(result.installda, []);
  const reply = { ...schemaProvdagarScope(scope), ...result };
  assert.deepEqual(parseSchemaProvdagarSvar(reply, scope, new Set([id(101)])), reply);
  assert.throws(() => parseSchemaProvdagarSvar({ ...reply, provrevision: 5 }, scope, new Set([id(101)])));
  f.datedBasis.classMemberships[0].endsOn = mandag;
  assert.deepEqual(schemaProvdagProjektion(data, [tisdag]).ersatta, []);
  f.datedBasis.classMemberships[0].endsOn = null;
  const krockarAvenNyDag = schemaProvdagProjektion({ ...data, bokningar: [...data.bokningar,
    prov({ id: id(102), datum: tisdag, startMin: 620, slutMin: 660, mal: { slag: 'klass', ref: id(11) }, vakter: [id(20)] })] }, [tisdag]);
  assert.deepEqual(krockarAvenNyDag.ersatta, []);
  assert.ok(krockarAvenNyDag.installda.some(o => o.lesson === lesson && o.originalDate === mandag));
});
