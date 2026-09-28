---
phase: 04
wave: 1
status: awaiting_user
completed_plans: [04-01]
next_plans: [04-02, 04-07, 04-08]
---

# Kontrollpunkt efter första vågen

Registerkontrakt och rena datumregler är implementerade. 04-01 har två färdiga uppgifter med RED/GREEN och atomiska commits: `494116a`, `a8cae38`, `3b4c26b`. Se `04-01-SUMMARY.md`.

Verifierat: 17/17 modellprov, TypeScript och lint. Färskt förprov inför nästa våg: befintlig `phase3_policy.test.sql` 95/95 PASS i isolerat protected-mål efter en första anslutningstimeout. Ingen databasändring i fas 4 har tillämpats. Modellprov verifierar inte lagring, API, UI eller fasens krav som helhet.

Underlag att granska: `docs/pilot/phase4-register.md`. Datum följer 1 juli–30 juni; urvalets adress innehåller aldrig söktext; känsliga konfliktvärden är begränsade; publikt svar får ingen anonymitetsmarkör som röjer skyddsstatus.

Kontrollpunkten följer uttryckliga instruktionen “Request checkpoint verification between waves” i `/Users/petter.gjores/.codex/skills/gsd/commands/execute-phase/SKILL.md`. Inga tidigare krav- eller gränssnittsbeslut behöver godkännas igen.

Efter bekräftelse genomförs våg 2 parallellt: 04-02 registerschema/referensdata, 04-07 säker fel- och nedladdningstransport, 04-08 minimerad obligatorisk loggning. Kontrollera aktuell kod och SUMMARY; kör inte 04-01 igen.

Praktiska förutsättningar: Node 25.9.0, lokalt protected-mål och test-IdP kontrollerade. Docker/prov kräver verktygets sandboxeskalering. Använd inte `prepare-local.mjs` för rutinmässig återanslutning: skriptet innehåller databasreset. Använd granskad lokal migrationsväg och assertTarget. SCB:s 2026-lista hämtad från officiella kodnummerförteckningen; 290 unika kommunkoder. Tillfälligt underlag finns i `/tmp/skolplattform-scb-2026.html` och `/tmp/skolplattform-municipalities-2026.json` men ska återhämtas om det saknas.

Kvarlämnade tidigare ändringar i config.json, spike.json, .gsd och PATTERNS ska inte blandas in i implementationens commits. state.json är lokal härledd status; STATE.md är versionshanterad kontinuitet.
