---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "09"
status: complete
completed: 2026-10-01
requirements: [ADMIN-02]
subsystem: protected-programplan-api
requires: [05-08]
provides:
  - Fem sessions-/mandatbundna API-kommandon för programplansutkast
  - Slutna gemensamma kontrakt, obligatorisk DB/Worker-audit och återställande preflight
  - Exakt fem nya Worker-grants, totalt åtta phase5-signaturer
key-files:
  - web/lib/programplan-contract.ts
  - web/lib/server/programplan-planning.ts
  - work/pilot/verify-programplan-api.mjs
  - supabase/migrations/20261001110000_phase5_worker_programplan_execute.sql
  - supabase/tests/phase5_programplan_worker.test.sql
  - docs/programplansgrund-kontrakt.md
commits: [2477d57, 97eadb2, cf40dbc]
worker_build_revision: 2477d57bf97b2e27097f13cdd0115e0645e5e335
---

# 05-09 — skyddat API för programplansutkast

Huvudman och rektor kan nu läsa, uttryckligt binda äldre utkast, ersätta ordnad fördjupning, skapa nästa utkast och klona en tidigare beslutad källa genom skyddad Worker. Fyra mutationer kräver aktuellt MFA-bevis och same-origin; alla fem kräver levande session/kontext och aktuellt skolmandat. Varken fastställande, nationella beslutsregler, list-/utbildningsväljare eller programplans-UI öppnas av denna plan.

## Genomförande och kontrakt

Rena parserfunktioner i `programplan-contract.ts` accepterar fem exakta requestformer och SQL:s slutna tolvfältssvar. Nästlade objekt, typer, faktiska datum, UUID, revisionsgränser, ordnade nivåer, katalogbindning och utbildningens program/inriktning prövas utan koercion eller trunkering. Prototyp-, symbol-, accessor- och extra fält nekas. `resolution` bevarar endast status/diagnostics/unresolvedChoices/decisionReady:false. Obunden äldre plan förblir blocked/unpinned_basis utan gissad start eller katalog.

Routes `/api/programplaner/lasa`, `/binda`, `/fordjupning`, `/skapa` och `/klona` kör parametriserade befintliga SQL-kommandon inom `protectedRoute`-transaktionen. ID/revision/version/utkaststatus/beslutsdatum och begärt underlag kontrolleras innan svaret lämnas ut. Ett malformat SQL-resultat stoppar transaktionen. 409 och nekanden är minimerade, med beständig Worker-händelse; inga råa SQL-fel eller konkurrerande planvärden lämnas ut.

Lyckad DB- och Worker-audit committas i samma yttre transaktion. Alla fem operationer har verklig session, identitet, medlemskap, uppdrag, kund, plan och korrelation i båda källor. Clone-DB-loggen har enbart kontrollerat sourcePlanId. Worker loggar inga råa referenser, namn eller poäng. DB/Worker-loggfel för vart och ett av de fem kommandona bevisar att data, revision, nyplanantal, verksamhetshistoria och ok-events återställs.

Separat migration 20261001110000 öppnar exakt read/bind/replace/create/clone till Worker efter full preflight och exakt återställd funktions-ACL. Klientroller, PUBLIC, helpers, katalog och direkta plan-/historiktabeller förblir stängda. De tre timplanskommandona består. Ingen tillämpad 05-08-migration ändrades.

## Färska verifieringsbevis

- API-preflight: **48/48 PASS**, byggd protected-Worker + verklig PostgreSQL. Full funktions-ACL bytejämförd och återställd före permanent grant.
- Slutligt API efter grant: **48/48 PASS**, inga tillfälliga grants. HM och rektor utför var och en fyra mutationer med omläsning, actual actor-historia, bunden/legacy-kloning, fryst underlag och bevarad beslutskälla. Separata rektorssessioner ger en vinnare/en auditerad409 för bind/replace/create/clone. MFA/proof/CSRF/epoch, skol-/kund-/roll-/session-/mandatgränser och alla tio DB/Worker-auditfel passerar.
- SQL efter grant: **663/663 PASS** över worker31, katalog60, utkast108, timplan77, timplanworker27, timplanslista59, phase3_mandates243, phase3_audit19, phase2_audit20 och phase4_conflicts19.
- Programplansparitet: **42/42 PASS**. Verkliga lås: **6/6 observerade väntan PASS** och yttre SQL-rollback PASS. Timplanslås: **4/4 PASS**.
- Äldre timplans-API med uttrycklig åttasignaturprofil: **39/39 PASS**.
- Full modell/server/generator: **480/480 PASS** vid uppgift1; separata harnessprov **13/13 PASS**. Typkontroll, lint och båda generatorernas bytekontroll PASS. Root byggde source2477d57 i protected och verifierade samtidigt separat timplanshandledning; programplans-API använde samma oförändrade serverbygge. Programplansbrowser/handbok är nästa plans bevis, inte utförda här.

Maskinrapporter: `work/pilot/results/phase5-09-api-preflight.json`, `phase5-09-api.json`, `phase5-09-regression.json`, `phase5-09-locks.json`, `phase5-09-timplan-api.json` och `phase5-09-timplan-locks.json`; individuella SQL-rapporter anger varje delsvit. Source/buildrevision och källhashar redovisas separat. Senare metadata-/grantcommits förändrar inte det testade API-bygget. Historiska 05-08- och timplanslåsrapporter bevarades.

Efter både full preflight och slut-API är hela ursprungliga plan-/utbildnings-/historik-/klasskopplings-/kataloginnehållet hashidentiskt. Egna huvud- och främmandekundgrafer har noll kunder, sessioner, planer, utbildningar och mandat. Append-only säkerhetsloggar och deras identitetsankare behålls; faktiska antal står i cleanup-rapporterna. Lokalt mintade sessioner provar serverns testbevispolicy, inte interaktiv IdP-inloggning, verklig kommunanslutning eller pilotdrift.

## Avvikelser och rättningar

1. Rule3: `phase5_timplan_selection.test.sql` hade ytterligare historisk förväntan om tre Worker-kommandon utanför planens fillista. Endast den förväntningen ändrades till åtta; ett nytt fullsignaturprov säkerställer exakt fem programplans-/tre timplanskommandon och fortsatt stängda helpers. Ingen rättighet vidgades för att passa provet.
2. Provharnessens första körning hade två provfel: objektens nyckelordning jämfördes betydelsebärande och ett mandatdatumfält var felnamngivet. Canonisk jämförelse och verkliga valid_from/valid_to användes i slutprov. Inga produktregler eller API-kommandon ändrades.
3. Ägd cleanup behövde hantera nya sessions-FK:n i verksamhetshistorien. Endast egna mintade sessions-ID:n tas nu bort i kontrollerad syntetisk replica-transaktion. Första grafen återställdes separat, säkerhetsloggar/identitetsankare bevarades. Två syntetiska kundfixturer kräver återbruk av egna temporära funktioner/tabell på samma anslutning; detta rättades. Full omkörning bevisade noll rester, exakt ACL och originalhashar.

## Nästa gräns

05-10 behöver mandatbundet utbildnings-/versionsurval, råa äldre ordnade val och exakt återfunnet katalogunderlag före en användbar UI-vy. 05-09:s legacyread lämnar inga gamla val som UI får gissa. Fastställande och fullständiga nationella alternativ/ramar/nivåföljd/timmar återstår och decisionReady förblirfalse. Poäng är gymnasiepoäng, inga schemaminuter. Stabilt offering/unit/plan/version/revision och frysta katalog-/program-/ämnesversioner bevaras; inga nya schema-/studieplans-/modulmandat eller klassombindningar införs. ADMIN-02 och fas5 är fortfarande inte slutverifierade; fas4:s mänskliga checkpoint kvarstår separat.
