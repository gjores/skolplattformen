# Phase 1: Baslinje och avskild pilotmiljö - Context

**Gathered:** 2026-09-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Fasen ger projektansvarig en versionshanterad och återställbar baslinje av befintlig app, dokumenterade regressionsprov, en avskild miljö för syntetiska prov och en daterad profil för pilotens förutsättningar. Omfattningen är BASE-01, BASE-02 och PILOT-01 i den godkända färdplanen.

Diskussionen gäller den första fristående provmiljön. Verifierad kontoåtkomst, fullständiga skolmandat, beständigt elevregister och faktisk kommunanslutning genomförs i senare faser. Fas 1 ska förbereda dessa inom en tydlig skyddsgräns.

</domain>

<decisions>
## Implementation Decisions

### Pilotens upplägg — användarens val i denna diskussion

- **D-01:** Ingen pilotpartner är vald. Börja med en fristående provmiljö; ange framtida skola, huvudman eller kommun som öppet beroende.
- **D-02:** Provmiljön ska spegla både grundskola och gymnasium, med en egen exempelskola för respektive skolform.
- **D-03:** Provmaterialet ska vara överskådligt: några klasser per skola, med tydliga exempel på elever, utbildningar och timplaner. Inget exakt elevantal är beslutat. Exempelstorleken är varken verklig pilotvolym eller appens framtida kapacitetsgräns.
- **D-04:** Användaren ska själv kunna prova på dator och telefon i första steget. Inga andra testpersoner är planerade nu.
- **D-05:** Användaren valde att avsluta diskussionen och sammanställa besluten efter genomgången av pilotens upplägg. Områdena fortsatt provning och granskning av baslinjen fick ingen separat fördjupning; nedanstående redan beslutade krav gäller även där.

### Redan beslutade ramar — från projektet och den godkända färdplanen

- **D-06:** Provmiljön använder syntetiska uppgifter. Aktuella kund-, register-, identitets- och driftbeslut får inte ersättas med påhittade integrationsbesked.
- **D-07:** Bevara gymnasiets skapande av utbildningar, tillägg av kurser/nivåer, fristående kopior till nästa elevkull och explicita klasskopplingar till fastställda timplansversioner. Kopiering till ny kull flyttar inte befintliga elever. Grundskolans motsvarande tillämpliga arbetsflöden ska också kunna prövas.
- **D-08:** Baslinjen ska omfatta granskade appkällor och databasdefinitioner och kunna återställas. Befintligt användarskapat material ska bevaras; förekomst av data i ett anslutet projekt är inte tillstånd att återställa eller tömma det.
- **D-09:** Avskiljningen omfattar klientens startväg, databasanslutning, installerad demoetablering och automatisk exempeldata. Demoåtkomst ska inte ge rättigheter till pilotens skyddade datavägar. Det fullständiga identitets- och mandatflödet hör till fas 2–3.
- **D-10:** Pilotprofilen ska vara daterad och skilja bekräftade val, syntetiska exempel, förslag och öppna beroenden. Organisation, elevfält, originalkälla, skrivansvar och verklig volym ska framgå även när ett värde ännu inte är bestämt.

### Codex discretion

Rutintekniska val hanteras av researcher och planner enligt projektets arbetssätt. De är inte särskilt låsta användarval från denna diskussion.

- Bestäm exakt antal syntetiska elever och klasser inom ett överskådligt exempel, samt fiktiva namn och stabila exempel-ID:n. Utgå från en syntetisk huvudman med de två exempelskolorna; ytterligare isolerade fixturer för åtkomstprov kan finnas utanför användarens vanliga provvy.
- Föreslå minsta användbara uppsättning elev- och placeringsfält för provmaterialet. Märk dem som föreslaget underlag för senare registerarbete; en framtida kommuns fält och skrivansvar är öppna.
- Välj hur utvecklings-/demoläge och den avskilda provmiljön görs tydliga och reproducerbara. Återanvänd befintlig responsiv webb och telefonförhandsvisning där det fungerar; ingen ny distributionsplattform eller extern publicering är beslutad.
- Välj testverktyg, fixturhantering, baslinjemärkning och dokumentstruktur. Baslinjerapporten ska visa prövat arbetsflöde, miljö/version, resultat och kvarstående fel med användbara hänvisningar.
- Ta ställning till kodkartans sparnings- och transaktionsrisker i fasplaneringen. Dokumentera och reproducera relevanta fel i avskild miljö; gör inte ett känt fel till godkänd funktion genom enbart bevarandetest. En större rättning ska ha uttryckligt ägarskap inom godkänd fas eller dokumenterad senare hantering.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.** Sökvägarna är relativa projektroten.

### Godkänd omfattning och arbetssätt
- `AGENTS.md` — bevarande, ansvarsfördelning, avgränsade ändringar och säker hantering av databasskript.
- `.planning/PROJECT.md` — produktvision, godkända beslut, uppskattade flöden och öppna pilotberoenden.
- `.planning/REQUIREMENTS.md` § Baslinje och pilotens kontrakt — BASE-01, BASE-02 och PILOT-01 samt milstolpens acceptansgränser.
- `.planning/ROADMAP.md` § Phase 1 och Genomförande och verifiering — mål, tre framgångskriterier och ansvarsfördelning mot senare faser.

### Aktuell implementation och verifiering
- `.planning/codebase/ARCHITECTURE.md` § Data Flow och State Management — laddning, seedning, lagring och sessionsdata.
- `.planning/codebase/STACK.md` § Runtime och Platform Requirements — paketrot, verktyg och körvägar.
- `.planning/codebase/INTEGRATIONS.md` § Authentication & Identity och CI/CD & Deployment — demoidentitet och vad lokala inställningar faktiskt visar.
- `.planning/codebase/TESTING.md` — 85 passerade modelltester 2026-09-11, körkommandon och luckor i databas-/webbläsarprov.
- `.planning/codebase/CONCERNS.md` § Tech Debt, Known Bugs och Security Considerations — Git-baslinje, seedning, konkurrerande sparning och skyddsgränser.

### Befintliga användarflöden och källgränser
- `docs/elevkullar-och-klasskopplingar.md` — grundskoleexempel, kullkopiering och klass–timplanskopplingar; tidigare testresultat är historik.
- `docs/skolimport-och-rektor.md` — registeruppslag, lokal rektorsutnämning och rektorns läraruppdrag; beskriver också återstående databasbegränsningar.
- `.planning/research/PITFALLS.md` — avgränsningar för identitet, integration, informationshantering och tolkning av äldre produktförslag. Använd inte dokumentförslag som bevis på faktisk kommunanslutning eller lagkrav.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `web/lib/*.test.mjs` — åtta lokala modelltestfiler med 85 passerade tester vid kodkartläggningen; återanvänd verksamhetsfallen för baslinjen.
- `web/lib/organisation-model.ts`, `web/lib/timplan-model.ts`, `web/lib/lasar-model.ts` och `web/lib/admin-model.ts` — befintliga modellfabriker och exempel för organisation, planer, läsår, elever, grupper och schema.
- `web/lib/cohort-model.ts` och `web/lib/cohort-model.test.mjs` — oberoende kullkopior och uttryckliga klasskopplingar.
- `web/scripts/phone-preview.mjs` och `web/package.json` — lokal telefonförhandsvisning av byggd app. Nuvarande proxy släpper igenom GET/HEAD; senare serverbaserade skriv- och inloggningsflöden måste prövas mot den begränsningen.
- `web/app/page.tsx`, `web/app/organisation-workspace.tsx` och `web/app/globals.css` — responsivt gränssnitt, demomärkning och väljare för grundskoleexempel.

### Established Patterns
- Modeller i `web/lib/*-model.ts` skiljer verksamhetsregler från Supabase-anrop i `*-store.ts`; testning kan börja med de rena modellerna.
- Organisation, utbildningar, timplaner, läsår och klasskopplingar har beständiga datavägar. `AdminState` för elever, studieplaner, grupper och schema ligger i sidans minne.
- Grundskoleexemplet stänger av backend i `web/app/organisation-workspace.tsx`. Detta exempel kan återanvändas som underlag, men visar inte beständig grundskolelagring.
- `hasBackend` bygger på att konfiguration finns. Dagens demoinloggning och seedning anropas i vanliga laddningsvägar. Vald exempelroll i UI byter inte autentiserad databasroll.
- Appkällorna i `web/`, `supabase/` och `work/` är ännu ospårade av Git. Planeringsdokument och kodkarta är versionshanterade.

### Integration Points
- `web/lib/supabase.ts` — klientinstans, session, `hasBackend` och `signInDemo`.
- `web/lib/organisation-store.ts` — `loadOrganisation` och automatisk seedning med bred felstädning; undvik att använda laddningen som ett ofarligt läsanrop mot befintliga data.
- `web/lib/planning-store.ts` — `loadTimplans` och `loadSchoolYears` använder demoinloggning och kan skapa exempeldata.
- `supabase/migrations/20260905130000_demo_bootstrap.sql` — installerbar databasfunktion som ger nya besökare demohuvudmannaprofil. Planera hur avskild miljö verifierar att denna väg inte ger skyddad åtkomst.
- `supabase/config.toml`, `web/vite.config.ts`, `.gitignore` och `web/.gitignore` — miljödefinitioner, bygge och gränser för vad som får ingå i baslinjen.
- `work/supabase/verify.mjs`, `work/supabase/verify-cohorts.mjs` och `work/supabase/verify-school-import.mjs` — möjliga baslinjeprov efter avgränsning till rätt testmiljö. De skriver till konfigurerad databas. `work/supabase/reset.mjs` raderar demodata och ingår inte som rutinmässigt baslinjesteg.

</code_context>

<specifics>
## Specific Ideas

Användaren vill ha ”egna exempelskolor för båda”, ”några klasser per skola med tydliga exempel på elever, utbildningar och timplaner” och kunna prova ”själv, på dator och telefon”.

Provmaterialets tydlighet styr storleken. Bevara fungerande gymnasieflöden och gör grundskolans motsvarande exempel lätta att komma åt.

</specifics>

<deferred>
## Deferred Ideas

Inga nya funktioner tillkom i diskussionen. Följande kvarstår inom den redan godkända milstolpens senare arbete:

- Verklig pilotpartner, IdP, kontokälla och elevregisterleverantör är ännu inte valda. Fas 1 dokumenterar beroendena; faktisk anslutning godkänns i fas 7.
- Verkliga elevuppgifter och pilotdrift följer kundens senare beslut och fas 8:s villkor.
- Andra testpersoner och publik tillgång ingår inte i det valda första provupplägget.
- Slutlig pilotvolym, elevfält och källornas skrivansvar fastställs när en partner och ett verkligt flöde är valt. Syntetiska antaganden får inte presenteras som kundöverenskommelser.
- Fortsatt provning och granskning av baslinjen valdes inte för separat fördjupning. Deras redan godkända krav i BASE-01 och BASE-02 kvarstår.

</deferred>

---

*Phase: 01-baslinje-och-avskild-pilotmilj*
*Context gathered: 2026-09-11*
