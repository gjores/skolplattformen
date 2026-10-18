---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: VOCATIONAL-EXAM-2028
status: docs-verified
---

# Examensform för yrkeskullar 2028 – research och användarhandbok

Avgränsad dokumentationsdel. Produktkod, databas, drift och root STATE har inte ändrats av denna delagent.

## Levererat

- `.planning/research/VOCATIONAL-EXAM-2028-2026-10-18.md`: officiella primärkällor för regel, övergång, poäng/GUT och betyg; tydligt separat status för ej verifierat provutbud. Dokumentet skiljer äldre försöks-/branschprov från tillämpligt nationellt yrkesprov. Produktbeslutets begränsade modell beskrivs som en efterföljande avgränsning, inte som fullständig tillämpning av lagens individuella övergångsregler.
- `docs/handbok/programplaner.md`: arbetsgång med fastställda UI-labels, ingen förvald examensform, källa/notering/datum och uttrycklig granskning, sparstatus och beslut, kopiering till nästa kull och bevarat underlag i ny version. Frågan ”prov saknas” kräver faktisk kontroll; tom sökning eller katalog räcker inte.
- `docs/handbok/timplaner.md`: fryst examensform från programplanen, samma 100-poängsram, granskning vid ändrat underlag och fortsatt GUT/APL-kontroll. Vid modellbyte beskrivs den avslutande radens ofördelade timmar och tidigare värden i granskningsunderlaget enligt backendagentens kontrakt.
- `docs/handbok/apl-planering.md`: koppling till programplanens granskning, utan att yrkesprov ersätter APL eller ger ett intyg om genomförande.

Handboken beskriver skolans dokumenterade granskning och huvudmannens beslut. Den gör inget påstående om automatisk provkatalog, faktisk provtillgänglighet, provdeltagande, betyg, examen, individuell övergångsbedömning eller stöd för andra skolformer.

## Verifiering

UI-labels stämda med UI-agenten och aktuell `protected-programplan-examination.tsx` samt `plan-decision-panel.tsx`. Grundkontrakt och scope lästa i `programplan-examination.ts`. Denna dokumentationsdel kör inga egna produkt-/databasprov; UI-, API-, SQL- och leveransresultat ska sammanföras av root och respektive implementerande agent.

`npm run docs:build`: PASS, exit 0; klient och server kompilerade och statiska filer genererade. Logg `/private/tmp/vocational-exam-2028-docs-build.log`. Docusaurus notifierade om saknad rätt att skriva uppdateringscache; själva bygget lyckades. Ingen handbok publicerad.

SS 12000-baslinje, stabila identifierare, källansvar och begränsningarna för en intern planegenskap dokumenteras i research och huvudplan. Inget externt standardutbyte verifieras här.
