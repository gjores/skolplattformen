# Programplansredigering utan avbrott — 2026-10-12

Användaren rapporterar att redigeringen laddar om allt, tar för lång tid och bryter arbetsflödet. Avgränsad korrekthets-/prestandarättning inom ADMIN-02; inga nya databasregler eller fasgodkännanden.

## Orsak och ändring

Beslutspanelens revisionsnyckel innehöll hela den lokala terminsfördelningen. Varje tangenttryck hämtade beslutsunderlaget, nollade beslutsstatusen och gjorde tabellen skrivskyddad. React bytte därmed inputfält mot text mitt i redigeringen. Nu driver endast bekräftad sparrevision den läsningen. Lokal analys fortsätter följa inmatningen. Beslut är spärrade vid osparat/pågående arbete och medan nytt underlag hämtas. Misslyckad läsning spärrar fortsatt ändring och beslut.

Vid fördjupningsändring nollade arbetsytan hela utbildningen/planen och tabellens React-nyckel innehöll revisionen. Nu ligger den verifierade arbetsytan kvar under återläsning och tabellen är stabil för samma planversion. Inmatningsfält ligger kvar men spärras under strukturändringen. Söktext, lokalt tabellurval och tabellens DOM bevaras. Den kontrollerade terminsläsningen återanvänds i tabellen i stället för att hämtas igen. Exakta identiteter, revisioner, mandat, återställning efter okänt utfall och explicit omläsning består. Inga skrivningar tas bort eller visas som lyckade före serverbekräftelse.

## Verifiering

- Full relevant browser-svit: 34/34 PASS på dator/telefon, känd exit 0; inga skips/flakes. Sex nya fall använder riktiga arbetsytekomponenter med isolerade transport-/datasvar.
- Två tangenttryck gör inga ytterligare besluts- eller utbildningsläsningar. Sparning vid radbyte gör en beslutsuppdatering, behåller nästa fälts fokus och kräver ingen omläsning av utbildning/terminer.
- Fördröjd beslutsuppdatering tillåter fortsatt redigering men spärrar beslut. Konflikt bevarar egna värden; misslyckad beslutsavläsning stänger redigering/beslut. Förväntade HTTP 409/503 kontrolleras separat från oväntade browserfel.
- Fördjupningens ändring behåller tabellens faktiska DOM och söktext. En terminsläsning i stället för två efter ändringen.
- 27 relevanta modell-/kontrakts-/serverprov PASS. Typkontroll, lint, separat skyddat appbygge och handboksbygge PASS. Två browserbilder visuellt granskade; mobilens breda sexterminstabell rullas i sidled inom sin behållare.

Testfixturens första körningar behövde korrekt JSON-import, explicit vald/ovald katalog med avgränsade ämnen samt förväntade transportfel. Slutlig full körning ovan passerar. Browserproven använder inga verkliga elevuppgifter eller databasskrivningar; serverkontrakten och DB-mandaten ändras inte.

## Lokal leverans

Kontrollerad produkt färdig för byte av lokal 3012. Installation, byggrevision och verklig läsande OIDC redovisas efter genomförd kontroll. Ingen extern publicering eller full ADMIN-02-/fasacceptans ingår.
