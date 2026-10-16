---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-15B
type: execute
wave: 8
depends_on: ["TJANST-15"]
files_modified: ["supabase/migrations/20261017120000_tjanst_transfer.sql", "work/pilot/verify-tjanst-transfer.mjs"]
autonomous: true
status: planned
local_acceptance: [TJ1-08, TJ1-09]
must_haves:
  truths: ["Årsöverföring, flytt och massregistrering ger en hel transaktion eller noll ändring.", "Två samtidiga skolor/operationer kan inte använda samma sista anställningskapacitet.", "Gamla beslut och lärares initiativ bevaras; nya planer är utkast."]
  artifacts: ["supabase/migrations/20261017120000_tjanst_transfer.sql", "work/pilot/verify-tjanst-transfer.mjs"]
  key_links: ["15:s fasta vektorer → installerad SQL → identiska previewresultat", "Global anställnings-/planlåsordning → samtidiga sessioner → en vinnare utan dubbelreservation"]
---

<objective>
Implementera och verifiera atomiska års-/massoperationer i en separat, stängd databasgrund. UI/API kommer efter verkligt isolerat bevis.
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

@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-15-SUMMARY.md
</context>

<tasks>
<task type="auto">
<name>1. Implementera atomisk lagring med stängda överföringsfunktioner</name>
<files>supabase/migrations/20261017120000_tjanst_transfer.sql</files>
<action>Kontrollera migrationsnamnet mot aktuell journal före skapande; ändra inga installerade historiska filer. Implementera15:s exakta kontrakt i tjanst_transfer_read/command/status(jsonb) och privata hjälpare, alla utan Workergrants tills15C. Återanvänd kärnans privilegiegräns, låsta session/mandat, globala employment/periodlås, planlåsordning, CAS, audit och idempotens. Previewhash/källrevisioner kontrolleras under mutationens lås. Flytt, nyttårsutkast, källrelationer och reservationer skrivs i samma transaktion; fel på en rad eller audit ger total rollback. Delvis samläsning får korrekt nya relationer, inte dubblerad aktivitet. Gamla fastställda planer och ursprungliga personramar bevaras. Status kräver aktuell rätt, commandId/requestHash/operation/targetRef och samma aktörsbindning utan originalpayload; replay av mutationen kräver däremot identiskt payload. Det finns inga direkta tabellgrants; privata hjälpare hålls stängda. Verifiera senaste installerade definitioner före ändring och håll årsöverföringen skild från befintlig programplans-/klasskopiering.</action>
<verify>Granska migrationsdiffen mot15:s handoff: exakt tre planerade externa signaturer, inga öppna grants och inga historiska funktions-/tabelländringar utanför allowlist. Syntax/rollback och faktisk kontraktsparitet prövas i uppgift2 före planens avslut.</verify>
<done>En additiv migration implementerar hela operationens atomik, med bevarad beslutshistorik och återanvänd global kapacitetskontroll.</done>
</task>

<task type="auto">
<name>2. Verifiera installerad SQL, bevarande och verklig konkurrens</name>
<files>work/pilot/verify-tjanst-transfer.mjs</files>
<action>Bygg runner med09:s målskydd och isolerad schema-only-kopia med syntetiska förhandsrader. Kör rollback och installerat; jämför hela originalrader inklusive tidsstämplar, ACL, beslut, kvitton och auditankare samt explicit tillåten differens för de nya objekten. Pröva alla15:s TSvektorer mot installeradSQL. Kör separata verkliga anslutningar för överföring/överföring, flytt/vanlig planändring, två skolor som tar sista kapacitet, källändring och mandatåterkallelse i vänteläge. Injicera fel mitt i batch och i audit: noll delsparade rader/reservationer. Testa samma commandId med annat innehåll samt återspelning av annan aktör. Skilj redigerbart utkast med kompletteringsbehov från en operation som inte kan genomföras. Städa bara egna fixturer/processer; inga aktiva data/identiteter kopieras.</action>
<verify>Från projektroten: node work/pilot/verify-tjanst-transfer.mjs --mode sql --out /private/tmp/tjanst-transfer-sql.json. Bevisa faktiskt låsöverlapp/vinnare, förlorarens konflikt/exakta replay, full före/efterparitet, referensvektorer och att de tre nya signaturerna ännu saknar Workergrants. Ingen aktiv DBskrivning/reset/IdPomstart tillåts. Rapportera första fel och egen cleanup.</verify>
<done>Verklig installeradSQL visar atomik, mandat, bevarande och global kapacitet för alla tre operationer, även under konkurrens.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
Följ kontraktets reservationslivscykel: max(gällande publicerad budget, godkänd aktiv utkastreservation) per skolbeslut/anställningssegment, historik belastar inte. Prova100→utkast100=100,100→utkast80=100 fram till confirm,100→120=120 endast med tillgängligt20, avbryt120→100 och konkurrerande annan skola före/efter fastställd minskning. Fastställande/flytt uppdaterar hela reservationen atomärt. Prova dessutom dimensionerna separat: total1000/reglerad800→total1000/reglerad900 måste reservera ytterligare100 reglerade minuter; PU-minimum kontrolleras utan additiv dubbelräkning.
TJ1-08/09, TJANST-06. SS12000:2024/OpenAPI2.1.0: Person/Organisation/Duty/Activity/Groupkällor och giltighet bevaras; inga nya falska externa ID:n eller medlemskap. Migrationen är prövad på syntetiska förhandsrader, inte installerad på aktiva användardata.15C öppnar exakt tre APIgrants först med skyddad adapter.
</verification>

<success_criteria>
- SQL/TSparitet och full transaktionsrollback har faktisk verifiering.
- Bevisat låsöverlapp ger ingen dubbel kapacitet eller delvis batch.
- Tre externa signaturer och privata hjälpare är fortsatt stängda förWorker.
</success_criteria>

<output>
Skriv05-TJANST-15B-SUMMARY.md med migrationshashar, före/efterfingeravtryck, faktiska samtidighetsbevis och stängda signaturer. Samordnaren hanterar commit/push.
</output>
