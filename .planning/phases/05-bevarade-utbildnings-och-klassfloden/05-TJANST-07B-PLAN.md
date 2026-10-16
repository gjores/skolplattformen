---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-07B
type: execute
wave: 5
depends_on: ["TJANST-07A"]
files_modified: ["web/app/mandate-grant-dialog.tsx", "web/app/mandate-workspace.tsx", "work/pilot/tjanst-self-fixtures.mjs", "work/pilot/verify-tjanst-self-access.mjs"]
autonomous: true
status: planned
gap: TJANST-T1T2
must_haves:
  truths: ["Rektor kan uttryckligen tilldela Egen tjänst till en identitetsbunden lärare utan att välja elevgrupp.", "En lärare med self får inga elevdata eller registermetadata via direkt HTTP/SQL.", "Lärare med befintligt gruppmandat behåller samma avgränsade elevåtkomst och kan inte få self genom klientmanipulation."]
  artifacts: ["web/app/mandate-grant-dialog.tsx", "web/app/mandate-workspace.tsx", "work/pilot/tjanst-self-fixtures.mjs", "work/pilot/verify-tjanst-self-access.mjs"]
  key_links: ["Rektors skolurval + Egen tjänst → befintlig mandatroute →04A:s serverkontroll", "Riktig OIDC/session/context → self/group → olika elevresultat", "Negativa HTTP-anrop → faktisk Workerroll och obligatorisk audit, inga metadata"]
---

<objective>
Gör det snäva mandatet begripligt för rektor och bevisa att self inte ger elevåtkomst. Detta är mandat-/sessionsleveransen inför09; tjänstevyn och positiva tjänste-HTTP-prov kommer efter09:s samlade aktivering.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-DISCOVERY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-04A-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-07A-SUMMARY.md
@web/app/mandate-grant-dialog.tsx
@web/app/mandate-workspace.tsx
@web/app/api/kund/mandat/route.ts
@work/pilot/verify-target.mjs
@work/pilot/verify-mandates.mjs
@work/pilot/verify-register.mjs
</context>

<tasks>
<task type="auto">
<name>1. Erbjud ett uttryckligt Egen tjänst-mandat med skolurval</name>
<files>web/app/mandate-grant-dialog.tsx; web/app/mandate-workspace.tsx</files>
<action>Utöka Scope, scopeText, scopesFor och mandatlistans typ/etikett med self för lärare. Lärarvalet erbjuder Egen tjänst och Tilldelade grupper som skilda omfattningar; self kräver faktisk skola inom rektorns befintliga urval och skickar tomma grupper/pupilIds/caseIds. Visa att Egen tjänst avser lärarens eget planeringsunderlag och inte elever. Vid byte mellan scope rensas oförenliga lokala val innan payload skapas; ett gammalt gruppval får inte följa med dolt. Bindning skapas inte i dialogen: saknad verifierad personalbindning ger ett begripligt serveravslag och hänvisning till att personkopplingen behöver kompletteras. Behåll MFA, giltighetsgränser, väntestatus, felhantering och befintlig grupper/support/elevhälsa. Fördröj publicering av UI till sammanhållen prövad leverans; ingen automatisk tilldelning görs. Ändra inte protected-home.tsx, egen tjänstevy eller skolornas verksamhetsdata.</action>
<verify>npx tsc --noEmit och npx oxlint app/mandate-grant-dialog.tsx app/mandate-workspace.tsx. Prova dialogens val self→group→self och att payload endast innehåller valda skolor och tomma elevrelationer vid self. Faktiskt dator-/telefonprov med denna UI och server genomförs i nästa task.</verify>
<done>Rektor kan välja Egen tjänst och ange giltig skola utan grupp, med tydlig skillnad mot elevmandatet.</done>
</task>

<task type="auto">
<name>2. Verifiera mandatUI, verklig session och alla negativa elevvägar</name>
<files>work/pilot/tjanst-self-fixtures.mjs; work/pilot/verify-tjanst-self-access.mjs</files>
<action>Bygg ett isolerat, målvaliderat verkligt Worker/OIDC-prov med egna syntetiska person-/konto-/mandat-/elevfixturer och läs befintliga mål-/återställningsverktyg före körning. Personbindningar sätts med04A:s stängda SQL under verifierarens ägarfixtur; detta får inte felrapporteras som öppnad personal-API. Kör faktisk rektorsdialog på dator och telefon: giltig self-tilldelning, saknad bindning, scopebyte, eget skolurval, fel annan skola och nekad fel roll. Logga in som self-lärare och verifiera GET session/POST context och efterföljande omladdning. Anropa direkt elever/urval, lista, elev, historik, personnummer, export och andra plus aktuella källkonflikt-/skyddad-identitetvägar med giltiga, manipulerade och främmande ID:n: alla ska neka self utan elev-/klass-/utbildningsoptions. Kör04A:s direkta SQL-negativa fall för att fånga försök förbi HTTP. Prova befintlig group-lärare mot exakt sina tillåtna och förbjudna elever före/efter, self/group-kontextbyte, avslutad bindning, återkallad förälder, spärrat medlemskap, gammal epoch och sessionscookie från annan identitet. Pröva verklig audit-/mandatkedja, inga stubbsvar. Kontrollera skriftlig likhet för alla orörda data/ACL före/efter, sanera resultat och städa bara egna fixturer. Nya tjanst_self-HTTP-vägar är fortsatt stängda tills09 och ska inte öppnas tillfälligt för provet; positiv egenvy/återkoppling/initiativ återstår09/13.</action>
<verify>node work/pilot/verify-tjanst-self-access.mjs mot runnerns dokumenterade validerade mål; kör även node work/pilot/verify-tjanst-self-sql.mjs på samma verifierade schema. Relevanta befintliga mandat-/registerregressioner ska PASS. Kör npm run build efter UI-ändring och dokumentera faktiskt source/build för browserprovet. Dator och telefon ska ha användbara kontroller, synliga fel, fungerande fokus och ingen horisontell blockerande layout.</verify>
<done>Faktisk rektors-UI och OIDC visar rätt scope; self nekas vid samtliga gamla elevvägar och gamla gruppmandat fungerar inom exakt samma gränser. Ingen ny tjänste-API eller ordinarie användardata ändras.</done>
</task>
</tasks>

<verification>
TJ1-09: verklig Worker-/sessions-/mandat-/elevavgränsning och återkallelse; del avTJ1-10 för mandatdialogens dator-/telefonbeteende. SS12000:2024/OpenAPI2.1.0: lokal self-beteckning skapar ingen Duty/Group och ingen utbytesrätt. Handbok för användarleveransen hanteras i paketets senare dokumentationsplan;07B ska överlämna exakt beteende och begränsningar dit. Detta steg är inte en full leverans avTJ1-06/07.
</verification>

<success_criteria>
- UI kan tilldela self utan grupp och binder inte automatiskt person/konto.
- Alla negativa elev- och metadatafall nekar via faktisk HTTP och SQL; befintliga gruppfall är bevarade.
- Personliga uppgifter, hemligheter och bedömningsinnehåll förekommer inte i loggar/resultat.
-09 får sanerade bevis och kan aktivera tjänste-API först efter samlad kontroll;10 äger fortsatt skalnavigation.
</success_criteria>

<output>
Skriv 05-TJANST-07B-SUMMARY.md med dator-/telefonresultat, verklig OIDC/Worker-matris, audit-/bevarandebevis och kvarstående positiva egen-API-/UI-prov för09/10/13. Samordnaren hanterar avgränsad commit/push.
</output>
