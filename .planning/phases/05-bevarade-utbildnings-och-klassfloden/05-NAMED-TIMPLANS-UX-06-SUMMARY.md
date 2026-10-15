---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-06
status: prepared_contracts_verified
updated: 2026-10-15
gap: CLASS-COHORT-UX-01
remaining: [verify_against_05_sql_projections, sql_typescript_name_parity]
---

# Strikta serie- och läskontrakt — verifierat delresultat

Ren kontraktsimplementation och dess Node-prov är klara. **Plan 06 är inte slutverifierad**: den uppdaterade planen beror på 05:s faktiska SQL-projektioner och namn-/SQLparitet återstår. Ingen ny serveradapter eller produktleverans ingår i detta delresultat.

## Implementerat

- `named-timplan.ts`: stabil `TimplanSeries {id,name,revision}`, separata create-/rename-kommandon, strikt namnkontrakt med endast vanlig kantblankstegstrimning, 1–80 Unicodekodpunkter, förbud mot Cc/Cf/Cs och inga tysta NFC-/blankstegsändringar. Kopierings-ID och revision kräver ett komplett par. SQL äger namnunikheten.
- `gym-timplan.ts`: detaljens `series` och nullable `nameAtCreation` följs åt i ny form. Summaries skiljer serieidentitet från versionsnummer; två olika serier får båda ha version 1. Globala plan-ID:n, serie/version och konsistenta serieuppgifter/skolscope kontrolleras.
- `class-timplan.ts`: målplanen och varje länk har serieuppgifter i ny form. Länkens exakta plan-ID, version/status och samma series aktuella namn/revision måste vara konsistenta. Klass-ID och kvitto för klass/läsår/plan förblir oförändrade; `linkedClasses` duplicerar inte parentserien.
- `plan-decision.ts`: detalj, inkorg och paginerad lista bevarar `series`; programplan har null, gymtimplan objekt. Metadata måste vara konsistent inom skola/utbildning/serie/version. Historik kan i explicit ny form innehålla `nameAtDecision: null|string`, oberoende av seriens aktuella namn; gammal historikshape är uttryckligt bevarad.
- `planning-year-contract.ts`: nya årsradens serie skiljs från dess planreferens. Programplanens `schoolTimplans[]` bevarar alla relevanta planreferenser, även äldre bunden version bredvid aktuell version inom samma serie. Singular och plural får aldrig blandas. Parentutbildning/skola, sourceversion, serie/version, planidentitet och metadata valideras. GR/IM samt programplan har null-serie i nya produktformen. Samma programram räknas en gång i poängtotalen; de separata planernas timmar bevaras.

De gamla, exakt kända wire-formerna finns kvar för befintliga kontrakt/fixturer. Varje listsvar kräver enhetlig gammal eller ny metadataform. Ingen ny form tillåter saknad eller null serie där ett objekt krävs. **Plan 07 måste uttryckligen kräva ny metadata från aktiverad SQL**; pureparserns legacygren får inte dölja ett bortglömt produktfält.

## Filer

`web/lib/named-timplan.ts`, `named-timplan.test.mjs`, `gym-timplan.ts`, `gym-timplan.test.mjs`, `class-timplan.ts`, `class-timplan.test.mjs`, `plan-decision.ts`, `plan-decision.test.mjs`, `planning-year-contract.ts`, `planning-year-contract.test.mjs`.

01:s komponent, browserprov, handbok och summary har inte ändrats av denna uppgift. Samordnaren äger commit/push.

## Kontroller och proveniens

Från `web/`, `node --test lib/named-timplan.test.mjs lib/gym-timplan.test.mjs lib/class-timplan.test.mjs lib/plan-decision.test.mjs lib/planning-year-contract.test.mjs`: **70/70 PASS**, inga skips. Slutloggen `/private/tmp/named-ux06-final.log`, SHA256 `a3f766cbc3db5db85116ee87247b0690a954c0a26ef8cfbe2d49bf69f7b87089`.

`npx --no-install tsc --noEmit` samt riktad `npx --no-install oxlint lib/named-timplan.ts lib/gym-timplan.ts lib/class-timplan.ts lib/plan-decision.ts lib/planning-year-contract.ts`: PASS. `git diff --check`: PASS.

Testerna omfattar namnens kodpunktsgränser, förbjudna tecken, främmande/extra/otillåtna fält, accessor-/symbol-/prototypeobjekt, gles skolplanslista, felaktiga ID:n/revisioner, både version 1 och flera versioner samma serie, historiska namn, explicit legacyövergång, felaktigt skol-/utbildningsscope samt bibehållen poängdeduplicering och timmar.

RED observerades för **fyra nya decision/planning-fall** innan deras implementation: 48 prov, 44 PASS och fyra förväntade FAIL eftersom nya former ännu nekades. Logg `/private/tmp/named-ux06-red.log`, SHA256 `106f092b1b5b94300dc435461c20dbe31c27f6cc8e1199da1545498d0d84e524`. Därefter passerade alla 66, sedan 70 efter ytterligare negativa metadata-/historikprov. Rotagentens tidigare named/gym/class-implementation hade redan gjorts vid överlämningen; ingen observerad RED hävdas för den delen.

## Bevarande och återstående arbete

Ingen SQL/migration, DB, route, serveradapter, UI eller faktisk anslutning ändrades här. Ingen provdata har skrivits till användarens klasser eller kopplingar. Detta är pureparser-/enhetsbevis, inte SQL-, Worker-, OIDC-, browser- eller lokal leveransverifiering.

SS 12000:2024/OpenAPI 2.1.0 enligt befintlig paketmappning: intern timplansserie är separat från klassens och organisationens stabila identiteter. Ingen person-, medlemskaps-, giltighets- eller extern-ID-modell ändras; inget nytt standardutbyte påstås.

Nästa: stäm av dessa parsers mot 05:s riktiga projektioner och namnkodpunktsparitet mot SQL, följt av 07:s strikta serverintegration. Gapets och fasens acceptans förblir öppna.
