# Tjänstefördelning — verifieringsmatris

Datum: 2026-10-16. **Planerat; inga produktprov utförda för detta paket.** Plancheckens resultat hör till PLAN-CHECK, inte till produktens godkännande.

| Kriterium | Modell | SQL/API | Dator/telefon | Mänskligt prov |
|---|---|---|---|---|
| TJ1-01 flera avtal/version/giltighet | väntar02 | väntar09 | väntar10A/17 | väntar19 |
| TJ1-02 identitet/period/kapacitet | väntar01/03 | väntar09 | väntar10/17 | väntar19 |
| TJ1-03 klassbehov/samläsning | väntar03 | väntar09 | väntar11/17 | väntar19 |
| TJ1-04 hela tjänstens budget | väntar02/03 | väntar09 | väntar11/17 | väntar19 |
| TJ1-05 individuell bedömning | väntar03A | väntar09 | väntar12/17 | väntar19 |
| TJ1-06 rektorsbeslut/egenplan/HM | väntar03A | väntar09 | väntar12/13/14/17 | väntar19 |
| TJ1-07 undantagsprocess | väntar03A | väntar09 | väntar12/13/17 | väntar19 |
| TJ1-08 kopiering/flytt/batch | väntar15 | väntar15B/15C/17 | väntar15A/17 | väntar19 |
| TJ1-09 mandat/audit/konkurrens | väntar01A | väntar04A/07B/09/17 | väntar17 | begripliga nekanden i19 |
| TJ1-10 begriplighet/SS12000 | kontrakt granskas | intern paritet väntar09/17 | väntar16/17 | väntar19 |

SS 12000:2024/OpenAPI2.1.0 har endast granskats som schemastruktur. Export/import mot verklig motpart är inte utförd eller inkluderad här. TID-10–12:s verkliga schemakoppling och arbetstidsutfall återstår i T3/T4 även när detta paket blir klart.

Vid genomförande: länka varje resultat till SUMMARY och hemlighetsfri rapportmetadata, exakt source/build/migrationshash, testmål och metod. Redovisa första fel, reparation, omprov, kvarstående gap och cleanup. Ny produktkod kräver nytt relevant prov; äldre PASS får inte ersätta det.
