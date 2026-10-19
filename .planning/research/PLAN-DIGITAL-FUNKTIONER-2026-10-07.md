# Plan Digital – funktionsinventering (fördjupning)

Datum: 2026-10-07. Källa: genomgång på skärmen av LBS Kreativa Gymnasiet Stockholm Södra (läsår 26/27), bara läsning. Inget sparades, inga filer laddades ned, inga personuppgifter kopierades hit. Wikin (wiki.plandigital.se, behörighet och avtal) kräver inloggning och är inte läst. Kompletterar [PLAN-DIGITAL-ERSATTNING-2026-10-07.md](PLAN-DIGITAL-ERSATTNING-2026-10-07.md).

## Funktioner och vad Skolplattformen behöver

| Område | Vad Plan Digital gör | Konsekvens för Skolplattformen |
| --- | --- | --- |
| Läsårsklocka | Fast läsårsmodell (start aug, ht 08-01–12-20, vt 01-10–06-10). Datumen styr bara sortering och språk, inte schema. Antal veckor ht/vt är inställning per skola (17,8 + 17,8) | Veckor per termin är skoldata, inte konstant. Se `docs/plan-digital-lasarsmodell.md` |
| Tid och räknesätt (skolinställning) | Tidsenhet: timmar/termin, timmar/vecka eller minuter/vecka. Tidsintervall för kurser (15 min). Timplanens tidkontroll: exakt eller minimum. Max schemaläggningsbar tid per termin ger varning. Specialtecken i termincell räknas som noll | Besluta en enhet (timmar, 60 min). Varning vid överbelastad termin är värd att ha. Tecken-i-cell behövs sannolikt inte |
| Lärare, grupper och koder | Standardavtal för alla lärare. Signaturregler (versaler / blandat unikt). Externa uppdrag (andra skolor): ignorera, visa utan tid, visa med tid. Gruppnamnsmönster med variabler (klass, kurskod, kursnamn, sign, uppdrag, läsår, nivå, läroplan m.fl.), suffix vid dubbletter, lim för samläsning, byte av kommatecken. Manuella gruppnamn på radnivå | Gruppnamn behövs för schemat, ej för tjänstefördelningen i sig. Externa uppdrag är viktigt för lärare på flera skolor (LBS/AcadeMedia). Avtal: se nedan |
| Avtal | Lärare knyts till avtal. Budgetunderlaget kan mäta heltid mot avtal. Inga avtal är registrerade på LBS | Här hör årsarbetstid från kollektivavtal hemma. Koppla till regelprofilen (TID-02) |
| Personal | Lista med legitimationsstjärna, roll, titel, tjänstgöringsgrad, arbete och tider. Skapa lärare (förnamn, efternamn, valfritt personnummer, roll, signatur), massåtgärd. Installationen är portalbaserad: inloggade användare visas inte i listan | Personnummer är valfritt i PD. Skolplattformen bör inte lagra det (se MIGR-01). Inloggning via portal ≈ vår Auth/SSO |
| Lärarprofil | Tjänstgöring ht/vt (grad), program, chef (urval bland personal), summa utlagd tid, legitimation, tjänsterader per lärare | Chef/linje saknas i våra planer. Behövs för rektors/enhetschefs vy och för vem som godkänner |
| Behörigheter/legitimationer | Hämtas från Skolverket via personnummer. Manuell registrering per läroplan (Gy11, Lgr22, Gy25), ämne, språk. Behörighetsmarkering per rad: L, Ä, ej behörig i ämnet. Matris över alla behörigheter, personal-och-behörighetstabell | Täcks av LLEG/Skolverksintegration. Manuell registrering behövs som reserv. Gy11 släpps, Lgr22 kvar i PD |
| Kurs- och ämnesregister | Förinstallerade kurser/ämnen (Gy11, Lgr22, Gy25 m.fl.) och egna kurser (till exempel Mentor). Egen kurs kopplas till ämne | Skolverkskatalogen finns redan (05-07). Egna kurser/uppdrag måste kunna skapas |
| Program | Per program och läroplan: förkortning, poäng, originalprogram, skolenhet | Gy25 ES, TE, IM, I-val, Moderna språk |
| Timplaner | 90 st på LBS. Wizard för start år (2023–2027, "Välj ett annat år"). Nya timplaner för Gy25 med nationella inriktningar byggs från grunden, inte kopieras. Träd bas, inriktning, fördjupning (max 3 nivåer). Kopplade grupper, åk 1–3 × termin T1–T6, tid per kurs, poäng, summa, diff. Autospar per rad. Statusväljare per timplan med år-spann | Redan i fas 5. Verifiera status- och trädmodell mot vår |
| Skapa nytt läsår | Duplicerar timplaner år för år (klassnamn och år ökar, paralleller bevaras). Anpassas manuellt. Duplicering Gy11→Gy25 stoppad med hänvisning | Läsårsövergång är en egen rutin. Vår kopiering ska bevara paralleller och namn |
| Grupper | Klasser: ID, namn, startår, typ, program, antal elever, registrerad. I-val har 0 elever (elevantal kommer inte från elevregister) | Antal elever i PD är manuellt. Hos oss kommer det från elevregistret |
| Tjänstefördelning | Vyer per klass, kurs, program, ämne, lärare, specialuppdrag. Kolumner schemalagd tid, arbetstid (ht, vt, totalt), lärare, kommentar. Markera flera rader och massåtgärd. Skapa specialuppdrag, skapa uppdrag till många. Samläsning som flerklassrad. Alla samläsningar som egen vy | Se TJANST-01–06. Samläsning som relation, inte radtyp (TJANST-03) |
| "Fortsätt där du slutade" | Startsidan visar senaste tjänstefördelningsrader för användaren | Liten, bra funktion för rektor |
| Kopiera tjänstefördelning till nästa år | Per lärare: arbetstid i år, redan utlagd tid nästa år, skillnad. Grönmarkerade har tid nästa år, utgråade har slutat eller är lediga. Klick på person förlänger uppdraget | TJANST-06 Förläng. Skillnaden mellan år är ett bra analysmått |
| Tjänsteanalys | Behörighetsgrad per klass, obehöriga aktiviteter, alternativ, oanvänd kompetens, klasstrender mellan år. Egen beskrivning: "första utkast", "utdata kan inte bli bättre än indata", blandgrupper räknas som klasser | Behörighetsanalys är ett mervärde Skolplattformen kan göra bättre med verkliga klass- och elevdata |
| Personal utan tjänstefördelning | Lista över personal utan rader | Enkel kontrollvy |
| Överblickvyer | Lärarlista (staplar för arbetsmängd, anställningsvillkor, differentiering), Visitkort, Matris lärare–klass–kurs (valfria axlar, xlsx), Staplar (arbetsmängd per ämne). Färg per grupp. Alla "bara för att titta" i dag | Matrisen är den mest användbara vyn. Bra mål för en tidig vy |
| Budgetunderlag | Lärare och program. Löner: standardlön (snittlön), normalisera till standardlön. Heltidsdefinition: lärarens summa, avtal eller timmar/år. Slutrad för outnyttjad tid så alla lärare räknas som 100 % kostnad. Summeringar | Kostnad per program är viktigt för huvudman. Lön är känsliga personuppgifter: kräver mandat och spårbarhet, och bör inte vara med i första versionen |
| Myndighetsrapporter | Skolinspektionen (förteckning över undervisande personal: bara Gy11 och Lgr11/22, legitimation, specialuppdrag med ämne och elevtid). SCB Pedagogisk personal ht 2026 (skolenhetskod på skolan, årlig version) | Ska ersättas om de används av LBS/AcadeMedia. Kontrollera |
| Schemaexporter | Skola24 Schema, Royal Schedule (alla tjänsterader) | Schemat ska ligga i appen. Exporterna behövs bara under övergång |
| Timplaner som studievägar | Plan tabell: timeplan_index, kst, program, kategori, kurskod, ämne, poäng, tid, tid_apl, summor, kursnamn. 633 rader. Har APL-tid | APL-tid finns som kolumn. Kontrollera om LBS har APL (ES/TE har normalt inte) |
| Hjälp och nytt | Wiki (inloggning), supportportal, Nyheter, Blogg, Händelselogg, Nya versioner, widgets. Sök i toppen | Händelselogg finns hos oss som audit. Sökfält kan komma senare |
| Statistik | "Under utveckling": organisationsschema, legitimationer (jämför mellan program och klasser) | Ingen mognad att ta efter |

## Nya observationer som ändrar planerna

1. **Tid per lärare är inte avtalsstyrd på LBS** (inga avtal registrerade). Tjänstens "heltid" är lärarens egen summa. Det stärker TID-02: regelprofil och avtal måste vi bygga själva.
2. **PD har ingen grundläggande beräkning av lärares tid mot förordningen.** Lärarsumman visas bara. Det är en lucka vi kan fylla.
3. **Chef/linje** per lärare finns i PD men inte i våra krav. Förslag: lägg till som del av TJANST (vem godkänner).
4. **Externa uppdrag** (lärare på flera skolor) hanteras med tre lägen. Behövs i vår modell av tjänstefördelning om läraren arbetar på flera skolenheter.
5. **Personal skapas även utan inloggning** och personnummer är valfritt. Vi bör kunna skapa lärare utan personnummer från start.
6. **Gruppnamnsmönster** är en funktion för schemat. Hör till SCHEMA, inte TJANST.
7. Rapportfunktionerna i PD är begränsade till Gy11 och Lgr11/22 (Skolinspektionen). Gy25 kräver ändå nytt arbete, så det finns ingen stor merkostnad i att bygga egen rapport.
8. **Veckor per termin** är en skolinställning (17,8 ht + 17,8 vt = 35,6). Frågan om konstant är besvarad: nej.
9. **Statusen för timplaner** har åtta steg men "rektor föreslår" och "i bruk" är det enda som berör rektor/huvudman. Samma kedja används sannolikt inte på tjänstefördelningen. Okänt hur PD låser tjänstefördelning (ingen status syns). Kontrollera.

## Okänt eller ej läst

- Wiki (Behörighet, Avtal, Gruppnamn, Widgets) kräver inloggning och är inte läst.
- Radverktygens meny (•••) och dialogerna "Skapa specialuppdrag", "Skapa uppdrag till många" och "Ändra klasser" är inte öppnade för att undvika oavsiktlig ändring.
- Visitkort, Lärarlista och Staplar är lästa som beskrivningar. Diagrammen renderades inte i texten.
- Budgetunderlaget är läst till sin inställningssida, inte kört.
- Skolinspektions- och SCB-rapporterna är lästa som beskrivningar, inte körda.
- Roller och behörigheter i PD (vem får göra vad) är inte kartlagda.
- Noter och kommentarer på rader (Kommentar-kolumnen) är inte utvärderade.
