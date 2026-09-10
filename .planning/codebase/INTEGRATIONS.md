# Integrations

Kartlagt 2026-09-10 från kod; inga externa system anslöts eller provades i kartläggningen.

| System | Befintlig koppling | Återstår |
|---|---|---|
| Supabase | Klientbaserad lagring, anonym demoidentitet, SQL-policyer, migrationer | Verkliga identiteter, kund-/skolavgränsade uppdrag och pilotens driftbeslut |
| Skolverkets skolenhetsregister | Serverbaserad uppslagning och import av skolgrund | Ägarskapsverifiering och separat medlemskap; ett offentligt uppslag ger inga rättigheter |
| Skolverkets Syllabus | Versionslagrad lokal katalog med omhämtningsskript | Förvaltningsrutin och kontroll av nya versioner |
| Cloudflare/Vinext | Lokal serveradapter och byggkonfiguration | Verifierad och avtalad drift för pilotens informationsklasser |
| Kommunens identitetsleverantör | Ingen riktig anslutning | OIDC/SAML och hela kontolivscykeln med vald pilotkund |
| Kommunens elev-/schema-/personalsystem | Ingen verklig registersynk | Ett valt flöde, informationsansvar och avstämning; SS 12000 där faktiskt stöd finns |
| Kommunens diarium/säkerhetsövervakning | Ingen befintlig anslutning | Bedöm pilotens behov och avtalade handoff/exportvägar |

Skrivande `work/supabase`-skript ska bara köras i avsedd testmiljö. Läsning av dokumentation och publika skoluppgifter är skild från behörighet att skicka elevuppgifter till en tjänst.
