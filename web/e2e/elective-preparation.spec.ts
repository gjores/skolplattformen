// Riktiga React-flöden mot syntetiska API-svar; faktisk SQL, behörighet och installation verifieras separat.
import { test, expect, type Page, type Locator } from '@playwright/test';
import { createElectivePreparationRef, parseElectivePreparationCommand, type ElectivePreparationCommand, type ElectivePreparationReply } from '../lib/elective-preparation';
import { read, grRead, journal, pid } from './fixtures/elective-preparation-data';
const URL = '/e2e/fixtures/elective-preparation-preview.html';
const headers = { 'X-Context-Epoch': '1' };
async function mock(page: Page, initial = read()) {
  const m = { state: initial, writes: [] as ElectivePreparationCommand[], receipts: new Map<string, ElectivePreparationReply>(), lose: false, wrong: false, reject: null as null | { status: number; code: string }, failRead: false, statusNotFound: false };
  await page.route('**/api/valbara-block/forberedelse/**', async route => {
    const path = new globalThis.URL(route.request().url()).pathname;
    if (path.endsWith('/lasa')) return m.failRead ? route.abort('failed') : route.fulfill({ json: m.state, headers });
    const raw = route.request().postDataJSON();
    if (path.endsWith('/status')) { const found = m.statusNotFound ? null : m.receipts.get(raw.commandId); return route.fulfill({ json: { state: found ? 'found' : 'not_found', result: found ?? null }, headers }); }
    const command = parseElectivePreparationCommand(raw); m.writes.push(command);
    if (m.reject) return route.fulfill({ status: m.reject.status, json: { code: m.reject.code }, headers });
    const ref = await createElectivePreparationRef(command), revision = command.expectedRevision + 1;
    const blockIds = command.action === 'apply' ? command.draft.frames.flatMap(frame => frame.slots.map(slot => slot.blockId)) : m.state.preparation?.materializedBlockIds ?? [];
    const appliedRevision = command.action === 'apply' ? revision : m.state.preparation?.appliedRevision ?? null;
    m.state.preparation = { id: command.draft.id, revision, appliedRevision, draft: command.draft, sourceHash: m.state.sourceHash, materializedBlockIds: blockIds };
    const reply: ElectivePreparationReply = { receipt: { ...ref, preparationId: command.draft.id, revision, appliedRevision, blockIds, replayed: false }, read: structuredClone(m.state) };
    m.receipts.set(command.commandId, reply);
    if (m.lose) { m.lose = false; return route.abort('failed'); }
    if (m.wrong) return route.fulfill({ json: { ...reply, receipt: { ...reply.receipt, commandId: pid(90) } }, headers });
    return route.fulfill({ json: reply, headers });
  });
  return m;
}
const slot = (page: Page, n: number) => page.getByRole('region', { name: `Kursval ${n}`, exact: true });
async function select(search: Locator, page: Page, text = 'Spanska') { await search.fill(text); await page.getByRole('option', { name: new RegExp(`${text}.*(?:MODO1000X|GRGRMSP01)`, 'i') }).click(); }
async function prepare(page: Page) {
  await page.getByRole('checkbox', { name: /Förbered Moderna språk/ }).check();
  await select(slot(page, 1).getByRole('combobox'), page);
  await select(slot(page, 2).getByRole('combobox'), page, 'Franska');
}
async function apply(page: Page) { await page.getByRole('button', { name: 'Granska förberedelsen', exact: true }).click(); await page.getByRole('button', { name: 'Skapa block och gruppunderlag', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Block och gruppunderlag finns', exact: true })).toBeVisible(); }
async function save(page: Page) { await page.getByRole('button', { name: 'Spara förberedelse', exact: true }).click(); await expect(page.getByText(/Förberedelsen är sparad/)).toBeVisible(); }

test('200 poäng blir två tydliga kursval i ett granskat paket med ärvd tid', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await prepare(page);
  await expect(page.getByRole('radio', { name: /ett på hösten/ })).toBeChecked();
  await expect(slot(page, 1)).toContainText('100 poäng · HT 90 h · VT 0 h'); await expect(slot(page, 2)).toContainText('100 poäng · HT 0 h · VT 90 h');
  await expect(page.getByRole('textbox', { name: /^Timmar|^Poäng/ })).toHaveCount(0);
  await page.screenshot({ path: `/private/tmp/vb17-editor-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Granska förberedelsen', exact: true }).click();
  await expect(page.locator('.preparation-summary')).toContainText('2 block · 2 grupper · Elevtid HT 90 h, VT 90 h');
  await page.screenshot({ path: `/private/tmp/vb17-review-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Skapa block och gruppunderlag', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Block och gruppunderlag finns', exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(1); expect(m.writes[0].action).toBe('apply');
  const slots = m.writes[0].draft.frames[0].slots; expect(slots.map(s => [s.pointsHt, s.pointsVt, s.needHt, s.needVt])).toEqual([[100, 0, 5400, 0], [0, 100, 0, 5400]]);
  expect(new Set(slots.flatMap(s => [s.positionId, s.blockId, s.options[0].id, s.groups[0].id])).size).toBe(8);
  await page.getByRole('button', { name: 'Bemanna grupper', exact: true }).click(); await expect(page.getByText('Bemanning för 2 befintliga block')).toBeVisible();
});

test('lika delning behåller eget namn, stabila id och skiljer elevtid från grupptid', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await prepare(page); await page.getByRole('textbox', { name: 'Namn på kursval 1', exact: true }).fill('Mitt eget höstval'); await save(page);
  const before = structuredClone(m.writes[0].draft.frames[0]);
  await page.getByRole('radio', { name: /Två lika stora/ }).check(); await expect(page.getByRole('textbox', { name: 'Namn på kursval 1', exact: true })).toHaveValue('Mitt eget höstval');
  await slot(page, 1).locator('summary').click(); await slot(page, 1).getByRole('button', { name: /^Lägg till grupp för/ }).click();
  await page.getByRole('button', { name: 'Granska förberedelsen', exact: true }).click(); await expect(page.locator('.preparation-summary')).toContainText('2 block · 3 grupper · Elevtid HT 90 h, VT 90 h · Gruppundervisning totalt 270 h');
  await page.getByRole('button', { name: 'Skapa block och gruppunderlag', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Block och gruppunderlag finns' })).toBeVisible();
  const after = m.writes[1].draft.frames[0]; expect(after.slots.map(s => [s.positionId, s.blockId])).toEqual(before.slots.map(s => [s.positionId, s.blockId])); expect(after.slots.map(s => [s.needHt, s.needVt])).toEqual([[2700, 2700], [2700, 2700]]);
});

test('förberedelse sparas före klassorganisation och kompletteras senare utan nya barnidentiteter', async ({ page }) => {
  const initial = read(); initial.classes = []; const m = await mock(page, initial); await page.goto(URL); await prepare(page); await expect(page.getByText(/Inga klasser är kopplade/)).toBeVisible(); await save(page);
  const before = structuredClone(m.writes[0].draft); expect(before.classIds).toEqual([]); expect(before.frames[0].slots.every(s => s.groups[0].classIds.length === 0)).toBe(true);
  m.state.classes = read().classes; m.state.sourceHash = 'b'.repeat(64); await page.reload();
  await page.locator('.preparation-class-list').getByRole('checkbox', { name: 'SA27A', exact: true }).check(); await page.locator('.preparation-class-list').getByRole('checkbox', { name: 'SA27B', exact: true }).check(); await apply(page);
  expect(m.writes[1].draft.frames[0].slots.map(s => [s.blockId, s.groups[0].id])).toEqual(before.frames[0].slots.map(s => [s.blockId, s.groups[0].id]));
  expect(m.writes[1].draft.frames[0].slots.every(s => s.groups[0].classIds.length === 2)).toBe(true);
});

test('återanvänt utbud kopieras explicit till andra kursvalet med egna grupper', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await page.getByRole('checkbox', { name: /Förbered Moderna språk/ }).check(); await select(slot(page, 1).getByRole('combobox'), page);
  await slot(page, 2).getByRole('button', { name: /Återanvänd utbudet/ }).click(); await save(page);
  const [first, second] = m.writes[0].draft.frames[0].slots; expect(second.options[0].levelCode).toBe(first.options[0].levelCode); expect(second.options[0].id).not.toBe(first.options[0].id); expect(second.groups[0].id).not.toBe(first.groups[0].id);
});

test('återbesök visar befintliga grupper och erbjuder inget nytt skapande', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await prepare(page); await apply(page); await page.reload();
  await expect(page.getByRole('heading', { name: 'Block och gruppunderlag finns' })).toBeVisible(); await expect(page.getByRole('button', { name: /^Skapa block/ })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Ändra förberedelsen', exact: true })).toHaveCount(0); await page.getByRole('button', { name: 'Visa sparad förberedelse', exact: true }).click(); await expect(page.getByRole('heading', {name: 'Sparad förberedelse', exact: true})).toBeVisible(); await expect(page.getByRole('textbox')).toHaveCount(0); await expect(page.getByRole('button', {name: /Spara förberedelse|Uppdatera block|Skapa block/})).toHaveCount(0); await expect(page.getByRole('button', {name: 'Öppna befintliga block', exact: true})).toBeVisible(); expect(m.writes).toHaveLength(1);
});

test('tappat svar återhämtas via minimal referens efter omladdning utan ny skrivning', async ({ page }) => {
  const m = await mock(page); m.lose = true; await page.goto(URL); await prepare(page); await page.getByRole('button', { name: 'Granska förberedelsen', exact: true }).click(); await page.getByRole('button', { name: 'Skapa block och gruppunderlag', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kontrollera sparstatus' })).toBeVisible();
  const stored = await page.evaluate(key => sessionStorage.getItem(key), journal()); expect(stored).not.toContain('Spanska'); expect(stored).not.toContain('frames'); expect(Object.keys(JSON.parse(stored!)).sort()).toEqual(['action', 'columnId', 'commandId', 'payloadHash', 'planId', 'schoolYear', 'unitId']);
  page.once('dialog', d => d.accept()); await page.reload(); await page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Block och gruppunderlag finns' })).toBeVisible(); expect(m.writes).toHaveLength(1);
});

test('okänt kvitto blir inte grönt och spärrar en andra begäran', async ({ page }) => {
  const m = await mock(page); m.wrong = true; await page.goto(URL); await prepare(page); await page.getByRole('button', { name: 'Spara förberedelse', exact: true }).click(); await expect(page.getByRole('button', { name: 'Kontrollera sparstatus' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Spara förberedelse', exact: true })).toBeDisabled(); await expect(page.getByText(/Förberedelsen är sparad/)).toHaveCount(0); expect(m.writes).toHaveLength(1);
});

test('saknad browserlagring hindrar skrivning före nätverket', async ({ page }) => {
  const m = await mock(page); await page.addInitScript(() => { Storage.prototype.setItem = () => { throw Error('synthetic storage unavailable'); }; }); await page.goto(URL); await prepare(page); await page.getByRole('button', { name: 'Spara förberedelse', exact: true }).click(); await expect(page.getByText(/Ingen begäran skickades/)).toBeVisible(); expect(m.writes).toHaveLength(0);
});

test('MFA ligger vid sparknappen och behåller inmatningen', async ({ page }) => {
  const m = await mock(page); m.reject = { status: 403, code: 'mfa_required' }; await page.goto(URL); await prepare(page); await page.getByRole('textbox', { name: 'Namn på kursval 1', exact: true }).fill('Behåll mitt namn'); await page.getByRole('button', { name: 'Spara förberedelse', exact: true }).click();
  await expect(page.locator('.preparation-footer').getByRole('button', { name: 'Verifiera med engångskod', exact: true })).toBeVisible(); await expect(page.getByRole('textbox', { name: 'Namn på kursval 1', exact: true })).toHaveValue('Behåll mitt namn'); await expect(page.getByRole('alert')).toHaveCount(1); await page.screenshot({ path: `/private/tmp/vb17-mfa-${test.info().project.name}.png` });
});

test('ändrat tidsunderlag kräver explicit rättning och bevarar eget innehåll', async ({ page }) => {
  const m = await mock(page); m.reject = { status: 409, code: 'conflict' }; await page.goto(URL); await prepare(page); await page.getByRole('textbox', { name: 'Namn på kursval 1', exact: true }).fill('Eget namn'); await page.getByRole('button', { name: 'Spara förberedelse', exact: true }).click(); await expect(page.getByText(/Underlaget har ändrats/)).toBeVisible();
  m.state.sourceHash = 'c'.repeat(64); m.state.frames[0].detailId = pid(50); m.state.frames[0].detailRevision = 1;
  await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click(); await expect(page.getByRole('button', { name: 'Använd aktuellt underlag' })).toBeVisible(); await expect(page.getByRole('textbox', { name: 'Namn på kursval 1', exact: true })).toHaveValue('Eget namn');
  await page.getByRole('button', { name: 'Använd aktuellt underlag' }).click(); m.reject = null; await save(page); expect(m.writes[1].draft.frames[0].detailId).toBe(pid(50)); expect(m.writes[1].expectedSourceHash).toBe('c'.repeat(64));
});

test('nyare sparad förberedelse får inte skrivas över av gammalt utkast', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await prepare(page); await save(page); await page.getByRole('textbox', { name: 'Namn på kursval 1', exact: true }).fill('Lokalt osparat');
  m.state.preparation!.revision = 2; m.state.preparation!.draft.frames[0].slots[0].name = 'Annan användares namn'; m.reject = { status: 409, code: 'conflict' };
  await page.getByRole('button', { name: 'Spara förberedelse', exact: true }).click(); await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Namn på kursval 1', exact: true })).toHaveValue('Lokalt osparat'); await expect(page.getByRole('button', { name: 'Spara förberedelse', exact: true })).toBeDisabled();
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Öppna sparad förberedelse', exact: true }).click(); await expect(page.getByRole('textbox', { name: 'Namn på kursval 1', exact: true })).toHaveValue('Annan användares namn');
});

test('grundskolans verifierade källa ger ett språkval utan gymnasiepoäng', async ({ page }) => {
  const m = await mock(page, grRead()); await page.goto(URL + '?gr=1'); await page.getByRole('checkbox', { name: /Förbered Språkval/ }).check(); await select(slot(page, 1).getByRole('combobox'), page); await expect(page.getByRole('textbox', { name: /^Poäng/ })).toHaveCount(0); await expect(slot(page, 1)).toContainText('HT 30 h · VT 30 h'); await apply(page);
  expect(m.writes[0].draft.frames[0].slots).toHaveLength(1); expect(m.writes[0].draft.frames[0].slots[0].pointsHt).toBeNull(); expect(m.writes[0].draft.frames[0].slots[0].options[0].language).toBe('es');
});

test('saknad grundskolekälla visar konkret åtgärd och skapar inga påhittade rader', async ({ page }) => {
  const initial = grRead(); initial.frames = []; initial.blockers = ['Timplanens historiska årskurskolumn behöver verifieras.']; const m = await mock(page, initial); await page.goto(URL + '?gr=1'); await expect(page.getByText(initial.blockers[0], { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Öppna timplaner för skolan', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Granska förberedelsen', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Granska block och gruppunderlag', exact: true })).toHaveCount(0); expect(m.writes).toHaveLength(0);
});

test('fel katalogversion spärrar sökning i fel fryst utbud', async ({ page }) => {
  const initial = read(); initial.catalogId = 'sha256:' + 'e'.repeat(64); const m = await mock(page, initial); await page.goto(URL); await page.getByRole('checkbox', { name: /Förbered Moderna språk/ }).check(); await expect(page.getByRole('alert').filter({ hasText: /frysta katalog/ })).toBeVisible(); await expect(slot(page, 1).getByRole('combobox')).toBeDisabled(); expect(m.writes).toHaveLength(0);
});

test('manuella befintliga block visas och kan inte ersättas med nytt gruppunderlag', async ({ page }) => {
  const initial = read(); initial.frames[0].existingBlocks = [{ id: pid(77), name: 'Språk redan bemannat', revision: 3, classIds: [pid(3)] }]; const m = await mock(page, initial); await page.goto(URL); await prepare(page); await expect(page.getByText('Språk redan bemannat · version 3', { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'Öppna befintliga block', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Granska förberedelsen', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Granska block och gruppunderlag', exact: true })).toHaveCount(0); expect(m.writes).toHaveLength(0);
});

test('gruppfel visas vid sparknapparna och fokuserar rätt dold grupp', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await prepare(page); await slot(page, 1).locator('summary').click(); await slot(page, 1).getByRole('textbox', { name: 'Gruppens namn', exact: true }).fill(''); await slot(page, 1).locator('summary').click();
  await page.getByRole('button', { name: 'Granska förberedelsen', exact: true }).click(); await expect(page.locator('.preparation-footer').getByRole('button', { name: /Ange ett gruppnamn/ })).toBeVisible(); await expect(slot(page, 1).getByRole('textbox', { name: 'Gruppens namn', exact: true })).toBeFocused(); expect(m.writes).toHaveLength(0);
});

test('avancerad tid är ett aktivt val och kan inte ändra timplanens totalsumma', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await prepare(page); await page.getByRole('radio', { name: /Två lika stora/ }).check(); await page.getByRole('button', { name: 'Annan fördelning', exact: true }).click();
  await slot(page, 1).getByRole('textbox', { name: /^Timmar HT/ }).fill('44'); await page.getByRole('button', { name: 'Granska förberedelsen', exact: true }).click(); await expect(page.locator('.preparation-footer').getByRole('button', { name: /bevara timplanens/ })).toBeVisible(); expect(m.writes).toHaveLength(0);
  await slot(page, 2).getByRole('textbox', { name: /^Timmar HT/ }).fill('46'); await apply(page); expect(m.writes[0].draft.frames[0].slots.map(s => s.needHt)).toEqual([2640, 2760]);
});

test('utbudsåteranvändning bevarar redan valda alternativ och dubbletter undviks', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await prepare(page); await slot(page, 2).getByRole('button', { name: /Återanvänd utbudet/ }).click(); await slot(page, 2).getByRole('button', { name: /Återanvänd utbudet/ }).click(); await save(page);
  const second = m.writes[0].draft.frames[0].slots[1]; expect(second.options.map(o => o.language)).toEqual(['fr', 'es']); expect(second.groups).toHaveLength(2);
});

test('status utan träff kräver uttryckligt återställningsval före ny begäran', async ({ page }) => {
  const m = await mock(page); m.lose = true; m.statusNotFound = true; await page.goto(URL); await prepare(page); await page.getByRole('button', { name: 'Spara förberedelse', exact: true }).click(); await page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Spara förberedelse', exact: true })).toBeDisabled(); page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Glöm lokal sparreferens och hämta underlag', exact: true }).click(); await expect(page.getByRole('button', { name: 'Spara förberedelse', exact: true })).toBeEnabled(); expect(m.writes).toHaveLength(1);
});

test('felaktig lokal referens spärrar innan nytt skrivande', async ({ page }) => {
  const m = await mock(page); await page.addInitScript(key => sessionStorage.setItem(key, '{"bad":"synthetic"}'), journal()); await page.goto(URL); await expect(page.getByRole('button', { name: 'Spara förberedelse', exact: true })).toBeDisabled(); await expect(page.getByText('Den lokala sparreferensen kunde inte verifieras.', { exact: true })).toBeVisible(); expect(m.writes).toHaveLength(0);
});

test('felaktigt återhämtat innehåll godtas inte trots rätt command-id', async ({ page }) => {
  const m = await mock(page); m.lose = true; await page.goto(URL); await prepare(page); await page.getByRole('button', { name: 'Spara förberedelse', exact: true }).click(); await expect(page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true })).toBeVisible();
  m.receipts.get(m.writes[0].commandId)!.read.preparation!.draft.frames[0].slots[0].name = 'Ändrat kvittoinnehåll'; page.once('dialog', d => d.accept()); await page.reload(); await page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true }).click(); await expect(page.getByText(/Sparstatus kunde inte verifieras/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Spara förberedelse', exact: true })).toBeDisabled(); expect(m.writes).toHaveLength(1);
});

test('bekräftad sparning kräver omläsning när efterföljande läsning misslyckas', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await prepare(page); m.failRead = true; await page.getByRole('button', { name: 'Spara förberedelse', exact: true }).click(); await expect(page.getByText(/Sparningen är bekräftad, men aktuellt underlag/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Spara förberedelse', exact: true })).toBeDisabled();
  m.failRead = false; await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click(); await expect(page.getByRole('button', { name: 'Spara förberedelse', exact: true })).toBeEnabled(); expect(m.writes).toHaveLength(1);
});

test('byte från ogiltig avancerad inmatning återställer till ett giltigt normalt upplägg', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await prepare(page); await page.getByRole('button', { name: 'Annan fördelning', exact: true }).click(); await slot(page, 1).getByRole('textbox', { name: /^Timmar HT/ }).fill('fel');
  await page.getByRole('radio', { name: /ett på hösten/ }).check(); await save(page); expect(m.writes[0].draft.frames[0].profile).toBe('terms'); expect(m.writes[0].draft.frames[0].slots[0].needHt).toBe(5400);
});

test('förlorad behörighet tömmer den skyddade arbetsytan', async ({ page }) => {
  const m = await mock(page); m.reject = { status: 403, code: 'forbidden' }; await page.goto(URL); await prepare(page); await page.getByRole('button', { name: 'Spara förberedelse', exact: true }).click(); await expect(page.getByText('Inloggningen har avslutats', { exact: true })).toBeVisible(); await expect(page.getByRole('textbox')).toHaveCount(0); expect(m.writes).toHaveLength(1);
});

test('två kursval kan bytas till ett giltigt enda val utan krasch eller nya grund-id', async ({ page }) => {
  const initial = read(); initial.frames = [{...initial.frames[0],rowKey:'block:iv1',label:'Individuellt val 200',kind:'individualChoice',allowedCodesByPoints:{'100':['MODO1000X'],'200':['ANAANA01']}}]; const m = await mock(page, initial); await page.goto(URL); await page.getByRole('checkbox', {name:'Förbered Individuellt val 200',exact:true}).check(); await page.getByRole('radio', {name:/ett på hösten/}).check(); await select(slot(page,1).getByRole('combobox'),page); await select(slot(page,2).getByRole('combobox'),page,'Franska'); await save(page); const first = m.writes[0].draft.frames[0].slots[0];
  await page.getByRole('radio', {name:'Ett kursval inom hela ramen',exact:true}).check(); await expect(slot(page,2)).toHaveCount(0); await slot(page,1).getByRole('button',{name:'Ta bort alternativ',exact:true}).click(); await slot(page,1).getByRole('button',{name:'Lägg till alternativ',exact:true}).click(); await slot(page,1).getByRole('combobox').fill('ANAANA01'); await page.getByRole('option',{name:/ANAANA01/}).click(); await save(page); const current=m.writes[1].draft.frames[0]; expect(current.slots).toHaveLength(1); expect(current.slots[0].blockId).toBe(first.blockId); expect(current.slots[0].positionId).toBe(first.positionId); expect(current.slots[0].pointsHt!+current.slots[0].pointsVt!).toBe(200);
});

test('flera valramar kan förberedas och granskas i samma skrivpaket', async ({ page }) => {
  const m=await mock(page); await page.goto(URL); await prepare(page); await page.getByRole('checkbox',{name:'Förbered Individuellt val',exact:true}).check(); const individual=page.getByRole('region',{name:'Individuellt val förberedelse',exact:true}); await individual.getByRole('combobox').fill('ENGE3000X'); await page.getByRole('option',{name:/ENGE3000X/}).click(); await page.getByRole('button',{name:'Granska förberedelsen',exact:true}).click(); await expect(page.locator('.preparation-summary')).toContainText('3 block · 3 grupper · Elevtid HT 135 h, VT 135 h'); await page.getByRole('button',{name:'Skapa block och gruppunderlag',exact:true}).click(); await expect(page.getByRole('heading',{name:'Block och gruppunderlag finns',exact:true})).toBeVisible(); expect(m.writes).toHaveLength(1); expect(m.writes[0].draft.frames).toHaveLength(2);
});

test('launcher återupptar pending efter reload och blockerar normal navigation', async ({page}) => {
  const m=await mock(page); m.lose=true; await page.goto(URL+'?launcher=1'); await page.getByRole('button',{name:'Förbered valbara block',exact:true}).click(); await prepare(page); await page.getByRole('button',{name:'Spara förberedelse',exact:true}).click(); await expect(page.getByRole('button',{name:'Kontrollera sparstatus',exact:true})).toBeVisible(); await expect(page.getByRole('button',{name:'Till annan vy',exact:true})).toBeDisabled(); page.once('dialog',d=>d.accept()); await page.reload(); await expect(page.getByRole('button',{name:'Kontrollera sparstatus',exact:true})).toBeVisible(); await expect(page.getByRole('button',{name:'Till annan vy',exact:true})).toBeDisabled(); await page.getByRole('button',{name:'Kontrollera sparstatus',exact:true}).click(); await expect(page.getByRole('button',{name:'Till annan vy',exact:true})).toBeEnabled(); expect(m.writes).toHaveLength(1);
});

test('launcher återhämtar rätt källa även utan klassbaserat timplansurval', async ({page}) => {
  const m=await mock(page); m.lose=true; await page.goto(URL+'?launcher=1'); await page.getByRole('button',{name:'Förbered valbara block',exact:true}).click(); await prepare(page); await page.getByRole('button',{name:'Spara förberedelse',exact:true}).click(); await expect(page.getByRole('button',{name:'Kontrollera sparstatus',exact:true})).toBeVisible(); page.once('dialog',d=>d.accept()); await page.goto(URL+'?launcher=1&nochoices=1'); await expect(page.getByRole('button',{name:'Kontrollera sparstatus',exact:true})).toBeVisible(); await page.getByRole('button',{name:'Kontrollera sparstatus',exact:true}).click(); await expect(page.getByText(/Förberedelsen är sparad/)).toBeVisible(); expect(m.writes).toHaveLength(1);
});

test('launcher går till bemanning med ett enda klick efter bekräftat skapande', async ({page}) => {
  const m=await mock(page); await page.goto(URL+'?launcher=1'); await page.getByRole('button',{name:'Förbered valbara block',exact:true}).click(); await prepare(page); await apply(page); await page.getByRole('button',{name:'Bemanna grupper',exact:true}).click(); await expect(page.getByText('Bemanning öppnad',{exact:true})).toBeVisible(); expect(m.writes).toHaveLength(1);
});

test('Tillbaka genom launcher kräver exakt en bekräftelse för osparat utkast', async ({page}) => {
  await mock(page); await page.goto(URL+'?launcher=1'); await page.getByRole('button',{name:'Förbered valbara block',exact:true}).click(); await page.getByRole('checkbox',{name:/Förbered Moderna språk/}).check(); let confirmations=0; page.on('dialog',d=>{confirmations++;void d.accept();}); await page.getByRole('button',{name:'Tillbaka',exact:true}).click(); await expect(page.getByRole('button',{name:'Förbered valbara block',exact:true})).toBeVisible(); expect(confirmations).toBe(1);
});

test('direkt timplansavsikt fungerar före klasser och förväljer sin ram', async ({page}) => {
  const initial=read(); initial.classes=[]; const m=await mock(page,initial); await page.goto(URL+'?launcher=1&nochoices=1&intent=1'); await expect(page.getByRole('checkbox',{name:'Förbered Moderna språk',exact:true})).toBeChecked(); await expect(page.getByText(/Inga klasser är kopplade/)).toBeVisible(); await expect(page.getByRole('region',{name:'Kursval 2',exact:true})).toBeVisible(); expect(m.writes).toHaveLength(0);
});

test('manuellt sparad tidsfördelning bevaras och tillåter endast förberedande sparning', async ({page}) => {
  const initial=read(); initial.frames[0].detailId=pid(60); initial.frames[0].detailRevision=1; const m=await mock(page,initial); await page.goto(URL); await prepare(page); await expect(page.getByText('Befintlig tidsfördelning · version 1',{exact:true})).toBeVisible(); await page.getByRole('button',{name:'Granska förberedelsen',exact:true}).click(); await expect(page.getByRole('heading',{name:'Granska block och gruppunderlag',exact:true})).toHaveCount(0); await expect(page.locator('.preparation-footer').getByRole('button',{name:/får inte byta ut de befintliga positionerna/})).toBeVisible(); await save(page); expect(m.writes).toHaveLength(1); expect(m.writes[0].action).toBe('save'); await page.getByRole('button',{name:'Fortsätt i Valbara block',exact:true}).click(); await expect(page.getByText(`Valbara block för ${initial.unitId} läsår ${initial.schoolYear}`,{exact:true})).toBeVisible(); expect(m.writes).toHaveLength(1);
});

test('befintliga block öppnas med källans skola och läsår från timplan-launchern', async ({page}) => {
  const m=await mock(page); await page.goto(URL+'?launcher=1&intent=1'); await select(slot(page,1).getByRole('combobox'),page); await select(slot(page,2).getByRole('combobox'),page,'Franska'); await apply(page); await page.getByRole('button',{name:'Öppna befintliga block',exact:true}).click(); await expect(page.getByText(`Valbara block för ${m.state.unitId} läsår ${m.state.schoolYear}`,{exact:true})).toBeVisible(); expect(m.writes).toHaveLength(1);
});

test('saknad källa öppnar skolans timplanslista med rätt kontext', async ({page}) => {
  const initial=grRead(); initial.frames=[]; initial.blockers=['Historisk årskurskolumn behöver verifieras.']; const m=await mock(page,initial); await page.goto(URL+'?gr=1&launcher=1&intent=1'); await page.getByRole('button',{name:'Öppna timplaner för skolan',exact:true}).click(); await expect(page.getByText(`Timplaner för ${initial.unitId} läsår ${initial.schoolYear}`,{exact:true})).toBeVisible(); expect(m.writes).toHaveLength(0);
});

test.afterEach(async ({ page }) => { if (!page.isClosed()) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); });
