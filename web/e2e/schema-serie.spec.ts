// 05.2-SM-UXF-52: aktivitet per klass som serie, före första förslaget. Simulerade rutter och syntetiska uppgifter; inget användarprov.
import { test, expect } from './schema-test';
import { bas, mockUnderlag, utanBerakning } from './schema-underlag-mock';

const URL = '/e2e/fixtures/schema-preview.html';

test('mentorstid för tre klasser blir tre aktiviteter i en serie, med ansvarig per klass och krock före sparning', async ({ page }, info) => {
  const berakningar = await utanBerakning(page), reads = await mockUnderlag(page);
  await page.goto(URL);
  const yta = page.locator('[data-omrade="aktiviteter"]');
  await yta.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ny aktivitet', exact: true });
  await dialog.getByLabel('Namn', { exact: true }).fill('Mentorstid');
  await dialog.getByRole('combobox', { name: 'Veckodag', exact: true }).selectOption('0'); await dialog.getByLabel('Start', { exact: true }).fill('08:00');
  for (const k of ['Klass 1', 'Klass 2', 'Klass 3']) await dialog.getByLabel(k, { exact: true }).check();
  const val = dialog.locator('[data-per-klass]');
  await val.getByRole('radio', { name: /^En aktivitet per klass \(3 st/u }).check();
  const [t1, t2] = bas.resurser.larare;
  await dialog.getByLabel('Ansvarig för Klass 1').selectOption({ label: t1.name });
  await dialog.getByLabel('Ansvarig för Klass 2').selectOption({ label: t1.name });
  await expect(dialog.locator('[data-serie-rad="Klass 1"]')).toContainText(`${t1.name} är ansvarig för Klass 1 och Klass 2 på samma tid.`);
  await dialog.getByRole('button', { name: 'Lägg till 3 aktiviteter' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Samma ansvarig finns för flera klasser');
  await dialog.getByLabel('Ansvarig för Klass 2').selectOption({ label: t2.name });
  await expect(dialog.locator('[data-serie-rad="Klass 2"]')).toContainText('–');
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
