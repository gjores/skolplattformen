---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: DECISION-FLOW
type: execution-index
status: planned
autonomous: true
requirements: [ADMIN-02, ADMIN-04]
---

# Genomför hela beslutskedjan

Beställt 2026-10-12. Läs [CONTEXT](05-DECISION-FLOW-CONTEXT.md). Tidigare 05-25/26/32/33 är historiska förslag som denna genomförandeordning ersätter. Inga nya godkännandefrågor krävs för redan beslutade verksamhetsregler.

Varje delplan har två kontrollerbara uppgifter. Utför sekventiellt; de delar statuskontrakt och verifieringsunderlag. Namngivna filer är konkret planeringsgrund; dokumentera en kontrollerad avvikelse om aktuella kodägare väljer sammanhållen annan filindelning, utan att tappa acceptanskriterier.

| Våg | Plan | Leverans och beroende |
|---|---|---|
| 1 | [DECISION-01](05-DECISION-01-PLAN.md) | Aktuella primärkällor, beslutsprofiler och slutna kontrakt. Kan börja direkt. |
| 2 | [DECISION-02](05-DECISION-02-PLAN.md) | Låsta transaktioner, CAS, historik/kvitto/audit och triggers. Kräver regler från 01. |
| 3 | [DECISION-03](05-DECISION-03-PLAN.md) | Skyddade API och verklig Worker-preflight före exakta grants. Kräver 02. |
| 4 | [DECISION-04](05-DECISION-04-PLAN.md) | Tydlig granskning, rollanpassade steg och säker återhämtning. Kräver 03. |
| 5 | [DECISION-05](05-DECISION-05-PLAN.md) | Helkedja dator/telefon, handbok, lokal leverans och kvarstående genomgång. Kräver 04. |

## Nödvändiga leveransbevis

- Positiv kedja programutkast→HM-fastställande och timutkast→R/admin-förslag→HM-återsändning→rättning→nytt förslag→HM-fastställande.
- Timutkast före programbeslut fungerar också till slut, med explicit hantering av förändrad källrevision.
- Servernekar fel roll/kund/skola, återkallat mandat, osparat/gammalt underlag och blockerande regler. Förslag/beslut kan inte kringgås genom direkt cell-/statusskrivning.
- Sparat beslut återläses efter tappat svar utan dubbla beslut. Auditfel rullar tillbaka; gamla beslut, klasslänkar och övriga verksamhetsdata bevaras.
- Okända rättsliga profiler redovisas som blockerade, aldrig som godkänd plan; undersök och implementera belagda profiler inom uppdraget i stället för att behandla gammalt plannummer som evig grind.
- Frysta snapshot/årssnitt, endast skapade timplaner i listan och Programplaners tydliga Skapa/Öppna timplan består.
- Samma verifierade bygge kör lokalt på 3012. Historiska resultat märks inte om. Full fas/pilot och faktiska externa anslutningar kräver sina egna bevis.

## Granskningspunkter innan implementation

Aktuella blockers är kodarbete, inte saknat användargodkännande: program/timguards spärrar nu övergångarna, yrkesram saknar verifierad profil i modellen, sourceChanged använder revisionslikhet och gammalt demo-fastställande är inte skyddat. Kontrollera också aktörskolumnernas FK innan intern serveridentitet lagras; `auth.users` är inte pilotidentitet. Färsk nationell primärkällskontroll återstår i 01. Migreringsnamn 20261012170000/171000 är föreslagna och ska konfliktkontrolleras mot faktisk journal före användning.
