---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-12
status: complete
acceptance: accepted_user_reported
updated: 2026-10-16
---

# Lokal leverans klar och användarprov godkänt

Användaren godkände de fem permanenta lokala migrationerna och bytet på 3012 med ”absolut det godkänns” 2026-10-16. Installationen är genomförd. Samma testade produktrevision `c8f3256fc869c0002c44fd1c181cd6a27d0df6ab`, 204 filer och artefakt-SHA256 `9ef82e4d125e231082ec70e4ba2f1b3dd0df7a7d1dbed40a820a4eebc6871c2e`, kör nu på lokal 3012. Ingen extern driftsättning eller nytt produktbygge har gjorts.

## Resultat och bevarande

- Nytt läsande installationsförprov PASS. `apply-named-timplans.mjs --apply` PASS, bekräftad commit och stängd databasanslutning. Samtliga 62 originaltabellers gamla kolumner är bevarade, liksom tidigare rättigheter och migrationsjournal. Gamla timplaner har fått serien Grundfördelning; befintliga ID:n, timmar, versioner, beslut och klasskopplingar består.
- `deliver-named-timplans.mjs --verify` och det andra `--apply` PASS. Exakt samma 204 byggfiler, privat konfiguration och 62 verksamhetstabellers hashvärden kontrollerades före/efter.
- Faktisk lokal OIDC/MFA och läsning av klassorganisation samt namngivna gymnasietimplaner gav 200 med motsvarande auditbevis. Egen appsession och GoTrue-session togs bort; tidigare sessioner, audit och verksamhetsuppgifter bevarades. Endast exakt bundna egna inloggningsmetadata fick ändras.
- Leveransverktygets regressioner: 67/67 PASS efter rättningen nedan; inkluderar de tidigare 48 snäva JWT-proven. Logg `/private/tmp/named-delivery-tools-recovery.log`. Produktens tidigare 38 faktiska API-/browserkontroller på dator/telefon, 13 callbacks, SQL-konkurrens, typ/lint, appbygge och handboksbygge består för oförändrade produktbytes. Se [samlad verifiering](05-NAMED-TIMPLANS-UX-VERIFICATION.md).

## Avvikelse och återhämtning

Första appbytet stoppade i läskontrollen eftersom den återanvända syntetiska utbildningen saknade en gymnasietimplan. Detta var ett fel i leveransens provunderlag. Verktyget gjorde full egen sessionscleanup och återställde föregående appversion med verifierade bytes och konfiguration. Databasmigrationerna var redan installerade och förblev installerade.

Leveransverktyget kontrollerar nu att en befintlig gymnasietimplan finns före processbytet. Ett återställt försök får endast användas som nästa processbevis om cleanuphash, kompletta bevarandebevis, aktuell konfiguration, verksamhetshashar och återställda processers identitet stämmer. Tolv nya positiva/negativa regressioner täcker återhämtningen. En annan befintlig syntetisk utbildning valdes enbart för läsning; inga klasser, timplaner eller länkar skapades eller ändrades för leveransprovet. Det andra försöket passerade.

## Exakta lokala bevis

| Bevis | Privat rapport | SHA256 |
| --- | --- | --- |
| Installerade migrationer | `/private/tmp/named-install-approved-apply.json` | `71ed0af1b313d89fb2509f34156cb93ee0ef4c01d2a45e84e602209a7bd52bbd` |
| Första byte, återställt | `/private/tmp/named-delivery-apply.json` | `500f5e6f44bbf20e9a14dd54113e54e64ffac89fe4e481f839ad43c03bfe4839` |
| Slutligt förprov | `/private/tmp/named-delivery-verify-second.json` | `49df4db5098f5a0b19ef9eeaf0735a79cd704e063405b4bb3b1fb99cd8c5a85b` |
| Slutlig leverans | `/private/tmp/named-delivery-apply-second.json` | `ee9e5edd8c0e6a7393074523ef6be36a39a80840cc67cf31e727410e47eafd11` |
| Läsande OIDC och cleanup | `/private/tmp/3aebe835-4c80-4bb5-8327-7f3931c901d6-readonly/delivery-readonly-3390e749-2cf8-4931-a2db-6020e288737b.json` | `37369e533eed84c78afee01e619d346959030a23897d695a02a8376067bef068` |

## Användarbedömning 2026-10-16

Plan 12:s leverans och förberedda [begriplighetsprov](05-NAMED-TIMPLANS-UX-USER-TRIAL.md) är klara. Paketets tolv genomförandeplaner är tekniskt slutförda. Användaren svarade ”funkar bra” efter leveransen och provuppgifterna. Det registreras som användarrapporterat godkännande och gapet CLASS-COHORT-UX-01 avslutas. Enhet, enskilda delsteg och eventuell hjälp särredovisades inte. Tidigare funktionsgodkännanden består; historiska 88/100 planer och 3/8 faser ändras inte. SS 12000-mappningen består, men inget externt standardutbyte eller fullfasacceptans påstås.
