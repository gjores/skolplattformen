// 05.2-SM-UXF-22: salregister, salbehov som formulär och tabell med massändring. Simulerade rutter och syntetiska uppgifter; inget användarprov.
import { test, expect, forberedFlik, type Page } from './schema-test';
import { bas, mockUnderlag, utanBerakning } from './schema-underlag-mock';
import { defaultSchemaVillkor, type SchemaVillkor } from '../lib/schema-contract.ts';
import { laggTillSal, overforSalnamn } from '../lib/schema-salregister.ts';

const URL = '/e2e/fixtures/schema-preview.html', UNIT = '52a10000-0000-4000-8000-000000000001';
const sal = (name: string, typ: string, platser: number | null, utrustning: string[] = []) => ({ name, typ, platser, utrustning });
function register(): SchemaVillkor {
  let v: SchemaVillkor = { ...defaultSchemaVillkor(), timeBasis: 'lasar' };
  for (const s of [sal('A101', 'Allmän sal', 32), sal('A102', 'Allmän sal', 20), sal('Labb 1', 'Laborationssal', 24, ['dragskåp']), sal('Labb 2', 'Laborationssal', 18, ['dragskåp']), sal('Musiksal', 'Specialsal', null, ['instrument'])]) v = laggTillSal(v, s);
  return v;
}
/** Villkoren minns i webbläsaren per skola; proven börjar från ett sparat läge utan att gå via formuläret. */
async function sparadeVillkor(page: Page, villkor: SchemaVillkor) {
  await page.addInitScript(([unit, value]) => {
    window.localStorage.setItem(`schema-villkor:${unit}`, value);
  }, [UNIT, JSON.stringify(villkor)] as const);
}
async function nySal(page: Page, namn: string, typ: string, platser: string, utrustning = '') {
  const reg = page.locator('[data-salregister]');
  await reg.getByRole('button', { name: 'Lägg till sal' }).click();
  const form = page.locator('[data-salform]');
  await form.getByLabel('Salens namn').fill(namn); await form.getByLabel('Saltyp').fill(typ); await form.getByLabel('Platser').fill(platser); await form.getByLabel('Utrustning').fill(utrustning);
  await form.getByRole('button', { name: 'Lägg till salen' }).click();
  await expect(form).toHaveCount(0);
}

test('salregistret ger fasta ID, och salbehovet visar varför en sal är olämplig innan det sparas', async ({ page }) => {
  const berakningar = await utanBerakning(page), reads = await mockUnderlag(page);
  await page.goto(URL);
  await forberedFlik(page, 'Pass och salar').click();
  const salar = page.locator('[data-salar]');
  await expect(salar.getByText('Inget salregister')).toBeVisible();
  await nySal(page, 'A101', 'Allmän sal', '32'); await nySal(page, 'Labb 1', 'Laborationssal', '24', 'dragskåp'); await nySal(page, 'Labb 2', 'Laborationssal', '18', 'Dragskåp'); await nySal(page, 'Musiksal', 'Specialsal', '', 'instrument');
  await expect(salar.locator('[data-sal]')).toHaveCount(4);
  await expect(salar.locator('[data-sal="sal-3"]')).toContainText('Labb 2'); await expect(salar.locator('[data-sal="sal-4"]')).toContainText('Ej angivet');
  await expect(salar.getByText('Platser saknas för 1 sal')).toBeVisible();
  await expect(salar.getByText(`${bas.fordelning.length} av ${bas.fordelning.length} salbehov obesvarade`)).toBeVisible();
  // Samma namn nekas; ett borttaget nummer återanvänds inte.
  await salar.locator('[data-salregister]').getByRole('button', { name: 'Lägg till sal' }).click();
  await page.locator('[data-salform]').getByLabel('Salens namn').fill('labb 1');
  await expect(page.locator('[data-salform]').getByRole('alert')).toContainText('redan det namnet');
  await page.locator('[data-salform]').getByRole('button', { name: 'Avbryt' }).click();
  await salar.getByRole('button', { name: 'Ta bort sal Labb 1' }).click();
  await expect(salar.locator('[data-sal="sal-2"]')).toHaveCount(0); await expect(salar.locator('[data-sal="sal-3"]')).toContainText('Labb 2');
  await nySal(page, 'Labb 1', 'Laborationssal', '24', 'dragskåp');
  await expect(salar.locator('[data-sal="sal-5"]')).toContainText('Labb 1');
  // Salbehov för första undervisningen (22 elever): dragskåp ger Labb 1; Labb 2 är för liten och A101 saknar dragskåp.
  const behov = salar.locator('[data-salbehov]');
  await expect(behov.getByText('22 elever i gruppen.', { exact: false })).toBeVisible();
  await behov.getByRole('radio', { name: 'Särskilda salskrav' }).check();
  await expect(behov.getByRole('alert')).toContainText('Ange minst ett krav');
  await behov.getByLabel('dragskåp', { exact: true }).check();
  const lista = behov.locator('[data-lampliga]');
  await expect(lista.locator('li', { hasText: 'Labb 1' })).toContainText('Lämplig');
  await expect(lista.locator('li', { hasText: 'Labb 2' })).toContainText('18 platser, gruppen har 22 elever.');
  await expect(lista.locator('li', { hasText: 'A101' })).toContainText('Saknar dragskåp.');
  await expect(lista).toContainText('1 lämplig sal.');
  // Avbryt lämnar salbehovet obesvarat; Spara gör det gällande.
  await behov.getByRole('button', { name: 'Avbryt' }).click();
  await expect(behov.getByRole('radio', { name: 'Obesvarat' })).toBeChecked();
  await behov.getByRole('radio', { name: 'Särskilda salskrav' }).check(); await behov.getByLabel('dragskåp', { exact: true }).check();
  await behov.getByRole('button', { name: 'Spara salbehov' }).click();
  await expect(salar.getByText(`${bas.fordelning.length - 1} av ${bas.fordelning.length} salbehov obesvarade`)).toBeVisible();
  await expect(behov.getByText('Gällande salbehov: Särskilda salskrav · dragskåp (eget undantag).', { exact: false })).toBeVisible();
  // Två krav som ingen sal uppfyller ger ett namngivet hinder.
  await behov.getByLabel('Saltyp').selectOption('Specialsal');
  await expect(lista.getByText('Ingen sal uppfyller alla krav: saltyp specialsal, dragskåp, minst 22 platser.', { exact: false })).toBeVisible();
  await behov.getByRole('button', { name: 'Spara salbehov' }).click();
  await expect(salar.locator('[data-salhinder]')).toContainText('har ingen sal som uppfyller alla krav');
  await expect(salar.getByText('1 utan lämplig sal')).toBeVisible();
  if (process.env.SCHEMA_BILDER) await salar.screenshot({ path: `${process.env.SCHEMA_BILDER}/salar-formular.png` });
  expect(berakningar).toHaveLength(0);
  // Registret och salbehoven lästes om från underlaget med stabila ID.
  await expect.poll(() => reads.at(-1)?.villkor.salbehov?.[0]?.typ).toBe('Specialsal');
  expect(reads.at(-1)!.villkor.salregister!.salar.map(s => s.id)).toEqual(['sal-1', 'sal-3', 'sal-4', 'sal-5']);
});

test('äldre salnamn gäller tills de uttryckligen förs över, och behåller då sina nummer', async ({ page }) => {
  await utanBerakning(page); const reads = await mockUnderlag(page);
  const gammalt: SchemaVillkor = { ...defaultSchemaVillkor(), salar: ['Idrottshallen', 'Labbet'], egna: [{ slag: 'sal', ref: 'Labbet', typ: 'sparrad', days: [4], startMin: 480, endMin: 720 }] };
  await sparadeVillkor(page, gammalt);
  await page.goto(URL);
  await forberedFlik(page, 'Pass och salar').click();
  const salar = page.locator('[data-salar]'), overforing = salar.locator('[data-overforing]');
  await expect(overforing).toContainText('2 salar finns som namn från äldre villkor: Idrottshallen, Labbet.');
  await expect(salar.locator('[data-salregister]').getByRole('button', { name: 'Lägg till sal' })).toHaveCount(0);
  await expect.poll(() => reads.length).toBeGreaterThan(0);
  expect(reads.at(-1)!.villkor.salregister).toBeUndefined();
  await overforing.getByRole('button', { name: 'För över salnamnen till salregistret' }).click();
  await expect(salar.locator('[data-sal="sal-2"]')).toContainText('Labbet'); await expect(salar.locator('[data-sal="sal-2"]')).toContainText('Ej angiven');
  // Namnbyte följer med i salens spärr.
  await salar.getByRole('button', { name: 'Ändra sal Labbet' }).click();
  await page.locator('[data-salform]').getByLabel('Salens namn').fill('Labb 1');
  await page.locator('[data-salform]').getByRole('button', { name: 'Spara salen' }).click();
  await forberedFlik(page, 'Lärartider och regler').click();
  await page.getByRole('heading', { name: 'Villkor för schemat' }).click();
  await expect(page.getByRole('list', { name: 'Egna villkor' })).toContainText('Sal Labb 1: spärrad fredag 08:00–12:00');
  expect(overforSalnamn(gammalt).salregister!.arv).toEqual(['Idrottshallen', 'Labbet']);
});

test('tabellen ändrar 20 undervisningar på en gång, bevarar två undantag och visar samma värde i formuläret', async ({ page }) => {
  const berakningar = await utanBerakning(page); await mockUnderlag(page);
  await sparadeVillkor(page, register());
  await page.goto(URL);
  await forberedFlik(page, 'Pass och salar').click();
  const salar = page.locator('[data-salar]');
  await salar.getByRole('button', { name: 'Tabell' }).click();
  const tabell = salar.locator('[data-saltabell]');
  await tabell.getByLabel('Sök undervisning eller grupp').fill('Klass 1');
  const filtrerade = bas.fordelning.filter(r => `${r.title} ${r.classes.join(', ')}`.toLocaleLowerCase('sv').includes('klass 1'));
  expect(filtrerade.length).toBeGreaterThanOrEqual(22);
  await expect(tabell.getByText(`Visar ${filtrerade.length} av ${bas.fordelning.length} undervisningar.`)).toBeVisible();
  // Markera 22 rader, avmarkera två undantag.
  for (const r of filtrerade.slice(0, 22)) await tabell.locator(`[data-rad="${r.ref}"]`).getByRole('checkbox').check();
  for (const r of filtrerade.slice(0, 2)) await tabell.locator(`[data-rad="${r.ref}"]`).getByRole('checkbox').uncheck();
  await expect(tabell.getByText('20 valda')).toBeVisible();
  await expect(tabell.getByText('Nuvarande värden bland de valda: samma (20 obesvarade).', { exact: false })).toBeVisible();
  await tabell.getByRole('button', { name: 'Förhandsgranska ändringen' }).click();
  const visning = tabell.locator('[data-forhandsvisning]');
  await expect(visning.locator('[data-antal="andras"]')).toContainText('20'); await expect(visning.locator('[data-antal="oforandrade"]')).toContainText('0');
  await expect(visning.locator('[data-antal="omarkerade"]')).toContainText(String(filtrerade.length - 20));
  // Avbryt ändrar ingenting.
  await visning.getByRole('button', { name: 'Avbryt' }).click();
  await expect(tabell.locator(`[data-rad="${filtrerade[5].ref}"]`)).toContainText('Obesvarat');
  await tabell.getByRole('button', { name: 'Förhandsgranska ändringen' }).click();
  await visning.getByRole('button', { name: 'Ändra 20 undervisningar' }).click();
  await expect(tabell.getByText('Salbehovet är ändrat för 20 undervisningar.', { exact: false })).toBeVisible();
  await expect(tabell.locator(`[data-rad="${filtrerade[5].ref}"]`)).toContainText('Lämplig allmän sal');
  await expect(tabell.locator(`[data-rad="${filtrerade[5].ref}"]`)).toContainText('Eget undantag');
  for (const r of filtrerade.slice(0, 2)) await expect(tabell.locator(`[data-rad="${r.ref}"]`)).toContainText('Obesvarat');
  // 22 elever: A101 (32 platser) räcker, A102 (20) är för liten. Lämpliga salar räknas om när underlaget lästs.
  await expect(tabell.locator(`[data-rad="${filtrerade[5].ref}"]`).getByRole('cell').last()).toHaveText('1');
  if (process.env.SCHEMA_BILDER) await salar.screenshot({ path: `${process.env.SCHEMA_BILDER}/salar-tabell.png` });
  // Samma värde i formuläret.
  await tabell.locator(`[data-rad="${filtrerade[5].ref}"]`).getByRole('button', { name: filtrerade[5].title }).click();
  const behov = salar.locator('[data-salbehov]');
  await expect(behov.getByRole('radio', { name: 'Lämplig allmän sal' })).toBeChecked();
  await expect(behov.locator('[data-lampliga] li', { hasText: 'A102' })).toContainText('20 platser, gruppen har 22 elever.');
  expect(berakningar).toHaveLength(0);
});

test('salvyerna vid 200 % text på 1280 px: inget ligger utanför sidan', async ({ page }) => {
  await utanBerakning(page); await mockUnderlag(page); await sparadeVillkor(page, register());
  await page.goto(URL);
  await forberedFlik(page, 'Pass och salar').click();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  const salar = page.locator('[data-salar]');
  await expect(salar.locator('[data-salbehov]')).toBeVisible();
  await salar.getByRole('button', { name: 'Tabell' }).click();
  await expect(salar.locator('[data-saltabell]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
