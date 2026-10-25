---
created: 2026-10-26
title: Smart och förklarad lärarrekommendation per tjänsterad
area: tjanstefordelning
status: pending
phase: "05.1"
related_phase: "05.4"
source: användarprov etapp 2 (3012, kandidat 1eb5467)
---

# Användarönskemål

Användaren vill att rekommendationen av lärare per tjänsterad blir riktigt bra genom att väga flera skäl: **behörighet**, **har haft ämnet eller kursen tidigare**, **har klassen i andra ämnen**, **är behörig** och liknande. Det kopplar till kandidatpanelen i [matrisresearchen](../../research/TJANST-MATRIS-ALTERNATIV.md).

# Läge i dag

Förslagen (05.1-17, `tjanst_year_recommendations`) bygger bara på tidigare planering:
- `previous_same_class_row`: samma klass och ämnesrad
- `previous_same_class`: samma klass
- `previous_same_row`: samma ämnesrad

Egen andel och giltighet visas. Behörighet visas som okänd. Förslag tilldelar aldrig (D-25–D-27).

# Föreslagna skäl (var och en förklaras separat, inget dolt poäng)

| Skäl | Källa | Läge |
| --- | --- | --- |
| Behörig för ämne, skolform och nivå | Skolverkets underlag (fas 05.4, LLEG-03) | Okänt till 05.4 finns; okänt ska aldrig visas som obehörig |
| Har undervisat kursen eller ämnet tidigare (vilken klass som helst) | Publicerade tjänstefördelningar | Delvis (bara samma ämnesrad); utöka till kurskod och nivå |
| Har klassen i andra ämnen i år eller i fjol (kontinuitet i lärarlaget) | Årets plan och publicerade planer | Nytt |
| Samma kull i fjol, följer klassen till år 2/3 | Publicerade planer och klass–timplankoppling | Finns (samma klass) |
| Mentor för klassen | Specialuppdrag mentor | Nytt |
| Undervisar redan kursen i en annan klass i år (samläsningsmöjlighet) | Årets plan | Nytt (kopplar till todo om kursklick) |
| Egen andel och giltighet på skolan, delår | Personal | Finns (inget kapacitetsbesked, D-10) |
| Nuvarande fördelad summa HT/VT/år | Årets plan | Kan visas som fakta, inte som "ledig tid" utan nytt beslut |

# Principer

- Sortera och gruppera förslagen efter starkaste förklarade skäl, med skälen synliga per kandidat ("Behörig · undervisade Engelska 5 i TE26A 2026/27 · har TE27A i Svenska"). Ingen svart låda och ingen automatisk tilldelning eller massaccept utan förhandsvisning.
- Okänt (saknat behörighetsunderlag eller historik som inte gick att hämta) skiljs från negativt besked. Källa och datum anges för varje skäl.
- Skolgränser och mandat: bara rektors egna skolor (D-11). Andra skolors uppdrag syns inte.
- SS 12000: avstäm personal-ID, Activity/Group och duty-/assignment-begrepp. Behörighetsdata har eget källansvar (05.4).
- Prestanda: rangordningen beräknas på servern i samma läsning som radstödet och behåller förslagsevidens och hash (aktualitetskontrollen från 05.1-18).

# Nästa steg

Ta in idén i skisserna av kandidatpanelen, besluta vilka skäl som ingår före respektive efter 05.4, och planera som ett eget steg (ny etapp i 05.1 eller inom 05.4 med 05.1 som mottagare). Inget är beslutat eller byggt.
