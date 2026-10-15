---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: CLASS-COHORT-10
status: complete
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
---

# Konkret klassprov förberett

Checkpointen har fått ett faktiskt användarsvar: klassflödet fungerar, med kvarstående UI-anmärkning. Plan10 avslutas och paketet har11 av11 slutförda planer. Hela fas5 och fulla krav markeras inte godkända.

## Förutsättningar och förberedelse

Plan08 fulla SQL-/Worker-/OIDC-/browserprov och plan09:s exakt lokala leverans PASS.3012 kör fortfarande produkt88145bc,201 filer, artefakt5dcc159ddd73095f0ed34a64a0d681b1c1d3477325709643ae1c7784572ce51c. Handboken byggd. Root kontrollerade åter runtimeidentitet, filer och frisk DB-health inför erbjudandet.

Det privata förberedelseskriptet skapade en separat syntetisk BF25-vårkull med start2028-01-15, första läsår2027/28, fastställd programplan v1, fastställd timplan v1 och utkast v2. Noll klasser/länkar initialt. Rektors-/huvudmannamandat är befintliga och oförändrade. Underlagets parser/SQL kontrollerade båda rollernas läsläge/skrivmandat samt att tillämpningsår2026 nekas medan2027/2028 motsvarar år1/år2.

Allt skapades i en transaktion med skrivlås på relevanta tabeller, full före/efter-jämförelse med dubblettbevarande EXCEPT ALL och strikta egna radtyper/antal. Alla83 tabellers ursprungliga rader bevarade. Två egna SQL-sessioner återkallades och gjordes utgångna före commit, men behålls som FK-ankare till förberedelsens historik. Inga cookies, nya konton, mandat eller elever skapades. Detta är syntetisk SQL-förberedelse, inte ett verkligt OIDC-prov eller mänskligt beslut.

Privat journal `/private/tmp/class-cohort-human-trial-20261015-v2.json`, SHA256 `2b5e5dc6767c6b18b4547b7afdbefc6e8ff11edfe30c39868a16a25a92653040`, statusCOMMITTED,0600. Separat `--reopen` PASS/exit0, endast läsning; bekräftar objekt/versioner och att båda sessionsankarna är obrukbara. Underlag återställs aldrig efter användararbete. Privat readinessrapport SHA256 `328023f74c41d1fb65b8cf054cb8cf0b5043b7731d574a642100bf61d5c1deeb` binder journal, runtime,201 byggfiler,83 bevarade tabeller och frisk3012. Direktlänkar för utkastv2 och timplanv1 finns privat och lämnas i chatten.

## Första förberedelseförsöket

Originalskriptet stoppades med42501 före snapshot/egen skrivning när SHARE ROW EXCLUSIVE begärdes även för GoTrues auth.schema_migrations. Journalen är bevarad med PREPARATION_ABORTED_OR_INCOMPLETE. Läsande rättighetskontroll visade endast denna tabell utan UPDATE/DELETE. Separat granskare bekräftade att journalens båda sessions-ID:n och utbildningskommando saknar rader/kvitto. Ingen historisk fullbaseline påstås för detta avbrutna försök.

Granskad v2 undantar endast denna migrationstabell från låset, behåller den i83-tabellsjämförelsen och tillåter inga nya rader där. Inga rättigheter ändrades. Privat skript-SHA256 `2008515c4aca29e4c2a80585f2d80d29d8c4bf052cfcb66c7b3d1c36f87b4903`. Faktisk förberedelse och efterföljande återöppning exit0; första försöket skrivs inte om till PASS.

## Checkpoint och standard

[USER-TRIAL](05-CLASS-COHORT-USER-TRIAL.md) erbjuder endast nytt tidigt klassflöde, Gör senare/återöppning, två tomma klasser och tydligt tillämpningsläsår. Kopiering är redan mänskligt godkänd och efterfrågas inte igen. Användaren har lämnat ett samlat funktionsgodkännande med UI-anmärkning; enhet och delsteg är inte särredovisade.

Plan10 kräver: ”Avvakta faktiskt mänskligt svar; automatiska tester är inte användaracceptans.” Detta svar har nu inkommit; fortsatt UI-förenkling följs separat. Fulla ADMIN-/PLANERING-krav, historiska88/100 planer och3/8 faser består. SS12000:2024/OpenAPI2.1.0 är modellavstämning med kvarvarande interna begränsningar, ingen verifierad export/kommunanslutning.

## Registrerat mänskligt utfall

Användaren svarade2026-10-15: ”ok allt funkar men vi kommer behöva se över detta så UI och allt funkar smidigt. Mycket knappar med tekniska grejre nu”. Klassflödet registreras som användarrapporterat funktionellt godkänt med kvarstående UI-anmärkning. Enhet och enskilda delsteg särredovisades inte; inget separat fysiskt telefonprov eller fullständigt begriplighetsgodkännande antas. Frågan före godkännandet, ”hur sparar jag när jag har gjort ny klass?”, är ett konkret fynd om att sparvägen behöver bli tydligare.

Återkopplingen läggs till i [den samlade UI-genomgången](../../todos/pending/2026-09-29-genomgang-av-ui-pa-dator-och-telefon.md). Färre tekniska knappar, tydlig huvudåtgärd och verksamhetsord ska planeras och prövas i en avgränsad fortsättning. Inga produkt-/databasändringar eller nya automatiska prov görs vid denna registrering.
