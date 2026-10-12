---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: VOCATIONAL-01
status: implemented_and_model_server_verified
completed: 2026-10-12
requirements: [ADMIN-02, ADMIN-04]
---

# Nationell Gy25-yrkesprofil i modell och server

Samtliga tolv nationella yrkesprogram har explicit kod-/kategoriprofil: BF25/HT25/VO25 använder 2700 poäng och 2625 timmar; övriga nio, inklusive FR25, använder 2800 och 2720. Okänd kod/kategori får ingen fallback. De sex högskoleförberedande Gy25-profilerna behåller 2500/2180.

`programplan-profile.ts` styr ram och oberoende beslutskontroll. Frysta behörighetsnivåer kontrolleras, alternativsvenska räknas en gång och APL visas som manuell kontroll. Underlaget ändras inte. Programramen är fortfarande skild från skolans utbudspaket och individuella bortval. Planering för kommande elevkullar tillåts, men yrkesstart från 2028-07-02 har konkret beslutsspärr eftersom modellen saknar yrkesprov. [Källor och avgränsning](../../research/VOCATIONAL-RULES-2026-10-12.md).

## Verifiering

`node --test lib/programplan*.test.mjs lib/server/gym-timplan.test.mjs lib/server/plan-decision.test.mjs` i `web/`: **141/141 PASS**, känd exit 0. Logg i ignorerad `web/outputs/vocational-model-tests.log`.

- Alla tolv program och samtliga inriktningar i den verkliga katalogsnapshoten når rätt poängsumma med kompletta block och terminer.
- 24 positiva programplan-/timplansfall använder oberoende serverprojektion; timplanerna når exakt 2625 eller 2720 timmar.
- En poäng eller en timme för lite, saknad manuell bekräftelse, datum före Gy25 och inkompatibel framtida yrkesprovskull nekas.
- Befintliga kontrakt för källhash, kanoniska rader, mandat, MFA, CSRF, auditrollback och högskoleförberedande planer passerar.

Första breda körningen gav 140/141: en historisk assertion för BA25 förväntade radtotal 2200 som fördelningsmål. Den uppdaterades till den nu verifierade fulla ramen 2800; befintliga radpoäng förblir 2200 tills återstående fördjupning valts. Detta var en nödvändig testanpassning, inte ett borttaget negativt beteendeprov. Första nya timplansfixturen lade för mycket tid i en cell och avvisades av oförändrad gräns 2000 timmar; den korrigerade fixturen fördelar totalen över samtliga aktiva celler.

## Leveransgräns

Detta resultat gäller modell och serveradapter med syntetiska transaktionssvar. SQL-paritet, faktisk lokal Worker, roll-UI, byggen och lokal installation redovisas separat av 05-VOCATIONAL-02–04. Inga befintliga planer, DB-rättigheter eller Git-historik ändrades av detta delsteg. Hela ADMIN-02/04 och fas 5 markeras inte klara här.
