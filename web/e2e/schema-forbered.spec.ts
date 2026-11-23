// 05.2-SM-UXFLODE: Förbered-ytan och förutsättningar före första förslaget, mot uttryckligt simulerade rutter och syntetiska uppgifter. Inget användarprov.
import { test, expect, schemaTestDraft, type Page } from './schema-test';
import { bas as base, headers, mockUnderlag, olagt, utanBerakning } from './schema-underlag-mock';
import { SCHEMA_CONTRACT_VERSION, defaultSchemaVillkor, type SchemaForslag, type SchemaForslagRequest, type SchemaVillkor } from '../lib/schema-contract.ts';
import { parseSchemaDraftSave } from '../lib/schema-draft-contract.ts';
import { nastaUppgift, schemaForbered } from '../lib/schema-forbered.ts';
import { laggTillSal } from '../lib/schema-salregister.ts';

const URL = '/e2e/fixtures/schema-preview.html', UNIT = '52a10000-0000-4000-8000-000000000001';
const omrade = (page: Page, id: string) => page.locator(`[data-omrade="${id}"]`), punkt = (page: Page, id: string) => page.locator(`[data-punkt="${id}"]`);
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
  await expect(page.getByText('Inget förslag ännu.')).toBeVisible();
  // Eget villkor för en klass, före första förslaget.
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
  await omrade(page, 'lektioner').getByText('Antal lektioner per undervisning').click();
  await expect(omrade(page, 'lektioner').getByText(base.fordelning[0].title).first()).toBeVisible();
  await omrade(page, 'larartider').locator('summary', { hasText: 'Villkor i tabell' }).click();
  await expect(omrade(page, 'larartider').getByRole('heading', { name: 'Villkor i tabell' })).toBeVisible();
  await omrade(page, 'larartider').getByRole('tab', { name: /Lärare/u }).click();
  await expect(omrade(page, 'larartider').getByText(base.resurser.larare[0].name).first()).toBeVisible();
  expect(solves).toHaveLength(0);
});

test('misslyckad underlagsläsning hindrar inte villkoren och går att göra om', async ({ page }) => {
  await page.goto(URL);
  const underlag = omrade(page, 'underlag');
  await expect(underlag).toContainText('Underlaget kunde inte läsas.');
  await expect(punkt(page, 'salar')).toContainText('Underlaget är inte läst');
  await page.getByRole('heading', { name: 'Villkor för schemat' }).click();
  await expect(page.locator('.schema-egna-form')).toHaveCount(0);
  await mockUnderlag(page);
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
  await expect(page.locator('[data-fraga="3"]')).toContainText('Inaktuellt förslag');
  await expect(felaktigtHinder).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ta fram nytt förslag från aktuellt underlag' })).toBeEnabled();
  expect(lasningar.map(r => r.period)).toEqual(['lasar', 'lasar']);
  expect(berakningar).toHaveLength(0);
  expect(schemaDraftServer.saves).toHaveLength(0);
  expect(schemaDraftServer.drafts.get(scope)).toEqual(draft);
});

test('checklistan har sju punkter, en nästa uppgift och en genomgång som blir inaktuell när innehållet ändras', async ({ page }, info) => {
  const solves = await utanBerakning(page); await mockUnderlag(page);
  const villkor = medSalar(); await sparadeVillkor(page, villkor);
  await page.goto(URL);
  await expect(page.locator('[data-ytval]').getByRole('button', { name: 'Förbered' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-checklista] li[data-punkt]')).toHaveCount(7);
  await expect(page.locator('[data-klara]')).toHaveText('0 av 7 genomgångna');
  await expect(punkt(page, 'salar')).toContainText(`3 salar · 0 av ${base.fordelning.length} undervisningar har salbehov · ${base.fordelning.length} obesvarade`);
  await expect(punkt(page, 'aktiviteter')).toContainText('Provtid redovisas separat från undervisningstiden.');
  // Nästa uppgift är densamma som appens egen beräkning på samma underlag, och säger varför.
  const vantad = nastaUppgift(schemaForbered({ kalla: olagt(villkor), villkor, las: 0 }), {})!;
  await expect(page.locator(`[data-nasta="${vantad.omrade}"]`)).toContainText(vantad.text.slice(1));
  // Maskinen bockar inte av: inget område är genomgånget förrän en person kryssar.
  await expect(page.locator('li[data-status="genomgangen"]')).toHaveCount(0);
  await punkt(page, 'salar').getByRole('button', { name: 'Ange salbehov: Salar' }).click();
  await expect(page.locator('#forbered-salar-rubrik')).toBeFocused();
  await punkt(page, 'salar').getByRole('checkbox').check();
  await expect(punkt(page, 'salar')).toHaveAttribute('data-status', 'genomgangen'); await expect(page.locator('[data-klara]')).toHaveText('1 av 7 genomgångna');
  // Ändrat salbehov gör genomgången inaktuell; övriga områden berörs inte.
  const behov = omrade(page, 'salar').locator('[data-salbehov]');
  await behov.getByRole('radio', { name: 'Lämplig allmän sal' }).check();
  await behov.getByRole('button', { name: 'Spara salbehov' }).click();
  await expect(punkt(page, 'salar')).toHaveAttribute('data-status', 'andrat'); await expect(punkt(page, 'salar')).toContainText('Ändrat sedan genomgången');
  await expect(page.locator('[data-klara]')).toHaveText('0 av 7 genomgångna');
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
  // Förutsättningar just nu: fyra frågor med egna besked, bara det som faktiskt räknas.
  const kort = page.locator('[data-forutsattningar]');
  await expect(kort.locator('[data-fraga="1"]')).toContainText('Behöver kompletteras'); await expect(kort.locator('[data-fraga="2"]')).toContainText('Inte beräknat');
  await expect(kort.locator('[data-fraga="3"]')).toContainText('Inte prövat'); await expect(kort.locator('[data-fraga="4"]')).toContainText('Kvaliteten är inte prövad');
  await expect(kort.locator('[data-ta-fram]')).toContainText('Ett förslag nu kan ha luckor i underlaget');
  expect(solves).toHaveLength(0);
  // Kontrollera underlaget söker hinder utan att lägga något schema.
  await page.unroute('**/api/schema/diagnos');
  const kontroller: unknown[] = [];
  await page.route('**/api/schema/diagnos', route => { kontroller.push(route.request().postDataJSON()); return route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }); });
  await kort.getByRole('button', { name: 'Kontrollera underlaget' }).click();
  await expect(kort.locator('[data-fraga="3"]')).toContainText('Kontrollerat, inga påvisade hinder'); await expect(kort.locator('[data-fraga="3"]')).toContainText('bevisar inte att hela schemat går att lägga');
  expect(kontroller).toHaveLength(1); expect(solves).toHaveLength(0);
  await expect(omrade(page, 'underlag')).toContainText('undervisningar');
  if (process.env.SCHEMA_BILDER && info.project.name === 'desktop-1280') { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${process.env.SCHEMA_BILDER}/forbered.png`, fullPage: false }); }
  // Lägg schema är den andra ytan för samma utkast; valet minns.
  await page.locator('[data-ytval]').getByRole('button', { name: 'Lägg schema' }).click();
  await expect(page.locator('[data-checklista]')).toHaveCount(0); await expect(page.getByText('Inget förslag ännu.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ta fram schemaförslag' })).toHaveCount(1);
  await page.reload();
  await expect(page.locator('[data-ytval]').getByRole('button', { name: 'Lägg schema' })).toHaveAttribute('aria-current', 'page');
});

test('en aktivitet läggs till före första förslaget utan beräkning', async ({ page }) => {
  const solves = await utanBerakning(page), reads = await mockUnderlag(page);
  const sparningar: unknown[] = [];
  await page.route('**/api/schema/aktiviteter', route => { sparningar.push(1); return route.abort(); });
  await page.goto(URL);
  const yta = omrade(page, 'aktiviteter');
  await expect(yta.getByRole('heading', { name: 'Återkommande aktiviteter' })).toBeVisible();
  await yta.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ny aktivitet', exact: true });
  await dialog.getByRole('textbox', { name: 'Namn', exact: true }).fill('Mentorstid prov');
  await dialog.getByRole('combobox', { name: 'Veckodag', exact: true }).selectOption('0'); await dialog.getByLabel('Start', { exact: true }).fill('08:00');
  await dialog.getByRole('checkbox', { name: 'Klass 1', exact: true }).check();
  await dialog.getByLabel(base.resurser.larare[0].name, { exact: true }).check();
  await dialog.getByRole('button', { name: 'Lägg till aktivitet', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(punkt(page, 'aktiviteter')).toContainText('1 egen aktivitet');
  await expect(yta).toContainText('Mentorstid prov');
  await expect.poll(() => reads.at(-1)?.villkor.aktiviteter?.length).toBe(1);
  expect(solves).toHaveLength(0); expect(sparningar).toHaveLength(0);
});

test('Ta fram schemaförslag från Förbered går till Lägg schema, och förslaget redovisas i Förutsättningar just nu', async ({ page }) => {
  await mockUnderlag(page);
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => route.fulfill({ headers, json: { ...base, villkor: route.request().postDataJSON().villkor } }));
  await page.goto(URL);
  await expect(page.locator('[data-checklista]')).toBeVisible();
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Tid · Alla pass har tid')).toBeVisible();
  await expect(page.locator('[data-lage="sal"]')).toContainText('Salbehov saknas för'); await expect(page.locator('[data-lage="kapacitet"]')).toContainText('Inga pass har sal att kontrollera');
  await expect(page.locator('[data-ytval]').getByRole('button', { name: 'Lägg schema' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-checklista]')).toHaveCount(0);
  await page.locator('[data-ytval]').getByRole('button', { name: 'Förbered' }).click();
  const kort = page.locator('[data-forutsattningar]');
  await expect(kort.locator('[data-fraga="3"]')).toContainText('Förslag beräknat'); await expect(kort.locator('[data-fraga="4"]')).toContainText('Tid · Alla pass har tid');
  await expect(omrade(page, 'underlag')).not.toContainText('Inget schemaförslag är beräknat.');
});

test('Förbered vid 200 % text på 1280 px: inget ligger utanför sidan', async ({ page }) => {
  await utanBerakning(page); await mockUnderlag(page); await sparadeVillkor(page, medSalar());
  await page.goto(URL);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(page.locator('[data-checklista] li[data-punkt]')).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
