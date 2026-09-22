# Gå igenom och bygga om Skolplattformen med GSD

2026-09-10. Arbetssätt för det befintliga projektet.

GSD håller ihop nuläge, krav, genomförande och verifiering. För Skolplattformen betyder det att vi går igenom en arbetsuppgift i taget och bestämmer vad som ska bevaras, förbättras eller ersättas. En fas ska ge ett sammanhängande resultat som går att använda och kontrollera.

## Börja med ett ärligt nuläge

`$gsd-map-codebase` används för att kartlägga arkitektur, lagring, integrationer, tester och kända problem. Kartan ligger i `.planning/codebase/`. Gamla produktdokument stäms av mot aktuell kod: ”beskrivet”, ”byggt med exempeldata” och ”verifierat med riktig åtkomst” är olika lägen.

För varje berört område dokumenteras dagens beteende, vad användaren uppskattar, vad som saknas och vilket prov som ska bevara eller förändra beteendet. Exempel i det här projektet:

| Område | Nuläge | Riktning |
|---|---|---|
| Gymnasiets utbildningar och kurs-/nivåtillägg | Uppskattat arbetsflöde med beständig planering | Bevara och prova efter behörighetsändringar |
| Inloggning och rollbyte | Demoidentitet och vald vyroll | Bygg om till verklig identitet och giltiga uppdrag |
| Elevregister | Främst sessionsdata | Inför beständig, avgränsad lagring och källansvar |
| Kommunens registeranslutning | Saknas | Bygg och prova ett avgränsat flöde |

## Förankra mål, krav och ordning

`$gsd-new-project` etablerar `.planning/PROJECT.md`, krav, research, färdplan och status. Det används för att lägga GSD kring detta befintliga projekt. När initieringen är färdig fortsätter vi från statusfilen; vi behöver inte initiera om projektet inför varje ändring.

Användaren har valt första milstolpen: **säker administration inför en pilot**. Detaljerade krav och färdplan granskas före fastställande. Ett krav beskriver ett observerbart beteende, exempelvis att rektor på skola A nekas lärartilldelning på skola B även via direkt anrop.

## Arbeta fas för fas

| Steg | Kommando, med fas 1 som exempel | Resultat |
|---|---|---|
| Klargör förändringen | `$gsd-discuss-phase 1` | Beslut om vad som ska ändras, bevaras och lämnas öppet |
| Planera arbetet | `$gsd-plan-phase 1` | Avgränsade planer med beroenden, berörda filer och verifiering |
| Genomför | `$gsd-execute-phase 1` | Ändringar, relevanta kontroller, versionshistorik och genomförandesammanfattning |
| Pröva arbetsflödet | `$gsd-verify-work 1` | Bekräftat användarbeteende eller dokumenterade fel att åtgärda |
| Kontrollera läget | `$gsd-progress` | Vad som är klart, återstår och bör göras härnäst |

UI-arbete kan få ett eget designunderlag genom `$gsd-ui-phase 1` och eftergranskning med `$gsd-ui-review 1`. Detaljer väljs utifrån fasens innehåll. Säkerhets- och regressionsprov måste avse de verkliga datavägarna, inte bara hur gränssnittet ser ut.

Om verifieringen hittar en lucka korrigeras eller omplaneras den innan fasen anges som klar. När nya behov uppstår förs de in som krav eller senare arbete; pågående plan ändras inte tyst.

## Avsluta hela milstolpen med en sammanhängande kontroll

`$gsd-audit-milestone` används för att kontrollera att faserna tillsammans uppfyller målet och att inga krav fallit mellan delarna. För piloten omfattar det exempelvis en riktig inloggning, ett giltigt skoluppdrag, rätt elevurval, beständig ändring, avstämd import och spårbart resultat. En fungerande lokal simulator uppfyller inte kravet på en faktisk leverantörsanslutning.

`$gsd-complete-milestone` hör till avslut efter att nödvändig verifiering är klar. Den bredare visionen, såsom undervisning och fler kommunanslutningar, kan sedan tas in via `$gsd-new-milestone`.

## Var sanningen finns

Handboken i `docs/handbok/` byggs med Docusaurus. Lägg berörda handbokssidor och `npm run docs:build` i fasplanen när användarflöden, API-kontrakt eller driftanvisningar ändras. Utgå från en källa per text; interna planeringsfiler och testkonton ingår inte i handboksbygget. Se [utvecklarguiden](handbok/utveckling.md).

- [PROJECT.md](../.planning/PROJECT.md): syfte, beslut, befintligt värde och avgränsningar.
- [REQUIREMENTS.md](../.planning/REQUIREMENTS.md): prövbara krav och deras fas.
- `.planning/ROADMAP.md`: ordning, mål, beroenden och framsteg.
- `.planning/STATE.md`: aktuell position och nästa steg.
- `.planning/phases/`: fasernas diskussioner, planer, genomförande och verifiering när fasarbete har startat.

Varken ett skrivet dokument, en utförd kodändring eller ett lyckat bygge räcker ensamt för att ett verksamhetskrav ska vara klart. Det kräver rätt funktion och relevant verifiering.
