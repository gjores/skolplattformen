---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-07A
type: execute
wave: 4
depends_on: ["TJANST-04A"]
files_modified: ["web/lib/access-rules.ts", "web/app/api/session/route.ts", "web/app/api/context/route.ts", "web/app/context-switch.tsx", "web/lib/server/tjanst-session.test.mjs"]
autonomous: true
status: planned
gap: TJANST-T1T2
must_haves:
  truths: ["Valt uppdrag berättar om läraren har egen tjänst eller tilldelade elevgrupper utan att klienten får välja omfattningen.", "Kontextbyte och återläsning visar samma serverkontrollerade scope och giltighet.", "Återkallat eller utgånget self-mandat kan inte återupplivas med ett tidigare sessionssvar."]
  artifacts: ["web/lib/access-rules.ts", "web/app/api/session/route.ts", "web/app/api/context/route.ts", "web/app/context-switch.tsx", "web/lib/server/tjanst-session.test.mjs"]
  key_links: ["access_assignments.scope_kind + assignment_is_valid → sessionsprojektion", "Låst context-byte → samma scopeKind som GET session", "ActiveContext.scopeKind → kommande skyddat skal i10, aldrig SQL-auktorisering från klienten"]
---

<objective>
Förmedla self/group genom den befintliga sessionen utan en ny autentiseringsväg.10 använder kontraktet för Min tjänst och navigation; denna plan ändrar inte protected-home.tsx eller bygger tjänstevy.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-DISCOVERY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-04A-SUMMARY.md
@web/lib/access-rules.ts
@web/lib/server/db.ts
@web/lib/server/session.ts
@web/app/api/session/route.ts
@web/app/api/context/route.ts
@web/app/context-switch.tsx
</context>

<tasks>
<task type="auto">
<name>1. Bär serverläst scope genom session och aktivt sammanhang</name>
<files>web/lib/access-rules.ts; web/app/api/session/route.ts; web/app/api/context/route.ts; web/app/context-switch.tsx; web/lib/server/tjanst-session.test.mjs</files>
<action>Lägg till scopeKind med sluten union school/group/pupil/case/self/null i de gemensamma presentationskontrakten AssignmentView och ActiveContext. Null representerar historiskt/ej tillämpligt scope och får aldrig behandlas som group eller ge nya rättigheter. Hämta a.scope_kind från samma egna identitetsbundna uppdragsrader som dagens GET session och från den auktoritativa återläsningen efter kundlås i POST context. Förmedla det i assignments, assignmentGroups och valt context; POST context och efterföljande GET ska ge samma scope. Behåll assignment_is_valid, medlemskapsspärr, mandatkedja, epoch, sessionslås och audit; ingen klientparameter/cookie bestämmer scope. Förbjudna eller ogiltiga kombinationer får inte bli valbara giltiga self-uppdrag. Ingen ändring av autentiseringsmotorn eller nya personuppgifter i sessionssvaret krävs;04A/06 kontrollerar åtkomst i SQL. Inför fokuserade route-/kontraktstester i ny tjanst-session.test.mjs för self/group, nullhistorik, främmande identitet, återkallelse, fel epoch, handgjorda scopefält och auditfel. Skapa ingen ny navigationsknapp här.</action>
<verify>Från web: node --test lib/server/tjanst-session.test.mjs lib/access-rules.test.mjs lib/server/mandates.test.mjs. Kör npx tsc --noEmit och npx oxlint app/api/session app/api/context app/context-switch.tsx lib/access-rules.ts. Testsvaret ska innehålla scopeKind på både aktivt sammanhang och uppdragslistan.</verify>
<done>Session/context ger auktoritativ och likadan scopeprojektion utan att gammal gruppåtkomst eller återkallelsemotor ändras.</done>
</task>

<task type="auto">
<name>2. Kontrollera kontextbyten och överlämna ett slutet UI-kontrakt</name>
<files>web/lib/server/tjanst-session.test.mjs; web/app/context-switch.tsx</files>
<action>Komplettera beteendeprov för group→self→group, två lärare med samma visningsnamn, giltigt→återkallat och tidigare laddat context efter sessionsbyte. Kontextkomponenten ska leverera scopeKind från det nya svaret och inte återanvända gamla metadata över epoch-/uppdragsbyte; loading/fel får inte anta group. Behåll befintliga spärrar för pågående/okända skrivningar. Frys i07A-SUMMARY hur10 använder serverläst scope: lärare startar i Min tjänst, Elever kräver befintligt giltigt group, och self ska aldrig montera elevregistret via URL/Back/cache. SQL är fortsatt avgörande vid varje elevanrop; detta presentationsfält är inget behörighetsbevis. Ändra inte protected-home eller tjänsteworkspace före09/10.</action>
<verify>Kör föregående Node-prov och relevanta befintliga context/epoch-prov. Sök alla konstruktioner av AssignmentView/ActiveContext och säkerställ typkontroll utan casts som tillverkar scope. Saknade typegenskaper i fixtures rättas inom detta tests egna fixturer; om ytterligare produktägare berörs ska de föras till konkret följdplan före vidare arbete.</verify>
<done>Kontexten kan bytas utan kvarhängande lärarscope och10 får ett exakt kontrakt för skyddad navigation.</done>
</task>
</tasks>

<verification>
TJ1-09: sessionens ägarskap, scopeprojektion, återkallelse och kontextepoch.07B provar faktisk OIDC och negativa elevvägar;09 provar nya egen-API:t. SS12000:2024/OpenAPI2.1.0 omfattar inte appens sessionsscope; inga nya person-/gruppmappningar införs. Typ-/routeprov är inte bevis för full tjänstevy.
</verification>

<success_criteria>
- GET session och låst POST context redovisar samma serverlästa scopeKind.
- Self och group förblir olika genom omladdning, kontextbyte och återkallelse.
- Inget elevgränssnitt eller tjänste-RPC aktiveras av denna plan;10 äger skalets beteende.
</success_criteria>

<output>
Skriv 05-TJANST-07A-SUMMARY.md med sessionskontraktet, tester och uttrycklig överlämning till07B/09/10. Samordnaren gör avgränsad commit/push.
</output>
