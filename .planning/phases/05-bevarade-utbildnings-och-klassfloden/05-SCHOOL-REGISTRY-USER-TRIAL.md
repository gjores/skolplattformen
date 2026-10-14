---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: SCHOOL-REGISTRY
requirements: [ADMIN-01]
status: awaiting_user
created: 2026-10-14
verification_scope: isolated_component_usability_simulated_register
human_result: pending
---

# Användarprov: lägga till och uppdatera skolor

Det här provet gäller om huvudmannens nya **Skolor** är begriplig och enkel att använda. Öppna [det avskilda användarprovet](http://127.0.0.1:5198/e2e/fixtures/school-registry-manual.html).

Överst ska det stå **Avskilt användarprov** och **Simulerade registeruppgifter; inga vanliga skolor ändras**. Du behöver inte logga in. Allt som sparas i detta prov finns bara i den öppna fliken. **Börja om användarprovet** eller omladdning återställer exemplen.

## 1. Lägg till Eken

1. Välj **Organisationsnummer**. Numret **9999999999** fylls i.
2. Tryck **Sök skola**, sedan **Granska Provskolan Eken**.
3. Granska skolans namn, kod **22222222**, adress **Ekvägen 3** och skolformen **Gymnasieskola**.
4. Tryck **Lägg till skolenhet**.

Under **Dina skolenheter** ska nu **Provskolan Eken** finnas. Vyn ska förklara att importen inte ger nya uppdrag. Rektorsfältet visar **Visas med skolmandat** och skolan saknar knapp för registeruppdatering, eftersom exemplet inte har fått ett skolmandat.

## 2. Uppdatera Björken

1. Under **Dina skolenheter**, tryck **Hämta registeruppgifter för Provskolan Björken**. Skolenhetskoden är **11111111**.
2. I granskningen ska du se det nya namnet **Björkens gymnasium** och adressen **Nya skolvägen 2**. De tidigare uppgifterna visas som **Nu: Provskolan Björken** och **Nu: Gamla skolvägen 1, 12345 Provorten**.
3. Kontrollera att **Alex – lokalt tillsatt rektor** finns kvar. Registret anger bara gymnasieskola, men vyn ska tydligt säga **Lokala skolformer behålls: Grundskola**.
4. Tryck **Uppdatera registeruppgifter**.

Under **Dina skolenheter** ska namnet nu vara **Björkens gymnasium**. Där ska fortfarande stå **Alex – lokalt tillsatt rektor** och **Gymnasieskola, Grundskola**. En notis förklarar att den lokala skolformen behållits trots att den saknas i det simulerade registerunderlaget.

## 3. Bedöm om det är tydligt

Prova gärna också i en smal telefonvy. Om du vill testa direkt kodsökning: börja om provet, välj **Skolenhetskod**, skriv **22222222** och tryck **Sök skola**.

Svara med om det fungerade, eller ange steget som blev oklart. Bedöm särskilt om det är tydligt:

- vilken skola du lägger till eller uppdaterar,
- vilka registeruppgifter som ändras,
- att lokalt tillsatt rektor och lokala skolformer bevaras,
- att skolimport och tilldelning av uppdrag är skilda handlingar.

## Bevisets gräns

Detta är ett **mänskligt användbarhetsprov med simulerat register och lagring i fliken**. Det gör inga anrop till Skolverket eller den vanliga appens databas. Samma skolenhetskomponent används i produktappen, men inloggning, servermandat, verkligt registeruppslag och beständig lagring har prövats separat och redovisas i [verifieringen](05-SCHOOL-REGISTRY-VERIFICATION.md). Ett godkänt svar här får inte räknas som en verklig kommunanslutning eller ensamt slutgodkänna ADMIN-01 eller hela fas 5.

Automatiska dator-/telefonprov av denna fristående provsida ingår i den avgränsade UI-verifieringen. De ersätter inte din bedömning. Status är **awaiting_user**; inget mänskligt resultat finns ännu.
