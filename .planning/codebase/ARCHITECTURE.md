# Architecture

Kartlagt 2026-09-10. Befintlig arbetsversion med två olika lagringsvägar.

## Inträde och presentation

`web/app/layout.tsx` läser globala stilar. `web/app/page.tsx` håller navigation, exempelroll och administrationens sessionsdata. Arbetsytor är `organisation-workspace.tsx`, `admin-workspace.tsx`, `workspace-views.tsx`, `timplan-view.tsx` och `lasar-view.tsx`. Navigation byter huvudsakligen komponent inom samma sida.

## Modell och lagring

Domänfunktioner i `web/lib/*-model.ts` hanterar tillstånd, validering och rollstyrda arbetsflöden. Funktionerna är prövade med Node-tester, men de kontrollerar inte i sig en inloggad persons verkliga mandat.

Huvudmannens beständiga uppgifter går från webbläsaren via `organisation-store.ts`, `planning-store.ts` och `cohort-store.ts` till Supabase. `supabase.ts` skapar klienten och innehåller `signInDemo`. Laddning av en tom demodatabas kan utlösa seedning. Databasens roll läses ur `profiles`, inte från gränssnittets rollväljare.

Elevregister, studieplansutkast, undervisningsgrupper och exempel-schema lever huvudsakligen i `AdminState` i webbläsaren. De är ännu inte ett beständigt kommunanslutet elevsystem.

## Externt informationsflöde

`web/app/api/skolenhet/route.ts` läser Skolverkets skolenhetsregister och omvandlar resultat för import. `registry-address.ts` väljer adress. Styrdokumentskatalogen är en daterad ögonblicksbild i `syllabus-snapshot.ts`; `scripts/fetch-syllabus.mjs` hämtar om den.

## Databasgränser

Migrationerna definierar huvudman, skolor, uppdrag, utbildningar, planer, läsår och klasskopplingar. Radnivåskyddet är främst knutet till huvudman. Privata PDF-tillstånd har förberedd bucket, men filuppladdningen är inte färdig.

Skolimport och kullkopiering använder transaktionella SQL-funktioner. Övriga ändringar kan bestå av flera separata klientskrivningar; någon generell atomisk kommando- och säkerhetslogg finns inte.

## Gränser att förändra i pilotmilstolpen

Separera demo från skyddade driftvägar. Inför verifierade identiteter och medlemskap, avgränsa uppdrag till faktiska skolor, gör elevlagringen beständig och inför serverstyrd integration och säkerhetslogg. Prova även direktåtkomst till databasen så att ett serverlager inte lämnar en alternativ väg med bredare rättigheter.
