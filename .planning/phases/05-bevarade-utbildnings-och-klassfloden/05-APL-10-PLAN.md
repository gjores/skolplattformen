---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-10
type: execute
wave: 8
depends_on: ["APL-09"]
files_modified: [".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-USER-TRIAL.md", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-GAP.md", ".planning/STATE.md"]
autonomous: false
status: complete_with_ux_gap
gap: APL-01
must_haves:
  truths: ["Användaren förstår att spara APL-plan och fatta/skilja rektors- och huvudmannabeslut.", "Användaren kan tolka total/varav APL utan att tro att genomförande är verifierat."]
  artifacts: [".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-USER-TRIAL.md"]
  key_links: ["Tekniskt verifierad lokal leverans → konkret verksamhetsprov → separat mänskligt resultat"]
---

<objective>
Verifiera begripligheten efter färdig lokal leverans. Denna enda checkpointuppgift är avsiktligt avskild från implementation; automatiska prov från 08/09 upprepas inte som användararbete.
</objective>

<context>
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-USER-TRIAL.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-RELEASE.md
</context>

<tasks>
<task type="checkpoint:human-verify" gate="blocking">
<name>1. Bedöm om APL-planering och beslut går att förstå utan chattvägledning</name>
<what-built>APL-etapp 1 är tekniskt verifierad och levererad enligt 09. Användaren har en konkret provplan och högst sex steg i 05-APL-USER-TRIAL.md. Elevplacering, närvaro och genomförande hör fortfarande till senare etapper.</what-built>
<how-to-verify>Visa den kontrollerade startlänken och det korta provet från 09. Användaren ska kunna hitta APL, förstå de planerade perioderna och total/varav, ändra och spara utan hjälp, återöppna, känna igen rektorsförläggning och huvudmannens fastställande samt se vad som behöver kompletteras. Fråga om användaren förstår nästa steg och om något känns otydligt. Användaren behöver inte köra tekniska tester eller återgodkänna tidigare klass-/rektorsflöden. Desktop/telefon är redan automatiskt prövade; om användaren inte anger enhet eller enskilda delsteg får resultatet inte tillskrivas sådana detaljer.</how-to-verify>
<resume-signal>Användarens bedömning eller konkreta problem. Ett redan uttryckt godkännande för just levererad APL-etapp återfrågas inte.</resume-signal>
<verify>Registrera användarens faktiska formulering, vad den avser och eventuella kvarstående problem. Teknisk PASS är inte mänsklig acceptans. Vid gap: avgränsa rättning, behåll första observationen och verifiera ändringen innan nytt relevant prov.</verify>
<done>APL1-07 har redovisad användarbedömning. Antingen stängs endast etapp1:s begriplighetsdel eller så finns ett konkret öppet gap; etapp2/3 och full fas 5 anges inte som klara.</done>
</task>
</tasks>

<verification>
APL1-07 och 08. Resultatet skiljer användarrapporterad acceptans från observerat browserprov, lagstadgad genomföranderedovisning och full fasacceptans.
</verification>

<success_criteria>
- Användarens bedömning finns spårbar utan överdriven provomfattning.
- Bekräftad begriplighet eller konkret gap är dokumenterat; inga framtida APL-etapper märks klara.
</success_criteria>

<output>
Skriv 05-APL-10-SUMMARY.md och uppdatera USER-TRIAL/GAP/STATE med exakt acceptansomfattning. Samordnaren gör avgränsad commit/push.
</output>
