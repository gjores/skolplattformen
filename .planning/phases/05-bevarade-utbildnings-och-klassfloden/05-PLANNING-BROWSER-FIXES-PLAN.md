---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: PLANNING-BROWSER-FIXES
status: implemented_pending_verification
created: 2026-10-19
---

# Två appfel som de omskrivna webbläsarsviterna fångar

Bakgrund: de omskrivna phase5-sviterna (ea49697, 8c8cb92, 9981454) lämnade timplan 11 och gym-timplan T01 röda. Användaren bedömde båda som appfel. Proven ändras inte.

## Ändringar

1. **Delad GR/IM-utbildning på tillagd skola** (`web/app/protected-timplan-workspace.tsx`, `readVerified`). En uttryckligt vald aktuell utkastmatris har ingen årsbindning. Den krävde ändå en årsrad i `/api/planering/oversikt`. Årsöversikten avgränsar GR/IM till `offerings.unit_id`, så en skola som får utbildningen via `offering_units` saknade rad. Rektor på den skolan nekades i UI:t, trots att servern godkänner läsning och skrivning. Nu kräver bara årsbundna versioner en årsrad. Behörigheten är oförändrad:
   - `phase5_timplan_scope` kräver mandat på planens skola för `/lasa` och `/cell`. En annan rektors plan ger 403, och fall 11 kontrollerar det.
   - Klienten kräver fortfarande att planens skola och skolform finns med läsrätt i det mandatbundna planeringsurvalet och matchar vald skola.
   - Ingen migrering och ingen databasändring.
2. **Årskursval mellan timplan och programplan** (`web/app/protected-home.tsx`). `goToProgramplan` och `goToTimplan` behåller nu `relativeYear`/`allYears` när en gymnasieprogramplan eller gymnasietimplan är öppen. Båda använder Åk 1–3. Listor, översikt, GR/IM och APL bär inte med valet.
3. **Fördjupningsändring som sparats men inte lästs om** (`web/app/protected-programplan-board.tsx`). Om omläsningen misslyckas efter en bekräftad skrivning visas nu "Fördjupningen är sparad, men planen kunde inte läsas om …" i stället för "Kunde inte ändra fördjupningen". Läget blir `unknown` med **Läs om planen**. Ingen ny skrivning görs.

Handbok: `docs/handbok/timplaner.md` beskriver nu att årskursvalet följer med och hur en delad GR/IM-utbildning öppnas.

## SS 12000-avstämning (ändring 1)

Version: SS 12000:2024 med OpenAPI 2.1.0, enligt granskningen i [05-CLASS-COHORT-SS12000.md](05-CLASS-COHORT-SS12000.md). Ingen ny hämtning av specifikationen gjordes.

| Internt | SS 12000 | Behandling |
| --- | --- | --- |
| `school_units.id` (skola) | `Organisation` (skolenhet), `OrganisationReference.id` | Oförändrat. Planens skola är den skola som har mandat; ingen skolidentitet härleds från utbildningens ursprungliga skola. |
| `offerings` + `offering_units` (utbildning som ges på flera skolor) | Ingen direkt utbildningsobjekt-mappning antas; närmast `Programme` och relationen till `Organisation` | `offering_units` behandlas som relationen utbildning–skolenhet. Ändringen läser den inte och skriver den inte. |
| Placering (`pupil_placements`) | `Placement` (person, organisation, giltighet) | Berörs inte. |
| Timplan och timplansversion | Utanför standardens objekt | Lokal planeringsmodell. Ingen export eller import påverkas. |

Modellkonflikt som återstår: årsöversikt och årslista (`phase5_planning_year_rows`) avgränsar GR/IM till `offerings.unit_id`, medan utkastlistan och läsningen använder `offering_units` och mandat. En delad GR/IM-utbildning syns därför inte i årslistan för den tillagda skolan, bara via **Välj aktuell utkastmatris**. Att rätta det kräver en ny migrering. Det beslutet ligger hos användaren och ingår inte i denna plan. Inget externt informationsutbyte är verifierat.

## Verifiering

- Styrda källor committas före bygget: `node scripts/run-mode.mjs build --mode protected`, sedan preview på port 3056.
- Sekventiellt: phase5-timplan 22/22, phase5-gym-timplan 26/26 och phase5-programplan 40/40, på dator och telefon.
- `npx tsc --noEmit`, `npx oxlint app lib` och `node --test lib/*.test.mjs`.
- Ändring 3 täcks inte av något prov. Den är kontrollerad genom kodgranskning, typkontroll och lint.

## Resultat

(fylls i efter körning)
