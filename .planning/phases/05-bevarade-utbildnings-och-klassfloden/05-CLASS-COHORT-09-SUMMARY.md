---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: CLASS-COHORT-09
status: complete
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
---

# Handbok och lokal leverans

Plan09 är genomförd. Handboken är byggd och samma201 prövade byggfiler från88145bc kör nu på3012. Andra leveransens verkliga läsande OIDC, exakt cleanup och bevarande PASS. Första försöket och återhämtningen redovisas nedan utan omskrivning. Plan10 förbereder nu det konkreta mänskliga klassprovet.

## Handbok

Programplaner beskriver det frivilliga tidiga klasssteget, mandat, datum, tomma klasser, Gör senare, återöppning och återhämtning. Timplaner beskriver uttryckligt läsårs-/versionsval samt skillnaden mellan planeringsår, första läsår och exakt utbildningsstart. Ett giltigt planeringsår används som förslag; år utanför utbildningens tre läsår kräver ett uttryckligt giltigt val. Ny version och kopiering ändrar inte äldre klassidentiteter eller länkar automatiskt.

`npm run docs:build` passerade efter den sista sakrättningen, exit0. Privat logg `/private/tmp/class-cohort-09-docs-build-final.log`, SHA256 `866a64c7e9bbfaac8addd8b427b529d1d358c744a5e181961c5a281c4d8b986d`. Ingen publicering är gjord.

## Leveransverktyg

`work/pilot/deliver-class-cohort.mjs` använder separata `--verify`/`--apply`, kontrollerar aktuellt SQL/API/browser-/käll-/byggbevis och exakt befintlig process på3012. Det överför samma byteverifierade bygge, bevarar föregående artefakt och privat konfiguration, provar verklig läsande OIDC och jämför verksamhetsrader före/efter. Felvägen återställer endast egen identifierad runtime; osäkert främmande processläge stoppar återställning och redovisas.

Syntax, import utan sidoeffekt och riktad lint har passerat. Root och separat granskare har läst verktyget utan blockerande fynd. Faktiskt leverans- och återställningsresultat redovisas separat nedan.

## Ursprungligen planerade utfall (nu automatiskt verifierade)

- Slutlig plan08-acceptans med sex actual-fall och granskade bilder.
- Leveransens läsande förkontroll och faktiska överföring, med rårapporter/hashar.
- Läsande lokal OIDC på3012 och bevarande av äldre verksamhetsdata.
- Uppdaterad VERIFICATION, USER-TRIAL och kravspårning inför plan10.

SS12000:2024/OpenAPI2.1.0: denna plan ändrar användarinstruktioner och lokal runtime, inga standardobjekt eller relationer. Paketets avsedda mappning och kända modellbegränsningar består. Ingen faktisk kommunanslutning, full kravacceptans eller mänsklig acceptans följer av planeringen.

Efter upptäckt av egna MFA-claims i08 har leveransens läsande OIDC-städning kompletterats: före/efter-baseline för auth.mfa_amr_claims, exakt session-ID-ägarskap och explicit borttagning av egna claims före auth.sessions med normala FK. Syntax, import-safe, riktad lint och oberoende deltagranskning PASS; faktisk leverans redovisas i slutresultatet nedan. Privat kontroll `/private/tmp/class-cohort-09-claims-static-review.json`.

## Första faktiska överföringen — bevarat FAIL

Plan08:s fulla browser6/6 och oberoende eftergranskning passerade. Leveransens läsande förkontroll PASS, SHA256 `8adf0213a4f16cb885afc4041f283a1f55e0bd2055bfee4a8b8f2c0fe0d7e435`. Första `--apply` överförde bygget och genomförde verklig302-callback, server-MFA och klassunderlagsläsning200 med exakt skolmandat, men OIDC-städningen stannade på ERR_ASSERTION. Rapporten är FAIL: `/private/tmp/class-cohort-08-fixed-actual-40ktgzc1/delivery-apply.json`, SHA256 `2ce1e35f77caf6e61acaf73765b4a0ffd9a5c4b3c30843026643e9c3dbdb7abb`.

Det tidigare bygget återställdes med bevarat manifest, privat konfiguration och verifierad frisk lokal runtime (`runtimeRestored:true`). Det är en faktiskt genomförd återställning efter städfel; inga övriga felgrenar påstås prövade. Separat läsrapport SHA256 `5981c7c7e5e97b84e049f1a64efe629ea8e9821370056db61cd41c0d98db6b90` bevarar exakt egna sessions-ID:n och callback-/läsaudit. Provets privata lås och sessionsbevis lämnas tills avvikelsen är utredd; ingen blind omkörning.

### Exakt återhämtning efter första städfel

Läsande återhämtningsbaseline PASS, `/private/tmp/class-cohort-delivery-recovery-baseline-1.json`, SHA256 `41d28a92cf3ed79d30e4fa369cbbba253cbbb7430243871e2188660a4d34133f`. Exakt apply PASS, `/private/tmp/class-cohort-delivery-recovery-apply-1.json`, SHA256 `d34dc474c01607ac5f80aafc957671dbfbdf30d475919853692ceb8b945b11da`: en egen redan återkallad appsession, en GoTrue-session, en token och en MFA-claim borttagna i samma transaktion.59 verksamhetstabeller och fyra ursprungliga sessionstabeller matchar före-leveransen-hashar; fem hela ankartabeller matchar återhämtningens egen före-bild. Privat lås borttaget först efter känd commit. Ingen annan session eller audit raderad.

Läsande utredning visar att utloggning200 och efterföljande sessionsläsning401 passerade. Stoppet ligger i efterföljande bevarandekontroll; det ursprungliga exakta assertionmeddelandet saknas. Endast provkontots egen rad i public.identities/auth.users/auth.identities skiljer från senaste browserbaselines ankare. Alla äldre icke-egna ankare är bevarade; senaste browserfixturens egna ankare är separat attribuerade. Före-leveransen-råvärden för de tre egna metadataraderna saknas, så historisk exakt fältdiff är inte bevisad. Dynamiska JWTfält iat/exp finns i aktuell authmetadata; detta är en möjlig förklaring, inte en omskrivning av förstaFAIL.

Kompletta ursprungliga auditrowsets matchar rapportens före-hash efter exkludering av nya poster. Fyra nya poster är direkt sessionbundna; femte401-posten utan session-ID har tids-/sekvensbindning och originalrowsetjämförelse, inte samma direkta correlationbevis. Samtliga bevaras. Nästa verktyg sparar full privat hållbar före-bild före inloggning och exakta steg/checknamn.

## Slutlig lokal leverans — PASS

`--verify` och `--apply` körning2 avslutades med exit0. Privat förkontroll `delivery-verify-2.json` SHA256 `47d4776d03ac51bc83bfb6eee02035be86617294b822079528712cfd4efdb4cd`; apply `delivery-apply-2.json` SHA256 `427a9f15463303d5ec3773b03ff2d3768575f9826308cd4597be1d93ffdc700b`, båda i plan08:s aktuella privata actual-katalog.3012 har exakt201 artefaktfiler, SHA256 `5dcc159ddd73095f0ed34a64a0d681b1c1d3477325709643ae1c7784572ce51c`, produktrevision88145bc. Inget nytt appbygge eller extern publicering. Tidigare artefakt bevarad separat.

Läsande verklig lokal OIDC PASS, rapport SHA256 `ced09407b307e527cb2f98825c857542f6a7a76e63ba8ee8d316f290b65a0456`:302 callback, serververifierad MFA, exakt befintligt skolmandat och klassunderlag200 med DB-/Worker-audit. En egen appsession och en GoTrue-session inklusive token/claim städade med normala FK; samtliga gamla sessioner,59 verksamhetstabeller och ursprunglig audit bevarade. Privat konfiguration och nya byggfiler matchar efter återstart.

Denna körning sparade full privat före-bild före inloggning. Faktiskt ändrade authfält är endast raw_user_meta_data.iat/exp, identity_data.iat/exp samt tillåtna inloggningstidsstämplar. Nya tokentider matchar den exakta serververifierade callbacktoken som även skickats till GoTrue; övriga nycklar/nästade värden är oförändrade. Detta belägger körning2:s metadataändringar, inte en rekonstruerad fältdiff i första försöket.

`node --test work/pilot/deliver-class-cohort.test.mjs`:48 PASS,0fail/skip/cancel. Syntax/import och riktad lint PASS. Root granskade tokenbindning mot faktisk callback-/sessions-/auditkod samt negativa prober. Fulltappbygge från08 återanvänds oförändrat. Plan10:s syntetiska provförberedelse och mänskliga svar återstår; fulla krav och fas5 ändras inte.
