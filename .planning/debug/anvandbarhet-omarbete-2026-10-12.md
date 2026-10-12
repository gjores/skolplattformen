# Omarbetad arbetsyta 2026-10-12

## Beställning och genomförandeplan

Användarens uppföljning ”gör om så det blir bättre” beställer genomförande efter användbarhetsgenomgången. Arbetet delas i en avgränsad UI-leverans med befintliga datavägar:

1. Startvy för huvudman, rektor och administratör med uppgiftsbaserade genvägar. Explicit länk till annan arbetsyta ska fortfarande öppnas direkt. Samma mandat och navigationsspärrar används.
2. Sökning och centrala val synliga; ytterligare filter utfällbara i planering och elevregister. Aktuella filter ska framgå även när formuläret är stängt. Återställning, direktlänk och Tillbaka ska fungera.
3. Planeringslistans befintliga rader visas som kort på telefon, med Öppna synligt och sekundära uppgifter utfällbara. Samma radobjekt används för öppning och kopiering. Sortering erbjuds även på telefon.
4. Kompaktare skol-/årsval och tydliga förklaringar av programplan respektive timplan. Handbokens användarinstruktioner uppdateras.
5. Verifiera med syntetiska svar och fyllda listor på dator och telefon, relevanta modell-/URL-prov, typkontroll, lint samt separata app- och handboksbyggen. Versionshantera och pusha leveransen.

Ingen ny beslutsprocess, databasmodell, automatisk klasskoppling eller verklig integration ingår. Fasernas och kravens godkännandestatus ändras inte. Gemensamt sparbesked och ombyggnad av planeditorernas beslut/åtgärder återstår som egna förändringar.

## Resultat

Genomfört i den skyddade appens källkod:

- Start med uppgifter för huvudman, rektor och administratör. Direktlänkar och andra rollernas startvyer består.
- Extra planerings- och elevfilter visas på begäran, med synligt urval och återställning. Planeringens filterpanel ligger kvar öppen när val kombineras även om listvyn monteras om.
- Samma planeringsrader blir kort på telefon, med Öppna, Kopiera och detaljer. Telefonen har egna sorteringskontroller. På dator ligger åtgärderna kvar i tabellens högerkant.
- Färre upprepade uppgifter, kompaktare telefonhuvud och elevknappar. Uppdragsinformation går att fälla ut; stöd-/elevhälsorollernas information visas fortsatt utfälld.
- Handbok uppdaterad. Befintliga berörda browserprov har fått uttryckligt arbetsyteval och öppning av extra filter enligt det nya beteendet.

### Verifiering

- `npx playwright test -c playwright.usability.config.ts`: **12/12 PASS**, sex fall på dator 1440×1000 och sex i telefonprofil 390×844, Chromium. Alla API-svar är syntetiska och avlyssnade; ingen databas eller IdP används. Inga sidfel, konsolfel eller oväntade API-anrop i slutkörningen.
- Prövat: tre rollers start, Start/överblick/Tillbaka/omladdning, direktlänk med aktiva filter, flera val utan stängd panel, tomresultat, Rensa under väntande sökning, rätt träff/skola, mobildetaljer och sorteringsval, exakt skolrad/planversion i öppningscallback, elevfilter och söktext utanför URL. Öppna kontrolleras inom skärmbredden samt minst 44×44 px. Listans callback-prov bevisar inte full editorinläsning.
- Slutbilder av start, planlista och elevlista granskade på dator och telefon. Ingen sidövergripande sidledes rullning i de prövade vyerna. Befintlig fokushopplänk kan synas över innehållet i elevbilden; ingen allmän felfrihets- eller tillgänglighetscertifiering påstås.
- **100/100** befintliga modell-, kontrakts- och URL-prov för planeringsår, planlänkar och elevregister passerar.
- `npx tsc --noEmit`, `npx oxlint app lib` (även nya provfiler), `git diff --check`, separat appbygge med skyddat klientläge samt handboksbygge passerar.
- Appbygget gjordes i `/private/tmp/skolplattform-redesign-build-veqdowab`, utan backendhemligheter och utan ersättning av ordinarie bygge. Slutrapport/bilder finns lokalt i `web/test-results/usability*`, kontrolloggar i `web/outputs/usability-redesign-*`.
- Första browserkörningen hittade felaktiga testlokatorer för select och testutdatans långa JSON på telefon. Dessa rättades. En befintlig whitespace-nod i tabellhuvudets tr gav React-varning och rättades i produktkoden. Ett senare omprov avbröts efter att redigeringsskriptet körts från fel katalog; slutkörningen är komplett med känd exit 0.

### Leverans och begränsningar

Källändringen versionshanteras separat från andra pågående arbetskopiefiler och pushas på aktuell gren. Den ordinarie körande provmiljön på 3012 har **inte** byggts om eller ersatts av detta arbete. Ingen publicering/driftsättning ingår.

De äldre DB-/IdP-beroende fasproven är anpassade i källan men inte omkörda här. Inget nytt fullständigt fasgodkännande, verklig integration, fysisk telefon eller mänskligt användbarhetsprov påstås. Kvar som nästa separata förbättring: det sammanhängande utbildningsflödet och enhetliga sparbesked.


### Lokal leverans efter skärmbild 2026-10-12

Användaren visade fortfarande den gamla menyn. Ordinarie 3012 körde verifierat det äldre bygget 17924ff. Den lokala provservern uppdaterades därefter till UI-källrevision **8ee00c87bdf90efdde7ce95632a03dfeb4c1578e**:

- 179 byggfiler från det separat kontrollerade bygget jämfördes med SHA-256 före och efter installation. Produktkällorna i byggkopian matchade aktuella app/components/lib/hooks/public/.openai.
- Exakt befintlig startprocess stoppades med SIGTERM; porten frigjordes och ägda privata miljöfiler städades av startskriptet. Gamla bygget behölls under `/private/tmp/skolplattform-preview-update-v_j94k9s/previous`; äldre hashade klientfiler behölls också i den nya katalogen. Ordinarie startskript startade om servern på samma lokala adress.
- HTTP 200 samt faktiskt lokalt OIDC-prov med befintlig syntetisk rektor: ny Start och meny, överblick → planeringslista, utfällbara filter och telefonlayout passerade med exit 0 och noll pageerrors. Läsande användarflöde; ingen fixturåterställning, migration eller verksamhetsändring utfördes. Inloggning och läsningar registreras som vanligt av servern.
- Lokalt provresultat och bilder: `web/outputs/usability-live-verification.json`, `usability-live-start.png`, `usability-live-plans-phone.png`. Körlogg: `usability-preview-server.log`.

**Aktuell leveransstatus:** Nya versionen kör lokalt på `http://127.0.0.1:3012/?vy=start`. Testfilen under e2e är ingen fristående app och ska inte öppnas via file://. Tidigare formulering ovan om ännu inte uppdaterad 3012 beskriver läget före denna uppföljning. Detta avgränsade driftprov ersätter inte fulla fasproven eller ett mänskligt användbarhetsprov; ingen extern publicering har gjorts.
