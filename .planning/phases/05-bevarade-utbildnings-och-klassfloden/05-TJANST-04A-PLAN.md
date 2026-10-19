---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-04A
type: execute
wave: 3
depends_on: ["TJANST-04", "TJANST-01A"]
files_modified: ["supabase/migrations/20261016131000_tjanst_self_scope.sql", "work/pilot/verify-tjanst-self-sql.mjs"]
autonomous: true
status: superseded
superseded_on: 2026-10-19
superseded_by: "Fas 05.1 (tjänstefördelning) eller repot tjanstebedomning (tjänstebedömning); se ../05.1-tjanstefordelning/05.1-SPLIT-DECISION.md"
gap: TJANST-T1T2
must_haves:
  truths: ["Verifierad egen tjänst kan auktoriseras före elevgrupper utan att gamla elevvägar öppnas.", "Direkt elevlistning, registerurval, projektion och scope-probe nekar self före metadata hämtas.", "Återkallad personbindning eller mandat stoppar egen åtkomst även efter låsväntan; gruppmandat får oförändrad elevomfattning."]
  artifacts: ["supabase/migrations/20261016131000_tjanst_self_scope.sql", "work/pilot/verify-tjanst-self-sql.mjs"]
  key_links: ["Personal04 + membership + identity → verifierad historikbevarande bindning", "Låst aktuell session/mandat → privat self-personhjälpare → egen person", "Giltigt self → uttryckligt SQL-nekande i alla befintliga elevmetadataentrypoints"]
---

<objective>
Implementera self-form, kontrollerad personbindning och stängda elevvägar i en sammanhängande additiv SQL-migration. Inga nya tjänste-Workergrants öppnas; egen tjänstes read/command/status tillkommer i06 och aktiveras först09.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-DISCOVERY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-01A-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-04-SUMMARY.md
@supabase/migrations/20260927090000_phase3_support_groups.sql
@supabase/migrations/20260929140000_phase4_register_reads.sql
@supabase/migrations/20260929161000_phase4_register_selection.sql
@supabase/migrations/20260929180000_phase4_list_protected_flag.sql
@work/pilot/verify-target.mjs
@work/pilot/verify-mandate-locks.mjs
</context>

<tasks>
<task type="auto">
<name>1. Skapa explicit personbindning och sammanhängande self-skydd</name>
<files>supabase/migrations/20261016131000_tjanst_self_scope.sql</files>
<action>Utgå från04:s faktiska objekt/SQL-inventering och01A:s frysta kontrakt. Skapa stängda tjanst_staff_identity_bindings och historikhändelser med sammansatta person-/medlemskaps-/kund-/huvudmansreferenser, unik aktiv bindning i båda riktningarna och uttrycklig revision/giltighet. Utöka04:s tjanst_personal_command/status med de definierade HM-bindningsoperationerna, exakt samma idempotens/audit och ingen ny offentlig RPC. Bind/unbind serialiseras med sessions-/kund-/personlås och behåller historik; namn/e-post används aldrig som identitetsbevis. Inför privat tjanst_self_person() som efter levande session/mandat, korrekt legacy staff_assignment_binding och den nya bindningen härleder person, tillåtna skolor och bindningsrevision; den accepterar larare/self och befintligt larare/group. Separera en ren bindningskontroll från actor-hjälparen så phase3_mandate_is_valid inte får rekursiva beroenden. I samma migration ersätt phase3_scope_kind och senaste phase3_mandate_shape: endast lärare får self, minst en skola och noll grupp-/elev-/ärenderelationer; aktuell egenbindning krävs för self men inte för gamla gruppmandats elevåtkomst. Uppdatera senaste phase3_insert_mandate så self endast kan tilldelas av giltig rektor till rätt redan bunden person/medlemskap, utan nya konton eller implicit personkoppling. Bevara äldre gruppbeteende. Före commit ska samma migration uttryckligen neka self i senaste phase3_probe_scope, phase4_register_selection, phase4_list_pupils och phase4_projection före metadata-/radläsning; phase4_scope/phase3_pupil_in_scope ska fortsatt ge false. Ingen mellanversion får göra self giltigt med öppen registermetadata. Alla nya tabeller/hjälpare nekas PUBLIC,anon,authenticated,service_role,skolplattform_worker; gamla funktionsgrants bevaras exakt och inga tjänstegrants öppnas.</action>
<verify>Granska full ny migrationsdiff, låsordning, sammansatta FK, unik bindning, senaste ersatta definitioner och full ACL-differens. Kör först transaktion med rollback i validerat isolerat schema-only-mål. Bevisa att gammal data inklusive tidsstämplar, funktioner utanför explicit lista och alla historiska mandat består.</verify>
<done>SQL har ingen väg där ett nytt self-mandat kan läsa elevdata eller registermetadata, och egen person kan härledas utan klientens identitetsval.</done>
</task>

<task type="auto">
<name>2. Bevisa egenbindning, elevnekan och återkallelse med faktisk SQL</name>
<files>work/pilot/verify-tjanst-self-sql.mjs; supabase/migrations/20261016131000_tjanst_self_scope.sql</files>
<action>Skapa målskyddad verifierare med endast egna syntetiska fixturer och säker cleanup. Prova giltig self utan grupp, group utan ny bindning med bevarad elevåtkomst, group med bindning för egen person, person utan konto, annan person/kund/skola, saknad/dubbel/utgången bindning, fel legacy staff-binding, fel förälder samt förbjudna self-relationer. Kör direkta anrop till registerurval/lista/projektion/probe/kort/historik/export/personnummer/ändring/källkonflikt/skyddad identitet som riktig skolplattform_worker och där relevant ägarfixtur för privata hjälpare; self får inget innehåll eller options och inga gamla RPC återinförs. Prova faktiska samtidiga transaktioner: revocation och bindningsavslut under låsväntan, två bindningsförsök, annat payload med samma request, auditfel och status/replay efter återkallelse. Lärare, rektor och administratör får inte skapa HM-bindningen. Redovisa privata hjälpares test som SQL-bevis, inte som redan öppnat egen-API. Spara sanerade resultat, jämför före/efter för alla orörda objekt och städa endast runnerns egna UUID. Rätta endast den nya migrationen före dess kontrollerade tillämpning.</action>
<verify>node work/pilot/verify-tjanst-self-sql.mjs mot dess dokumenterade isolerade mål. Kör relevanta befintliga phase3_policy/phase3_matrix/phase4_selection/phase4_register-prov på samma schema. Kontrollera exakt bevarade gamla grants, fortsatt stängda tjanst-entrypoints och faktisk samtidighet utan att simulera låsväntan.</verify>
<done>Positiva self-identitetsfall, alla negativa elev-/metadatafall och oförändrade gruppmandat har verifierade SQL-resultat; återkallelse gäller även under konkurrens.</done>
</task>
</tasks>

<verification>
TJ1-09 prövas här på SQL-nivå och ger nödvändig grund förTJ1-06/07. SS12000:2024/OpenAPI2.1.0: stabil StaffPerson-bindning hålls skild från Person.externalIdentifiers, Duty och lokala åtkomstmandat; ingen grupprad eller standardexport skapas. HTTP/OIDC-bevis tillkommer07B/09. Ordinarie användarmiljö uppdateras inte av rollbackprov.
</verification>

<success_criteria>
- Self-form och direkt elevnekan levereras i samma migration med bevarade tidigare rättigheter.
- Egen person härleds under levande säkerhetskontroll; bindningsavslut återkallar åtkomst.
- Nya tjänsteentrypoints är fortsatt stängda tills09; varje nytt hjälparobjekt finns i inventeringen.
</success_criteria>

<output>
Skriv 05-TJANST-04A-SUMMARY.md med exakt funktions-/grantslista, bindningskommandon, hjälparens returkontrakt, låsordning, bevarandebevis och SQL-resultat. Samordnaren hanterar avgränsad commit/push.
</output>
