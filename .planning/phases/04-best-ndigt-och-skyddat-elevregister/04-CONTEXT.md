# Phase 4: Beständigt och skyddat elevregister - Context

**Gathered:** 2026-09-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Behörig administratör kan administrera en elev i den skyddade miljön från sökning till sparad ändring och omläsning, med stabilt internt elev-ID, daterad skolplacering och klasstillhörighet med historik, ursprung per uppgift, begriplig versionskonflikt, skyddade personuppgifter och kontrollerad export. Registret ersätter fas 3:s syntetiska elevprov som elevdatakälla i den skyddade miljön. Krav: STU-01–STU-06, DATA-01, DATA-02.

Fasen innehåller också en avgränsad del av läsårslinsen (vikt todo, se nedan) och det dataunderlag som senare fakturering till hemkommuner behöver — inte faktureringen själv. Endast syntetiska uppgifter; ingen verklig registerkälla ansluts (fas 7). Exempelläget från fas 1 förblir utan backend.

</domain>

<decisions>
## Implementation Decisions

### Elevens uppgifter och skyddad identitet
- **D-01:** Basuppgifterna är **minimala**: namn, personnummer (syntetiskt) och därur födelsedatum, hemkommun, skolplacering, klass, utbildning och status. Inga kontaktuppgifter, adresser eller vårdnadshavare i fas 4.
- **D-02:** Personnummer lagras. Administratör ser födelsedatum i listor och **hela numret endast i elevkortet på uttrycklig begäran**; varje sådan visning loggas som egen händelse. Lärare och övriga utan administrativt mandat ser aldrig personnummer eller födelsedatum. — **Reversibility:** costly — rationale: fältbehörighet per funktion påverkar SQL-policy, API-projektion, export och loggtyper.
- **D-03:** Elev med **skyddade personuppgifter**: namn och personnummer visas endast för administratör med uttrycklig behörighet på elevens placeringsskola. Övriga med mandat (t.ex. lärare i gruppen) ser ett anonymt visningsnamn; eleven förekommer inte i sökträffar för den som inte får se uppgifterna. Skyddad elev ingår inte i export utan uttryckligt val av den som får se uppgifterna. Varje visning av skyddad uppgift loggas. Fel, aviseringar, räknare och metadata får inte röja att en skyddad elev finns (DATA-01).

### Placering, klasshistorik och läsår
- **D-04:** Eleven har **exakt en aktiv skolplacering per datum** (skola + utbildning + startdatum, valfritt slutdatum). Framtida placeringar kan läggas in i förväg; avslutade bevaras som historik. Skolbyte = avsluta den ena och starta en ny. — **Reversibility:** costly — rationale: placeringsmodellen är grund för behörighetsomfattning, läsårslista och framtida fakturering.
- **D-05:** **Klassbyte** skapar en ny daterad klasstillhörighet; den föregående får slutdatum och historiken bevaras. Utbildningen byts inte automatiskt. Hör nya klassen till en annan utbildning visas en varning, och utbildningsbyte kräver ett separat, uttryckligt beslut (STU-03).
- **D-06:** **Hemkommun** lagras som daterad uppgift (kommunkod, giltighetsperiod, ursprung). Flytt mitt i läsåret ger en ny period. Tillsammans med placeringsperioderna är detta underlaget för framtida fakturering.
- **D-07:** **Läsårsväljare i sidhuvudet** (`‹ 26/27 ›`) för den skyddade miljön som styr elevlistan: vilka elever som är placerade det valda läsåret. Årskurs härleds ur utbildningens startår (`åk = läsår − startår + 1`); utbildningar får startår som heltal. Läsårsstatus/lås, Aktuella/Framtida/Arkiverade-flikar och terminskolumner i timplanen ingår **inte** i fas 4.

### Källa, rättelse och konflikter
- **D-08:** I piloten **äger appen** elevuppgifterna. Varje fält bär ursprung (i fas 4 "manuell i appen", med aktör och tid). Modellen har plats för en extern källa per fält (SS 12000, SPAR) så att fas 7 kan göra fält registerägda utan omarbetning. — **Reversibility:** costly — rationale: källmärkning per fält är ett datakontrakt som import, historik och konfliktregel bygger på.
- **D-09:** När en extern källa senare levererar ett annat värde än en **lokal rättelse** skrivs rättelsen aldrig tyst över. Eleven får en synlig avvikelse där administratören väljer mellan lokal rättelse och källans värde. Regeln byggs i fas 4 och prövas med en simulerad källa (STU-04).
- **D-10:** **Samtidig ändring**: sparningen nekas med besked om vem som ändrade och när; administratören ser sitt och det nyare värdet per ändrat fält och väljer vad som ska gälla. Inget skrivs över tyst (STU-06).
- **D-11:** **Historik** per elev och fält i elevkortet för administratör: vad, från/till, vem, när, källa. Skyddade uppgifter visas i historiken endast för den som får se dem. Säkerhetsloggen får motsvarande händelser **utan** värden.

### Sökning, urval och export
- **D-12:** Elevlistan styrs av valt läsår och skola, med sökfält (namn; för administratör även födelsedatum/personnummer) och filter på klass, utbildning, årskurs och status. **Servern** avgör vilka elever som förekommer utifrån mandatet; ingen större lista filtreras i webbläsaren.
- **D-13:** Namnlika elever skiljs åt med **födelsedatum + klass + skola** i träffar. Lärare, som inte ser födelsedatum, ser klass.
- **D-14:** **Urvalet i adressen**: läsår, skola och filter ligger i sidans adress så att bakåtknappen och omladdning ger samma lista; rensas vid byte av uppdrag. *Precisering från orkestratorn:* fritextsökordet (som kan vara ett namn eller personnummer) läggs **inte** i adressen — adresser hamnar i webbläsarhistorik och åtkomstloggar. Sökordet hålls i flikens sessionstillstånd och rensas vid kontextbyte/utloggning.
- **D-15:** **Export**: administratören väljer fält ur de mandatet tillåter. Personnummer kräver uttryckligt val och loggas som egen typ. Skyddade elever utelämnas om de inte uttryckligen väljs av den som får se dem. Servern prövar mandat, spärrar, skydd och fält även vid direktanrop, och exporten loggas (DATA-02).

### Fakturering till hemkommuner
- **D-16:** Användaren vill ha fakturering till hemkommuner. Den är en **ny förmåga utanför fas 4**; fas 4 levererar bara underlaget (D-04, D-06). Fakturering blir egen todo/fas.

### Beslut efter research (användaren 2026-09-28)
- **D-17:** **Huvudmannen** ger administratörens uttryckliga behörighet att se elever med skyddade personuppgifter, per skola. Rektor kan inte ge den. Tilldelning och återkallelse loggas som behörighetsändring. — **Reversibility:** costly — rationale: behörigheten ingår i mandatmodellen (`phase3_mandate_shape`) och i projektionsfunktionen.
- **D-18:** **Läsåret** gäller 1 juli–30 juni (`[Y-07-01, Y+1-07-01)`). Elevlistan visar elever med placering som överlappar valt läsår. Status räknas mot dagens datum om det ligger i valt läsår, annars mot läsårets startdatum.
- **D-19:** En administratör **utan** skyddsbehörighet ser en skyddad elev vid sin skola som **anonymt visningsnamn utan åtgärder**: inget födelsedatum, personnummer eller hemkommun, ingen ändring eller export — samma projektion som för lärare. Preciserar D-03 för administratörer.
- **D-20:** Administratören får **ändra** en elev endast om eleven har en pågående eller framtida placering vid någon av administratörens skolor. Elever med bara avslutade placeringar där kan läsas med historik men inte ändras.

### Redan beslutade ramar (från tidigare faser)
- Mandaten från fas 3 styr all elevåtkomst: lärare egna undervisnings-/mentorsgrupper, skoladministratör tilldelade skolor, huvudman ingen elevinsyn utan separat uppdrag, elevhälsa skola/elev/ärende enligt uppdrag, tidsbegränsad support en elev eller grupper på en skola i högst 60 min, IT ingen elevinsyn.
- Loggpolicyn från fas 3: läsning, ändring, export, behörighetsändring och nekande loggas med aktör, faktiskt uppdrag, tid, objekt och resultat, **innan** svaret lämnas; loggfel ger inget innehåll och ingen ändring. Loggen innehåller inga elevuppgifter eller anteckningar.
- Engångskod vid inloggning för konton med registrerad kod (2026-09-27); administrativa ändringar kräver giltigt bevis (8 h).
- Endast syntetiska uppgifter; medicinska elevhälsojournaler ingår inte; ingen verklig kommun- eller registeranslutning.
- Docusaurus-handboken innehåller endast användarinstruktioner och regler (beslut 2026-09-23); tekniska kontrakt i `docs/pilot/`.

### Claude's Discretion
- Tabell-/vymodell för elev, placering, klasstillhörighet, hemkommunsperiod och fältursprung; hur fas 3:s `mandate_pupils`/syntetiska elevprov migreras eller ersätts utan att bryta verifierade fas 3-bevis.
- Versionsmekanism för konflikter (radversion, per-fält-version) och exakt konfliktvy.
- Maskeringsformat för födelsedatum/personnummer i listor; syntetiska personnummer ska följa Skatteverkets testpersonnummer eller tydligt fiktivt format.
- Sidindelning och prestanda för elevlistan.
- Hur den simulerade externa källan för D-09 byggs (fixtur/skript), så länge den tydligt är syntetisk.
- Klasser räcker som grupp för lärarmandat i fas 4 (inga separata undervisningsgrupper).
- Kommunlistan hämtas från SCB:s öppna kommunkoder.
- Syntetiska personnummer i ett tydligt fiktivt format med korrekt kontrollsiffra; servern kontrollerar mot en tillåten lista.

### Folded Todos
- **Läsårslins: ställa sig i ett läsår som i Plan Digital** (`.planning/todos/pending/2026-09-12-l-s-rslins-st-lla-sig-i-ett-l-s-r-som-i-plan-digital.md`) — vikt i avgränsad form enligt D-07: läsårsväljare, startår som heltal och härledd årskurs för elevlistan. Resterande steg i todon (läsårsstatus/lås, flikar, terminskolumner, automatisk klass→timplan-koppling, tjänsterader) ligger kvar i todon.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Krav och ramar
- `.planning/REQUIREMENTS.md` — STU-01–STU-06, DATA-01, DATA-02 (ordagrann lydelse).
- `.planning/ROADMAP.md` — Phase 4, framgångskriterier 1–5.
- `.planning/PROJECT.md` — kärnvärde och avgränsningar.

### Behörighet, logg och säkerhet (fas 3)
- `.planning/phases/03-mandat-och-skyddade-datavagar/03-CONTEXT.md` — mandat- och loggbeslut.
- `.planning/phases/03-mandat-och-skyddade-datavagar/03-VERIFICATION.md` — vad som är verifierat och hur.
- `.planning/phases/03-mandat-och-skyddade-datavagar/03-07-SUMMARY.md` — beslut 2026-09-27 (engångskod vid inloggning, support för grupper) och öppna beslut.
- `docs/pilot/mandatmatris.md`, `docs/pilot/loggpolicy.md`, `docs/pilot/phase3-mandates.md`, `docs/pilot/audit-sources.md` — tekniska kontrakt. Obs: verifieraren noterade att loggpolicy-, audit-sources- och mandatmatrisens supportrad är delvis inaktuella.
- `docs/kommunintegration-och-sakerhet.md` — skyddade personuppgifter (§5), integrationer och informationsansvar (§4), acceptansfall.

### Läsår och Plan Digital
- `docs/plan-digital-lasarsmodell.md` — läsårslinsen, startår, härledd årskurs.
- `.planning/todos/pending/2026-09-12-l-s-rslins-st-lla-sig-i-ett-l-s-r-som-i-plan-digital.md`

### Handbok
- `docs/handbok/mandat.md`, `docs/handbok/regler.md`, `docs/handbok/sakerhetslogg.md`, `docs/handbok/anvandning.md` — ska uppdateras med verifierat elevregisterbeteende.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Fas 3:s auditerade elevprov (`phase3_read_pupils`, `phase3_pupil_in_scope`, `mandate_pupils`, elevprovets API/vy) — mönster för serverfiltrerad, loggad elevläsning och export som registret ersätter.
- `web/lib/mandate-policy.ts` och SQL-kedjeprövningen (`phase3_mandate_is_valid`) — all elevåtkomst går genom dessa.
- `web/lib/admin-model.ts` (`Pupil`, klasser, studieplaner i exempelläget) — domänbegrepp och UI-mönster för elevlistan i exempelläget; exempelläget förblir utan backend.
- Fas 3:s grind `web/scripts/verify-phase3.mjs`, `work/pilot/verify-mandates.mjs`, SQL-provsviten och Playwright-projekten (desktop/phone/built) — mönster att utöka till fas 4.
- `web/app/mandate-grant-dialog.tsx` — dialog med verifiering inifrån dialogen (rättat 2026-09-27).

### Established Patterns
- Logg före svar i samma transaktion; loggfel ger 500 `audit_unavailable` utan innehåll.
- Existens döljs: främmande/obehörigt objekt ger samma svar som obefintligt.
- Nya migrationer efter senaste tillämpade (nu `20260927090000_phase3_support_groups.sql`); tillämpade migrationer ändras aldrig.
- Kong tappar loggminimering vid omstart — `configure-audit-source` efter omstart.

### Integration Points
- Protected-arbetsytans navigation (`web/app/protected-home.tsx`) — elevregistret blir en ny vy för behöriga funktioner; läsårsväljaren i sidhuvudet.
- `offerings` behöver startår som heltal (D-07); fas 5 äger utbildningsflödena — ändra bara det fas 4 behöver.

</code_context>

<specifics>
## Specific Ideas

- Läsårsväljaren ska kännas som Plan Digitals topprad: `‹ 26/27 ›`, alltid synlig, styr listan.
- Fakturering till hemkommuner är ett uttalat framtida behov — underlaget (hemkommunsperioder, placeringsperioder) ska gå att räkna på utan omstrukturering.

</specifics>

<deferred>
## Deferred Ideas

- **Fakturering till hemkommuner** (interkommunal ersättning): belopp, beräkningsregler, fakturaunderlag, export till ekonomisystem — egen fas/todo (D-16).
- Vårdnadshavare, adresser och kontaktuppgifter — inte i fas 4 (D-01).
- Resten av läsårslinsen: läsårsstatus/lås, Aktuella/Framtida/Arkiverade, terminskolumner, automatisk klass→timplan-koppling, tjänsterader.
- Sparade namngivna urval.

### Reviewed Todos (not folded)
- **SPAR-synk för elever och vårdnadshavare** — hör till fas 7 (registerintegration); fas 4 förbereder källmärkning per fält (D-08).
- **Planera stark identitetskontroll och BankID**, **Utred Sverige-id och integration** — identitetsfrågor, inte elevregister.
- **RACI-matris**, **Leverantörens systemadministration** — administrations-/ansvarsmodell, egna faser.
- **Avgränsa Docusaurus till instruktioner och regler** — gäller redan som ram.
- **API för lärares behörigheter med statistisk uppföljning** — uppdragsstatistik, inte elevregister.

</deferred>

---

*Phase: 04-best-ndigt-och-skyddat-elevregister*
*Context gathered: 2026-09-27*
