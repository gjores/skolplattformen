---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-13
type: execute
wave: 10
depends_on: ["TJANST-12"]
files_modified: ["web/app/tjanst-egen.tsx", "web/app/tjanst-egen.css", "web/e2e/fixtures/tjanst-egen-preview.tsx", "web/e2e/tjanst-egen.spec.ts"]
autonomous: true
status: superseded
superseded_on: 2026-10-19
superseded_by: "Fas 05.1 (tjänstefördelning) eller repot tjanstebedomning (tjänstebedömning); se ../05.1-tjanstefordelning/05.1-SPLIT-DECISION.md"
local_acceptance: [TJ1-06, TJ1-07, TJ1-09, TJ1-10]
must_haves:
  truths: ["En lärare kan se sin egen fastställda tjänst och en uttryckligt delad dialogversion, med fördelning och motivering, även utan undervisningsgruppmandat.", "Läraren kan lämna egen synpunkt och ett uttryckligt eget initiativ enligt11§punkt1; rektor kan inte imitera detta.", "Läraren ser vad som är mottaget, läst, diskuterat och beslutat utan att läsning innebär godkännande.", "Lärare utan verifierad kontokoppling visas inte som signerande och ingen identifieras genom namnmatchning."]
  artifacts: ["web/app/tjanst-egen.tsx", "web/e2e/tjanst-egen.spec.ts"]
  key_links: ["Serverns self-scope och verifierade personkoppling → egen/lasa → endast egen tillåten plan", "Eget initiativ/synpunkt → egen/kommando → oföränderlig aktörs- och revisionsbunden händelse", "Rektors atomiska fastställande → lärarens publicerade version; bara uttryckligt delad dialogversion visas före beslut"]
---

<objective>
Ge läraren en begriplig egen tjänsteplan och möjlighet till dialog från ett eget, snävt behörighetsområde. Läraren behöver inget konstruerat elev-/gruppmandat för sin tjänst och får inte genom denna funktion åtkomst till elevregister eller kollegors underlag.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-09-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-12-SUMMARY.md
@web/app/context-switch.tsx
@web/lib/mandate-policy.ts
@web/lib/tjanst-journal.ts
@web/app/tjanst-workspace.tsx
</context>

<tasks>
<task type="auto">
<name>1. Visa lärarens egen tjänst och skapa åtskilda dialoghändelser</name>
<files>web/app/tjanst-egen.tsx; web/app/tjanst-egen.css</files>
<action>Bygg Min tjänst från egen/lasa och serverns verifierade scopeKind, personkoppling och capabilities. Vyn har period/anställning/egen skola som tydliga sammanhang men använder inte administrativ PlanningContextProvider genom att tillåta lärarrollen generellt. Visa senast fastställd/synlig tjänst, separat uttryckligt delad dialogversion och tillåtna historiska versioner, avtalskälla, reglerad/förtroendetid, uppdragsbudgeter, undervisning, planering, mentorskap, rektors motivering och nästa avstämning. Om inget beslut finns visas Ingen fastställd tjänst ännu. En uttryckligt delad dialogversion visas märkt För dialog – ännu inte fastställd med exakt versionshash, egen läsrätt och tydlig åtskillnad från gällande tjänst; inga andra utkast exponeras. Återkallad delning stoppar ny läsning/åtgärd och lämnar historiken intakt. Läraren kan registrera synpunkt och separat frivillig läskvittens genom egen/kommando; synpunkten binds till läst version. Visa lärarens egna händelser åtskilda från rektors dialoganteckning och beslut. Om personen har flera anställningar/egna skoluppdrag, visa korrekt del och samlad egen helhet endast enligt serverprojektionen utan dubbel budget. Schemalagd andel/utfall visas som saknade, inte0. Förtroendetid beskrivs som lärardisponerad del av ramen, inte extra tid eller automatiskt avsatt planering. Kollega/personväljare och elevlistor finns inte.</action>
<verify>Läsare med enbart self-scope utan gruppmandat kan läsa egen fastställd tjänst och uttryckligt delad dialogversion; annan person/anställning/kund, odelade utkast och privata underlag nekas i09/17. I UI provas olika egna perioder, konto saknas/inte verifierat, ingen tjänst, historisk version, inläsningsfel, samt synpunkt mot nyligen ersatt version. Från web/: npx tsc --noEmit och npx oxlint app lib.</verify>
<done>Läraren kan förstå sin egen tjänst och bidra till dialogen utan att kvittera ett juridiskt godkännande eller få extra registeråtkomst.</done>
</task>

<task type="auto">
<name>2. Gör eget11§1-initiativ uttryckligt och pröva hela egenflödet</name>
<files>web/app/tjanst-egen.tsx; web/e2e/fixtures/tjanst-egen-preview.tsx; web/e2e/tjanst-egen.spec.ts</files>
<action>Lägg till en separat, frivillig handling Jag vill lämna ett eget initiativ för11§punkt1 med förklaring av vilken individuell tjänst/period och begäran den gäller. Ingen förvald kryssruta, automatiskt initiativ eller registrera för annan-person-väg. Läraren anger egen text och bekräftar att initiativet är det egna; servern binder identitet, tidpunkt, innehåll och version, även när initiativet avser en uttryckligt delad dialogversion före fastställande. Visa tydligt att detta är underlag för en senare bedömning, inte ett automatiskt beviljat undantag. Skilj nytt initiativ, komplettering/återtagande när kontraktet tillåter det och rektors faktiskt beslut utan att radera historik. Återanvänd journal/status och MFA när servern kräver det. För konto saknas/otillräcklig identitet finns endast begriplig information; rektors externa dialoganteckning får inte presenteras som ett digitalt eget initiativ. Skapa separata syntetiska fixturefall för self-only, vanligt läraruppdrag, delad dialogversion före beslut, återkallad delning, ändrad tjänst efter initiativ, avslag/bedömt undantag och blockerad rektorsimitation.</action>
<verify>Från web/: npx playwright test -c playwright.tjanst-preview.config.ts tjanst-egen.spec.ts. Dator/telefon: egen läsning, synpunkt, läskvittens utan samtycke, eget initiativ, återläsning och historik; tappat svar, reload,409,MFA och återkallad personkoppling. Kontrollera att rektor/HM/admin aldrig ser lärarens initieringsknapp i sitt scope. Granska skärmbilder, tangentbord/fokus och minst44×44. Faktiskt API nekar spoofat person-ID/aktör i09/17.</verify>
<done>Ett initiativ har korrekt egen aktör och eget innehåll, inget falskt samtycke skapas och normal dialog förblir användbar på båda skärmarna.</done>
</task>
</tasks>

<verification>
Följ kontraktets två hashvärden: initiativ binder initiativeBasisHash utan sin egen händelse eller senare prövning; decisionHash inkluderar slutlig prövning och referens till giltigt initiativ. Prova positivt delning→eget initiativ→rektors prövning→fastställande utan självogiltigförklaring, samt negativt ändrad faktisk tjänst/undantagsvillkor och återkallat initiativ.
TJANST-05 och TID-05/06. SS12000:2024/OpenAPI2.1.0 ger stabil Person/Duty och giltighet, men inte kontots lokala åtkomst eller ett rättsligt11§-initiativ. Ingen elevåtkomst ges via selfscope och ingen lärarlegitimation verifieras. Externa initiativ/signeringstjänster ingår inte; personer utan konto hanteras sanningsenligt.
</verification>

<success_criteria>
- Läraren når enbart sin egen tillåtna tjänst med rätt period och version.
- Synpunkt, läskvittens, eget initiativ och rektorsbeslut visas och lagras som skilda handlingar.
- Ingen rektor, administratör eller kontolös person kan framställas ha gjort en autentiserad lärarhandling.
</success_criteria>

<output>
Skriv 05-TJANST-13-SUMMARY.md med provade selfscopegränser, UI-/APIbevisnivå, lärarflöde utan gruppmandat och inkopplingsunderlag för16. Samordnaren hanterar commit/push.
</output>
