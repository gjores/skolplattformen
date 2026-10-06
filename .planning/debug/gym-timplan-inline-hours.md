---
status: in_progress
created: 2026-10-06
requirements: [ADMIN-04]
scope: local-synthetic-only
---

# Direkta terminsceller i gymnasiets timplan

Användaren beställer 2026-10-06 att timmar fylls i direkt i tabellens terminsceller, som i programplanen. Det gäller den öppnade gymnasietimplanen, inte den separat registrerade todon om tabellöversikter/sökning/filter/sortering.

## Avgränsning och genomförande

Ersätt radens Ändra-knapp och timdialog med celler för de aktiva terminerna. Tomt är fortfarande null/ofördelat, 0 är explicit noll, och terminer utan källpoäng saknar inmatning. Spara befintligt sextermingskommando atomiskt per rad när raden lämnas eller Enter trycks. Serialisera flera radskrivningar mot aktuell CAS-revision; bevara ny inmatning under sparning och visa lokala summeringar/sparstatus.

Behåll den verkliga serverns mandat/MFA/CSRF/audit/validering. Konflikt eller okänt svar ska återläsas utan tyst överskrivning; osparade värden finns kvar och användaren jämför innan ny skrivning. Skydda navigation, rensa vid sessionsförlust och bevara läsvy för HM/arkiv/låsta versioner. Ingen SQL-, API-, modell- eller verksamhetsmigration ingår.

## Planerad verifiering

- Typkontroll, lint, riktade befintliga gymmodell-/serverprov, skyddat bygge och uppdaterad handbok.
- Verklig Worker/PostgreSQL på dator och telefon: befintliga nio övergångsfall anpassade till cellinmatning, samt radbyte under sparning, ogiltiga värden, tappat skrivsvar och oläst sparstatus.
- Återlästa timvärden/årskurssummor, källretur, skolmandat, read-only, CAS, osparat skydd och egen fixturstädning.
- Färsk helradsbaslinje för användarens syntetiska planer/kopplingar före arbete och efter prov/serverbyte. Leverera exakt prövat bygge till vanlig 3012 och versionshantera avgränsad rättning/bevis.

Full fas 5, beslut/garanterad undervisningstid, yrkesram och mänskligt begriplighetsgodkännande förblir öppna. Planöversikternas todo är inte genomförd av denna ändring.
