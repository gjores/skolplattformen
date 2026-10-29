// 05.1-35 / B01: synthetic component evidence; no real server, authentication or database.
import { test, expect, type Page } from '@playwright/test';

const url = '/e2e/fixtures/tjanst-preview.html';
const ws = (page: Page) => page.locator('.tjanst');
const phone = (page: Page) => (page.viewportSize()?.width ?? 1440) <= 800;
async function choose(page: Page, value: 'klass' | 'kurs') {
  if (phone(page)) await ws(page).locator('.tjanst-view-select select').selectOption(value);
  else await ws(page).getByRole('tab', { name: value === 'klass' ? 'Per klass' : 'Per kurs/ämne', exact: true }).click();
}
async function open(page: Page) {
  await page.goto(`${url}?tjvy=kurs`);
  await expect(ws(page).locator('.tjanst-content')).toBeVisible();
}
async function fullClass(page: Page) {
  const cls = ws(page).getByRole('region', { name: 'Per klass', exact: true });
  await cls.getByLabel('Klass', { exact: true }).selectOption({ label: 'TE26A' });
  await expect(cls.locator('.tjanst-facts > div').filter({ has: page.locator('dt', { hasText: /^Behov$/ }) }).locator('dd')).toHaveText('300 h');
  await expect(cls.locator('.tjanst-facts > div').filter({ has: page.locator('dt', { hasText: /^Fördelat$/ }) }).locator('dd')).toHaveText('200 h');
  await expect(cls.locator('.tjanst-facts > div').filter({ has: page.locator('dt', { hasText: /^Täckning$/ }) }).locator('dd')).toHaveText('200 av 300 h · 2 lärare');
  const content = cls.locator(phone(page) ? '.tjanst-cards' : '.tjanst-table');
  for (const course of ['Matematik 1c', 'Svenska 1', 'Engelska 5']) await expect(content).toContainText(course);
}

type FilterCase = { name: string; values: { label: string; value: string }[]; empty?: boolean };
const cases: FilterCase[] = [
  { name: 'ämnesfilter', values: [{ label: 'Ämne', value: 'Matematik' }] },
  { name: 'lärarfilter', values: [{ label: 'Lärare', value: '51a50000-0000-4000-8000-000000000101' }] },
  { name: 'klassfilter för annan klass', values: [{ label: 'Klass', value: '51a50000-0000-4000-8000-000000000202' }] },
  { name: 'uttrycklig samläsningslins', values: [{ label: 'Lins', value: 'samlasning' }] },
  { name: 'filter utan träffar', values: [{ label: 'Ämne', value: 'Matematik' }, { label: 'Lärare', value: '51a50000-0000-4000-8000-000000000102' }], empty: true },
];
for (const c of cases) test(`B01: hel klass efter ${c.name}; urvalet finns kvar vid återgång`, async ({ page }) => {
  await open(page);
  for (const f of c.values) await ws(page).getByLabel(f.label, { exact: true }).selectOption(f.value);
  if (c.empty) await expect(ws(page).getByText('Inga rader matchar filtret.', { exact: true })).toBeVisible();
  await choose(page, 'klass');
  await fullClass(page);
  await expect(ws(page).locator('.tjanst-filter')).toHaveCount(0);
  await choose(page, 'kurs');
  for (const f of c.values) await expect(ws(page).getByLabel(f.label, { exact: true })).toHaveValue(f.value);
  if (c.empty) await expect(ws(page).getByText('Inga rader matchar filtret.', { exact: true })).toBeVisible();
});

test('B01: historiskt kursurval begränsar inte klassens underlag', async ({ page }) => {
  // Seed the same persisted filter shape used by browser Back/Forward/reload, including on a phone.
  await page.addInitScript(() => {
    history.replaceState({ ...history.state, tjanst: { filter: { classId: '', subject: '', personId: '', onlyIssues: false, course: 'MATMAT01c', lens: 'alla' }, classId: '', personId: '' } }, '');
  });
  await open(page);
  await expect(ws(page).locator('.tjanst-course-filter')).toContainText('Matematik 1c');
  await choose(page, 'klass');
  await fullClass(page);
  await choose(page, 'kurs');
  await expect(ws(page).locator('.tjanst-course-filter')).toContainText('Matematik 1c');
});

test('B01: avvikelsefilter ändrar inte full klass eller okopplad klass', async ({ page }) => {
  await open(page);
  await ws(page).getByLabel('Visa bara avvikelser och saknade kopplingar').check();
  await choose(page, 'klass');
  await fullClass(page);
  const cls = ws(page).getByRole('region', { name: 'Per klass', exact: true });
  await cls.getByLabel('Klass', { exact: true }).selectOption({ label: 'NA26B' });
  await expect(cls.getByRole('heading', { name: 'NA26B · koppling saknas' })).toBeVisible();
  await expect(cls.getByText('Klassen har ingen timplan för läsåret 26/27. Behovet är okänt, inte noll.')).toBeVisible();
  await expect(cls.locator('.tjanst-facts')).toHaveCount(0);
  await choose(page, 'kurs');
  await expect(ws(page).getByLabel('Visa bara avvikelser och saknade kopplingar')).toBeChecked();
});
