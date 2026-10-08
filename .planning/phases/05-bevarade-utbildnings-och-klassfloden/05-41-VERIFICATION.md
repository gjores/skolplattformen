---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "41"
status: passed
score: 3/3
verified: 2026-10-08
scope: local-synthetic-only
---

# 05-41 — oberoende målverifiering

**Tre av tre avgränsade mål är verifierade.** Bedömningen bygger på lästa produktkällor, Git-/byggbindning, faktiska rapporter och originalbilder. Granskaren har inte startat DB-, API-, browser-, bygg- eller processjobb. ROOT har utfört de seriella faktiska körningarna och redovisat kända exit0. Detta är lokala syntetiska prov, inte pilotgodkännande eller godkänd verklig kommunanslutning.

## Observerade mål

| Sanning i planen | Källkoppling och faktiskt stöd | Resultat |
|---|---|---|
| Planering2027/28 och start HT2026 ger åk2 med HT2027/VT2028. | Gemensam årsprojektion; programworkspace använder faktisk basisReference.startedOn och gymworkspace fryst plan.source.startedOn. G01:s literal2027/start2026 i båda arbetsytorna på dator/telefon, G04–09/G19 om historia, fryst start och fallback. | PASS |
| Sexterminsmatrisen förblir användbar utan flytt mellan index. | Programboard sparar full distribution till /api/programplaner/terminer; gymhours sparar alla sex originalindex till /api/timplaner/gym/rad. Synliga kolumner filtreras efter indexeringen. G02/G03 kontrollerar fulla värden, DB och reload; G04 visningsbyte utan write; G11/12 kö/CAS; G15–18 noll/NULL/fokus/rollback. Nya G13/G14×2 kompletterar samma spargränser. | PASS |
| Osparat arbete och sena svar kan inte skriva över ny skola/år/plan. | Full scope/generation, plan-ID/revision, layoutuppdaterad navigation-block-registry, readback vid okänt utfall och forced session/scope-clear. G11/G13/G14/G17 samt nytt C04×2 visar spärr för år/skola/vy/Back/uppdrag/utloggning och korrekt kvittens/återläsning/retur. | PASS |

## Faktiska rapporter och revisionsbindning

| Bevis | Källa och protectedbygge | Raw SHA256 | Omfång |
|---|---|---|---|
| phase5-41-gym-actual-third-20261008.json | f355717834a9ac1c27301f703613d49721a7b944 | 9a28ab2553f44805d05b2fc876ec6e6a2530387a9e83295a4d1aeaf2e1d4d52b | FullG01–19×dator/telefon:38PASS, exit0 |
| phase5-41-gym-return-notice-bounded-20261008.json | 6e51629e00fc41a29e27324e696aea529d961b62 | 411346b2e383a60def81739b82b78bf2a19b72ddffe0715fa6d1cabccc489346 | G13/G14×2:4PASS, exit0 |
| phase5-41-context-write-buttons-second-20261008.json | 6e51629e00fc41a29e27324e696aea529d961b62 | 229b1f3cba74f1ae13f24358f4ac67544ba591a54efe7512f1adbba452de6292 | Oförändrat C73-C04×2:2PASS, exit0 |

Rapporterna finns i work/pilot/results/ och är byteidentiska i MAIN och runtimearbetskopian. Varje fall har ett passed-resultat/retry0; inga skipped/flaky/error. workers1/retries0/maxFailures1 gäller. FullG38 behåller f355; de senare fyra omproven och två C04-kompletteringarna behåller6e. Det är inte44 unika Gfall eller en ny fullG38 på6e. Äldre fullC16 och L36 behåller sina egna revisionsbundna bevis.

FullG38:s24 explicita källhashar, C04:s9,49 expanderade skyddade Gitkällor,241 produktbyggkällor och två parserfiler granskades mot respektive historiska Gitrevision och faktisk byggmarkör. De senare rapporterna binds till ny6e-markör, inte det gamla f355-bygget. G-/C-spec och fixture är oförändrade:

- Gspec:4bcec56142f4a980dfa40759d361290c244f75737834835180abf672a3a4b402.
- Gfixture:271215ad0d1c4b940132beb99b99d9852c1ca9aeae3fa93907554af0169f9706.
- Cspec:73c2480ad26640193dc3d1eb1e59e68a898c84d6c92edca23c5491afe2d987e1.

Gitproduktdelta f355→6e är exakt två granskade filer: protected-home.tsx e4fbbce94333b8eb3eba3be24189e51fde61c274ba729275b35fa10e5ade283d och planning-context.tsx a0106cf27295c35ec4ad17af0f934e92e0e02181845b03351b796f9cf2fec1f5. Cache återanvänder bara faktisk tidigare timplanreferens med samma sourcePlanId, känt offeringId och exakt skola; alla-skolor kräver explicit målskola. Faktisk read/mandat/sessionkontroll består. Provider rensar sin gamla väntnotis endast vid redan accepterat lokalt matrixårbyte. Sparmotor, skrivkontrakt, årsmodell, sexindex, registry, forcedclear och övriga produktbytes består. De proportionerliga omproven täcker båda förändringarna.

## Databevarande och avslut

Alla38+4+2 körningar har normal cleanup, inga cleanup-deferred/failure eller okända avslut. Alla15 ursprungliga verksamhetstabellers fulla count/helradshashar är lika före/efter och lika godkänd SEARCH-baseline. Sex preservation-flaggor är true; original och retained audit-/identitetsankare har oförändrade fulla hash/count. Alla16 egna verksamhets-/session-/DDLräknare och foreign/list/GY/DDLrester är0. Audit-failure-bilder i G18 är positiva scenariosbevis, inte cleanup-failure.

FullG38:s terminalaudit är187791/befceecc18a432b0f1465a8a48b4d814d55afd047bf9b2adb81be315c435eca6 och auditerade identiteter5116/42752a6acb5c6f0829ce75d08ec061fa7fd4c5344f091cb224569a3dc7aabc40. Nya G13/G14 avslutar med188216/b7ed2af449f34ea5543e880a1fe8d69ccf08edfe35c270e437c5456a4d9084ec och5131/7513cf331a9d6b02b99fb4d1f6013ba7ac28b3b5f8130a503823ef6610ae1bd2. C04 avslutar med188348/53bb5279a53f09377e340a3c7e5d808c167de30e87d14a363cb1ac9f7947e5f1 och5137/1c1fef523f5d183df0f24dc82b85553d700f9d0bcd7fec9888f93f02e1c6e84c. SQL-audithash och fixturets JS-identitetshash behåller sin respektive ursprungliga hashsemantik.

## Bildstöd och begränsningar

FullG38:s60 geometrier/60 PNG, omprovets4 och C04:s2 har kontrollerade filhashar, minst44px kontroller och dokumentinneslutning. Originalpixels har lästs representativt, bland annat literal2027-program/tim på telefon, G03/G13/G19 samt nya G13 och C04 på dator/telefon; alla60 bilder har inte granskats visuellt individuellt. Korrekt lokal åk2/HT2029/VT2030 och73+22/Allt sparat efter okänt utfall syns i nya G13; den äldre provider-WAIT från f355 är då borta.

C04:s slutbilder visar korrekt accepterat2028/29 och skolaB men barnårslistan läser fortfarande underlaget. Bilderna bevisar kontextraden, inte en färdigrenderad matris. En separat äldre uppdragsnotis i #uppdrag, ”Invänta sparandet … innan du byter uppdrag”, ligger kvar efter ett tidigare avvisat uppdragsbyte. Detta är en presentationsnit; funktionell kvittens, återläsning och upplåst navigation har faktisk PASS. Fokushopplänk kan synas i matrisbilder. Ingen felfri samlad UI eller mänsklig begriplighet hävdas.

Canonical bildmanifest för nya4 har SHA0898c71e4847758bb1def31796f3d772fb80666f67d3f8f3a5a61bcb84e78dce och C04:s2 a1915099ab1937b8e14a6358f4567e77f560243ca450cbac6ab7c42c7c5ff356; båda binds till lästa originalPNGhashar.

## Bevarad historik och nästa gräns

Första setupFAIL875c48af825acf08b9cf56be2599efa175ef2ed4a32c37ecd7fc98037b01848d förblir0 UI-PASS: own2025-start föregick giltig fryst katalog. Produktresolvern består. Ägd recoveryv2-script0d9031cff731ac114bbbc828ee91ec4dbfed465cf073eb9709458ecc3b7d855d har separat preflight9b0fd9fdfeb12f2bf19165c001c85058d89bd136a7cf0ad6ab7d9e265f225051 och apply859b3bca449a7f93ef8914138805256e04ecc017277c11efc65615af24e41ff6, båda rootknownexit0 och full postcommit/bevarandekontroll. Immutable reservedFAIL3d0afd64b553c43116ccbe977d5d81aba5a516734e2662c3d3698f53be306fdc och cd998c7484220e807230b8c65030e6b92c0e44f04a288d349ad80778e938ee50 består; inget UI-PASS rekonstruerades.

Bounded850eb835 och andra fullFAILcaaf8637 (G10 legitim skolmandatlås före startlås), följande literal/skolbounded87ec774e samt första C04-cacheFAIL93548399646ac8ddce6f97d27ef0da7e1091566c47f90db56fce344e5c7fe6c6 är bevarade. Ägda fixture-/spec-rättningar har inte lättat produktresolver/mandat eller positiva krav.

Före42 är fullG38/f355 plus obligatorisk separat4-omprovsrapport/6e och C04×2/6e den godkända beviskedjan. Slutna O-/releasegrindar får inte ta revisionspin ur rapportens egen deklaration eller byta ut gamla fullrapporter. För42/43, fulla PLANERING-kraven och mänsklig begriplighet kvarstår deras egna faktiska och användarstyrda verifieringar.
