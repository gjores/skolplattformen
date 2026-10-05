---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "24"
subsystem: timplananalys
tags: [timplan, analys, grundskola, introduktionsprogram, tdd]
status: complete
completed: 2026-10-05
requirements-addressed: [ADMIN-02]
requirements-finally-verified: []
key-files:
  created: [web/lib/timplan-analysis.ts, web/lib/timplan-analysis.test.mjs]
  modified: []
commits: 4
plan_head_before: 4b4dd160dea4fb1e0055fded25f517aea4504bf6
actuals:
  tokens: 14573
  tasks: 2
  commits: 4
---

# 05-24: Regelförankrad analys för grundskola och IM

**Status:** implementerad och provad mot syntetiska data i en ren analysfunktion (`analyseTimplan`). Ingen app-, SQL-, API- eller webbläsarkoppling är gjord; planen avsåg bara analysmotorn. Ingen verklig kommunanslutning.

## Levererat

- **Grundskola** (`web/lib/timplan-analysis.ts`)
  - Fryst profil `gr-2024-25` med källa, verifieringsdatum och giltighet följer med indata. Ett resultat kan alltså alltid hänföras till den regelversion som användes.
  - HKK:s 40 timmar räknas gemensamt för låg- och mellanstadiet. 40 timmar samlade i lågstadiet uppfyller ramen och 39 totalt är en minskning som måste placeras i skolans val.
  - NO/SO räknas en gång: gruppraden i lågstadiet, ämnesraderna i mellan- och högstadiet. Felplacerade timmar ger fel och räknas inte, så de dubbelräknas inte.
  - Skyddade ämnen (svenska/svenska som andraspråk, engelska, matematik, språkval) får inte minskas. Övriga får minskas högst 20 procent per stadium. Summan av minskningarna jämförs med skolans val (högst 600 timmar). Stadiets totala tid kontrolleras.
  - Delat stadium (till exempel åk 1–5) och okänd rad blir obligatoriska kontrollpunkter. Saknad rad och ogiltigt värde är fel, aldrig noll.
- **Introduktionsprogram:** bara tid på rader som profilen klassificerar som undervisning räknas mot 23 timmar per vecka. Praktik, mentorstid och okänd tid räknas inte, och ett klientpåstående om klassificering ignoreras. En hög totalsumma ger därför inte en styrkt ram. Även vid minst 23 timmar finns en icke-blockerande kontrollpunkt för individuell tillämpning.
- **Beslutsklarhet:** `blocksDecision` finns per resultat och för helheten, skilt från kategori. Fel och obligatoriska kontrollpunkter blockerar. Risker, allmän information och Uppfyllt gör det inte. Egna osparade värden, saknad sparad revision och saknad analysversion ger `readinessReasons` utan att resultatlistan ändras.
- **Lokala bedömningar** har namngivna parametrar (`DEFAULT_LOCAL_PARAMETERS`) och redovisas som risk utan källa: ämne utan tid i en årskurs, låg marginal över 23 timmar och hög andel annan aktivitet i IM.
- **Resultatkontrakt:** stabilt `issueId`, kategori, faktiska/förväntade värden med enhet, `sourceUrl`/`validFrom`/`validTo`, berörda rader och kolumner samt typat `actionTarget` (cell eller rad).
- Okänd profil, fel skolform eller kull utanför giltigheten ger "Att kontrollera" som obligatorisk kontroll, aldrig Uppfyllt. Planerad tid redovisas uttryckligen som inte genomförd undervisning.

## TDD-gång

| Steg | Commit |
|---|---|
| RED, uppgift 1 (15 prov, alla fallerade på påståenden; `check tdd-red-evidence`: RED_EVIDENCE_OK) | 623c8e4 |
| GREEN, uppgift 1 | 6c43f39 |
| RED, uppgift 2 (10 nya prov fallerade, 15 gröna; RED_EVIDENCE_OK) | e19e34b |
| GREEN, uppgift 2 | 4928c37 |

Ingen separat refaktorering gjordes. RED-commit 1 innehöll en tom analys med typkontrakt så att proven föll på påståenden och inte på modulladdning.

## Verifiering

| Kontroll (i `web/`, node 25) | Resultat |
|---|---|
| `node --test lib/timplan-analysis.test.mjs` | 25/25 PASS |
| `npx tsc --noEmit` | PASS |
| `npx oxlint app lib` | PASS, inga fynd |
| `npm run build`, hela `lib/*.test.mjs`, webbläsarprov | Ej körda: ingen app-, UI- eller annan kod ändrades, filen importeras ännu inte av något |

## Avvikelser

- **Incheckning på `master`:** skyddskontrollen för standardgren flaggade `master`. Projektet har `branching_strategy: none`, bara grenen `master`, och beställningen angav körning i huvudträdet. Commitarna gjordes därför på `master`. Ingen push är gjord av denna plan.
- Inga andra avvikelser. Egna provfel under arbetet (felsatt `ruleId` på lågmarginalrisken, en oanvänd variabel) rättades före respektive commit.

## Kvarstående gränser

- **Ämnesvisa timmar och minimitider** är hämtade ur den tidigare modellens tabell över Skolförordningens bilaga 1 och stäms av mot Skolverkets summor (1 882 / 2 334 / 40 / 2 634 = 6 890). De är inte hämtade på nytt från Skolverkets sida i denna plan. Provet jämför den inbyggda profilen med en handskriven kopia, vilket fångar transkriberingsfel men inte ett fel i källtabellen.
- **IM-profilen** saknar startdatum eftersom källan inte anger något. Det visas som en icke-blockerande kontrollpunkt. Ingen paragrafhänvisning är verifierad utöver Skolverkets sida.
- Tillåtna minskningar per stadium (20 procent per ämne och stadium) följer den tidigare modellens tolkning av skolans val; tolkningen är inte oberoende juridiskt granskad.
- Manuell kvittens av kontrollpunkter, serverns läsning av sparad revision, profilval per skola/kull och all gymnasieanalys ingår inte. De hör till 05-27–05-33. Gymnasium kräver fastställd programplan och egen profil.
- Analysen är inte kopplad till någon vy ännu. Handboken är oförändrad eftersom användarbeteendet inte ändrats.

## Self-Check: PASSED

Filer och de fyra commitarna (623c8e4, 6c43f39, e19e34b, 4928c37) finns.
