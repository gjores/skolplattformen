# OPERATIONAL-02 — klassens användarflöde

Implementerat och verifierat lokalt 2026-10-12.

Fastställd gymnasietimplan har **Koppla klass** för rektor/skoladministratör och läsning för huvudman. Välj läsår, skapa beständig tom klass eller välj befintlig, granska tidigare version och bekräfta exakt versions-/årskurskoppling. Ersatta versioner visar kvarvarande länkar över alla år. Skapande flyttar inga elever eller befintliga kopplingar. Ny version flyttar inte klass.

Okänt kommandoresultat spärrar navigering och återanvänds med samma command-ID. Konflikt kräver ny underlagsläsning; klassnamnet bevaras. Osparat klassnamn spärrar timplanens direkta Läs om. Oberoende granskning hittade den sistnämnda luckan; den är rättad. Läsunderlag laddas när användaren öppnar klassdelen, inte vid varje timplansläsning.

Verifierat: 14 nya komponentprov på dator/telefon (inklusive versionsflöde), ingår i hela 56/56 PASS. Dessutom 2/2 riktade bildprov och visuell granskning av båda klassvyerna, ingen sidöverströmning. Skapa→koppla år1→år2→omläsning, tappat kvitto, exakt tidigare revision, konflikt, huvudmannaläsvy och ersatt version ingår. Dessa är syntetiska svar i faktisk React-vy, inte verklig DB-bevisning. Datavägen har separat 56 SQL/kontraktkontroller och 11 modell/routeprov i plan01; slutlig byggd Worker-kedja och verklig lokal klassvy redovisas i plan06. BF25 och BA25 har vardera 18/18 faktiska API/UI-kontroller PASS mot installerat bygge, inklusive explicit byte till version 2, exakt läsårsunderlag och läsande klassvyer på dator/telefon. Alla fyra bilder granskade; egna provdata städade och 20 ursprungliga verksamhetstabeller bevarade.

Handboken beskriver nya kommandon och bevarade länkar. Full ADMIN-04/fasacceptans för samtliga skolformer påstås inte.
