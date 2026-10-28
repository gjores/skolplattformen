# Flera lärare på samma kurs eller ämne: regler, former och förslag

**Status:** Research och förslag 2026-10-28, efter användarprovet. Matrisen visar Religionskunskap – Nivå 1 med behov 48 h, fördelat 96 h och avvikelse +48 h, eftersom två lärare har var sin rad på 48 h. Inget är beslutat eller byggt. Underlaget hör ihop med todo [flerlärarskap](../todos/pending/2026-10-26-flerlararskap-i-tjanstefordelning.md), D-28 (en lärare per samläsning) och fas 05.4 (behörighet).

## Vad lagen säger (skollagen 2010:800, gällande lydelse enligt riksdagen.se, läst 2026-10-28)

- **2 kap. 13 §:** bara den som har lärarlegitimation och är behörig för viss undervisning får bedriva den undervisningen. Kravet gäller **varje lärare som bedriver undervisningen**, alltså båda när två delar en kurs.
- **2 kap. 18–19 §§:** saknas behörig lärare inom huvudmannens organisation, eller finns särskilda skäl, får en annan lämplig person undervisa i högst ett år i taget. Om personen ska undervisa längre än sex månader ska huvudmannen först fatta ett beslut om det. Undantag finns, bland annat för vissa yrkesämnen.
- **3 kap. 16 §:** betyg beslutas av **den eller de lärare som bedriver undervisningen när betyg ska sättas**. En lärare utan legitimation beslutar tillsammans med en legitimerad lärare. Kan de inte enas beslutar den legitimerade läraren om hen är behörig i ämnet, annars rektorn. Regeringen meddelar närmare föreskrifter när **flera lärare** bedriver undervisningen.
- **3 kap. 20 §:** har flera fattat betygsbeslutet och kan de inte enas om en ändring, ändrar rektorn betyget. Detsamma gäller om någon av dem är förhindrad.
- **Gymnasieskolan (Gy25):** betyg sätts på ämne och nivå. Den lärare som undervisar när betyget sätts beslutar. Vid delning i följd, till exempel HT och VT, behöver underlaget lämnas över.

**Ej verifierat här:** de närmare föreskrifterna för flera lärare (gymnasieförordningen och Skolverkets föreskrifter), arbetstidsavtalens regler om hur samtidig undervisning räknas i tjänsten och lokala kollektivavtal. Det ska stämmas av med HR/juridik (jämför D-20) innan något påstås i appen.

## Sätt som lärare delar en kurs på

| Form | Exempel | Elevens undervisningstid (behovet) | Lärarnas tid | Betyg |
| --- | --- | --- | --- | --- |
| **A. I följd** | A undervisar HT, B undervisar VT. Eller A tar momenten 1–3 och B moment 4 | Summan av lärarnas tid ska motsvara behovet (24 + 24 = 48) | Var och en har sin del | Den som undervisar när betyget sätts; underlaget lämnas över |
| **B. Samtidigt (tvålärarskap)** | Båda i klassrummet samtidigt hela kursen | Behovet räknas **en gång**: 48 h täcks av gruppens tid | Var och en har **hela** tiden i sin tjänst (48 + 48) | Båda bedriver undervisningen och beslutar gemensamt. Vid oenighet avgör regeln i 3 kap. 16 § |
| **C. Delad grupp** | Klassen delas i två grupper, en lärare per grupp, parallellt | Varje elev får 48 h. Behovet gäller per grupp | Var och en har 48 h | Varje lärare för sin grupp |
| **D. Stöd** | Speciallärare eller resurslärare i en del av lektionerna | Påverkar inte täckningen | Stödtid, inte kursundervisning | Ingen betygsrätt i kursen genom stödet |

Det skärmbilden visar (48 + 48 mot behovet 48) är **B eller C** om det är avsiktligt, och **ett misstag** om det var tänkt som A. Appen kan inte veta vilket. Därför ska rektor tala om hur lärarna delar.

## Vad som behöver säkerställas

1. **Behörighet för varje lärare** som bedriver undervisningen (2 kap. 13 §). Fram till fas 05.4 visas *Behörighetsunderlag saknas*, och ett okänt underlag får aldrig visas som obehörigt.
2. **Undantag med obehörig lärare** (2 kap. 18–19 §§) kräver ett huvudmannabeslut om det gäller mer än sex månader. Det är ett beslut utanför tjänstefördelningen, men det kan behöva synas eller länkas senare.
3. **Betygsansvar:** vem eller vilka som sätter betyget, och att minst en är legitimerad och behörig (3 kap. 16 §). Vid form A är det läraren vid betygstillfället; vid B båda.
4. **Elevens tid räknas rätt:** behovet täcks en gång vid B och per grupp vid C. Lärarnas tid räknas per lärare, så att tjänsten blir rätt (D-10: summor, ingen kapacitetsjämförelse).
5. **Schemaläggning (05.2):** B kräver samma tid och sal för båda, C kräver två grupper och två salar, och A kräver olika perioder.
6. **SS 12000:** en aktivitet med flera lärartilldelningar, med egen tid och egna datum per lärare, och elevgrupper vid C. Mappningen ska verifieras mot aktuell specifikation; en intern modell bevisar inte stöd.

## Förslag till hantering (rent och enkelt i UI)

**Princip:** samma rad i matrisen, men raden får en **delningsform** när den har fler än en lärare. Appen frågar en gång, när den andra läraren läggs till, och räknar sedan rätt.

- **När en andra lärare väljs** på ett behov som redan är täckt visar dialogen frågan *Hur delar lärarna kursen?* med tre val i klartext:
  1. *En i taget (till exempel HT och VT)*. Tiden delas och summan ska bli behovet.
  2. *Samtidigt i samma grupp (tvålärarskap)*. Båda får hela tiden, och behovet räknas en gång.
  3. *Klassen delas i två grupper*. Varje lärare har en egen grupp, och behovet gäller per grupp.

  Stöd (D) hänvisas till Specialuppdrag.
- **Matrisen** visar ett märke på raden: *Två lärare · samtidigt*, *Två lärare · HT/VT* eller *Två grupper*. Avvikelsen räknas efter formen. Vid B och C är det alltså inte +48 h. Fördelat visar elevens täckning, och lärarkolumnerna visar varje lärares tid.
- **Betyg:** ett fält *Sätter betyg* med lärarna förvalda enligt formen (A: läraren i sista perioden; B: båda; C: var och en för sin grupp). Rektor kan ändra det. Okänd behörighet visas som en upplysning, inte som ett hinder.
- **Fördela och Massregistrera** visar *Har redan tid på behovet* och erbjuder *Lägg till som andra lärare…*, som leder till samma fråga.
- **Om formen saknas** behandlas en dubbel täckning som nu, som en avvikelse med texten *Två lärare utan angiven delning*. Den blir ett publiceringshinder som rektor löser uttryckligen, på samma sätt som D-28 hanterar blandade samläsningar.

## Beslut som behövs innan planering

1. Vilka former ska stödjas först? Förslag: A och B nu, C tillsammans med undervisningsgrupper för valbara kurser (todo), D via Specialuppdrag.
2. Ska *Sätter betyg* registreras i tjänstefördelningen, eller ligga i en senare betygs- eller schemadel?
3. Ska en dubbel täckning utan delningsform vara ett publiceringshinder eller bara en varning?
4. HR/juridik: hur räknas tvålärarskap i lärarens tjänst enligt gällande avtal (D-20)?
