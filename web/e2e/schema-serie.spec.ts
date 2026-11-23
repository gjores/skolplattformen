// 05.2-SM-UXF-52: aktivitet per klass som serie, före första förslaget. Simulerade rutter och syntetiska uppgifter; inget användarprov.
import { test, expect, forberedFlik } from './schema-test';
import { bas, mockUnderlag, utanBerakning } from './schema-underlag-mock';

const URL = '/e2e/fixtures/schema-preview.html';

test('mentorstid för tre klasser blir tre aktiviteter i en serie, med ansvarig per klass och krock före sparning', async ({ page }, info) => {
  const berakningar = await utanBerakning(page), reads = await mockUnderlag(page);
  await page.goto(URL);
  await forberedFlik(page, 'Prov och aktiviteter').click();
  const yta = page.locator('[data-omrade="aktiviteter"]');
  await yta.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ny aktivitet', exact: true });
  const val = dialog.locator('[data-per-klass]');
  await expect(val.getByRole('radio', { name: 'En aktivitet per klass', exact: true })).toBeInViewport();
  await val.getByRole('radio', { name: 'En aktivitet per klass', exact: true }).check();
  await expect(dialog.getByRole('button', { name: 'Lägg till aktiviteter', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Välj alla klasser', exact: true }).click();
  await expect(dialog.locator('[data-serie-rad]')).toHaveCount(bas.resurser.klass.length);
  await dialog.getByRole('button', { name: 'Rensa klassval', exact: true }).click();
  await expect(dialog.locator('[data-serie-rad]')).toHaveCount(0);
  await dialog.getByLabel('Namn', { exact: true }).fill('Mentorstid');
  await dialog.getByRole('combobox', { name: 'Veckodag', exact: true }).selectOption('0'); await dialog.getByLabel('Start', { exact: true }).fill('08:00');
  for (const k of ['Klass 1', 'Klass 2', 'Klass 3']) await dialog.getByLabel(k, { exact: true }).check();
  await expect(val.getByRole('radio', { name: 'En aktivitet per klass (3 st)', exact: true })).toBeChecked();
  await val.getByRole('radio', { name: 'En gemensam aktivitet', exact: true }).check();
  await expect(dialog.getByLabel('Klass 3', { exact: true })).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Lägg till aktivitet', exact: true })).toBeEnabled();
  await val.getByRole('radio', { name: 'En aktivitet per klass (3 st)', exact: true }).check();
  const [t1, t2] = bas.resurser.larare;
  await dialog.getByLabel('Ansvarig för Klass 1').selectOption({ label: t1.name });
  await dialog.getByLabel('Ansvarig för Klass 2').selectOption({ label: t1.name });
  await expect(dialog.locator('[data-serie-rad="Klass 1"]')).toContainText(`${t1.name} är ansvarig för Klass 1 och Klass 2 på överlappande tider`);
  await dialog.getByRole('button', { name: 'Lägg till 3 aktiviteter' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Rätta krockarna i förhandsvisningen');
  await dialog.getByLabel('Ansvarig för Klass 2').selectOption({ label: t2.name });
  await expect(dialog.locator('[data-serie-rad="Klass 2"]').getByRole('cell').last()).toHaveText('–');
  if (process.env.SCHEMA_BILDER && info.project.name === 'desktop-1280') await dialog.screenshot({ path: `${process.env.SCHEMA_BILDER}/serie.png` });
  await dialog.getByRole('button', { name: 'Lägg till 3 aktiviteter' }).click();
  await expect(dialog).toHaveCount(0);
  for (const k of ['Klass 1', 'Klass 2', 'Klass 3']) await expect(yta.getByText(`Mentorstid ${k}`, { exact: true })).toBeVisible();
  await expect.poll(() => reads.at(-1)?.villkor.aktiviteter?.length).toBe(3);
  const sparade = reads.at(-1)!.villkor.aktiviteter!;
  expect(new Set(sparade.map(a => a.serie)).size).toBe(1);
  expect(sparade.map(a => [a.classRefs.length, a.teacherRefs])).toEqual([[1, [t1.ref]], [1, [t2.ref]], [1, []]]);
  // Hela serien tas bort i ett steg och kan ångras.
  await yta.getByRole('button', { name: 'Ta bort hela serien som Mentorstid Klass 2 hör till' }).click();
  await expect(yta.getByText('Mentorstid Klass 1', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Ångra: serien med 3 aktiviteter/u }).click();
  await expect(yta.getByText('Mentorstid Klass 3', { exact: true })).toBeVisible();
  expect(berakningar).toHaveLength(0);
});

test('klasser bokar samma matsal på tur med förhandsvisning och gemensamt sparsteg', async ({ page, schemaDraftServer }, info) => {
  const reads = await mockUnderlag(page);
  if (info.project.name === 'desktop-1280') await page.setViewportSize({ width: 925, height: 889 });
  await page.goto(URL);
  await forberedFlik(page, 'Lärartider och regler').click();
  const settings = page.locator('details.schema-villkor');
  if (await settings.getAttribute('open') === null) await settings.getByRole('heading', { name: 'Villkor för schemat', exact: true }).click();
  await settings.getByLabel('Salens namn', { exact: true }).fill('Matsalen');
  await settings.getByRole('button', { name: 'Lägg till sal', exact: true }).click();
  await forberedFlik(page, 'Prov och aktiviteter').click();
  const yta = page.locator('[data-omrade="aktiviteter"]');
  await yta.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ny aktivitet', exact: true });
  await dialog.getByRole('combobox', { name: 'Typ av aktivitet', exact: true }).selectOption({ label: 'Salsbokning' });
  await dialog.getByLabel('Namn', { exact: true }).fill('Tid i matsal');
  await dialog.getByRole('radio', { name: 'En aktivitet per klass', exact: true }).check();
  for (const name of ['Klass 1', 'Klass 2', 'Klass 3']) await dialog.getByLabel(name, { exact: true }).check();
  await dialog.getByRole('combobox', { name: 'Sal', exact: true }).selectOption('Matsalen');
  const save = dialog.getByRole('button', { name: 'Lägg till 3 aktiviteter', exact: true });
  await expect(dialog.locator('[data-serie-rad="Klass 1"]')).toContainText('Matsalen har överlappande bokningar');
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('Rätta krockarna');
  await dialog.getByRole('radio', { name: 'Klasserna efter varandra', exact: true }).check();
  await dialog.getByLabel('Mellanrum i minuter', { exact: true }).fill('5');
  const start = dialog.getByLabel('Första starttid', { exact: true });
  await start.fill('16:00');
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('Serien ska rymmas inom skoldagen');
  expect(schemaDraftServer.saves.every(s => !s.workingVillkor.aktiviteter?.length)).toBe(true);
  await start.fill('11:00');
  await expect(dialog.locator('[data-serie-rad="Klass 1"]')).toContainText('11:00–11:20');
  await expect(dialog.locator('[data-serie-rad="Klass 2"]')).toContainText('11:25–11:45');
  await expect(dialog.locator('[data-serie-rad="Klass 3"]')).toContainText('11:50–12:10');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await save.click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => reads.at(-1)?.villkor.aktiviteter?.length).toBe(3);
  const added = reads.at(-1)!.villkor.aktiviteter!;
  expect(added.map(a => [a.name, a.rooms, a.tid.startMin])).toEqual([
    ['Tid i matsal Klass 1', ['Matsalen'], 660],
    ['Tid i matsal Klass 2', ['Matsalen'], 685],
    ['Tid i matsal Klass 3', ['Matsalen'], 710],
  ]);
  const series = added[0].serie;
  expect(added.every(a => a.serie === series && a.classRefs.length === 1)).toBe(true);
  await expect.poll(() => schemaDraftServer.saves.filter(s => s.workingVillkor.aktiviteter?.length === 3).length).toBe(1);
});
