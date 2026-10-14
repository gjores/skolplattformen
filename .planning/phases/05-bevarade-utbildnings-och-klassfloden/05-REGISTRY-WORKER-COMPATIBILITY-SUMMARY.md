---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: REGISTRY-WORKER-COMPATIBILITY
requirements: [ADMIN-01]
status: complete_bounded
worker_build_revision: f4987b60cd691df9faebe2c4403126cf1bf543bd
---

# Registeradaptern fungerar i Worker

Den äldre kundadministratörens registeradapter använder nu `redirect: manual` i både skoluppslag och valfritt kommunuppslag. Primär omdirigering ger registerfel; sekundär omdirigering följs inte och lämnar kommunnamnet okänt enligt tidigare optional-kontrakt. Behörigheter, importdata, audit och användarinteraktion är oförändrade. Ingen migration eller ny verksamhetsdata behövdes.

27 riktade Node-prov, typkontroll och lint för berörda filer passerar. En separat faktisk workerd-probe bundlar samma adapter och läser Skolverkets publika tjänst: den tidigare källan ger HTTP503, rättad källa ger HTTP200 med skoluppgifter/adress. Före-/efterkällor och rårapporter är hashbundna i [bevisindex](../../../work/pilot/results/registry-worker-compatibility-20261014.json). Första proben hade ett eget startfel eftersom adapterkonstanter exporterades som Worker-entrypoints; wrappern rättades före före-/eftermätningen. Det startfelet är separat bevarat.

Skyddat appbygge PASS. Health och anonym importspärr passerar i isolerad workerd. Samma **197 filer** från `f4987b60cd691df9faebe2c4403126cf1bf543bd` levererades bytekontrollerat till **3012**. Artefakt-SHA256: `d6988ebc52ff37fab2d883c03437bcc0f2c52fd45672c1b80fe385dacc28b2c6`. Föregående bygge bevarat privat; hemlighetsfiler kopierades inte. Slutlig läsande lokal OIDC-kontroll passerar 5/5 för huvudmannens Skolor, konfigurationsläge, programplaner, timplaner och bevarade verksamhetstabeller.

Detta är ett aktuellt verkligt API-/runtimeprov av **adaptern**, samt appens läsande leveranskontroll. Hela äldre kundadministrationens importsparande har inte körts om och beskrivs inte som nyverifierat. Huvudmannens separata fulla HTTP/SQL-importbevis finns i [SCHOOL-REGISTRY](05-SCHOOL-REGISTRY-VERIFICATION.md). Inget användarbeteende ändrades, så skolprovet behöver inte upprepas och handboken behövde ingen ändring.

Användaren har godkänt skolflödets användbarhet. [Samlad aktuell fasbedömning](05-CURRENT-ACCEPTANCE-REVIEW.md) hittar ingen ny beslutad implementationslucka. Nästa mänskliga checkpoint är endast [kullkopiering](05-COPY-REMAINING-USER-TRIAL.md). Prestandabacklogg, historiska metadata-/auditavvikelser och separat pilotacceptans består.
