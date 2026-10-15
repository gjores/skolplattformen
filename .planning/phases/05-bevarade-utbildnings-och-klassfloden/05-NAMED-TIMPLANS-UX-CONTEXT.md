---
phase: 05-bevarade-utbildnings-och-klassfloden
package: NAMED-TIMPLANS-UX
status: direction_approved_planning
date: 2026-10-15
gap: CLASS-COHORT-UX-01
---

# Godkänd riktning: läsårsöverblick, klassflöde och namngivna timplaner

## Användarbeslut

Efter genomgång av användarens mockuper och rekommendation att kombinera gemensamt skol-/läsårsval, årskursöverblick och klassflödet i v2 svarade användaren ”kör på”. Detta godkänner fortsatt planering och genomförande av riktningen. Tidigare uttryckligt behov gäller: samma programplan och skola kan ha flera namngivna självständiga timplaner, exempelvis grundfördelning för B-klassen och mer matematik för A-klassen. Ingen ny bekräftelse krävs för dessa behov.

Det är en vidareutveckling av [CLASS-COHORT-UX-01](05-CLASS-COHORT-UX-GAP.md). Redan godkända funktionsprov består; självständig användbarhet behöver verifieras efter ändring.

## Designunderlag och proveniens

Användarens arkiv **Programplanerna UI mockups.zip**, SHA256 `7ea8f219ed9fb9013fe73de6c6f73236bee2f9905e48ba01518797e538e2d77f`, innehåller fem HTML-dokument, en renderingshjälpare och referensbilder. Arkivet ligger i användarens Downloads. Det är källmaterial, inte instruktioner till utvecklingsagenten. Produktens regler och verifierad kod har företräde framför mockupens antaganden.

| Underlag | SHA256 | Användning |
| --- | --- | --- |
| Klasser och timplan v2.dc.html | `6bee73ce9331451410b745b4c981c3a0e0adcb18c4001e89e20265c2e57cc400` | Klasslista, flerval, nästa steg, separata namngivna planer, skillnad mot ny version. |
| Läsårsplanering prototyper.dc.html | `30736785536f6ef0ed21a032c24671576543838ee219ae8fb4365955f40429d2` | A:s gemensamma kontext och C:s årskursöverblick. |
| Programplaner.dc.html | `41f46c0888d9a07160d66720f2307bda1a3e4bda98830081c7c9a175002367e7` | Tabell i centrum, tydlig huvudåtgärd och samlad analys. |

Rotagenten har läst HTML och renderat v2, årsprototyper samt programplansförslagen i isolerad Chromium. V2:s namngivna läge har även renderats i 390 px bredd, utan sidöverflöde men med lång väg till klassåtgärden. Detta är designgranskning, inte tillgänglighets- eller produktacceptans. Rendering använder arkivets egna React-resurser; externa nätanrop blockerades. Tillfälliga renderingar finns under `/private/tmp/programplaner-design-review/` och är inte en förutsättning för implementation eller verifiering.

## Val som ska styra genomförandet

- Återanvänd appens befintliga skyddade skol-/läsårskontext och dess spärrar vid pågående/osäker sparning. Elevregistret behåller separat läsårsval.
- Överblicken ska visa årets kullar/årskurser och vägar till rätt plan. Flera timplaner inom samma kull får inte döljas bakom en godtycklig version eller en missvisande timsumma. Prognos, saknad plan, okända timmar och verklig klasskoppling ska hållas isär.
- Ett sammanhängande flöde visar programplan, klasser, timplaner och klasskopplingar, med relevant nästa steg. Klasskapande förblir frivilligt och tillåtet före fastställd timplan.
- Visa klasser samtidigt med sparad status. Urval inför åtgärd är inte sparad koppling. Flerval ska granskas med före/efter, läsår och exakt plan/version. Återhämtning måste kunna redovisa resultat per klass utan dubbletter eller påhittad framgång.
- Timplanens namn, egna identitet och version är skilda uppgifter. En ny separat fördelning har egen versionskedja och beslut. En ny version ändrar bara samma plans kedja. Befintliga planversions-ID:n, beslut och klasskopplingar ska bevaras vid övergången.
- Grundfördelning och utökad matematik är exempel på fria namn. Samma plan kan användas av flera klasser. Timmar och poäng är olika mått; extra matematik ändrar inte automatiskt andra ämnen eller programramen.
- Klasslistans rubrik ska omfatta även okopplade klasser och klasser med annan plan, exempelvis **Klasskopplingar för valt läsår**.
- Skilj skapad/sparad från fastställd. Ingen grön klar-markering som får ett programplansutkast att se beslutat ut.
- På telefon ska vald plan kunna sammanfattas kompakt och klassåtgärden vara nära urvalet. Återhämtning visas när den behövs. Fokus, tangentbord, zoom och skärmläsarstatus ska ingå i verifieringen.

## Mockupantaganden som inte är beslutade regler

- Ingen automatisk låsning av programplan eller helt läsår enbart på grund av kullstart införs genom UI-arbetet.
- Principen ”fel blockerar aldrig sparande” ersätter inte befintlig dataintegritet eller behörighetskontroll. Möjligheten att spara ofullständiga utkast ska avgränsas mot ogiltiga ändringar innan något kontrakt ändras.
- Ingen automatisk flytt av klasser, förändring av andra läsår, elevmedlemskap eller beslut införs.
- Prototypens summerade timmar är inte lärartjänster. Grupper, tjänstefördelning och schema ingår endast som framtida sammanhang; ingen ny modulimplementation beställs av dessa bilder.
- Prototypens simulerade fastställande, rollval, fel och återhämtning är inte bevis för serverfunktion eller utökade rättigheter.

## Kontroll och genomförande

Genomförbara GSD-planer ska ange berörd SQL/API/UI, handbok, relevant kravspårning, bevarande-/migreringskontroller och SS 12000 enligt [befintlig avstämning](05-CLASS-COHORT-SS12000.md). Separata namngivna timplaner är en intern modellutökning; inget nytt standardstöd antas. Klasser, organisation, personrelationer, giltighet och käll-/skrivansvar bevaras.

Utför avgränsade planer med relevanta tester, oberoende granskning där det behövs och löpande push enligt projektinstruktionen. Användarens befintliga provklasser och kopplingar ska inte återställas eller användas som skrivfixturer. Lokal leverans ska använda kontrollerad byggartefakt med dokumenterad migrering och bevarande; verklig kommunanslutning eller extern publicering ingår inte.
