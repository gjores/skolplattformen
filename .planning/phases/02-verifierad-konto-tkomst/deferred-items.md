# Uppskjutna fynd i fas 2

## 2026-09-14 — befintliga npm-sårbarheter i lokal byggkedja

`npm audit --json` rapporterar fyra höga varningar via `@cloudflare/vite-plugin`, `wrangler`, `miniflare` och `sharp`. De berörda direkta beroendena och den sårbara `sharp`-versionen fanns i låsfilen före plan 02-01; `openid-client`, `postgres` och `otpauth` är inte källan till varningarna.

Att uppgradera Cloudflare/Vinext-byggkedjan ligger utanför plan 02-01 och kan påverka hela appens bygg- och Workerbeteende. Hantera fyndet som avgränsat beroendeunderhåll med full bygg-, preview- och browserregression innan pilotdrift.
