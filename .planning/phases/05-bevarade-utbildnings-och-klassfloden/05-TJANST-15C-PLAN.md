---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-15C
type: execute
wave: 9
depends_on: ["TJANST-15B"]
files_modified: ["web/lib/server/tjanst-transfer.ts", "web/app/api/tjanst/overforing/lasa/route.ts", "web/app/api/tjanst/overforing/kommando/route.ts", "web/app/api/tjanst/overforing/status/route.ts", "supabase/migrations/20261017121000_tjanst_transfer_worker_access.sql", "work/pilot/verify-tjanst-transfer.mjs"]
autonomous: true
status: superseded
superseded_on: 2026-10-19
superseded_by: "Fas 05.1 (tjänstefördelning) eller repot tjanstebedomning (tjänstebedömning); se ../05.1-tjanstefordelning/05.1-SPLIT-DECISION.md"
local_acceptance: [TJ1-08, TJ1-09]
must_haves:
  truths: ["Års-/massoperationerna kan nås via verklig skyddadAPI och ger samma atomiska resultat somSQL.", "Fel roll, person, skola, period och inaktuellt underlag nekas även via direktHTTP.", "Ett förlorat svar återhämtas genom samma kommandos status utan ny batch."]
  artifacts: ["web/lib/server/tjanst-transfer.ts", "web/app/api/tjanst/overforing/lasa/route.ts", "web/app/api/tjanst/overforing/kommando/route.ts", "web/app/api/tjanst/overforing/status/route.ts", "supabase/migrations/20261017121000_tjanst_transfer_worker_access.sql", "work/pilot/verify-tjanst-transfer.mjs"]
  key_links: ["POST overforing/{lasa,kommando,status} → låst serverkontext → exakt tre transferRPC", "VerkligOIDC/Worker → installeradSQL → status/omläsning med beständigt resultat"]
---

<objective>
Öppna års-/massoperationernas tre skyddadeAPIvägar och verifiera verkliga svar innanUI15A. Detta är en separat säkerhetsändring efter15B:s stängdaSQLgrund.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-05-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-09-SUMMARY.md
@web/lib/tjanst-plan.ts
@web/lib/tjanst-personal.ts
@web/lib/server/class-cohort.ts
@work/pilot/verify-target.mjs

@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-15B-SUMMARY.md
</context>

<tasks>
<task type="auto">
<name>1. Bygg tre skyddade överföringsvägar och exakt Workeråtkomst</name>
<files>web/lib/server/tjanst-transfer.ts; web/app/api/tjanst/overforing/lasa/route.ts; web/app/api/tjanst/overforing/kommando/route.ts; web/app/api/tjanst/overforing/status/route.ts; supabase/migrations/20261017121000_tjanst_transfer_worker_access.sql</files>
<action>Bygg tre POSTvägar för preview/läsning, kommando och status genom befintlig skyddad adapter. Strikta indata-/utdataparsers, CSRF/origin/MFA där mutationen kräver det, aktuell session/mandat, storleksgräns och cacheförbud följer09. Rektor och tillåten beredare får bara kontraktets egna skoloperationer; huvudmannen får inget fördelnings-/fastställandemandat genom denna route. Överför inte klientvalt actor/person/scope som behörighetsbevis. Lägg en separat additiv migrationsfil med exakt EXECUTE på tjanst_transfer_read/command/status(jsonb), inga tabell-/hjälpargrants. Kontrollera filnamnet mot aktuell journal. Behåll09:s allowlist och tidigare rättigheter. APIparsers delar15:s kontrakt och beslutar inte om kopieringsregler vid sidan omSQL.</action>
<verify>Från web/: npx tsc --noEmit och npx oxlint app lib. Granska nya routes, sessions-/MFA-/CSRFgränser och migrationsbytes: exakt tre ytterligare grants. Faktisk HTTP och allowlistparitet prövas i uppgift2 före avslut.</verify>
<done>Den skyddade APIvägen finns med minsta privilegier och samma överföringskontrakt somSQL.</done>
</task>

<task type="auto">
<name>2. Verifiera verklig Worker/OIDC mot installerad överföringsgrund</name>
<files>work/pilot/verify-tjanst-transfer.mjs</files>
<action>Utöka15B:s runner till verklig kandidats Worker/OIDC och samma privata SQLfixturer. Prova preview→commit→status→läsom för nyttår,flytt,massregistrering. Kör roll-/mandatmatris, manipulerade källor/personer, CSRF, MFA, strikt parser, källändring mellanpreview/commit, storleksgränser, auditfel och tappat svar eftercommit. Verifiera exakt09:s allowlist plus de tre nya signaturerna, privata hjälpare fortfarande stängda och inga direkta tabellgrants. Serverstatus återvaliderar rättigheter efter återkallelse. Runnern äger egna syntetiska identiteter/processer och sparar endast privata rapporter, aldrig råa tokens/persontexter iGit. Bevara första fel och full cleanup.</action>
<verify>Från projektroten: node work/pilot/verify-tjanst-transfer.mjs --mode actual --build-root /private/tmp/tjanst-transfer-candidate --out /private/tmp/tjanst-transfer-actual.json. Explicit avskilt mål krävs;3012/aktivDB nekas. Faktisk HTTP omfattar fel roll/kund/skola/person, tomma/stora/extra fält, stalepreview, MFA, återkallat mandat införstatus, svar förlorat eftercommit och exakt replay. Kandidatbygge/manifest dokumenteras.17 kör därefter samma samlade slutkandidat inklusiveUI.</verify>
<done>Verklig skyddad API/SQLkedja visar korrekt bevarande, behörighet, atomik och återhämtning föreUI15A.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
TJ1-08/09, TJANST-06. SS12000:2024/OpenAPI2.1.0: stabila objekt-/källreferenser bevaras iAPIparsning; inget faktiskt standardutbyte görs. Endast isolerade syntetiska data används. De tre extra funktionerna redovisas separat från09:s femton kärnfunktioner.
</verification>

<success_criteria>
- VerkligAPI kan genomföra alla tre massoperationer och återläsa resultatet.
- Exakt tre nya grants och full rättighetsmatris är verifierade.
- Första fel, bevarande och cleanup är dokumenterade utan känsliga data.
</success_criteria>

<output>
Skriv05-TJANST-15C-SUMMARY.md med verkligaHTTPbevis, grantdifferens, source/buildmanifest och underlag för15A/17. Samordnaren hanterar commit/push.
</output>
