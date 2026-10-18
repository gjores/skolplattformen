import './protected-apl-guide.css';

const regulation = 'https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/gymnasieforordning-20102039_sfs-2010-2039/';
const organisation = 'https://www.skolverket.se/larande-och-trygghet/elevens-fortsatta-studier-och-arbetsliv/yrkesutbildning-och-arbetsplatsforlagt-larande-apl/organisera-arbetsplatsforlagt-larande-apl';
const safety = 'https://www.av.se/arbetsmiljoarbete-och-inspektioner/arbetsgivarens-ansvar-for-arbetsmiljon/minderariga-arbetstagare/praktik-for-minderariga/';

/** Readable guidance, independent of write permissions and never an attestation. */
export default function ProtectedAplGuide({ annual = false }: { annual?: boolean }) {
  return <details className="apl-guide" aria-label="Handledning för APL">
    <summary><span>Så planerar du APL<small>Regler, arbetsgång och ansvar – från timmar till uppföljning</small></span></summary>
    <div className="apl-guide-body">
      <p>För skolans skolförlagda Gy25-yrkesprogram. Appen hjälper er att granska <strong>planeringen</strong>. Skolan behöver också följa varje elevs faktiska APL.</p>
      <div className="apl-guide-facts"><div><strong>Minst 15 veckor</strong><span>APL under utbildningen</span></div><div><strong>23 timmar per vecka</strong><span>räknas inom garanterad undervisningstid, GUT</span></div></div>
      <p className="apl-guide-source">Regel: <a href={regulation} target="_blank" rel="noreferrer">gymnasieförordningen 4 kap. 12 §</a>. 23 timmar är beräkningsmåttet för GUT, inte elevens arbetsschema på arbetsplatsen.</p>

      {annual ? <details className="apl-guide-step" open><summary>1. Börja med timmar per årskurs</summary>
        <p>Fyll i <strong>Skola HT</strong>, <strong>Skola VT</strong> och <strong>APL</strong> för respektive årskurs i timplanens tabell. Lämna raden för att spara. Vänta på <b>Allt sparat</b>. Tomt betyder ofördelat och 0 betyder angivna noll timmar.</p>
        <p><strong>Exempel:</strong> Skola HT 20 + Skola VT 20 + APL 60 = 100 timmar. Perioder och datum behövs inte för att spara dessa timmar.</p>
        <p>Huvudmannen godkänner timtabellen först. Välj därefter <b>Fortsätt till APL-planering</b> och <b>Förlägg APL i perioder</b>. Årskursens APL-termin väljs här, när perioderna planeras. Perioderna använder den redan sparade årsramen. Förlägger ni 40 av 60 timmar återstår 20; totalen är fortfarande 100 timmar.</p>
        <p>Rektor beslutar vilka delar av ämnesnivåerna som ska genomföras på arbetsplatser och hur APL fördelas över läsåren. En sparad årsram är inte en bekräftad förläggning.</p>
      </details> : <>
      <details className="apl-guide-step" open><summary>1. Börja med årskurs och termin</summary>
        <p>Rektor beslutar vilka delar av ämnesnivåerna som ska genomföras på arbetsplatser och hur APL fördelas över läsåren.</p>
        <p><strong>Gör så här:</strong> Öppna den separata APL-planeringen för en godkänd timplan. Kontrollera namn, skola och version. Välj <b>Planera APL</b>, lägg till en period och välj årskurs och termin. Spara via <b>Granska ändringar</b> och <b>Spara APL-plan</b>. Datum, omfattning och innehåll kan kompletteras senare.</p>
        <p><strong>Appen hjälper med:</strong> Läsåret hämtas från utbildningens start. Olika klassers upplägg kan ligga i olika namngivna timplaner. Ett terminsval flyttar inte redan angivna datum eller timmar.</p>
      </details>
      </>}
      <details className="apl-guide-step"><summary>2. Granska datum och verklig omfattning</summary>
        <p><strong>Gör så här:</strong> Öppna periodens datum och omfattning. Ange datum, välj hela APL-veckor eller blandveckor och beskriv underlaget. Granska verklig förläggning, lov och avbrott innan du markerar omfattningen som granskad.</p>
        <p><strong>Appen kontrollerar:</strong> Datum, läsår, överlappningar och om uppgivna hela veckor ryms i kalendern. Veckonummer hjälper dig att välja datum; de bevisar inte att veckan är en hel APL-vecka. För det stödda upplägget krävs minst 15 granskade hela veckor inför bekräftelsen.</p>
      </details>
      <details className="apl-guide-step"><summary>3. Koppla innehåll och fördela timmar</summary>
        <p>APL genomför delar av utbildningens ämnesinnehåll. Ämnen, årskurser och APL-timmar finns redan i timplanen. Välj berörda ämnesnivåer under periodens innehåll och undervisningstid och fördela <b>Varav APL</b> mellan ämnen och terminer. Beskriv arbetsmomenten manuellt med ämnesplanen som stöd. Appen har ännu ingen fullständig katalogväljare för centralt innehåll.</p>
        <p className="apl-guide-example"><strong>Exempel:</strong> 5 hela granskade APL-veckor motsvarar 115 GUT-timmar. Fördela exempelvis 80 timmar på en ämnesnivå och 35 på en annan. Om timplanens total är 2 625 timmar ingår de 115 redan där; totalen blir inte 2 740.</p>
        <p><strong>Appen kontrollerar:</strong> Periodens APL-tid ska stämma exakt med veckounderlaget och rymmas inom {annual ? 'ämnets sparade APL-ram för årskursen' : 'ämnets och terminens sparade totaltid'}. Samma period ska inte räknas flera gånger för att flera ämnen ingår. Autofördelning av totaltimmar väljer inte APL-innehåll åt er.</p>
      </details>
      <details className="apl-guide-step"><summary>4. Granska och bekräfta APL-förläggningen</summary>
        <p>Rektor eller skoladministratör kan förbereda planen. Ange utbildningsform och granska att all APL-tid har identifierats inom totaltiden. Öppna listan med det som saknas inför rektors bekräftelse och rätta underlaget.</p>
        <p><strong>I appen:</strong> Spara först. Endast rektor kan därefter bekräfta förläggningen. Timtabellen är redan godkänd. Huvudmannen granskar APL-planeringen separat och kan se innehållet och rektors bekräftelse. Periodändringar inom årsramen ändrar inte timtabellens godkännande. Ändras innehållet eller undervisningstiden behöver rektor bekräfta igen. En komplett planering visar inte att APL är genomförd.</p>
      </details>
      <details className="apl-guide-step"><summary>5. Säkra arbetsplatsen och följ varje elev</summary>
        <p>Huvudmannen ansvarar för platserna och utbildningens kvalitet. Eleven ska ha en lämplig handledare med rätt kunskaper och erfarenhet. <a href={regulation} target="_blank" rel="noreferrer">Gymnasieförordningen 4 kap. 12 och 14 §§</a>.</p>
        <p><strong>Utanför denna vy:</strong> Ordna platser och handledare. Riskbedöm arbetsuppgifter och arbetsmiljö, åtgärda risker före start och kontrollera introduktion, tillsyn samt tillämpliga arbetstider för minderåriga. <a href={safety} target="_blank" rel="noreferrer">Arbetsmiljöverkets stöd för praktik</a>.</p>
        <p>Planera kontakt mellan lärare, elev och handledare. Följ närvaro, genomförda moment och lärande, samla bedömningsunderlag och hantera frånvaro eller brister. Dessa uppgifter registreras eller kontrolleras ännu inte här. <a href={organisation} target="_blank" rel="noreferrer">Skolverkets stöd för att organisera APL</a>.</p>
      </details>
      <details className="apl-guide-step"><summary>Andra upplägg och regelkällor</summary>
        <p>Lärlingsutbildning kräver mer än hälften av utbildningen som APL, räknat från det läsår lärlingsutbildningen börjar. Den har en annan beräkningsgrund. Blandveckor och delveckor kan sparas men räknas inte automatiskt om. Dessa upplägg får inget automatiskt godkännande här.</p>
        <p>Guiden gäller inte komvux, introduktionsprogram eller anpassad gymnasieskola. Appens kontroll kräver en stödd programkälla och elevkull; yrkeskullar med start från 2 juli 2028 behöver stöd för yrkesprov innan de kan beslutas här.</p>
        <p>Om APL-plats saknas är det inte fritt att ersätta APL med skolförlagd tid. De särskilda förutsättningarna i <a href={regulation} target="_blank" rel="noreferrer">4 kap. 13 §</a> behöver prövas av huvudmannen. Appen fattar inte det beslutet.</p>
        <p>Källor kontrollerade 16 oktober 2026: gymnasieförordningen (2010:2039), Skolverkets organisationsstöd samt <a href="https://www.av.se/arbetsmiljoarbete-och-inspektioner/publikationer/foreskrifter/afs-20232/" target="_blank" rel="noreferrer">AFS 2023:2, 8 kap. om minderåriga</a>. Appens planeringskontroller ersätter inte skolans uppföljning eller individuella bedömningar.</p>
      </details>
    </div>
  </details>;
}
