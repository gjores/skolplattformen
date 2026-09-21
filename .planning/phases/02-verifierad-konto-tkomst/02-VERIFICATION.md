---
phase: 02-verifierad-konto-tkomst
verified: 2026-09-21T13:46:42Z
status: passed
score: 5/5 must-haves verified
requirements:
  satisfied: [IAM-01, IAM-03, IAM-04, IAM-05, ACL-01, AUDIT-01]
  out_of_scope: [IAM-02, IAM-06]
---

# Fas 2: Verifierad kontoåtkomst — verifieringsrapport

**Fasmål:** Personal kan arbeta i en verifierad och återkallningsbar arbetskontext, med kundavgränsning och spårbarhet från den första skyddade ändringen.

**Verifierad:** 2026-09-21T13:46:42Z  
**Status:** passed  
**Verifieringsläge:** Initial, mål-bakifrån efter genomförda planer och godkänd användarkontrollpunkt.

## Dom

Fasmålet är uppnått inom den beslutade lokala och syntetiska pilotgränsen. Samtliga fem observerbara sanningar och de sex fasägda kraven har substantiell implementation, fungerande kopplingar och sammanhängande bevis. Den fulla fasgrinden gav PASS 2026-09-18, produktkällans fingeravtryck är fortfarande exakt samma, och en ny riktad kontroll 2026-09-21 gav 175/175 godkända modell- och fasgrindsprov.

Den lokala Keycloak-miljön är ett test av appens identitetskontrakt. Den är inte en godkänd kommunanslutning och uppfyller inte IAM-02 eller IAM-06. Dessa krav ägs fortsatt av fas 7.

## Goal Achievement

### Observable Truths

| # | Sanning som måste vara sann | Status | Bevis |
|---|---|---|---|
| 1 | En verifierad företrädare kan etablera kundens första medlemskap utan att organisationsnummer eller e-postdomän i sig ger rättighet. | ✓ VERIFIED | `web/app/api/inbjudan/losen/route.ts` låser en engångsinbjudan, kräver MFA och matchar exakt `issuer` + `subject` innan medlemskap och kundadminuppdrag skapas i samma transaktion. `web/lib/invitation-rules.ts` begränsar grant till kundadmin/granskare. Accessgrinden provar fel issuer, fel subject, utgången token, replay och samtidig inlösen. |
| 2 | Personal kan välja endast sina giltiga uppdrag och annan kunds objekt eller metadata förblir dolda även vid direkta anrop, export och alternativa vägar. | ✓ VERIFIED | `web/app/api/session/route.ts` härleder uppdrag från serverlagrad identitet, `web/app/api/context/route.ts` låser och validerar valt uppdrag, och `web/lib/server/db.ts` återprövar medlemskap, kund och giltighet i varje transaktion. RLS och sammansatta främmande nycklar finns i fasens migrationer. Slutgrinden redovisar 137 pgTAP, 39/39 nekade direkta vägar och kundseparerade API-/loggprov. |
| 3 | Utloggning avslutar appsessionen och kontextbyte eller utloggning rensar och låser gammalt innehåll även mellan flikar. | ✓ VERIFIED | `web/app/api/auth/logout/route.ts` återkallar server-sessionen och rensar cookien. `web/app/context-switch.tsx` och `web/lib/server-client.ts` använder kontextepok och fliksignalering; gamla svar nekas eller låser fliken. Browsermatrisen bevisar utloggning, byte, fliklåsning och rensning på desktop och WebKit-telefon. |
| 4 | Spärrat medlemskap eller avslutat uppdrag stoppar nästa skyddade anrop trots redan utfärdad token. | ✓ VERIFIED | Spärr- och avslutsrutterna kräver kundadmin + färskt profilbundet MFA-bevis, ändrar status/giltighet och återkallar berörda sessioner. `protectedRoute()` går genom `withSessionContext()`, som låser och återprövar session, medlemskap, kund och uppdrag innan åtgärden. API- och browserprov visar omedelbart nekande i en redan öppen session. |
| 5 | Behörig granskare kan följa beständiga ändringar med serververifierad aktör, faktiskt uppdrag, tid, källa, objekt och resultat; klienten kan inte välja aktör eller roll. | ✓ VERIFIED | `web/lib/server/events.ts` bygger händelsen från den levande serverkontexten och använder en begränsad detaljlista. `protectedRoute()` kräver en händelse för mutationer och skriver den i samma transaktion. `security_events` är append-only och kundavgränsad. `/api/logg` kräver granskaruppdrag, filtrerar på `current_customer_id()` och loggar CSV-export. Första skyddade ändringen, huvudmannaskapandet, är kopplad till samma kedja. |

**Score:** 5/5 sanningar verifierade.

### Required Artifacts

| Artifact | Förväntat bidrag | Status | Kontroll |
|---|---|---|---|
| `supabase/migrations/20260913100000_phase2_worker_core.sql` | Workerroll, identitet, medlemskap, server-session och kund-RLS | ✓ VERIFIED | Finns, är substantiell och provas av pgTAP. Worker är LOGIN utan BYPASSRLS; klientroller saknar tabellåtkomst. |
| `supabase/migrations/20260913200000_phase2_access_model.sql` | Giltiga uppdrag, inbjudningar, oföränderlig säkerhetslogg och kundkopplade constraints | ✓ VERIFIED | Finns, är substantiell och provas av access-/audit-pgTAP. |
| `web/lib/server/db.ts` | Levande återprövning och transaktionsbunden GUC-kontext | ✓ VERIFIED | Används av samtliga skyddade routes via `withSessionContext()`. |
| `web/lib/server/authz.ts` | Session, epok, funktion, MFA, CSRF och fail-closed mutationsloggning | ✓ VERIFIED | `protectedRoute()` är gemensam ingång för skyddade routes och kräver event vid mutation. |
| `web/lib/server/events.ts` | Serverhärledd, minimerad och transaktionsbunden audit | ✓ VERIFIED | Anropas av skyddade mutationer, utloggning, kontextbyte och nekandeloggning. |
| `web/app/api/inbjudan/losen/route.ts` | Personbunden engångsinlösen och första medlemskap | ✓ VERIFIED | Exakt issuer/subject, MFA, radlås, engångsmarkering och audit i samma transaktion. |
| `web/app/api/context/route.ts` och `web/app/api/session/route.ts` | Valbar arbetskontext med giltighet och epok | ✓ VERIFIED | Servern returnerar endast identitetens uppdrag och bytet låser vald rad innan epoken ökas. |
| `web/app/api/auth/logout/route.ts`, `web/app/context-switch.tsx`, `web/lib/server-client.ts` | Återkallning, cookierensning och fliksäkerhet | ✓ VERIFIED | Kopplade till UI och bevisade i modell- och browserprov. |
| `web/app/api/kund/medlemskap/sparr/route.ts` och `web/app/api/kund/uppdrag/avsluta/route.ts` | Omedelbar spärr/avslut med MFA och audit | ✓ VERIFIED | Kundavgränsade uppdateringar och sessionsåterkallning; främmande ID ger inget informationsläckage. |
| `web/app/api/logg/route.ts` | Kundavgränsad granskarlogg och säker CSV | ✓ VERIFIED | Granskarfunktion krävs, frågan filtrerar på aktuell kund, fält projiceras och exporten auditloggas. |
| `web/app/api/kund/huvudman/route.ts` | Första skyddade beständiga ändringen | ✓ VERIFIED | Kundadmin + MFA, `current_customer_id()` och `organizer_created` i samma transaktion. |
| `work/pilot/verify-access.mjs`, `supabase/tests/phase2_access.test.sql`, `supabase/tests/phase2_audit.test.sql`, `web/e2e/phase2-access.spec.ts` | Negativa och positiva beteendebevis | ✓ VERIFIED | Ingår i den revisions- och fingeravtrycksbundna fasgrinden. |
| `web/scripts/verify-phase2.mjs` och `work/pilot/results/phase2-summary.json` | Fail-closed slutgrind och sanerad evidens | ✓ VERIFIED | PASS kräver alla obligatoriska steg; skip, blockerad körning, gammalt bevis, fel revision/fingeravtryck och obligatoriskt känt fel kan inte bli PASS. |

### Key Link Verification

| Från | Till | Via | Status | Detalj |
|---|---|---|---|---|
| Inbjudnings-CLI | Inlösningsroute | Samma 32-byte base64url-token och SHA-256-hash | ✓ WIRED | Databasen lagrar endast tokenhash; länken visas en gång av leverantörsskriptet. |
| Inlösningsroute | Medlemskap + uppdrag + säkerhetshändelse | Ett databastransaktionsblock och `FOR UPDATE` | ✓ WIRED | Replay och parallell inlösen kan inte skapa ett andra mandat. |
| Skyddad API-route | Levande databasstatus | `protectedRoute()` → `withSessionContext()` | ✓ WIRED | Token/cookie är sessionsnyckel, inte behörighetsbevis; status och giltighet läses på nytt. |
| Kontextbyte | Server-session och andra flikar | Epokökning, svarshuvud och BroadcastChannel | ✓ WIRED | Gammal epok ger `context_changed` utan kunddata; andra flikar låses. |
| Utloggning | Server-session + klient | `revokeSession()`, cookie-expirering och logout-signal | ✓ WIRED | Nästa anrop med tidigare session nekas. |
| Spärr/avslut | Nästa skyddade anrop | Status/giltighet + sessionsåterkallning + levande återprövning | ✓ WIRED | Visat både via direkt API och i öppen browsersession. |
| Beständig mutation | `security_events` | Event skapas av serverkontexten i samma transaktion | ✓ WIRED | Om audit-insert nekas rullas verksamhetsändringen tillbaka. |
| Granskarvy/export | Kundens auditposter | Granskarfunktion + `current_customer_id()` + explicit fältprojektion | ✓ WIRED | Kund B ser inga A-rader; CSV-export ger en egen händelse och formelinjektion neutraliseras. |

## Requirements Coverage

| Krav | Status | Bevis och avgränsning |
|---|---|---|
| IAM-01 | ✓ SATISFIED | Exakt issuer/subject-bunden engångsinbjudan med MFA; organisationsnummer och e-post används inte som rättighetsbevis. Lokal test-IdP verifierar kontraktet, inte en kommunanslutning. |
| IAM-03 | ✓ SATISFIED | Giltiga, kommande och avslutade uppdrag visas separat; valt uppdrag och kund återprövas utan sammanblandning. |
| IAM-04 | ✓ SATISFIED | Server-session återkallas, cookie rensas, och epok/fliksignalering låser och rensar gammal arbetskontext. |
| IAM-05 | ✓ SATISFIED | Spärr och avslut påverkar nästa anrop med tidigare session; administrativa mutationer kräver färskt MFA-bevis. |
| ACL-01 | ✓ SATISFIED | RLS, constraints, stängda klientroller, 39 nekade direkta vägar och API-/exportprov visar kundisolering och likformiga 404-svar för främmande ID. |
| AUDIT-01 | ✓ SATISFIED | Aktör och uppdrag kommer från servern, händelser är append-only och atomiska, och granskaren kan läsa/exportera sin kunds minimerade logg. |

## Evidence Integrity and Freshness

- Full `npm run verify:phase2` gav **PASS** 2026-09-18T06:47:30Z–06:55:31Z mot revision `89055a9`.
- Rapportens källfingeravtryck är `sha256:8c6b99ce53cd78b612b63f548b74affb81b817fe482100f90345e44f98e21c88`; omräkning 2026-09-21 gav exakt samma värde.
- `git diff 89055a9..HEAD -- web supabase work/pilot` med resultatfiler undantagna är tom. Efterföljande commits gäller evidens, planstatus och användarens kontrollpunkt, inte produktkällan.
- Ny riktad körning 2026-09-21: `node --test lib/*.test.mjs scripts/verify-phase2.test.mjs` gav **175 pass, 0 fail**.
- Evidensrapporten innehåller alla obligatoriska steg med PASS, 137 pgTAP-prov, 39 nekade direkta vägar, 14/14 accessfall med 63 kontroller, 26 gröna fas 1-browserprov och 37 gröna protected-browserprov.
- Rapporten innehåller inga markörer för sessionscookie, databas-URL, JWT, OTP-hemlighet, privat nyckel eller Supabase-hemlighet.
- Alla 12 planer har både PLAN- och SUMMARY-fil. Planens evidenscommits `89055a9`, `fef70fc` och `27aedd2` finns i historiken.

Den fulla åttaminutersgrinden kördes inte om eftersom produktkällans fingeravtryck är oförändrat och den befintliga fullrapporten är revisionsbunden. En ny omkörning hade därför inte tillfört bevis utöver de färska modell- och sammanställarproven.

## Anti-Patterns Found

| Område | Resultat | Allvar | Påverkan |
|---|---|---|---|
| Kritiska fas 2-routes och serverbibliotek | Inga TODO/FIXME, tomma mutationshanterare eller målhindrande placeholderflöden hittades. | Ingen | Ingen. |
| `return null` / tom array | Förekommer i avsiktliga parse-, lookup- och frånvarovägar, inte som stubbar. | Info | Ingen målpåverkan. |
| Senare elev- och planeringsfunktioner | UI markerar dem avsiktligt som stängda i denna fas. | Info | Omfattningen ägs av fas 3–5 och blockerar inte kontoåtkomstmålet. |

## Human Verification

Användarens kontrollpunkt är slutförd. Den 2026-09-21 provades uppdragsbyte, inbjudan/spärr, granskarlogg samt presenterade dator- och telefonflöden. Användaren svarade: ”Jag har testat allt och det verkar korrekt.” Detta verifierar tydlighet och användarbeteende i den syntetiska provmiljön och gör inget påstående om fysisk kommunmiljö eller verklig extern IdP.

## Kända avgränsningar

- `lib/save-order.repro.mjs` återkördes 2026-09-21 och gav åter exakt två röda, namngivna scenarier samt `KNOWN-ISSUE`. Felet gäller sparordning/ID-mappning i `persistTimplans` och ägs fortsatt av fas 5. Det har inte räknats som ett passerat prov och blockerar inte fas 2:s kontoåtkomstmål.
- IAM-02 och IAM-06 kräver pilotens faktiska identitetsanslutning och extern kontolivscykel. De ligger kvar i fas 7.
- Browserbeviset omfattar WebKit i telefonstorlek. Det innebär inte att localhost-miljön är nåbar från en fysisk telefon eller att en kommun har godkänt flödet.

## Gaps Summary

Inga luckor blockerar fas 2:s mål. De kvarstående punkterna är uttryckligt ägda av senare faser och har inte använts för att förstora fasens verifieringspåstående.

---

_Verified: 2026-09-21T13:46:42Z_  
_Verifier: Codex (gsd-verifier)_
