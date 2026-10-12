---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: VOCATIONAL-03
status: completed
requirements: [ADMIN-02, ADMIN-04]
---

# Tydlig återkoppling före fastställande

2026-10-12. Huvudmannen skriver **Kommentar – vad behöver rättas?** och väljer **Skicka tillbaka för rättning** på en inskickad programplan eller timplan. Blank/whitespace-kommentar håller knappen spärrad. Serverns befintliga obligatoriska motivering och återsändningskommando består; inga rättigheter eller återöppningsåtgärder har tillkommit.

Aktuell återsänd plan visar **Tillbaka för rättning**, nästa ansvariga roll och en direkt synlig ruta **Det här behöver rättas**, med senaste återsändningskommentaren, aktör och tid. Tidigare kommentarer bevaras i historiken. Rektors/skoladministratörens inkorg visar **Läs återkoppling och rätta**. Huvudmannen får en granskningsinstruktion; förberedande roller får besked om väntande beslut och tillbakatagande. Fastställda versioner saknar återsändningsåtgärd.

Verifierat med isolerade syntetiska API-svar: full befintlig usability-svit 26/26 PASS på dator/telefon, inga skips eller flakes. Två återsändningar i följd för båda plantyperna verifierar att senaste kommentaren visas och den äldre inte ersätter aktuell återkoppling. Blank kommentar, rätt nästa roll, historik, slutligt innehållslås och saknad returknapp efter fastställande prövas. Tidigare 12 roll-/returprov och fyra riktade dubbla returprov passerade också; resultaten är omkörningar, inte extra unika beteenden.

Mobilens aktuella återkopplingsruta är visuellt granskad för båda plantyperna. Ingen horisontell överströmning. Typkontroll och lint PASS. Rapport: ignorerade `web/outputs/vocational-ui-final-result.json`; bilder i `web/test-results/`. Verklig databas/API och lokal leverans följer i VOCATIONAL-02/04. Ingen mänsklig begriplighetsacceptans påstås.
