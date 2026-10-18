---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: VOCATIONAL-EXAM-2028
status: complete
type: execute
autonomous: true
---

# Yrkesprov och gymnasiearbete för nya yrkeskullar

Användaren beställer 2026-10-18 uttryckligen stöd för valet enligt reglerna, inskick till huvudmannen och tydligare meddelande. Den tidigare generella 2028-spärren ersätts med versionsbunden prövning. Inga ändrade verkliga startdatum används för att kringgå reglerna. Fas 5/ADMIN-02 berörs; kopiering inom ADMIN-03 och klass-/versionsrelationer inom ADMIN-04 bevaras. Full krav-/fasacceptans följer inte automatiskt.

## Beslut och regelgräns

Yrkesprov om ett tillämpligt prov finns; gymnasiearbete när sådant prov saknas. Okänt läge får inte automatiskt bli gymnasiearbete. Kontrollerat underlag måste följa den aktuella programplansversionen och vara synligt för huvudmannen. Ingen katalog över publicerade tillämpliga yrkesprov är verifierad ännu; manuell källgranskning får inte presenteras som maskinellt verifierad provtillgänglighet. Se aktuell research för primärkällor och avgränsning av HT2028.

## Vågor och ansvar

1. Research och kodinventering parallellt. Researchdelagent verifierar primärkällor. Backenddelagent inventerar SQL, frysta underlag och kopie-/beslutskedja. UI-delagent inventerar användarflöde och prov.
2. Root inför ett strikt, bakåtkompatibelt val i `basisReference.examination` och motsvarande fryst timplanskälla, tabell/analysnamn och APL-/budgetkontroller. Backenddelagent äger migration, API/server, atomisk sparning, audit, mandat, revisionskontroll, beslut/hash och kopiering. UI-delagent äger tydligt redigeringssteg i sparade utkast och läsbar huvudmannagranskning, med dator-/telefonprov. Researchdelagent uppdaterar handbok efter fastlagt beteende.
3. Modell/server/SQL och UI kontrolleras. Separat skyddat bygge, verkligt Worker-/OIDC-/browserprov mot egen databas med syntetiska data. Inga aktiva verksamhetsdata kopieras. Installation och exakt appöverföring förbereds med originalbevarande, granskas och genomförs inom användarens uttryckliga beställning. Ingen destruktiv dataändring planeras.
4. Relevanta commits pushas på aktuell gren. STATE/PROJECT/ROADMAP och samlad verifiering uppdateras. Aktuell drift före arbetet är29b870f; tidigare leveransbevis finns i TIMPLAN-APL-AUTO-VERIFICATION.

## Kontrakt som fastställs före implementation

Valet är optional för gamla kontrakt, obligatoriskt före nytt beslut för berörda yrkeskullar. Objektet binder modell, exakt utbildningsstart, kontrolltidpunkt och officiell källa med beskrivning. Avsaknad är outrett. Valet går genom en separat granskad ändring och får inte godtyckligt bytas via annan innehållsskrivning. Ny kull nollställer bedömningen; ny version inom samma utbildning får bevara ett tydligt granskningsbart underlag. Frysta tidigare timplaner och beslutskvitton ändras inte.

Hundrapoängsraden behåller intern stabil identifierare `meta:diplomaWork`; användarens radnamn visar Yrkesprov eller Gymnasiearbete. Ingen extra100-poängsrad eller dubblerad timbudget skapas. Timplan och senare APL måste använda samma frysta val. Undervisningstimmar och APL-minima kvarstår.

## Kontroller

2027 och högskoleförberedande oförändrat; 2028 utan val nekas; båda lagliga alternativen med granskat underlag kan skickas/godkännas; ogiltig källa/datum/startbindning nekas; UI/API och SQL överens; låg GUT/APL fortsatt nekad; ny kull kräver ny granskning; nyversion bevarar historik; gamla kvitton återspelas oförändrat; stale revision/hash, fel roll/skola, återkallat mandat och MFA; audit-/radfel atomiskt; faktisk samtidig ändring; browser på dator/telefon; handboksbygge och bevarande vid lokal leverans.

## SS 12000

SS 12000:2024 utgåva4/OpenAPI2.1.0 är projektbaslinjen. Val av avslutande utbildningsmoment är en intern planegenskap, inte Attendance, Placement, elevresultat eller en tilldelad examen. Stabil programplans-/utbildnings-/skolenhets-/radidentitet, klassrelationer och käll-/versionsansvar bevaras. Den historiska interna radnyckeln dokumenteras som en100-poängskomponent, inte en nationell yrkesprovskod. Inga fabricerade externaID:n skapas. Inget externt standardutbyte eller faktiskt elevprov verifieras i denna leverans.

## Resultat2026-10-18

Levererad exakt7102cf8 på3012 efter SQL25, faktisk Worker/OIDC20,9 leveranskontraktprov, atomisk installation med79 originaltabeller och appbyte/läsprov med76 verksamhetstabeller bevarade. Modell201, server/route98, UI20, typ/lint, skyddat bygge och handbok PASS. Actual01 är kvar som diagnostiskt FAIL efter samtidiga externa UI-ändringar; actual02 använder fryst källcheckout och passerar. Mänskligt begriplighetsprov och bredare mobilöverlappning återstår; ingen full fasacceptans antas. Se [samlad verifiering](05-VOCATIONAL-EXAM-2028-VERIFICATION.md).
