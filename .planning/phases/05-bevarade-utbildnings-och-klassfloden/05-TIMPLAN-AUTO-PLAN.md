---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TIMPLAN-AUTO
type: execute
status: complete
completed: 2026-10-16
autonomous: true
---

# Autofördelning av timplanens total

Beställt 2026-10-16: autofördelning likt programplaner, modal som frågar efter totalt antal timmar och informerar om GUT. Avgränsat till befintlig skyddad gymnasietimplan. Inga nya databasfält eller ändrade beslutsmandat.

## Beslut och genomförande

- Dialog med total undervisningstid för hela planen, GUT för känd Gy25-profil och marginal/underskott. GUT är miniminivå, inte rekommenderad budget eller bevis på genomförande. Länk till Skolverket. Inget tyst antagande för okänd profil.
- Förval fyller tomma celler och behåller angivna värden inklusive noll. Uttryckligt alternativ fördelar om hela planen. Hela planen gäller även vid filtrerad årskurs.
- Deterministiskt heltalsförslag proportionellt mot programplanens poäng per aktiv termin, exakt önskad totalsumma. Inaktiva celler förblir null. Max2 000 per cell. Granskad APL-tid ingår i totalen; förslaget får inte understiga några sparade APL-minuter (avrundat uppåt till hela timmar per cell). APL-perioder/avsikt/ämnen ändras inte.
- Samma rena beräkning i klient och server. Ny liten endpoint använder befintliga radkommandon i en gemensam skyddad transaktion: alla ändringar sparas eller inga. Oförändrade mandat, skolkontroll, CAS, MFA och obligatorisk audit. Inget automatiskt återsändande vid okänt sparresultat.
- UI återanvänder dialog och aktivitet/navigation; osparade inline-/APL-ändringar blockerar konkurrerande autofördelning. Förslag granskas före uttryckligt sparande. Vid konflikt/okänt resultat måste aktuell plan läsas och nytt förslag granskas.
- Modell/serverprov, dator/telefon, relevant typ/lint, separat kandidatbygge, actual Worker/OIDC-prov och exakt lokalt appbyte. Ingen ombyggnad av körande dist-protected. Handbok och dokumentationsbygge ingår. Scoped commit/push enligt AGENTS.

## GUT-källa och SS 12000

Skolverkets [Undervisningstid, lärotider och schema](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/undervisningstid-larotider-och-schema), kontrollerad2026-10-16: högskoleförberedande nationella program minst2 180 timmar; yrkesprogram frånHT2023 med2 700/2 800 poäng minst2 625/2 720 timmar. Individuella bortval/utökning behöver egen bedömning. Återanvänd den befintliga Gy25-profilen, inte äldre2 430 som generell yrkesram. Poängbaserad fördelning är förslag, ingen rättslig ämnesnorm.

SS 12000:2024 utgåva4/OpenAPI2.1.0 enligt projektets aktuella research: intern planerad ämnes-/terminstid. Ingen CalendarEvent, Attendance eller Placement skapas. Stabila plan-/rad-/skol-ID:n och klasskopplingar bevaras; inga nya externa objekt/ID:n eller anspråk på standardutbyte.

## Arbetsfördelning och verifiering

GSD-exekvering: root äger modell/server, kontrakt och integration. UI-agent äger dialog, inkoppling, UI-prov och handbok. Actual-agent förbereder och kör isolerat faktisk-provsverktyg när kandidaten är byggd. Root granskar slutresultat, dokumenterar och levererar. Kriterier: AUTO-01 exakt summa/proportioner, AUTO-02 bevarande/APL, AUTO-03 GUT och begriplig dialog, AUTO-04 atomisk skrivning/mandat/återhämtning, AUTO-05 samma testade lokala kandidat. Mänsklig acceptans antas inte av tekniskt PASS.

## Resultat

AUTO-01–05 tekniskt verifierade och samma kandidat lokalt levererad på3012. [Samlad verifiering, evidens och användarprov](05-TIMPLAN-AUTO-SUMMARY.md). Mänsklig begriplighetsacceptans väntar; tidigare APL-UX-prov kvarstår.
