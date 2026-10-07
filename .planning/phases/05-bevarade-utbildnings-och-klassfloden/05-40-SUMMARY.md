---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "40"
status: complete
completed: 2026-10-08
requirements-addressed: [PLANERING-02, PLANERING-03, PLANERING-04]
requirements-finally-verified: []
source_commit: 1f3e6b2ebaa39ba84a8596b354e1d1a977860b41
worker_build_revision: 1f3e6b2ebaa39ba84a8596b354e1d1a977860b41
---

# 05-40 — Sökbara tabeller och läsårsöverblick

**Avgränsat PASS:** Programplaner, gymnasietimplaner och årsöverblick använder serverns behöriga skol-/årsunderlag med sökning, kombinerade filter, sortering och stabil 50-raderspagination. Öppna leder till exakt skola och planversion även när ett nyare utkast finns. Saknad plan visas utan implicit skapande. Gemensamma programpoäng räknas en gång och skolornas timmar separat.

Full färsk [L01–L18 × dator/telefon](../../../work/pilot/results/phase5-40-lists-actual-fifth-20261007.json), raw SHA256 `f44892df92a048a68a26592e430709786fcf4cab7ebcdb2c648345505cfb083a`, ger36/36 PASS på samma source/build1f3e6b2. Körningen tog18,1min, workers1/maxFailures1/retries0; inga skips, flaky eller globala fel. L-spec `620e40be153ed41bc83f9544c033c4a6946a0fe7e79b73d33375f1aecfe0b5bc` är oförändrad efter senaste produkträttningen. Båda källbilagornas18 explicita hashvärden och hela produktens241 filmedlemmar stämmer med Git/runtime/byggrevision. Historiska performance-/SEARCH-underlag återbrukas oförändrade enligt planens beroenden.

| Fall på båda enheterna | Faktiskt resultat |
| --- | --- |
| L01–04 | Verkliga52 rader/50+2 sidor, senare sökträff, lokal kod/specialtecken/program-/inriktningsuppgifter, kombinerade filter/omvänd sort/tomresultat/rensning; tangentbordsrullning inom tabellens egen yta |
| L05–08 | Skolornas egna timplaner och frysta källa, saknad tim-/programplan utan skapande, faktisk revisionskonflikt med återläst sida1 och bevarade filter |
| L09–12 | Sena verkliga svar kan inte återföra gammalt urval; årsöverblick skiljer gemensamma poäng/skoltimmar/klassantal samt GR-bindning och okänd IM-veckotid |
| L13–17 | Exakt äldre program-/klassbunden timversion trots nyare utkast, Back bevarar filter; verkligt servermandat för Ny/Kopiera/retry/reload/sessionsutgång och uttryckligt skolval |
| L18 | Aktivt/okänt skapande håller spärr; faktisk parentåterläsning bevisar en skapad plan och rätt skol-/plan-URL, reload och dialog=[] |

Alla36 normalcleanup-bilagor bevarar samma15 fullständiga originaltabeller med hash/count, äldre och retained audit samt identitetsankare. Egna syntetiska affärs-/sessionsrader, listtillägg, foreignrader och audit-DDL är städade; ingen deferred/unknown cleanup eller recovery behövdes i någon40-körning. Provets verkliga API-/DB-läsning och auditpar styrker tabellens innehåll; inga positiva svarsmockar ersätter underlagen.

Alla36 geometrier håller dokumentet inom1440/390px, synliga kontroller minst44px och tabellen inom sin rullyta. OriginalPNG-bilagor bevaras i runtime-output. ROOT har granskat mobilens faktiska årsöverblick/summeringar/okända veckotid och fokuserade sidledsrullning. Begränsningar: L18-bilden kan visa barnets laddning efter korrekt parent/URL; den bevisar inte färdig års-/terminsmatris. Vid tangentbordsfokus kan telefonens hopplänk synas över filtren. Ingen felfri visuell helhetsbedömning eller mänsklig begriplighets-PASS påstås.

82 riktade location-/planeringskontrakts-/registermodellprov passerade vid integration. Senaste produkträttningen har färsk full typkontroll utan incremental, app/lib/spec-lint och nytt skyddat bygge PASS. [Avgränsat L18×2](../../../work/pilot/results/phase5-40-lists-bounded-created-fourth-20261007.json), raw7ed6be40, passerade på3c3d011. Efter tangentbordsrättningen passerade [L01×2](../../../work/pilot/results/phase5-40-lists-bounded-keyboard-fifth-20261007.json), raw166ef3b8, före full36 på1f3e6b2.

## Första fel och rättningar

Alla första rapporter består som FAIL. Första full77084c83 stoppade på nästlad labelmatch i L04; två egna assertioner använder därefter exakt comboboxnamn. Andra full50f69b19 stoppade på för tidig URLkontroll i L13; samma exakta äldre plan-ID inväntas med ordinarie expect.poll. Tredje bounded3a56f4f5 hade L13–17 PASS och alla L18-verksamhetsassertioner PASS men confirm vid skolremount. Initialläsningen väntar nu på gamla formulärets registrycleanup innan vanlig force=false-läsning; inga unknown-/scope-/versionsspärrar tas bort.

Fjärde full1dc13a5e hade18dator PASS men mobilL01 rullade inte med native ArrowRight. Bara den fokusbara rullytans egna omodifierade ArrowLeft/Right får nu explicit80px rullning; barnkontrollers tangenter består. L-specen ändrades inte. Samtliga första körningars4/13/6/19 normalcleanup bevarar full15/audit-/identitetsankare; inget fel skrevs om till PASS.

## Leveransgräns och nästa steg

[Oberoende målverifiering](05-40-VERIFICATION.md) granskar planens tre observerbara mål. Fulla PLANERING-02/03/04 och fas5 förblir Pending samlat05-43/användarprov. Årsprojektion och mobilens årskursknappar följer05-41, GR/IM:s öppnade vy05-42, handbok/slutprov/användarprov05-43. Formell rektorsfärdigmarkering och huvudmannagodkännande är ett annat öppet gap. Ingen verklig kommunanslutning eller driftpublikation följer. Ordinarie3012 ligger kvar på5dd7baf; endast isolerade3060 har byggts om.
