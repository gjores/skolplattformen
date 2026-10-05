import test from 'node:test';
import assert from 'node:assert/strict';
import { readPlanLocation, planLocationQuery } from './protected-plan-location.ts';
const id='55004000-0000-4000-8000-000000000001', other='55004000-0000-4000-8000-000000000002';
test('source and school plan survive a reload without retaining pupil register selections',()=>{
  for(const location of [{view:'programplaner',programplan:{offeringId:id,planId:other}},{view:'timplaner',gym:{kind:'plan',id}},{view:'timplaner',gym:{kind:'source',id}}])assert.deepEqual(readPlanLocation(planLocationQuery(location)),location);
  assert.deepEqual(readPlanLocation(`?vy=timplaner&timplan=${id}&elev=private&skola=other`),{view:'timplaner',gym:{kind:'plan',id}});
});
test('malformed links provide no object reference or role authority',()=>{
  assert.equal(readPlanLocation('?vy=kund&roll=huvudman'),null);
  assert.deepEqual(readPlanLocation('?vy=timplaner&timplan=javascript:alert(1)'),{view:'timplaner',gym:null});
  assert.deepEqual(readPlanLocation(`?vy=programplaner&utbildning=${id}&programplan=bad`),{view:'programplaner',programplan:null});
});
