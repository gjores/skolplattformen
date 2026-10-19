---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-01A
type: tdd
wave: 2
depends_on: ["TJANST-01"]
files_modified: ["web/lib/tjanst-self-access.ts", "web/lib/tjanst-self-access.test.mjs", "web/lib/mandate-policy.ts", "web/lib/mandate-policy.test.mjs", "web/lib/server/mandates.ts", "web/lib/server/mandates.test.mjs"]
autonomous: true
status: superseded
superseded_on: 2026-10-19
superseded_by: "Fas 05.1 (tjänstefördelning) eller repot tjanstebedomning (tjänstebedömning); se ../05.1-tjanstefordelning/05.1-SPLIT-DECISION.md"
gap: TJANST-T1T2
must_haves:
  truths: ["En lärare kan få ett uttryckligt mandat för egen tjänst utan elevgrupp.", "Egen tjänst kan aldrig väljas genom namn, e-post eller ett fritt person-ID.", "Ett eget mandat ger inga elev-, klasslistnings- eller planeringsrättigheter; gamla gruppmandat behåller sin omfattning."]
  artifacts: ["web/lib/tjanst-self-access.ts", "web/lib/tjanst-self-access.test.mjs", "web/lib/mandate-policy.ts", "web/lib/server/mandates.ts"]
  key_links: ["Person från01 → verifierad bindning till medlemskap → eget mål", "Rektors giltiga mandat → larare/self med skola men utan grupper/elever/ärenden", "Self-form → uttryckligt nej till pupil.* och övrig administration"]
---

<objective>
Lås den minsta säkra åtkomstmodellen för lärare före grupptilldelning. Planen ger rena kontrakt och mandatparsers; faktisk SQL-åtkomst och bindning byggs sammanhängande i04A.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-DISCOVERY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-01-SUMMARY.md
@web/lib/tjanst-personal.ts
@web/lib/mandate-policy.ts
@web/lib/server/mandates.ts
@supabase/migrations/20260922120000_phase3_staff_bindings.sql
</context>

<tasks>
<task type="auto">
<name>1. Frys verifierad personbindning och egen åtkomst med RED–GREEN-prov</name>
<files>web/lib/tjanst-self-access.ts; web/lib/tjanst-self-access.test.mjs</files>
<action>Skapa strikt kontrakt för StaffIdentityBinding, bindningens revision/giltighet, historikbevarande avslut och personalfamiljens bind/unbind-kommandon samt rena egenåtkomstfall. Härled eget person-ID från serverladdad sessionidentitet, aktivt medlemskap, aktuell verifierad personbindning och aktuellt skolmandat. Ett request-person-ID kan bara jämföras med det härledda, aldrig ge åtkomst. Publicerad eller uttryckligt delad dialogversion är de enda tillåtna tjänsteversionerna. Prova self och befintligt group som två tillåtna lärarscope; person utan konto kan planeras men saknar egenåtkomst. Prova fel person/kund/huvudman/skola, dubbel aktiv bindning, annan identitet med samma namn/e-post, bindningens start/slut, avslutat medlemskap/mandat och ändrad bindningsrevision. Bindningskommandon används inom personalfamiljens befintliga command/status-kontrakt, inte genom extra öppna RPC. Ange att huvudmannen hanterar person–medlemskapsbindning, medan rektor tilldelar self-mandatet; den ena åtgärden ersätter inte den andra. Börja med RED för saknad regel och implementera till GREEN. Frys exports och exakta negativa testvektorer för04A/06/08.</action>
<verify>Från web: node --test lib/tjanst-self-access.test.mjs lib/tjanst-personal.test.mjs. Kontrollera att RED är ett beteendefel och att GREEN skiljer saknad bindning från felaktigt giltig egenåtkomst.</verify>
<done>Ren policy bevisar vilken person och vilka versioner en inloggad lärare kan läsa utan att uppfinna elevgrupper eller bredare systemrättigheter.</done>
</task>

<task type="auto">
<name>2. Utöka mandatets form och parser med ett slutet self-scope</name>
<files>web/lib/mandate-policy.ts; web/lib/mandate-policy.test.mjs; web/lib/server/mandates.ts; web/lib/server/mandates.test.mjs</files>
<action>Utöka MandateScope och parseMandatePayload med self endast för larare. Kräv minst en unik skola och exakt tomma grupper/pupilIds/caseIds; profession, purposeCode och supportattribut får inte användas för att få self. Behåll rektor→lärare-kedja, medlemskaps-/kund-/huvudmanskontroll och giltighetsgränser. Ge inte self skolscope, tom group eller generell pupil.read. Lägg explicit self-nekande i befintlig inScope/decideMandate för elev-/plan-/organisationsvägar så framtida fallthrough inte kan ge åtkomst; egen-tjänstpolicyn är separat och kräver personbindning. Ändra inte gamla lärares grupp-/mentorrelationer eller support/elevhälsa. Prova genom giltigt föräldramandat, förbjuden roll, annan skola, insmugen grupp/elev/case, tom skolmängd, avslutad förälder och direkta parseranrop med extra fält. Undvik att exponera nya UI-val eller ändra SQL i detta steg.</action>
<verify>Kör node --test lib/mandate-policy.test.mjs lib/server/mandates.test.mjs lib/tjanst-self-access.test.mjs och npx tsc --noEmit. Befintliga positiva grupp-/mentor- och negativa elevexportfall ska bestå oförändrade.</verify>
<done>Self kan beskrivas och valideras utan grupp, samtidigt som befintlig elevpolicy fortsätter neka self och behålla rättigheter för gamla uppdrag.</done>
</task>
</tasks>

<verification>
TJ1-09: verifierad identitet, minsta åtkomst och förbjudna kombinationer på modell-/parsernivå. TJ1-06/07 får kontraktsgrund men inget leveransbevis. SS12000:2024/OpenAPI2.1.0: StaffPerson motsvarar personankare; self är ett lokalt åtkomstmandat och inte Duty/Group eller ett standardiserat person-ID. Inga standardfält eller grupper konstrueras för behörighetens skull.
</verification>

<success_criteria>
- Self kräver lärare, faktisk skola och tomma elevrelationer; inget nytt elevmandat uppstår.
- Egen identitet kräver en uttrycklig serververifierad bindning och giltig mandatkedja.
- Kontrakt och testvektorer är klara för04A; faktisk databas/API/egenvy är ännu inte verifierad.
</success_criteria>

<output>
Skriv 05-TJANST-01A-SUMMARY.md med exakta typer/exports, testvektorer, bindningsoperationernas namn och bevarande av gamla mandat. Samordnaren gör avgränsad commit/push efter relevanta kontroller.
</output>
