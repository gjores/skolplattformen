# Stack

Kartlagt 2026-09-10 från aktuell kod. Versioner nedan är deklarerade i `web/package.json`, inte en ny rekommendation eller säkerhetskontroll.

- Webb: React `^19.2.8`, TypeScript `5.9.3`, Vinext `^1.0.0-beta.9`, Vite `^8.2.2`.
- UI: Base UI `1.7.0`, Shadcn, Lucide, globala CSS-regler och Tailwind/PostCSS-konfiguration.
- Data: `@supabase/supabase-js ^2.115.0`, Supabase Auth, Postgres med radnivåskydd, SQL-funktioner/triggers och förberedd privat fillagring.
- Körning: Node >=22.13 enligt paketet; Node 24 har använts för kontroller. Vinext/Cloudflare-adapter i `web/vite.config.ts`.
- Kontroller: Node test runner för `web/lib/*.test.mjs`, TypeScript, Oxlint och produktionsbygge. Separata databaskontroller i `work/supabase/`.
- Lokal utveckling: `web/` är paketrot. GSD/Git rot är katalogen ovanför. Kör inte paketkommandon från projektroten utan `cd web` eller motsvarande arbetskatalog.

Supabase-URL och publik klientnyckel läses från miljön. Hemligheter och anslutningsvärden ska inte kopieras till planeringen. Ingen driftplattform har certifierats eller valts för kommunal produktion.
