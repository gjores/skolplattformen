---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-09
type: execute
wave: 6
depends_on: ["TJANST-04A", "TJANST-07", "TJANST-07B", "TJANST-08"]
files_modified: ["supabase/migrations/20261016140000_tjanst_worker_access.sql", "work/pilot/tjanst-fixtures.mjs", "work/pilot/verify-tjanst.mjs", "work/pilot/verify-tjanst-api.mjs", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-VERIFICATION.md"]
autonomous: true
status: planned
gap: TJANST-T1T2
must_haves:
  truths: ["Det faktiska API:t och databasen ger samma tjänsteberäkning och mandatbesked som modellen.", "Samtidiga ändringar och återkallade uppdrag kan inte ge dubbla reservationer eller obehöriga beslut.", "Nya personalfunktioner lämnar befintliga elev-, klass-, program-/timplansflöden och åtkomstgränser intakta."]
  artifacts: ["supabase/migrations/20261016140000_tjanst_worker_access.sql", "work/pilot/verify-tjanst.mjs", "work/pilot/verify-tjanst-api.mjs", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-VERIFICATION.md"]
  key_links: ["Exakta migrationsbytes → isolerat installerat schema → exakt15Workerentrypoints", "Riktig Worker/session → låst SQL → oberoende TSparser → svar/audit", "Två verkliga anslutningar → bevisat låsöverlapp → konflikt eller identiskt replay"]
---

<objective>
Aktivera och verifiera T1/T2:s15grundentrypoints i ett explicit isolerat syntetiskt mål. Bevisen omfattar riktig SQL och HTTP, inte användarens verkliga data, extern avtalsanslutning eller kommunintegration.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/TESTING.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@work/pilot/verify-target.mjs
@work/pilot/verify-named-timplans.mjs
@work/pilot/verify-class-cohort-api.mjs
@work/pilot/phase5-class-cohort-oidc-fixtures.mjs
@web/lib/tjanst-plan.ts
@web/lib/tjanst-bedomning.ts
</context>

<tasks>
<task type="auto">
<name>1. Verifiera migrationskedjan, paritet och exakt aktivering</name>
<files>supabase/migrations/20261016140000_tjanst_worker_access.sql; work/pilot/tjanst-fixtures.mjs; work/pilot/verify-tjanst.mjs</files>
<action>Skapa granskad allowlist med exakt public.tjanst_personal_read/command/status(jsonb),tjanst_avtal_read/command/status(jsonb),tjanst_plan_read/command/status(jsonb),tjanst_assessment_read/command/status(jsonb),tjanst_self_read/command/status(jsonb). Migrationen ger endast dessa15 EXECUTE till skolplattform_worker; inga nya tabell-/helpergrants och inget återöppnande för PUBLIC/anon/authenticated/service_role.04A:s eventuella uttryckligt dokumenterade bindnings-/mandatvägar inventeras separat, inga wildcardgrants. Skapa explicit målvalidering och syntetiska fixturer via befintliga granskade schema-onlyhjälpare; exportera inga auth-/personal-/elevrader från aktiv miljö. Kör hela paketet förstrollback, sedaninstallerat med exakt migrationsjournal. Före/efter omfattar gamla kolumner inklusive tidsstämplar, program-/timplaner, klasser/medlemskap, beslut/kvitton, befintlig APL om installerad, auditankare och ACL/funktionsfingeravtryck. Pröva01–03A:s verkliga TS/SQL-paritet inklusive konservativ avrundning,120procent, periodbyte, samläsning, två lärare, obemannat, flera avtal och historik. Ogranskad framtida profil ska bara vara syntetiskt scenario. Transferfamiljen i15 finns ännu inte och får inga grants här.</action>
<verify>node work/pilot/verify-tjanst.mjs med runnerns dokumenterade explicit isolerade mål. Resultatet ska ange faktiska migrationshashar, exakt15grantdiff, helper/tabell-diff0, testfall per kriterium och full egen cleanup. Ingen okänd/skippad kontroll får döljas bakom samlatPASS.</verify>
<done>Installerad SQL och rollback bevarar syntetiska förhandsdata och har exakt avsedd åtkomst/paritet.</done>
</task>

<task type="auto">
<name>2. Kör riktig Worker-/API-matris och samtidighet över skolor</name>
<files>work/pilot/verify-tjanst-api.mjs; work/pilot/verify-tjanst.mjs; work/pilot/tjanst-fixtures.mjs</files>
<action>Starta separat faktisk Worker mot samma validerade testdatabas; använd egna syntetiska sessioner och dokumentera hur de skapats, kalla dem inte interaktiv verklig IdP om de är mintade. Testa samtliga15routes positivt där mandatet tillåter och negativt för HM/rektor/admin/lärare-self/lärare-grupp, annan kund/skola/person, saknad/återkallad identitetsbindning, utgånget mandat, CSRF/MFA, payloadfel och auditfel. Direkt elevlista/urval/projektion/scopeprobe ska neka self, även när inga elever skulle returneras. Bevara befintlig gruppbaserad läraråtkomst och tidigare HM-/rektorsgränser. Två riktiga databasanslutningar visar låsöverlapp vid samma sista personkapacitet från två skolor, save/save, confirm/save, confirm/profilbyte, confirm/återkallat initiativ och identiskt requestreplay. Bevisa vinnare, väntelås, konflikt eller identiskt kvitto och frånvaro av delskrivning. Förlorat HTTPsvar återhämtas via samma request/status; sent kvitto får inte bli aktuell plan. APIavbrott är fel/okänt, aldrigPASS. Mät begränsad läs-/skrivlatens mot syntetiskt uppgiven datamängd utan att kalla det produktionslastbevis.</action>
<verify>node work/pilot/verify-tjanst-api.mjs och runnerns samtidighetsdel. Granska råa HTTPstatus, innehållsprojektion och auditkedja för alla nya entrypoints. Visa att verklig nekad SQL/APIåtkomst, inte dold UIknapp, upprätthåller rektorsconfirm och lärarinitiativ.</verify>
<done>Faktisk Worker/SQL fungerar sammanhängande med snäv egenåtkomst och samtidighet utan dubbelkapacitet.</done>
</task>

<task type="auto">
<name>3. Samla spårbar bevisning och frisläpp endast avgränsad backend</name>
<files>.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-VERIFICATION.md</files>
<action>Redovisa TJ1-01–07/09 med konkreta modell-, SQL- och HTTPresultat; TJ1-08 väntar15 och UI-/handboksdelenTJ1-10 väntar efterföljande planer. Särredovisa gamla regressioner, syntetisk installationsbevaring, faktisk session/OIDC-nivå, SS12000-schemaanalys och ej provad extern anslutning. Spara första fel och korrigerande omprov utan att skriva om historiken. Kontrollera att resultat som versionshanteras är aggregerade och hemlighetsfria. Kör relevant komplett Nodekontroll, typ/lint och en skyddad appbyggnad för den sammanhängande backendversionen enligt aktuellt repo; broad regression utökas endast för ändrade gemensamma åtkomstvägar. Ordinarie3012 och dess databas ändras inte av09; senare leveransplan prövar exakt överföring och bevarande.</action>
<verify>Från web: node --test lib/*.test.mjs lib/server/*.test.mjs, npx tsc --noEmit, npx oxlint app lib och npm run build med repoets avsedda skyddade konfiguration. Läs kontrollrapportens varje matrisrad; inga framtidaUI-/användarprov markeras klara.</verify>
<done>Backendens faktiska resultat och begränsningar är spårbara, med inga falska produkt-/fasgodkännanden.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
Pröva gemensam individuell undervisnings-/PU-ram över skolor enligt SharedAssessmentBasis: tak500 och300+300undervisning ska neka trots tillräcklig totalbudget;300+200 kräver minst600PU utan dubbel förtroendetidsallokering.03A definierar modellen,06 lagrar/prövar gemensam grund och12 låter berörda rektorer bekräfta sina delar. Huvudmannen fastställer inte.
Följ kontraktets reservationslivscykel: max(gällande publicerad budget, godkänd aktiv utkastreservation) per skolbeslut/anställningssegment, historik belastar inte. Prova100→utkast100=100,100→utkast80=100 fram till confirm,100→120=120 endast med tillgängligt20, avbryt120→100 och konkurrerande annan skola före/efter fastställd minskning. Fastställande/flytt uppdaterar hela reservationen atomärt. Prova dessutom dimensionerna separat: total1000/reglerad800→total1000/reglerad900 måste reservera ytterligare100 reglerade minuter; PU-minimum kontrolleras utan additiv dubbelräkning.
Behöver:07/08:s adaptrar,04A:s direkta self-skydd och07B:s sessions-/mandatregression. Skapar: verifierad grundaktivering och bevis tillUI/15/slutgrind. SS12000:2024/OpenAPI2.1.0 bevarad identitet/enhet/relation prövas på intern modellnivå; extern kontraktsöverföring ingår inte. Användarens originaldata är inte bevarandebevis från en syntetisk kopia.
</verification>

<success_criteria>
- Exakt15grundentrypoints är aktiverade och verkligt HTTPprövade i isolerat mål.
- Kapacitet, beslut, egenåtkomst och felåterhämtning klarar negativ- och samtidighetsmatrisen.
- Befintliga datarelationer/åtkomstgränser är verifierat bevarade inom beskriven syntetisk provnivå.
</success_criteria>

<output>
Skriv 05-TJANST-09-SUMMARY.md samt uppdateraVERIFICATION med käll-/bygg-/migrationshashar, resultat, begränsningar och nästa beroende. Samordnaren hanterar avgränsad commit/push.
</output>
