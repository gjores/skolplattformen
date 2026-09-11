// Browserprov för fas 1 (plan 01-08): bevarade flöden, skolbyte, omläsning,
// tillgänglighetsmått och skolföljande Elever-vy i exempelläget.
//
// Körs i projekten `desktop` (Chrome 1440×900) och `phone` (iPhone 13/WebKit)
// mot `npm run dev:example:test` på 127.0.0.1:5191. Inget backend krävs.
//
// Selektorer följer den faktiska DOM:en från plan 01-07: `getByRole`/`getByLabel`
// med exakta svenska texter. Sidomenyn är en fällbar Sheet på telefon, så
// navigering går via `openNav`/`chooseRole` som öppnar menyn vid behov.
import { expect, test, type Page } from '@playwright/test';

const GR = 'Björkhagens grundskola — Grundskola';
const GY = 'Exempelstads gymnasium — Gymnasium';
const STORAGE_TEXT = 'Ändringar gäller tills sidan laddas om';

const isPhone = () => test.info().project.name === 'phone';

/**
 * Sidan renderas på servern och blir interaktiv först när React har hydrerat
 * den. I dev-läget tar det några sekunder; händelser dessförinnan går
 * förlorade (t.ex. ett skolval som ändrar DOM-värdet men inte appens
 * tillstånd). Vänta på att React har fäst sina props på skolväljaren.
 */
async function awaitHydration(page: Page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('exempelskola');
    return !!el && Object.keys(el).some((key) => key.startsWith('__reactProps'));
  });
}

/** Öppnar sidomenyn på telefon om målet inte redan syns. */
async function revealSidebar(page: Page, target: ReturnType<Page['getByRole']>) {
  if (await target.isVisible()) return;
  await page.getByRole('button', { name: 'Visa eller dölj navigation' }).click();
  await expect(target).toBeVisible();
}

/** På telefon stänger sidomenyn sig efter ett val; vänta in det innan nästa steg. */
async function settleSidebar(page: Page, target: ReturnType<Page['getByRole']>) {
  if (isPhone()) await expect(target).toBeHidden();
}

/** Klickar på en post i sidomenyn (t.ex. `Utbildningar`, `Timplaner`, `Elever`). */
async function openNav(page: Page, label: string) {
  const item = page.getByRole('button', { name: label, exact: true });
  await revealSidebar(page, item);
  await item.click();
  await expect(item).toHaveAttribute('aria-current', 'page');
  await settleSidebar(page, item);
}

/** Väljer exempelroll under `Prova som`. Rollbytet flyttar till rollens första vy. */
async function chooseRole(page: Page, role: 'Huvudman' | 'Rektor' | 'Administratör' | 'Lärare') {
  // Rollknapparna är de enda knapparna med exakt rollnamn (jfr `Utse rektor`).
  const button = page.getByRole('button', { name: role, exact: true });
  await revealSidebar(page, button);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await settleSidebar(page, button);
}

/** Väljer exempelskola i organisationsvyernas etiketterade väljare. */
async function chooseSchool(page: Page, label: string) {
  const select = page.getByLabel('Exempelskola');
  await select.selectOption({ label });
  await expect(select.locator('option:checked')).toHaveText(label);
}

/** Ändrar en redigerbar cell i grundskolans timplan som rektor. */
async function editGrundskolaCell(page: Page, value: string) {
  await chooseRole(page, 'Rektor');
  await openNav(page, 'Timplaner');
  await chooseSchool(page, GR);
  // Fixturen har redan ett utkast (v2) för grundskolan; annars startas ett.
  const newVersion = page.getByRole('button', { name: 'Ny version' });
  if (await newVersion.isVisible()) await newVersion.click();
  // Första redigerbara Matematik-cellen; alla årskurser är likvärdiga för provet.
  const cell = page.getByRole('spinbutton', { name: /^Matematik,/ }).first();
  await expect(cell).toBeVisible();
  await cell.fill(value);
  await expect(cell).toHaveValue(value);
  return cell;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Provmiljö', { exact: true })).toBeVisible();
  await awaitHydration(page);
});

test('provmiljön är märkt och förklarad utan att öppna sidomenyn', async ({ page }, testInfo) => {
  await expect(page.getByText('Provmiljö', { exact: true })).toBeVisible();
  const workspace = page.locator('main#workspace');
  await expect(workspace.getByText('Fiktiva skolor och elever.')).toBeVisible();
  await expect(workspace.getByText(STORAGE_TEXT)).toBeVisible();
  if (testInfo.project.name === 'phone') {
    await expect(page.getByRole('button', { name: 'Visa eller dölj navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Utbildningar', exact: true })).toBeHidden();
  }
});

test('båda exempelskolorna kan väljas och skolkontexten följer valet', async ({ page }) => {
  const select = page.getByLabel('Exempelskola');
  await expect(select.locator('option')).toHaveText([GR, GY]);
  const context = page.locator('.admin-context');
  await chooseSchool(page, GY);
  await expect(context.getByText('Gymnasieskola', { exact: true })).toBeVisible();
  await openNav(page, 'Utbildningar');
  await expect(page.getByRole('button', { name: 'Visa Samhällsvetenskap' })).toBeVisible();
  await expect(page.getByText('utbildningar · ').filter({ hasText: 'Exempelstads gymnasium' })).toBeVisible();
  await chooseSchool(page, GR);
  await expect(context.getByText('Grundskola', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Visa Grundskola' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Visa Samhällsvetenskap' })).toBeHidden();
  await expect(page.getByText('utbildningar · ').filter({ hasText: 'Björkhagens grundskola' })).toBeVisible();
});

test('gymnasium: ny utbildning kan skapas med befintlig kontroll', async ({ page }) => {
  await chooseSchool(page, GY);
  await openNav(page, 'Utbildningar');
  await page.getByRole('button', { name: 'Lägg till utbildning' }).click();
  const dialog = page.getByRole('dialog', { name: 'Lägg till utbildning' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Slag').selectOption('gymnasium');
  await dialog.getByLabel('Program (Gy25)').selectOption('SA25');
  await dialog.getByLabel('Inriktning').selectOption('SASAP');
  await dialog.getByLabel('Lokalt namn').fill('Provutbildning E2E');
  await expect(dialog.getByLabel('Kull eller läsår')).toHaveValue('Elever som börjar HT 2027');
  await dialog.getByRole('button', { name: 'Lägg till', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Visa Provutbildning E2E' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Provutbildning E2E' }).filter({ hasText: 'Planerad' })).toBeVisible();
});

test('gymnasium: kurs/nivå kan läggas till i poängplanens utkast', async ({ page }) => {
  await chooseSchool(page, GY);
  await openNav(page, 'Poängplaner');
  await page.getByRole('button', { name: /^Foto och rörlig bild/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: /Foto och rörlig bild/ })).toBeVisible();
  // Statusen "Utkast" står både i katalogen och i omslaget; en synlig träff räcker.
  await expect(page.getByText('Utkast', { exact: true }).first()).toBeVisible();
  const sum = page.getByRole('row', { name: /^Summa/ });
  const before = (await sum.textContent())?.trim();
  expect(before).toBeTruthy();
  // Första valbara nivån i Skolverkets utbud för programfördjupning; vilken
  // nivå som växlas spelar ingen roll för provet, bara att summan ändras.
  const level = page.getByRole('checkbox').first();
  const wasChecked = await level.isChecked();
  await level.click();
  await expect(level).toBeChecked({ checked: !wasChecked });
  await expect(sum).not.toHaveText(before as string);
  const after = (await sum.textContent())?.trim();
  expect(after).not.toEqual(before);
});

test('gymnasium: kopia till ny elevkull är ett fristående utkast', async ({ page }) => {
  await chooseSchool(page, GY);
  await openNav(page, 'Utbildningar');
  const rowFor = (cohort: string) =>
    page
      .getByRole('row')
      .filter({ has: page.getByRole('button', { name: 'Visa Samhällsvetenskap' }) })
      .filter({ hasText: cohort });
  await expect(rowFor('Elever som börjar HT 2026')).toHaveCount(1);
  await expect(rowFor('Elever som börjar HT 2027')).toHaveCount(0);
  await page.getByRole('button', { name: 'Visa Samhällsvetenskap' }).click();
  await page.getByRole('button', { name: 'Kopiera till ny elevkull' }).click();
  const dialog = page.getByRole('dialog', { name: 'Kopiera till ny elevkull' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Nya kullens startår').fill('2027');
  await dialog.getByRole('button', { name: 'Skapa ny elevkull' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Ny elevkull skapad: Elever som börjar HT 2027')).toBeVisible();
  await expect(rowFor('Elever som börjar HT 2027').filter({ hasText: 'Planerad' })).toHaveCount(1);
  await expect(rowFor('Elever som börjar HT 2027').filter({ hasText: 'Utkast v1' })).toHaveCount(1);
  await expect(rowFor('Elever som börjar HT 2026').filter({ hasText: 'Aktiv' })).toHaveCount(1);
});

test('gymnasium: klass kopplas till fastställd timplansversion och flyttas inte av ny version', async ({ page }) => {
  // Fixturens timplan för Samhällsvetenskap är ett skickat förslag (v1);
  // huvudmannen fastställer den först med den befintliga kontrollen.
  await chooseSchool(page, GY);
  await openNav(page, 'Timplaner');
  // Timplanens utbildningsnamn är programtiteln: "Samhällsvetenskapsprogrammet, … · Samhällsvetenskap".
  await page.getByRole('button', { name: /^Samhällsvetenskapsprogrammet/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: /· Samhällsvetenskap$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Fastställ' }).click();
  const decide = page.getByRole('dialog', { name: 'Fastställ timplanen' });
  await decide.getByLabel('Beslut').fill('Fastställd i browserprovet 01-08.');
  await decide.getByRole('button', { name: 'Fastställ' }).click();
  await expect(decide).toBeHidden();
  await expect(page.getByText(/^Timplanen för .*Samhällsvetenskap är fastställd\.$/)).toBeVisible();

  await page.getByRole('link', { name: 'Klasser och läsår' }).click();
  const panel = page.locator('#timplan-klasser');
  await expect(panel.getByRole('heading', { name: 'Klasser som följer timplanen' })).toBeVisible();
  await panel.getByLabel('Klass', { exact: true }).fill('SA26A');
  await panel.getByLabel('Läsårets startår').fill('2026');
  await panel.getByLabel('Årskurs i timplanen').selectOption({ label: 'År 1' });
  await panel.getByRole('button', { name: 'Koppla klass' }).click();
  const binding = panel.getByRole('listitem').filter({ hasText: 'SA26A' });
  await expect(binding).toHaveCount(1);
  await expect(binding).toContainText('2026/27 · År 1 · Version 1');

  // Rektorn påbörjar en ny version; kopplingen ska stå kvar på version 1.
  await chooseRole(page, 'Rektor');
  await openNav(page, 'Timplaner');
  await page.getByRole('button', { name: /^Samhällsvetenskapsprogrammet/ }).click();
  await page.getByRole('button', { name: 'Ny version' }).click();
  await expect(page.getByText('Version 2', { exact: true })).toBeVisible();
  const after = page.locator('#timplan-klasser').getByRole('listitem').filter({ hasText: 'SA26A' });
  await expect(after).toHaveCount(1);
  await expect(after).toContainText('Version 1');
  await expect(after).not.toContainText('Version 2');
});

test('grundskola: timplanens stadie-timmar kan ändras och skolbyte bevarar ändringen', async ({ page }) => {
  await editGrundskolaCell(page, '123');
  await chooseSchool(page, GY);
  await expect(page.getByRole('spinbutton', { name: /^Matematik,/ })).toHaveCount(0);
  await chooseSchool(page, GR);
  // Samma första Matematik-cell som ändrades i editGrundskolaCell.
  await expect(page.getByRole('spinbutton', { name: /^Matematik,/ }).first()).toHaveValue('123');
});

test('omläsning börjar om exemplet', async ({ page }) => {
  await editGrundskolaCell(page, '123');
  await page.reload();
  await expect(page.getByText('Provmiljö', { exact: true })).toBeVisible();
  await awaitHydration(page);
  await chooseRole(page, 'Rektor');
  await openNav(page, 'Timplaner');
  await chooseSchool(page, GR);
  const cell = page.getByRole('spinbutton', { name: /^Matematik,/ }).first();
  await expect(cell).toBeVisible();
  await expect(cell).not.toHaveValue('123');
  await expect(page.locator('main#workspace').getByText(STORAGE_TEXT)).toBeVisible();
  await expect(page.getByText('Sparat i databasen')).toHaveCount(0);
  await expect(page.getByText('Sparar…')).toHaveCount(0);
});

test('hjälpen öppnas och stängs med tangentbord och återför fokus', async ({ page }) => {
  const help = page.getByRole('button', { name: 'Om provmiljön' });
  await expect(help).toBeVisible();
  // Tab-navigering från sidans början tills hjälpknappen har fokus.
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  let focused = false;
  for (let i = 0; i < 40 && !focused; i++) {
    await page.keyboard.press('Tab');
    focused = await help.evaluate((el) => document.activeElement === el);
  }
  expect(focused, 'hjälpknappen nås med Tab').toBe(true);
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Om provmiljön' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Om provmiljön' })).toBeVisible();
  await expect(dialog.getByText('Vid omläsning börjar exemplet om.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Stäng hjälpen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(help).toBeFocused();
});

test('pekytor är minst 44 px på telefon', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'Pekytor mäts bara i telefonprojektet');
  const targets: { name: string; box: { width: number; height: number } | null }[] = [];
  targets.push({ name: 'Exempelskola', box: await page.getByLabel('Exempelskola').boundingBox() });
  targets.push({ name: 'Om provmiljön', box: await page.getByRole('button', { name: 'Om provmiljön' }).boundingBox() });
  const roleButtons = page.locator('fieldset.role-switch').getByRole('button');
  await revealSidebar(page, roleButtons.first());
  await expect(roleButtons).toHaveCount(4);
  for (const button of await roleButtons.all()) {
    targets.push({ name: `Prova som: ${await button.innerText()}`, box: await button.boundingBox() });
  }
  for (const t of targets) expect(t.box, `${t.name} har en synlig ruta`).not.toBeNull();
  // Rapportera alla för små pekytor på en gång: "namn: bredd×höjd".
  const tooSmall = targets
    .filter((t) => t.box!.width < 44 || t.box!.height < 44)
    .map((t) => `${t.name}: ${Math.round(t.box!.width)}×${Math.round(t.box!.height)}`);
  expect(tooSmall, 'pekytor under 44 × 44 CSS px').toEqual([]);
});

test('320 px bredd kräver ingen sidledsrullning för miljötext och väljare', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page.getByText('Provmiljö', { exact: true })).toBeVisible();
  await awaitHydration(page);
  await expect(page.getByLabel('Exempelskola')).toBeVisible();
  await expect(page.locator('main#workspace').getByText('Fiktiva skolor och elever.')).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(320 + 1);
});

test('Elever visar 4A/7B för grundskolan och SA26A/EK26A för gymnasiet', async ({ page }) => {
  // Klassfiltret listar exakt den valda skolans klasser; elevraderna visar
  // klassen i tabellen (dator) respektive i kortet (telefon).
  const classFilter = page.getByRole('combobox', { name: 'Filtrera klass' });
  const filterOptions = async () => {
    await classFilter.click();
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    const names = await listbox.getByRole('option').allInnerTexts();
    await page.keyboard.press('Escape');
    await expect(listbox).toBeHidden();
    return names.map((n) => n.trim());
  };
  const main = page.locator('main#workspace');
  // Tabellens klasschip finns i DOM men är dold på telefon; ta första synliga träffen.
  const visibleText = (pattern: RegExp) => main.getByText(pattern).filter({ visible: true }).first();

  await chooseRole(page, 'Rektor');
  await expect(page.getByLabel('Exempelskola').locator('option:checked')).toHaveText(GR);
  await openNav(page, 'Elever');
  await expect(page.getByRole('button', { name: 'Alla elever 12' })).toBeVisible();
  await expect(main.getByText('12 av 12 elever')).toBeVisible();
  expect(await filterOptions()).toEqual(['Alla klasser', '4A', '7B']);
  await expect(visibleText(/\b4A\b/)).toBeVisible();
  await expect(visibleText(/\b7B\b/)).toBeVisible();
  await expect(main.getByText(/\bSA26A\b/)).toHaveCount(0);
  await expect(main.getByText(/\bEK26A\b/)).toHaveCount(0);

  // Skolväljaren finns i organisationsvyerna; byt skola där och gå tillbaka.
  await openNav(page, 'Timplaner');
  await chooseSchool(page, GY);
  await openNav(page, 'Elever');
  await expect(page.getByRole('button', { name: 'Alla elever 12' })).toBeVisible();
  await expect(main.getByText('12 av 12 elever')).toBeVisible();
  expect(await filterOptions()).toEqual(['Alla klasser', 'SA26A', 'EK26A']);
  await expect(visibleText(/\bSA26A\b/)).toBeVisible();
  await expect(visibleText(/\bEK26A\b/)).toBeVisible();
  await expect(main.getByText(/\b4A\b/)).toHaveCount(0);
  await expect(main.getByText(/\b7B\b/)).toHaveCount(0);
});
