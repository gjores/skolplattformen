---
status: investigating
trigger: "UAT 2026-11-16: inget synligt schema vid saknat underlag; aktivitet kan inte skapas efter villkorsändring; målplaceringsknapp upplevs overksam; antal pass per grupp"
created: 2026-11-16
updated: 2026-11-16
source_revision: 4267daf75b4f142f72ce04a9d3ac57e5b98ea2ef
mode: find_root_cause_only
---

## Current Focus

hypothesis: De tre första fynden har olika orsaker: tomt underlag blir ett lyckat tomt svar utan diagnos; en giltig grundgrind ger ett otydligt och ohjälpligt stopp vid aktivitet; målknappens exakta användarfall är inte reproducerat men flera tidiga stopp och ett upprepat-fokusfall är identifierade.
test: Genomläsning av kompletta händelsekedjor och isolerade syntetiska modellprov samt befintliga aktivitets-/placeringsprov.
expecting: Genomföraren kan rätta verifierade mekanismer och lägga ett exakt browserprov för det ännu osäkra målknappsfallet.
next_action: Root implementerar och verifierar enligt sitt avgränsade åtgärdspaket. U1–U12 är inte därmed godkända.

## Symptoms

expected: Synlig orsak när schema inte kan läggas; begriplig väg framåt vid aktivitetsskapande; målknappen ger synlig återkoppling; olika antal undervisningspass per grupp går att välja.
actual: Användarens bild visar Underlag saknas, 0 av 0 pass och liten text om saknad tjänstefördelning. Aktivitet visar Ta fram nytt förslag innan aktiviteter kan ändras. Målknappen upplevs göra ingenting. Antalsinställningen är inte hittad/förstådd.
errors: Inga nya serverfel verifierade av denna diagnos.
reproduction: Läsande källundersökning och isolerade syntetiska modellprov; ingen inloggad faktisk kommun-/databaskedja.
started: Rapporterat vid användarprov av installerad 4267daf7.

## Eliminated

- Ett tomt resultat måste bero på trasig klickhanterare eller motortransport: ett helt korrekt tomt underlag ger uttryckligen input_missing med 0/0 och inga diagnosfynd, utan att motorn behöver anropas.
- Alla aktivitetsfel är motorfel: den exakta rapporterade feltexten sätts lokalt innan något aktivitetsanrop görs.
- Antal pass per grupp saknar allt stöd: klass/grupp-regler och redigeraren finns, och olika antal för separata grupper fungerar i syntetiskt prov.
- Placeringspanelen saknar all fokus-/rullningshantering: den har redan focus och scrollIntoView när search.key ändras. Den lösningen ska bevaras.

## Evidence

### 1. Tomt underlag är ett lyckat men lätt missat tomt svar

- `web/app/schema-workspace.tsx:249–278`: run gör diagnos först och fortsätter till forslag när findings är tomt. Det tomma förslaget sätts i base som vanligt.
- `web/lib/schema-diagnos.ts:49–75`: diagnosen kompletteras från aktiviteter/utelämnade behov/vakanta pass, men saknar ett eget fynd för helt tomt underlag eller saknad tjänstefördelning. Om alla dessa listor är tomma returneras inga fynd.
- `web/app/api/schema/forslag/route.ts:31–33`: noll motorpass ger medvetet en tom lösning med `status=input_missing`, inte ett transportfel.
- `web/app/schema-workspace.tsx:690–705`: utfallet står i vanlig `schema-summary`; rubriken är `sr-only`, statusen är en liten bricka och avsaknad av tjänstefördelning står i `schema-note`. Nästa arbetsvy visas först när lessons.length > 0 (710).
- Syntetiskt modellprov: plan med version=null och tomma classes/rows/groups gav diagnosfynd=0, svar status=input_missing, placed=0, lessons=0, basis=null. Detta stöder bildens upplevda ”inget händer” utan att belägga varje historiskt klick.

**Minsta rättning:** ett synligt, fokuserat hinder nära Ta fram schemaförslag med orsak och handling (exempelvis öppna tjänstefördelningen för vald skola/läsår). Markera inte ”Tiden följer timplanen” som ett positivt resultat när 0 pass finns. Lägg gärna samma saknade-underlagsfynd i förkontrollen; skilj avsaknad av tjänstefördelning, inga behov i vald period och andra utelämningsorsaker.

### 2. U6 stoppas av grundvillkor före nätanrop

- `web/app/schema-workspace.tsx:140–142`: grundAndrad är sant när schemaGrund skiljer sig eller en tidigare 409 satt kraverNytt för de aktuella villkoren.
- `web/lib/schema-contract.ts:112–118`: max/min passlängd, salarnas lista, aktiviteter och egna `langd`/`antal` ingår i den deklarerade grunden. Spärr, marginal och lärarens längsta dag är i sig tidsvillkor.
- `web/app/schema-workspace.tsx:434–458`: andraAktiviteter returnerar false direkt vid grundAndrad/issues och sätter exakt ”Ta fram ett nytt förslag med de ändrade villkoren innan du ändrar aktiviteter.” (436). Då anropas inte `/api/schema/aktiviteter`.
- `web/app/schema/aktivitet-form.tsx:34–39,71`: formuläret lämnar användarens val kvar och återger saveError, men erbjuder ingen handling eller uppgift om vilka ändrade villkor som behöver hanteras.
- För legitima aktivitetsändringar jämför serverns `schemaAktivitetsAndring` den tidigare grunden mot grundFingerprint innan befintliga undervisningspass bevaras (`web/lib/schema-aktiviteter-underlag.ts:16–23`). Skyddet ska inte kringgås.
- Syntetiskt prov: ändrad antalregel ger sammaGrund=false; en ensam ändring av lärarens längsta dag ger sammaGrund=true.

**Minsta rättning:** förklara exakt vilka passgrundande inställningar som ändrats, ge en direkt handling för att ta fram nytt förslag/återgå till förslagets inställningar och behåll aktivitetsformulärets val genom den vägen. Blockera inte en giltig tidsändring bara för att aktuell kontroll ännu pågår; visa väntestatus och försök igen när kontrollen är klar. Det senare bör få ett eget browserprov. Bildens fasta aktivitet kl.17 kan dessutom behöva en tydlig varning om den ligger utanför skolans dag, men denna sekundära observation är inte rotorsaken till det visade grundfelet.

### 3. Målplaceringsknappen: exakt användarfall ännu inte reproducerat

- `web/app/schema/flytt.tsx:33`: knappen är korrekt type=button och kopplad till onTargetSuggest.
- `web/app/schema-workspace.tsx:754–757`: den skickar valt pass och målpunkt till sokPlacering med mode=target.
- `web/app/schema-workspace.tsx:378–381`: saknat input/forslag, busy, checking eller running.current ger tidig retur. Grundändring/issues och lås sätter moveError före sökning.
- moveError visas vid 762 långt under den översta placeringspanelen (685–686). Ett stopp behöver inte flytta fokus dit. Både busy/checking inaktiverar knappen, men en osynkroniserad running.current kan fortfarande orsaka tidig retur utan besked.
- `web/app/schema/placering.tsx:16` har redan fokus och scrollIntoView på `[search.key]`. Det hindrar slutsatsen att alla lyckade sökningar saknar synlighetsstöd.
- En konkret statisk kant: upprepad identisk sökning skapar samma `search.key` (JSON av request, arbetsytan383–388). Om panelen redan finns och användaren rullat tillbaka till flyttpanelen körs inte fokuseffekten på nytt. Detta är en möjlig förklaring, inte verifierat som just användarens fall.

**Minsta rättning och prov:** ge synlig status vid varje tidig retur och separera ”ny sökning startad” från det innehållsbaserade request-fingeravtrycket, så upprepad identisk sökning kan föra fokus till resultatet. Browserprova (a) ändrad grund, (b) pågående kontroll, (c) krockad bas, (d) giltigt första målanrop, (e) rulla tillbaka och upprepa exakt samma mål. Kontrollera begäran, synligt besked och fokus; behåll nuvarande före/efter-granskning och Godkänn.

### 4. Antal pass finns, men reglernas prioritet och gruppdefinition behöver förtydligas

- `web/lib/schema-contract.ts:125–130` tillåter antal för klass, grupp och ämne (1–10 per vecka).
- `web/app/schema/villkorstabell.tsx:309–310`: cellredigeraren har ”Pass per vecka”. `schemaGrund` behandlar ändringen som ny passgrund.
- `web/lib/schema-underlag.ts:313–340`: egna regler för klass, grupp och ämne samlas i ursprunglig ordning och antal väljs med `shared.find(r => r.typ === 'antal')?.count`. Ingen uttalad specificitetsprioritet används.
- Syntetiska prov visade två pass för klass1/grupp1 och tre för klass2/grupp2 när de har separata undervisningar. Alltså finns grundfunktionen.
- **Verifierad ordningslucka:** ämne Matematik=4 före klass1=2 gav fyra pass för klass1; samma regler i omvänd ordning gav två. Reglernas inmatningsordning kan därför överrösta den avsedda grupp-/klassanpassningen.
- `schema-underlag.ts:195–205` har ett uttryckligt reservbeteende för valbart block utan kända elevmedlemskap: alternativen blir en gemensam undervisning. Syntetiskt prov med två alternativ i samma block och antal2 respektive3 gav ett gemensamt block med två pass. Det är en modellbegränsning i reservbeteendet och ska inte beskrivas som att alla sådana grupper redan kan ges oberoende antal.

**Minsta rättning:** synlig ingång för antal på den faktiska undervisningen/gruppen och ett deterministiskt kontrakt för motstridiga ämnes-/klass-/gruppvärden. Föreslå inte att gruppspecifikt värde fungerar i reservblock utan separata medlemsunderlag. Prova 2/3 separata grupper, motstridiga övergripande regler i båda ordningarna, samläsning och block utan kända medlemmar; timplanens totala minuter ska bevaras.

## Verifiering utförd av diagnosagenten

- `/private/tmp/schema-uat-diagnosis-20261116.mjs`: fristående syntetiska modellfall byggda från befintliga underlagsprovs fixturefunktioner. Samtliga assertions PASS; resultat ovan.
- `node --test lib/schema-aktiviteter.test.mjs lib/schema-placering.test.mjs` i web med Node25: **30/30 PASS**,0 skip. Logg `/private/tmp/schema-uat-diagnosis-existing-tests.log`. Detta är baslinjebevis för modellerna, inte verifierade UI-rättningar.
- Ingen produktfil ändrad, ingen process på3012/3013 ändrad, ingen databasskrivning eller kontoinloggning.
- Originalets målknappsfel behöver fortfarande ett precist browserprov; ingen slutlig rotorsak eller rättnings-PASS påstås för det fallet.

## Resolution

root_cause: Tomt underlag saknar förkontrollfynd och har för svag resultatsynlighet; aktivitet stoppas före nätet av ändrad passgrund utan en tydlig återhämtningshandling; antalsregler har verifierad ordningsberoende prioritet. Målknappens exakta historiska trigger är ännu osäker, med identifierade och prövningsbara stopp-/upprepningsfall.
fix: Ingen produktändring utförd av denna diagnosagent.
verification: Isolerade syntetiska modellfall PASS och befintliga30modellprov PASS; inga nya faktiska eller mänskliga UAT-godkännanden.
files_changed: [.planning/debug/schema-uat-2026-11-16.md]
