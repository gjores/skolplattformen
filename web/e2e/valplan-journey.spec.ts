// Hela vägen från timplanens rad till tjänstefördelningen i riktiga ProtectedHome, mot syntetiska API-svar. Provet visar att vyerna
// hänger ihop och följer G1–G10 i kontexten. SQL, behörighet, Worker och installation prövas separat, och inget här är en verklig anslutning.
import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { answerConfirm } from './helpers/confirm-dialog';
import { classA, classB, journey, pupilUrl, shellUrl } from './fixtures/valplan-journey-data';

const phone = (info: TestInfo) => info.project.name === 'phone';
/** Varje inaktiverad knapp i flödet och texten som förklarar den (G3). */
const REASONS: Record<string, string | RegExp> = {
  'Öppna val': /Välj sista valdag för att öppna valet|Ange först om vårdnadshavare/, 'Lämna val': /p kvar att välja/, 'Ändra val': /Valet är inlämnat|Skolan har bekräftat/, 'Spara val': /p kvar\.|p för mycket/, 'Skapa grupper från valet': 'Bekräfta minst ett val först.', 'Spara valbart block': 'Lägg till minst en kurs innan du sparar.',
};
class Walk {
  steps: string[] = []; views: string[] = [];
  constructor(readonly page: Page, readonly info: TestInfo) {}
  /** Ett användarsteg: en sak användaren gör. */
  async step(name: string, action: () => Promise<unknown>) { this.steps.push(name); await action(); }
  /** Kontrollerna för varje vy. scope är arbetsytan, utan appens ram. */
  async view(name: string, scope: Locator, { primary = 1, controls: checkControls = true }: { primary?: number; controls?: boolean } = {}) {
    this.views.push(name);
    await expect(scope.first()).toBeVisible();
    const buttons = scope.locator('button:visible'), filled = scope.locator('button.bg-primary:visible');
    await expect(filled, `G9, ${name}: ${await filled.allInnerTexts()}`).toHaveCount(primary);
    for (const badge of await scope.locator('.status-badge:visible').all()) expect((await badge.innerText()).trim(), `G10, ${name}: statusbricka utan text`).not.toBe('');
    for (const button of await buttons.all()) if (await button.isDisabled()) {
      const label = (await button.innerText()).trim(), reason = REASONS[label];
      if (/ · (finns i blocket|alla klasser läser kursen redan)$/u.test(label)) continue; // Skälet står i knappen.
      expect(reason, `G3, ${name}: ${label} är inaktiverad utan känt skäl`).toBeTruthy();
      await expect(scope.getByText(reason).first(), `G3, ${name}: skälet till ${label}`).toBeVisible();
    }
    const controls = scope.locator('button:visible, a[href]:visible, select:visible, input:visible');
    if (checkControls) for (const control of await controls.all()) if (await control.isEnabled()) expect(await control.evaluate(el => (el as HTMLElement).tabIndex), `G10, ${name}: nås inte med tangentbord`).toBeGreaterThanOrEqual(0);
    if (checkControls && phone(this.info)) for (const control of await scope.locator('button:visible, a[href]:visible, select:visible, input:not([type="checkbox"]):visible, label:has(input[type="checkbox"]):visible').all()) {
      const box = (await control.boundingBox())!, text = (await control.innerText().catch(() => '')).trim().slice(0, 40);
      expect(box.height, `G10, ${name}: ${text} är lägre än 44 px`).toBeGreaterThanOrEqual(44);
    }
    // Text som klipps: fältets innehåll ska rymmas på höjden, och en tid ska synas hel.
    if (checkControls) for (const control of await scope.locator('select:visible, input.valplan-time:visible').all()) {
      const clipped = await control.evaluate(el => { const c = getComputedStyle(el), line = parseFloat(c.fontSize) * 1.15, inner = el.clientHeight - parseFloat(c.paddingTop) - parseFloat(c.paddingBottom); return el instanceof HTMLInputElement ? el.scrollWidth > el.clientWidth : inner < line; });
      expect(clipped, `${name}: texten i ett fält klipps`).toBe(false);
    }
    const overflow = await this.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    // Vid fel: de yttersta element som sticker ut.
    const wide = overflow > 0 ? await this.page.evaluate(() => { const edge = document.documentElement.clientWidth; return [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > edge + 1 && !(e.parentElement && e.parentElement.getBoundingClientRect().right > edge + 1)).slice(0, 6).map(e => `${e.tagName}.${String(e.className).slice(0, 30)} ${Math.round(e.getBoundingClientRect().right)}`); }) : [];
    expect(overflow, `${name}: sidledsrullning ${wide.join(', ')}`).toBeLessThanOrEqual(0);
    await this.page.screenshot({ path: this.info.outputPath(`${String(this.views.length).padStart(2, '0')}-${name}.png`), fullPage: true });
  }
}
async function nav(page: Page, name: string) {
  const target = page.getByRole('button', { name, exact: true });
  if (!await target.isVisible()) await page.getByRole('button', { name: 'Visa eller dölj navigation' }).click();
  await target.click();
}
// 200 % textstorlek: rotens storlek styr all text i rem. Text med fast storlek i px, som planeringsraden, växer inte.
const textScale = (page: Page) => page.addInitScript(() => { addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = 'html{font-size:200%}'; document.head.appendChild(style); }); });
async function wholeWay(page: Page, info: TestInfo) {
  const m = await journey(page), w = new Walk(page, info), work = page.locator('.valplan-workspace');
  await page.goto(shellUrl);
  // Timplanen: raden säger sitt läge och ett nästa steg (G2).
  await expect(page.getByText('Saknar block 2027/28')).toBeVisible();
  await w.view('timplan-saknar-block', page.locator('.gt-choice'), { primary: 0 });
  await w.step('Skapa valbart block', () => page.getByRole('button', { name: 'Skapa valbart block' }).click());
  // G1: typ, namn, rad och klasser är ifyllda och typen går inte att välja.
  await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('Individuellt val 2027/28');
  await expect(page.locator('.valplan-fields').getByText('Individuellt val', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Typ/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: /SA27 – samhälle · Individuellt val · åk 1/ })).toBeChecked();
  for (const k of [classA, classB]) await expect(page.getByRole('checkbox', { name: new RegExp(`Klass ${k.name}`) })).toBeChecked();
  // Kontroll säger från början vad som återstår, och raden leder till fältet (G3).
  await expect(page.getByText('2 saker återstår innan elevvalet kan öppnas.')).toBeVisible();
  await page.getByRole('button', { name: 'Till kurserna' }).first().click(); await expect(page.getByRole('heading', { name: 'Kurser', level: 3 })).toBeFocused();
  await w.view('nytt-block', work);
  // Kurser. G6: alla klasser läser kursen, den går inte att lägga till. Några läser den, de tas bort och användaren får veta det.
  const search = page.getByLabel('Sök kurs att lägga till');
  await search.fill('ENGE1000X');
  await expect(page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first()).toContainText('alla klasser läser kursen redan');
  await expect(page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first()).toBeDisabled();
  for (const code of ['PSYL1000X', 'FILS1000X', 'RETO1000X', 'ADMI1000X']) {
    await w.step(`Sök ${code}`, () => search.fill(code));
    await w.step(`Lägg till ${code}`, () => page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first().click());
  }
  await expect(page.getByText(/SA27B läser redan .* och har tagits bort från kursen\./)).toBeVisible();
  await expect(page.getByRole('row', { name: /ADMI1000X/ }).getByText('Alla klasser utom SA27B', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Psykologi – nivå 1, HT timmar/ })).toHaveValue('22:30');
  // Kontroll: en lista över vad som är klart.
  await expect(page.getByText('Allt är klart för elevval.')).toBeVisible();
  await w.view('kontroll', work);
  await w.step('Spara valbart block', () => page.getByRole('button', { name: 'Spara valbart block' }).click());
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  await w.view('sparat-block', work);
  await w.step('Elevval', () => page.getByRole('button', { name: 'Elevval', exact: true }).click());
  await expect(page.getByRole('heading', { name: /Elevval – Individuellt val/ })).toBeVisible();
  await w.view('elevval-oppna', work);
  await w.step('Ingen bekräftelse', () => page.getByRole('button', { name: 'Ingen bekräftelse' }).click());
  await expect(page.getByText('Välj sista valdag för att öppna valet.')).toBeVisible();
  await w.step('Sista valdag', () => page.getByLabel('Sista valdag').fill('2027-04-01'));
  await w.step('Öppna val', () => page.getByRole('button', { name: 'Öppna val', exact: true }).click());
  await expect(page.getByText('Öppet till 2027-04-01')).toBeVisible();
  await w.view('elevval-oppet', work, { primary: 0 });

  // Eleven väljer på egen sida. G7: det som går att välja, poäng kvar och skälet till en kurs som inte går.
  const staffSteps = w.steps.length, self = page.locator('.elective-self-page');
  await page.goto(pupilUrl);
  await expect(page.getByRole('heading', { name: 'Individuellt val 2027/28' })).toBeVisible();
  await expect(page.getByLabel(/Filosofi/)).toBeDisabled(); await expect(page.getByText('Du har redan valt kursen')).toBeVisible();
  await expect(page.getByLabel(/Administration/)).toBeEnabled();
  await w.view('mina-val', self);
  await w.step('Kryssa kurs 1', () => page.getByLabel(/Retorik/).check());
  await expect(page.getByText('100 p kvar att välja.')).toBeVisible();
  await w.step('Kryssa kurs 2', () => page.getByLabel(/Administration/).check());
  await expect(page.getByText('Du har valt rätt antal poäng.')).toBeVisible();
  await w.step('Lämna val', () => page.getByRole('button', { name: 'Lämna val' }).click());
  await expect(page.getByText('Ditt val är inlämnat.')).toBeVisible();
  await w.view('mina-val-inlamnat', self, { primary: 1 });
  const pupilSteps = w.steps.length - staffSteps;

  // Skolan bekräftar och skapar grupper.
  await page.goto(shellUrl);
  await expect(page.getByText('Enligt Individuellt val 2027/28')).toBeVisible();
  await w.view('timplan-klart', page.locator('.gt-choice'), { primary: 0 });
  await w.step('Öppna blocket', () => page.getByRole('button', { name: 'Öppna blocket' }).click());
  await expect(page.getByRole('heading', { name: 'Individuellt val 2027/28', level: 2 })).toBeVisible();
  await w.step('Elevval', () => page.getByRole('button', { name: 'Elevval', exact: true }).click());
  await expect(page.getByRole('row', { name: /Syntetisk Elev A/ }).getByText('Klart att bekräfta')).toBeVisible();
  await w.view('elevval-bekrafta', work);
  await w.step('Bekräfta', () => page.getByRole('button', { name: 'Bekräfta alla klara (1)' }).click());
  await expect(page.getByRole('cell', { name: 'Bekräftat' })).toBeVisible();
  await w.view('elevval-grupper', work);
  await w.step('Skapa grupper', () => page.getByRole('button', { name: 'Skapa grupper från valet' }).click());
  await expect(page.getByText('2 nya grupper och 2 elever tillagda.')).toBeVisible();
  await w.step('Öppna Undervisningsgrupper', () => page.getByRole('button', { name: 'Öppna Undervisningsgrupper' }).click());
  await expect(page.getByRole('heading', { name: 'Retorik – nivå 1', level: 3 })).toBeVisible();
  await w.view('grupper', page.locator('.valplan-workspace'));
  await w.step('Tjänstefördelning', () => nav(page, 'Tjänstefördelning'));
  // Gruppen är ett behov med kursens tid, och klassen har inte kvar raden som eget behov.
  const staffing = page.locator('.tjanst');
  if (phone(info)) await w.step('Vy Per kurs/ämne', () => staffing.getByRole('combobox', { name: 'Vy' }).selectOption({ label: 'Per kurs/ämne' }));
  await expect(staffing.getByText('Retorik – nivå 1').first()).toBeVisible();
  await expect(staffing.getByText('Individuellt val')).toHaveCount(0);
  await w.view('tjanstefordelning', staffing, { primary: 0, controls: false });
  if (phone(info)) expect((await staffing.getByRole('combobox', { name: 'Vy' }).boundingBox())!.height, 'G10: Vy i tjänstefördelningen').toBeGreaterThanOrEqual(44);
  m.verify();
  return { w, m, staff: w.steps.length - pupilSteps, pupil: pupilSteps };
}

test('hela vägen från raden i timplanen till tjänstefördelningen', async ({ page }, info) => {
  test.setTimeout(120_000);
  const { w, m, staff, pupil } = await wholeWay(page, info);
  expect(m.state.writes).toEqual(['save', 'set_policy', 'open_round', 'submit_choice', 'confirm_choice', 'create_groups']);
  // Skolan: 12 steg och två per kurs, och ett till för att välja vy på telefon. Eleven: en kryssruta per kurs och Lämna val.
  expect(pupil).toBe(3); expect(staff).toBe(12 + 2 * 4 + (phone(info) ? 1 : 0));
  await info.attach('steg', { body: JSON.stringify({ staff, pupil, steps: w.steps, views: w.views }, null, 1), contentType: 'application/json' });
  console.log(`STEG ${info.project.name}: skolan ${staff}, eleven ${pupil}, vyer ${w.views.length}`);
});
test('samma väg med 200 % textstorlek', async ({ page }, info) => {
  test.setTimeout(120_000);
  await textScale(page); await wholeWay(page, info);
  // Texten är verkligen dubbelt så stor, också i blocket.
  await page.goto(shellUrl); await page.getByRole('button', { name: 'Öppna blocket' }).click();
  expect(await page.locator('.valplan-workspace label').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(28);
});
test('avstickare: urkryssad klass, poäng som inte nås och ändringar som berör lämnade val', async ({ page }, info) => {
  test.setTimeout(120_000);
  const m = await journey(page), w = new Walk(page, info), work = page.locator('.valplan-workspace');
  await page.goto(shellUrl); await page.getByRole('button', { name: 'Skapa valbart block' }).click();
  const search = page.getByLabel('Sök kurs att lägga till'), add = async (code: string) => { await search.fill(code); await page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first().click(); };
  await page.getByRole('checkbox', { name: /Klass SA27B/ }).uncheck();
  await add('PSYL1000X');
  // G5: klassen når inte poängen, och Kontroll säger det med knapp till fältet.
  await expect(page.getByText('SA27A når inte exakt 200 p. Närmast går 50 p med kurser klassen får läsa och inte redan läser.', { exact: false })).toBeVisible();
  await expect(page.getByText('SA27B saknar block och kan inte välja förrän klassen ligger i ett block.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Till kurserna' }).click(); await expect(page.getByRole('heading', { name: 'Kurser', level: 3 })).toBeFocused();
  await page.getByRole('button', { name: 'Spara valbart block' }).click(); await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  // G4: klassen utan block syns i listan över rader och i blocklistan tills den är löst.
  await expect(page.getByText('Klasser utan block: SA27B', { exact: false })).toBeVisible();
  await expect(page.getByText('Utan block: SA27B', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Välj block för SA27B/ })).toBeVisible();
  await expect(page.getByText('Elevvalet går inte att öppna förrän det som återstår under Kontroll är löst.')).toBeVisible();
  await w.view('delvis', work);
  // G5 och G3: öppnandet är stoppat, och skälet står bredvid.
  await page.getByRole('button', { name: 'Elevval', exact: true }).click();
  await page.getByRole('button', { name: 'Ingen bekräftelse' }).click();
  await page.getByLabel('Sista valdag').fill('2027-04-01');
  await expect(page.getByText('Valet går inte att öppna förrän det som återstår under Kontroll i blocket är löst:')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Öppna val', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Tillbaka till blocket' }).click();
  await page.getByRole('checkbox', { name: /Klass SA27B/ }).check();
  await page.getByRole('button', { name: 'Lägg till kurs' }).click(); await add('FILS1000X'); await add('RETO1000X');
  await page.getByRole('button', { name: 'Spara valbart block' }).click(); await expect(page.getByText('Allt är klart för elevval.')).toBeVisible();
  await expect(page.getByText('Klasser utan block: SA27B', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Elevval', exact: true }).click();
  await page.getByLabel('Sista valdag').fill('2027-04-01'); await page.getByRole('button', { name: 'Öppna val', exact: true }).click(); await expect(page.getByText('Öppet till 2027-04-01')).toBeVisible();
  await page.getByRole('button', { name: 'Registrera val åt Syntetisk Elev B' }).click();
  await page.getByRole('group', { name: 'Val för Syntetisk Elev B' }).getByLabel(/Psykologi/).check(); await page.getByRole('group', { name: 'Val för Syntetisk Elev B' }).getByLabel(/Filosofi/).check(); await page.getByRole('group', { name: 'Val för Syntetisk Elev B' }).getByLabel(/Retorik/).check();
  await w.view('registrera-val', work);
  await page.getByRole('button', { name: 'Spara val' }).click(); await expect(page.getByText('Valet för Syntetisk Elev B är sparat.')).toBeVisible();
  await page.getByRole('button', { name: 'Tillbaka till blocket' }).click();
  // G8: en ändring som berör lämnade val säger hur många elever det gäller, och inget ändras om användaren backar.
  await expect(page.getByLabel('Namn', { exact: true })).toBeVisible();
  await answerConfirm(page, 'Elever har lämnat val', 'Behåll klassen', async () => { await page.getByRole('checkbox', { name: /Klass SA27B/ }).click(); await expect(page.getByRole('alertdialog').getByText('1 elev i SA27B har lämnat val i blocket.', { exact: false })).toBeVisible(); });
  await expect(page.getByRole('checkbox', { name: /Klass SA27B/ })).toBeChecked();
  await answerConfirm(page, 'Elever har valt kursen', 'Behåll kursen', async () => { await page.getByRole('button', { name: /Ta bort Retorik/ }).click(); await expect(page.getByRole('alertdialog').getByText('1 elev har valt Retorik', { exact: false })).toBeVisible(); });
  await expect(page.getByRole('row', { name: /RETO1000X/ })).toBeVisible();
  await expect(page.locator('.valplan-editor .section-heading .status-badge')).toHaveText('Sparad');
  expect(m.state.writes.filter(x => x === 'save')).toHaveLength(2); m.verify();
});
/** Tabbar från första kontrollen och kräver att varje aktiv kontroll i arbetsytan nås (G10). */
async function tabsThrough(page: Page, selector: string) {
  const first = page.locator(selector).locator('button:visible:enabled, input:visible:enabled, select:visible:enabled').first(); await first.focus();
  for (let i = 0; i < 100; i++) { await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.dataset.reached = 'ja'; }); await page.keyboard.press('Tab'); }
  const left = await page.evaluate(q => [...document.querySelector(q)!.querySelectorAll<HTMLElement>('button, input, select, a[href]')].filter(e => e.checkVisibility({ contentVisibilityAuto: true }) && !(e as HTMLButtonElement).disabled && !e.dataset.reached).map(e => e.outerHTML.slice(0, 180)), selector);
  expect(left).toEqual([]);
}
test('tangentbordet räcker från raden till öppet val', async ({ page }, info) => {
  test.skip(phone(info), 'Tangentbordet provas på dator.');
  test.setTimeout(120_000);
  const m = await journey(page); await page.goto(shellUrl);
  const press = async (locator: Locator, key = 'Enter') => { await locator.focus(); await page.keyboard.press(key); };
  await press(page.getByRole('button', { name: 'Skapa valbart block' }));
  await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('Individuellt val 2027/28');
  await press(page.getByRole('checkbox', { name: /Klass SA27B/ }), 'Space'); await expect(page.getByRole('checkbox', { name: /Klass SA27B/ })).not.toBeChecked();
  await press(page.getByRole('checkbox', { name: /Klass SA27B/ }), 'Space'); await expect(page.getByRole('checkbox', { name: /Klass SA27B/ })).toBeChecked();
  for (const code of ['PSYL1000X', 'FILS1000X', 'RETO1000X']) { await page.getByLabel('Sök kurs att lägga till').focus(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.type(code); await press(page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first()); }
  await expect(page.getByText('Allt är klart för elevval.')).toBeVisible();
  await tabsThrough(page, '.valplan-editor');
  await press(page.getByRole('button', { name: 'Spara valbart block' })); await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  await press(page.getByRole('button', { name: 'Elevval', exact: true }));
  await press(page.getByRole('button', { name: 'Ingen bekräftelse' }), 'Space'); await expect(page.getByText('Välj sista valdag för att öppna valet.')).toBeVisible();
  // Datumet väljs i appens kalender. Delarna i webbläsarens eget datumfält följer webbläsarens språk och prövas inte här.
  await page.getByLabel('Sista valdag').focus(); await page.keyboard.press('Alt+ArrowDown'); await expect(page.getByRole('dialog', { name: 'Välj datum' })).toBeVisible();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter'); await expect(page.getByLabel('Sista valdag')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await tabsThrough(page, '.valplan-editor');
  await press(page.getByRole('button', { name: 'Öppna val', exact: true })); await expect(page.getByText(/^Öppet till /)).toBeVisible();
  expect(m.state.writes).toEqual(['save', 'set_policy', 'open_round']); m.verify();
});
