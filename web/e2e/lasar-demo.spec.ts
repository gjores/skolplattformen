// Demoregression för Läsår & skoldagar i exempelläget (plan 05.1.1-01, LASAR-01).
//
// Demovyn (app/lasar-view.tsx) är förlagan för den skyddade vyn och får inte
// ändras när delade komponenter bryts ut. Provet tar ett fingeravtryck av
// `.ly-layout` för rektor och huvudman i projekten desktop och phone och
// jämför det exakt med e2e/fixtures/lasar-demo-baseline.json.
//
// Fingeravtrycket: varje element i DOM-ordning med djup, tagg, class,
// aria-pressed, aria-label, disabled och elementets egen trimmade text
// (bara direkta textnoder). Klockan är fast, så att dagens datum inte
// flyttar markeringar.
//
// Skrivläge: LASAR_DEMO_BASELINE=write. Det vägrar skriva om
// app/lasar-view.tsx har ändringar i arbetskopian. Skärmbilder sparas i
// /private/tmp/lasar-demo/ för jämförelse sida vid sida, aldrig i Git.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

type Entry = {
  depth: number;
  tag: string;
  class: string | null;
  ariaPressed: string | null;
  ariaLabel: string | null;
  disabled: boolean;
  text: string;
};
type Baseline = Record<string, Entry[]>;

const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(here, 'fixtures', 'lasar-demo-baseline.json');
const VIEW = path.join(here, '..', 'app', 'lasar-view.tsx');
const SHOTS = '/private/tmp/lasar-demo';
const WRITE = process.env.LASAR_DEMO_BASELINE === 'write';
const NOW = new Date('2026-10-15T10:00:00Z');

const isPhone = () => test.info().project.name === 'phone';

async function awaitHydration(page: Page) {
  await page.waitForFunction(() => {
    const el = document.getElementById('exempelskola');
    return !!el && Object.keys(el).some((key) => key.startsWith('__reactProps'));
  });
}

async function revealSidebar(page: Page, target: ReturnType<Page['getByRole']>) {
  if (await target.isVisible()) return;
  await page.getByRole('button', { name: 'Visa eller dölj navigation' }).click();
  await expect(target).toBeVisible();
}

async function settleSidebar(target: ReturnType<Page['getByRole']>) {
  if (isPhone()) await expect(target).toBeHidden();
}

async function chooseRole(page: Page, role: 'Huvudman' | 'Rektor') {
  const button = page.getByRole('button', { name: role, exact: true });
  await revealSidebar(page, button);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await settleSidebar(button);
}

async function openNav(page: Page, label: string) {
  const item = page.getByRole('button', { name: label, exact: true });
  await revealSidebar(page, item);
  await item.click();
  await expect(item).toHaveAttribute('aria-current', 'page');
  await settleSidebar(item);
}

async function fingerprint(page: Page): Promise<Entry[]> {
  return page.locator('.ly-layout').evaluate((root) => {
    const out: Entry[] = [];
    const walk = (el: Element, depth: number) => {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      out.push({
        depth,
        tag: el.tagName.toLowerCase(),
        class: el.getAttribute('class'),
        ariaPressed: el.getAttribute('aria-pressed'),
        ariaLabel: el.getAttribute('aria-label'),
        disabled: el.hasAttribute('disabled'),
        text: own,
      });
      for (const child of Array.from(el.children)) walk(child, depth + 1);
    };
    walk(root, 0);
    return out;
  });
}

/** Läser fingeravtrycket tills två läsningar i rad är lika, så att sena renderingar inte mäts. */
async function stableFingerprint(page: Page): Promise<Entry[]> {
  let previous = JSON.stringify(await fingerprint(page));
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(300);
    const next = await fingerprint(page);
    const json = JSON.stringify(next);
    if (json === previous) return next;
    previous = json;
  }
  throw new Error('Demovyns DOM blev inte stabil inom sex sekunder.');
}

function readBaseline(): Baseline {
  return existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline) : {};
}

function assertViewUnchanged() {
  const status = execFileSync('git', ['status', '--porcelain', '--', VIEW], { encoding: 'utf8' }).trim();
  if (status) throw new Error(`Skrivläget vägrar: app/lasar-view.tsx har ändringar i arbetskopian (${status}).`);
}

function firstDifference(expected: Entry[], actual: Entry[]): string | null {
  const n = Math.max(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    const a = JSON.stringify(expected[i] ?? null);
    const b = JSON.stringify(actual[i] ?? null);
    if (a !== b) {
      return [
        `Första avvikelse vid element ${i} (baslinjen har ${expected.length}, demon nu ${actual.length}).`,
        `  baslinje: ${a}`,
        `  nu:       ${b}`,
      ].join('\n');
    }
  }
  return null;
}

for (const role of ['Rektor', 'Huvudman'] as const) {
  test(`Läsår & skoldagar som ${role.toLowerCase()} stämmer med baslinjen`, async ({ page }, testInfo) => {
    await page.clock.install({ time: NOW });
    await page.goto('/');
    await expect(page.getByText('Provmiljö', { exact: true })).toBeVisible();
    await awaitHydration(page);
    await chooseRole(page, role);
    await openNav(page, 'Läsår & skoldagar');
    await expect(page.locator('.ly-layout')).toBeVisible();
    await expect(page.locator('.ly-layout .tp-cover h2')).toBeVisible();

    const actual = await stableFingerprint(page);
    const key = `${testInfo.project.name}/${role.toLowerCase()}`;

    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `${testInfo.project.name}-${role.toLowerCase()}.png`), fullPage: true });

    if (WRITE) {
      assertViewUnchanged();
      const baseline = readBaseline();
      baseline[key] = actual;
      // Ett element per rad: läsbara skillnader i Git utan att filen sväller.
      const body = Object.keys(baseline)
        .sort()
        .map((k) => `${JSON.stringify(k)}: [\n${baseline[k].map((e) => `  ${JSON.stringify(e)}`).join(',\n')}\n]`)
        .join(',\n');
      mkdirSync(path.dirname(BASELINE), { recursive: true });
      writeFileSync(BASELINE, `{\n${body}\n}\n`);
      testInfo.annotations.push({ type: 'baslinje', description: `${key}: ${actual.length} element skrivna` });
      return;
    }

    const expected = readBaseline()[key];
    expect(expected, `Baslinjen saknar posten ${key}. Kör med LASAR_DEMO_BASELINE=write på oförändrad demo.`).toBeTruthy();
    const diff = firstDifference(expected, actual);
    expect(diff, diff ?? '').toBeNull();
    testInfo.annotations.push({ type: 'baslinje', description: `${key}: ${actual.length} element lika` });
  });
}
