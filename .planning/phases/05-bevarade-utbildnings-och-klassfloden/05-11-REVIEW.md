---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "11"
reviewed: 2026-10-01
reviewer: independent-executor-05-09
source_revision: 40efd8d9b6bdf30cde7181f4a0b8d787bd9d231f
status: code_review_gap_found
human_pending: true
code_checks_passed: 5
code_checks_total: 6
blockers:
  - id: malformed_400_error_code_provenance
    goal: 2
    status: open
    reason: Kodlös eller trasig HTTP400 kan tolkas som säkert API-avslag utan omläsning.
scope: klientflöden, navigation, handbok och browserfall som provspecifikation
---

# Oberoende slutgranskning av 05-11

Fem kodkontroller passerar; mål 2 har en kvarstående kontraktslucka. Rättningarna `7ce3e37` och `40efd8d` stänger det tidigare fyndet om kodlösa 502/503-svar i båda sparflödena, men skiljer inte en kodlös eller trasig HTTP400 från ett uttryckligt 400/`bad_request`-avslag från API:t. Detta är en oberoende kodgranskning; granskaren har inte kört databasen, Workern eller browserproven. Färska körbevis samlas av genomföraren och mänsklig användarverifiering är fortsatt öppen.

## Sex verifieringsmål

1. **Fryst underlag och äldre val — PASS i kod.** Utbildnings- och versionsurval använder verkliga server-ID:n och slutna parsers. Ny utbildningsläsning börjar med `catalogId: null`; en bunden version läses med sitt sparade katalog-ID. Programversion, inriktning och katalog jämförs innan redigering. Bundna källors startdatum och grund kan inte ändras i dialogen; replace skickar enbart ordnade fördjupningsreferenser och bunden clone skickar `explicitLegacyBasis: null`. Bindning och obunden clone saknar redigeringsknappar för äldre val. Legacyupplösningen går igenom sparad ordning och stoppar okända, dubbla eller tvetydiga koder utan bortsortering eller ersättning. Exakt startdatum anges aktivt och äldre val kräver uttrycklig bekräftelse.
2. **CAS, omläsning och osäkert sparutfall — GAP i kod.** Kommandona använder serverrevision och utbildningens hela `latestVersion`/`draftId`, inte maxversion från aktuell sida. Ett accepterat svar måste stämma i identitet, grund, ordnade val och revision/version, och följs av auditerad omläsning. En 409 hämtar aktuellt underlag och behåller egna fält; endast kompatibel bind/replace kan skickas på nytt efter uttryckligt val och med aktuell revision. Create/clone skickas inte automatiskt igen. Status/kod-paren 400/`bad_request`, 403/`mfa_required` och 500/`audit_unavailable` avgränsar rättningsbara avslag och kodlös 502/503 går till osäker omläsning. **Kvarstående gap:** transportens reservkod `bad_request` används även för kodlös eller trasig HTTP400, som båda vyerna då tolkar som säkert avslag. Sparknappen kan återaktiveras utan omläsning trots att den verkliga skrivningen kan ha genomförts. Status/kod-paret måste också kräva att felkoden faktiskt kom från API-kroppen. Misslyckad omläsning visar annars endast omläsningsåtgärd; ett aktuellt utkast med samma grund och val beskrivs utan påstående om vem som sparade det.
3. **Sena svar, epoch och sessionsrensning — PASS i kod.** Vyn har generation, mounted-guard och AbortController. Den gemensamma transporten kontrollerar generation och epoch före headers och efter asynkron kroppsläsning. Programplansvyn monteras med nyckeln epoch/assignment och avmonteras vid utloggning, uppdragsbyte eller sessionslås. 401 och mandatrelaterad 403 rensar lista, underlag, plan och formulär. Navigation/logout använder osparatregistret; verklig sessionsförlust rensar utan att behålla gammal kontext. Programplansdata skrivs inte till URL eller webstorage. Modal och beforeunload håller osparade uppgifter skyddade.
4. **MFA och obligatorisk loggning — PASS i kod.** De fyra kommandona går via de befintliga skyddade API-rutterna, vars faktiska mandat, MFA och audit prövas på servern. Klienten använder inget rollval som rättighetsbevis. 403/`mfa_required` bevarar formuläret och visar step-up-rutan i dialogen. Texten förklarar att användaren lämnar sidan och att osparat innehåll inte följer med genom inloggningen. 500/`audit_unavailable` bevarar fälten utan att hävda success. Browserkällan specificerar verkliga DB- och Worker-auditfel, beständig rollback och sessionsbunden historik; denna granskning ersätter inte deras körresultat.
5. **Verkliga sparningar bakom simulerade transportfel — PASS som provspecifikation.** Programplansfall 11 gör två verkliga `route.fetch()`-skrivningar, först följda av abort och sedan av kodlös 502 med textkropp. Varje originalwrite måste få 200 och ett beständigt DB-/Worker-auditpar; provet kräver exakt en write per variant, rätt ny revision, omläst redan-närvarande-status och ingen sparknapp. IM-fallet i timplansfall 10 gör också en verklig accepterad celländring före kodlös 502, kräver rätt auditpar, en write, revision 2 och beständigt cellvärde 12. Det kräver fortsatt IM-vägledning och frånvaro av grundskolans ämnesramstext. Interceptet ändrar endast transportens svar; framgångswrite och omläsning använder Worker/SQL. Provkällornas assertions är meningsfulla men är inte färska körbevis.
6. **Navigation, handbok och stängda beslutsgränser — PASS i kod.** Programplaner ansluts till den skyddade huvudman-/rektorsvyn; API:s mandatgräns består för övriga roller. Ny utbildning och klass-/läsårsflöde har inga öppna åtgärder här, och elevregistrets läsårsväljare visas inte som programplansfilter. Fastställande saknar användaråtgärd och både UI och handbok skiljer sparat utkast från beslut och fullständiga nationella ramar. Källans alternativ visas utan automatiskt val och poäng omvandlas inte till undervisningstid. Handboken beskriver explicit katalog/start, äldre ordning, ändring/clone, osparatskydd, konflikt, MFA och osäker omläsning utan privata provuppgifter eller tekniska API-instruktioner.

## Källor och tidigare fynd

Huvudkällor: `web/app/protected-programplan-workspace.tsx`, `web/lib/protected-programplan.ts`, `web/app/protected-home.tsx` (ProtectedNavigation/ProtectedShell), `web/lib/server-client.ts`, `web/lib/unsaved-changes.tsx`, `web/app/mfa-step-up.tsx`, `web/app/protected-timplan-workspace.tsx`, `web/e2e/phase5-programplan.spec.ts`, `web/e2e/phase5-timplan.spec.ts` samt `docs/handbok/programplaner.md`. Tidigare lästa slutna kontrakt och serverrutter används för att kontrollera kopplingen till de faktiska kommandona. Inga nya produkt- eller testfiler har ändrats av granskaren.

Tidigare fynd: `ApiError.code === 'bad_request'` behandlades som säkert avslag oavsett HTTP-status. Transportens fallback använder samma kod för kodlösa HTTP-fel, vilket kunde aktivera sparknappen efter en redan genomförd write utan obligatorisk omläsning. Status/kod-paren i `7ce3e37` och `40efd8d` stänger 502/503-vägen, och provfallen specificerar en verklig accepterad write före kodlös 502. Den snävare rättningen är godkänd på kodnivå; runtimebevis krävs från aktuellt bygge.

**Öppet följdfynd, kodlös400:** `server-client.ts` saknar markering av om felkoden kom från en avkodad objektkropp eller från klientens reservkod. Kodlös, feltypad eller icke-JSON HTTP400 kan därför fortfarande återgå till redigerbart sparläge. Genomföraren arbetar med en markering för uttrycklig API-kod och krav på denna markering tillsammans med status/kod-paren i båda vyerna. Förväntad verifiering är rena transportprov för uttrycklig respektive saknad/feltypad/trasig kod samt accepterad riktig write följd av kodlös400 i programplan och IM: obligatorisk audit, en write, aktuell omläsning och beständiga värden. Även riktiga 400/`bad_request`-inmatningsfel ska fortsatt ge ett redigerbart formulär. Ingen väntad rättning eller provkälla räknas som genomförd innan aktuell commit har granskats.

## Avgränsning och mänsklig verifiering

Granskningen godkänner inte ADMIN-02 eller hela fas 5. Den sjunde sanningen i planens must_haves, färska dator-/telefonbevis och ett synligt beständigt användarprovsunderlag, kräver genomförarens aktuella rapporter: source/build-match, full fallmatris, audit/dataasserts, cleanup, granskade bilder, dokumentationsbygge och rootens verifiering av de fyra beständiga exemplen på 3012. Dessa rapporter har inte ersatts med provkällor eller äldre PASS-status i denna granskning.

Mänsklig bedömning återstår enligt `05-PROGRAMPLAN-USER-TRIAL.md`: rektor/huvudman hittar utbildning/version, förstår fryst grund och olösta val, anger känt startdatum, skapar/binder/ändrar/klonar utkast och bedömer dialoger, fel/MFA och telefonupplevelse. Samma prov bedömer den nya timplanshandledningen för grundskola och introduktionsprogram. Browseremulering bevisar inte begriplighet eller godkänd verklig IdP-/kommunanslutning. Fastställande, full nationell regelkontroll och fasens återstående krav hålls öppna.
