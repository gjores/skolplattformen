---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "38"
status: passed
scope: local-synthetic-backend-only
verified: 2026-10-07
must_haves: 3/3
---

# 05-38 — Oberoende verifiering

Oberoende read-only GSD-verifierare och roots faktiska resultatkontroll ger avgränsat **passed**, tre av tre must-haves. Produktkoden innehåller riktig sessions-/mandatbunden RPC-koppling och strikt svarsprojektion; inga stubs. Vald schoolYear projicerar underlaget, medan aktuellt serverdatum fortsatt styr mandat. Setup + huvudläsning och båda Worker-audits ligger i samma transaktion med required audit.

Preflight och slutprov har vardera exakt 15 namngivna PASS och 247 lyckade kontroller, samma aktuella källhashar, sourcecommit f0b14fb och actual Worker-bygge d59ec10 på 3060. Båda är kompletta, utan reset; cleanup PASS. Auditfel 503 släpper inga planeringsdata/lyckade händelser; ogiltigt urval/främmande scope/epok/session/återkallat mandat nekas. Stale urval ger 409/reloadSelection.

Apply kräver stängd originalfoundation/journal, sourcebunden faktisk preflight och exakt rå ACL-återställning. Enda ACL-diff är selection(), list(jsonb) och overview(jsonb); 25→28 Worker-entrypoints och 11 hjälpare fortsatt stängda. Alla övriga definitioner, tabell-ACL/RLS och journal består utöver exakt grantjournal. Alla 15 originaltabellers hela rader inklusive tidsstämplar är hashidentiska; befintlig och ny audit samt dess identitetsankare bevaras. Främmande kundens två audithändelser har två kompletta ankarkedjor.

Legacy IM200 använder full veckoram; nulllegacy separat400 utan lyckad audit, med verklig lucka i nya årsöversikten. Ingen framtidsläsning skriver verksamhetsdata. Första FAIL/setupförsök bevaras och provändringarnas orsaker finns i SUMMARY.

Inga blockerande gap inom 05-38. Den långsamma 52-raderslistan har separat korrektiv plan innan UI. UI, mänskligt prov, fulla PLANERING-/ADMIN-krav, hela fas 5 och verklig anslutning är inte verifierade av detta backendsteg. Verifieraren ändrade ingen fil, databas eller commit.
