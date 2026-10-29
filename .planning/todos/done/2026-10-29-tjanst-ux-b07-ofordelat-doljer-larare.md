---
created: 2026-10-29
title: "Behåll valbara lärare vid behovsfilter"
area: tjanstefordelning
status: completed
completed: 2026-10-29
verification: synthetic_ui_protected_build_local_health
deployment: local_3012_1d2b0ec
phase: "05.1"
report_id: B07
priority: P1
related_requirements: [TJANST-01, TJANST-03]
---

Användarens skärmbild visar 0 av 5 lärare och bara Vakant när Ofördelat väljs. Kolumnurvalet utgick felaktigt från lärare som redan hade tid på de synliga behoven. Äldre test förväntade detta felbeteende.

Användaren förtydligade att samma problem gällde klassfilter. Slutlig rättelse i 05.1-39: alla lärare visas som standard; klass/ämne/kurs/avvikelser filtrerar behov, explicit lärarfilter har fortsatt företräde. Visa relevanta lärare är frivilligt; Ofördelat visar alltid alla. Direkt tilldelning/Ångra prövade med klass/ämne/avvikelser samt Ofördelat utan Visa alla-klick. 40 lärare, explicit relevansurval och sparad lins prövade. UI248, Node8, typ/lint, skyddat bygge och handbok PASS. Installerad på 3012 som 1d2b0ec, hälsa PASS. Ingen ny faktisk OIDC/databasserie eller mänsklig acceptans. SS 12000:s objekt/identifierare och serverkommandon oförändrade.

[Resultat](../../phases/05.1-tjanstefordelning/05.1-39-SUMMARY.md). [Rapport](../../../work/ux-review-2026-10-29/rapport.html).
