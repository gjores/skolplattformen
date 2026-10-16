---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-07
status: complete
subsystem: apl-sql-integration
requires: [APL-04, APL-04A]
affects: [APL-08, APL-09]
---

# APL-07 – installerad SQL, kopiering och samtidighet

Slutbevis `/private/tmp/apl-full-final.json`: **65 kontroller och12 observerade överlapp PASS**. Körningen använder en egen strukturidentisk databas utan kopierade verksamhets-/authrader, med syntetiska utbildningar, två klasser, fyra läsårslänkar och elevplacering/medlemskap. Samtliga65 originaltabeller och530 ursprungliga syntetiska rader bevaras efter kommandoproven. Paketrollback återställer alla rader, schema och ACL exakt. Cleanup är komplett. Samordnaren kontrollerade alla99 källhashar mot aktuella filer.

## Bevis

- Faktisk PostgreSQL-inloggning som `skolplattform_worker`, både `session_user` och `current_user`. Session/mandat är syntetiska verifieringsuppgifter; HTTP/OIDC är inte provat här.
- Rektor, administratör, huvudman, verkligt läraruppdrag, annan skola/kund, utgånget/återkallat mandat och arkivering prövas. Skrivningar utanför mandat lämnar inga delresultat.
-17 regelvarianter jämför exakta SQL-/TypeScriptblockerare: bl.a. okänd form, lärling, blandveckor,14 veckor, datumkapacitet, återanvänd ISO-vecka, läsår, innehåll och allokering. Komplett15-veckorsunderlag ger20 700 inkluderade minuter.
- Gränsfall avvisar101 perioder, främmande rad/period, inaktiv termin, negativa minuter och dubbla tupler. Obligatoriskt SQL-auditfel rullar tillbaka verklig sparning, revision och kvitto.
-12 samtidighetsfall observerar två olika backend-ID:n, faktiskt lås och blockerande session: samma kommando med samma/olika payload, save/save, save/radtid, save/bekräftelse åt båda håll, save/submit åt båda håll, approve/save, nyversion/save, copy/källsave och återkallning/köad save. Förlorande skrivning nekas eller exakt replay sker enligt kontraktet.
- Defensiva kopieprov behåller alla förlorade minuter och innehåll vid otillräcklig total eller overifierad källa. Två perioder i samma cell prövas samlat. Exakt1 000 ärvda granskningsposter tillåts;1 001 eller1 000 plus nytt bortfall avvisar hela kopieringen. Ägaruppsatta helperfixturer märks `private_helper`; produktguards är aktiva och dessa fall framställs inte som publika UI-flöden.
- Äldre beslutsreceipts återspelas med byteidentiska lagrade JSON-texter. Ursprungliga klass-/elevrelationer och tidsstämplar jämförs i sin helhet.

Aktuella ärvda delrapporter: APL-02 **46 kontroller,5 680 nyckelprober och2 överlapp**, APL-03 **33 kontroller och3 överlapp**, APL-04 **28 kontroller med5 observerade post-write rollbackfall**. Alla är bundna till aktuella egna källhashar och komplett cleanup. De räknas inte in som nya65 kontroller.

## Verktyg och avvikelser

`verify-apl-plan.mjs` och `apl-plan-fixtures.mjs` samlar matriserna. `apply-apl-plan.mjs` tillkommer som gemensam strikt strukturvalidator och förberett installationsverktyg för08/09. Faktisk installation i aktiv databas är inte utförd. Validatorn tillåter exakt9 nya tabeller,30 nya funktioner,5 ersatta funktionskroppar,2 nya guards på äldre tabeller och3 Worker-EXECUTE-grants, utan ändringar av befintliga kolumner, ägare eller andra rättigheter. Nya APL-tabeller måste vara tomma direkt efter installation; ingen backfill sker.

Första runnerfelet var tom returanledning i en äldre fixture. Nästa körning hittade ett riktigt profilparitetsfel för höst2028, rättat i `dce00a5` och förnyat i alla berörda delprov. Det första samlade slutprovet passerade62 kontroller/11 överlapp men kunde inte observera det sista låset: fixtureägaren uppdaterade mandatets rad direkt och använde inte produktens kundlås. Slutprovet använder nu den verkliga `phase3_revoke_mandate` som Worker/HM, observerar kundlåset och verifierar att köad APL-save nekas efter återkallningen. Ingen produkt-SQL behövde ändras för detta testfel.

Syntax/riktad lint och `git diff --check` PASS. Installationens beviskontroll fick vid oberoende08-granskning en rättning: SQL- och API-manifest får inte maskera olika hash för samma fil. Den rättningen ingår i de99 frysta källhasharna. Aktiva data och3012 är oförändrade.

SS12000:2024 utgåva4/OpenAPI2.1.0 beaktas genom stabila identiteter, giltighet och bevarade klass-/placeringsrelationer. APL-objektet är internt; inget externt utbyte eller faktiskt genomförande verifieras. Faktisk Worker/OIDC/browser, konkret release och mänsklig acceptans återstår i08–10.
