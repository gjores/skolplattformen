# Timplanslistan visar bara skapade planer — 2026-10-12

Användarbeslut: utbildningar utan timplan hör till Programplaner. Där öppnas en sparad programplan och Timplan väljs för att skapa skolans timplansutkast. Programplaner under arbete bevaras.

Migration 20261012150000 tar bort platshållare för alla timplansurval före filtrering, sortering, sidindelning och summering. Programplansurvalet behåller utbildningar även utan plan. Klassernas exakta versionskopplingar, frysta programunderlag, cache, mandatkontroller och databasrättigheter består. Ingen verksamhetsdata raderas eller flyttas. Kontraktet avvisar tomma planreferenser i timplanslista och översikt. Listintroduktion, tomläge och handbok är anpassade; det tidigare mellansteget ”Välj programplan” i timplanslistan utgår.

Verifierat före leverans:
- 60 modell-/serverprov PASS, typkontroll och lint PASS.
- 12 isolerade browserprov på dator/telefon PASS.
- Separat appbygge och handboksbygge PASS.
- Lokal DB-transaktion med yttre rollback PASS: åtta urval, lista/översikt/sida 2 och revisionsstämpel. GY 20→3, Programplaner 20→20, GR 3→1, IM 1→1. Olika år, status, tom sökning och relevanta kullar kontrollerade. Tio verksamhetstabellers fulla innehåll och funktionsägare/ACL oförändrade, även efter rollback.

Lokalt levererat:
- Samma åtta transaktionsprover passerade före installation. Migrationen journalförd; tio verksamhetstabeller oförändrade även efter commit.
- 3012 kör ebd970c; 179 byggfiler jämförda med separat testat bygge. Tidigare byggkatalog bevarad i privat temporär katalog.
- Faktisk lokal OIDC med befintlig syntetisk rektor: tre sparade timplaner i ofiltrerat urval, inga platshållare, utbildning utan timplan nås via Programplaner och komplett underlag visar Skapa timplansutkast på både dator och telefon. Ofärdigt underlag stoppas fortfarande. En befintlig timplan öppnades med samma ID och version som i listan. Slutprovet passerade med exit0. Inga domänskrivningar eller pageerrors.
- Första browserförsöket valde ett ofärdigt underlag och förväntade felaktigt en skapaknapp; produktens kompletteringsmeddelande var korrekt. Provet korrigerades till att välja befintligt komplett underlag. Det är ett läsande navigationsprov, inte ett nytt skapandeprov.

Syntetiskt lokalt mål; ingen produktionspublicering eller ändrad fas-/kravstatus. Befintliga filter för läsår, kull och arkiv gäller fortfarande; en skapad timplan kan därför vara utanför aktuellt urval.
