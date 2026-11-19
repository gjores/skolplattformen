// Användarens TMI-fynd: riktiga följkomponenter, syntetiskt valblock och uttryckligt simulerade rutter.
import { test, expect, type Page } from './schema-test';
import raw from './schema-fixture';
import following from './fixtures/schema-folj.json' with { type: 'json' };
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag } from '../lib/schema-contract.ts';
import { samlingResurser, type SamlingResurs } from '../lib/schema-samling.ts';

const headers = { 'X-Context-Epoch': '1' }, URL = '/e2e/fixtures/schema-preview.html';
const amnen = 'Spanska · Moderna språk – fortsättning – Nivå 1, Franska · Moderna språk – fördjupning – Nivå 1, Franska · Moderna språk – fördjupning – Nivå 2, Moderna språk – fördjupning – nivå 2, franska';
const blockTitel = `Valbart block: ${amnen}`;

async function setup(page: Page, block: boolean, compare?: 'success' | 'retry') {
  const f = { ...structuredClone(raw), contractVersion: SCHEMA_CONTRACT_VERSION } as unknown as SchemaForslag;
  const lesson = f.lessons.find(l => l.id === following.lesson)!;
  const annatPass = f.lessons.find(l => l.id === 'pass-49')!;
  const sal = 'Matsalen';
  const lagen: unknown[] = [];
  const lasningar: unknown[] = [];
  if (block) { lesson.title = blockTitel; lesson.durationMin = 80; lesson.teacherIds = f.teachers.slice(0, 3).map(t => t.id); }
  if (compare) {
    f.rooms = [{ id: 'sal-1', name: sal }];
    annatPass.roomId = 'sal-1';
    annatPass.roomIds = ['sal-1'];
    const resurser = samlingResurser(f);
    const extraGrupp: SamlingResurs = { ...resurser.find(r => r.name === 'Franska')!, lessons: ['pass-585', 'pass-586', 'pass-587', 'pass-588'] };
    const deladGrupp: SamlingResurs = { ...extraGrupp, key: `grupp:${f.resurser.grupp[0].ref}`, id: 'grupp-13', name: 'Spanska', lessons: ['pass-577'] };
    const elev: SamlingResurs = { ...extraGrupp, key: 'elev:1', id: 'elev-1', slag: 'elev', name: 'Provelev Jämförelse' };
    await page.route('**/api/schema/samling', route => {
      lasningar.push(route.request().postDataJSON());
      if (compare === 'retry' && lasningar.length === 1) return route.fulfill({ headers, status: 503, json: { code: 'unavailable' } });
      return route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint,
        resources: [...resurser.filter(r => r.slag !== 'grupp'), extraGrupp, deladGrupp, elev], clusters: [] } });
    });
  }
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => route.fulfill({ headers, json: { ...f, villkor: route.request().postDataJSON().villkor } }));
  await page.route('**/api/schema/folj', route => {
    const { lesson: id } = route.request().postDataJSON();
    const grupper = id === annatPass.id ? [{ ...following.utanElever.grupper[0], ...f.classes[1], lessons: [id] }] : following.utanElever.grupper;
    return route.fulfill({ headers, json: { ...following.utanElever, lesson: id, grupper, contractVersion: SCHEMA_CONTRACT_VERSION } });
  });
  await page.route('**/api/schema/lagen', route => {
    const input = route.request().postDataJSON();
    lagen.push(input);
    return route.fulfill({ headers, json: { ...following.alla, lesson: input.lesson, contractVersion: SCHEMA_CONTRACT_VERSION } });
  });
  await page.goto(URL);
  if (compare) {
    const settings = page.locator('details.schema-villkor');
    if (await settings.getAttribute('open') === null) await settings.getByRole('heading', { name: 'Villkor för schemat', exact: true }).click();
    await settings.getByLabel('Salens namn', { exact: true }).fill(sal);
    await settings.getByRole('button', { name: 'Lägg till sal', exact: true }).click();
    await settings.getByRole('heading', { name: 'Villkor för schemat', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.getByText('Tid · Alla pass har tid', { exact: true })).toBeVisible();
  await page.locator(`[data-lesson="${lesson.id}"]`).first().focus();
  await page.keyboard.press('f');
  const panel = page.getByRole('region', { name: /^Följ passet:/u });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.folj-start').first()).toBeAttached();
  return { panel, lesson, f, annatPass, lagen, lasningar };
}

test('valblock sammanfattas en gång och lärarrader upprepar inte ämneslistorna, även med stor text', async ({ page }, info) => {
  const { panel, lesson, f } = await setup(page, true);
  await expect(panel.getByRole('heading', { name: 'Följ passet: Valbart block, Klass 1', exact: true })).toBeVisible();
  const summary = panel.locator('summary').filter({ hasText: /^Visa ämnen i blocket$/u });
  const details = summary.locator('..');
  const fullaAmnen = details.getByText(amnen, { exact: true });
  await expect(fullaAmnen).not.toBeVisible();

  for (const size of [16, 32]) {
    await page.addStyleTag({ content: `html { font-size: ${size}px !important; }` });
    await expect(panel.locator('.folj-mojligt .folj-namn small')).toHaveText('Valbart block, 80 min');
    const rows = panel.locator('.folj-larare');
    await expect(rows).toHaveCount(3);
    for (const [index, teacher] of f.teachers.slice(0, 3).entries()) {
      await expect(rows.nth(index).locator('.folj-namn b')).toHaveText(teacher.name);
      await expect(rows.nth(index).locator('.folj-namn small')).toHaveText('lärare');
      expect((await rows.nth(index).boundingBox())!.height).toBeLessThan(size * 6);
    }
    const pass = panel.locator(`[data-schema-pass="${lesson.id}"]`).first();
    await expect(pass).toHaveAttribute('title', new RegExp(blockTitel.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
    await expect(pass).toHaveAccessibleName(new RegExp(blockTitel.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
    await summary.focus(); await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    await expect(fullaAmnen).toBeVisible();
    await expect(summary).toBeFocused();
    await page.keyboard.press('Space');
    await expect(details).not.toHaveAttribute('open');
    await expect(fullaAmnen).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: info.outputPath(`folj-valblock-${size}px.png`) });
  }
});

test('ett vanligt pass behåller ämnesnamnet och får ingen valblocksdetalj', async ({ page }) => {
  const { panel, lesson } = await setup(page, false);
  await expect(panel.getByRole('heading', { name: `Följ passet: ${lesson.title}, Klass 1`, exact: true })).toBeVisible();
  await expect(panel.locator('.folj-mojligt .folj-namn small')).toHaveText(`${lesson.title}, ${lesson.durationMin} min`);
  await expect(panel.locator('summary').filter({ hasText: 'Visa ämnen i blocket' })).toHaveCount(0);
  await expect(panel.locator('.folj-larare .folj-namn small')).toHaveText('lärare');
});

test('Visas jämför klass, grupp, lärare och sal utan att ändra passet eller beräkningen', async ({ page, schemaDraftServer }, info) => {
  const { panel, lesson, annatPass, f, lagen, lasningar } = await setup(page, false, 'success');
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  const sparat = structuredClone(schemaDraftServer.saves);
  const starttider = structuredClone(lagen);
  const visas = panel.locator('.folj-chips');
  const input = visas.getByRole('combobox', { name: 'Lägg till resurs' });
  const row = (name: string) => panel.locator('.folj-rad').filter({ has: page.locator('.folj-namn').getByText(name, { exact: true }) });
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
  expect(lasningar).toHaveLength(0);
  for (const [name, kind] of [['Franska', 'grupp'], ['Klass 2', 'klass'], [f.teachers[1].name, 'lärare'], ['Matsalen', 'sal']]) {
    await input.fill(name);
    const option = page.getByRole('option', { name: `${name} ${kind}`, exact: true });
    await expect(option).toBeVisible();
    if (kind === 'grupp') {
      if (await option.getAttribute('data-highlighted') === null) await input.press('ArrowDown');
      await expect(option).toHaveAttribute('data-highlighted', '');
      await input.press('Enter');
    } else await option.click();
    await expect(input).toHaveValue('');
    await expect(visas.getByRole('button', { name: `Ta bort ${kind} ${name} från jämförelsen` })).toBeVisible();
    await expect(row(name).locator('small')).toHaveText(`${kind} · jämförelse`);
  }
  expect(lasningar).toHaveLength(1);
  for (const name of ['Klass 1', 'Spanska', 'Franska', 'Provelev Jämförelse']) {
    await input.fill(name);
    await expect(page.getByRole('option', { name: new RegExp(`^${name} (klass|grupp|elev)$`, 'u') })).toHaveCount(0);
  }
  await input.fill('');
  await input.press('Escape');
  const franska = row('Franska').locator('[data-schema-pass]');
  await expect(franska).toHaveCount(2);
  await expect(franska.first()).toHaveAttribute('data-schema-pass', 'pass-585');
  await expect(franska.last()).toHaveAttribute('data-schema-pass', 'pass-586');
  await expect(row('Klass 1').locator(`[data-schema-pass="${lesson.id}"]`)).toBeVisible();
  await expect(row('Matsalen').locator(`[data-schema-pass="${annatPass.id}"]`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.screenshot({ path: info.outputPath('folj-resursjamforelse-200.png') });
  const remove = visas.getByRole('button', { name: 'Ta bort grupp Franska från jämförelsen' });
  await remove.click();
  await expect(input).toBeFocused();
  await expect(row('Franska')).toHaveCount(0);
  await input.fill('Franska');
  await page.getByRole('option', { name: 'Franska grupp', exact: true }).click();
  await expect(row('Franska')).toBeVisible();
  expect(lagen).toEqual(starttider);
  expect(schemaDraftServer.saves).toEqual(sparat);

  await row('Klass 2').locator(`[data-schema-pass="${annatPass.id}"]`).click();
  await expect(panel.getByRole('heading', { name: `Följ passet: ${annatPass.title}, Klass 2` })).toBeVisible();
  await expect(remove).toBeVisible();
  await expect(row('Matsalen')).toHaveCount(1);
  await expect(visas.getByRole('button', { name: /Ta bort (klass Klass 2|lärare Provlärare 2|sal Matsalen)/u })).toHaveCount(0);
  expect(lasningar).toHaveLength(1);
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  expect(schemaDraftServer.saves).toEqual(sparat);
});

test('lärare kan jämföras vid misslyckad gruppläsning och grupper kan läsas igen', async ({ page }) => {
  const { panel } = await setup(page, false, 'retry');
  const input = panel.getByRole('combobox', { name: 'Lägg till resurs' });
  await input.fill('Provlärare 2');
  await expect(panel.getByRole('status').filter({ hasText: 'Undervisningsgrupperna kunde inte läsas.' })).toBeVisible();
  await page.getByRole('option', { name: 'Provlärare 2 lärare', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Ta bort lärare Provlärare 2 från jämförelsen' })).toBeVisible();
  await panel.getByRole('button', { name: 'Läs grupper igen' }).click();
  await input.fill('Franska');
  await page.getByRole('option', { name: 'Franska grupp', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Ta bort grupp Franska från jämförelsen' })).toBeVisible();
});
