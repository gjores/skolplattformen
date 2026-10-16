// Simulated component API: real Worker/OIDC verification is a separate release gate.
import { test, expect, type Page } from '@playwright/test';
import { annualPlan, annualLegacy, annualCopyPlan } from './fixtures/annual-time-data';
import { suggestGymTimplanTimeV2 } from '../lib/gym-timplan-distribution';
import { projectTimplanTimeTransition } from '../lib/timplan-time';
const url = '/e2e/fixtures/annual-time-preview.html', key = annualPlan.rows[0].key;
async function mock(page: Page, mode = 'saved') {
 let current: any = structuredClone(mode.startsWith('transition') ? annualLegacy : mode === 'lost-copy' ? annualCopyPlan : annualPlan), saved: any = null, once = true, statusFails = mode.startsWith('lost'), basisChanged = false;
 const writes: any[] = [], errors: string[] = [];
 page.on('pageerror', e => errors.push(e.message));
 await page.route('**/api/timplaner/gym/**', async route => {
  const path = new URL(route.request().url()).pathname, body = route.request().postDataJSON();
  if (path.endsWith('/apl/lasa')) return route.fulfill({json:{contractVersion:'structured_v1',planId:current.id,revision:current.revision,organizerId:'77101300-0000-4000-8000-000000000013',program:{code:'BA25',version:1,category:'VOCATIONAL_PROGRAM',startDate:'2025-07-01',endDate:null,canceledDate:null,sourceSupported:true},plan:null,copyReview:[],contentHash:`sha256:${'0'.repeat(64)}`,confirmations:[],capabilities:{canSave:true,canConfirm:true}}});
  if (path.endsWith('/lasa')) return route.fulfill({ json: mode === 'stale' && saved ? annualPlan : current });
  if (path.endsWith('/tidsstatus')) {
   if (statusFails) return route.fulfill({ status: 503, json: { code: 'unavailable', message: 'Tillfälligt fel' } });
   if (mode === 'mfa' && once) return route.fulfill({ status: 403, json: { code: 'mfa_required', message: 'Verifiera med engångskod.' } });
   return route.fulfill({ json: saved ? { state: 'completed', result: { ...saved, receipt: { ...saved.receipt, replayed: true } } } : { state: 'not_found', result: null } });
  }
  if (path.endsWith('/tidsmodell') && route.request().method() === 'POST') return route.fulfill({ json: { planId: current.id, revision: current.revision, basisHash: `sha256:${(basisChanged?'c':'b').repeat(64)}`, rows: projectTimplanTimeTransition(current, { contractVersion: 'structured_v1', educationForm: 'school_based', classification: 'complete', periods: [{ id: '77101300-0000-4000-8000-000000000099', name: 'APL', startsOn: null, endsOn: null, schoolYear: null, extent: { basis: 'unknown', weeks: null, reviewed: false, reviewNote: '' }, contents: [{ rowKey: key, description: 'Moment' }], allocations: [{ rowKey: key, termIndex: 0, gutMinutes: 30 }] }] }).timeRows } });
  writes.push(body);
  if(mode==='transition-conflict'&&once){once=false;basisChanged=true;return route.fulfill({status:409,json:{code:'time_basis_conflict',message:'Underlaget ändrades.'}});}
  if(path.endsWith('/fordela')){const proposal=suggestGymTimplanTimeV2(current,body.totalHours,body.mode);current={...current,revision:current.revision+1,timeRows:proposal.timeRows};return route.fulfill({json:current});}
  if (mode === 'mfa' && once) return route.fulfill({ status: 403, json: { code: 'mfa_required', message: 'Verifiera med engångskod.' } });
  if (mode === 'conflict' && once) { once = false; current.revision++; current.timeRows[key].schoolMinutes[0] = 900; return route.fulfill({ status: 409, json: { code: 'revision_conflict', message: 'Ändrad' } }); }
  if (body.action === 'transition') { const { hours: _hours, ...base } = current; current = { ...base, revision: current.revision + 1, timeModel: 'school_terms_annual_apl_v2', timeRows: { [key]: { schoolMinutes: [4770, 0, null, null, null, null], annualAplMinutes: [30, null, null] } }, timeCopyReview: [] }; }
  else if(body.action==='resolve_copy_review')current={...current,revision:current.revision+1,timeCopyReview:current.timeCopyReview.map((r:any)=>r.id===body.reviewId?{...r,resolution:{actorId:'77101300-0000-4000-8000-000000000011',assignmentId:'77101300-0000-4000-8000-000000000012',at:'2026-10-16T12:00:00.000Z',note:body.note}}:r)};
  else current = { ...current, revision: current.revision + 1, timeRows: { ...current.timeRows, [body.rowKey]: body.row } };
  saved = { contractVersion: 'timplan_time_v2', plan: structuredClone(current), receipt: { commandId: body.commandId, planId: body.planId, action: body.action, revision: current.revision, changed: true, replayed: false } };
  if(mode==='accepted-error'&&once){once=false;return route.fulfill({status:500,json:{code:'internal_error',message:'Svaret kunde inte levereras.'}});}
  if (mode.startsWith('lost') && once) { once = false; return route.abort(); }
  return route.fulfill({ json: saved });
 });
 return { writes, errors, current: () => current, recover: () => { once = false; statusFails = false; } };
}
const input = (page: Page, index: number) => page.locator(`input[data-time-cell="${index}"]`);
test('school HT/VT and annual APL save without periods, minute precision and exact total', async ({ page }, info) => {
 const m = await mock(page); await page.goto(url); await expect(input(page, 0)).toBeEnabled();
 await expect(page.getByText('Hela planen: 100 h', { exact: true })).toBeVisible();
 await input(page, 0).fill('79:30'); await input(page, 0).press('Enter');
 await expect(page.getByText('Allt sparat', { exact: true })).toBeVisible(); expect(m.writes).toHaveLength(1); expect(m.writes[0].row.schoolMinutes[0]).toBe(4770); expect(m.writes[0].row.annualAplMinutes[0]).toBe(3600);
 await expect(page.getByText('Hela planen: 159:30 h', { exact: true })).toBeVisible(); expect(m.current().revision).toBe(5);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.screenshot({ path: info.outputPath('annual-school-apl.png'), fullPage: true }); expect(m.errors).toEqual([]);
});
test('explicit zero differs from unplanned APL and other years stay inactive', async ({ page }) => {
 const m = await mock(page); await page.goto(url); await input(page, 6).fill(''); await input(page, 6).press('Enter'); await expect(page.getByText('Allt sparat', { exact: true })).toBeVisible(); expect(m.writes[0].row.annualAplMinutes).toEqual([null, null, null]); await expect(page.getByText('Hela planen: 40 h', { exact: true })).toBeVisible(); await expect(page.getByText('Ofördelat', { exact: true }).first()).toBeVisible();
 await input(page, 6).fill('0'); await input(page, 6).press('Enter'); await expect(page.getByText('Allt sparat', { exact: true })).toBeVisible(); expect(m.writes[1].row.annualAplMinutes[0]).toBe(0);
 await page.getByRole('button', { name: 'Åk 2', exact: true }).click(); await expect(page.locator('input[data-time-cell]')).toHaveCount(0); await page.getByRole('button', { name: 'Åk 1', exact: true }).click(); await expect(input(page, 6)).toHaveValue('0');
});
test('unknown reply survives reload and recovers same command without another write', async ({ page }) => {
 const m = await mock(page, 'lost'); await page.goto(url); await input(page, 0).fill('21'); await input(page, 0).press('Enter'); await expect(page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true })).toBeEnabled(); const id = m.writes[0].commandId;
 await page.reload(); await expect(page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true })).toBeEnabled(); m.recover(); await page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true }).click(); await expect(page.getByText('Allt sparat', { exact: true })).toBeVisible(); await expect(input(page, 0)).toHaveValue('21'); expect(m.writes).toHaveLength(1); expect(m.writes[0].commandId).toBe(id); expect(m.errors).toEqual([]);
});
test('stale read never clears durable command after accepted write', async ({ page }) => {
 const m = await mock(page, 'stale'); await page.goto(url); await input(page, 0).fill('21'); await input(page, 0).press('Enter'); await expect(page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true })).toBeEnabled(); await expect(page.getByRole('button', { name: 'Lämna arbetsytan' })).toBeDisabled(); expect(await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('timplan-time:')).length)).toBe(1); expect(m.writes).toHaveLength(1);
});
test('CAS conflict preserves draft and requires explicit comparison before new UUID', async ({ page }) => {
 const m = await mock(page, 'conflict'); await page.goto(url); await input(page, 0).fill('21'); await input(page, 0).press('Enter'); await expect(page.getByText('Sparat nu:', { exact: false })).toBeVisible(); expect(m.writes).toHaveLength(1); await page.getByRole('button', { name: 'Spara min fördelning', exact: true }).click(); await expect(page.getByText('Allt sparat', { exact: true })).toBeVisible(); expect(m.writes[1].expectedRevision).toBe(5); expect(m.writes[1].commandId).not.toBe(m.writes[0].commandId); expect(m.errors).toEqual([]);
});
test('MFA retains original UUID across reload and retries only explicitly', async ({ page }) => {
 const m = await mock(page, 'mfa'); await page.goto(url); await input(page, 0).fill('21'); await input(page, 0).press('Enter'); await expect(page.getByRole('button', { name: 'Verifiera med engångskod', exact: true })).toBeVisible(); const id = m.writes[0].commandId; m.recover(); await page.reload(); await page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true }).click(); await expect(page.getByRole('button', { name: 'Försök spara samma ändring', exact: true })).toBeEnabled(); expect(m.writes).toHaveLength(1); await page.getByRole('button', { name: 'Försök spara samma ändring', exact: true }).click(); await expect(page.getByText('Allt sparat', { exact: true })).toBeVisible(); expect(m.writes[1]).toEqual(m.writes[0]); expect(m.writes[1].commandId).toBe(id);
});
test('transition reviews exact 79:30 school + 0:30 APL, cancel writes nothing', async ({ page }, info) => {
 const m = await mock(page, 'transition'); await page.goto(`${url}?legacy`); await page.getByRole('button', { name: 'Granska byte till skola och APL' }).click(); const dialog = page.getByRole('dialog'); await expect(dialog.getByText('79:30', { exact: true })).toBeVisible(); await expect(dialog.getByText('0:30', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Byt till skola och APL', exact: true })).toBeDisabled(); await page.screenshot({ path: info.outputPath('annual-transition.png'), fullPage: true }); await page.getByRole('button', { name: 'Avbryt', exact: true }).click(); expect(m.writes).toHaveLength(0);
 await page.getByRole('button', { name: 'Granska byte till skola och APL' }).click(); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Byt till skola och APL', exact: true }).click(); await expect(input(page, 0)).toHaveValue('79:30'); await expect(input(page, 6)).toHaveValue('0:30'); await expect(page.getByText('Hela planen: 80 h', { exact: true })).toBeVisible(); expect(m.writes).toHaveLength(1); expect(m.writes[0].reviewed).toBe(true); expect(m.errors).toEqual([]);
});
test('missing mandate prevents V2 editing', async ({ page }) => { const m = await mock(page); await page.goto(`${url}?noscope`); await expect(page.locator('input[data-time-cell]')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Autofördela timmar' })).toBeDisabled(); expect(m.writes).toHaveLength(0); });

test('autodistribution reserves annual APL and counts minutes once',async({page},info)=>{
 const m=await mock(page);await page.goto(url);await input(page,0).fill('79:30');await input(page,0).press('Enter');await expect(page.getByText('Allt sparat',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Autofördela timmar',exact:true}).click();const modal=page.getByRole('dialog');await expect(page.getByLabel('Total undervisningstid (timmar)',{exact:true})).toBeEnabled();await page.getByLabel('Fördela om skoltimmarna',{exact:false}).check();await page.getByLabel('Total undervisningstid (timmar)',{exact:true}).fill('100');await page.getByRole('button',{name:'Granska fördelning',exact:true}).click();await expect(modal).toContainText('60');await page.screenshot({path:info.outputPath('annual-distribution.png'),fullPage:true});await page.getByRole('button',{name:'Spara fördelning',exact:true}).click();await expect(modal).toHaveCount(0);await expect(input(page,0)).toHaveValue('20');await expect(input(page,1)).toHaveValue('20');await expect(input(page,6)).toHaveValue('60');await expect(page.getByText('Hela planen: 100 h',{exact:true})).toBeVisible();expect(m.current().timeRows[key].annualAplMinutes[0]).toBe(3600);expect(m.errors).toEqual([]);
});

test('copy review uses the same durable journal and recovers after reload',async({page})=>{
 const m=await mock(page,'lost-copy');await page.goto(`${url}?copy`);await page.getByLabel('Så har tiden hanterats').fill('Fördelat i den nya timtabellen.');await page.getByRole('button',{name:'Markera uppgiften som hanterad'}).click();await expect(page.getByRole('button',{name:'Kontrollera sparstatus',exact:true})).toBeEnabled();await page.reload();m.recover();await page.getByRole('button',{name:'Kontrollera sparstatus',exact:true}).click();await expect(page.getByText('Granska kopierad undervisningstid – klart',{exact:true})).toBeVisible();await page.getByText('Granska kopierad undervisningstid – klart',{exact:true}).click();await expect(page.getByText('Hanterat: Fördelat i den nya timtabellen.')).toBeVisible();expect(m.writes).toHaveLength(1);expect(m.writes[0].action).toBe('resolve_copy_review');await expect(input(page,0)).toBeEnabled();expect(m.errors).toEqual([]);
});

test('explicit server 500 after commit resolves the original receipt without a second write',async({page})=>{const m=await mock(page,'accepted-error');await page.goto(url);await input(page,0).fill('21');await input(page,0).press('Enter');await expect(page.getByText('Allt sparat',{exact:true})).toBeVisible();await expect(input(page,0)).toHaveValue('21');expect(m.writes).toHaveLength(1);expect(m.current().revision).toBe(5);expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('timplan-time:')).length)).toBe(0);expect(m.errors).toEqual([]);});

test('changed transition basis with same revision requires new review, never same-request loop',async({page})=>{
 const m=await mock(page,'transition-conflict');await page.goto(`${url}?legacy`);await page.getByRole('button',{name:'Granska byte till skola och APL'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Byt till skola och APL',exact:true}).click();await page.getByRole('button',{name:'Kontrollera sparstatus',exact:true}).click();await expect(page.getByRole('button',{name:'Läs underlaget igen',exact:true})).toBeEnabled();expect(m.writes).toHaveLength(1);await page.getByRole('button',{name:'Läs underlaget igen',exact:true}).click();await expect(page.getByRole('checkbox')).not.toBeChecked();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Byt till skola och APL',exact:true}).click();await expect(input(page,0)).toHaveValue('79:30');expect(m.writes[1].commandId).not.toBe(m.writes[0].commandId);expect(m.writes[1].expectedBasisHash).toBe(`sha256:${'c'.repeat(64)}`);expect(m.errors).toEqual([]);
});
