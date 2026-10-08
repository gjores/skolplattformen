---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "41"
status: complete
completed: 2026-10-08
requirements-addressed: [PLANERING-01, PLANERING-04, PLANERING-05]
requirements-finally-verified: []
source_commit: 6e51629e00fc41a29e27324e696aea529d961b62
worker_build_revision: 6e51629e00fc41a29e27324e696aea529d961b62
full_gym_source_revision: f355717834a9ac1c27301f703613d49721a7b944
---

# 05-41 — Rätt årsdel i gymnasiets program- och timplaner

**Avgränsat PASS:** Planeringsår2027/28 och startHT2026 öppnar åk2 med HT2027/VT2028 i båda matriserna. Gymtimplanens frysta källstart styr årsprojektionen. Åk1/2/3 och Visa hela planen ändrar visningen; hela sexvärdesdistributionen och dess originalindex bevaras vid faktisk sparning/återläsning. Telefonen har minst44px årskursknappar. Pågående eller okänt sparutfall spärrar kontextbyte tills känt utfall.

| Faktiskt bevis, separat källa/bygge | RåSHA256 | Resultat |
|---|---|---|
| [FullG01–19×2](../../../work/pilot/results/phase5-41-gym-actual-third-20261008.json), f355717834a9ac1c27301f703613d49721a7b944 | `9a28ab2553f44805d05b2fc876ec6e6a2530387a9e83295a4d1aeaf2e1d4d52b` |38PASS/28,4min,38 normalcleanup,60 geometrier/PNG |
| [G13/G14×2 efter avgränsad rättning](../../../work/pilot/results/phase5-41-gym-return-notice-bounded-20261008.json), 6e51629e00fc41a29e27324e696aea529d961b62 | `411346b2e383a60def81739b82b78bf2a19b72ddffe0715fa6d1cabccc489346` |4PASS/2,9min,4 normalcleanup,4 geometrier/PNG |
| [C04×2 efter samma rättning](../../../work/pilot/results/phase5-41-context-write-buttons-second-20261008.json), 6e51629e00fc41a29e27324e696aea529d961b62 | `229b1f3cba74f1ae13f24358f4ac67544ba591a54efe7512f1adbba452de6292` |2PASS/1,6min,2 normalcleanup,2 geometrier/PNG |

ROOT har observerat faktisk exit0 för alla tre körningarna. workers1/maxFailures1/retries0; inga skipped/flaky/globala fel. Detta är38 fullmatrisfall,4 relevanta omprov och2 separata C04-kompletteringar. FullG38 märks inte om till den senare källan; full39-C16 och40-L36 behåller också sina egna bevis.

Endast home/provider skiljer i produktträdet f355→6e. Granskad patchc4b9ffc8 återanvänder den tidigare exakt öppnade gymtimplanen när programkälla, skola och utbildning stämmer; uttrycklig plan och full canonical fallback består. Program- och timversion jämförs inte med varandra. Samma serveråterläsning/mandat/sessionclear används. ProviderWAIT rensas endast vid redan accepterat lokalt årsbyte, med verklig normalizationNotice bevarad; inga dirty/unknown/CAS-grindar ändras. 24 rena selector-/noticeprov,27 modellprov, full typkontroll utan incremental, app/lib-lint och nytt isolerat skyddat bygge PASS.

G-spec `4bcec56142f4a980dfa40759d361290c244f75737834835180abf672a3a4b402`, gymfixtur `271215ad0d1c4b940132beb99b99d9852c1ca9aeae3fa93907554af0169f9706` och C04-spec `73c2480ad26640193dc3d1eb1e59e68a898c84d6c92edca23c5491afe2d987e1` är oförändrade under de sista omproven. G24/C9 explicita källor,49 expanderade skyddade filer och241 fulla produktfiler binds till varje faktisk Git-/byggrevision; G:s två parserkällor är också kontrollerade.

Samtliga38+4+2 normala cleanup bevarar15 fullständiga originaltabeller exakt mot SEARCH, alla sex bevarandeflaggor, original/retained audit och identitetsankare.16 ägda restantal, foreign/list/GY- och audit-DDLrester är0. Ingen recovery behövdes för dessa gröna slutkörningar. Terminala C04-ankare: audit188348/`53bb5279a53f09377e340a3c7e5d808c167de30e87d14a363cb1ac9f7947e5f1`; auditerade identiteter5137/`1c1fef523f5d183df0f24dc82b85553d700f9d0bcd7fec9888f93f02e1c6e84c`.

Alla emitterade geometrier/PNG-hashar är kontrollerade. ROOT och oberoende granskare har läst relevanta originalbilder på dator/telefon. ProviderWAIT är borta i nya G13/G14-bilder efter accepterat årsbyte. Fokushopplänken kan överlappa innehåll. Båda C04-slutbilder visar rätt2028/29/skolaB men årslistan ännu inläsande samt ett separat gammalt väntmeddelande i uppdragsväljaren; de bevisar inte färdiglistans rendering eller att alla notiser rensas. Funktionell återgång, actualwrite/readback och återställd navigation styrks av assertions. Ingen mänsklig begriplighets-PASS påstås.

Alla första FAIL består: första gymsetup875c48af med separat ägd recoveryv2, andra fullcaaf8637 och första C04 `93548399646ac8ddce6f97d27ef0da7e1091566c47f90db56fce344e5c7fe6c6`. C04 stoppade före write vid canonical source-retur; normalcleanup bevarade allt, ingen recovery. Katalogdatum- och ownschool-fixturrättningar ändrade inte produktregler. Tidigare bounded850eb835/87ec774e och recoveryrapporter är bevarade; inget första fel omskrivs tillPASS.

[Oberoende verifiering](05-41-VERIFICATION.md) ger3/3 inom avgränsningen.86/100 planer och3/8 verifierade faser. Nästa05-42 GR/IM, därefter05-43 handbok/samlat slutprov och konkret användarprov. ExtraG13/G14 är en obligatorisk ROOT-grind före42, separat från O/V5:s slutna historiska G38-pins. Fulla PLANERING-/ADMIN-krav,05-17, formell rektorsfärdigmarkering/huvudmannagodkännande och verklig pilotanslutning kvarstår. Vanlig3012 ligger kvar på5dd7baf; endast3060 har byggts om.
