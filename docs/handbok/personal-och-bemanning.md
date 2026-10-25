---
title: Personal och bemanning
---

Huvudmannen lägger upp personal, anställningar och andelar per skola i **Personal** och följer upp skolornas fördelningar i **Bemanning**. Rektor fördelar undervisning och uppdrag i [Tjänstefördelning](./tjanstefordelning.md).

**Provstatus:** Arbetsgången nedan är provad i oktober 2026 mot ett eget skyddat bygge med riktig inloggning och bara syntetiska personer, på dator och telefon. Den är inte prövad med verkliga användare eller verkliga uppgifter.

## Personal

Välj **Personal** under ARBETSYTA. Listan visar **Namn**, **Tjänstgöringsgrad**, **Skoluppdrag**, **Fördelat** och **Konto**. Sök med **Namn**. Sökordet hamnar inte i adressen.

### Lägg till en person

1. Välj **Lägg till person**.
2. Ange **Förnamn** och **Efternamn**, och vid behov **Externt ID** och dess källa.
3. Välj **Spara personen**.

Personnummer används inte. Personalkortet visar personens interna **Personal-ID** och eventuellt externt ID med källa.

### Person utan konto

En person behöver inget konto för att få undervisning och uppdrag i en fördelning. Listan visar märket **Inget konto**, och kortet *Inget konto kopplat. Personen kan ändå få undervisning och uppdrag.* Ett konto som är kopplat visas som **Kopplat**. Tillgång till Min tjänst ges i [Mandat](./mandat.md#egen-tjänst).

### Anställning

Öppna personen och välj **Lägg till anställning**. Ange **Tjänstgöringsgrad (%)**, **Gäller från** och vid behov **Gäller till**. Välj **Spara anställningen**. Avtal, arbetstid och lön registreras inte här.

### Andelar per skola

Välj **Fördela på skolor**. Ange **Andel (%)** och giltighet för varje skola där personen arbetar. Raden *Fördelat: … av … %* uppdateras medan du skriver.

Andelarna får tillsammans inte överstiga tjänstgöringsgraden. Blir summan för hög visas *Andelarna blir … %, men tjänstgöringsgraden är … %. Minska någon andel.* Servern nekar då sparningen med samma text, och inget ändras. Exempel: med 100 % sparas 60 % på skola A och 40 % på skola B, men 60 % och 50 % nekas.

Rektor ser bara andelen på sin egen skola, som **Andel här** i Tjänstefördelning. Rektor ser inte andelar eller summor från andra skolor. Lärarvalet visar skoluppdragets giltighetsdatum; ett uppdrag som gäller en del av läsåret innebär inte tillgänglighet under hela året. Andelen är inte ett besked om ämnesbehörighet eller ledig undervisningstid.

När skoluppgifter ändras kan ett påbörjat lärarval behöva göras om före sparning. Upphör skoluppdraget kan det hindra publicering av en fördelning där personen fortfarande finns med. Rektor flyttar eller ändrar kvarvarande uppdrag och tar uttryckligen bort en helt tom lärarkolumn. Personen, anställningarna och andelarna finns kvar i Personal; kolumnåtgärden raderar dem inte.

### Ny lärare från en skola

När rektor har valt **Lägg upp ny lärare** visas personen med märket **Ny lärare · från …**. Kryssa i **Visa bara personer som behöver kompletteras** för att se nya lärare och personer utan anställning eller andel. Komplettera anställning och andel som för andra personer.

### Engångskod

Alla ändringar av personaluppgifter kräver en färsk engångskod. Saknas den visar dialogen *Att ändra personaluppgifter kräver verifiering med engångskod.* och knappen **Verifiera med engångskod**. Inget sparas förrän du har verifierat dig. Efter inloggningen kommer du tillbaka till Personal och gör om ändringen.

## Bemanning

Välj **Bemanning** under PLANERING och välj läsår. Tabellen visar per skola **Status** (publicerad version eller *Ingen publicerad version*), **Undervisning**, **Specialuppdrag**, **Vakant tid**, **Ej fördelad tid** och **Koppling saknas**. Ej fördelad tid räknas bara för klasser med timplan. Klasser utan koppling räknas i kolumnen Koppling saknas, eftersom deras behov är okänt. **Visa tid** väljer hela läsåret, HT eller VT.

**Visa fördelningen** öppnar den publicerade version som raden visar, skrivskyddad, utan åtgärder och utan beslutsknapp. Rektors pågående ändringar visas inte. Den tidigare publiceringen ligger kvar tills rektor publicerar på nytt. En skola utan publicerad version har ingen knapp. Huvudmannen följer upp bemanningen. Rektor fastställer och publicerar skolans fördelning, och ett försök att publicera som huvudman nekas.

## På telefon

Personal och Bemanning visas som kort på telefon. Lägga till, ändra och fördela finns bara på dator.

## Begränsningar

- **Ingen schemalagd tid.** Bemanningen bygger på fördelad tid, inte på ett schema.
- **Ingen kapacitetskontroll mot timmar.** Andelarna prövas mot tjänstgöringsgraden, men lärarens timmar jämförs inte med andel eller grad.
- **Ingen arbetstidsram eller tjänstebedömning.** Inga avtal, arbetstidsregler eller bedömningar enligt förordningen om lärares tjänster ingår.
- **Ingen automatisk fördelning mellan läsår.** Rektor arbetar med nästa läsårs behov och aktiva lärarval i Tjänstefördelning. Flytt och massregistrering kräver granskad förhandsvisning.
- **Ingen överföring till eller från andra system.** Personal och andelar hämtas inte från ett personalsystem och skickas inte till till exempel tjänstebedömningsappen.
