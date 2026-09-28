---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "11"
subsystem: protected-permission-api-ui
status: complete
completed: 2026-09-28
requires: [04-03, 04-07, 04-08]
provides:
  - Huvudmannens auditerade API för skolbunden skyddsbehörighet
  - Dialog för att tilldela och återkalla behörighet till befintligt administratörsuppdrag
  - Separat migration för tre smala Worker-entrypoints
requirements-addressed: [DATA-01]
requirements-finally-verified: []
---

# Fas 4 plan 11: huvudmannens skolbundna skyddsbehörighet

**Huvudmannen kan välja en skola och ett giltigt administratörsuppdrag, granska aktuell skyddsbehörighet och uttryckligen bekräfta tilldelning eller återkallelse. Ingen elevlista tillkommer för huvudmannen.**

## Leverans

- `GET /api/kund/skyddsbehorighet` kräver huvudman och obligatorisk loggning. Urvalet kommer från den befintliga SQL-funktionens levande mandatkontroll och begränsas till organisationens giltiga administratörsuppdrag och huvudmannens skolor.
- `POST` godtar enbart `{action:'grant',assignmentId,unitId}` eller `{action:'revoke',permissionId}`. Servern nekar extra fält, inklusive klientvald aktör. Huvudman, aktuell kontext, MFA och samma ursprung krävs. Aktör/kund/organisation härleds i databastransaktionen.
- `mandateOperation` bevarar den lokala syntetiska målgränsen och minimerar SQL-fel. `protectedRoute` skriver `protected_permission_granted` respektive `protected_permission_revoked` i samma transaktion som själva beslutet. Loggfel kastar `AuditUnavailable` och rullar tillbaka beslutet innan något lyckat svar lämnas.
- Läsningen loggas som `protected_permission_listed`. Loggen innehåller rättighetens ID och serverns aktörskontext, inga elevuppgifter eller fria personvärden i metadata.
- `20260929131000_phase4_permission_worker.sql` öppnar endast list/grant/revoke för Worker. Inga tabellrättigheter eller interna hjälpfunktioner öppnas. Den redan tillämpade 04-03-migrationen ändras inte.
- Knappen **Hantera skyddsbehörighet** finns enbart i huvudmannens mandatvy. Dialogen erbjuder **Skola**, **Administratörsuppdrag**, aktuell status, **Ge/Återkalla skyddsbehörighet** och därefter uttrycklig bekräftelse. Rektorns vanliga tilldelningsdialog är oförändrad.
- Dialogen skyddar osparade beslut vid stängning, byte av urval och navigering; MFA-åtgärden finns inne i dialogen. Alla knappar och urval har minst 44 px pekyta, fokus flyttas till bekräftelse och åter efter spara. Lyckad ändring läser om serverns status; fel bevarar valet utan att påstå att beslutet sparats. Vid stängning, ändrad kontext eller övergiven hämtning ignoreras sena resultat.

## Faktisk verifiering

| Kontroll | Resultat |
|---|---|
| RED, före implementation | Saknad route/helper, förväntat fel |
| `node --test lib/server/protected-permission.test.mjs` | PASS 7/7 |
| `npx tsc --noEmit` | PASS |
| `npx oxlint app lib` | PASS |
| Verkligt Worker-API och loggfel mot lokal databas | PASS 8/8 API-fall via Chromium/WebKit; faktisk grant/revoke-rollback vid loggfel |
| UI på dator | PASS: skol-/adminval, bekräftelse, grant/revoke, fokus/tangentbord, osparat, MFA-fel och loggfel med bevarade val, 44 px höjd/bredd och layout |
| UI på telefon | PASS: samma dialogflöde i WebKit/iPhone 13, 9,4 s; skärmbilder granskade |
| Permanent migration | 131000 tillämpad efter `assertTarget` och 8/8 riktiga API-fall; efterföljande 140/140 projektions-/rättighetsprov PASS |

Snabbproven använder den riktiga routen, `protectedRoute`, `mandateOperation` och händelseskrivaren med simulerad session/databastransaktion. De bevisar payloadgräns, HM-only för både läsning och skrivning, MFA, ursprung, stale epoch, loggning och simulerad rollback för grant/revoke/list. **Simulerad rollback är inte ensam bevis för riktig databasrollback**; verklig rollback är separat verifierad ovan. MFA-felets presentation simuleras i UI-provet; backendens MFA-nekande provas separat med en faktiskt utgången testsession.

## Avvikelser som rättats

**Rule 1, tillgängligt dialognamn:** det första browserprovet visade en öppen dialog med synlig rubrik men utan tillgängligt namn. Den nya dialogen binder nu uttryckligen `aria-labelledby` och `aria-describedby` till titelns/beskrivningens stabila ID. Den befintliga BaseUI-komponenten behövde inte ändras. Typkontroll, lint, ombygge och strikt desktopbrowseromprov passerar. Testets exakta `getByLabel` ersattes med rollen `combobox` och dess beräknade namn: omslutande HTML-label omfattar även options-text i testverktygets labelmatchning. Inget ytterligare produktfel hittades; namngiven dialog verifierades också efter att urvalet laddats.

## Krav och begränsningar

**DATA-01/D-17 →** uttrycklig huvudmannatilldelning per administratörsuppdrag och skola, serverkontroll, auditerad återkallelse och UI. Rättigheten bygger på 04-03:s levande givar-/mottagarkedja. Elevprojektion är SQL-prövad i 04-04 men ännu inte öppnad via register-API. Samlat UI-prov i 04-19, slutgrind 04-21, mänskligt prov 04-22 och separat fasverifiering återstår. Endast lokal syntetisk miljö; verklig drift eller kommunanslutning godkänns inte.

## Commits

- `b1e422f` — RED: routens behörighetsgräns och loggfel.
- `75f489c` — auditerat API, strikt payload och separat Worker-GRANT.
- `b05c78b` — dialog och verkliga API-/browserprov, dator och telefon.

Global STATE/ROADMAP/VALIDATION ägs av orkestratorn. Orelaterade ändringar ingår inte i planens commits.

Full SQL-regression efter våg 4: FAIL, 14 filer och 454 passerade assertions; sex äldre fas 3-fixturer avbryts före assertions enligt tidigare känt portningsbehov i 04-14/15. Ingen fil hoppas över. Samlad modell-/serversvit 357/357 PASS, skyddat appbygge PASS. Handboken är uppdaterad; byggresultat redovisas i vågrapporten.
