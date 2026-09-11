# Första granskningen av SchoolSoft Testskolan och Plan Digital

Datum: 4 september 2026. Underlag: läsande granskning av användarens redan inloggade Chrome-session. Detta är en verifierad första inventering av huvudmenyer och utvalda centrala flöden, inte en fullständig dokumentation av produkterna.

## Avgränsning och bevisnivå

- SchoolSofts sidhuvud visade **TESTSKOLA** före granskningen och vid senare navigering. Ingen annan SchoolSoft-skola öppnades. Den aktiva rollen var Skolledare, med tillgång till Admin och undervisningsfunktioner.
- Plan Digital öppnades från AcadeMedias portal. Portalen visade 19 skolval med roller Rektor eller Administratör. Granskningen fortsatte i LBS Kreativa Gymnasiet Borås med rektorsroll. Ingen ytterligare inloggning krävdes. Portalversion: 2.7. Skolmiljöns version: 11.4.4. Vald läsårsperiod: 26/27.
- Inga skoldata, inställningar eller formulärfält ändrades. Inga dokument skapades, meddelanden skickades, exporter hämtades eller scheman publicerades. Tomma skapandeformulär i SchoolSoft lästes och lämnades med Avbryt.
- Rapporten innehåller inte elevakter, personalnamn, löner eller individuella tjänsteuppgifter. Plan Digitals personlistor och individuella tjänstevyer ingår inte i dokumentationen.
- **Meny verifierad** betyder att funktionen fanns som synligt menyval. **Vy/formulär granskat** betyder att relevanta fält och instruktioner lästes. Ingendera betyder att sparande, beräkningar eller fullständiga arbetsflöden har testats.
- Royal Schedule är användarens huvudreferens för schema. Google Classrooms funktioner och en egen provplattform med låst provläge ingår i målbilden, men deras externa produktgranskning ligger utanför detta dokument.
- Överordnat produktmål: minska administration och säkerställa regelefterlevnad. Observerade kontroller nedan ska vara underlag till krav; de bevisar inte att en produkt eller verksamhet uppfyller alla rättsliga krav.

## SchoolSoft: verifierad menyinventering

Fyra huvudområden var synliga: **Startsida, Närvaro, Admin, Skolledare**. Menyerna har sökfält. Sidhuvudet visar skola, aktuell roll och tid till automatisk utloggning. Den fullständiga roll- och behörighetsmodellen granskades inte.

### Startsida

| Menygrupp | Observerade funktioner |
|---|---|
| Aktuellt | Skolinfo, Nyheter, Schema & Kalender, Bokningar, Meddelanden, Mina filer |
| Schema | Alla scheman |
| Pedagogiskt stöd | Ämnen, Forum, Provschema (Genväg) |
| Bedömning | Sammantagen bedömning (NY) |
| Ny betygsättning | Betyg |
| Grupper | Undervisningsgrupper, Fria grupper, Personal, Klasslistor |
| Elevdokument | Rapport Elevavstämning (GY11), Rapport Elevavstämning (GY25), Lämna omdöme |
| Kurs | Betygsatta kurser, Nationella kursprov, Elevavstämning (GY11) |
| Elevavstämning (GY25) | Elevavstämning (GY25) |
| Filer & länkar | Alla filer & länkar |
| Äldre funktioner | Planeringsverktyg, Uppgifter, Sammantagen bedömning |

### Närvaro

| Menygrupp | Observerade funktioner |
|---|---|
| Frånvaroanmälan | Alla elever, Visa anmälningar |
| Skolrapporter | Rapporteringsnivå, Närvaro, Närvaro – Dagar, Undervisning, Närvaro per skola |
| Elevrapporter | Närvaro – Vecka, Närvaro – Orsak, Närvaro – Ämne, Närvaro – Procent, Närvaro – Dagar, Oanmäld frånvaro |

### Admin

| Menygrupp | Observerade funktioner |
|---|---|
| Underhåll | Fria grupper, Undervisningsgrupper, Grupper, Elev-Grupper, Scheman, Ämnen, Salar & Utrustning, Perioder, Personal, Elever, Elevkort, Elevkort för inaktiva elever, Vårdnadshavare, Importera schema |
| Information | Forum, Skolkalender, Publicerade nyheter, Skolinformation, Filer & länkar, Färgmarkering |
| Elevdokument | Frågor, Formulär, Mallar, Rapport, Mentorssamtal |
| Enkäter | Frågor, Formulär, Enkäter, Kursutvärderingar, Rapport |
| Administration | Kommuner, Kommunrapporter, Elevfilter, Elevrapporter, Rapportbeställning, Avstämningsperiod, Dokumentmallar, Elevrapportering CSN |
| Grundskolebetyg | Betygsämnen, Betygsgrupper, Betygsättningslistor, Betygsperiod, Nationella prov, Betygsöversikt, Betygskataloger, Betyg, Rapporter, Betygsändringar, Tidigare skolformer |
| Kurs | Betygsperiod, Avstämningsperiod, Nationella kursprov |
| Kurs (GY11) | Sammantagen bedömning, Kurser, Program, Studieplaner, Kurs – Elev, Betygskataloger, Betyg, Skapa betygsdokument, Rapporter, Betygsändringar |
| GY25 | Studiehantering (BETA) |
| Alternativ | Skola, Systeminställningar, Användarinställningar, Fälttyper, Bilduppladdning |
| System | Filuppladdning |
| Export/Import | Fria grupper, Undervisningsgrupper, Lektioner, Ämnen, Sal, Perioder, Personal, Elever, Elever Admin, Fakturamottagare, Korthantering, Grundskolebetyg, Program/Studieplaner, Kurser |

Admin-startsidan hade även sektionerna Information, Systembehörighet och Behörighetsgrupper samt länk till Externt schema. Behörigheternas detaljer öppnades inte.

### Skolledare

| Menygrupp | Observerade funktioner |
|---|---|
| Närvaro | Garanterad undervisningstid |
| Elevkort | Elevkort, Elevkort för inaktiva elever |
| Elevdokument | Enkäter, Elevdokument rapporter |
| Kurser | Kursvarningar, Elevavstämning (GY11), Rapport elevavstämning (GY11), Sammantagen bedömning (GY11), Rapporter (GY11) |
| Ämnesnivåer | Elevavstämning (GY25), Rapport elevavstämning (GY25) |

Skolledarens startsida visade skolinformation och leverantörsinformation. En aktuell leverantörstext beskrev inställningar för skolans insatser i sammantagen bedömning: individuell lärarkommentar samt publicering till elev och vårdnadshavare. Detta är läst produktinformation i miljön; inställningarnas faktiska beteende har inte verifierats.

## SchoolSoft: granskade flöden och fält

### Schemaöversikt och lektionsskapande

Granskad navigering: Admin → Underhåll → Scheman → Skapa lektion. Det motsvarar fyra navigeringsval från ett annat huvudområde, eller två val om Admin och Underhåll redan är öppna. Antalet är navigering till formuläret, inte en uppmätt tidsbesparing eller ett genomfört skapande.

Schemaöversikten kan filtreras på klass, undervisningsgrupp, personal, sal, utrustning och ämne. Klass gäller schemavisningen; ämnesfiltret gäller lektioner. Det finns val att inkludera lektioner utanför schemadagar, separata knappar för Visa schema och Visa lektioner, rapport över schemalagda lektioner, anteckningsfält samt utskriftsalternativ för klasser, undervisningsgrupper, personal, salar och utrustning.

Lektionsformuläret visade följande:

| Del | Fält/val |
|---|---|
| Grunduppgifter | Dag, ämne, starttid i hh:mm, längd i minuter |
| Resurser | Personal, grupp, sal, utrustning, period; flera av dessa visades som flervalsfält |
| Utökade alternativ | Ej i period, veckor, ej i veckor, visas ej i klasscheman |
| Åtgärder | Spara, Avbryt, Spara och kopiera |

Ingen konfliktkontroll, automatisk optimering eller regelkontroll provades eftersom formuläret inte fylldes i eller sparades. Någon sådan funktion ska därför varken tillskrivas eller uteslutas på grund av denna genomgång.

### Schemaimport

Granskad navigering: Admin → Underhåll → Importera schema.

Den synliga processen består uttryckligen av två steg:

1. Ladda upp schemafil från Novaschem eller Skola24 Schema och bifoga filen.
2. Publicera schema i SchoolSoft med en separat knapp.

UI anger Novaschem som textformat med filändelsen `.nst`, och Skola24 Schema i Procapita-format med filändelsen `.txt`. Det finns instruktion att använda samma schemasystem under läsåret, uppgifter om senaste import och publicering, informationsfält, möjlighet att ladda ned schemafil samt manualer för Skola24-import och integration. Inga av dessa överförings- eller publiceringsåtgärder utfördes.

**Verifierad administrationspunkt:** filöverföring och publicering är separata synliga moment. Det är ännu inte verifierat om skolan även har en automatiserad integrationsväg. Royal Schedule nämndes inte i denna SchoolSoft-vy.

### Frånvaroanmälan

Vy/formulär granskat utan val av elev eller registrering. Det finns separata avsnitt för hel dag och del av dag. Hel dag har elevsökning, elevval och vecka. Del av dag har även veckodag. Båda har Visa frånvaroanmälningar.

UI anger olika tidsgränser: hel dag kan anmälas för idag och framåt; lektionsfrånvaro för gårdagen, idag och framåt. Detta är lästa instruktioner, inte testade spärrar. En produkt som återanvänder samma uppgift till EWS och frånvaroutredning behöver bevara frånvarons källa, typ och tidpunkt samt skilja anmälan från konstaterad frånvaro.

### Elevdokument och mallar

Granskad navigering: Admin → Elevdokument → Mallar → Skapa mall. Mallistan visade befintliga mallar och ändringslänkar. Ett tomt skapandeformulär lästes och avbröts.

Grundfält: **Namn, Beskrivning, Information till användarna, Typ**. Typfältet visade Mentorssamtal; alla alternativa dokumenttyper i fältet inventerades inte.

Roll-/arbetsflikar: **Allmänt, Lärare, Mentor, Elev, Vårdnadshavare, Uppföljning**. Flikarnas inre fält granskades inte.

Observerade allmänna inställningar:

- Visa elevomdöme, vårdnadshavaromdöme respektive gamla omdömen för ämneslärare.
- Skriva ut elevomdöme tillsammans med ämnesomdöme.
- Låsa elevens eget omdöme efter utsatt datum.
- Flytta dokument med elev.
- Tillåta systemmeddelanden vid ändring till valda mottagare.
- Separata meddelandetexter till ämneslärare, elever och vårdnadshavare.

Detta är stöd för rollbaserat dokumentarbete, synlighet och uppföljning. Det visar inte att SchoolSoft här har färdiga, rättsligt kompletta flöden för alla utredningstyper, delegationsbeslut, diarieföring, överklagande eller sekretessprövning. Sådana slutsatser kräver fortsatt granskning.

### Uppgifter, resultat och prov

Granskad vy: Startsida → Äldre funktioner → Uppgifter. Vyn hade inga uppgiftsrader i det aktuella urvalet.

Synliga delar: Uppgifter, Resultatrapport per grupp, Resultatrapport per elev, läsårsval, användningsfilter för kommande/tidigare/alla/utan tillfälle/används ej och Mina arkiverade resultat.

Tabellfält: Vecka, Startdatum, Slutdatum, Lektion, Pärm, Namn, Kurser, Ansvarig, Grupp/Elev, Typ, Kriterium, Omdöme, Resultat och Publ. Kolumnfilter samt Skriv ut och Exportera fanns. Ingen utskrift eller export utfördes.

Provschema finns som genväg under Pedagogiskt stöd. Nationella prov/nationella kursprov finns som menyval i betygsområden. Ingen provstart, frågekonstruktion, låst webbläsare, enhetslåsning, provvakt eller tillgänglighetsinställning har verifierats. Menyn Uppgifter är inte belägg för en låst provplattform.


Detta utdrag återger tidigare observationer, inte en ny granskning den 5 september. Original: projektets underlag 04.
