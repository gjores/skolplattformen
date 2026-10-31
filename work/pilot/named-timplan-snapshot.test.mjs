import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeElectiveSnapshotConstraint} from './named-timplan-snapshot.mjs';
const forms=[
 {relname:'elective_participant_bindings',conname:'elective_participant_bindings_source_reference_check',nested:'CHECK ((((length(source_reference) >= 1) AND (length(source_reference) <= 120)) AND (source_reference = btrim(source_reference))))',flat:'CHECK (((length(source_reference) >= 1) AND (length(source_reference) <= 120) AND (source_reference = btrim(source_reference))))'},
 {relname:'elective_rounds',conname:'elective_rounds_check1',nested:'CHECK ((((max_choices >= 1) AND (max_choices <= 100)) AND (max_choices >= min_choices)))',flat:'CHECK (((max_choices >= 1) AND (max_choices <= 100) AND (max_choices >= min_choices)))'},
];
test('exact restored AND forms retain the already installed source fingerprint',()=>{
 for(const rule of forms){assert.equal(normalizeElectiveSnapshotConstraint({...rule,definition:rule.flat}),rule.nested);assert.equal(normalizeElectiveSnapshotConstraint({...rule,definition:rule.nested}),rule.nested);}
});
test('changed limit or operator remains a real schema difference',()=>{
 for(const rule of forms){for(const definition of [rule.flat.replace('<=','<'),rule.flat.replace('>= 1','>= 0'),rule.flat.replace('AND','OR')])assert.equal(normalizeElectiveSnapshotConstraint({...rule,definition}),definition);}
});
test('identical text on another table or constraint is not an accepted restore exception',()=>{
 for(const rule of forms){assert.equal(normalizeElectiveSnapshotConstraint({...rule,relname:'another_table',definition:rule.flat}),rule.flat);assert.equal(normalizeElectiveSnapshotConstraint({...rule,conname:'another_constraint',definition:rule.flat}),rule.flat);}
});
