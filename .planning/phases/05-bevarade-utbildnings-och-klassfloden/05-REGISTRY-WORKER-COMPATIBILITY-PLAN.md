---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: REGISTRY-WORKER-COMPATIBILITY
requirements: [ADMIN-01]
status: complete_bounded
created: 2026-10-14
---

# Äldre skolimport: kompatibelt registeranrop

## Avsikt och beslut

Användaren har godkänt skolflödets användarprov och beställt fortsatt fasarbete tills nästa mänskliga prov behövs. GSD-genomgången bekräftar att äldre kundadministratörsväg fortfarande använder `redirect: error`, vilket faktisk workerd-diagnos redan visat inte stöds. Det är ett avgränsat kompatibilitetsfel. Nya huvudmannavägen har motsvarande rättning och förblir oförändrad.

## Genomförande

1. Ändra båda fetch-anropen i `web/lib/server/skolverket.ts` till `redirect: manual`. Omdirigeringar får inte följas; validering, timeout, optional kommunuppslag, behörighet, importdata och audit behåller samma kontrakt.
2. Utöka `web/lib/skolverket.test.mjs` för båda transportgrenarna och avvisad redirect. Kör riktade Nodeprov, typ/lint och riktig workerd med samma adapter mot publik Skolverkettjänst. Ingen databas behövs för adapterprovet.
3. Bygg skyddad app, jämför testad artefakt vid leverans på 3012 och kontrollera health/läsning. Rårapporter hålls privata; korta resultat och hashvärden dokumenteras. Ingen ny migration, ändrad behörighet eller nytt användarbeteende kräver omprov av redan godkända skolsteg.
4. Sammanställ fasens aktuella krav mot senare leveranser. Ge endast återstående mänskliga moment som nästa checkpoint. Historiska metadata-/auditavvikelser hålls öppna och prestandaproblemet ligger kvar i backloggen enligt användarens tidigare önskemål.

## Färdigt när

Ordinarie kundadminadapter når det publika registret i faktisk Worker utan otillåtet redirectläge, transporttesterna visar att redirects inte följs, levererat bygge är känt och fasens nästa mänskliga prov är konkret. Provet av adaptern är inte ett nytt slutprov av hela kundadministrationens skrivkedja och påstår ingen verklig kommunanslutning.

Resultat: [SUMMARY](05-REGISTRY-WORKER-COMPATIBILITY-SUMMARY.md).
