# 05-PLANNING-FLOW-UX-02 — kontrakt och journal

Status: implementerat och lokalt verifierat; integrerad kandidatkontroll återstår i 06.

Nya timplansbeslut använder `timetable_decision_v2` med `apl:null`; programplansbeslut och historiska kvitton behåller tidigare kontrakt. Ny APL-läsning har `revisionScope: apl`, separat `revision`, `timplanRevision` och `reviews`. Spara, rektorsbekräfta och huvudmannagranska binder båda revisionerna. Gammalt okänt kommando kan inte starta en ny skrivning efter övergången; gammalt känt kvitto kan läsas exakt med aktuellt mandat.

Journalen stödjer huvudmannens granskning med egen rollgräns och samma exakta kommandoreplay. Historiska slutförda kommandon markeras historiska, och ändrad timplansrevision eller APL-revision blockerar nytt försök. Granskningshistorik valideras mot motsvarande rektorsbekräftelse, innehållshash och revisionsordning.

Ändrat: `web/lib/apl-plan.ts`, `apl-plan-journal.ts`, `plan-decision.ts` samt berörda modell- och journalprov. Inga UI-filer ägs av denna delplan.

## Gemensam verifiering

- 109 modell-, journal- och serverprov PASS (APL, planbeslut och gamla kontrakt); `npx tsc --noEmit` PASS och riktad oxlint PASS 2026-10-18.
- Isolerat faktiskt PostgreSQL-prov: `/private/tmp/separate-apl-sql07.json`, 32 kontroller PASS, 74 källhashar oförändrade och full cleanup. Schema-only kopia utan verksamhetsdata; egna syntetiska testobjekt. Detta är inte prov av verklig kommunanslutning eller full auth-klusterlikvärdighet.
- Installerarens exakta struktur-/ACL-grind accepterar SQL07:s före/efter-struktur. 78 gamla och nya installer-/deliveryprov PASS. Ingen aktiv databas eller process på 3012 har ändrats av dessa delplaner.
- Faktisk OIDC/browser på dator och telefon, kandidatbygge, godkännandegater samt eventuell installation överlämnas till delplan 06. SQL07 innehåller två samtidiga APL-skrivare; inget nytt faktiskt race mellan APL-spara och byte av godkänd timplansversion har genomförts. Arkiverad/ersatt kapabilitet är kontrollerad i modell/server och deliverygrind, men inte en egen sådan SQL07-livscykelmatris.

## SS 12000 och datagräns

Den separata revisionsräknaren och granskningen är intern verksamhetsplanering. Befintliga stabila ID:n för utbildning, timplan, skolenhet och klass behålls; ingen ny Attendance, Placement eller elevgenomförandeuppgift härleds ur ett APL-beslut. Ingen standardanslutning eller ny verifierad utbytesförmåga påstås. Planens befintliga SS 12000-avgränsning gäller fortsatt.

## Leveransansvar

Root samordnar avgränsade commits och push i den delade arbetskopian. Delagenten har inte gjort egna commits eller skrivit till aktiv databas. Föregående migreringsfiler, frysta kvitton och historiska beslut är orörda.
