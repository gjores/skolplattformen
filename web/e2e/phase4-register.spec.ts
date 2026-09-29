// Samlat fas 4-prov mot det isolerade, syntetiska protected-målet.
// Svar kommer från den verkliga lokala servern; ingen registerdata mockas.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Response } from '@playwright/test';
import { loginViaKeycloak, readPilotManifest, waitForHydration } from './helpers/keycloak.ts';
import { psql } from './helpers/pilot-db.ts';
import { PHASE4_IDS, PHASE4_USERS } from '../../work/pilot/phase4-browser-fixtures.mjs';

const verifyTarget = fileURLToPath(new URL('../../work/pilot/verify-target.mjs', import.meta.url));
let passwords: Record<string, string>;
let manifest: ReturnType<typeof readPilotManifest>;
const apiResponse = (response: Response, path: string, method = 'POST') =>
  new URL(response.url()).pathname === path && response.request().method() === method;

function guardedWrite(sql: string) {
  execFileSync(process.execPath, [verifyTarget, '--target', 'protected'], { stdio: 'pipe', timeout: 30_000 });
  return psql(manifest, sql);
}

function clonePupil(sourceId = PHASE4_IDS.namesakeA) {
  const id = randomUUID();
  const placementId = randomUUID();
  const label = `Syntetiskt 04-19 ${id.slice(0, 8)}`;
  expect(Number(psql(manifest, `select count(*) from public.pupil_placements where pupil_id='${sourceId}';`))).toBe(1);
  guardedWrite(`begin;
    insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,protected_identity,anonymous_name)
      select '${id}',p.customer_id,p.organizer_id,'${label}',s.personal_number,false,'Provperson'
      from public.pupils p cross join lateral
        (select personal_number from public.synthetic_pupil_numbers n where not exists
          (select 1 from public.pupils q where q.customer_id=p.customer_id and q.personal_number=n.personal_number)
          order by personal_number limit 1) s where p.id='${sourceId}';
    insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on,ends_on)
      select '${placementId}',customer_id,organizer_id,'${id}',unit_id,offering_id,starts_on,ends_on
      from public.pupil_placements where pupil_id='${sourceId}';
    insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on,ends_on)
      select gen_random_uuid(),customer_id,organizer_id,'${id}',unit_id,class_id,'${placementId}',starts_on,ends_on
      from public.pupil_class_memberships where pupil_id='${sourceId}';
    insert into public.pupil_home_municipalities(id,customer_id,organizer_id,pupil_id,municipality_code,starts_on,ends_on)
      select gen_random_uuid(),customer_id,organizer_id,'${id}',municipality_code,starts_on,ends_on
      from public.pupil_home_municipalities where pupil_id='${sourceId}';
    commit;`);
  return { id, label };
}

function removeClone(id: string) {
  guardedWrite(`begin;
    do $$ begin if not exists (select 1 from public.pupils where id='${id}' and customer_id='${PHASE4_IDS.customer}' and display_name like 'Syntetiskt 04-19%') then
      raise exception 'Provmarkör saknas'; end if; end $$;
    set local session_replication_role=replica;
    delete from public.pupil_source_values where pupil_id='${id}';
    delete from public.pupil_field_history where pupil_id='${id}';
    delete from public.pupil_field_state where pupil_id='${id}';
    delete from public.pupil_home_municipalities where pupil_id='${id}';
    delete from public.pupil_class_memberships where pupil_id='${id}';
    delete from public.pupil_placements where pupil_id='${id}';
    delete from public.pupils where id='${id}' and customer_id='${PHASE4_IDS.customer}';
    commit;`);
}

test.beforeAll(() => {
  process.env.PGCONNECT_TIMEOUT = '10';
  execFileSync(process.execPath, [verifyTarget, '--target', 'protected', '--with-idp'], { stdio: 'pipe', timeout: 30_000 });
  manifest = readPilotManifest();
  const root = fileURLToPath(new URL('../../work/pilot/targets/protected/idp/', import.meta.url));
  passwords = {
    ...JSON.parse(readFileSync(`${root}phase3-users.json`, 'utf8')),
    ...JSON.parse(readFileSync(`${root}phase4-users.json`, 'utf8')),
  };
});

async function login(page: Page, user: string = PHASE4_USERS.protectedAdmin) {
  const list = page.waitForResponse(response => apiResponse(response, '/api/elever/lista'));
  const steps = await loginViaKeycloak(page, user, { password: passwords[user] });
  await waitForHydration(page);
  expect((await list).status()).toBe(200);
  await expect(page.locator('.pupil-register')).toHaveAttribute('aria-busy', 'false');
  return steps;
}

async function search(page: Page, value: string) {
  await expect(page.locator('.pupil-register')).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('Sökord', { exact: true }).fill(value);
  const wait = page.waitForResponse(response => apiResponse(response, '/api/elever/lista'));
  await page.getByRole('button', { name: 'Sök elever', exact: true }).click();
  const response = await wait;
  expect(response.status()).toBe(200);
  await expect(page.locator('.pupil-register')).toHaveAttribute('aria-busy', 'false');
  return response.json();
}

async function openCard(page: Page, name: string, index = 0) {
  const wait = page.waitForResponse(response => apiResponse(response, '/api/elever/elev', 'GET'));
  await page.getByRole('button', { name: `${name}, öppna elevkortet`, exact: true }).filter({ visible: true }).nth(index).click();
  const response = await wait;
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const card = await response.json();
  expect(card).not.toHaveProperty('personalNumber');
  await expect(page.locator('.pupil-card h1')).toBeFocused();
  return card;
}

async function noLeakInStorage(page: Page, values: string[]) {
  const state = await page.evaluate(() => JSON.stringify({ url: location.href, history: history.state, local: Object.entries(localStorage), session: Object.entries(sessionStorage) }));
  for (const value of values) expect(state).not.toContain(value);
}

async function noLeakInDom(page: Page, value: string) {
  const found = await page.locator('body').evaluate((root, forbidden) => {
    if ((root.textContent ?? '').includes(forbidden)) return 'text';
    for (const element of [root, ...root.querySelectorAll('*')]) {
      for (const attribute of element.attributes) {
        if ((attribute.name === 'title' || attribute.name.startsWith('aria-') || attribute.name.startsWith('data-')) && attribute.value.includes(forbidden)) return attribute.name;
      }
    }
    return null;
  }, value);
  expect(found).toBeNull();
}

async function responsive(page: Page, info: { outputPath: (name: string) => string }, label: string) {
  const dialog = page.getByRole('dialog');
  if (await dialog.isVisible().catch(() => false)) await dialog.evaluate(element => Promise.all(element.getAnimations({ subtree: true })
    .filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished)));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'sidledsrullning').toBe(true);
  const small = await page.locator('.pupil-register button, .pupil-register input:not([type=checkbox]):not([type=radio]), .pupil-register select, .pupil-register-dialog button, .pupil-register-dialog .mandate-check').evaluateAll(elements => elements.filter(element => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
  }).map(element => `${element.tagName.toLowerCase()}:${element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 50) ?? ''}`));
  expect(small, 'pekytor under 44 px').toEqual([]);
  await page.screenshot({ path: info.outputPath(`${label}.png`), fullPage: true });
}

test('namnlika elever hittas igen efter utloggning utan sökord i adress eller lagring', async ({ page, browser, baseURL }, info) => {
  const steps = await login(page);
  expect(steps.some(step => step === 'otp' || step === 'enroll')).toBe(true);
  const found = await search(page, 'Alex Prov');
  expect(found.count).toBe(2);
  expect(new Set(found.pupils.map((p: { id: string }) => p.id))).toEqual(new Set([PHASE4_IDS.namesakeA, PHASE4_IDS.namesakeB]));
  await noLeakInStorage(page, ['Alex Prov', PHASE4_IDS.namesakeA]);
  const first = await openCard(page, found.pupils[0].displayName);
  expect([PHASE4_IDS.namesakeA, PHASE4_IDS.namesakeB]).toContain(first.id);
  for (const heading of ['Basuppgifter', 'Skolplacering', 'Klasstillhörighet', 'Historik'])
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await responsive(page, info, 'elevkort');
  await page.getByRole('button', { name: 'Tillbaka till elevlistan' }).click();
  await expect(page.getByRole('button', { name: `${found.pupils[0].displayName}, öppna elevkortet`, exact: true }).filter({ visible: true }).first()).toBeFocused();
  const second = await openCard(page, found.pupils[1].displayName, 1);
  expect(second.id).not.toBe(first.id);
  await page.context().close();
  const fresh = await browser.newContext({ baseURL, locale: 'sv-SE' });
  try {
    const reopened = await fresh.newPage();
    await login(reopened);
    const again = await search(reopened, 'Alex Prov');
    expect(new Set(again.pupils.map((p: { id: string }) => p.id))).toEqual(new Set([first.id, second.id]));
    await noLeakInStorage(reopened, ['Alex Prov', first.id, second.id]);
  } finally { await fresh.close(); }
});

test('elevkort visar perioder, ursprung och historik utan oombedd personnummerläsning', async ({ page }, info) => {
  let revealRequests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/elever/personnummer') revealRequests++; });
  await login(page);
  const found = await search(page, 'Alex Prov');
  const card = await openCard(page, found.pupils[0].displayName);
  expect(card.placements.length).toBeGreaterThan(0);
  expect(card.classes.length).toBeGreaterThan(0);
  await expect(page.getByRole('heading', { name: 'Aktuell', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tidigare klasser', exact: true })).toBeVisible();
  const history = page.waitForResponse(response => apiResponse(response, '/api/elever/historik', 'GET'));
  await page.getByRole('button', { name: 'Visa ändringshistorik' }).click();
  expect((await history).status()).toBe(200);
  expect(revealRequests).toBe(0);
  await responsive(page, info, 'perioder-och-historik');
  await page.getByRole('button', { name: 'Dölj ändringshistorik' }).click();
  const municipality = await searchFromCard(page, 'Källa Provperson');
  expect(municipality.pupils.some((p: { id: string }) => p.id === PHASE4_IDS.municipalitySource)).toBe(true);
  const source = await openCard(page, municipality.pupils.find((p: { id: string }) => p.id === PHASE4_IDS.municipalitySource).displayName);
  expect(source.origins).toBeTruthy();
  await expect(page.getByText(/Källa:/u).first()).toBeVisible();
  expect(revealRequests).toBe(0);
});

async function searchFromCard(page: Page, term: string) {
  await page.getByRole('button', { name: 'Tillbaka till elevlistan' }).click();
  return search(page, term);
}

test('personnummer kräver aktivt val och rensas när elevkortet stängs', async ({ page }, info) => {
  await login(page);
  const found = await search(page, 'Alex Prov');
  const card = await openCard(page, found.pupils[0].displayName);
  const before = psql(manifest, `select count(*) from public.security_events where action='pupil_personal_number_read' and object_id='${card.id}';`);
  const reveal = page.waitForResponse(response => apiResponse(response, '/api/elever/personnummer'));
  await page.getByRole('button', { name: 'Visa personnummer' }).click();
  const response = await reveal;
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.personalNumber).toMatch(/^TEST-/u);
  await expect(page.getByRole('button', { name: 'Dölj personnummer' })).toBeVisible();
  await responsive(page, info, 'uttrycklig-visning');
  await page.getByRole('button', { name: 'Dölj personnummer' }).click();
  expect(await page.locator('body').innerText()).not.toContain(body.personalNumber);
  await page.getByRole('button', { name: 'Tillbaka till elevlistan' }).click();
  expect(await page.locator('body').innerText()).not.toContain(body.personalNumber);
  await noLeakInStorage(page, [body.personalNumber]);
  const after = psql(manifest, `select count(*) from public.security_events where action='pupil_personal_number_read' and object_id='${card.id}';`);
  expect(Number(after)).toBeGreaterThan(Number(before));
});

test('export kräver uttryckliga val och ger nedladdning samt säkerhetslogg', async ({ page }, info) => {
  await login(page);
  const found = await search(page, 'Alex Prov');
  const before = Number(psql(manifest, "select count(*) from public.security_events where action='pupil_exported';"));
  const preview = page.waitForResponse(response => apiResponse(response, '/api/elever/export'));
  await page.getByRole('button', { name: 'Exportera urval…' }).click();
  const response = await preview;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toMatchObject({ mode: 'preview', export: { search: 'Alex Prov' } });
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Ta med personnummer')).not.toBeChecked();
  await expect(dialog.getByLabel('Namn', { exact: true })).toBeChecked();
  await responsive(page, info, 'exportdialog');
  const [download, saved] = await Promise.all([
    page.waitForEvent('download'),
    page.waitForResponse(candidate => apiResponse(candidate, '/api/elever/export') && candidate.request().postDataJSON()?.mode === 'download'),
    dialog.getByRole('button', { name: `Exportera ${found.count} elever (CSV)` }).click(),
  ]);
  expect(saved.status()).toBe(200);
  expect(download.suggestedFilename()).toMatch(/\.csv$/u);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8').split(/\r?\n/u).filter(Boolean)).toHaveLength(found.count + 1);
  expect(Number(psql(manifest, "select count(*) from public.security_events where action='pupil_exported';"))).toBeGreaterThan(before);
});

test('telefonbredd 390 och 320 visar lista, kort och dialog utan sidledsrullning', async ({ page }, info) => {
  await login(page);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 740 });
    const found = await search(page, 'Alex Prov');
    if (test.info().project.name !== 'protected-phone') {
      await page.getByLabel('Sökord', { exact: true }).focus();
      const submit = page.getByRole('button', { name: 'Sök elever', exact: true });
      for (let tab = 0; tab < 6 && !(await submit.evaluate(element => document.activeElement === element)); tab++) await page.keyboard.press('Tab');
      await expect(submit).toBeFocused();
      const focusStyle = await page.evaluate(() => {
        const css = getComputedStyle(document.activeElement!);
        return { outline: css.outlineStyle, shadow: css.boxShadow };
      });
      expect(focusStyle.outline !== 'none' || focusStyle.shadow !== 'none').toBe(true);
    } else {
      await page.getByRole('button', { name: 'Sök elever', exact: true }).focus();
      await expect(page.getByRole('button', { name: 'Sök elever', exact: true })).toBeFocused();
    }
    await responsive(page, info, `lista-${width}`);
    await openCard(page, found.pupils[0].displayName);
    await responsive(page, info, `kort-${width}`);
    await page.getByRole('button', { name: 'Ändra basuppgifter' }).click();
    await expect(page.getByRole('dialog').getByLabel('Namn', { exact: true })).toBeVisible();
    await responsive(page, info, `dialog-${width}`);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Ändra basuppgifter' })).toBeFocused();
    await page.getByRole('button', { name: 'Tillbaka till elevlistan' }).click();
  }
});

test('huvudmannens beviljande och återkallelse styr skyddad vy och anonym rad', async ({ page, browser, baseURL }, info) => {
  const hmContext = await browser.newContext({ baseURL, locale: 'sv-SE' });
  const hm = await hmContext.newPage();
  const trueName = psql(manifest, `select display_name from public.pupils where id='${PHASE4_IDS.protected}' and customer_id='${PHASE4_IDS.customer}';`);
  const origin = new URL(baseURL!).origin;
  let original: string | null = null;
  let permission: string | null = null;
  let assignment: string | null = null;
  try {
    await loginViaKeycloak(hm, PHASE4_USERS.organizer, { password: passwords[PHASE4_USERS.organizer] });
    await loginViaKeycloak(hm, PHASE4_USERS.organizer, { password: passwords[PHASE4_USERS.organizer], stepUp: true });
    await waitForHydration(hm);
    const rights = await hm.request.get('/api/kund/skyddsbehorighet');
    expect(rights.status()).toBe(200);
    const row = (await rights.json()).permissions.find((item: { displayName: string; unitId: string }) => item.displayName === 'Alva Skoladmin' && item.unitId === PHASE4_IDS.unit);
    expect(row).toBeTruthy();
    assignment = row.assignmentId;
    original = row.permissionId;
    permission = original;
    const change = (data: object) => hm.request.post('/api/kund/skyddsbehorighet', { data, headers: { Origin: origin } });
    if (!permission) {
      const initial = await change({ action: 'grant', assignmentId: assignment, unitId: PHASE4_IDS.unit });
      const initialBody = await initial.json();
      expect(initial.status(), JSON.stringify({ error: initialBody.error })).toBe(201);
      permission = initialBody.permissionId;
    }
    if (permission) {
      expect((await change({ action: 'revoke', permissionId: permission })).status()).toBe(200);
      permission = null;
    }
    const first = page.waitForResponse(response => apiResponse(response, '/api/elever/lista'));
    await login(page, PHASE4_USERS.unprotectedAdmin);
    const plain = await (await first).json();
    expect(plain.capabilities.canReadProtected).toBe(false);
    expect(plain).not.toHaveProperty('protectedIds');
    const anonymous = plain.pupils.find((item: { id: string }) => item.id === PHASE4_IDS.protected);
    expect(anonymous).toBeTruthy();
    expect(anonymous.displayName).not.toBe(trueName);
    expect(anonymous).not.toHaveProperty('birthDate');
    await expect(page.getByText(trueName, { exact: true })).toHaveCount(0);
    await noLeakInDom(page, trueName);
    const searched = await search(page, trueName);
    expect(searched.pupils.some((item: { id: string }) => item.id === PHASE4_IDS.protected)).toBe(false);
    expect(JSON.stringify(searched)).not.toContain(trueName);
    await noLeakInDom(page, trueName);
    await noLeakInStorage(page, [trueName]);
    await responsive(page, info, 'anonym-skyddad-lista');
    const granted = await change({ action: 'grant', assignmentId: assignment, unitId: PHASE4_IDS.unit });
    const grantedBody = await granted.json();
    expect(granted.status(), JSON.stringify({ original: Boolean(original), error: grantedBody.error })).toBe(201);
    permission = grantedBody.permissionId;
    const visible = await search(page, trueName);
    expect(visible.pupils.some((item: { id: string; protectedIdentity?: boolean }) => item.id === PHASE4_IDS.protected && item.protectedIdentity === true)).toBe(true);
    expect(visible.protectedIds).toContain(PHASE4_IDS.protected);
    expect((await change({ action: 'revoke', permissionId: permission })).status()).toBe(200);
    permission = null;
    const hidden = await search(page, trueName);
    expect(hidden.pupils.some((item: { id: string }) => item.id === PHASE4_IDS.protected)).toBe(false);
  } finally {
    const change = (data: object) => hm.request.post('/api/kund/skyddsbehorighet', { data, headers: { Origin: origin } });
    if (permission && !original) expect((await change({ action: 'revoke', permissionId: permission })).status()).toBe(200);
    if (!permission && original && assignment) expect((await change({ action: 'grant', assignmentId: assignment, unitId: PHASE4_IDS.unit })).status()).toBe(201);
    await hmContext.close();
  }
});

test('lokal rättelse möter simulerad källa och båda explicita val loggas', async ({ page }, info) => {
  const first = clonePupil();
  const second = clonePupil();
  try {
    await login(page);
    for (const [clone, choice] of [[first, 'source'], [second, 'local']] as const) {
      const found = await search(page, 'Syntetiskt');
      expect(found.pupils.some((item: { id: string }) => item.id === clone.id)).toBe(true);
      await openCard(page, clone.label);
      await page.getByRole('button', { name: 'Ändra basuppgifter' }).click();
      const localName = `${clone.label} lokal`;
      await page.getByRole('dialog').getByLabel('Namn', { exact: true }).fill(localName);
      const change = page.waitForResponse(response => apiResponse(response, '/api/elever/andra'));
      await page.getByRole('dialog').getByRole('button', { name: 'Spara ändringarna' }).click();
      expect((await change).status()).toBe(200);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      expect(psql(manifest, `select display_name from public.pupils where id='${clone.id}';`)).toBe(localName);
      const incoming = `${clone.label} källa`;
      guardedWrite(`select public.phase4_simulated_source_deliver(jsonb_build_object('pupilId','${clone.id}'::uuid,'field','displayName','value','${incoming}'));`);
      await page.getByRole('button', { name: 'Tillbaka till elevlistan' }).click();
      const again = await search(page, 'Syntetiskt');
      await openCard(page, again.pupils.find((item: { id: string }) => item.id === clone.id).displayName);
      await expect(page.getByRole('heading', { name: 'Avvikelse från källan: Namn' })).toBeVisible();
      await responsive(page, info, `kallavvikelse-${choice}`);
      const saved = page.waitForResponse(response => apiResponse(response, '/api/elever/andra'));
      await page.getByRole('button', { name: choice === 'source' ? 'Använd källans värde' : 'Behåll lokal rättelse' }).click();
      expect((await saved).status()).toBe(200);
      await expect(page.getByRole('heading', { name: 'Avvikelse från källan: Namn' })).toHaveCount(0);
      expect(psql(manifest, `select display_name from public.pupils where id='${clone.id}';`)).toBe(choice === 'source' ? incoming : localName);
      expect(psql(manifest, `select resolution from public.pupil_source_values where pupil_id='${clone.id}' and resolved_at is not null order by changed_at desc limit 1;`)).toBe(choice);
      expect(Number(psql(manifest, `select count(*) from public.security_events where object_id='${clone.id}' and action='pupil_source_resolved' and outcome='ok';`))).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Tillbaka till elevlistan' }).click();
    }
  } finally {
    removeClone(first.id);
    removeClone(second.id);
  }
});

test('klass, utbildning och hemkommun får varsin period och ursprung', async ({ page }, info) => {
  const clone = clonePupil();
  const today = psql(manifest, 'select public.app_today()::text;');
  const next = new Date(`${today}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const startsOn = next.toISOString().slice(0, 10);
  try {
    await login(page);
    const found = await search(page, 'Syntetiskt');
    await openCard(page, found.pupils.find((item: { id: string }) => item.id === clone.id).displayName);
    const before = Number(psql(manifest, `select count(*) from public.pupil_field_history where pupil_id='${clone.id}';`));
    await page.getByRole('button', { name: 'Byt klass' }).click();
    const classDialog = page.getByRole('dialog');
    await classDialog.getByLabel('Ny klass').selectOption(PHASE4_IDS.classB);
    await classDialog.getByLabel('Gäller från').fill(startsOn);
    await responsive(page, info, 'klassbyte');
    const classSave = page.waitForResponse(response => apiResponse(response, '/api/elever/andra'));
    await classDialog.getByRole('button', { name: 'Spara klassbytet' }).click();
    expect((await classSave).status()).toBe(200);
    await expect(classDialog).toHaveCount(0);
    expect(psql(manifest, `select class_id::text from public.pupil_class_memberships where pupil_id='${clone.id}' and starts_on='${startsOn}' order by starts_on desc limit 1;`)).toBe(PHASE4_IDS.classB);
    await page.getByRole('button', { name: 'Byt utbildning' }).click();
    const educationDialog = page.getByRole('dialog');
    const choices = await educationDialog.getByLabel('Ny utbildning').locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value).filter(Boolean));
    expect(choices.length).toBeGreaterThan(0);
    await educationDialog.getByLabel('Ny utbildning').selectOption(choices[0]);
    await educationDialog.getByLabel('Gäller från').fill(startsOn);
    const educationSave = page.waitForResponse(response => apiResponse(response, '/api/elever/andra'));
    await educationDialog.getByRole('button', { name: 'Spara utbildningsbytet' }).click();
    expect((await educationSave).status()).toBe(200);
    await expect(educationDialog).toHaveCount(0);
    expect(psql(manifest, `select offering_id::text from public.pupil_placements where pupil_id='${clone.id}' and starts_on='${startsOn}' limit 1;`)).toBe(choices[0]);
    await page.getByRole('button', { name: 'Registrera ny hemkommun' }).click();
    const municipalityDialog = page.getByRole('dialog');
    await municipalityDialog.getByLabel('Kommunkod').fill('0180');
    await municipalityDialog.getByLabel('Gäller från').fill(startsOn);
    const municipalitySave = page.waitForResponse(response => apiResponse(response, '/api/elever/andra'));
    await municipalityDialog.getByRole('button', { name: 'Spara hemkommunen' }).click();
    expect((await municipalitySave).status()).toBe(200);
    await expect(municipalityDialog).toHaveCount(0);
    expect(psql(manifest, `select municipality_code from public.pupil_home_municipalities where pupil_id='${clone.id}' and starts_on='${startsOn}' limit 1;`)).toBe('0180');
    const after = Number(psql(manifest, `select count(*) from public.pupil_field_history where pupil_id='${clone.id}';`));
    expect(after).toBeGreaterThanOrEqual(before + 3);
  } finally { removeClone(clone.id); }
});

test('avslutad historisk placering kan läsas men inte ändras', async ({ page }, info) => {
  await login(page);
  const name = psql(manifest, `select display_name from public.pupils where id='${PHASE4_IDS.ended}';`);
  const found = await search(page, name);
  const row = found.pupils.find((item: { id: string }) => item.id === PHASE4_IDS.ended);
  expect(row).toBeTruthy();
  expect(row.status).toBe('avslutad');
  const card = await openCard(page, name);
  expect(card.id).toBe(PHASE4_IDS.ended);
  await expect(page.getByRole('heading', { name: 'Avslutade' })).toBeVisible();
  for (const action of ['Ändra basuppgifter', 'Byt klass', 'Byt utbildning', 'Registrera ny hemkommun', 'Avsluta placering'])
    await expect(page.getByRole('button', { name: action, exact: true })).toHaveCount(0);
  await responsive(page, info, 'historiskt-laslage');
});

test('två administratörer löser fältkonflikt och hämtar om periodkonflikt', async ({ page, browser, baseURL }, info) => {
  const clone = clonePupil();
  const secondContext = await browser.newContext({ baseURL, locale: 'sv-SE' });
  const second = await secondContext.newPage();
  try {
    await login(page);
    const secondSteps = await login(second, PHASE4_USERS.concurrentAdmin);
    if (secondSteps.includes('enroll')) await login(second, PHASE4_USERS.concurrentAdmin);
    for (const current of [page, second]) {
      const found = await search(current, 'Syntetiskt');
      await openCard(current, found.pupils.find((item: { id: string }) => item.id === clone.id).displayName);
      await current.getByRole('button', { name: 'Ändra basuppgifter' }).click();
    }
    await page.getByRole('dialog').getByLabel('Namn', { exact: true }).fill(`${clone.label} ett`);
    await second.getByRole('dialog').getByLabel('Namn', { exact: true }).fill(`${clone.label} tva`);
    const secondSave = second.waitForResponse(response => apiResponse(response, '/api/elever/andra'));
    await second.getByRole('dialog').getByRole('button', { name: 'Spara ändringarna' }).click();
    expect((await secondSave).status()).toBe(200);
    const firstSave = page.waitForResponse(response => apiResponse(response, '/api/elever/andra'));
    await page.getByRole('dialog').getByRole('button', { name: 'Spara ändringarna' }).click();
    expect((await firstSave).status()).toBe(409);
    const conflict = page.getByRole('dialog');
    await expect(conflict.getByRole('heading', { name: 'Välj värde per uppgift' })).toBeFocused();
    await expect(conflict.getByText(`${clone.label} ett`)).toBeVisible();
    await expect(conflict.getByText(`${clone.label} tva`)).toBeVisible();
    await responsive(page, info, 'faltkonflikt');
    await conflict.getByRole('radio', { name: /Ditt värde/u }).check();
    const resolved = page.waitForResponse(response => apiResponse(response, '/api/elever/andra'));
    await conflict.getByRole('button', { name: 'Spara valda värden' }).click();
    expect((await resolved).status()).toBe(200);
    expect(psql(manifest, `select display_name from public.pupils where id='${clone.id}';`)).toBe(`${clone.label} ett`);
    for (const current of [page, second]) {
      await current.getByRole('button', { name: 'Tillbaka till elevlistan' }).click();
      const found = await search(current, 'Syntetiskt');
      await openCard(current, found.pupils.find((item: { id: string }) => item.id === clone.id).displayName);
      await current.getByRole('button', { name: 'Registrera ny hemkommun' }).click();
    }
    const today = psql(manifest, 'select public.app_today()::text;');
    const next = new Date(`${today}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    const startsOn = next.toISOString().slice(0, 10);
    for (const [current, code] of [[page, '0180'], [second, '1480']] as const) {
      await current.getByRole('dialog').getByLabel('Kommunkod').fill(code);
      await current.getByRole('dialog').getByLabel('Gäller från').fill(startsOn);
    }
    const periodSaved = second.waitForResponse(response => apiResponse(response, '/api/elever/andra'));
    await second.getByRole('dialog').getByRole('button', { name: 'Spara hemkommunen' }).click();
    expect((await periodSaved).status()).toBe(200);
    const periodConflict = page.waitForResponse(response => apiResponse(response, '/api/elever/andra'));
    await page.getByRole('dialog').getByRole('button', { name: 'Spara hemkommunen' }).click();
    expect((await periodConflict).status()).toBe(409);
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Hämta aktuellt läge' })).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel('Kommunkod')).toHaveValue('0180');
    await responsive(page, info, 'periodkonflikt');
    await page.getByRole('dialog').getByRole('button', { name: 'Hämta aktuellt läge' }).click();
    await expect(page.getByRole('dialog').getByLabel('Kommunkod')).toHaveValue('0180');
    expect(psql(manifest, `select municipality_code from public.pupil_home_municipalities where pupil_id='${clone.id}' and starts_on='${startsOn}' limit 1;`)).toBe('1480');
  } finally {
    await secondContext.close();
    removeClone(clone.id);
  }
});

test('loggfel stoppar ändring och bevarar inmatning för nytt försök', async ({ page }, info) => {
  const clone = clonePupil();
  let injected = false;
  try {
    await login(page);
    const found = await search(page, 'Syntetiskt');
    await openCard(page, found.pupils.find((item: { id: string }) => item.id === clone.id).displayName);
    await page.getByRole('button', { name: 'Ändra basuppgifter' }).click();
    const dialog = page.getByRole('dialog');
    const changed = `${clone.label} nytt`;
    await dialog.getByLabel('Namn', { exact: true }).fill(changed);
    guardedWrite(`create function public.phase4_19_fail_audit() returns trigger language plpgsql as $$ begin
      if new.action='pupil_updated' and new.object_id='${clone.id}'::uuid and new.outcome='ok' then raise exception 'Synthetic audit failure'; end if;
      return new; end $$;
      create trigger phase4_19_fail_audit before insert on public.security_events for each row execute function public.phase4_19_fail_audit();`);
    injected = true;
    const denied = page.waitForResponse(response => apiResponse(response, '/api/elever/andra'));
    await dialog.getByRole('button', { name: 'Spara ändringarna' }).click();
    const failed = await denied;
    expect(failed.status()).toBe(500);
    expect((await failed.json()).code).toBe('audit_unavailable');
    await expect(dialog.getByRole('alert')).toContainText('säkerhetsloggen inte är tillgänglig');
    await expect(dialog.getByLabel('Namn', { exact: true })).toHaveValue(changed);
    await responsive(page, info, 'loggfel');
    expect(psql(manifest, `select display_name from public.pupils where id='${clone.id}';`)).toBe(clone.label);
    guardedWrite('drop trigger if exists phase4_19_fail_audit on public.security_events; drop function if exists public.phase4_19_fail_audit();');
    injected = false;
    const retry = page.waitForResponse(response => apiResponse(response, '/api/elever/andra'));
    await dialog.getByRole('button', { name: 'Spara ändringarna' }).click();
    expect((await retry).status()).toBe(200);
    expect(psql(manifest, `select display_name from public.pupils where id='${clone.id}';`)).toBe(changed);
  } finally {
    if (injected) guardedWrite('drop trigger if exists phase4_19_fail_audit on public.security_events; drop function if exists public.phase4_19_fail_audit();');
    removeClone(clone.id);
  }
});

test('sena exportsvar efter utloggning i annan flik skapar ingen fil eller Blob', async ({ page }, info) => {
  await login(page);
  await search(page, 'Alex Prov');
  await page.getByRole('button', { name: 'Exportera urval…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Exportera 2 elever (CSV)' })).toBeEnabled({ timeout: 30_000 });
  await page.evaluate(() => {
    (window as typeof window & { __phase4Blobs?: number }).__phase4Blobs = 0;
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (value) => {
      (window as typeof window & { __phase4Blobs?: number }).__phase4Blobs!++;
      return original(value);
    };
  });
  let release!: () => void;
  let fetched!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { fetched = resolve; });
  let downloads = 0;
  page.on('download', () => { downloads++; });
  await page.route('**/api/elever/export', async route => {
    if (route.request().postDataJSON()?.mode !== 'download') return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    fetched();
    await held;
    await route.fulfill({ response });
  });
  const click = dialog.getByRole('button', { name: 'Exportera 2 elever (CSV)' }).click();
  try {
    await ready;
    const other = await page.context().newPage();
    await other.goto('/'); await waitForHydration(other);
    const logout = other.waitForResponse(response => apiResponse(response, '/api/auth/logout'));
    await other.getByRole('button', { name: 'Logga ut' }).click();
    expect((await logout).status()).toBe(200);
    await expect(page.getByRole('alertdialog')).toContainText('Du har loggats ut i en annan flik');
    await expect(page.locator('.pupil-register')).toHaveCount(0);
    await responsive(page, info, 'flerflikslas');
    release();
    await click;
    await page.waitForTimeout(300);
    expect(downloads).toBe(0);
    expect(await page.evaluate(() => (window as typeof window & { __phase4Blobs?: number }).__phase4Blobs)).toBe(0);
    await other.close();
  } finally {
    release();
    await page.unroute('**/api/elever/export');
  }
});

test('fördröjt 409-svar återför inte elevfält efter flerflikslås', async ({ page, browser, baseURL }, info) => {
  const clone = clonePupil();
  const secondContext = await browser.newContext({ baseURL, locale: 'sv-SE' });
  const second = await secondContext.newPage();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let fetched!: () => void;
  const ready = new Promise<void>(resolve => { fetched = resolve; });
  try {
    await login(page);
    await login(second, PHASE4_USERS.concurrentAdmin);
    for (const current of [page, second]) {
      const list = await search(current, 'Syntetiskt');
      await openCard(current, list.pupils.find((item: { id: string }) => item.id === clone.id).displayName);
      await current.getByRole('button', { name: 'Ändra basuppgifter' }).click();
    }
    await page.getByRole('dialog').getByLabel('Namn', { exact: true }).fill(`${clone.label} lokalt`);
    await second.getByRole('dialog').getByLabel('Namn', { exact: true }).fill(`${clone.label} sparat`);
    const saved = second.waitForResponse(response => apiResponse(response, '/api/elever/andra'));
    await second.getByRole('dialog').getByRole('button', { name: 'Spara ändringarna' }).click();
    expect((await saved).status()).toBe(200);
    await page.route('**/api/elever/andra', async route => {
      const response = await route.fetch();
      expect(response.status()).toBe(409);
      fetched();
      await held;
      await route.fulfill({ response });
    });
    const click = page.getByRole('dialog').getByRole('button', { name: 'Spara ändringarna' }).click();
    await ready;
    const other = await page.context().newPage();
    await other.goto('/'); await waitForHydration(other);
    const logout = other.waitForResponse(response => apiResponse(response, '/api/auth/logout'));
    await other.getByRole('button', { name: 'Logga ut' }).click();
    expect((await logout).status()).toBe(200);
    await expect(page.getByRole('alertdialog')).toContainText('Du har loggats ut i en annan flik');
    release();
    await click;
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toContain(clone.label);
    expect(await page.locator('body').innerText()).not.toContain(`${clone.label} sparat`);
    await responsive(page, info, 'sent-409-lasskarm');
    await other.close();
  } finally {
    release();
    try { await page.unroute('**/api/elever/andra'); } catch { /* sidan kan vara stängd efter test-timeout */ }
    try { await secondContext.close(); } finally { removeClone(clone.id); }
  }
});
