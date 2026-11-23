// 05.2-SM-UXFLODE: Förbered-ytan och förutsättningar före första förslaget, mot uttryckligt simulerade rutter och syntetiska uppgifter. Inget användarprov.
import { test, expect, forberedFlik, schemaTestDraft, type Page } from './schema-test';
import { bas as base, headers, mockUnderlag, olagt, utanBerakning } from './schema-underlag-mock';
import { SCHEMA_CONTRACT_VERSION, defaultSchemaVillkor, type SchemaForslag, type SchemaForslagRequest, type SchemaVillkor } from '../lib/schema-contract.ts';
import { parseSchemaDraftSave } from '../lib/schema-draft-contract.ts';
import { laggTillSal } from '../lib/schema-salregister.ts';
import type { NationellProvbokning, NationellaProvUnderlag } from '../lib/nationella-prov.ts';

const URL = '/e2e/fixtures/schema-preview.html', UNIT = '52a10000-0000-4000-8000-000000000001';
const omrade = (page: Page, id: string) => page.locator(`[data-omrade="${id}"]`), punkt = (page: Page, id: string) => page.locator(`[data-punkt="${id}"]`);
const oversikt = (page: Page) => page.getByRole('region', { name: 'Förbered schemat', exact: true });
function medSalar(): SchemaVillkor {
  let v: SchemaVillkor = { ...defaultSchemaVillkor(), timeBasis: 'lasar' };
  for (const [name, typ, platser] of [['A101', 'Allmän sal', 32], ['A102', 'Allmän sal', 20], ['Labb 1', 'Laborationssal', 24]] as const) v = laggTillSal(v, { name, typ, platser, utrustning: typ === 'Laborationssal' ? ['dragskåp'] : [] });
  return v;
}
const sparadeVillkor = (page: Page, villkor: SchemaVillkor) => page.addInitScript(([unit, value]) => {
  if (window.localStorage.getItem(`schema-villkor:${unit}`) === null) window.localStorage.setItem(`schema-villkor:${unit}`, value);
}, [UNIT, JSON.stringify(villkor)] as const);

test('resurser, lektionsantal och villkor går att läsa och ändra utan beräknat förslag', async ({ page }) => {
  const solves = await utanBerakning(page), reads = await mockUnderlag(page);
  await page.goto(URL);
  const underlag = omrade(page, 'underlag');
  await expect(underlag).toContainText(`${base.fordelning.length} undervisningar`);
  await expect(underlag).toContainText('Inget schemaförslag är beräknat.');
  // Eget villkor för en klass, före första förslaget.
  await forberedFlik(page, 'Lärartider och regler').click();
  await page.getByRole('heading', { name: 'Villkor för schemat' }).click();
  const form = page.locator('.schema-egna-form');
  await form.getByLabel(/^Gäller/u).selectOption('klass');
  await form.getByRole('button', { name: 'Lägg till villkor' }).click();
  await expect(page.getByRole('list', { name: 'Egna villkor' })).toContainText(base.resurser.klass[0].name);
  // En spärrad tid är ett tidsvillkor och läser inte om underlaget. En ny sal ändrar grunden: underlaget läses om, utan beräkning.
  expect(reads).toHaveLength(1);
  await page.getByLabel('Salens namn').fill('Idrottshallen');
  await page.getByRole('group', { name: 'Salar' }).getByRole('button', { name: 'Lägg till sal' }).click();
  await expect.poll(() => reads.length).toBe(2);
  expect(reads[1].villkor.salar).toEqual(['Idrottshallen']); expect(reads[1].villkor.egna).toHaveLength(1);
  await forberedFlik(page, 'Pass och salar').click();
  await omrade(page, 'lektioner').getByText('Antal lektioner per undervisning').click();
  await expect(omrade(page, 'lektioner').getByText(base.fordelning[0].title).first()).toBeVisible();
  await forberedFlik(page, 'Lärartider och regler').click();
  await omrade(page, 'larartider').locator('summary', { hasText: 'Villkor i tabell' }).click();
  await expect(omrade(page, 'larartider').getByRole('heading', { name: 'Villkor i tabell' })).toBeVisible();
  await omrade(page, 'larartider').getByRole('tab', { name: /Lärare/u }).click();
  await expect(omrade(page, 'larartider').getByText(base.resurser.larare[0].name).first()).toBeVisible();
  expect(solves).toHaveLength(0);
});

test('villkorstabell i Förbered: valda rader samlas överst och fokus följer rätt rad', async ({ page }) => {
  await mockUnderlag(page);
  await page.goto(URL);
  await forberedFlik(page, 'Lärartider och regler').click();
  const larartider = omrade(page, 'larartider');
  await larartider.locator('summary', { hasText: 'Villkor i tabell' }).click();
  await larartider.getByRole('tab', { name: 'Lärare', exact: true }).click();
  const tabell = larartider.getByRole('grid', { name: 'Villkor i tabell' });
  const rader = tabell.getByRole('rowheader');
  const namn = (nr: number) => `Provlärare ${nr}`;
  const kryss = (nr: number) => tabell.getByRole('checkbox', { name: `Välj ${namn(nr)}`, exact: true });
  const resurs = (nr: number) => tabell.getByRole('rowheader', { name: namn(nr), exact: true });
  const sortera = tabell.getByRole('button', { name: 'Namn', exact: true });
  const fallande = base.resurser.larare.map(r => r.name).reverse();
  const ordning = (...val: number[]) => {
    const valda = val.map(namn);
    return [...valda, ...fallande.filter(n => !valda.includes(n))];
  };
  await sortera.click();
  await sortera.click();
  await expect(rader).toHaveText(ordning());

  await kryss(5).check();
  await expect(rader).toHaveText(ordning(5));
  await expect(kryss(5)).toBeFocused();
  await kryss(8).check();
  await expect(rader).toHaveText(ordning(8, 5));
  await kryss(5).uncheck();
  await expect(rader).toHaveText(ordning(8));
  await expect(kryss(5)).toBeFocused();
  await expect(kryss(5)).toHaveAttribute('tabindex', '0');

  await page.keyboard.press('ArrowRight');
  await expect(resurs(5)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(rader).toHaveText(ordning(8, 5));
  await expect(resurs(5)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(rader).toHaveText(ordning(8));
  await expect(resurs(5)).toBeFocused();
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowDown');
  await expect(rader).toHaveText(ordning(8, 5, 4));
  await expect(resurs(4)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Shift');
  await expect(rader).toHaveText(ordning(8, 5, 4, 3));
  await expect(resurs(3)).toBeFocused();

  const sok = larartider.getByRole('searchbox', { name: 'Sök på namn' });
  await sok.fill(namn(4));
  await expect(rader).toHaveText([namn(4)]);
  await expect(kryss(4)).toBeChecked();
  await expect(larartider.getByText(/4 valda/u)).toBeVisible();
  await expect(sok).toBeFocused();
  await sok.clear();
  await expect(rader).toHaveText(ordning(8, 5, 4, 3));
  await forberedFlik(page, 'Underlag').click();
  await expect(tabell).toBeHidden();
  await forberedFlik(page, 'Lärartider och regler').click();
  await expect(rader).toHaveText(ordning(8, 5, 4, 3));
  await expect(kryss(4)).toBeChecked();
});

test('genvägarna i Förbered öppnar rätt salbehov, lärartid och provbokning utan att köra beräkningen', async ({ page }, info) => {
  const berakningar = await utanBerakning(page), reads = await mockUnderlag(page);
  await sparadeVillkor(page, medSalar());
  const undervisning = base.fordelning[1];
  const larare = base.resurser.larare[5];
  const deltagare = base.resurser.klass.slice(0, 2).map(klass => ({
    ...klass, slag: 'klass' as const, undervisningar: base.fordelning.filter(r => r.title === 'Engelska' && r.classes.join() === klass.name)
      .map(r => ({ ref: r.ref, title: r.title })),
  }));
  const prov: NationellProvbokning[] = deltagare.map((klass, index) => ({
    id: `52a10000-0000-4000-8000-00000000099${index}`,
    namn: index === 0 ? 'Engelska nivå 1, delprov A' : 'Engelska nivå 1, delprov B',
    datum: index === 0 ? '2026-11-23' : '2026-11-24',
    undervisning: klass.undervisningar[0].ref, mal: { slag: 'klass', ref: klass.ref },
    tidsval: 'fast', startMin: 540, slutMin: 660, kontrolleradDatum: '2026-10-19', salId: null, vakter: [],
  }));
  const underlag: NationellaProvUnderlag = { gallerGymnasiet: true, deltagare, salar: [], vakter: [], skoldagar: prov.map(b => b.datum) };
  await page.route('**/api/lasar/nationella-prov/lasa', route => route.fulfill({ headers, json: {
    ...route.request().postDataJSON(), register: { revision: 1, savedAt: '2026-11-20T09:00:00.000Z', document: { granskad: false, bokningar: prov } },
    underlag,
  } }));
  const provsparningar: unknown[] = [];
  await page.route('**/api/lasar/nationella-prov/spara', route => { provsparningar.push(route.request().postDataJSON()); return route.abort(); });
  await page.goto(URL);

  const genvagar = page.getByRole('region', { name: 'Gå direkt till', exact: true });
  await expect(forberedFlik(page, 'Underlag')).toHaveAttribute('aria-current', 'page');
  await expect(omrade(page, 'underlag')).toBeVisible();
  await expect(omrade(page, 'salar')).toBeHidden();
  await expect(omrade(page, 'larartider')).toBeHidden();
  await expect(omrade(page, 'aktiviteter')).toBeHidden();
  const undervisningsval = genvagar.getByRole('combobox', { name: 'Undervisning för salbehov', exact: true });
  await expect(undervisningsval).toBeEnabled();
  if (process.env.SCHEMA_BILDER) await page.screenshot({ path: `${process.env.SCHEMA_BILDER}/forbered-underlag-${info.project.name}.png` });
  await undervisningsval.selectOption(undervisning.ref);
  await genvagar.getByRole('button', { name: 'Öppna salbehov', exact: true }).click();
  const salbehov = omrade(page, 'salar').locator('[data-salbehov]');
  await expect(forberedFlik(page, 'Pass och salar')).toHaveAttribute('aria-current', 'page');
  await expect(omrade(page, 'underlag')).toBeHidden();
  await expect(salbehov.getByRole('combobox', { name: 'Undervisning', exact: true })).toHaveValue(undervisning.ref);
  await expect(salbehov.getByRole('radio', { name: 'Obesvarat', exact: true })).toBeFocused();
  if (process.env.SCHEMA_BILDER) await page.screenshot({ path: `${process.env.SCHEMA_BILDER}/forbered-salbehov-${info.project.name}.png` });
  await salbehov.getByRole('radio', { name: 'Lämplig allmän sal' }).check();
  await salbehov.getByRole('button', { name: 'Spara salbehov' }).click();
  await expect.poll(() => reads.at(-1)?.villkor.salbehov?.map(rad => [rad.ref, rad.lage])).toEqual([[undervisning.ref, 'allman']]);

  await genvagar.getByRole('combobox', { name: 'Lärare för lärartid', exact: true }).selectOption(larare.ref);
  await genvagar.getByRole('button', { name: 'Öppna lärartid', exact: true }).click();
  const tid = page.getByRole('dialog', { name: `Spärrad tid för ${larare.name}`, exact: true });
  await expect(forberedFlik(page, 'Lärartider och regler')).toHaveAttribute('aria-current', 'page');
  await expect(tid).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tid).toBeHidden();
  await expect(salbehov).toBeHidden();

  await genvagar.getByRole('combobox', { name: 'Provbokning att öppna', exact: true }).selectOption(prov[1].id);
  await genvagar.getByRole('button', { name: 'Öppna provbokning', exact: true }).click();
  const bokning = page.getByRole('dialog', { name: 'Ändra provbokning', exact: true });
  await expect(bokning.getByLabel('Provets namn')).toHaveValue(prov[1].namn);
  await expect(bokning.getByLabel('Provdatum')).toHaveValue(prov[1].datum);
  await bokning.getByRole('button', { name: 'Avbryt', exact: true }).click();
  await expect(bokning).toBeHidden();
  await expect(forberedFlik(page, 'Prov och aktiviteter')).toHaveAttribute('aria-current', 'page');
  await expect(omrade(page, 'aktiviteter').getByRole('button', { name: `Ändra ${prov[1].namn} för ${deltagare[1].name}` })).toBeFocused();
  await expect(omrade(page, 'larartider')).toBeHidden();

  const saknat = base.fordelning[0];
  const uppgift = oversikt(page).locator('li').filter({
    has: page.getByText(`${saknat.title} · ${saknat.classes.join(', ')}`, { exact: true }),
  });
  if (!await uppgift.isVisible()) await oversikt(page).getByText(/^Visa ytterligare/u).click();
  await expect(uppgift).toContainText('Salbehov saknas.');
  await uppgift.getByRole('button', { name: 'Öppna salbehovet', exact: true }).click();
  await expect(salbehov.getByRole('combobox', { name: 'Undervisning', exact: true })).toHaveValue(saknat.ref);
  expect(berakningar).toHaveLength(0);
  expect(provsparningar).toHaveLength(0);
});

test('misslyckad underlagsläsning hindrar inte villkoren och går att göra om', async ({ page }) => {
  await page.goto(URL);
  const underlag = omrade(page, 'underlag');
  await expect(underlag).toContainText('Underlaget kunde inte läsas.');
  await expect(punkt(page, 'salar')).toContainText('Underlaget är inte läst');
  await forberedFlik(page, 'Lärartider och regler').click();
  await page.getByRole('heading', { name: 'Villkor för schemat' }).click();
  await expect(page.locator('.schema-egna-form')).toHaveCount(0);
  await mockUnderlag(page);
  await forberedFlik(page, 'Underlag').click();
  await underlag.getByRole('button', { name: 'Läs underlaget igen' }).click();
  await expect(underlag).toContainText('Inget schemaförslag är beräknat.');
});

test('alla schemaytor skiljer ett äldre tomt förslag från aktuell tjänstefördelning', async ({ page, schemaDraftServer }) => {
  const villkor = { ...defaultSchemaVillkor(), timeBasis: 'lasar' as const }, tidigare = olagt(villkor);
  const tomtForslag: SchemaForslag = { ...tidigare, status: 'input_missing', basis: null, classes: [], teachers: [], lessons: [], fordelning: [], teachings: [], trims: [], links: [],
    resurser: { klass: [], grupp: [], amne: [], larare: [], pass: [] },
    members: { pupils: 0, groupsWithoutMembers: [], classesWithoutPupils: [], withoutChoice: [] },
    metrics: { ...tidigare.metrics, lessons: 0, unplaced: 0 }, statistics: { iterations: 0, lessons: [], bottlenecks: [] } };
  const input = parseSchemaDraftSave({ contractVersion: 1, unitId: UNIT, schoolYear: 2026, period: 'lasar', commandId: crypto.randomUUID(),
    draftId: null, expectedRevision: 0, name: 'Tidigare sparat förslag', basisVillkor: villkor, workingVillkor: villkor, grundFingerprint: tomtForslag.grundFingerprint,
    placements: [], locks: [], intentional: [], datedOverrides: [], activityTypes: [] });
  const { draft } = await schemaTestDraft(input, tomtForslag);
  draft.stale = true;
  const scope = `${UNIT}:2026:lasar`;
  schemaDraftServer.drafts.set(scope, draft);
  await page.addInitScript(unit => localStorage.setItem(`schema-yta:${unit}:2026`, 'schema'), UNIT);
  const berakningar = await utanBerakning(page), lasningar: SchemaForslagRequest[] = [];
  await page.route('**/api/schema/underlag', route => {
    const request = route.request().postDataJSON() as SchemaForslagRequest;
    lasningar.push(request);
    if (lasningar.length === 1) return route.fulfill({ headers, status: 503, json: { code: 'unavailable' } });
    return route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, beraknat: false,
      forslag: { ...olagt(request.villkor), basis: { versionNo: 2, status: 'published' } } } });
  });
  await page.goto(URL);

  const ytor = page.locator('[data-ytval]'), aktuellt = page.getByRole('region', { name: 'Aktuellt underlag' });
  const felaktigtHinder = page.getByText(/saknar tjänstefördelning|ingen tjänstefördelning|Schemat kan inte läggas ännu|Förslag · Underlag saknas/iu);
  await expect(ytor.getByRole('button', { name: 'Lägg schema' })).toHaveAttribute('aria-current', 'page');
  await expect(aktuellt).toContainText('Det aktuella schemaunderlaget kunde inte läsas.');
  await expect(felaktigtHinder).toHaveCount(0);
  await aktuellt.getByRole('button', { name: 'Läs underlaget igen' }).click();
  await expect(aktuellt).toContainText('Tjänstefördelning version 2 (publicerad)');
  await expect(aktuellt).toContainText(`${base.lessons.length} pass i beräkningsunderlaget`);
  await expect(page.getByText('Inaktuellt förslag', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Kontroller och underlag' })).toContainText('Det sparade förslaget innehåller inga pass.');
  await expect(felaktigtHinder).toHaveCount(0);

  await ytor.getByRole('button', { name: 'Granska' }).click();
  await expect(page.getByRole('heading', { name: 'Granska utkastet' })).toBeVisible();
  await expect(aktuellt).toContainText('Tjänstefördelning version 2 (publicerad)');
  await expect(felaktigtHinder).toHaveCount(0);

  await ytor.getByRole('button', { name: 'Förbered' }).click();
  const underlag = omrade(page, 'underlag');
  await expect(underlag).toContainText('tjänstefördelning version 2 (publicerad)');
  await expect(underlag).toContainText(`${base.fordelning.length} undervisningar`);
  await expect(punkt(page, 'underlag')).toContainText('Tjänstefördelning version 2');
  await expect(oversikt(page)).toContainText(/inaktuellt|underlaget har ändrats/iu);
  await expect(felaktigtHinder).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ta fram nytt förslag från aktuellt underlag' })).toBeEnabled();
  expect(lasningar.map(r => r.period)).toEqual(['lasar', 'lasar']);
  expect(berakningar).toHaveLength(0);
  expect(schemaDraftServer.saves).toHaveLength(0);
  expect(schemaDraftServer.drafts.get(scope)).toEqual(draft);
});

test('den manuella områdesgenomgången blir inaktuell när innehållet ändras och sparas efter omladdning', async ({ page }, info) => {
  const solves = await utanBerakning(page); await mockUnderlag(page);
  const villkor = medSalar(); await sparadeVillkor(page, villkor);
  await page.goto(URL);
  await expect(page.locator('[data-ytval]').getByRole('button', { name: 'Förbered' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-punkt]')).toHaveCount(7);
  await expect(punkt(page, 'salar')).toContainText(`3 salar · 0 av ${base.fordelning.length} undervisningar har salbehov · ${base.fordelning.length} obesvarade`);
  await expect(punkt(page, 'aktiviteter')).toContainText('Provtid redovisas separat från undervisningstiden.');
  // Maskinen bockar inte av: inget område är genomgånget förrän en person kryssar.
  await expect(page.locator('[data-punkt][data-status="genomgangen"]')).toHaveCount(0);
  await forberedFlik(page, 'Pass och salar').click();
  await punkt(page, 'salar').getByRole('checkbox').check();
  await expect(punkt(page, 'salar')).toHaveAttribute('data-status', 'genomgangen');
  await expect(page.locator('[data-punkt][data-status="genomgangen"]')).toHaveCount(1);
  // Ändrat salbehov gör genomgången inaktuell; övriga områden berörs inte.
  const behov = omrade(page, 'salar').locator('[data-salbehov]');
  await behov.getByRole('radio', { name: 'Lämplig allmän sal' }).check();
  await behov.getByRole('button', { name: 'Spara salbehov' }).click();
  await expect(punkt(page, 'salar')).toHaveAttribute('data-status', 'andrat'); await expect(punkt(page, 'salar')).toContainText('Ändrat sedan genomgången');
  await expect(page.locator('[data-punkt][data-status="genomgangen"]')).toHaveCount(0);
  await expect(punkt(page, 'salar')).toContainText(`1 av ${base.fordelning.length} undervisningar har salbehov`);
  // Ångra syns före första förslaget och säger vad den avser. Innehållet är då detsamma som vid genomgången.
  const angra = page.getByRole('button', { name: /^Ångra: salbehov för/u });
  await angra.click();
  await expect(punkt(page, 'salar')).toHaveAttribute('data-status', 'genomgangen');
  await page.getByRole('button', { name: 'Gör om' }).click();
  await expect(punkt(page, 'salar')).toHaveAttribute('data-status', 'andrat');
  await punkt(page, 'salar').getByRole('checkbox').check();
  // Genomgången finns kvar efter omläsning (den här webbläsaren). Utkastet sparas först, så att samma villkor läses tillbaka.
  await expect(page.getByRole('region', { name: 'Sparat schemautkast', exact: true }).getByText('Sparat på servern', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(punkt(page, 'salar')).toHaveAttribute('data-status', 'genomgangen');
  expect(solves).toHaveLength(0);
  // Kontrollera underlaget söker hinder utan att lägga något schema.
  await page.unroute('**/api/schema/diagnos');
  const kontroller: unknown[] = [];
  await page.route('**/api/schema/diagnos', route => { kontroller.push(route.request().postDataJSON()); return route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }); });
  await oversikt(page).getByRole('button', { name: 'Kontrollera underlaget' }).click();
  await expect(oversikt(page)).toContainText(/inga (påvisade|kända) hinder/iu);
  expect(kontroller).toHaveLength(1); expect(solves).toHaveLength(0);
  await expect(omrade(page, 'underlag')).toContainText('undervisningar');
  if (process.env.SCHEMA_BILDER && info.project.name === 'desktop-1280') { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${process.env.SCHEMA_BILDER}/forbered.png`, fullPage: false }); }
  // Lägg schema är den andra ytan för samma utkast; valet minns.
  await page.locator('[data-ytval]').getByRole('button', { name: 'Lägg schema' }).click();
  await expect(oversikt(page)).toHaveCount(0); await expect(page.getByText('Inget förslag ännu.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ta fram schemaförslag' })).toHaveCount(1);
  await page.reload();
  await expect(page.locator('[data-ytval]').getByRole('button', { name: 'Lägg schema' })).toHaveAttribute('aria-current', 'page');
});

test('en aktivitet läggs till före första förslaget utan beräkning', async ({ page }) => {
  const solves = await utanBerakning(page), reads = await mockUnderlag(page);
  const sparningar: unknown[] = [];
  await page.route('**/api/schema/aktiviteter', route => { sparningar.push(1); return route.abort(); });
  await page.goto(URL);
  await forberedFlik(page, 'Prov och aktiviteter').click();
  const yta = omrade(page, 'aktiviteter');
  await expect(yta.getByRole('heading', { name: 'Återkommande aktiviteter' })).toBeVisible();
  await yta.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ny aktivitet', exact: true });
  await dialog.getByLabel('Namn', { exact: true }).fill('Mentorstid prov');
  await dialog.getByRole('combobox', { name: 'Veckodag', exact: true }).selectOption('0'); await dialog.getByLabel('Start', { exact: true }).fill('08:00');
  await dialog.getByLabel('Klass 1', { exact: true }).check();
  await dialog.getByLabel(base.resurser.larare[0].name, { exact: true }).check();
  await dialog.getByRole('button', { name: 'Lägg till aktivitet', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(punkt(page, 'aktiviteter')).toContainText('1 egen aktivitet');
  await expect(yta).toContainText('Mentorstid prov');
  await expect.poll(() => reads.at(-1)?.villkor.aktiviteter?.length).toBe(1);
  expect(solves).toHaveLength(0); expect(sparningar).toHaveLength(0);
});

test('Ta fram schemaförslag från Förbered går till Lägg schema och läget redovisas i överblicken', async ({ page }) => {
  await mockUnderlag(page);
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => route.fulfill({ headers, json: { ...base, villkor: route.request().postDataJSON().villkor } }));
  await page.goto(URL);
  await expect(oversikt(page)).toBeVisible();
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Tid · Alla pass har tid')).toBeVisible();
  await expect(page.locator('[data-lage="sal"]')).toContainText('Salbehov saknas för'); await expect(page.locator('[data-lage="kapacitet"]')).toContainText('Inga pass har sal att kontrollera');
  await expect(page.locator('[data-ytval]').getByRole('button', { name: 'Lägg schema' })).toHaveAttribute('aria-current', 'page');
  await expect(oversikt(page)).toHaveCount(0);
  await page.locator('[data-ytval]').getByRole('button', { name: 'Förbered' }).click();
  const oppna = oversikt(page).getByRole('button', { name: 'Öppna schemat', exact: true });
  await expect(oppna).toBeEnabled();
  await expect(omrade(page, 'underlag')).not.toContainText('Inget schemaförslag är beräknat.');
  await oversikt(page).getByRole('button', { name: 'Beräkningsval', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Räknetid per omgång', exact: true })).toHaveValue('30000');
  await expect(page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await oppna.click();
  await expect(page.locator('[data-ytval]').getByRole('button', { name: 'Lägg schema' })).toHaveAttribute('aria-current', 'page');
});

test('Förbered vid 200 % text på 1280 px: inget ligger utanför sidan', async ({ page }) => {
  await utanBerakning(page); await mockUnderlag(page); await sparadeVillkor(page, medSalar());
  await page.goto(URL);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  for (const namn of ['Underlag', 'Pass och salar', 'Lärartider och regler', 'Prov och aktiviteter'] as const) {
    await forberedFlik(page, namn).click();
    await expect(forberedFlik(page, namn)).toHaveAttribute('aria-current', 'page');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  }
});
