// Granskningsflödet använder produktkomponenter och syntetiska svar från schema- och sparrutter.
import { expect, test, type Page, type SchemaDraftTestServer } from './schema-test';
import fixture from './schema-fixture';
import {
  SCHEMA_CONTRACT_VERSION,
  type SchemaForslag,
  type SchemaForslagRequest,
  type SchemaKontroll,
  type SchemaKontrollRequest,
  type SchemaKvalitetsrad,
  type SchemaPlacement,
} from '../lib/schema-contract.ts';

const helarsprov = fixture as unknown as SchemaForslag;
const hostpass = 'pass-7', varpass = 'pass-4', parkerat = helarsprov.lessons.at(-1)!;
const valdaPass = new Set(['pass-2', varpass, hostpass, parkerat.id]);
const source: SchemaForslag = { ...helarsprov, lessons: helarsprov.lessons.filter(l => valdaPass.has(l.id)), trims: [], teachings: [], omitted: [],
  statistics: { lessons: [], bottlenecks: [], iterations: 0 }, links: undefined, time: { ...helarsprov.time, calendar: null },
  metrics: { ...helarsprov.metrics, lessons: valdaPass.size, placed: valdaPass.size, unplaced: 0 } };
const headers = { 'X-Context-Epoch': '1' };
const draftKey = `${source.unitId}:${source.schoolYear}:lasar`;
const klass = source.resurser.klass[0], grupp = source.resurser.grupp[0];
const granska = (page: Page) => page.getByRole('region', { name: 'Granska utkastet', exact: true });
const kvalitet = (page: Page) => granska(page).getByRole('region', { name: 'Elevernas skoldagar', exact: true });
const fortsatt = (page: Page) => granska(page).getByRole('region', { name: 'Fortsatt beräkning', exact: true });
const placeringar = source.lessons.flatMap(l => l.day === null || l.startMin === null ? [] :
  [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]);

function medPlaceringar(input: SchemaForslagRequest, at: SchemaPlacement[], lasMatt: boolean): SchemaForslag {
  const byId = new Map(at.map(p => [p.lesson, p]));
  return { ...source, villkor: input.villkor, period: input.period, ...(input.locks ? { locks: input.locks.placements } : {}),
    status: at.length === source.lessons.length ? 'complete' : 'time_limit',
    metrics: { ...source.metrics, placed: at.length, unplaced: source.lessons.length - at.length },
    lessons: source.lessons.map(l => {
      const p = byId.get(l.id);
      return { ...l, day: p?.day ?? null, startMin: p?.startMin ?? null, roomId: p?.room ?? null };
    }),
    ...(lasMatt ? { elevkvalitet: kvalitetsrader(at) } : {}),
  };
}

function kvalitetsrader(at: SchemaPlacement[]): SchemaKvalitetsrad[] {
  const host = at.find(p => p.lesson === hostpass)!;
  const varens = at.find(p => p.lesson === varpass)!;
  const halFran = 600, springFran = 645, svenskaHt = at.find(p => p.lesson === 'pass-2')!;
  const dagar = Array.from({ length: 5 }, (_, dag) => {
    const dagensPass = [host, svenskaHt].filter(pass => pass.day === dag);
    const max = dagensPass.length, min = max - Number(svenskaHt.day === dag);
    const ensammaElever = max === 1 ? min === 0 ? 16 : 24 : max === 2 ? 8 : 0;
    const pass = ensammaElever > 0 ? dagensPass[0]?.lesson : undefined;
    return { dag, min, max, ensammaElever, ...(pass && { pass }) };
  });
  const lektionsdagar = { dagar, elever: 24, ensammaElevdagar: dagar.reduce((summa, dag) => summa + dag.ensammaElever, 0), understigerMalElevdagar: svenskaHt.day === host.day ? 16 : 24 };
  return [
    { slag: 'klass', ref: klass.ref, term: 'ht', hal: { dag: host.day, min: host.startMin - halFran - 10, fran: halFran, till: host.startMin, pass: host.lesson },
      sluttid: { dag: host.day, min: 960, pass: host.lesson }, kortasteDag: 180, langstaDag: 480, lektionsdagar },
    { slag: 'klass', ref: klass.ref, term: 'vt', hal: null, sluttid: { dag: varens.day, min: 850, pass: varens.lesson }, kortasteDag: 120, langstaDag: 320 },
    { slag: 'grupp', ref: grupp.ref, term: 'vt', hal: { dag: varens.day, min: 25, fran: springFran, till: varens.startMin, pass: varens.lesson },
      sluttid: { dag: varens.day, min: 920, pass: varens.lesson }, kortasteDag: 140, langstaDag: 400 },
  ];
}

function kontroll(f: SchemaForslag, at: SchemaPlacement[]): SchemaKontroll {
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, fingerprint: f.fingerprint,
    violations: [], total: 0, teachings: f.teachings, trims: f.trims, metrics: f.metrics, elevkvalitet: f.elevkvalitet,
    rooms: Object.fromEntries(at.flatMap(p => p.room === null ? [] : [[p.lesson, p.room]])) };
}

async function oppnaGranska(page: Page, server: SchemaDraftTestServer, { parkera = false, aldreSvar = false } = {}) {
  const initiala = parkera ? placeringar.filter(p => p.lesson !== parkerat.id) : placeringar;
  const sokningar: SchemaKontrollRequest[] = [], kontroller: SchemaKontrollRequest[] = [];
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => route.fulfill({ headers, json: medPlaceringar(route.request().postDataJSON(), initiala, !aldreSvar) }));
  await page.route('**/api/schema/kontroll', route => {
    const input = route.request().postDataJSON() as SchemaKontrollRequest;
    kontroller.push(input);
    return route.fulfill({ headers, json: kontroll(medPlaceringar(input, input.placements, true), input.placements) });
  });
  await page.route('**/api/schema/fortsatt', route => {
    const input = route.request().postDataJSON() as SchemaKontrollRequest;
    sokningar.push(input);
    const at = input.placements.map(p => p.lesson === hostpass ? { ...p, startMin: 635 }
      : p.lesson === 'pass-2' ? { ...p, day: 0, startMin: 550 } : p);
    const forslag = medPlaceringar(input, at, true);
    return route.fulfill({ headers, json: { forslag, before: kontroll(medPlaceringar(input, input.placements, true), input.placements),
      after: kontroll(forslag, at) } });
  });
  await page.goto('/e2e/fixtures/schema-preview.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect.poll(() => server.drafts.get(draftKey)?.placements, { timeout: 10_000 }).toEqual(initiala);
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Arbetsytor', exact: true }).getByRole('button', { name: 'Granska', exact: true }).click();
  return { initiala, sokningar, kontroller };
}

test('Granska prioriterar ett pass utan tid och öppnar passet från rätt fynd', async ({ page, schemaDraftServer }) => {
  const { initiala } = await oppnaGranska(page, schemaDraftServer, { parkera: true });
  const saves = schemaDraftServer.saves.length;
  const atgard = granska(page).getByRole('region', { name: 'Börja här', exact: true });
  await atgard.getByRole('button', { name: 'Visa pass utan tid', exact: true }).click();
  await expect(granska(page).getByRole('combobox', { name: 'Visa fynd', exact: true })).toHaveValue('placering');
  await granska(page).locator(`[data-granskamal="${parkerat.id}"]`).click();
  const kontext = page.getByRole('region', { name: 'Pass från granskningen', exact: true });
  await expect(kontext.getByRole('heading', { name: parkerat.title, exact: true })).toBeVisible();
  await expect(kontext).toContainText('Utan tid');
  expect(schemaDraftServer.drafts.get(draftKey)?.placements).toEqual(initiala);
  expect(schemaDraftServer.saves).toHaveLength(saves);
});

test('klassens och gruppens mått hör till rätt termin och återgången behåller urvalet', async ({ page, schemaDraftServer }) => {
  await oppnaGranska(page, schemaDraftServer);
  const yta = kvalitet(page);
  await expect(yta).toContainText('1 tim · Måndag 10:00–11:10');
  await expect(yta).toContainText('30 min efter skolans gräns');
  await yta.getByRole('combobox', { name: 'Termin för kvalitetsmått', exact: true }).selectOption('vt');
  const resurs = yta.getByRole('combobox', { name: 'Klass eller undervisningsgrupp', exact: true });
  await expect(yta).toContainText('Ingen håltid');
  const gruppval = JSON.stringify(['grupp', grupp.ref]);
  await expect(resurs.locator('option').filter({ hasText: grupp.name })).toHaveCount(1);
  await resurs.selectOption(gruppval);
  await expect(yta).toContainText('25 min · Tisdag 10:45–11:20');
  await yta.getByRole('button', { name: 'Visa passet efter hålet', exact: true }).click();
  const kontext = page.getByRole('region', { name: 'Pass från granskningen', exact: true });
  await expect(kontext).toContainText('Vårterminen · Tisdag 11:20');
  await kontext.getByRole('button', { name: 'Tillbaka till granskningen', exact: true }).click();
  await expect(resurs).toHaveValue(gruppval);
  await expect(yta).toContainText('25 min · Tisdag 10:45–11:20');
});

test('visar elevgruppernas pass per dag och återvänder till rätt enpasslänk', async ({ page, schemaDraftServer }) => {
  await oppnaGranska(page, schemaDraftServer);
  const yta = kvalitet(page), tabell = yta.getByRole('table', { name: 'Undervisningspass per veckodag', exact: true });
  await expect(yta).toContainText('24 elever ingår');
  await expect(yta).toContainText('På 2 veckodagar har minst en elev ett enda undervisningspass.');
  await expect(yta).toContainText('24 elevdagar under dagsmålet.');
  const onsdag = tabell.getByRole('row', { name: /Onsdag/u });
  await expect(onsdag.getByRole('cell').first()).toHaveText('0–1');
  await expect(onsdag.getByRole('cell').nth(1)).toHaveText('16');
  const torsdag = tabell.getByRole('row', { name: /Torsdag/u });
  await expect(torsdag.getByRole('cell').first()).toHaveText('0');
  await expect(torsdag.getByRole('button')).toHaveCount(0);
  const visa = onsdag.getByRole('button', { name: 'Visa ett ensamt pass på onsdag', exact: true });
  await visa.click();
  const kontext = page.getByRole('region', { name: 'Pass från granskningen', exact: true });
  await expect(kontext).toContainText('Höstterminen · Onsdag 09:50');
  await kontext.getByRole('button', { name: 'Tillbaka till granskningen', exact: true }).click();
  await expect(visa).toBeFocused();
});

test('förhandsgranskar effekten för vald klass och sparar först efter uttryckligt val', async ({ page, schemaDraftServer }, info) => {
  const { initiala, sokningar, kontroller } = await oppnaGranska(page, schemaDraftServer);
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  const trigger = kvalitet(page).getByRole('button', { name: 'Pröva en förbättring', exact: true });
  const saves = schemaDraftServer.saves.length;
  await trigger.click();
  const panel = fortsatt(page);
  const jamforelse = panel.getByRole('table', { name: `Kvalitetsmått för ${klass.name}`, exact: true });
  await expect(jamforelse.getByRole('row', { name: /Längsta hål/u }).getByRole('cell')).toHaveText(['Längsta hål', '1 tim', '25 min']);
  await expect(jamforelse.getByRole('row', { name: /Elevdagar under dagsmålet/u }).getByRole('cell')).toHaveText(['Elevdagar under dagsmålet', '24', '16']);
  const veckodagar = panel.getByRole('table', { name: `Undervisningspass per veckodag före och efter för ${klass.name}`, exact: true });
  await expect(veckodagar.getByRole('row', { name: /Onsdag/u }).getByRole('cell'))
    .toHaveText(['0–1 pass per elev · 16 elever med ett pass', '0 pass per elev · 0 elever med ett pass']);
  await expect(panel).toContainText('Dagar då någon elev har ett enda pass går från 2 till 1.');
  await expect(panel.getByRole('columnheader', { name: 'Till', exact: true })).toBeVisible();
  expect(sokningar[0].placements).toEqual(initiala);
  expect(schemaDraftServer.saves).toHaveLength(saves);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('granska-kvalitetsjamforelse-200.png') });
  await panel.getByRole('button', { name: 'Behåll nuvarande schema', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(schemaDraftServer.saves).toHaveLength(saves);
  await trigger.click();
  await panel.getByRole('button', { name: 'Använd förslaget', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(kvalitet(page)).toContainText('25 min · Måndag');
  expect(kontroller.at(-1)?.placements.find(p => p.lesson === hostpass)?.startMin).toBe(635);
  await expect.poll(() => schemaDraftServer.drafts.get(draftKey)?.placements.find(p => p.lesson === hostpass)?.startMin).toBe(635);
});

test('kontroll av ett äldre svar hämtar mått utan ny beräkning eller skrivning', async ({ page, schemaDraftServer }) => {
  const { kontroller } = await oppnaGranska(page, schemaDraftServer, { aldreSvar: true });
  await expect(kvalitet(page)).toContainText('Kör en schemakontroll för att läsa in kvalitetsmåtten.');
  const saves = schemaDraftServer.saves.length;
  await granska(page).getByRole('button', { name: 'Kontrollera schemat', exact: true }).click();
  await expect(kvalitet(page)).toContainText('1 tim · Måndag 10:00–11:10');
  expect(kontroller).toHaveLength(1);
  expect(schemaDraftServer.saves).toHaveLength(saves);
});
