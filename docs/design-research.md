# Designresearch och första byggsteget

4 september 2026. Riktning: en lugn, precis och sammanhängande arbetsyta för skolan.

## Vad källorna säger och vad vi gör av det

| Källa | Stöd från källan | Beslut för Skolplattformen |
|---|---|---|
| [NN/g: Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Vanliga handlingar ska vara direkt synliga. Mer sällan använda detaljer kan ligga ett steg djupare, med tydlig ingång. | Dagens lektioner och återkoppling först. Elevarbete öppnas i en fokuserad arbetsvy. Inga menyer med hela verksamhetens funktioner på samma nivå. |
| [Linear: A calmer interface, mars 2026](https://linear.app/now/behind-the-latest-design-refresh) | Teamet beskriver konsekvent verktygsplacering, lägre visuell vikt för navigation och färre konkurrerande skiljelinjer. Detta är en produktreferens, inte en effektstudie i skolan. | Stabil sidonavigation, en tydlig sidrubrik, få accentfärger och samma plats för primära handlingar. |
| [GOV.UK: Complete multiple tasks](https://design-system.service.gov.uk/patterns/complete-multiple-tasks/) | Längre förlopp behöver begripliga uppgifter och status, och bör först förenklas. | Ärendevyn visar ansvar och nästa uppgift. Beslut, genomförande och effekt hålls isär. Ett besvarat meddelande stänger inte ärendet. |
| [W3C: Nytt i WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) | Bland annat synligt, ej dolt fokus, alternativ till dragning och tillräckliga träffytor. | Semantiska knappar, tydligt fokus, tangentbordsstöd, inga flöden som kräver dragning, responsiv ombrytning och tillgängliga dialoger. WCAG 2.2 AA är designmål, inte ett påstående om uppnådd eller juridiskt fastställd efterlevnad. |

## Visuell riktning

Djup marinblå navigation, ljus neutral arbetsyta och en koncentrerad blå accent. Stor men återhållsam typografi ger hierarki. Tunna linjer används där de förklarar struktur. Färgade ämnesmarkörer ger igenkänning och kompletteras alltid med ämnesnamn. Inga dekorativa bilder behövs i lärarens arbetsyta. Schemat är en faktisk arbetsyta, inte ett diagram över påhittad produktivitet.

Avstånd: 4/8/12/16/24/32/48 px. Brödtext 16 px, kontroller minst 14 px; mindre text bara för sekundär metadata. Primära kontroller ungefär 40–44 px höga. Högst en dominerande handling per sammanhang. Rörelse är kort och stängs av vid önskemål om minskad rörelse.

## Första sammanhängande delen

Lärarens dag → arbetsområde → elevens text → återkoppling → nästa undervisning. Därtill ett sammanhängande schema och ett avgränsat processärende, för att pröva att samma formspråk fungerar för både pedagogik och administration. Syntetiska exempeldata ska vara tydligt märkta. Inga riktiga elevuppgifter eller externa utskick.

Denna iteration bygger gränssnitt och lokal interaktion. Server, autentisering, faktiska behörigheter och skolans integrationer är senare byggsteg. Det får inte presenteras som en driftklar skolplattform.

## Hur ”enkel att arbeta i” ska prövas

Användartesta först med lärare, sedan elev, mentor och administrativ roll. Låt deltagarna hitta nästa lektion, öppna material, ge användbar återkoppling, ändra nästa undervisning och identifiera kvarvarande arbete i ett ärende. Följ upp framgång utan hjälp, felval, återhämtning och upplevd ansträngning. Föreslagna mål: nästa lektion hittas inom 10 sekunder och relevanta elevunderlag inom två navigeringssteg. Det är hypoteser att mäta, inte uppnådda resultat.

Pröva 320, 768 och 1440 px, 200 procent textförstoring, tangentbord och skärmläsare. Verifiera färgkontrast och fokus i faktiskt renderad produkt. Framtida acceptansprov utgår också från de 74 kraven och 56 scenarierna i det tidigare underlaget.
