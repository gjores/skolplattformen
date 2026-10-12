# OPERATIONAL-04 — ny version och ändrat innehåll

Implementerat och verifierat lokalt 2026-10-12.

Fastställd/ersatt gymnasietimplan har **Skapa ny version**. Aktuellt underlag läses först. Finns ett pågående utkast/förslag öppnas det utan ny skrivning. Annars jämförs timraderna mot föregångaren och skapandet kräver explicit bekräftelse; klasskopplingar ligger kvar. Avbruten dialog lämnar årsval användbart. Befintligt skydd för okänt skapandesvar och samtidiga ändringar består.

Källvarningen jämför hela frysta källinnehållet med aktuell källa på servern. Revision, status, utbildningsrevision och arkivmetadata ensamma räknas inte som nytt innehåll, i enlighet med beslutsvalideringen. Aktuell identitet/status/revision valideras mot den fullständiga källan. Den ursprungliga kopian ändras aldrig. SQL230000 ändrar en intern läsprojektion, inte planernas innehåll eller grants.

Verifierat: 25 gymmodell/serverprov PASS inklusive oförändrat innehåll vid fastställande, faktiskt ändrade terminer, saknad källa och inkonsekvent metadata. Fyra nya UI-fall på dator/telefon för nyversion/befintligt utkast ingår i 56/56 full UI PASS. Typ/lint/bygge/handbok PASS före slutinstallation. Separat source-bundet rollback-/applyverktyg kontrollerar enbart tillåten SQL-definition och alla verksamhetsrader; både verifiering med rollback och lokal installation ger 4/4 PASS med bevarade 20 verksamhetstabeller, DDL och rättigheter. SA25 och BF25 ingår i källinnehållsprovet. Rapporter: `/private/tmp/operational-source-verify.json` och `/private/tmp/operational-source-apply.json`. Installerat Worker-bygge 0ab2064 har därefter BF25/BA25 vardera 18/18 verkliga API/UI-kontroller PASS, inklusive ny fastställd version utan automatisk flytt av befintlig klass.
