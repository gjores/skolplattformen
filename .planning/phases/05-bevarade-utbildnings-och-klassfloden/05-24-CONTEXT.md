# 05-24 — Sammanhållen timplansarbetsyta och analys

Status: **Planerat, inte genomfört.** Beställning 2026-10-04. Användaren vill ha en timplanslösning som följer de programplaner som byggts om med Claude och har bra analysstöd.

## Beställning och tidigare bindande beslut

- Utgå från den aktuella programplanstabellen i 05-19: startlista, sammanhållen tabell, årskursöversikt, inlinefält, radvis autospar och separat analys. Den gamla celldialogen är ingen förlaga för huvudflödet.
- Godkänd och fastställd programplansversion ska kunna ligga till grund för timplan. Rektor och skoladministratör ska kunna redigera på sina skolor. Huvudmannen beslutar.
- En programplan kan delas av flera skolor (05-20–05-22), men timplanen hör till en bestämd skola.
- Valbara block blir en timplansrad per block. Skolpaketen ligger inom blockets ram och kan ändras efter programfastställande (05-23 D-05, D-09, D-11). Timplanens källa måste därför frysas vid skapande.
- Klass–timplanskopplingar är explicita och flyttas inte när ny version eller ny källa kommer.
- Programplanens låsning vid kullstart är ett särskilt användarbeslut. Den ska **inte automatiskt bli en regel för timplaner**. Timplanens ändringsrätt följer dess versionsstatus; ändrad genomförandetid hanteras med nytt utkast och nytt beslut, inte ändring av fastställd historik.

## Planeringsval inom beställningen

1. Gymnasiet får sex timkolumner: åk 1–3 HT/VT, med programplanens poäng i läsbara källfält. Grundskolan behåller sina årskurser och visar stadiekort; IM visar veckotid.
2. Timmar lagras som heltal mellan 0 och 2 000 per cell i denna leverans, i överensstämmelse med befintlig skyddad lagring. Nya gymversioner har en separat tilldelningsmask: ofördelat är hours=0/allocated=false, uttrycklig nolltid är hours=0/allocated=true. Historiska GR/IM-/årkontrakt bevaras genom adapter; gamla cellskrivningar öppnas inte för nytt gymformat. Ingen dold avrundning och ingen 0,9-timmar-per-poäng-konvertering. Programplanens poäng fyller aldrig timceller.
3. Autospar sker när en rad lämnas, som i programplanen. Det serialiseras och använder revision. Egen ändring, pågående sparning, sparad revision, konflikt och okänd sparstatus måste visas tydligt.
4. Analysen använder samma fyra verksamhetskategorier: **Fel**, **Risk**, **Att kontrollera**, **Uppfyllt**. Varje resultat visar vad som kontrollerats, konkret räknat underlag, regel eller lokal bedömningsgrund och en fungerande åtgärdslänk när det finns en berörd rad.
5. Analys av egna osparade värden märks uttryckligen. Beslut baseras endast på serverns aktuella sparade revision. Ändras den måste analys och beslutsunderlag läsas om.
6. Rektor och `administrator` får skapa och ändra timutkast inom aktuellt skolmandat samt lämna förslag. HM läser, återremitterar och fastställer skolans gemensamma plan. För IM innebär det en gemensam planeringsram, aldrig rektorns individuella beslut enligt gymnasieförordningen; det individuella flödet ingår inte. Ingen utökad programplansredigeringsrätt följer med.
7. För gymnasiet krävs en serverfastställd källversion, fullständiga bindningar och relevant juridisk profil. Framräknat ”Klar för beslut” är inget fastställande.
8. Grundskolans och IM:s analysmotor kan utvecklas innan gymnasiets förutsättningar är färdiga. För gymnasium är 05-22 och genomförd/verifierad 05-23 hårda grindar. Yrkesprogram kräver dessutom genomförd/verifierad 05-17 och fastställd profil; ingen 2 500-poängs- eller högskoleförberedande timram gissas.

## Konkreta luckor i nuläget

- Skyddade timplaner listar bara grundskola och IM. Rektor ändrar en cell i dialog; HM läser. Admin, timplansskapande, analys och beslut är inte byggda.
- Gymnasiedemon bygger på `currentPointPlan`, årsvisa kolumner och 0,9 timmar/poäng. Klientroll och klientgodkännande där är inte skyddade bevis.
- `timplans.basis` är text. Exakt källplan, revision, programrader, poängterminer, paketutbud, regelprofil och timkolumner saknar fryst källbindning.
- Befintliga strikta timplanskontrakt och gamla rad-ID-format bevaras. Nya arbetsytekontrakt införs separat. Opaka stabila timrad-ID:n kopplas till exakta källrowKey:n i snapshot.
- Klasskolumner `ar1/ar2/ar3` måste fungera även om timplanstabellen har HT/VT. Adaptern summerar motsvarande två terminer utan att ändra befintlig klasskoppling.
- 05-20 har arbetskopieimplementation utan slutbevis, 05-21/22 har planer och 05-23 har CONTEXT utan PLAN. De behandlas inte som färdiga beroenden.

## Analysens avgränsningar

- Juridisk profil väljs för skolform, tillämpligt datum/kull och verifierat primärunderlag. Okänd profil blir ”Att kontrollera” och stoppar rättsliga påståenden och fastställande.
- Grundskolans hem- och konsumentkunskap har ett särskilt kontraktsprov: 40 timmar är gemensamt för låg- och mellanstadiet enligt det angivna primärunderlaget, inte en fristående garanti på mellanstadiet. Den gamla modellens placering återanvänds inte som rättsligt bevis.
- IM:s 23 timmar kan inte bevisas genom att okritiskt summera praktik, mentorstid och undervisning. Även rätt summa kräver kontroll av vad som räknats och tillämpligt undantag; manuell kontroll är synlig.
- Gymnasiearbetets, APL:s och valbara blocks tid räknas bara enligt belagd regelprofil. Schemalagd, planerad och faktiskt genomförd undervisning är olika uppgifter.
- Balans, låg marginal och timförslag är lokala planeringsbedömningar. 2 % och 15 % får aldrig beskrivas som lagkrav.
- Tjänstebehov kan visas som beräkningsstöd med synliga antaganden, men leveransen omfattar inte bemanning, schema, individval, faktisk närvaro eller bevis om varje elevs genomförda timmar.

## Bevis och genomförande

Se [genomförandeöversikten](05-TIMPLAN-IMPLEMENTATION.md) och [kod- och källunderlaget](../../research/TIMPLAN-ARBETSYTA-OCH-ANALYS-2026-10-04.md). Planerna är 05-24–05-35. Varje plan har två uppgifter; konkreta scopevarningar motiverar de få steg som behöver fler än fem käll-/provfiler. Slutlig mänsklig checkpoint är separat.

Verkliga lokala SQL-/Worker-API-/dator-/telefonprov med syntetiska data krävs. Negativa audit-, mandat-, MFA-, konflikt- och transportfall ingår. Ingen körning eller produktförändring är gjord genom dessa planeringsfiler. Claudes ändringar bevaras.
