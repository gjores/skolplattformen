type Props = { weekly: boolean };

const timplanSource = 'https://www.skolverket.se/undervisning/grundskolan/timplan-for-grundskolan';
const timeSource = 'https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/undervisningstid-larotider-och-schema';

export function TimplanGuidance({ weekly }: Props) {
  return <aside className="pt-guidance" aria-label="Regelstöd för timplanen">
    <h3>Innan du ändrar undervisningstiden</h3>
    <p>{weekly
      ? 'Bedöm fördelningen tillsammans med huvudmannens utbildningsplan och elevens individuella studieplan.'
      : 'Bedöm hela stadiets fördelning mellan ämnena, även när du bara ändrar en årskurs.'} En timme avser 60 minuter.</p>
    <p><strong>Sparat betyder inte regelkontrollerat.</strong> Vyn sparar cellvärden men kontrollerar ännu inte hela undervisningsramen. Här kan du inte lämna förslag eller fatta beslut.</p>
    <details>
      <summary>{weekly ? 'Regler och ansvar för introduktionsprogram' : 'Regler och ansvar för grundskolan'}</summary>
      {weekly ? <>
        <p>Eleven har rätt till i genomsnitt minst 23 timmars undervisning i veckan. Att summera alla rader här visar inte i sig att eleven får sin garanterade undervisningstid.</p>
        <p>Huvudmannen beslutar utbildningsplanen. Rektor beslutar hur undervisningstiden för varje elev fördelas mellan gymnasieämnen, grundskoleämnen, praktik och annat i den individuella studieplanen.</p>
        <p>Minskad omfattning kräver elevens begäran och att huvudmannen bedömer att det finns särskilda skäl.</p>
      </> : <>
        <p>Den nationella timplanen anger minsta undervisningstid per stadium och ämne eller ämnesgrupp. För NO och SO finns också särskilda ämnesramar inom grupperna.</p>
        <p>Fördelningen mellan årskurser beslutas av huvudmannen efter rektors förslag.</p>
        <p>Skolans val får enligt timplanen från 2024/2025 minska tiden per stadium för ett ämne eller en ämnesgrupp med högst 20 procent. Svenska eller svenska som andraspråk, engelska, matematik och språkval får inte minskas.</p>
        <p>Skolans val omfördelar tid inom timplanen, högst 600 timmar sammanlagt. Det minskar inte den ordinarie garanterade totaltiden på 6 890 timmar.</p>
        <p>Vägledningen gäller ordinarie grundskola från 2024/2025. Kontrollera tillämpligt regelunderlag och eventuella individuella beslut. Appen väljer ännu inte regelversion för elevkullen.</p>
      </>}
      <p className="pt-guidance-source">Källor kontrollerade 1 oktober 2026: {!weekly && <><a href={timplanSource} target="_blank" rel="noreferrer">Skolverkets timplan</a> och </>}<a href={timeSource} target="_blank" rel="noreferrer">Skolverkets regler om undervisningstid och ansvar</a>. Länkarna öppnas i en ny flik.</p>
    </details>
  </aside>;
}

export function TimplanEditGuidance({ weekly }: Props) {
  return <p className="pt-edit-guidance">{weekly
    ? 'Ändringen påverkar veckofördelningen. Kontrollera utbildningsplanen och elevens individuella studieplan innan tiden används.'
    : 'Ändringen påverkar årskursens och stadiets fördelning. Kontrollera ämnesramarna och huvudmannens beslut innan tiden används.'} Sparningen är ingen kontroll av hela regelverket.</p>;
}
