---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: DECISION-02
status: completed
requirements: [ADMIN-02, ADMIN-04]
---

# Låst beslutskedja i databasen

2026-10-12. Migration `20261012180000_plan_decision_flow.sql` tillför separat programgranskning, oföränderlig historik och kvitton, innehållsfingeravtryck och transaktionsbundna skrivtillstånd. Faktiskt mandat och skola kontrolleras; plan och granskning låses och revisionskontrolleras. Återsändning kräver motivering. Inskickat innehåll är låst även via äldre redigeringsvägar. Fastställande ersätter tidigare fastställd version atomiskt utan att flytta klasskopplingar.

Installerad ursprungsmigration bevaras. Ett runtimefel i kvalificeringen av en lokal PL/pgSQL-variabel upptäcktes i verkligt prov och rättades framåtriktat genom `20261012180100_plan_decision_command_fix.sql`. Endast kommandofunktionens definition ändrades. 34 SQL-/TypeScript-kontroller passerade med rättningen i rollbacktransaktionen, inklusive båda beslutscyklerna, fel mandat, CAS, replay, låsning och auditrollback. Separata rollback-/installationsgrindar bevarade 15 befintliga verksamhetstabeller och fyra nya beslutstabeller samt orelaterade definitioner och rättigheter. Detta påstår inte radbevarande för samtliga publika tabeller; säkerhetsloggen är separat.

Verifierare: `work/pilot/verify-plan-decision-flow.mjs`, `apply-plan-decision-flow.mjs` och `apply-plan-decision-repair.mjs`. Nya Worker-rättigheter förblir stängda tills faktisk API-verifiering enligt DECISION-03. Profilen omfattar högskoleförberedande Gy25; okända/yrkesprofiler blockeras. Full ADMIN-02/04 och fasacceptans återstår.
