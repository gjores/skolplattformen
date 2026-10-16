---
phase: 05-bevarade-utbildnings-och-klassfloden
package: APL
stage: 1
status: direction_accepted_planning
date: 2026-10-16
---

# APL i timplanen – beslut och avgränsning

## Användarbeslut

Användaren beställde grundlig APL-research och svarade därefter **”låter som en bra lösning”** på rekommendationen om tre etapper med start i timplanen. Det registreras som godkänd riktning och grund för att konkretisera etapp 1. Vi återfrågar inte denna inriktning. Det är inte en acceptans av ännu obefintlig funktion eller ett generellt godkännande av framtida permanenta databasändringar.

Riktningen är:
1. Synlig, korrekt APL-planering i timplanen.
2. Elevplatser, kapacitet och ansvar.
3. Genomförande, lärande och kvalitetsuppföljning.

Denna planomgång avser etapp 1. [Researchen](../../research/APL-PLANERING-OCH-GENOMFORANDE-2026-10-16.md) skiljer verifierade regler från produktförslag. [Kontraktet](05-APL-CONTRACT.md) preciserar tekniska och verksamhetsmässiga genomförandeval. Dessa konkretioner är föreslagna av implementeraren utifrån den godkända riktningen, inte separata användarcitat.

## Vad användaren ska kunna göra

Rektor eller skoladministratör öppnar den aktuella namngivna timplanen och planerar APL-perioder, deras ämnesinnehåll, förläggning och omfattning. Timplanen visar total undervisningstid och varav APL med begripliga enheter. Rektor granskar underlaget och bekräftar förläggningen. Huvudmannen fastställer timplanen i det befintliga beslutsflödet. Saknade eller ändrade uppgifter leder till tydliga åtgärder.

Första stödda beräkningsprofilen är de befintliga skolförlagda nationella Gy25-yrkesprogrammen inom appens redan verifierade start-/programgränser. Utbildningsformen väljs uttryckligt. Lärling, blandad förläggning, delveckor och oklar beräkningsgrund ska kunna identifieras och sparas för fortsatt arbete men får inget obestyrkt automatiskt uppfyllelsebesked eller beslut enligt fel profil. Befintliga spärrar för yrkesprov från 2028 och andra otillräckligt stödda källor består.

Den lagstadgade helveckoomräkningen är 23 GUT-timmar per APL-vecka för denna profil. Datum anger förläggningen; de används inte som en generell algoritm för att räkna fulla APL-veckor. Rektors uttryckliga granskning av uppgiven omfattning är fortfarande nödvändig. Status ska säga **granskad planerad omfattning**, aldrig att APL genomförts.

## Bevara verksamheten

- Två klasser med samma programplan kan ha olika namngivna timplaner och olika APL-förläggning. Exakta klasskopplingar och deras läsår/planversion ändras inte av APL-redigering.
- Befintliga timmar är fortsatt total undervisningstid. Separat APL-fördelning ingår i totalen och adderas inte ovanpå den. Äldre okänd fördelning visas öppet och granskas i ett utkast.
- Rektor och skoladministratör bereder underlaget enligt aktuella skolmandat. Endast faktisk rektor bekräftar APL-förläggningen; huvudmannen behåller ensam fastställande. Ingen ny handledar-/elevåtkomst införs.
- Godkända planer och gamla beslut/kvitton skrivs inte om. Ett redan inskickat äldre yrkesärende behöver återkallas eller återsändas och kompletteras innan ett nytt godkännande enligt APL-modellen; migrering byter inte automatiskt ärendets status.
- Sparande, jämförelse efter konflikt och återhämtning efter avbrott ska använda befintliga skyddade mönster. Ingen ny teknisk knappuppsättning utan tydligt verksamhetssyfte.

## Utanför etapp 1

Elevplacering på företag, arbetsplatskapacitet, handledarportal, arbetsmiljöärenden, faktisk närvaro, bedömning och ledningsstatistik om genomförande hör till etapp 2–3. En kalenderperiod och en timfördelning är inte bevis på dessa uppgifter. Full schemamodul eller extern integration är ingen förutsättning för etapp 1.

## Krav och SS 12000

APL1-01–08 i kontraktet är lokala acceptanskriterier för paketet, inte åtta nya beslutade pilotkrav. ADMIN-02/04 och PLANERING-01 har bevarandegränser i fas 5; SCHEMA-01/03/07/08 förblir senare kopplingsytor. De ursprungliga 42 kraven och åtta faserna ändras inte.

SS 12000:2024, utgåva 4, och officiellt OpenAPI 2.1.0 är avstämda i researchens avsnitt 6. Etapp 1 lagrar egna planobjekt med stabila ID:n och exakta interna källor. Klass-/medlemskaps-/organisationsidentiteter och deras giltighet bevaras. Inga APL-objekt exporteras som standardens Placement. Ingen extern anslutning eller certifiering påstås.

## Genomförande och verifiering

[Planpaketet](05-APL-IMPLEMENTATION.md) ska granskas före kodstart. Det omfattar modell, additiv SQL, beslut och versionskopiering, skyddade API:er, användarflöde, handbok/docsbygge, faktiska SQL-/Worker-/OIDC-prov och konkret användarprov på dator/telefon. Simulerade prov och faktiska körningar särredovisas. Senast levererade a34dd19 på 3012 bevaras under utvecklingen; ingen byggning sker över aktiv artefakt.

Inför permanent lokal migration ska exakt paket, verifieringsbevis och bevarandekontroll vara framtagna, så att eventuellt nödvändigt godkännande gäller en konkret leverans. Gällande användarauktorisering bedöms då; ett redan godkänt exakt paket ska inte frågas om igen. Planering denna gång gör ingen schema-/runtimeändring och stänger inte fulla krav eller fas 5.
