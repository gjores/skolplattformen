---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-12
status: awaiting_local_migration_approval
updated: 2026-10-16
---

# Färdig kandidat, lokal installation inväntar godkännande

Implementation, handbok, skyddat bygge och faktisk isolerad verifiering är klara.38 API-/browserkontroller PASS,13 riktiga callbackbevis, båda enheter och12 granskade bilder, full egen cleanup. Se [samlad verifiering](05-NAMED-TIMPLANS-UX-VERIFICATION.md).55 rena leveransverktygsprov PASS och handboksbygget PASS. [Begriplighetsprov](05-NAMED-TIMPLANS-UX-USER-TRIAL.md) är förberett, inte genomfört.

Läsande installationsförprov mot aktuellt lokalt mål PASS med62 originaltabeller. Den efterföljande permanenta schemaapplyn avvisades av automatisk godkännandegranskning före exekvering eftersom ett specifikt godkännande ansågs saknas. Frågan till användaren avser exakt fem verifierade migrationer och därefter byte av lokal3012 till samma testade artefakt. Ingen schemaapply eller ny runtimeleverans har skett och ingen workaround används. Den gamla3012-versionen88145bc finns kvar med återställda exakta bytes.

Efter godkännande kontrolleras bevis och aktuellt mål på nytt. Kör verktygets läsande förprov och sedan bounded apply med originalkolumn-/ACL-/journalbevarande, följt av delivery --verify/--apply på samma204-filsartefakt. Föregående runtimebevis är `/private/tmp/class-cohort-08-fixed-actual-40ktgzc1/delivery-apply-2.json`; den befintliga syntetiska lässcopefilen är `/private/tmp/class-cohort-delivery-scope.json`. Senaste aktuella faktiska prov är `/private/tmp/named-actual-fifth.json`, SQL `/private/tmp/named-timplans-11-second.json`. Kandidaten ligger i `work/pilot/targets/protected/runtime/named-cc671b88-47f8-4044-bfe3-5569ab8bc2a7`. Bygg inte över aktiv `web/dist-protected`; överför exakta prövade bytes med leveransverktyget.

Plan12 markeras inte slutförd, gapet CLASS-COHORT-UX-01 förblir öppet och användarens tidigare funktionsgodkännanden påverkas inte. SS12000-mappning och gränser består; ingen extern anslutning eller fullfasacceptans påstås.
