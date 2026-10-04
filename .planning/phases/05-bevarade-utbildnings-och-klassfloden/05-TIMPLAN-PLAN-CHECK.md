---
phase: 05-bevarade-utbildnings-och-klassfloden
scope: timplan-planning-05-24-through-05-35
reviewed: 2026-10-04
status: ready_with_prerequisites
assessment: plan_quality_only
implementation_verified: false
---

# Timplaner — granskning av genomförandeplanerna

**Planeringspaketet är genomförbart med angivna förutsättningsgrindar.** Inga kvarstående blockerande eller större planeringsfel har identifierats efter rättningarna. Detta är granskning av planernas kvalitet. Ingen ny timplansimplementation, databasanslutning, API-körning, browserverifiering eller mänsklig acceptans är genomförd genom denna granskning.

Granskat 2026-10-04: `05-24-CONTEXT.md`, `05-TIMPLAN-IMPLEMENTATION.md`, samtliga tolv PLAN-filer 05-24–05-35 och `../../research/TIMPLAN-ARBETSYTA-OCH-ANALYS-2026-10-04.md`. Aktuell kod för programplanernas 05-19-tabell/analys, skyddad timplanslista och cellredigering, protected-navigation, klasskolumner samt SQL-provverktyg har lästs. Claudes 05-20-arbetskopieimplementation och 05-21/22-planer har inte behandlats som verifierade leveranser; 05-23 har endast CONTEXT.

## Struktur och ordning

- Alla tolv planer har två uppgifter. Automatiska uppgifter innehåller namn, namngivna filer, konkret åtgärd, verifiering och mätbart klartvillkor. Den mänskliga checkpointen har `what-built`, `how-to-verify` och `resume-signal`.
- Alla planer har `truths`, `artifacts` och konkreta `key_links`. Uppgifternas filförteckningar täcker deras deklarerade produkt- och provfiler.
- Samtliga explicita beroenden finns, är acykliska och ligger i tidigare waves. Inga planer i samma wave delar filer. Waves är 1: 24/25; 2: 26/27; 3: 28; 4: 29; 5: 30/32; 6: 31; 7: 33; 8: 34; 9: 35.
- Det skyddade migrationsverktyget skapas i 05-25 före första SQL-tillämpningen. Gemensam API-harness byggs i 05-26 och utökas sekventiellt i 28/29/30/33. Varje permanent grant följer sin faktiska preflight. 05-34 kör slutmatrisen och är inte ett bakåtberoende.
- Katalogkonventionen skiljer Node-/typ-/lint-/app-/browserkontroller i `web/` från pilotverktyg och dokumentationsbygge i projektroten.

## Verksamhetskraven går att följa

| Krav eller risk | Konkret planansvar |
|---|---|
| Komplett, serverfastställd gymnasiekälla | 25/26: färskt beslutsunderlag, HM-beslut, lås/revision/audit; 28 kräver exakt fastställd skolkälla |
| Rektor och `administrator` inom rätt skola | 27: levande servermandat; 30: både protected-menyn och komponentmount, samt eget källval för admin |
| Frysta skolpaket trots 05-23 D-11 | 27/28: käll- och paketrevisioner/snapshot; 29: ändrat underlag; 32/33: uttrycklig ny källa och jämförelse |
| Programplan → skapa timplan → öppna rätt version | 30 äger produktknappen, skolvalet, anropet, statusläsning vid osäkert svar och navigation till serverns timplans-ID |
| Årskurser, terminer och bevarade klasskopplingar | 27: stabil adapter `ar1/ar2/ar3`; 32: nytt beslut flyttar inga klasser och ärver inte programplanens datumlås |
| Poäng skilda från undervisningstid | 28–31: läsbara källpoäng, separata timfält och ingen dold timkvot; hours/allocated skiljer ofördelat från uttrycklig nolltid |
| Regelanalys för GR/IM/gymnasium | 24/29: profiler, HKK:s gemensamma låg-/mellanram, NO/SO, bekräftad undervisning skild från praktik/mentorstid och block räknade en gång |
| Säker autospar och revisionsbundet beslut | 29/30: rad-CAS, sparqueue, senare egna värden och återläsning; 25/27/32: färsk serveranalys och obligatoriska kontroller |
| Analys som leder till handling | 31: kategori/filter, faktiska/förväntade värden, regelkälla, exakt rad/termin/fokus och bevarade egna ändringar |
| Verifiering och begriplighet | 34: riktig lokal Worker/SQL, dator/telefon, visuella belägg och handbok; 35: separat mänskligt prov |

## Rättningar under granskningen

De tidigare luckorna är åtgärdade: preflightens bakåtberoende, migrationsverktygets för sena skapande, saknad programplansknapp/navigation, ofullständiga admin-grindar, odefinierad serveranalysläsning, saknad representation av ofördelade timceller, otydlig ny-källa-kloning, onamngivna grants, generiska kopplingsbeskrivningar och ofullständigt checkpointformat. Gemensamma prov- och auditfiler har fått sekventiellt filägande.

## Förutsättningar och kvarstående storleksrisk

05-24 kan genomföras tidigt som ren GR/IM-analys. Gymnasieflödet får inte öppnas innan 05-20–05-22 är levererade/verifierade och 05-23 har genomförbar plan, full rad-/valblocks-/skolpaketsmodell och faktiska paritets-/integrationsbevis. Yrkesprofiler kräver dessutom 05-17. Dessa är öppna leveransgrindar, inte uppnådda resultat.

05-26, 28, 29, 30 och 33 har respektive **11, 10, 10, 12 och 9** deklarerade filer, vilket överskrider skillens normalstorlek om fem filer. Överskridandet är uttryckligt och motiverat av en sammanhängande verksamhetsfunktion med slutna rutter, audit, separata grants och gemensam preflight. Det är en genomföranderisk som måste följas, men inget återstående blockerande planfel. Vid ytterligare funktioner eller nya subsystem ska steget delas innan genomförande.

Gamla programplansfel, ofullständiga delsviter, setupfel och uteblivna mänskliga svar får inte omklassas till godkända resultat. ADMIN-02/03/04 och hela fas 5 är inte slutförda av detta planeringspaket.
