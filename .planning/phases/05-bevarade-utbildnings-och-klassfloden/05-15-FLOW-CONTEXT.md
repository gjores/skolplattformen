# Program → inriktning → programfördjupning

Datum: 2026-10-02. Status: användarbeställd rättning; tidigare mänskligt begriplighetsprov är underkänt. ADMIN-02 och fas 5 är öppna.

Användaren: ”Den här delen funkade jättebra i förra UI:t nu är det rörigt och osammanhängande. Jag vill att man väljer program, sen inriktning och sen fyller på med programfördjupning. Kolla upp hur det såg när vi bara hade en frontend lösning.” Svaret på om nya och befintliga utbildningar ska hanteras: ”borde vara samma ui för båda grejerna tänker jag?”

Detta ersätter 05-13/14:s presentationsval som riktning för nästa rättning. Den senaste sexkortskartan är inte ett mänskligt godkänt arbetsflöde. Historisk referens är `fas1-baslinje` / `917313b`, `web/app/organisation-workspace.tsx`: program och inriktning vid utbildningsskapande, därefter sammanhållen plan med ämnesgrupperade fördjupningsval. Root dokumenterar separat historisk läsning/bilder; användbarhetsmönstret kan återanvändas men dess direkta datalager, gissade poängram, automatiska alternativ och fastställande får inte flyttas till skyddat läge.

## Beslut som genomförs

1. En gemensam valvy för nytt och befintligt: **Program → Inriktning → Programfördjupning**. För befintligt filtreras riktiga utbildningar och vald skola/kull; exakt utbildnings-ID öppnas. Öppnade program-/inriktningsgrunduppgifter är därefter fasta fakta. Ett byte väljer en annan utbildning; det skriver aldrig om en bunden plan.
2. Ny utbildning/kull och första programplansutkast måste kunna sparas i en atomisk server-/DB-åtgärd. Den historiska ansvarsfördelningen bevaras: `addOffering` låter bara huvudmannen definiera utbildningar. Rektor arbetar med programplaner i befintliga utbildningar inom sitt aktuella skolmandat. Samma komponent innebär inte nya rättigheter.
3. Programfördjupning visas direkt som ämnesgrupperade nivåval i en sammanhållen arbetsyta. Val ligger i formuläret tills uttrycklig granskning/sparning; inga autosparningar. Kort begreppshjälp och tekniskt underlag är sekundära. Sex stora introduktionskort ersätts i arbetsflödet av kompakta faktiska ämnesblock och en tydlig fördjupningsdel.
4. Exakt katalog/programversion/inriktning/startdatum och ordnade ämnesnivåreferenser följer alla steg. Läsning bygger på verifierad lagrad helkatalog på servern, begränsad projektion på klienten. Ingen dold ”senaste katalog”, gissat startdatum eller tillåtande klientbehörighet.
5. MFA, verkligt kund-/skolmandat, obligatoriska Worker-/DB-loggar, revision, osparatskydd, kontext-epoch, okända sparsvar och äldre val bevaras. Nytt skapandekommando får beständigt UUID-kvitto så att en förlorad respons kan återläsas utan dubblerad utbildning.

Skolgemensamma paket ligger i den redan beställda pending-todon och byggs inte här. Nya nationella regler, generella 2 500-poängsramar, fastställande, elevval, automatisk klasskoppling och kopiering till nästa kull levereras inte genom dessa två planer. Ett nytt mänskligt begriplighetsprov sker efter automatiska prov; inget nybygge är i sig ett godkännande.
