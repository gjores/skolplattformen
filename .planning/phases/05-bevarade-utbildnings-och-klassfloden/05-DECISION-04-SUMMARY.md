---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: DECISION-04
status: completed
requirements: [ADMIN-02, ADMIN-04]
---

# Uppgifter och beslut för varje planeringsroll

2026-10-12. Aktiv huvudman, rektor och skoladministratör får en global **Att göra**-indikator samt **Dina uppgifter och beslut** på Start. Räknare och nästa steg kommer från serverns faktiska uppdrag och omfattar alla läsår. Rollbyte återställer inkorgen. Uppgifter leder till exakt utbildning, skola och planversion. Väntande/spärrade planer skiljs från egna uppgifter; fel vid hämtning visas i indikatorn.

Beslutspanelen visar utkast → granskning → fastställd, blockerande kontroller, manuell checklista, ansvarig roll, återsändningsmotivering och historik. Bekräftat beslut låser innehållet. Osäkert svar behåller kommandots identitet och spärrar navigation; lyckat replay följs av färsk läsning. Programlistan visar granskningsstatus separat från grundstatus; filtret heter **Ej fastställda**. Återsänd timplan kan få nytt korrigerat programunderlag; inskickat förslag måste tas tillbaka först.

Isolerad browserverifiering med syntetiska API-svar: sex rollprov (tre roller på dator/telefon) PASS. Sista riktade åtta prov PASS för filter, hela beslutskedjan och återsänd timplan med nytt underlag. Tidigare timeouter under värdbelastning och upptäckta layout-/React-keyfel är dokumenterade och omprovade. Mobilens checklista, dialog och knappar ryms. Dessa UI-prov är inte faktiska DB-/mandatprov; se DECISION-03 och slutverifieringen.

Testerna ligger i befintliga `web/e2e/usability.spec.ts` och dess fixture i stället för nya föreslagna filer. Lokala rapporter finns i ignorerade `web/outputs/decision-ui-verification-2026-10-12.json`. Typkontroll, lint och slutligt skyddat appbygge PASS efter sista produktändringen.
