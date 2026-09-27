---
title: Inloggningsmetoder
---

Sidan beskriver hur du styrker vem du är, vad plattformen godtar som bevis och vad som ännu inte är beslutat.

**Status:** Verifierat för den metod som finns. Inga andra inloggningsmetoder är byggda. Engångskod redan vid inloggningen för konton med registrerad kod (ändrat 27 september 2026) är byggt och automatiskt prövat i den lokala provmiljön. Granskningen återstår.

## Metoden som används i dag

Plattformen har **en** inloggningsmetod: en lokal testleverantör som plattformen ansluter till som OIDC-klient.

- **Konto med registrerad engångskod** (till exempel huvudman, rektor, IT och kundadministration i provmiljön): du anger lösenord och därefter engångskoden från din autentiseringsapp, redan vid inloggningen.
- **Konto utan registrerad engångskod** (till exempel lärare): du loggar in med enbart lösenord. Du ombeds inte registrera någon kod och kan arbeta med allt som inte kräver extra verifiering.

Ingen kommunal identitetsleverantör är ansluten och godkänd. Ingen e-legitimation används. Uppgifterna i miljön är syntetiska.

## Vad beviset består av

När du loggar in tar plattformen emot ett bevis från leverantören och prövar det själv — den förlitar sig inte på att någon annan redan gjort kontrollen. Beviset godtas bara om allt av följande stämmer:

- det kommer från den utfärdare plattformen är konfigurerad att lita på,
- det är utfärdat till plattformens egen klient och ingen annan,
- det anger de metoder profilen kräver, i dag lösenord **och** engångskod,
- det följer den versionsmärkta tillitsprofil som gäller,
- och det är tillräckligt färskt.

Samma text i ett bevis från en **annan** utfärdare ger inte samma resultat. Att ett bevis säger "engångskod" räcker alltså inte i sig — det måste komma från rätt källa, till rätt mottagare, enligt en profil som är godkänd.

## Hur länge beviset räcker

Anger du engångskoden vid inloggningen blir det ett godtaget bevis för extra verifiering. Beviset gäller i upp till åtta timmar från inloggningen, och under den tiden gör du administrativa åtgärder utan att verifiera dig igen. Beviset är knutet till din pågående session och din arbetskontext. Det följer inte med till en annan session eller ett annat uppdrag.

Är beviset äldre än åtta timmar, eller saknas det, nekas nästa administrativa åtgärd med *… kräver verifiering med engångskod*. Knappen *Verifiera med engångskod* visas där beskedet står, även inne i en öppen dialog, och kan nås med tangentbord och pekskärm. Du anger lösenord och engångskod igen och kommer sedan tillbaka till arbetsytan. Det du hade fyllt i en dialog sparas inte.

Efter verifieringen måste du dessutom bekräfta själva åtgärden igen. En extra verifiering är ett bevis på vem du är, inte ett godkännande av vad som ska göras.

Saknar ditt konto registrerad engångskod ger verifieringen inget bevis. Du kommer då tillbaka till arbetsytan med beskedet att kontot saknar registrerad engångskod, och åtgärder som kräver extra verifiering går inte att göra. Registrering av engångskod ordnas av den som administrerar inloggningen; plattformen tvingar inte fram den.

## Vad plattformen inte påstår

Plattformen registrerar vilken verifieringsprofil och vilken metod som faktiskt användes, tillsammans med tidpunkten. Två saker lämnas uttryckligen som **okända** i den registreringen:

- **Personidentitetsnivå** — hur starkt personens identitet är styrkt. Den lokala engångskoden säger ingenting om detta.
- **Elektronisk underskrift** — ingen åtgärd i plattformen är undertecknad.

Det är avsiktligt. Ett lokalt prov med engångskod får inte i efterhand läsas som att en person är identifierad på en viss tillitsnivå eller att ett beslut är undertecknat.

## Nya metoder

Att lägga till en inloggningsmetod — kommunens egen leverantör, e-legitimation eller annan federation — är ett **öppet beslut**. Ingen sådan anslutning är byggd, prövad eller godkänd, och det är inte visat att en ny metod bara är en konfigurationsändring.

Plattformen är däremot förberedd på det sättet att leverantörsberoendet hålls samlat bakom en liten gräns, att tillitsprofilen är versionsmärkt och bunden till utfärdare och klient, och att identitet, behörighet och bevis hålls isär. En ny metod måste minst

- ha en egen godkänd och versionsmärkt tillitsprofil,
- kunna prövas mot utfärdare, mottagare, metod och ålder,
- behålla den interna identiteten, så att behörigheter aldrig ärvs genom e-post, namn eller ett delat konto hos leverantören,
- och prövas innan den används med verkliga uppgifter.

Identitetskontroll, extra verifiering, behörighet och underskrift är fyra olika frågor. En ny inloggningsmetod besvarar den första — och möjligen den andra. Den ger aldrig i sig något mandat: åtkomst avgörs fortfarande av [uppdraget](mandat.md).
