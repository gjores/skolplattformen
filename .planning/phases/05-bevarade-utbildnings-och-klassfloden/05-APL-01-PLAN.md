---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-01
type: tdd
wave: 1
depends_on: []
files_modified: ["web/lib/apl-plan.ts", "web/lib/apl-plan.test.mjs"]
autonomous: true
status: planned
gap: APL-01
must_haves:
  truths: ["Rektor ser skillnad mellan planerad helvecka, ogranskad omfattning och faktisk genomförandetid.", "APL är ett delmått i befintliga timplanstotaler och räknas aldrig två gånger.", "Okänd utbildningsform eller delveckor ger inget automatiskt uppfyllelsebesked."]
  artifacts: ["web/lib/apl-plan.ts", "web/lib/apl-plan.test.mjs"]
  key_links: ["Fryst programkälla → stödd profil + explicit utbildningsform", "Period → innehållskopplingar och separat unik tidsallokering", "Innehållshash → aktuell rektorsbekräftelse oberoende av rent administrativa revisioner"]
---

<objective>
Implementera den rena APL-domänen och dess strikta kontrakt med testdriven verifiering. Ingen UI, databasaktivering eller uppskattning av delveckors nationella rättsverkan ingår.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/TESTING.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-IMPLEMENTATION.md
@web/lib/gym-timplan.ts
@web/lib/programplan-profile.ts
@web/lib/programplan-terms.ts
@web/lib/planning-year-model.ts
</context>

<tasks>

<task type="auto">
<name>1. Lås verksamhetsreglerna med meningsfulla modellprov</name>
<files>web/lib/apl-plan.test.mjs</files>
<action>Skriv först tester mot kontraktets APL1-01/02/03/04/06. Fixturer binder exakt skola, timplansserie/version och frysta ämnesrader. Prova explicit utbildningsform, 15 respektive 14 granskade hela veckor, 23 GUT per sådan vecka, okänd/lärlingsform och bland-/delvecka. Prova samma period kopplad till två ämnen utan dubblerad periodsumma; allokering 6 000+900 GUT-minuter för fem veckor samt 690+690 minuter för en vecka (11 h 30 min per ämne), överallokering, inaktiv term, saknad/negativ/decimal timcell och oklassificerat äldre underlag. Datumförlängning får inte ändra uttryckligt veckotal. Prova vårstart, period över termins-/läsårsskifte med explicit uppdelning, överlapp och ofullständigt valblock. Nödvändigt rimlighetsvillkor: uppgivet helt veckotal får inte överstiga antalet olika ISO-kalenderveckor som det inklusive datumintervallet berör. Testa måndag/söndag, årsskifte och enstaka dag; detta är endast en övre rimlighetsgräns, aldrig en omräkning eller ett bevis på hela APL-veckor. Rektors granskning krävs ändå. Prova innehållsändring respektive enbart submit/approve-revision mot rektorsbeslutets aktualitet. Testa verkligt resultat och avvisning, inte strängar i implementationen.</action>
<verify>Från web: node --test lib/apl-plan.test.mjs. Visa att relevanta fall först faller av saknad funktion eller felaktigt verksamhetsresultat, inte syntax/importmisstag.</verify>
<done>En tydlig RED-matris täcker beslutskritisk matematik, okändsemantik, identitet och bevarande.</done>
</task>

<task type="auto">
<name>2. Implementera parsers, summering och beslutsunderlag</name>
<files>web/lib/apl-plan.ts; web/lib/apl-plan.test.mjs</files>
<action>Implementera kontraktets dokumenterade typer, strikta request/reply-parsers och rena summeringar. Befintliga hours är heltalstotaler; APL-allokering lagras i heltals-GUT-minuter och är inkluderad delmängd per period+rowKey+term; summan per cell är högst sparade totaltimmar × 60. Nulltotal eller överskriden total nekar allokeringsskrivning; period/innehåll kan sparas utan färdig allokering. Bevara null som okänt och tydlig skillnad mellan tom plan och frånvarande legacyplan. Perioddatum, explicit läsår och fördelning valideras utan att July/Jan-vyintervall blir verklig skolkalender. Granskade hela veckor räknas med kontraktets regelversion som veckotal × 23 × 60 minuter utan avrundning; ogranskad/mixed omfattning kan lagras men ger kompletteringsbehov. Innehåll och tidsallokering hålls isär. Aktuell rektorshändelse måste matcha kanoniskt APL-/tim-/källinnehåll; historiska actor-, beslut- och revisionuppgifter bevaras. Läsningens capabiliteter kommer från servern, aldrig härleds från en klientvald roll. Frys exakta read/command/status/receipt-shapes, enumvärden, begränsningar och kanonisk hashpayload i kod/exporterade typer samt01-SUMMARY innan02 startar. Hashens innehåll och normalisering måste vara portabla till SQL; explicit testvektor verifieras i båda lagren. Exkludera rent administrativ status/revision/namn från rektorshashen. Hashen normaliserar semantiskt likvärdig listordning; testa no-op och definiera exakt revision-/auditutfall för no-op respektive rektorsbekräftelse i handoff.</action>
<verify>Kör samma tester till GREEN, relevanta gym-timplan/programplan-profile-regressioner och npx tsc --noEmit. Refaktorera endast med fortsatt gröna beteendeprov. Dokumentera att SQL-paritet ännu återstår i 07.</verify>
<done>Domänen kan användas av SQL-paritetsprov, server och UI utan egna motstridiga beräkningsregler.</done>
</task>

</tasks>

<verification>
APL1-01–04 och APL1-06 har rena kontrakts-/regelfall; inga automatbesked för ostödda förutsättningar. Frånvarodata, arbetsplatstid, betyg och examen påverkas inte.
Inventera aktuella definitioner vid start; äldre kodkartor och tidigare PASS är bakgrund. Läs kontraktets SS 12000-avstämning och bevara stabila skol-/klass-ID:n, giltighet och källansvar; inget externt standardutbyte verifieras av denna plan.
</verification>

<success_criteria>
- Rektor ser skillnad mellan planerad helvecka, ogranskad omfattning och faktisk genomförandetid.
- APL är ett delmått i befintliga timplanstotaler och räknas aldrig två gånger.
- Okänd utbildningsform eller delveckor ger inget automatiskt uppfyllelsebesked.
- Uppgifternas verifiering är redovisad på faktisk provnivå; avvikelser och första fel döljs inte.
</success_criteria>

<output>
Skriv 05-APL-01-SUMMARY.md i samma katalog med ändrade filer, utförda kontroller, bevarande, avvikelser och nästa beroende. Samordnaren hanterar avgränsad commit/push och paketstatus.
</output>
