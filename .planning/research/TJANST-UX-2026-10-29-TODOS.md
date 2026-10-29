# Tjänstefördelning — UX-todos 2026-10-29

[Rapport med skärmbilder](../../work/ux-review-2026-10-29/rapport.html). Användaren beställde att alla fynd och förbättringar skulle registreras som GSD-todos. 16 registrerade punkter (åtta genomförda — sju buggar och F09 — samt åtta väntande förbättringar): sex ursprungliga UI-/UX-fel (B01–B06), användarfynd B07 och nio förbättringar (F01–F09).

F09 tillkom efter användarens önskemål om direkt tilldelning med ett klick i matrisen och dialog för avancerade val. Övriga förbättringar är rapportförslag att konkretisera i planering. Den ursprungliga registreringen innebar ingen implementation. B01 och B05 har därefter rättats lokalt i [05.1-35](../phases/05.1-tjanstefordelning/05.1-35-SUMMARY.md), utan installation eller ny kravacceptans; B02/B03/B04/B06 har därefter rättats lokalt i [05.1-36](../phases/05.1-tjanstefordelning/05.1-36-SUMMARY.md). F09 har genomförts och provats i [05.1-37](../phases/05.1-tjanstefordelning/05.1-37-SUMMARY.md), utan installation. Åtta förbättringar väntar. Aktuellt genomförandearbete i STATE ersätts inte.

## Uppföljning

| Rapport-ID | Prioritet | GSD-todo | Status |
| --- | --- | --- | --- |
| B01 | P1 | [Visa klassens underlag utan dolda filter](../todos/done/2026-10-29-tjanst-ux-b01-dolda-filter-i-klassvyn.md) | Klar lokalt; komponentprov PASS, installerad på 3012 (1d2b0ec); användarprov väntar |
| B02 | P2 | [Visa ofördelade behov i kursvyn](../todos/done/2026-10-29-tjanst-ux-b02-kursvy-for-ofordelade-behov.md) | Klar lokalt; komponentprov PASS, installerad på 3012 (1d2b0ec); användarprov väntar |
| B03 | P2 | [Låt lärarsökningen omfatta förslag](../todos/done/2026-10-29-tjanst-ux-b03-lararsokning-filtrerar-alla-kandidater.md) | Klar lokalt; komponentprov PASS, installerad på 3012 (1d2b0ec); användarprov väntar |
| B04 | P2 | [Gör terminsväljarens effekt tydlig](../todos/done/2026-10-29-tjanst-ux-b04-terminsval-i-alla-vyer.md) | Klar lokalt; komponentprov PASS, installerad på 3012 (1d2b0ec); användarprov väntar |
| B05 | P1 | [Bevara osparad tid vid byte av vy](../todos/done/2026-10-29-tjanst-ux-b05-bevara-osparad-tid-i-fordela.md) | Klar lokalt; komponentprov PASS, installerad på 3012 (1d2b0ec); användarprov väntar |
| B06 | P2 | [Bevara kursfiltret vid omladdning och navigation](../todos/done/2026-10-29-tjanst-ux-b06-bevara-kursfilter-i-navigationshistoriken.md) | Klar lokalt; komponentprov PASS, installerad på 3012 (1d2b0ec); användarprov väntar |
| B07 | P1 | [Behåll valbara lärare vid behovsfilter](../todos/done/2026-10-29-tjanst-ux-b07-ofordelat-doljer-larare.md) | Installerad på 3012 (1d2b0ec); UI248 PASS, användarprov väntar |
| F01 | P2 | [Ge fördelningsarbetet större plats](../todos/pending/2026-10-29-tjanst-ux-f01-mer-arbetsyta-i-tjanstefordelningen.md) | pending |
| F02 | P2 | [Gör huvudarbetsflödet lättare att hitta](../todos/pending/2026-10-29-tjanst-ux-f02-tydligare-navigation-i-tjanstefordelningen.md) | pending |
| F03 | P2 | [Samla sekundära verktyg och tillägg](../todos/pending/2026-10-29-tjanst-ux-f03-samla-sekundara-verktyg-i-tjanstefordelningen.md) | pending |
| F04 | P2 | [Förenkla filter och visningsinställningar](../todos/pending/2026-10-29-tjanst-ux-f04-enklare-filter-och-visningsinstallningar.md) | pending |
| F05 | P2 | [Gör lärarvalet kompakt och enhetligt](../todos/pending/2026-10-29-tjanst-ux-f05-kompakt-gemensamt-lararval.md) | pending |
| F06 | P2 | [Gör publiceringshinder synliga och handlingsbara](../todos/pending/2026-10-29-tjanst-ux-f06-handlingsbara-publiceringshinder.md) | pending |
| F07 | P2 | [Förtydliga mobilens läsläge och verksamhetsspråk](../todos/pending/2026-10-29-tjanst-ux-f07-begripligt-mobilt-laslage-och-detaljer.md) | pending |
| F08 | P3 | [Mät och förbättra matrisen för många lärare](../todos/pending/2026-10-29-tjanst-ux-f08-mat-och-forbattra-stor-tjanstematris.md) | pending |
| F09 | P2 | [Tilldela lärare med ett klick i matrisen](../todos/done/2026-10-29-tjanst-ux-f09-direkt-tilldelning-med-ett-klick-i-matrisen.md) | Genomförd; isolerat faktiskt prov PASS, installerad på 3012 (1d2b0ec); användarprov väntar |

## Föreslagen ordning och samordning

1. B01 och B05: pålitligt klassunderlag och bevarad inmatning.
2. B03, B06, B02 och B04: sökning, historik, kursinnehåll och terminsval.
3. F09 och F01/F03/F04/F05: direktval, arbetsyta, verktyg, filter och lärarval. Samordna B03 med F05 och B01 med F04; registreringen ska inte skapa dubbla implementationer.
4. F02/F06/F07: prova navigation, handlingsbara hinder och begripligt mobilt läsläge med rektor. F03 inkluderar fulla flytt-/massregistreringsflöden, vilka inte genomprovades i rapporten.
5. F08: mät stora underlag före optimeringsbeslut; inkludera tillgänglighet och fokus.

Varje todo anger berörda TJANST-krav och fas 05.1. Den kommande GSD-planen ska precisera beroenden, SS 12000-version/mappning, handbok och verifieringsresultat. Inga kravrutor eller historiska användargodkännanden ändras. Bredare användarprov av föreslagen navigation är arbete som återstår, inte ett återkallat godkännande av tidigare funktioner.

F09:s följdrättelse 05.1-38 är installerad på 3012: radfeedback och Ångra utan hopp, senaste rad kvar under filter och fasta kompakta lärarrubriker. UI246 och faktiskt 88/88 PASS. [Resultat och användarprov som återstår](../phases/05.1-tjanstefordelning/05.1-38-SUMMARY.md).

B07:s kolumnrättelse för Ofördelat och övriga behovsfilter är installerad på 3012 som 1d2b0ec. Alla lärare visas som standard; relevansurval är frivilligt. UI248 och fryst skyddat bygge PASS; ingen ny faktisk OIDC/databasserie. [Resultat](../phases/05.1-tjanstefordelning/05.1-39-SUMMARY.md).

05.1-40: förenklat befintligt lärarbyte installerat på 3012 som 8f6a586, UI254/domän15 PASS. Det rapporterade generella sparfelet är inte återskapat; konkret användarprov väntar. [Resultat och begränsningar](../phases/05.1-tjanstefordelning/05.1-40-SUMMARY.md). Åtta ursprungliga förbättringar kvarstår.
