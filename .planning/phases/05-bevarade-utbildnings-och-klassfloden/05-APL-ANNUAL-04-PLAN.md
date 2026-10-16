---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-ANNUAL-04
type: execute
status: proposed
wave: 4
depends_on: [APL-ANNUAL-03]
autonomous: true
files_modified:
  - work/pilot/verify-apl-annual-api.mjs
  - work/pilot/apl-annual-browser-scenarios.mjs
  - work/pilot/apply-apl-annual.mjs
  - work/pilot/deliver-apl-annual.mjs
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-VERIFICATION.md
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-RELEASE.md
must_haves:
  truths:
    - Samma prövade kandidat och migrationer används vid lokal leverans.
    - Gamla värden, kvitton, beslut och klasskopplingar bevaras genom installationen.
    - Faktiska OIDC/Worker/SQL-prov visar båda tidsmodellerna på dator och telefon.
  artifacts:
    - work/pilot/verify-apl-annual-api.mjs
    - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-VERIFICATION.md
  key_links:
    - Käll-, migrations- och artefakthash binder faktisk testkörning till installation och appbyte.
    - Bevarandekontroll skiljer additiv schemaändring från ändrade äldre verksamhetsrader.
---
<objective>
Verifiera hela nya arbetsgången mot verklig lokal Worker/OIDC och installerad testdatabas innan granskad lokal leverans. Ingen simulerad körning, gammal rapport eller GUIDE-DATES schema-oförändrad-proof får ersätta dessa bevis.
</objective>
<context>
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-PLAN.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-03-SUMMARY.md
@work/pilot/verify-apl-guide-dates-api.mjs
@work/pilot/verify-timplan-distribution-api.mjs
@work/pilot/apply-apl-plan.mjs
@work/pilot/deliver-apl-plan.mjs
</context>
<tasks>
<task type="auto">
<name>1. Verifiera slutkandidaten och migrationerna med riktiga skyddade användarflöden</name>
<files>work/pilot/verify-apl-annual-api.mjs, work/pilot/apl-annual-browser-scenarios.mjs, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-VERIFICATION.md</files>
<action>Bygg skyddad kandidat i separat privat checkout från fryst commit; bygg aldrig aktiv web/dist-protected. Återanvänd etablerad schema-only-snapshot och ägda syntetiska OIDC-aktörer på3014, installera endast det granskade nya migrationspaketet där. Seed V1 före migrering för faktiskt bevarande och V2 efter; separat seedanslutning för egna tempfunktioner. Ingen levandedatakopia, demo-login, reset eller IdP-omstart. Spara rårapporter, SHA-bundna sidofiler och bilder med 0 retries. Granska bilder separat och bevara misslyckade försök. Inventera aktuell schema-/artefakt-/källfreeze före/efter och cleanup av egna sessioner, identiteter, redirect och runtime.</action>
<verify>Faktisk dator+telefon: ny plan, ange skoltid+års-APL utan perioder, spara/reload, rätt totalsumma/GUT/andel, förlägg del och se kvar; guide+veckokalender. V1→V2 granskning/cancel/commit med30min-rest; gammalt kvitto återspelas efteråt, gamla planvärden/perioder kvar. API/SQL: rektor/HM/annan skola, revoked/MFA/CAS/origin/epoch, auditrollback, samtidiga års-/period-/skolskrivningar, direct legacy-route på V2, låst version, kopiering/nästa version och förlorad rad. Autofördelning exakt och atomisk med års-APL bevarad. Full beslutsrunda ska fortsatt neka budget utan förläggning och tillåta komplett granskad plan med separata roller.</verify>
<done>Alla ANNUAL-kriterier har verifierbart avgränsat bevis; cleanup och historiskt bevarande passerar. Inga gröna produktions-/SS12000-anslutningsanspråk.</done>
</task>
<task type="auto">
<name>2. Förbered och genomför kontrollerad installation och kandidatöverföring</name>
<files>work/pilot/apply-apl-annual.mjs, work/pilot/deliver-apl-annual.mjs, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-RELEASE.md</files>
<action>Ta fram konkret read-only preflight med exakta migrationshashar, aktuellt mål/runtime, schemafingerprint, befintliga tabellers bevarande och provad kandidat. Permanent installation hanteras inom uttrycklig aktuell auktorisering; om nytt användarbeslut behövs ska först detta konkreta paket och dess konsekvenser vara färdigt. Återanvänd inte code-only-verifieringens oförändrade schemaanspråk. Installera additivt utan backfill eller automatisk övergång av befintliga planer, verifiera gamla tabeller/kvitton och byt sedan till exakt prövad artefakt. Kör faktisk läsande OIDC i aktiv app och efterkontrollera verksamhetsdata. Återställ inte till legacy-only-app om V2-data hunnit skapas: kompatibel återställningskandidat krävs, annars tydlig stoppad återhämtning. Logga bara privata hash/bevisreferenser; inga hemligheter eller elevdata. Uppdatera state/resultat och pusha verifierade commits, kontrollera remote SHA.</action>
<verify>Verifiera installationsrapport mot schema- och källhash, inga omärkta gamla radändringar; kandidatbytesrapport mot artefakthash och rätt build-mode; befintliga klassrelationer, beslut och gamla frysta kvitton exakt bevarade. Om steg fallerar gäller FAIL med sann återhämtningsstatus, inget automatiskt datareset. Slutlig kort användarinstruktion visar var års-APL fylls och att perioder behövs inför senare bekräftelse.</verify>
<done>Testad modell är lokalt levererad med oförändrade äldre data och tydligt nytt arbetsflöde, eller ett specifikt blockerat installationssteg redovisat med arbetet bevarat. Användarens begriplighetsbedömning och full fasacceptans är separata status.</done>
</task>
</tasks>
<verification>Avstäm ANNUAL-01–07 mot faktiska rapporter; blanda inte nya resultat med äldre GUIDE-DATES eller automatiska simulerade prov. Bevara alla första fel och motsvarande cleanup.</verification>
<success_criteria>Produktleverans får bara anges när installation, exakt appbyte och efterprov har passerat. Ingen full fas-/pilotacceptans följer automatiskt.</success_criteria>
<output>Skapa 05-APL-ANNUAL-04-SUMMARY.md och uppdatera huvudplanens status först efter uppnådda steg. Root uppdaterar STATE/ROADMAP och ber användaren prova den konkreta enkla arbetsgången.</output>
