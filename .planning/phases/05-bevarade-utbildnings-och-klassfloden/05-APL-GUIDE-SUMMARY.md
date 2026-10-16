---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-GUIDE-DATES
scope: GUIDE-01/GUIDE-02
status: implemented_baseline_pending_flow_decision
---

# APL-handledning – avgränsad implementation

2026-10-16. Guide och handbok beskriver den befintliga termins-/periodbaserade APL-planeringen. Under arbetet lämnade användaren ny styrning om planering direkt per ämne/årskurs. Regel- och ansvarsdelarna är återanvändbara, men denna summary innebär inte att en ny årsbudget eller ny arbetsgång är genomförd eller levererad. Root samordnar det beslutet och faktisk leverans.

## Ändrat

- `protected-apl-guide.tsx` och avgränsad CSS: uppfällbar handledning direkt i APL-vyn, oberoende av skrivrätt. Regel, arbetsgång, appens kontroller och skyldigheter utanför appen skiljs åt. Daterade länkar till gymnasieförordningen, Skolverket och Arbetsmiljöverket. Eget räkneexempel: 5 veckor → 115 GUT-timmar inom totaltiden. Ingen attest eller ändrad validering.
- `protected-apl-plan.tsx`: guiden tillgänglig även i låst/läsbar plan. Två datumfält använder gemensam DatePicker med explicita etiketter, oförändrad ISO-callback och återställning av omfattningsgranskning vid datumändring. Lokal förklaring skiljer kalenderveckor från granskad APL-omfattning.
- `docs/handbok/apl-planering.md`, länk från timplaner och sidebar: regel-/ansvarstabell och konkret arbetsgång, plats/risk/handledning, genomförande och individuell uppföljning. Inga påståenden om att dessa operativa uppgifter registreras i appen.
- `e2e/apl-plan.spec.ts`: nytt läsprov med tangentbord i låst plan, källa/arbetsgång/räkneexempel, dator/telefon, ingen skrivbegäran.

## Kontroller

- APL-preview, simulerad HTTP: **60/60 passerade** på dator och telefon, noll retries. Befintliga spar-/återhämtnings-/mandat-/term-/beslutsregressioner ingår. Logg `/private/tmp/apl-guide-preview.log`.
- Efter explicit labelkoppling och bildförbättring: smalt guide-/datumprov **4/4 passerade**. Slutbilder i `/private/tmp/apl-guide-final-ui-results` och logg `/private/tmp/apl-guide-final-preview.log` (root behöver slutligt frysa och kontrollera källorna).
- `npx tsc --noEmit`: PASS vid gemensam arbetskopia; `/private/tmp/apl-guide-types.log`.
- `npx oxlint app/protected-apl-guide.tsx app/protected-apl-plan.tsx`: PASS efter labelrättning; `/private/tmp/apl-guide-final-lint.log`.
- `npm run docs:build`: PASS; `/private/tmp/apl-guide-docs-build.log`.

Komponentbilder granskade för radbrytning, mobilbredd och läslighet. Scrollmarginaler gör att guideankare kan visas under befintlig fast planeringsrad. Fullt skyddat användarprov och installation på 3012 är **inte** utförda av guideagenten. Ingen databasändring, runtimeändring eller commit utförd.

Se `05-APL-GUIDE-RESEARCH.md` för källor, lag/app-gräns och SS 12000-avstämning.
