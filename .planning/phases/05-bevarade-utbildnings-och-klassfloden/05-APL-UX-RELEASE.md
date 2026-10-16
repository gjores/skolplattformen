---
phase: 05-bevarade-utbildnings-och-klassfloden
package: APL-UX
status: locally_delivered_user_trial_pending
updated: 2026-10-16
---

# Lokal leverans: årskurs och termin först

Användaren beställde en enklare APL-UX och valde uttryckligen årskurs/termin först, exakta veckor eller datum senare. Paketet bevarar rektorsbekräftelse och huvudmannens separata beslut. Det ändrar inte elevplacering, närvaro eller genomföranderapportering.

## Exakta delar

- Produktkandidat `c739bb38feadee27189cb2d44feb658ab5ee9585`, 209 filer, artefakt SHA-256 `db402038fc61a53d47b89ede8a799b453643ac81a21f950bd06f47b3ad42fc11`.
- En additiv migration: `20261016130000_apl_term_intent.sql`, SHA-256 `d34d97c7ca58d5692c884dada2c4bbe297499e9510302bc8f90d0091c20ee8dc`.
- En nullable kolumn för uttrycklig terminsavsikt, en kontroll 0–5 och fem befintliga funktioners parse/read/hash/write/copy-stöd. Ingen backfill, ny rättighet, ny tabell eller omskrivning av gamla kvitton/hashar.
- Delta-installationsverktyget godtar bara exakt tidigare installerad APL-grund, det aktuella deltapaketet och färska SQL-/HTTP-/browserbevis. Leveransverktyget återanvänds med explicit paket `apl-term-intent`.

Samma prövade byggfiler ska överföras, utan ny byggnad i den aktiva katalogen. Äldre parsers kan inte läsa det nya fältet när det börjar användas; installation och appbyte behöver därför utföras tillsammans. En återställd gammal process är inte en fullständig databasrollback. Verktygen redovisar okänd commit eller ofullständig återhämtning som fel, aldrig som framgång.

## Auktorisation och ordning

Lokal implementation och nödvändig kompatibel installation bedöms mot användarens aktuella UX-beställning och fortsatta arbete i samma lokala miljö. Det tidigare uttryckliga godkännandet av tre andra APL-migrationer används inte som ett generellt godkännande för annan DDL. Ingen extern publicering eller driftsättning ingår. Först färska integrationsbevis och granskade bilder, sedan läsande installations-/leveransförberedelser, därefter exakt avgränsad installation och samma kandidat på 3012 om auktoriserat. Eventuell konkret blockerande godkännanderegel redovisas separat.

## Resultat

**Lokalt levererad på 3012, PASS.** Färska läsande förberedelser verifierade schema, aktuell process/artefakt, befintligt rektorsmandat och inloggningsförutsättningar. Samma kandidat överfördes efter delta-installationen, utan ombyggnad, databas-/IdP-omstart eller reset.

Installationen bevarade originalkolumner/rader i 74 tabeller, tidigare migrationsjournal och rättigheter. Terminsfältet fick ingen backfill. Exakt testad struktur verifierades; commit bekräftad och lokala migrationsfiler synkroniserade. Låstiden före commit var 5901 ms.

Appbytet och läsande rektors-OIDC/MFA PASS. Befintlig skolbehörighet, klassunderlag, namngivna timplaner, rätt att skapa programplaner samt APL-/beslutsunderlag lästes med rätt kontext. Hälsa verifierade workerd/skolplattform_worker. Samtliga 71 verksamhetstabeller bevarades. En egen appsession och en egen GoTrue-session togs bort; gamla sessioner/loggar och verksamhetsdata bevarades. Inga användarplaner skrevs av leveransprovet.

| Privat bevisfil | SHA-256 |
| --- | --- |
| `/private/tmp/apl-ux-actual-reviewed.json` | `a6d7ac3b0ddb6f9e8211e3c65755558749b0e844b04248f29449b597baedbad7` |
| `/private/tmp/apl-ux-install-preflight.json` | `83ebb7c30310f6deef8916c2aebf4e32827092ceb9ac19b85af7f2746290c37b` |
| `/private/tmp/apl-ux-delivery-prepared.json` | `11c956c57976aec0f63dd1f655582c811afb76f50b41d2725d3384182205ebd6` |
| `/private/tmp/apl-ux-installed.json` | `4d5ca8f8f99845bcd4b6f8bb4e412e39d5315a3792d3f15a58ed4f4eaab3d700` |
| `/private/tmp/apl-ux-delivery-verified.json` | `5907de20b9b831b47156c6d19c2d9e6442ee4a895a7b83edcf7607e65305afa5` |
| `/private/tmp/apl-ux-delivered.json` | `ed6beebda1f4ba2a7f849fe719111e09764aeb517109f1789d68a197579adb79` |
| `/private/tmp/d0fc52fe-d517-44af-91e6-3dc9a0c6ff9c-readonly/delivery-readonly-10544b59-eb36-420e-8f60-3f479173ada1.json` | `b06560be3d22ad0befc747a3d2e4df9de9be9b874fd2b582193f2e552ca13900` |

Auktorisationen för detta avgränsade lokala paket bedömdes täckt av aktuell UX-beställning och dess nödvändiga additiva implementation. Ingen ny godkännandegrind krävdes av projektet eller exekveringskontrollen. Detta ändrar inte kravet på separat beslut om framtida extern publicering/driftsättning.

## Nytt användarprov efter leverans

1. Öppna en redigerbar timplan och välj **Planera APL → Lägg till period**.
2. Välj exempelvis **Årskurs 2 → Vårtermin**, granska och spara utan datum eller ämnesinnehåll.
3. Ladda om och kontrollera att valet finns kvar.
4. Öppna **Datum och omfattning** eller **Ämnesinnehåll och undervisningstid** när planen ska preciseras.

Mänsklig begriplighetsbedömning är `awaiting_user`. Tekniska prov ersätter inte användarens bedömning. APL:s genomförandeetapper och full pilot-/fasacceptans kvarstår.
