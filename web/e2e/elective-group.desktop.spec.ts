// Komponentprov med syntetiskt årsstöd, inte bevis för SQL eller serverbehörighet.
import { test, expect } from '@playwright/test';
const URL = '/e2e/fixtures/elective-group-preview.html';
test('en gemensam grupp tilldelas en gång med ett klick och kan ångras på raden', async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByRole('table')).toHaveCount(1);
  await page.getByRole('button', { name: /^Anna Prov, Spanska gemensam:/ }).click();
  await expect(page.getByText('Sparat · Anna Prov', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const writes = JSON.parse((await page.getByTestId('writes').textContent())!);
  expect(writes).toHaveLength(1); expect(writes[0].payload.sourceKind).toBe('teaching_group');
  expect(writes[0].payload.sourceKey).toMatch(/^teaching_group:/); expect(writes[0].payload.teacherHt).toBe(2700); expect(writes[0].payload.teacherVt).toBe(2700);
  const rows = JSON.parse((await page.getByTestId('data').textContent())!);
  expect(rows).toHaveLength(1); expect(rows[0].classId).toBeNull(); expect(rows[0].classIds).toHaveLength(2);
  await page.getByRole('button', { name: 'Ångra', exact: true }).click();
  await expect(page.getByText('Tilldelningen är ångrad.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('data')).toHaveText('[]');
});
test('befintlig grupp visar vägval och lärarbyte sparas med bibehållen tid', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: /^Anna Prov, Spanska gemensam:/ }).click();
  await expect(page.getByText('Sparat · Anna Prov', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Bertil Prov, Spanska gemensam:/ }).click();
  await expect(page.getByRole('heading', { name: 'Vad vill du göra?' })).toBeVisible();
  await page.getByRole('button', { name: 'Byt lärare', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Lärare: Bertil Prov');
  await page.getByRole('button', { name: 'Spara tjänsteraden', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const rows = JSON.parse((await page.getByTestId('data').textContent())!);
  expect(rows).toHaveLength(1); expect(rows[0].personId).toMatch(/000000000081$/); expect(rows[0].teacherHt).toBe(2700); expect(rows[0].teacherVt).toBe(2700);
});
test('ofördelat behåller sparad grupp och lärare för feedback utan ny dialog', async ({ page }) => {
  await page.goto(URL); await page.getByRole('combobox', { name: 'Lins', exact: true }).selectOption('ofordelat');
  await page.getByRole('button', { name: /^Anna Prov, Spanska gemensam:/ }).click();
  await expect(page.getByText('Sparat · Anna Prov', { exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Bertil Prov', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ångra', exact: true })).toBeVisible();
});
test('ändrat planeringsstöd skriver inte en grupp på gammalt underlag', async ({ page }) => {
  await page.goto(`${URL}?changed=1`); await page.getByRole('button', { name: /^Anna Prov, Spanska gemensam:/ }).click();
  await expect(page.getByText('Underlaget har ändrats. Inget har tilldelats. Hämta aktuellt läge.', { exact: true })).toBeVisible();
  await expect(page.getByTestId('writes')).toHaveText('[]');
});
test('uppdaterat gruppunderlag behåller tider men kräver ett nytt uttryckligt lärarval', async ({ page }) => {
  await page.goto(URL); await page.getByRole('button', { name: /^Anna Prov, Spanska gemensam:/ }).click();
  await expect(page.getByText('Sparat · Anna Prov', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^Anna Prov, Spanska gemensam:/ }).click({ modifiers: ['Shift'] });
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Lärartid HT (timmar)', { exact: true }).fill('17');
  await dialog.getByLabel('Lärartid VT (timmar)', { exact: true }).fill('19');
  await page.evaluate(() => window.dispatchEvent(new Event('elective-fixture-refresh')));
  await expect(dialog.getByText('Underlaget har ändrats. Dina uppgifter finns kvar. Välj lärare på nytt.', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Lärartid HT (timmar)', { exact: true })).toHaveValue('17');
  await expect(dialog.getByRole('button', { name: 'Spara tjänsteraden', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Byt lärare', exact: true }).click();
  await dialog.getByRole('button', { name: /Bertil Prov/ }).click();
  await dialog.getByRole('button', { name: 'Spara tjänsteraden', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const writes = JSON.parse((await page.getByTestId('writes').textContent())!);
  expect(writes).toHaveLength(2); expect(writes[1].expectedRevision).toBe(3);
  expect(writes[1].payload.teacherHt).toBe(1020); expect(writes[1].payload.teacherVt).toBe(1140);
});
