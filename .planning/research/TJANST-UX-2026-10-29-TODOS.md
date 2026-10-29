# Tjänstefördelning — UX-todos 2026-10-29

[Rapport med skärmbilder](../../work/ux-review-2026-10-29/rapport.html). Användaren beställde att alla fynd och förbättringar skulle registreras som GSD-todos. 15 registrerade punkter (två lokalt rättade/komponentverifierade och 13 väntande): sex reproducerade UI-/UX-fel (B01–B06) och nio förbättringar (F01–F09).

F09 tillkom efter användarens önskemål om direkt tilldelning med ett klick i matrisen och dialog för avancerade val. Övriga förbättringar är rapportförslag att konkretisera i planering. Den ursprungliga registreringen innebar ingen implementation. B01 och B05 har därefter rättats lokalt i [05.1-35](../phases/05.1-tjanstefordelning/05.1-35-SUMMARY.md), utan installation eller ny kravacceptans; övriga punkter väntar. Aktuellt genomförandearbete i STATE ersätts inte.

## Uppföljning

| Rapport-ID | Prioritet | GSD-todo | Status |
| --- | --- | --- | --- |
| B01 | P1 | [Visa klassens underlag utan dolda filter](../todos/done/2026-10-29-tjanst-ux-b01-dolda-filter-i-klassvyn.md) | Klar lokalt; komponentprov PASS, ej installerad |
| B02 | P2 | [Visa ofördelade behov i kursvyn](../todos/pending/2026-10-29-tjanst-ux-b02-kursvy-for-ofordelade-behov.md) | pending |
| B03 | P2 | [Låt lärarsökningen omfatta förslag](../todos/pending/2026-10-29-tjanst-ux-b03-lararsokning-filtrerar-alla-kandidater.md) | pending |
| B04 | P2 | [Gör terminsväljarens effekt tydlig](../todos/pending/2026-10-29-tjanst-ux-b04-terminsval-i-alla-vyer.md) | pending |
| B05 | P1 | [Bevara osparad tid vid byte av vy](../todos/done/2026-10-29-tjanst-ux-b05-bevara-osparad-tid-i-fordela.md) | Klar lokalt; komponentprov PASS, ej installerad |
| B06 | P2 | [Bevara kursfiltret vid omladdning och navigation](../todos/pending/2026-10-29-tjanst-ux-b06-bevara-kursfilter-i-navigationshistoriken.md) | pending |
| F01 | P2 | [Ge fördelningsarbetet större plats](../todos/pending/2026-10-29-tjanst-ux-f01-mer-arbetsyta-i-tjanstefordelningen.md) | pending |
| F02 | P2 | [Gör huvudarbetsflödet lättare att hitta](../todos/pending/2026-10-29-tjanst-ux-f02-tydligare-navigation-i-tjanstefordelningen.md) | pending |
| F03 | P2 | [Samla sekundära verktyg och tillägg](../todos/pending/2026-10-29-tjanst-ux-f03-samla-sekundara-verktyg-i-tjanstefordelningen.md) | pending |
| F04 | P2 | [Förenkla filter och visningsinställningar](../todos/pending/2026-10-29-tjanst-ux-f04-enklare-filter-och-visningsinstallningar.md) | pending |
| F05 | P2 | [Gör lärarvalet kompakt och enhetligt](../todos/pending/2026-10-29-tjanst-ux-f05-kompakt-gemensamt-lararval.md) | pending |
| F06 | P2 | [Gör publiceringshinder synliga och handlingsbara](../todos/pending/2026-10-29-tjanst-ux-f06-handlingsbara-publiceringshinder.md) | pending |
| F07 | P2 | [Förtydliga mobilens läsläge och verksamhetsspråk](../todos/pending/2026-10-29-tjanst-ux-f07-begripligt-mobilt-laslage-och-detaljer.md) | pending |
| F08 | P3 | [Mät och förbättra matrisen för många lärare](../todos/pending/2026-10-29-tjanst-ux-f08-mat-och-forbattra-stor-tjanstematris.md) | pending |
| F09 | P2 | [Tilldela lärare med ett klick i matrisen](../todos/pending/2026-10-29-tjanst-ux-f09-direkt-tilldelning-med-ett-klick-i-matrisen.md) | pending |

## Föreslagen ordning och samordning

1. B01 och B05: pålitligt klassunderlag och bevarad inmatning.
2. B03, B06, B02 och B04: sökning, historik, kursinnehåll och terminsval.
3. F09 och F01/F03/F04/F05: direktval, arbetsyta, verktyg, filter och lärarval. Samordna B03 med F05 och B01 med F04; registreringen ska inte skapa dubbla implementationer.
4. F02/F06/F07: prova navigation, handlingsbara hinder och begripligt mobilt läsläge med rektor. F03 inkluderar fulla flytt-/massregistreringsflöden, vilka inte genomprovades i rapporten.
5. F08: mät stora underlag före optimeringsbeslut; inkludera tillgänglighet och fokus.

Varje todo anger berörda TJANST-krav och fas 05.1. Den kommande GSD-planen ska precisera beroenden, SS 12000-version/mappning, handbok och verifieringsresultat. Inga kravrutor eller historiska användargodkännanden ändras. Bredare användarprov av föreslagen navigation är arbete som återstår, inte ett återkallat godkännande av tidigare funktioner.
