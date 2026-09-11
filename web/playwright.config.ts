// Browserprov för fas 1 (plan 01-08). Varje projekt startar sin egen
// deterministiska server via scripts/run-mode.mjs och återanvänder aldrig
// en främmande instans (reuseExistingServer: false), så att en gammal
// .env.local eller en redan igång dev-server inte kan påverka utfallet.
//
// Projektet `built` förhandsvisar dist/ med wrangler via `preview:example`,
// som kräver ett färskt exempelbygge: kör `npm run build:example` före
// `npx playwright test`. Sammanställaren i plan 01-10 (verify-phase1.mjs)
// gör detta automatiskt.
//
// Vinext håller en projektgemensam dev-låsfil (.vinext/dev/lock.json), så
// exempel- och blockerad-servern kan inte starta samtidigt utan
// VINEXT_NO_DEV_LOCK=1. Portarna är ändå skilda (5191/5192).
import { defineConfig, devices } from '@playwright/test';

const example = 'http://127.0.0.1:5191';
const blocked = 'http://127.0.0.1:5192';
const built = 'http://127.0.0.1:3011';
const devEnv = { VINEXT_NO_DEV_LOCK: '1' };

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/phase1-e2e.json' }]],
  use: { trace: 'retain-on-failure', locale: 'sv-SE' },
  projects: [
    {
      name: 'desktop',
      testMatch: /phase1-baseline\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: example, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'phone',
      testMatch: /phase1-baseline\.spec\.ts/,
      use: { ...devices['iPhone 13'], baseURL: example },
    },
    {
      name: 'blocked',
      testMatch: /phase1-isolation\.spec\.ts/,
      grep: /blockerad/,
      use: { ...devices['Desktop Chrome'], baseURL: blocked },
    },
    {
      name: 'built',
      testMatch: /phase1-isolation\.spec\.ts/,
      grep: /byggd/,
      use: { ...devices['Desktop Chrome'], baseURL: built },
    },
  ],
  webServer: [
    { command: 'npm run dev:example:test', url: example, reuseExistingServer: false, timeout: 120_000, env: devEnv },
    { command: 'npm run dev:blocked:test', url: blocked, reuseExistingServer: false, timeout: 120_000, env: devEnv },
    { command: 'npm run preview:example', url: built, reuseExistingServer: false, timeout: 120_000 },
  ],
});
