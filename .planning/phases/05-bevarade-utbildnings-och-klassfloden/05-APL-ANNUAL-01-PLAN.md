---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-ANNUAL-01
type: tdd
status: proposed
wave: 1
depends_on: []
autonomous: true
files_modified:
  - web/lib/timplan-time.ts
  - web/lib/timplan-time.test.mjs
  - supabase/migrations/20261016160000_timplan_time_v2_storage.sql
  - work/pilot/verify-timplan-time-v2.mjs
must_haves:
  truths:
    - Skoltid och års-APL kan representeras utan perioder och utan förlust av minuter.
    - Äldre timvärden, perioder och kvitton ändras inte vid installation eller läsning.
    - Övergången är ett granskat atomiskt helplanskommando med samma skolmandat som timplanen.
  artifacts:
    - web/lib/timplan-time.ts
    - supabase/migrations/20261016160000_timplan_time_v2_storage.sql
  key_links:
    - TypeScript-kontraktets minutvärden och SQL:s shape/nullmask är identiska.
    - Samma planlås, revision och requestkvitto skyddar övergång och V2-radskrivning.
---

<objective>
Skapa den nya representationen och en bevisat säker övergång utan att aktivera nya planer eller byta användarflöde. Implementation följer huvudplanens kontrakt; användarvalet gäller skoltimmar plus års-APL, inte en tyst omtolkning av gamla värden.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-PLAN.md
@web/lib/gym-timplan.ts
@web/lib/apl-plan.ts
@supabase/migrations/20261016120000_apl_planning.sql
@supabase/migrations/20261016130000_apl_term_intent.sql
</context>

<tasks>
<task type="auto">
<name>1. Lås minutkontrakt, beräkning och övergång med tabellstyrda modellprov</name>
<files>web/lib/timplan-time.ts, web/lib/timplan-time.test.mjs</files>
<action>Skapa strikt V2-parser, row/nullmask-validator, gemensam summering, årsförläggningssaldo och ren övergångsprojektion. Input för övergång är verifierat legacy-gym + dess befintliga periodallokeringar; output visar skolmatris, föreslagen års-APL, känt totalbevarande och granskningspunkter. Inga perioder skapas, ingen termplacering gissas. Exponera inte legacy hours för V2. Skilj känd summa/fullständighet och definiera exakt parser/formatering för hela timmar och h:mm. Hashunderlag för V2 har egen domän/version och sortering; gamla hashprotokollet anropas oförändrat för V1. Skriv först prov för riktiga semantiska risker, sedan implementation.</action>
<verify>Node-prov visar 80h−30min=79h30min +30min, flera perioder/år, null kontra0, inaktivt ämne/år, skola0+APL>0, säkra heltal, 0-totalandel, oförändrade indata och inga påhittade perioder. Testa samma total före/efter övergång utan avrundning. Periodsaldo får inte dubbelräknas.</verify>
<done>V2-kontraktet och rena beräkningar är entydiga; V1-fixturer påverkas inte och falsk fullständighet kan inte härledas från null.</done>
</task>
<task type="auto">
<name>2. Inför additiv lagring och skyddade kommandon i isolerat schema</name>
<files>supabase/migrations/20261016160000_timplan_time_v2_storage.sql, work/pilot/verify-timplan-time-v2.mjs</files>
<action>Lägg till huvudplanens tre tabeller och strikt SQL-paritet. Funktionen för övergång ska läsa aktuell modell/källa/revision, låsa samma timplan i etablerad låsordning, kontrollera att utkast/återsänd, räkna förslaget själv och kräva exakt basisHash + uttrycklig granskning. Spara ny modell och minutmatris, höj revision en gång, behåll perioderna och gamla cellerna, ge oföränderligt requestbundet kvitto med fryst snapshot. V2-radskrivning sparar skol- och årsvärden tillsammans med revision/CAS och samma återspelningskontrakt. RLS/FORCE/revoke, inga klientstyrda actor-/skol-/organizerfält, mandat/MFA/audit och write-permit-guard. Befintlig radfunktion ska uttryckligen neka V2-planer; även direkt legacy-cellskrivning under annars giltigt permit ska nekas. Nya funktioner är ännu inte produktaktiverade. Ingen aktiv databasinstallation.</action>
<verify>Kör bara i ägd schema-only-kopia med syntetisk data. Bevisa SQL/TS-paritet, worker-roll utan direkträttigheter, annan skola/HM/stale/revoked/locked nekas, två samtidiga övergångar ger exakt en vinnare, samma request återspelas, ändrad request nekas, audit-/mittskrivningsfel återställer allt. Jämför gamla tabellers rader före/efter migrationsinstallation; historiska kvitton/hash bevaras. Bevisa att direkt gammal skrivväg inte kan ändra V2.</verify>
<done>Migrationen är additiv, legacy-matrisen bevarad och kommandona atomiska; rå rapport och cleanup finns. Inget live-byte eller ny standardmodell har aktiverats.</done>
</task>
</tasks>

<verification>Modell- och SQL-prov måste vara både gröna och semantiskt paritära. En simulerad servertransaktion är inte ersättning för SQL-/samtidighetsprov. Granska nya tabellers FK, immutable guards och rollback innan steg02.</verification>
<success_criteria>ANNUAL-01/04/06 har avgränsade modell/SQL-bevis; alla användarflödes- och leveransbevis återstår.</success_criteria>
<output>Skapa 05-APL-ANNUAL-01-SUMMARY.md med verifierade fall, rårapporthashar och kvarstående integration. Root samordnar avgränsad commit och push.</output>
