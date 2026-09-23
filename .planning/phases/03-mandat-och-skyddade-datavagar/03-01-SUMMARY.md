---
phase: 03-mandat-och-skyddade-datavagar
plan: "01"
subsystem: authorization
status: complete
requirements: [ACL-02, ACL-03, ACL-04, ACL-05]
tags: [mandates, synthetic-v1, tdd, scope]
requires: ["02-identitet-och-kundanslutning"]
provides: ["Syntetisk mandatmatris", "Ren decideMandate med nekande standard", "91 deterministiska kontraktsprov"]
affects: ["03-02", "03-03", "03-05", "03-06", "03-07"]
tech-stack:
  added: []
  patterns: ["Valt uppdrag utan rollunion", "Objektvis scopekontroll", "Liveprövad överordnad kedja"]
key-files:
  created: [docs/pilot/mandatmatris.md, web/lib/mandate-policy.ts, web/lib/mandate-policy.test.mjs]
  modified: []
completed: 2026-09-23
---

# Fas 3 plan 01 — mandatmatris och beslutsmodell

**Valt uppdrag prövas mot explicit syntetisk åtgärdsmatris, fältlista, skol-/grupp-/elev-/ärenderelation, giltighet och överordnad kedja; 91 namngivna prov passerar.**

## Genomfört

1. Matrisen skiljer användarbeslut från researchens `synthetic-v1`. Röda kontraktsprov skapades före modellen.
2. `decideMandate` implementerades med typade interna indata och `{allowed, reasonCode, assignmentId, allowedFields}`. Okänd/okonfigurerad profil och ej verifierat lokalt mål nekar. Klientroll ingår inte som auktoritet.

Huvudman utser rektor; rektor tilldelar lärare, skoladmin, elevhälsa och separat support inom eget mandat. Elevhälsoansvarig får tilldela elevhälsa inom sin skolmängd utan egen elevläsning. Kundadmin/granskare stöder databasens kundomfattade kontext med `organizerId=null`. Ingen kontoroll får elevinsyn.

Ärendemodellen kräver exakt ärende och dess elev. Support är en uttrycklig elev, en skola, syfteskod, godkännande av överordnad rektor och högst 60 minuter i halvöppet intervall. Modellen kontrollerar skärningen med inkluderande datum i Europe/Stockholm. Andra uppdrag förlänger inte valt supportuppdrag.

Kedjan nekar saknad/avslutad/försvagad förälder, cykler och ändrad kund, funktion eller identitet som gör delegationen otillåten. Självutökning jämför identitet, inte endast medlemskap. Framtida mål får tilldelas och avslutas inom giltiga gränser, men kan inte användas i förtid.

## Faktisk verifiering

Kört 2026-09-23 lokalt med Node v25.9.0:

- RED: `cd web && node --test lib/mandate-policy.test.mjs` gav exit 1, `ERR_MODULE_NOT_FOUND` för ännu ej skapad `mandate-policy.ts`; inte syntaxfel.
- GREEN/slutkontroll: samma kommando gav **91 PASS, 0 FAIL, 0 skipped**.
- `cd web && npx tsc --noEmit`: **PASS**.
- `cd web && npx oxlint lib/mandate-policy.ts lib/mandate-policy.test.mjs`: **PASS**. En mellanliggande lintkörning fann testnamnsinterpolation med för bred infererad typ; rättad och omkörd.
- `oxfmt` kördes endast på de två nya kodfilerna.

Ingen SQL, API, browser, appbyggnad eller dokumentationsbyggnad ingår i dessa körbevis. Ingen UI eller handbok har ändrats. Modellen är ännu inte inkopplad i skyddade datavägar. Detta verifierar inte hela ACL-kraven, audit eller verklig drift.

## Commits

- `6d97eff` — matris och röda kontraktsprov.
- `01dd1b3` — mandatmodell och gröna prov.
- `c2541be` — kompatibilitetsrättning — kundomfattade kontoroller enligt befintlig databasmodell.

## Avvikelser och beslut

- [Rule 1 — kompatibilitet] Granskningen upptäckte att kundadmin/granskare i databasen saknar organizer_id. Modellen stöder nu null för dessa roller; fyra ytterligare prov visar tillåtna konto-/loggvägar och fortsatt nekad verksamhetsåtkomst utan huvudman.
- Tekniskt provdokument ligger i `docs/pilot`, inte Docusaurus, enligt senaste användarbeslut.
- STATE och ROADMAP uppdateras av orchestrator för att inte blanda arbetsägarskap. Användarens ändringar i config.json och spike.json lämnas orörda.

## Kontrakt för nästa plan

`decideMandate({assignment, ancestors, profileId, verifiedLocalTarget, serverNow, request})` tar serverladdade uppdrag och relationer. Alla scope-ID:n och resurskopplingar är interna betrodda indata; SQL/server måste verifiera dem med sammansatta främmande nycklar, identitets-/personalbindning och samma livekedja. Ingen profilflagga får komma från klienten.

Modellen beslutar per objekt. SQL måste filtrera före listning, antal, paginering och export. Gruppavgränsade svar måste filtrera även `group_ids` till tillåtna grupper. Modellen returnerar bara en fältlista och filtrerar inte datainnehållet. `mandate.grant/revoke` använder target med identityId, parentAssignmentId, scope och giltighet. Supportens godkännare är den överordnade rektorn. Kontoadministration är separat från verksamhetsmandat.

SQL, HTTP, MFA/CSRF, loggning före svar och mutationscommit samt samtidighet återstår. Modellen öppnar ingen dataväg. Vem som utser elevhälsoansvarig, verkliga professionsfält/åtgärder, supportvillkor och lagringstid är fortsatt öppna kundbeslut; ingen verklig anslutning eller elevåtkomst är godkänd.
