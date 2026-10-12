# Nationella yrkesprogram Gy25 – beslutsprofil

Verifierat mot primärkällor 2026-10-12. Detta är underlag för 05-VOCATIONAL, inte bevis för genomförd undervisning eller individuella examensbeslut.

## Fullständig gemensam programplan

Barn- och fritidsprogrammet, hotell- och turismprogrammet samt vård- och omsorgsprogrammet omfattar 2 700 poäng och minst 2 625 undervisningstimmar. Övriga nationella yrkesprogram omfattar 2 800 poäng och minst 2 720 timmar. Undervisningstimmar avser 60 minuter. Individuellt val omfattar 200 poäng och gymnasiearbete 100. Grundbehörighetsnivåerna ingår i den gemensamma ramen; elevens eventuella bortval får inte minska skolans gemensamma plan. [Skollagen 16 kap. 18–20 §§ och bilaga 2](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skollag-2010800_sfs-2010-800/).

| Koder i versionsbunden Gy25-katalog | Poäng | Minsta tid |
| --- | ---: | ---: |
| BF25, HT25, VO25 | 2700 | 2625 |
| BA25, EE25, FR25, FS25, FT25, IN25, NB25, RL25, VF25 | 2800 | 2720 |

Koderna avser exakt kategorin `VOCATIONAL_PROGRAM`. Andra kategorier och äldre/okända koder får ingen fallback. FR25 är frisör- och stylistprogrammet, inte äldre hantverksprogrammet. Dess offentliga struktur visar engelska nivå 1–2 och svenska eller svenska som andraspråk nivå 1–3. [Skolverkets programstruktur FR25](https://syllabuswebb.skolverket.se/syllabuscw/jsp/program.htm?date=2025-07-01&programCode=FR25&tos=gy).

## APL och manuell kontroll

Nationella yrkesprogram har minst 15 veckors APL. Lärlingsutbildning kräver mer än hälften av utbildningen på arbetsplats, beräknat enligt förordningens särskilda regel. En APL-vecka motsvarar 23 timmars garanterad undervisningstid. [Gymnasieförordningen 4 kap. 12 §](https://data.riksdagen.se/dokument/sfs-2010-2039.html).

Produkten kan kontrollera den numeriska totalen men har ingen APL-placering eller närvaromodell. Beslut kräver därför uttrycklig manuell bekräftelse av APL-omfattning och att motsvarande tid ingår en gång i timplanen. Ingen automatisk tilläggstid läggs ovanpå inmatad total. Behörighetsnivåerna kontrolleras i fryst underlag och bekräftas manuellt; detta bevisar inte en enskild elevs högskolebehörighet.

## Framtida yrkesprov

Beslutade ändringar träder i kraft 2 juli 2028 och tillämpas första gången när första året påbörjas höstterminen 2028. Yrkesprov omfattar 100 poäng; gymnasiearbete används om yrkesprov saknas. Äldre utbildningar har övergångsbestämmelser. [Skolverkets redovisning av SFS 2026:1243](https://www.skolverket.se/forandringar-inom-skolomradet/en-skola-i-forandring/aktuella-regelandringar).

Nuvarande modell har alltid `meta:diplomaWork` och saknar uppgift om tillämpligt yrkesprov. Yrkesstarter från 2028-07-02 blockeras därför inför beslut med konkret förklaring, medan planering och poängram behålls. Detta är en produktbegränsning, inte ett förbud mot utbildningen. Högskoleförberedande profil ändras inte av denna yrkesavgränsning.

## Verifierad kodinventering och kontrakt

`web/lib/programplan-catalog.generated.json` innehåller samtliga tolv koder och behörighetsnivåerna i foundation. `subject.points` är ibland 100 trots nivåsumma 200/300; befintlig nivåsummering ska bevaras. Svenska/SVA är alternativa ämnen och motsvarande nivå räknas en gång, totalt 300 poäng. Inga syntetiska nivåer injiceras i fryst underlag. Exakta kataloghashar, giltighetsdatum, referensversioner, kanoniska rader och terminsfördelning kontrolleras fortsatt.

Manuella check-ID `eligibility` och `apl` kompletterar befintliga kontroller för båda plantyperna. Skolans utbudspaket och individuella bortval är separata flöden. Kommentar och återsändning före fastställande behåller befintlig oföränderlig historik och mandatkontroll.
