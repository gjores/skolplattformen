# Researchsammanfattning: Skolplattformen

**Projekt:** v1.0 — Säker administration inför en pilot  
**Område:** Svensk skoladministration i befintlig React/Supabase-app  
**Undersökt:** 2026-09-10  
**Tillförlitlighet:** MEDEL för genomförandeförslaget

## Sammanfattning

Användaren har beslutat att vidareutveckla den befintliga appen inom GSD, med säker inloggning, avgränsade uppdrag, beständigt elevregister och en kommunintegration först. De 42 detaljkraven och färdplanen är fortfarande förslag. Gymnasiets utbildningar, kurs-/nivåtillägg, kullkopiering och explicita klass–timplanskopplingar ska bevaras. [Projektbeslut](../PROJECT.md), [kravförslag](../REQUIREMENTS.md)

Rekommendationen är en gemensam app med tydliga moduler: återanvänd vyer och domänmodeller, inför verifierad identitet och aktuella uppdrag, och ersätt en dataväg i taget med skyddad lagring och verifiering. Elevregistret behöver stabila identiteter, giltiga relationer och beslutat skrivansvar före import. Spårbarhet och negativa åtkomstprov ingår från första skyddade operationen.

Största risken är att demonstration, leverantörsstöd eller syntetiska prov uppfattas som färdig pilotberedskap. Kund, IdP, registerkälla, avtal och drift är öppna. Utveckling kan fortsätta med syntetiska data; verklig anslutning och kundens driftbeslut måste redovisas separat. Informationshantering kräver en fungerande process, men ett eget publikt diarium är inget beslutat pilotkrav.

## Viktigaste fynd

### Rekommenderad teknik

[STACK.md](STACK.md) verifierade installerade/låsta versioner, inte deras produktionssäkerhet:

| Teknik | Rekommendation och konsekvens |
|---|---|
| React 19.2.8, TypeScript 5.9.3 | Bevara fungerande vyer och rena modellfunktioner. |
| Vinext 1.0.0-beta.9, Vite 8.2.2, Workers | Behåll kombinationen; pröva auth, cookies och cache i byggd Worker. Vinexts dokumenterade kompatibilitetsluckor gör detta till ett tidigt beslut. [Vinext](https://github.com/cloudflare/vinext) |
| Supabase JS 2.115.0, Auth/Postgres | Återanvänd sessioner, SQL-migrationer och RLS. Molnkonfiguration/serverversion återstår att verifiera. |

Prova direkt Supabase OIDC eller SAML efter vald IdP; broker införs först vid ett visat behov. OIDC-stöd finns, men kontolänkning och tillåten utfärdare måste provas. SAML-stöd bevisar ingen färdig Skolfederationsanslutning. [OIDC](https://supabase.com/docs/guides/auth/custom-oauth-providers), [SAML](https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml), [Skolfederation](https://skolfederation.se/kom-i-gang-for-tjansteleverantorer/)

Zod 4 och DB-behörighetstester är föreslagna tillägg. `@supabase/ssr` är inte installerat. Node-kravet är `>=22.13.0`; det innebär inte Node-kompatibilitet i Workers.

### Funktioner och avgränsning

[FEATURES.md](FEATURES.md) prioriterar:

- **Grundfunktioner:** verifierade konton, återkallningsbar åtkomst, uppdrag per skola, beständiga elever/placeringar/klasser, skyddade uppgifter, kontrollerad export, importavstämning, historik och användbara dator-/telefonflöden.
- **Mervärden:** sammanhängande elevkontext, planjämförelser och granskning av massändringar. Pilotens tydliga käll- och felstatus ger första byggstenen.
- **Senare:** fulla studieplans-, undervisnings-, schema- och ärendeflöden, vårdnadshavarportal, fler integrationer/tvåvägssynk och eventuell egen diarietjänst. Ingen full SchoolSoft-paritet eller medicinsk journal i piloten.

Befintlig planlagring är dokumenterad; elevadministrationen använder huvudsakligen syntetiska sessionsdata. Historiska tester bevisar inte dagens skydd.

### Arkitektur

[ARCHITECTURE.md](ARCHITECTURE.md) föreslår klientadapter → skyddade Worker-operationer → Postgres, normalt med användarens verifierade kontext. Modulerna ansvarar för identitet/kontolivscykel, uppdrag, befintlig organisationsplanering, elever, integration samt spårbarhet/drift. Serverklient skapas per begäran.

Kundmiljö, huvudman, skolenhet, konto och elev är skilda begrepp. Relationer får giltighet; externa ID:n får kund- och källkontext. Admin och import delar verksamhetsoperationer. Undvik dubbel skrivning vid migrering.

### Kritiska risker

1. **Demo och alternativa datavägar:** stäng installerad `bootstrap_demo_profile` på pilotvägen; granska grants, RLS, vyer och funktioner tillsammans. Anonym autentisering använder också `authenticated`. En ny endpoint stänger inte direkt DB-åtkomst. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
2. **Kontolänkning och fördröjd spärr:** automatisk OAuth-länkning via e-post kräver kollisionsprov. Kontrollera aktuell session, medlemskap och uppdrag även med gammal token; mät extern leveransfördröjning separat. [Identitetslänkning](https://supabase.com/docs/guides/auth/auth-identity-linking), [utloggning](https://supabase.com/docs/reference/javascript/auth-signout)
3. **Felaktig import och röjande metadata:** besluta skrivansvar; pröva skyddade elever i varje läsväg. Avvisa ofullständiga leveranser, stoppa oväntade massändringar och säkerställ upprepbar tillämpning.
4. **Otillräcklig audit/återställning:** härled aktör på servern; logga obligatoriska läsningar även vid direktanrop. Nekade försök behöver loggning som överlever avbruten transaktion. Återställning måste bevara aktuella spärrar. [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
5. **Automatiserad lagtolkning:** registrering, ordnande och webbpublicering är skilda frågor. Appstatus, elevantal, ”utkast” eller lagdatum ska inte automatiskt styra klassning, publicering, gallring eller projektdeadlines. Granskade övergångsregler och undantag finns i [PITFALLS.md](PITFALLS.md). [OSL](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/offentlighets-och-sekretesslag-2009400_sfs-2009-400/), [skollagen](https://data.riksdagen.se/dokument/sfs-2010-800.html)

## Konsekvenser för färdplanen

Fem arbetsområden rekommenderas. Fasnummer och kravägare fastställs i färdplanen.

| Fasförslag | Varför och leverans | Funktioner/risker att täcka |
|---|---|---|
| **1. Baslinje och pilotprofil** | Dokumentera nuläge, regression, avskild miljö, informationsansvar och anslutningsprofil före migrering. Öppna kundval får stå öppna. | BASE/PILOT; demoavskiljning, bevarande av uppskattade flöden, felaktiga juridiska antaganden. |
| **2. Identitet, uppdrag och skyddad operation** | Prova vald authkedja i Worker och inför aktuella mandat före elevlagring. Leverera verifierad kundetablering, session/spärr och behörighetsmatris med tidig audit. | IAM/ACL och grundläggande AUDIT; två kunder/två skolor, kontokollisioner, gammal token, direkta DB-anrop. HM utser rektor; rektor tilldelar lärare. |
| **3. Beständigt elevregister och administration** | Leverera sökning → elevkort → tillåten ändring → omläsning, sedan datumsatta relationer och export. Importen behöver dessa kontroller. | STU/DATA, ADMIN och UX; skyddsfall, ursprung, versionskonflikter, bevarade plan-/kull-/klassflöden på dator/telefon. |
| **4. En avstämd registerintegration** | Använd elevmodellens identiteter och skrivregler. Leverera begränsad maskinidentitet, granskning, körningsstatus, avstämning och återstart. | INT; dubbletter, radfel, tom leverans, partiellt fel, äldre leverans och avslut. INT-07 kräver faktisk leverantörsmiljö. |
| **5. Samlad pilotberedskap** | Pröva hela kedjan samt incident, återställning, kundexport, avveckling och kundens informationshantering. | INFO/OPS, fullständiga audit- och arbetsprov; loggbortfall, återöppnade rättigheter och oklara drift-/biträdesansvar. |

Kund- och leverantörskontakt löper från start. Regression, spårbarhet och mobilanvändning provas vid varje berörd förändring. Om direkt DB-åtkomst kan kringgå obligatorisk audit måste elevvägen göras serverexklusiv innan fas 3 fortsätter.

### Researchflaggor

- **Fördjupa i fas 2:** faktisk IdP, kontolänkning, sessionsindragning, tokenlagring och DB/audit-gräns. Helt serverlagrad session utökar migreringsarbetet.
- **Fördjupa i fas 3–5:** kundens skyddsfall, registerkontrakt/avslutssemantik, informationshantering och faktisk återställning. SS 12000-namn eller simulator ersätter inte leverantörsprov. [SIS](https://www.sis.se/delta-och-paverka/tksidor/tk400499/sistk450/ss-12000/)
- **Standardmönster:** baslinje, SQL-migrationer, befintliga UI-adaptrar och regression behöver riktad kodgranskning/prov, ingen ny bred teknikresearch.

## Tillförlitlighet och luckor

| Område | Nivå | Begränsning |
|---|---|---|
| Teknik | HÖG nuläge/stöd; MEDEL val | Kombinationen och molnkonfigurationen saknar nya körprov. |
| Funktioner | HÖG omfattningsbeslut; MEDEL detaljer | Pilotens verksamhetsprov återstår. |
| Arkitektur | MEDEL | Föreslagen modul- och datamodell; ingen implementation. |
| Risker | HÖG primärkällor; MEDEL tillämpning | Kundens faktiska uppgifter, processer och avtal saknas. |

**Öppet inför planering:** pilotkund/skolform, IdP, registerkälla, elevfält, rättighetsmatris, skyddsfall, källägare, drift/avtal och behovsbedömning av konsekvensbedömning. Pilotvolym samt spärr-/återställningsmål måste beslutas och mätas; inga egna SLA-tal införs.

## Källor

Syntesen bygger på [STACK](STACK.md), [FEATURES](FEATURES.md), [ARCHITECTURE](ARCHITECTURE.md) och [PITFALLS](PITFALLS.md), daterade 2026-09-10. Primärkällor länkas ovan; källvärderingar finns i underlagen. Designförslag och leverantörsbeskrivningar är inte implementeringsbevis. Ingen ny kodrevision eller testkörning ingick.

---
*Redo som underlag för färdplansförslag; detaljomfattning och pilotgodkännande återstår.*
