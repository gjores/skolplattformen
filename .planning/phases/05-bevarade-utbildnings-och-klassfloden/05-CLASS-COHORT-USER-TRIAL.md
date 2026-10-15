---
phase: 05-bevarade-utbildnings-och-klassfloden
package: CLASS-COHORT
plan: CLASS-COHORT-10
status: awaiting_user
updated: 2026-10-15
trial_readiness: ready
human_result: awaiting_user
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
---

# Avgränsat användarprov av klassorganisation

Provet är förberett på den skyddade lokala appen på3012. Samma201 byggfiler från88145bc är verifierade med faktisk lokal OIDC, Worker/API och browser på dator/emulerad telefon. Automatiska resultat och gränser finns i [VERIFICATION](05-CLASS-COHORT-VERIFICATION.md). **Mänskligt resultat saknas.** Tidigare godkänd kullkopiering ska inte upprepas.

## Konkret underlag

En separat syntetisk vårkull finns i den befintliga provskolan och täcks av befintliga skolmandat. Den har fastställd programplan v1, fastställd timplan v1 och programplansutkast v2 med samma startdatum. Vid förberedelsen fanns noll klasser och noll timplanskopplingar. Användaren får privata direktlänkar i chatten; konton, objekt-ID:n och länkar lagras inte i Git.

Förberedelse och separat skrivfri återöppning PASS. Alla tidigare rader i83 public-/authtabeller bevarades. Endast egna uttryckligen tillåtna syntetiska objektrader lades till. Två egna syntetiska SQL-sessioner är återkallade/utgångna och behålls som historikankare; inga cookies utfärdades. Förberedelsen är inte ett nytt bevis för OIDC, MFA eller mänskligt beslut.

| Uppgift | Värde | Betydelse |
| --- | --- | --- |
| Utbildningsstart och nya klassers giltighetsstart |15 januari2028 | Exakt dag; slutdatum okänt. |
| Första läsår |2027/2028 | Vårstarten hör till läsåret som började2027. |
| Planeringsläsår i ingångslänken |2026/2027 | Separat urval; ändrar inte utbildningsstart eller klassdatum. |
| Timplanens tillämpning |2027/2028 för år1;2028/2029 för år2 | Uttryckligt giltigt läsår vid koppling till fastställd version. |

Länkens planeringsår är ett förberett ingångsvärde. Om appen normaliserar urvalet ska det faktiska synliga året noteras; det är ännu inte mänskligt bedömt.

## Kort prov

1. Öppna vårkullens programplansutkast med rektorsuppdrag. Välj **Visa klasser**. Kontrollera start15 januari2028 och första läsår2027/2028. Välj **Gör senare** och öppna klasssteget igen.
2. Skapa två tomma klasser med tydligt syntetiska namn. Granska namn/startdatum och spara. Läs om och kontrollera att båda klasserna finns kvar.
3. Öppna länken till samma utbildnings fastställda timplan. Klasserna ska ännu sakna koppling. Välj **Koppla klass**, välj giltigt läsår och en klass:2027/2028 är år1,2028/2029 är år2. Granska skillnaden mot planeringsåret; för begriplighetsprovet räcker granskning före bekräftelse.
4. Svara om flödet fungerar eller vilket steg som är oklart/fel. Ange gärna enhet; ospecificerat svar ger inget antaget telefonresultat.

Återöppna befintliga provobjekt om användaren redan har börjat. Återskapa eller återställ inte kullen, och radera inte mänskligt skapade klasser. HM-läsläge är automatiskt verifierat och är inget obligatoriskt ytterligare inloggningsprov.

## Resultat

| Del | Status |
| --- | --- |
| Tekniska förutsättningar08/09 |PASS; första fel och bevisgränser bevarade. |
| Syntetiskt underlag och lokal3012 |Förberett och läsande återkontrollerat2026-10-15. |
| Prov erbjudet |2026-10-15, efter färdig förberedelse. |
| Användarens svar/enhet |Inväntas; inget mänskligt PASS. |
| Datum, Gör senare/återöppning, tomma klasser, läsårsval |Automatiskt verifierat; mänsklig begriplighet inväntas. |

Privata bevis och första avbrutna förberedelsen redovisas i [10-SUMMARY](05-CLASS-COHORT-10-SUMMARY.md). Avgränsat mänskligt utfall registreras först efter faktiskt svar. Fulla krav/fas5, historiska integritetsavvikelser och andra öppna delar består.

SS12000:2024/OpenAPI2.1.0 är dokumenterad modellavstämning. Provet omfattar ingen elevimport, standardexport eller kommunanslutning och belägger inte standardefterlevnad.
