---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-17
type: execute
wave: 12
depends_on: ["TJANST-16"]
files_modified: ["work/pilot/tjanst-oidc-fixtures.mjs","work/pilot/tjanst-api-scenarios.mjs","work/pilot/tjanst-browser-scenarios.mjs","work/pilot/verify-tjanst-api.mjs"]
autonomous: true
status: superseded
superseded_on: 2026-10-19
superseded_by: "Fas 05.1 (tjänstefördelning) eller repot tjanstebedomning (tjänstebedömning); se ../05.1-tjanstefordelning/05.1-SPLIT-DECISION.md"
must_haves:
  truths: ["En fastställd tjänst kan följas från vald avtalsversion och exakt klassbehov till lärarens egen publicerade vy.","Samtidiga rektorer kan inte förbruka samma kapacitet och lärare kan inte läsa andra personers tjänster eller skapa rektorsbeslut.","Samma flöde fungerar på dator och telefon med verkliga HTTP-svar."]
  artifacts: ["work/pilot/tjanst-oidc-fixtures.mjs","work/pilot/tjanst-api-scenarios.mjs","work/pilot/tjanst-browser-scenarios.mjs","work/pilot/verify-tjanst-api.mjs"]
  key_links: ["Exakt versionsbundet underlag → verifierat beteende → redovisad provnivå"]
---

<objective>
Verifiera hela tjänsteflödet i riktig isolerad Worker/OIDC-miljö. Omfattar TJ1-01–10 med särskilt fokus på hela kedjan och faktisk serverkontroll. Ingen full kommunanslutning eller fullständig fasacceptans följer av paketet.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-DISCOVERY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-16-SUMMARY.md
@work/pilot/verify-rector-programplan-api.mjs
@work/pilot/named-timplan-snapshot.mjs
@work/pilot/named-timplan-runtime.mjs
@work/pilot/named-timplan-oidc-fixtures.mjs
</context>

<tasks>
<task type="auto">
<name>Bygg och kör verkliga HTTP- och behörighetsfall</name>
<files>work/pilot/tjanst-oidc-fixtures.mjs; work/pilot/tjanst-api-scenarios.mjs; work/pilot/verify-tjanst-api.mjs</files>
<action>Utöka den befintliga verify-tjanst-api.mjs från09 och behåll dess API-/nekandefall; skapa ingen parallell runner som tappar dessa fall. Utgå från verifierad09-databasmatris,15-transferprov och befintliga named-timplan snapshot/runtime/oidc-hjälpare efter färsk källgranskning. Skapa en schema-only-isolerad miljö med syntetiska personer, två huvudmän, två skolor, HM/rektor/administratör och två lärare (self respektive grupp). Ingen kopia av liverader, inget reset av aktivt mål. Applicera exakta migrationshashar för paketet i isoleringen. Runner tar --build ABSOLUT_BEVARAT_BYGGE --out /private/tmp/NYTT_PRIVAT_RESULTAT.json, prövar målidentitet före varje skrivning och dokumenterar käll-/artefaktmanifest och faktisk Keycloak→GoTrue→Worker-session/MFA. Prova minst två avtal med olika ram, deltid, mittårsbyte, utgången profil, saknad ram, två skolor, två klasser/samläsning, mentorskap, fastställande/publikation, dialogversion och11§1-lärarinitiativ, återkallelse, annan person/skola, spoofat initiativ och auditfel. Lärare+self nekas även direkta elevlist-/urvals-/projektionsvägar. Testa faktisk konkurrens i två sessioner för kapacitetsreservation och fastställande mot ändrat underlag; återanvänt commandId med ändrat payload samt borttappat svar/status. Årskopiering/flytt/batch ska bevara källan och vara atomär. Runner ska sluta FAIL om cleanup eller originalbevarande misslyckas, inte bara om verksamhetsassertion faller.</action>
<verify>Kör node work/pilot/verify-tjanst-api.mjs --build <artefakt-från16> --out <ny-privat-json>. Redovisa faktiska HTTP-statusar, återlästa DB-resultat, konkurrensutfall och nekad åtkomst. Kontrollera ursprungliga verksamhetstabeller, metadata, ACL och audit/session-delta med uttrycklig förväntan och exakt egen cleanup. Skriv inga personrader, tokens eller anteckningar i Git.</verify>
<done>Verkliga datavägar och negativa mandatfall är prövade på samma oförändrade bygge; källdata och den aktiva lokala appen är bevarade.</done>
</task>

<task type="auto">
<name>Pröva rektors, lärarens och huvudmannens sammanhängande arbetsgång</name>
<files>work/pilot/tjanst-browser-scenarios.mjs; work/pilot/verify-tjanst-api.mjs</files>
<action>Lägg faktiska browserfall ovanpå samma isolerade identiteter och HTTP-miljö. Dator och telefon ska genomföra avtalsval, två tjänster, samläsning, mentorskap, individuell motivering, publicering, egen återkoppling, huvudmannens åtgärd och kopiering till nästa år. Prova även byte av skola/person/läsår, reload/Back, konflikt och okänt skrivutfall. Kontrollera att schemaandel/utfall är saknat underlag och att undervisning/PU/tidsform har tydliga enheter. Fånga skärmbilder och mät primära kontroller minst44×44px, fokus och innehåll inom bredd. Granska bilderna visuellt; testgrönt ensamt räcker inte. Matcha TJ1-01..10 mot faktiskt bevis och kända begränsningar, utan att stänga hela pilotkrav.</action>
<verify>Kör hela runnern med både dator- och telefonprojekt. Fullständiga resultat för alla planerade fall, noll tysta skips och granskade bilder krävs. Vid kodändring bygg en ny identifierad kandidat och kör om berörda regressionsfall samt hela beslutskedjan. Bevara första fel som historik.</verify>
<done>Alla lokala acceptanskriterier har tydlig teknisk verifiering eller redovisad lucka; inga simulerade API-prov kallas faktisk kommunanslutning.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
Pröva gemensam individuell undervisnings-/PU-ram över skolor enligt SharedAssessmentBasis: tak500 och300+300undervisning ska neka trots tillräcklig totalbudget;300+200 kräver minst600PU utan dubbel förtroendetidsallokering.03A definierar modellen,06 lagrar/prövar gemensam grund och12 låter berörda rektorer bekräfta sina delar. Huvudmannen fastställer inte.
Följ kontraktets reservationslivscykel: max(gällande publicerad budget, godkänd aktiv utkastreservation) per skolbeslut/anställningssegment, historik belastar inte. Prova100→utkast100=100,100→utkast80=100 fram till confirm,100→120=120 endast med tillgängligt20, avbryt120→100 och konkurrerande annan skola före/efter fastställd minskning. Fastställande/flytt uppdaterar hela reservationen atomärt. Prova dessutom dimensionerna separat: total1000/reglerad800→total1000/reglerad900 måste reservera ytterligare100 reglerade minuter; PU-minimum kontrolleras utan additiv dubbelräkning.
Följ kontraktets två hashvärden: initiativ binder initiativeBasisHash utan sin egen händelse eller senare prövning; decisionHash inkluderar slutlig prövning och referens till giltigt initiativ. Prova positivt delning→eget initiativ→rektors prövning→fastställande utan självogiltigförklaring, samt negativt ändrad faktisk tjänst/undantagsvillkor och återkallat initiativ.
Inventera berörda filer vid start och följ kontraktets SS 12000-mappning, aktuella mandat, sekretess och okändsemantik. Tidigare PASS ersätter inte kontroller av nya ändringar.
</verification>

<success_criteria>
- En fastställd tjänst kan följas från vald avtalsversion och exakt klassbehov till lärarens egen publicerade vy.
- Samtidiga rektorer kan inte förbruka samma kapacitet och lärare kan inte läsa andra personers tjänster eller skapa rektorsbeslut.
- Samma flöde fungerar på dator och telefon med verkliga HTTP-svar.
- Resultatets nivå och begränsningar är dokumenterade; pilotens äldre acceptans skrivs inte om.
</success_criteria>

<output>
Skriv 05-TJANST-17-SUMMARY.md och uppdatera paketets implementeringsöversikt/verifieringsmatris med faktiska resultat. Genomför avgränsad commit/push enligt projektreglerna.
</output>
