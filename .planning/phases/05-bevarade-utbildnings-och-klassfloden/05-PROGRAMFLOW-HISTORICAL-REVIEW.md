# Programflödet — historisk jämförelse och användarbeslut 2026-10-02

Användaren underkänner även 05-14:s översikt: delen fungerade i tidigare UI men är nu rörig och osammanhängande. Önskat flöde är **program → inriktning → programfördjupning**. På frågan om nytt eller befintligt svarar användaren: ”borde vara samma ui för båda grejerna tänker jag?” Detta är ett beslut om gemensamt arbetsflöde, inte om nya rektorsmandat eller att äldre sparningar ska återöppnas.

## Verifierat i Git och bevarad frontend

Git-baslinjen `917313b` (`fas1-baslinje`) innehåller `web/app/organisation-workspace.tsx` med utbildningsformuläret: program ur `listPrograms()`, därefter programmets egna inriktningar, lokalt namn/kod och kull. Byte av program byter också inriktningsurval. Befintlig programplansvy använder en kompakt utbildningskatalog i sidan och en sammanhängande ämnestabell i huvudytan. Tabellen grupperar programgrund, inriktning, fördjupning, individuellt val och gymnasiearbete. Fördjupningens tillåtna nivåer visas grupperade per ämne med direkt kryssval. Sparade val syns i samma sammanhang som de gemensamma ämnena.

`organisation-model.ts:addOffering` tillåter endast huvudman att definiera nya utbildningar. Rektor och huvudman får forma programplansutkast. Den skyddade lösningen ska bevara denna skillnad med gemensam presentation. Rektor får inte automatiskt rätt att skapa utbildningar genom återanvändning av formuläret.

Det äldre flödet är visuellt provat i bevarat `example`-läge på lokal5191 utan databas, verkliga uppgifter eller sparade ändringar. Två stabila bilder finns lokalt under ignorerad `web/outputs/phase5-programflow-comparison/`. Detta är jämförelse av den bevarade frontendvyn, inte historisk serververifiering. Gitkällan är den historiska bevispunkten. Nuvarande exempelvys demoavskiljning infördes senare i `eead387`; affärsvyns program-/inriktnings- och fördjupningslayout är bevarad.

## Vad som ska återanvändas

Ett sammanhängande arbetsblad med programval, därefter inriktningsval och skolans utbildning/elevkull. Befintligt öppnar exakt vald lagrad utbildning och dess aktuella plan; nytt använder samma ämnes-/fördjupningskomponent. Program/inriktning är låsta grunduppgifter efter att en befintlig utbildning öppnats; UI-val ska aldrig skriva om en äldre utbildnings identitet. Nya utbildningar och första programplansutkast ska kunna sparas av huvudmannen som ett faktiskt skyddat kommando, inte frontendminne.

Ämnesblock och fördjupningsväljare kommer först. Stora sexkortskartor, upprepade introduktioner och utspridda hjälpregionaler ersätts med kompakt struktur; förklaringar, tekniskt underlag och historik är sekundära. Valen kan förberedas i arbetsbladet med explicit granskning/sparning och varning för osparat. Behåll versionsbunden källa, exakta nivåreferenser, verkliga mandat, MFA, revision, audit och hantering av tappat svar.

## Vad historiken inte bevisar

Frontendens hårdkodade 2 500-poängram, automatiska fullständighetsbesked, direkta Supabase/autosparningar och klientroll ger inga aktuella skydds- eller regelbevis. Dessa återinförs inte. Nationella alternativ/ramar och fastställande är fortsatt öppna. Individuellt elevval, paket över flera programplaner, grupper/schema och kopiering till ny kull är skilda från att skapa en ny tom utbildning med första utkast. Pakettodon från2026-10-02 kvarstår.

## Verifieringsmål

Samma program-/inriktnings- och ämneskomponent används för nytt och befintligt. Programbyte rensar oförenlig inriktning/val med uttryckligt osparat skydd. Program utan inriktning fungerar. Huvudmannen kan skapa utbildning och första utkast atomiskt, läsa tillbaka dem och fortsätta i samma yta. Rektor kan arbeta med befintlig plan men nekas nytt kommando även vid direktanrop. Prov måste omfatta äkta SQL/API, auditfel/rollback, kund-/skolgräns, duplicerat/tappat kommando och dator/telefon. Mänsklig begriplighet registreras först efter nytt prov; 05-14:s tidigare automatiska PASS är historik och innebär inget användargodkännande.
