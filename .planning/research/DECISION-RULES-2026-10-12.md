# Beslutsregler för programplan och gymnasietimplan

Granskat 2026-10-12 mot aktuell kod och primärkällor. Detta är implementeringsunderlag för användarens beställning att slutföra beslutskedjan, inte bevis för genomförd implementation eller juridisk fullständighetskontroll.

## Avgörande fynd

- `analyseProgramplan().ready` räcker inte som beslutskontroll. Yrkesprogrammets okända poängsumma ger endast information och kan lämna `ready=true`. Beslut kräver en uttryckligen stödd regelprofil och fastställd totalsumma.
- `resolveProgramplanBasis()` returnerar alltid `decisionReady:false` och `program_rules_unverified`. Det är en avsiktlig gräns i katalogupplösningen. Inför separat beslutsanalys; ändra inte katalogupplösning till generell beslutsgaranti.
- `web/lib/server/gym-timplan.ts:projectSource` är befintligt mönster: verifiera hela frysta katalogen, upplös exakta referenser, jämför härledda rader, kontrollera terminsfördelning, aktuell blockmodell och `analysis.missing`. Den nekar redan okänd programtotal.
- Paket är borttagna ur programplansflödet enligt senare användarbeslut i 05-23-CONTEXT. Återinför inte paketval som villkor för fastställande. Valblockets ram är en del av programplanen; skolutbud och elevens val är separata kontroller.
- Gymnasietimplanens källsnapshot kan innehålla programplanens **utkaststatus**. Ett senare programbeslut får inte göra oförändrat timplansarbete oanvändbart enbart genom ändrad status/revision. Bevisa innehållslikhet mot beslutad källversion, eller erbjud uttrycklig uppdatering som bevarar jämförbara timmar. Acceptera aldrig tyst senaste innehåll.

## Verifierad nationell grund

Högskoleförberedande program omfattar 2 500 poäng; individuellt val 200 och gymnasiearbete 100. BF, HT och VO omfattar 2 700; övriga nationella yrkesprogram 2 800. Garanterad tid är 2 180 timmar för högskoleförberedande program och 2 625 respektive 2 720 för yrkesprogram. En timme avser 60 minuter. Detta gäller utbildningens omfattning, inte att en tabell visar faktiskt genomförd undervisning. [Skollagen 16 kap. 18–20 §§ och bilaga 2](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skollag-2010800_sfs-2010-800/).

Huvudmannen beslutar undervisningstid per ämnesnivå och för gymnasiearbetet samt fördelning över läsåren. Svenska/SvA är alternativa ämnen; individens byte kan ske efter avslutad nivå. Yrkesprogrammens behörighetsnivåer ska ingå i utbildningen, även om en elev senare får välja bort vissa. BF/VO:s Svenska/SvA nivå 2 och HT:s Engelska nivå 2 får inte väljas bort. Språkutbud, elevens individuella val och förbudet mot jämförbara/alternativa/överlappande nivåer är ytterligare regler som en poängram inte ensam verifierar. [Gymnasieförordningen 4 kap. 7–12 och 22–24 §§](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/gymnasieforordning-20102039_sfs-2010-2039/).

Gymnasiet har ingen nationell minimitid per enskilt ämne. Det finns därför ingen allmän poäng-till-timmar-faktor som får ersätta huvudmannens fördelning. [Skolverkets rapport 2026, sidan 9](https://www.skolverket.se/download/18.7c07b08019d24db18e32ed89/1775649242024/pdf13399.pdf).

Gymnasiearbetet läggs lämpligen mot slutet av utbildningen, men detta stöder en planeringsrisk, inte ett absolut förbud mot tidigare placering. [Skolverket: Gymnasiearbetet](https://www.skolverket.se/undervisning/gymnasieskolan/program-och-amnen-i-gymnasieskolan/gymnasiearbetet).

Högre ämnesnivåer bygger vidare på lägre. Katalogsnapshoten saknar dock fullständig föreskriftsbunden förkunskapsmodell. [Skolverkets stöd för studie- och yrkesvägledare](https://www.skolverket.se/styrning-och-ansvar/forandringar-inom-skolomradet/gy25----amnesbetyg-pa-gymnasial-niva/for-dig-som-ar-studie--och-yrkesvagledare-gy25/studie--och-yrkesvagledare-i-gymnasieskola-och-anpassad-gymnasieskola).

## Minimal programplansmodell för beslut

Beräkna på serverns sparade revision, med låsta relevanta rader och verifierat verkligt mandat. Beslutsbegäran får innehålla identitet/revision/kommando, inte en klientlevererad grön analys.

1. Plan och utbildning är aktiva, hör ihop och har rätt huvudman. Programplanen är utkast. Startdatum och korrekt elevkull finns.
2. Katalogens hash, exakta program-/ämnesversioner, Gy25-regim, gymnasieskolform och giltighet vid utbildningsstart verifieras. Saknad historisk version blockerar; slå inte upp aktuell katalog som ersättning.
3. Säker första regelprofil: kategori `PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION` med stödd nationell programkod. Yrkes- och riksrekryterande program får tydligt eget blockeringsskäl tills deras regler är implementerade/verifierade.
4. Vald inriktning, aktuella alternativa rader och nödvändiga block finns. Svenska/SvA räknas en gång per nivå, inte dubbelt och inte som bortval. Nationella block MOSP/SPRK/NAVE har exakt den frysta strukturens poäng. Individuellt val summerar till 200.
5. Fasta rader + fördjupningsnivåer + block + gymnasiearbete summerar exakt till 2 500. Fördjupningen fyller dess beräknade ram; inga dubbletter eller otillåtna nivåer. Gymnasiearbete är en rad på 100 poäng.
6. Varje rad är helt fördelad över sex terminer. Inga extra/dubbla radnycklar, negativa tal eller överfördelningar. Högre nivå före lägre nivå är fel enligt användarbeslut 05-23 D-13; terminsöverlapp är risk, inte automatiskt fel. Behåll samma behandling för Svenska/SvA-alternativ.
7. Visa resterande mänskliga kontroller öppet: jämförbara/överlappande ämnesnivåer, fullständig studiegång, skolans språk-/valutbud och senare elevval. Använd inte formuleringen att hela regelverket är automatiskt verifierat. En uttrycklig granskningsbekräftelse kan sparas i beslutskvittot; den får inte åsidosätta maskinellt upptäckta fel.

Terminsbalans och gymnasiearbete före åk 3 förblir risker. Saknad start eller strukturellt ofullständigt underlag är beslutshinder. Valpaket ska inte behöva återinföras.

## Minimal gymnasietimplansmodell för beslut

1. Rätt skola, utbildning, mandat och sparad revision. Förberedande utkast får fortsatt skapas från komplett sparad programplan; formellt timplansbeslut kräver beslutad programplanskälla.
2. Kontrollera frysta källans katalog, rader och poängterminer med samma programregler. Den beslutade källans **innehåll** ska motsvara snapshoten. Ändrad programplanspoäng/termin/block innebär att ny eller uttryckligen uppdaterad timplansversion behövs.
3. Varje kanonisk timplansrad har exakt sex giltiga timvärden; okända/dubbla rader räknas inte. `null` betyder ej färdigt, aldrig noll. Krav på komplett matris/positiv radtid är systemets fullständighetsregel, inte en påstådd nationell minimitid per ämne. Terminer där poäng saknas får inte skapa oavsiktlig dubbelräkning.
4. Summera en elevs gemensamma ram: Svenska/SvA en gång, varje valblock en gång, gymnasiearbete en gång. Ett valblock är ram för ett alternativ, inte summan av alla möjliga alternativ.
5. Högskoleförberedande profil kräver minst 2 180 **planerade undervisningstimmar om 60 minuter**. Gymnasiearbetets lärarledda undervisning kan ingå enligt huvudmannens timfördelning; 100 poäng innebär aldrig automatiskt 100 undervisningstimmar. Självständigt arbete/mentor-/annan aktivitet får inte maskeras som undervisning.
6. Visa att planerad tid inte bevisar genomförd tid eller varje elevs utfall. En miniminivå med liten marginal kan ge lokal risk, inte högre lagstadgat minimum.
7. Rektor färdigmarkerar, huvudman fastställer eller återsänder med begriplig motivering. Sparade timmar låses vid inskickat förslag/fastställande. Återsändning öppnar bearbetning; ändrad revision kräver nytt beslut. Ny fastställd version flyttar aldrig automatiskt äldre klasskopplingar.

## Bevara gränser och verifiera luckor

- **Yrkesprogram:** 05-17 är verklig lucka, inte bara ordval. Poängsumma, behörighetsnivåer, undervisningstid, APL och kommande yrkesprov har egna regler. Full nationell yrkesprofil får inte ersättas med 2 500/2 180 eller historiska 2 430. Bortval hör till individens studieplan.
- **GR/IM:** `analyseTimplan` har egna frysta profiler och obligatoriska kontrollpunkter. Koppla inte gymnasiets programplanskrav eller totalgräns till dessa. IM:s gemensamma veckoram är inte rektors beslut om varje elevs individuella innehåll.
- **Beslut är versionsbundet:** spara aktör, mandat, tidpunkt, från-/tillstatus, planrevision, regelversion, källversion/innehållsidentitet och eventuell granskningsbekräftelse. Atomär audit och idempotens krävs. Gammal flik, parallell ändring eller återspelat kommando får inte besluta annat innehåll.
- **Regression:** halvfärdiga utkast ska fortfarande kunna sparas; fastställda planer förbli låsta; ny version och nästa kull vara explicita; nya beslut inte ändra gamla klasskopplingar.
- **Viktiga prov:** Svenska/SvA 300, IV 2×100, fördjupningsblock, 2 499/2 501 poäng, saknad rad/term, fel nivåordning kontra överlapp, 2 179/2 180 timmar, dubbelräknat alternativ, noll/null, källa utkast→fastställd utan innehållsbyte, ändrad källa, rektor på annan skola, administratör utan beslutsmandat, dubbla beslut, återsändning och ändring, ny version med äldre klasskoppling.

Inga produktfiler, databasposter eller Git-åtgärder ändrades av denna granskning.
