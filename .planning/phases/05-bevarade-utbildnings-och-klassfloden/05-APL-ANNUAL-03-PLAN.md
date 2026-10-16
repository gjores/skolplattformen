---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-ANNUAL-03
type: execute
status: proposed
wave: 3
depends_on: [APL-ANNUAL-02]
autonomous: true
files_modified:
  - web/app/protected-gym-timplan-hours.tsx
  - web/app/protected-gym-timplan-distribution.tsx
  - web/app/protected-gym-timplan-workspace.tsx
  - web/app/protected-gym-timplan.css
  - web/app/protected-timplan-time-transition.tsx
  - web/app/protected-apl-plan.tsx
  - web/app/protected-apl-guide.tsx
  - docs/handbok/timplaner.md
must_haves:
  truths:
    - Rektor kan fylla Skola HT, Skola VT och APL per årskurs direkt i timplanen.
    - Periodförlagd tid och kvar att förlägga syns utan att öka den planerade totalen.
    - Äldre timplaner skiljs tydligt från nya och byter modell först efter granskning.
    - Handledningen skiljer sparad timbudget från bekräftad förläggning och genomförd APL.
  artifacts:
    - web/app/protected-timplan-time-transition.tsx
    - docs/handbok/timplaner.md
  key_links:
    - UI:s årskurskolumner använder fryst årskursmappning och V2-minutkommandot.
    - Övergångsgranskningen och autofördelningen visar samma serverberäknade totaler som sparas.
---
<objective>
Leverera den enkla arbetsgången användaren beskrivit, med tillgänglig tabell och perioder som senare detaljering. En enklare vy får inte dölja de fortsatt separata besluts- och genomförandekraven.
</objective>
<context>
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-PLAN.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-ANNUAL-02-SUMMARY.md
@web/app/protected-gym-timplan-hours.tsx
@web/app/protected-apl-plan.tsx
@web/app/protected-apl-guide.tsx
@web/lib/planning-year-model.ts
</context>
<tasks>
<task type="auto">
<name>1. Visa och spara skoltid och års-APL i samma timplan</name>
<files>web/app/protected-gym-timplan-hours.tsx, web/app/protected-gym-timplan-distribution.tsx, web/app/protected-gym-timplan-workspace.tsx, web/app/protected-gym-timplan.css, web/app/protected-timplan-time-transition.tsx; berörda UI-fixturer/specfiler</files>
<action>V2-rader visar grupperade kolumner Skola HT, Skola VT, APL åk1 (motsvarande övriga år), total och varav APL %. Årsfilter hämtar rätt år från fryst programkälla och behåller hela planens total/GUT tydligt åtskild från visat år. På telefon använd en läsbar årskurs i taget eller annan prövad layout, inte ihoptryckta nio inmatningsfält. Behåll inline-kö/CAS/dirty-/MFA-/osäkert-svarskydd; V2 skriver skol- och årsrad atomärt via nytt kontrakt och läser exakt resultat. Visa minuter när värdet kräver det och hjälptext för h:mm. Inget osparat utkast försvinner vid årsväxling. Ny totaldialog visar reserverad års-APL och skoltid att fördela. För V1 behåll rubriken totaltid inklusive APL och tillhandahåll Granska byte till Skola och APL: helplansjämförelse med minutförändringar, oförändrad total, identifierad APL och kvarstående granskning. V1 fastställd kräver ny utkastversion; avbryt skriver inget. Spara övergång med samma request efter okänt utfall; verifiera läst modell innan tabellen växlar.</action>
<verify>UI-prov på dator/telefon: budget utan perioder, år1/2/3 och filtrerat läsår, null/0/minutrest, egna övergångsval, cancel, två samtidiga redigerare, gammalt tabbfönster, MFA och okänd status. Autofördelning behåller års-APL och exakt total. Granska screenshots samt tangentbord, labels, fokus och 44px mål. Kör relevanta befintliga timplans-/autofördelningsprov för V1.</verify>
<done>Tabellen motsvarar de valda verksamhetsrubrikerna och lagrar rätt betydelse; båda modellerna kan förstås utan tekniska modellnamn i normalflödet.</done>
</task>
<task type="auto">
<name>2. Gör periodförläggning till tydligt nästa steg och uppdatera handledningen</name>
<files>web/app/protected-apl-plan.tsx, web/app/protected-apl-guide.tsx, docs/handbok/timplaner.md; berörda APL-UI-specfiler</files>
<action>I V2 börjar APL-panelen med årsram, periodförlagd tid och kvar att förlägga samt handlingen Förlägg APL i perioder. Inga datum krävs för att spara timtabellen. Periodredigeringen återanvänder befintliga datumväljare/veckonummer, arbetsmoment och minuter; visa återstående ram för valt ämne/år och en tydlig rättningsväg om ramen måste höjas. Behåll gammal periodtolkning för V1. Skriv guiden för två förståeliga arbetssätt: skoltid och års-APL i nya planer; totaltid/varav APL i äldre planer tills uttrycklig övergång. Förklara att en sparad budget inte är bekräftad förläggning, veckoregelefterlevnad eller genomförande. Visa blockerare inför rektorsbekräftelse/HM-beslut; ta inte bort dem för att göra budgetsteget enklare. Inga APL-poäng och ingen ny attest. Lägg till samma exempel/sparväg i handboken med aktuella verifierade källhänvisningar från GUIDE-DATES.</action>
<verify>Dokumentationsbygge samt APL-UI-prov: spara timmar utan perioder, läsning HM, periodplacering minskar kvar utan att ändra total, för mycket förläggning nekas, klassifikation/bekräftelse kräver samma regler. Gamla perioders datum/termavsikt/minuter består. Visuell kontroll av stegen på båda enheter.</verify>
<done>Guiden leder från timmar till förläggning och vidare till granskning; användaren får inget falskt besked om regeluppfyllelse eller möjlighet till tidigt fastställande.</done>
</task>
</tasks>
<verification>Typ/lint, relevanta Node- och UI-prov, docs:build. Ett simulerat browserprov redovisas som sådant; faktiskt kandidatprov ligger i04.</verification>
<success_criteria>ANNUAL-01/03/04/07 har UI-bevis. Själva årsmodellens produkt och migration är ännu inte installerade i aktiv miljö.</success_criteria>
<output>Skapa 05-APL-ANNUAL-03-SUMMARY.md med bildgranskning, prov och konkreta begränsningar. Samordna avgränsad commit/push.</output>
