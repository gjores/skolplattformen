// Riktade 04-13-prov av elevkort, ändringsdialog och exportdialog mot verklig lokal
// OIDC och byggd protected-Worker. De äldre fallen gör inga lyckade mutationer: p3.admin saknar
// engångskod, så ändring, personnummer och nedladdning nekas med mfa_required före
// SQL. 05-22:s delade utbildning provas separat med egen kund och lokalt mintad MFA-session.
// Loggar skriver inga elevvärden. Ersätter inte 04-19:s samlade verifiering.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Response } from '@playwright/test';
import { loginViaKeycloak, waitForHydration } from './helpers/keycloak.ts';
import type { PupilList } from '../lib/pupil-register-model.ts';
import { createSharedOfferingRegisterFixture } from '../../work/pilot/phase4-browser-fixtures.mjs';
import { verifyBrowserTarget } from '../../work/pilot/phase5-browser-fixtures.mjs';

test('05-22: elev på tillagd skola placeras i delad utbildning och okopplat val nekas',async({page},info)=>{
  const baseURL=process.env.PHASE4_BASE_URL??'http://127.0.0.1:3000';
  const proof=await verifyBrowserTarget(baseURL);
  await info.attach('source-build.json',{body:JSON.stringify({...proof,scope:'local-synthetic-only',authentication:'locally-minted-session'}),contentType:'application/json'});
  const own=await createSharedOfferingRegisterFixture();
  try{
    const {register}=own;
    await own.cookies(page.context(),register.session,baseURL);
    const listed=page.waitForResponse(response=>isPath(response,'/api/elever/lista','POST'));
    await page.goto('/?vy=elever');await waitForHydration(page);
    const list=await listed;expect(list.status()).toBe(200);
    const body=await list.json() as PupilList;
    expect(body.options.educations).toContainEqual(expect.objectContaining({id:register.offeringId,unitId:register.unitId,name:'Syntetisk grundskola'}));
    expect(body.options.educations.some(education=>education.id===register.unlinkedOfferingId)).toBe(false);
    expect(body.pupils.map(pupil=>pupil.id)).toEqual([register.pupilId]);
    await expect(page.locator('.pupil-register')).toHaveAttribute('aria-busy','false');
    await expect(page.getByLabel('Utbildning',{exact:true}).locator('option',{hasText:'Syntetisk grundskola'})).toHaveCount(1);
    const {body:card}=await openCard(page);
    expect(card.id).toBe(register.pupilId);
    expect(card.unitId).toBe(register.unitId);
    expect(card.capabilities.canEdit).toBe(true);
    await page.getByRole('button',{name:'Byt utbildning',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await dialog.getByLabel('Ny utbildning',{exact:true}).selectOption(register.offeringId);
    await dialog.getByLabel('Gäller från',{exact:true}).fill(register.today);
    const changed=page.waitForResponse(response=>isPath(response,'/api/elever/andra','POST'));
    await dialog.getByRole('button',{name:'Spara utbildningsbytet',exact:true}).click();
    const change=await changed;
    expect(change.status()).toBe(200);
    expect(change.request().postDataJSON()).toMatchObject({pupilId:register.pupilId,kind:'education',payload:{educationId:register.offeringId,startsOn:register.today}});
    expect(await own.registerAudited(change.headers()['x-correlation-id'],register.session,'pupil_education_changed')).toBe(true);
    await expect(page.locator('.pupil-card')).toContainText('Syntetisk grundskola');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const after=await own.registerSnapshot();
    expect(after.version).toBe(card.version+1);
    expect(after.placements).toHaveLength(2);
    expect(after.placements[0]).toMatchObject({unit_id:register.unitId,ends_on:register.yesterday});
    expect(after.placements[1]).toMatchObject({unit_id:register.unitId,offering_id:register.offeringId,starts_on:register.today,ends_on:null});
    const denied=await own.request(baseURL,register.session,'/api/elever/andra',{
      pupilId:register.pupilId,schoolYear:register.year,caseId:null,expectedVersion:after.version,kind:'education',
      payload:{placementId:after.placements[1].id,educationId:register.unlinkedOfferingId,startsOn:register.tomorrow},
    });
    expect(denied.status).toBe(400);
    expect(denied.body.code).toBe('bad_request');
    expect(await own.registerSnapshot()).toEqual(after);
    await noOverflow(page);
    await info.attach('delad-utbildning-elevkort.png',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
    await page.getByRole('button',{name:'Tillbaka till elevlistan',exact:true}).click();
    const refreshed=page.waitForResponse(response=>isPath(response,'/api/elever/lista','POST'));
    await page.reload();expect((await refreshed).status()).toBe(200);await waitForHydration(page);
    await openCard(page);
    await expect(page.locator('.pupil-card')).toContainText('Syntetisk grundskola');
    expect(await own.registerSnapshot()).toEqual(after);
  }finally{
    await info.attach('cleanup.json',{body:JSON.stringify(await own.cleanup()),contentType:'application/json'});
  }
});

let passwords: Record<string, string>;
test.beforeAll(() => {
  process.env.PGCONNECT_TIMEOUT = '10';
  execFileSync(process.execPath, [fileURLToPath(new URL('../../work/pilot/verify-target.mjs', import.meta.url)), '--target', 'protected', '--with-idp'], { stdio: 'pipe', timeout: 30_000 });
  passwords = JSON.parse(readFileSync(fileURLToPath(new URL('../../work/pilot/targets/protected/idp/phase3-users.json', import.meta.url)), 'utf8'));
});
const isPath = (response: Response, path: string, method = 'GET') => new URL(response.url()).pathname === path && response.request().method() === method;

async function login(page: Page): Promise<PupilList> {
  const list = page.waitForResponse(response => isPath(response, '/api/elever/lista', 'POST'));
  await loginViaKeycloak(page, 'p3.admin', { password: passwords['p3.admin'] });
  await waitForHydration(page);
  const result = await list; expect(result.status()).toBe(200);
  await expect(page.locator('.pupil-register')).toHaveAttribute('aria-busy', 'false');
  return result.json();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function smallTargets(page: Page, selector: string) {
  return page.locator(selector).evaluateAll(elements => elements.filter(element => {
    const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
  }).map(element => ({ text: element.textContent?.trim().slice(0, 40), w: Math.round(element.getBoundingClientRect().width), h: Math.round(element.getBoundingClientRect().height) })));
}
/** Dialogen öppnas med en kort skalanimering; mät först när den är klar. */
async function settle(page: Page) {
  await page.getByRole('dialog').evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
}
async function openCard(page: Page) {
  const button = page.getByRole('button', { name: /, öppna elevkortet$/u }).filter({ visible: true }).first();
  const card = page.waitForResponse(response => isPath(response, '/api/elever/elev'));
  await button.click();
  const response = await card;
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const body = await response.json();
  expect(Object.keys(body)).not.toContain('personalNumber');
  await expect(page.locator('.pupil-card h1')).toBeFocused();
  return { button, body, requestUrl: response.url() };
}

test('elevkortet ersätter listan, visar serverns fält utan personnummer och återför fokus', async ({ page }, info) => {
  const list = await login(page);
  expect(list.pupils.length).toBeGreaterThan(0);
  const before = page.url();
  let revealCalls = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/elever/personnummer') revealCalls += 1; });
  const { button, body } = await openCard(page);
  expect(page.url()).toBe(before);
  const state = await page.evaluate(() => JSON.stringify(history.state));
  expect(JSON.parse(state).pupilCard).toBe(true);
  expect(state).not.toContain(body.id);
  expect(page.url()).not.toContain(body.id);
  await expect(page.locator('.pupil-register-table, .pupil-register-cards')).toHaveCount(0);
  for (const name of ['Basuppgifter', 'Skolplacering', 'Klasstillhörighet', 'Historik']) await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
  for (const name of ['Aktuell', 'Framtida', 'Avslutade', 'Tidigare klasser']) await expect(page.getByRole('heading', { level: 3, name, exact: true })).toBeVisible();
  if (body.birthDate) {
    await expect(page.getByText('de fyra sista siffrorna är dolda')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Visa personnummer' })).toBeVisible();
  }
  expect(revealCalls).toBe(0);
  await noOverflow(page);
  expect(await smallTargets(page, '.pupil-card button')).toEqual([]);
  await page.screenshot({ path: info.outputPath('elevkort.png'), fullPage: true });

  const historyWait = page.waitForResponse(response => isPath(response, '/api/elever/historik'));
  await page.getByRole('button', { name: 'Visa ändringshistorik' }).click();
  const historyResponse = await historyWait; expect(historyResponse.status()).toBe(200);
  expect(new URL(historyResponse.url()).searchParams.get('page')).toBe('1');
  await expect(page.locator('.pupil-history li').first().or(page.getByText('Inga ändringar ännu.'))).toBeVisible();
  await noOverflow(page);
  await page.getByRole('button', { name: 'Dölj ändringshistorik' }).click();
  await expect(page.locator('.pupil-history')).toHaveCount(0);

  await page.getByRole('button', { name: 'Tillbaka till elevlistan' }).click();
  await expect(page.locator('.pupil-card')).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(page.url()).toBe(before);

  await openCard(page);
  await page.goBack();
  await expect(page.locator('.pupil-card')).toHaveCount(0);
  await expect(button).toBeFocused();
  expect(revealCalls).toBe(0);
});

test('ändringsdialog: fältfel utan anrop, engångskod i dialogen och bevarad inmatning', async ({ page }, info) => {
  await login(page);
  const { body } = await openCard(page);
  test.skip(!body.capabilities.canEdit, 'Provdatan saknar redigerbar elev för p3.admin');
  let changeCalls = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/elever/andra') changeCalls += 1; });
  await page.getByRole('button', { name: 'Ändra basuppgifter' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Ändra basuppgifter' })).toBeVisible();
  const name = dialog.getByLabel('Namn', { exact: true });
  await expect(name).toHaveValue(body.displayName);
  await expect(dialog.getByLabel(/Nytt personnummer/u)).toHaveValue('');
  await settle(page);
  expect(await smallTargets(page, '.pupil-register-dialog button, .pupil-register-dialog input, .pupil-register-dialog select')).toEqual([]);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  await name.fill('');
  await dialog.getByRole('button', { name: 'Spara ändringarna' }).click();
  await expect(dialog.getByText('Formuläret innehåller fel. Rätta de markerade fälten.')).toBeVisible();
  await expect(dialog.getByText('Ange namn.')).toBeVisible();
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  expect(changeCalls).toBe(0);

  await name.fill(`${body.displayName} Prov`);
  const change = page.waitForResponse(response => isPath(response, '/api/elever/andra', 'POST'));
  await dialog.getByRole('button', { name: 'Spara ändringarna' }).click();
  const denied = await change;
  expect(denied.status(), 'Oväntat svar; ett 500 utan kod är det kända Worker-avbrottet i deferred-items').toBe(403);
  expect((await denied.json()).code).toBe('mfa_required');
  const request = denied.request().postDataJSON();
  expect(request).toMatchObject({ kind: 'basics', expectedVersion: body.version, payload: { displayName: `${body.displayName} Prov` } });
  await expect(dialog.getByText('Att ändra elevuppgifter kräver verifiering med engångskod.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Verifiera med engångskod' })).toBeVisible();
  await expect(name).toHaveValue(`${body.displayName} Prov`);
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath('andringsdialog-mfa.png'), fullPage: true });

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ändra basuppgifter' })).toBeFocused();

  await page.getByRole('button', { name: 'Avsluta placering' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Behåll placeringen' })).toBeFocused();
  await page.getByRole('dialog').getByRole('button', { name: 'Behåll placeringen' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const reveal = page.waitForResponse(response => isPath(response, '/api/elever/personnummer', 'POST'));
  await page.getByRole('button', { name: 'Visa personnummer' }).click();
  expect((await reveal).status()).toBe(403);
  await expect(page.getByText('Att visa personnummer kräver verifiering med engångskod.')).toBeVisible();
  expect(changeCalls).toBe(1);
});

test('export: serverns förhandsprövning ger antal, förval och engångskod med säker returadress', async ({ page }, info) => {
  const list = await login(page);
  test.skip(!list.capabilities.canExport || list.count === 0, 'Ingen exporträtt eller inga elever i urvalet');
  // Sökordet får aldrig följa med i returadressen till verifieringen.
  const secret = list.pupils[0].displayName.slice(0, 4);
  await page.getByLabel('Sökord', { exact: true }).fill(secret);
  const searched = page.waitForResponse(response => isPath(response, '/api/elever/lista', 'POST'));
  await page.getByRole('button', { name: 'Sök elever', exact: true }).click();
  expect((await searched).status()).toBe(200);
  await expect(page.locator('.pupil-register')).toHaveAttribute('aria-busy', 'false');
  const preview = page.waitForResponse(response => isPath(response, '/api/elever/export', 'POST'));
  await page.getByRole('button', { name: 'Exportera urval…' }).click();
  const previewResponse = await preview;
  expect(previewResponse.status()).toBe(200);
  const previewBody = await previewResponse.json();
  const sent = previewResponse.request().postDataJSON();
  expect(Object.keys(sent).sort()).toEqual(['export', 'mode']);
  expect(sent.mode).toBe('preview');
  expect(sent.export.mode).toBe('filter');
  expect(sent.export.search).toBe(secret);
  expect(sent.export.selection.page).toBe(1);
  expect(Object.keys(previewBody).sort()).toEqual(['count', 'fields', 'includePersonalNumber']);
  const dialog = page.getByRole('dialog');
  const label = previewBody.count === 1 ? 'Exportera 1 elev (CSV)' : `Exportera ${previewBody.count} elever (CSV)`;
  await expect(dialog.getByRole('button', { name: label })).toBeEnabled();
  await expect(dialog.getByLabel('Elev-ID')).toBeChecked();
  await expect(dialog.getByLabel('Namn', { exact: true })).toBeChecked();
  await expect(dialog.getByLabel('Födelsedatum')).not.toBeChecked();
  await expect(dialog.getByLabel('Ta med personnummer')).not.toBeChecked();
  await settle(page);
  expect(await smallTargets(page, '.pupil-register-dialog button, .pupil-register-dialog label')).toEqual([]);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  let exportCalls = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/elever/export') exportCalls += 1; });
  await dialog.getByLabel('Elev-ID').uncheck();
  await dialog.getByLabel('Namn', { exact: true }).uncheck();
  await dialog.getByRole('button', { name: label }).click();
  await expect(dialog.getByText('Välj minst en uppgift att exportera.')).toBeVisible();
  expect(exportCalls).toBe(0);
  await dialog.getByLabel('Elev-ID').check();

  const download = page.waitForResponse(response => isPath(response, '/api/elever/export', 'POST'));
  await dialog.getByRole('button', { name: label }).click();
  const downloadResponse = await download;
  expect(downloadResponse.status(), 'Oväntat svar; ett 500 utan kod är det kända Worker-avbrottet i deferred-items').toBe(403);
  expect(downloadResponse.request().postDataJSON()).toMatchObject({ mode: 'download', export: { fields: ['id'], includePersonalNumber: false, protectedIds: [] } });
  await expect(dialog.getByText('Export kräver verifiering med engångskod.')).toBeVisible();
  await page.screenshot({ path: info.outputPath('export-mfa.png'), fullPage: true });

  const stepUp = page.waitForRequest(request => new URL(request.url()).pathname === '/api/auth/login');
  await dialog.getByRole('button', { name: 'Verifiera med engångskod' }).click();
  const stepUpUrl = new URL((await stepUp).url());
  expect(stepUpUrl.searchParams.get('step_up')).toBe('1');
  const returnTo = stepUpUrl.searchParams.get('till') ?? '';
  expect(returnTo.startsWith('/?vy=elever&')).toBe(true);
  expect(returnTo).not.toContain(secret);
  expect(new URLSearchParams(returnTo.slice(2)).has('lasar')).toBe(true);
});
