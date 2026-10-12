---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: DECISION-01
status: completed
requirements: [ADMIN-02, ADMIN-04]
---

# Beslutsprofiler och kontrakt

Genomfört 2026-10-12. Primärkällor och tillämpningsgränser finns i [regelgranskningen](../../research/DECISION-RULES-2026-10-12.md). Den aktiverbara profilen är högskoleförberedande Gy25 med 2 500 poäng och 2 180 undervisningstimmar; yrkesprogrammets fullständiga profil är fortsatt en uttrycklig lucka. Ingen generisk ready-flagga eller manuellt kryss får ersätta en okänd profil.

`web/lib/plan-decision.ts` definierar slutna kommandon, exakta plan-/granskningsrevisioner och innehållsfingeravtryck, återsändningsmotivering, granskningskontroller, separat granskningsstatus, historik och rollinkorg. Programplanens befintliga grundstatus bevaras. Tre kontraktsprov kontrollerar bland annat fel version, dolda extra fält, obligatorisk motivering, muterbar fastställd status och falska rollantal.

Verifierat: tre kontraktsprov PASS; projektets typkontroll och lint passerade under integrationsarbetet. Totalt 50 relevanta modell/serverprov har också passerat för efterföljande adapterarbete. Detta är inte SQL-, verklig Worker-, användar- eller leveransbevis. Se efterföljande planer för dessa kontroller.

Filindelningen samlar typer och parsrar i en fil i stället för separata föreslagna kontraktsfiler. Beslutsanalysen ligger separat på servern. Profilen ändrar inte katalogupplösningens historiska decisionReady-kontrakt eller stöd för GR/IM. ADMIN-02/04 och full fas 5 markeras inte klara av detta avgränsade resultat.
