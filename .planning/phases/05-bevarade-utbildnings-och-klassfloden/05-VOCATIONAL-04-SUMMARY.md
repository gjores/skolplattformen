---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: VOCATIONAL-04
status: completed
requirements: [ADMIN-02, ADMIN-04]
---

# Faktisk integration och lokal leverans

Den lokala appen på port 3012 kör produktrevision `03698a219162c7aa77d4ad984d442f36e5b4bab1`. Separat skyddat bygge, typkontroll, lint och handboksbygge har känd exit 0. Installationen jämförde alla produktkällor med byggkatalogen och byteverifierade 183 byggfiler. Tidigare bygge är bevarat för återställning. Inga verkliga elevuppgifter eller externa kommunanslutningar ingår.

Den nya framåtmigrationen `20261012200000` är installerad i den isolerade lokala databasen. 101 SQL/oberoende TypeScript-kontroller, separat DDL-rollback och exakt apply passerar. Före leverans passerade riktiga utvecklings-Worker-anrop för BF25 och BA25 vardera 25 kontroller, med återställda syntetiska fixturer och oförändrade originaldata och rättigheter.

Yrkesprofilerna har 141 modell-/serverprov. UI har 26 fulla dator-/telefonprov samt två efterföljande riktade väntelägesprov på den slutliga källan. Två returcykler för båda plantyperna kontrollerar att senaste kommentaren visas direkt och äldre kommentarer bevaras. Mobilbilder för båda återkopplingsrutorna är granskade. Oberoende källgranskning har inga öppna P1/P2; upptäckta datum-/kontrollpunktskillnader och fixturens historikordning är rättade och omprovade.

Slutbyggda API-prov genom 3012 passerar BF25 25/25, BA25 25/25 och HE-regression 19/19, alla med känd exit 0 och bevarade originaldata/rättigheter. Faktisk lokal OIDC för huvudman, rektor och skoladministratör på dator/telefon passerar 6/6: rätt räknare, inkorg, listläsning och öppnat beslutsunderlag. Inga pageerrors eller horisontell överströmning. Sex skärmbilder visuellt granskade. [Slutverifiering med råbevisens hashvärden](05-VOCATIONAL-VERIFICATION.md).

## Avgränsning

Tolv nationella Gy25-yrkesprogram stöds med fullständig gemensam programram. Okända/särskilda profiler får ingen generell fallback. Behörighetsnivåer och APL kräver uttrycklig granskning. Individuella bortval, faktisk APL-organisation/närvaro och yrkesprov för starter från 2028-07-02 ingår inte; den senare gruppen har tydlig beslutsspärr. Återsändning gäller inskickade planer före fastställande. Fastställda versioner förblir låsta och klasskopplingar flyttas inte.

Fulla ADMIN-02/04, skyddad klasskoppling, GR/IM-beslut, mänsklig begriplighetsacceptans och full fas-/pilotacceptans markeras inte klara. De fyra yrkesplanerna kompletterar tidigare historiska 88/100 planer och 3/8 faser utan att skriva om de totalsiffrorna.
