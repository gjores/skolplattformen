---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "04"
subsystem: database-projection
status: complete
completed: 2026-09-28
tags: [postgresql, pgtap, pupil-register, projection, export, live-mandates]
requires: [04-01, 04-02, 04-03, 04-08]
provides:
  - Stängda läsentrypoints med levande skol-/grupp-/elev-/ärendescope
  - Projektion före sökning, filtrering, räknare, sortering och sidindelning
  - Separat identitetsvisning, minimerad historik och interna auditRefs
  - Omprövat exporturval över samtliga sidor med uttryckligt skyddsurval
  - Säkra befintliga mandatval och registerbaserade mandatrelationer
affects: [04-05, 04-06, 04-09, 04-10, 04-14, 04-15, 04-21]
key-files:
  created:
    - supabase/migrations/20260929140000_phase4_register_reads.sql
    - supabase/tests/phase4_export.test.sql
  modified:
    - supabase/tests/phase4_protected.test.sql
    - web/lib/pupil-register-model.ts
requirements-addressed: [STU-02, STU-05, DATA-01, DATA-02]
requirements-finally-verified: []
---

# Fas 4 plan 04: skolbundet elevurval och omprövad export

**Registret prövar levande mandat före projektion, sökning, antal och sidindelning. Obehöriga får en anonym rad utan känsliga fält eller åtgärder; export måste ompröva både urval och skyddsbehörighet vid hämtningen.**

## Genomfört

- Alla nya entrypoints tar kundlåset via `phase3_actor`. Rektor/administratör läser egna skolor, lärare daterade klassrelationer, elevhälsa exakt skol-/elev-/ärendescope och support det egna tidsbegränsade elev-/gruppscopet. Huvudman och IT har ingen elevlista. Ärendeuppdrag kräver sitt konkreta `caseId`.
- Listan väljer placeringar som överlappar läsåret juli–juni. Status använder dagens datum inom läsåret, annars årets första dag. Årskurs beräknas från utbildningens startår. Projektion föregår sökning, filter, antal, stabil sortering på visningsnamn/ID och sidor om 50 elever.
- Skyddad elev inom scope blir anonym utan födelsedatum, hemkommun, historik eller åtgärder för personal utan rätt skolbunden skyddsbehörighet. Inget publikt `projection`-/skyddsfält eller elevspecifik `canReadProtected` förekommer i listan/anonymt kort. Sökning utesluter dessa elever helt, även vid sökning på det anonyma namnet. Administratör kan även söka på födelsedatum/personnummer efter behörighetsprövningen; numret återges inte i träffarna.
- Kort begränsar placerings-/klassperioder till den valda behöriga skolan; gruppmandat får endast egna klassrelationer. Kommunperioder måste överlappa skolans elevtid. D-20 `canEdit` grundas på en faktisk aktuell/framtida placering på någon egen skola med nödvändig skyddsbehörighet, oberoende av valt historiskt läsår.
- Identitet visas bara genom separat funktion. Historik returnerar aldrig personnummer, även om nummer har bäddats in i ett godtyckligt JSON-objekt. Skolbundna klass-/utbildnings-/placeringsvärden ger säkra etiketter; främmande skolors eller otillåtna objekts värden blir `null`. Kommunhistorik godtar endast ett verifierat periodobjekt med stängda fält.
- Befintliga `phase3_mandate_options` och `phase3_probe_scope` använder registerrelationer och säkra namn/ärendeetiketter. Mandattilldelning binder verkliga registerklasser och skolplaceringar i stället för den gamla provkällan. Faktiskt Worker-anrop till mandatmetadata är prövat utan läckage av skyddat namn.
- Export validerar stängd fältlista, explicita elev-ID eller filter. Ett okänt/främmande explicit ID nekar hela exporten. Skyddade elever utelämnas om de inte uttryckligen finns i `protectedIds` och aktören fortfarande har rätt skolbehörighet. Personnummer kräver separat booleskt val. Filterexport omfattar alla träffsidor. Preview returnerar endast serverberäknat antal och fält; download gör samma levande kontroller igen.

## Internt API-kontrakt

Funktionerna `phase4_list_pupils(jsonb)`, `phase4_pupil_card(jsonb)`, `phase4_pupil_history(jsonb)`, `phase4_reveal_personal_number(jsonb)` och `phase4_export_pupils(jsonb,boolean)` returnerar `{kind:'success',body,auditRefs}`. Requestformerna följer registermodellen. `preview=true` i export ger `{count,fields,includePersonalNumber}`; download ger samma uppgifter samt `rows` med endast valda fält.

`auditRefs` ligger separat från publika fält och använder endast `{kind,pupilId}` med `protected`, `personal-number` eller `personal-number-export`. Listan refererar endast faktiskt returnerad sida. Count-only-preview innehåller inga nummer-/skyddsvisningsreferenser. Kommande auditerade routes måste mata omslaget genom `auditPupilRegisterResult` innan `body` lämnas ut.

**Samtliga nya läsfunktioner och interna hjälpare är fortsatt stängda för PUBLIC, anon, authenticated och Worker.** Plan 04-09/10 öppnar avgränsade läsvägar först med loggning i samma transaktion. Gamla `phase3_read_pupils` förblir stängd. De tre skyddsbehörighetsfunktionerna öppnades separat i 04-11:s migration `20260929131000`, efter verklig API-/auditverifiering; exakt tre äldre ACL-förväntningar ändrades därför, inga interna helpers öppnades.

## Verifiering

Alla databasoperationer föregicks av `assertTarget('protected')`. Kandidatmigrationen prövades först med hela pgTAP-fixturen i en rollbacktransaktion. Därefter tillämpades godkänd migration 131 före 140, med migrationshistorik och explicit atomisk BEGIN/COMMIT. Inga tillämpade migrationer redigerades och inga reset-/prepare-skript användes.

| Kontroll | Faktiskt resultat |
|---|---|
| RED läsning | Befintliga 69 assertions passerade; saknad `phase4_list_pupils` gav avsett fel |
| RED export | Saknad `phase4_export_pupils` gav avsett fel |
| Kandidat 140 + projektionsfixtur i rollback | **PASS 140/140** |
| Kandidat 140 + exportfixtur i rollback | **PASS 20/20** |
| `node work/pilot/run-sql-tests.mjs --file phase4_protected.test.sql --out work/pilot/results/phase4-projection.json` | **PASS 140/140** efter permanent lokal migration |
| `node work/pilot/run-sql-tests.mjs --file phase4_export.test.sql --out work/pilot/results/phase4-export.json` | **PASS 20/20** efter permanent lokal migration |
| `node --test lib/pupil-register-model.test.mjs` | **PASS 17/17**, även orkestratorns omkörning |
| `npx tsc --noEmit`, `npx oxlint app lib` | **PASS**, orkestratorns kontroll efter modelljusteringen |

SQL-fixturen innehåller 65 syntetiska elever, två skolor, verkliga mandatkedjor, separat explicit skyddsbeslut, daterade relationer, främmande/okända objekt och faktisk Worker-roll. Proven omfattar anonyma listor/kort, dolda sökträffar, metadata, historiskt läsår, D-20, två sidor, stödmandatets sluttid, maskerad identitets-/periodhistorik, ursprung, export över sidor samt ändrat skydd och återkallat mandat mellan preview och download.

Full SQL-regression rapporteras av orkestratorn för våg 4. Sex äldre fas 3-fixturer var övergångsröda efter föregående våg och ägs av 04-14/15; inga sådana filer har ändrats eller hoppats över här. Riktat PASS är inte full fasgrind.

## Avvikelser och nästa plan

1. **Rule 2 — ärligt ursprung:** Kommunperiodtabellen saknar periodsärskild proveniens. `MunicipalityPeriod.origin` är därför nu `FieldOrigin | null`. `null` betyder saknat registrerat ursprungsbevis, aldrig påhittad manuell källa/aktör/tid. Kortet söker verklig kommunhistorik via period-ID eller exakt kod/startdatum. Plan 04-05 ska skriva period-ID och datum i samma historiktransaktion som perioden.
2. Kommunhistorikens godkända objektform är `{id,municipalityCode,startsOn,endsOn}`. ID/kod/start ska matcha den verkliga kommunperioden, som måste överlappa den behöriga skolans elevtid. Extra nycklar eller främmande perioder ger maskerat värde. Placerings-/klass-/utbildningshistorik använder opaka referenser och strikt projektion till behöriga etiketter; godtycklig JSON skickas aldrig vidare.
3. Ingen registerroute eller registervy öppnas här. Skrivning/konflikter, källavvikelser, auditerade läs-/exportroutes och användarflöden återstår i efterföljande planer. Skolbunden metadata är uppdaterad för att den redan öppna mandatvägen inte ska bli en omväg kring projektionen.
4. Krav är adresserade genom dessa lokala syntetiska prov, inte slutverifierade. 04-21, 04-22 och separat fasverifiering återstår; ingen verklig kommunanslutning eller elevdata godkänns.

## Kravspårning och commits

- **STU-02/STU-05 →** skol-/läsårs-/klassprojektion, D-18/D-20 och säkra urval: `phase4_protected.test.sql`.
- **DATA-01 →** anonyma fält, osynliga sökträffar, metadata, historik och levande skyddsbeslut: samma fil.
- **DATA-02 →** explicit tillåten export, sidoberoende urval och omprövning: `phase4_export.test.sql`.
- `ef8c2b2` — RED: projektions- och exportprov.
- `9182ce5` — 04-04-01: levande registerprojektion, säkra metadata, verklig proveniens/nullkontrakt.
- `28b3b10` — 04-04-02: omprövad export med explicit skyddsurval.

Global STATE/ROADMAP/VALIDATION och handbok ägs av orkestratorn. Inga orelaterade lokala ändringar ingår.
