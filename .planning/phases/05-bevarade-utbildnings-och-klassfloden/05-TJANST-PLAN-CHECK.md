# Plancheck — avtalsgrund och tjänstefördelning

Datum: 2026-10-16. Resultat: **PASS för planens genomförbarhet efter rättningar.** Inget produkt-, säkerhets- eller rättsligt efterlevnadsbevis följer av planchecken.

## Genomförd granskning

En oberoende GSD-planchecker läste alla 28 PLAN-filer, kontrakt, kodinventering, verifieringsmatris och redan utförd primärkällsresearch. En separat säkerhets-/integrationsgranskning prövade egenmandatets föreslagna utökning mot faktiskt kodläge, personbindning, mandatgränser, kapacitet, versioner och felåterhämtning. Båda gjorde riktad omgranskning efter korrigering och rapporterade inga kvarstående blockerare.

Samordnarens maskinella kontroll verifierade frontmatter, uppgiftsfält, max tre uppgifter per plan, högst fem filer per uppgift, deklarerat filägarskap, samtliga beroenden, vågordning, frånvaro av samtidiga filkonflikter samt relativa länkar och kontextreferenser.28 planer i 14 vågor; inga cykler eller saknade beroenden. Framtida produkt-/SUMMARY-filer behandlades som uttryckligt planerade utdata, inte som befintliga bevis. `git diff --check` passerade.

## Fynd som rättats

| Fynd | Korrigering och verifieringskrav |
|---|---|
| Initiativet riskerade att själv ändra den hash det var bundet till. | Separata initiativeBasisHash och decisionHash; positiv kedja dela→initiera→pröva→fastställ samt negativt ändrat underlag/återkallelse. |
| Publicerad tjänst och nytt utkast kunde dubblera eller i förtid frigöra tid. | Explicit reservationslivscykel med max per begränsningsdimension, bevarad publicerad bas, atomiskt fastställande och avbrytande. |
| Två skolor kunde var för sig tillämpa ett helt individuellt undervisningstak. | SharedAssessmentBasis och skolornas delramar; rektorsbekräftelser på gemensam grund, undervisnings-/PU-kontroll över skolor utan huvudmannagodkännande. |
| Status efter omladdning krävde payload som UI inte fick lagra. | Minimalt statusformat utan originaltext; exakt payload krävs bara för mutationsreplay. Verifierat utfall återhämtas genom status och behörig omläsning. |
| Plan05 refererade bedömningsstatus innan tabellerna skapats. | Neutral pending-projektion i05, explicit komplettering av plan_read i06. Tidiga planer prövar bara befintliga modellvektorer; helkedjan provas09/17. |
| Årsöverföringens plan blandade modell, SQL och API. | Separata15/15B/15C med15A som UI. Exakt tre tillkommande grants; grundpaketets15 bevaras. |

## Accepterade omfattningsvarningar

01A har 6 filer, 07 har 10, 08 har 15, 10 har 9 och 15C har 6. Dessa behålls som avgränsade sammanhängande kontrakts-/route-/UI-harnessändringar: högst tre uppgifter per plan och högst fem filer per uppgift, tydligt filägarskap och sekventiell handoff. API-filerna är tunna wrapperfamiljer kring gemensam server-/parserlogik, inte nya fristående subsystem. Vid faktisk implementation som visar större komplexitet ska planen delas innan arbetet breddas.

## Statusgräns

Användarens beslut om flera avtal och rektors fastställande är införda. TID/TJANST-målen spåras till TJ1-01–10 och konkreta framtida prov. Ingen produktkod, databas, lokal app eller handbok har ändrats av denna planering. Pågående APL-arbete i STATE och tidigare kravacceptans består. Genomförande, verklig lokal verifiering, giltig avtalsgrund för respektive period och användarprov återstår.
