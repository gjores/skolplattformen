---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-09
type: execute
wave: 7
depends_on: ["NAMED-TIMPLANS-UX-07"]
files_modified: ["web/app/protected-class-timplans.tsx", "web/app/protected-class-timplans.css", "web/lib/class-timplan-queue.ts", "web/lib/class-timplan-queue.test.mjs", "web/e2e/named-class-links.spec.ts"]
autonomous: true
gap: CLASS-COHORT-UX-01
must_haves:
  truths: ["Två klasser kan kopplas i ett granskat användarflöde till samma plan.", "Användaren ser per klass vad som faktiskt sparats och återstår.", "Avbrott eller konflikt ändrar aldrig oavsiktligt en annan klass eller ett annat läsår."]
  artifacts: ["web/app/protected-class-timplans.tsx", "web/app/protected-class-timplans.css", "web/lib/class-timplan-queue.ts", "web/lib/class-timplan-queue.test.mjs", "web/e2e/named-class-links.spec.ts"]
  key_links: ["Granskad klasslista med flerval", "Kö med beständiga per-klass-kommandon och säker återhämtning"]
---

<objective>
Låt användaren granska och koppla flera klasser med tydligt resultat per klass.

Resultatet ingår i det avgränsade gapet, inte i ett automatiskt godkännande av hela fas 5.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-SS12000.md
</context>

<tasks>

<task type="auto">
<name>1. Granskad klasslista med flerval</name>
<files>web/app/protected-class-timplans.tsx, web/app/protected-class-timplans.css, web/e2e/named-class-links.spec.ts</files>
<action>Ersätt vald-enklass-dropdown med synlig Klasskopplingar för valt läsår, checkbox per möjlig klass och current namedplan/version. Visa också redan kopplade, okopplade och annanplan med tydliga statusord. Valt läsår är explicit från fryst start och befintligt val; välj inte ett annat år tyst. Knapp Koppla valda klasser visar antal och öppnar en granskning med före→efter för varje klass, målplannamn/version och läsår. Redan identisk koppling är markerad som redan klar, inte ny mutation. Byte till annanserie kräver samma explicit bekräftelse som versionsbyte. Behåll huvudmannens läsläge, klassgiltighet, legacybegränsningar och canManage frånserver.</action>
<verify>Dator/telefon UIprov med två tomma klasser till samma plan/år, en redan koppladklass, annanserie, andraåret kvar, klass utanförkull, saknadbehörighet, fokus/44px och tydligmarkering vs sparadkoppling.</verify>
<done>Användaren kan välja två klasser samtidigt och ser exakt vilka länkar som kommer ändras.</done>
</task>

<task type="auto">
<name>2. Kö med beständiga per-klass-kommandon och säker återhämtning</name>
<files>web/lib/class-timplan-queue.ts, web/lib/class-timplan-queue.test.mjs, web/e2e/named-class-links.spec.ts</files>
<action>Använd befintliga atomiska enklasskommandon seriellt; detta är uttryckligt inte en gemensam SQLbatch. Skapa alla granskade commandId och expectedLink/planRevision en gång, spara scopebunden validerad sessionStoragejournal före första nätanrop. UI visar sparad, kvar, konflikt eller okänd per klass och säger aldrig allt sparat förrän samtliga kvitton återlästs frånserver. Stoppa på första konflikt/okändutfall; resubmit endast exakt samma commandId/request för okänd klass, kontrollera färskunderlag och bevara redan klara resultat. Nyförväntad revision är ny användargranskning, inte automatisk overwrite. Journal recovery följer klasscohort befintligt mönster; blockerar navigation/nykörning vid osäker status, MFA eller trasigjournal. Återkallatmandat döljer skyddadstate. Om återläsning visar att en redan kvitterad länk därefter ändrats av annan aktör, visa konflikt och skriv inte tillbaka automatiskt.</action>
<verify>Meningsfulla state-machine Nodeprov och UIprov: första sparad/andra409, svar bort efterCOMMIT, reload, MFA, dubbelklick, scopebyte, journalfel, förloradstorage, annanaktörändrar länk. Kontrollera inga nya requestID vid retry, inga dubbellänkar och inga ändringar i annanklass/annatår.</verify>
<done>Flerval är begripligt även vid delvis genomförd kö; sparat resultat och okänt resultat kan inte blandas ihop.</done>
</task>

</tasks>

<verification>
Dator/telefon UIprov med två tomma klasser till samma plan/år, en redan koppladklass, annanserie, andraåret kvar, klass utanförkull, saknadbehörighet, fokus/44px och tydligmarkering vs sparadkoppling. Meningsfulla state-machine Nodeprov och UIprov: första sparad/andra409, svar bort efterCOMMIT, reload, MFA, dubbelklick, scopebyte, journalfel, förloradstorage, annanaktörändrar länk. Kontrollera inga nya requestID vid retry, inga dubbellänkar och inga ändringar i annanklass/annatår.
SS 12000:2024/OpenAPI 2.1.0: tillämpa paketets mappning; stabila klass-/organisations-ID:n, giltighet och medlemskap får inte ändras. Namngiven timplansserie är intern, inget verifierat standardutbyte.
</verification>

<success_criteria>
- Två klasser kan kopplas i ett granskat användarflöde till samma plan.
- Användaren ser per klass vad som faktiskt sparats och återstår.
- Avbrott eller konflikt ändrar aldrig oavsiktligt en annan klass eller ett annat läsår.
- Redovisa faktisk provnivå, fel och kvarstående arbete. Ingen testmutation på användarens klasser eller länkar.
</success_criteria>

<output>
Skriv 05-NAMED-TIMPLANS-UX-09-SUMMARY.md i samma katalog med ändrade filer, kommandon/resultat, bevarande och avvikelser. Avgränsad commit och push sköts av samordnaren efter granskning.
</output>
