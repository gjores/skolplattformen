---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TIMPLAN-APL-AUTO
type: execute
status: delivered-awaiting-user
depends_on: [TIMPLAN-HOURS-CHECK]
autonomous: true
---

# Autofördelning med tillräcklig APL-ram

Användaren vill att autofördelningen även föreslår tillräckligt med APL i yrkestimplanen. Behåll senare periodplanering och befintligt timplansgodkännande. Detta är ett proportionellt timförslag, inte ett beslut om vilket undervisningsinnehåll som får förläggas på arbetsplats.

Kravspårning: avgränsad användarbeställd förfining av fas 5:s planerings-/beslutsflöde inom ADMIN-02. Befintliga klass- och versionsrelationer inom ADMIN-04 ska bevaras. Slutresultatet länkas från STATE/PROJECT/ROADMAP; detta innebär inte full acceptans av dessa krav.

## Genomförande

1. Root utökar den rena modellen och `/gym/fordela`-parsern med valfritt `apl: {totalHours, rowKeys}` för yrkesprogrammets års-APL-tabell. Befintlig APL minskas aldrig, även utanför valda rader. Underskottet till minst 345 timmar fördelas på uttryckligt valda fasta programgemensamma, inriktnings- och fördjupningsrader efter årets poängvikt. Ingen implicit block-/alternativ-/gymnasiearbetsfördelning. Aktiva tomma APL-celler blir noll, inaktiva förblir null. Skoltimmar delar återstående total, som måste räcka till känd GUT. Gamla anrop utan APL-förslag bevarar sitt beteende.
2. Backend vidarebefordrar APL-valet, skriver hela matrisen genom befintligt `save_rows` och jämför återläst APL med förslaget. Äldre timmodell nekar den nya parametern. Vid legacy-Autofördelning och övergång till års-APL används APL-underlagets `timplanRevision`, med äldre `revision` endast för äldre kontrakt. Befintlig SQL har atomisk bulkoperation, dubbel kontroll av skolmandat, CAS, kvitto och periodgolv; ingen migration behövs.
3. Root ger förhandsvisning med skoltimmar, APL, total och synliga ämnesval. Skrivningen sker först när användaren accepterar förslaget. Högskoleförberedande program får inga APL-val. Uppdatera `docs/handbok/timplaner.md` och berörd APL-instruktion; bygg handboken.
4. Verifiera faktisk modell, serverkoppling, HTTP-skydd och användarflödet på dator/telefon. Isolerat verkligt Worker-/SQL-prov ska visa ny APL-ram, exakt total, bevarad befintlig APL, periodgolv, rollback, CAS och minsta mandat. Inga aktiva databasändringar krävs. Aktuell appöverföring hanteras separat av root med exakt kandidat och verifieringsbevis.

## Verifiering och gränser

Modell: exakt 345 timmar, tidigare 400 timmar bevarade, delvis befintlig APL, årsfördelning, avrundning, maxkapacitet, explicit noll/null, inga användbara val, otillräcklig total, okänd profil samt legacy/högskoleförberedande.

Server: nya APL-celler accepteras endast när de matchar förslaget; ändrat kvitto eller återläst matris avvisas och hela transaktionen rullas tillbaka. Äldre revisioner får inte förväxlas med APL:s separata räknare. Historisk anropsform fungerar fortsatt. Samma origin-, MFA-, roll- och skolmandatsgrindar gäller. Modell/serverprov är syntetiska och beskrivs inte som faktisk databas- eller standardanslutning.

## SS 12000

Baslinje: SS 12000:2024 utgåva 4 och OpenAPI 2.1.0 enligt projektets tidigare avstämning. Timmar, förslag och års-APL är interna budgetar. De skapar inte Attendance/Placement, arbetsplatsplacering, elevnärvaro eller intyg om genomförande. Stabil timplans-, utbildnings-, skolenhets-, rad- och versionsidentitet samt existerande klassrelationer och källansvar bevaras. Ingen ny extern objektmappning eller verifierad standardanslutning tillkommer.

## Ansvar och resultat

Root äger modell/parser, produkt-UI, slutverifiering och leverans. UI-/handboksdelagent äger simulerade användarprov och handboken. Backenddelagent äger serverkoppling och regressionsprov. Separat verifieringsagent äger isolerat faktiskt API-/browserprov. Root sammanfattar resultat i `05-TIMPLAN-APL-AUTO-SUMMARY.md` och samordnar push efter avgränsade kontrollerade commits.

## Genomfört2026-10-18

[Sammanfattning](05-TIMPLAN-APL-AUTO-SUMMARY.md) och [verifiering/lokal leverans](05-TIMPLAN-APL-AUTO-VERIFICATION.md): modell/server45, UI22+24 och slutligt mobilprov2, faktiskt Worker/OIDC17 samt bevarande76 tabeller PASS. 3012 kör29b870f utan migration. Ny mänsklig begriplighetsbedömning och full fasacceptans återstår.
