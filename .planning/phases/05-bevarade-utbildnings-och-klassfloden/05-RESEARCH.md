# Fas 5 — kodförankrad research

Inspekterad 2026-09-29. Lokal kodresearch, inga externa beroenden eller nya bibliotek föreslås. Äldre .planning/codebase/ARCHITECTURE.md är historisk karta och stämmer inte ensam med dagens skyddade app.

| Område | Aktuellt underlag | Slutsats |
|---|---|---|
| Skyddad navigation | web/app/protected-home.tsx, closedItems | Utbildningar/poängplaner/timplaner/klasser är stängda och behöver egna skyddade vyer. |
| Organisation | web/lib/organisation-store.ts, web/app/organisation-workspace.tsx | Direkta Supabase-tabellsparningar och flera separata steg; laddare är numera rena men äldre datavägar är inte skyddad UI-adapter. |
| Gamla skyddade läsningen | web/app/api/organisation/route.ts | Endast kundadmin/granskare; rektor kommer från assignments/assignment_units. Återanvänd inte som levande mandatkälla. |
| Skoluppslag | web/lib/server/skolverket.ts, web/app/api/skolenhet/route.ts, 20260908150000_school_import.sql | Reducerat registerunderlag och adress finns. Säker import behöver aktuell huvudmannakontext och bevarande av lokalt rektorsmandat. |
| Utbildning/poängplan | web/lib/organisation-model.ts, organisation-store.ts | HM/rektor kan ändra vissa planutkast; beslut och lås har befintliga regler. decidePointPlan gör flera skrivningar: skyddad väg måste vara atomär. |
| Timplan/läsår | web/lib/timplan-model.ts, lasar-model.ts, planning-store.ts | Rektor ändrar/föreslår timplan, HM återremitterar/fastställer. UI:s booleska apply-resultat är inte bevis för sparning. |
| Kullkopiering | web/lib/cohort-model.ts, cohort-store.ts, 20260908120000_cohorts_classes.sql | SQL kopierar atomärt men använder äldre roll och auth.uid. Ny explicit start_year från fas 4 måste skrivas i målutbildningen. |
| Klassbindning | web/app/timplan-classes.tsx, web/lib/cohort-model.ts, class_timplans | Äldre nyckel är unit_id/class_name/start_year. Saknar beständigt klass-ID. Fas 4:s school_classes finns och är stängd för direkt åtkomst. |
| Säker server | web/lib/server/authz.ts, db.ts, events.ts, pupil-register.ts | protectedRoute, aktuell transaktionskontext, fail-closed obligatorisk audit och snäva SQL-kommandon är etablerat mönster. |
| Bevis | work/pilot/verify-baseline-db.mjs, web/e2e/phase1-baseline.spec.ts, web/scripts/verify-phase4.mjs | Baslinjen bevisar äldre flöden, inte ny skyddad identitet. Fas 5 måste lägga till egna tester och behålla äldre grindar. |

## Rekommendation

Färska prov 2026-09-29 finns i `05-CURRENT-EVIDENCE.md`: befintliga cohort-/organisation-/timplanmodellprov PASS 30/30. `node --test lib/save-order.repro.mjs` ger fortsatt två förväntade FAIL (exit 1): äldre samma-cell-ändring skriver över nyare värde och följdändring till nytt objekt använder modell-ID som inte finns i databasen. Detta är ett blockerande villkor enligt `docs/pilot/baseline.md` före skyddad beständig timplan-/läsårsredigering. Plan 05-01 dokumenterar kontrakt och prov; den öppnar inte datavägen. Båda fallen ska senare bli ordinarie regression på den faktiska nya vägen, utan försvagad reproducerare.

Separata feature-specifika servermoduler/API-rutter minskar koppling mellan planer. Återanvänd rena modeller och katalogögonblicksbild; skriv serverkontrollerade kommandon i stället för generisk persist(next,previous). SQL omprövar kund, skola, giltig mandatkedja, version och beslut inom låst transaktion. Behåll skoluppslagets nätanrop på servern; deterministisk syntetisk registerstub i tester, tydligt redovisat separat från faktiskt Skolverketsuppslag.

Inför versionskolumn bara för aggregat där inget befintligt samtidighetsskydd finns, och använd exakt expectedVersion i varje skrivkommando. Lås flera aggregat i fast ordning; dubblettkopiering testas med två samtidiga anrop. Minimerad audit härleds från faktisk session och operation, inga klientvalda aktörer/roller eller råa registerpayloads.

## Datamigrering och återgång

Ny migration per avgränsad domän, ändra aldrig tillämpade migrationer. Inventera aktuella policies/grants innan nytt kommando öppnas. Avstäm befintliga IDs, planversioner och beslut före/efter; bevara FK till utbildning som fas 4:s placeringar använder. ID-backfill för klassbindning får inte kopiera elever eller flytta utbildning. Återgång stänger ny skyddad operation och återställer kompatibel läsning; den återöppnar inte demo eller äldre breda rättigheter. Kassera endast disponibel lokal syntetisk miljö enligt assertTarget; använd inte work/supabase/reset.mjs.

## Osäkerheter

Den skyddade pilotdatabasens hela grants måste verifieras vid genomförande; kodläsning bevisar inte ansluten drift. Läsårsmodellens skrivroller är kodkontrollerade i 05-01; aktuell SQL-auktoritet och klassnamnens entydighet återstår att verifiera i genomförandet. Modulformatet följer befintlig Vinext; inga produktversioner eller externa API-regler behöver uppdateras i denna fas. Bred UI-ombyggnad och SPAR/Skatteverket ligger i separata TODOs.

Färska startprov och källförankrad rollmatris finns i `05-CURRENT-EVIDENCE.md`: 30 modellprov PASS, två sparordnings-/ID-prov FAIL.
