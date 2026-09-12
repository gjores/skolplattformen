# Phase 2: Verifierad kontoåtkomst - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-12
**Phase:** 02-verifierad-konto-tkomst
**Areas discussed:** Inloggning och testidentitet, Första företrädaren, Uppdragsval och kontextbyte, Spärr/sessionsslut/logg

---

## Väntande todos

| Option | Description | Selected |
|--------|-------------|----------|
| Ingen — behåll i kön | Behörighets-API hör till fas 3, läsårslins är planering | ✓ |
| API för lärares behörigheter | Kräver uppdragsmodell med giltighet redan i fas 2 | |
| Läsårslins som i Plan Digital | Ren planeringsfunktion | |

---

## Inloggning och testidentitet

| Option | Description | Selected |
|--------|-------------|----------|
| Lokal OIDC-testleverantör | Keycloak i Docker via Supabase Auth; provar federationsvägen nu | ✓ |
| Supabase Auth e-post + TOTP | Snabbast, federationen provas först i fas 7 | |
| Båda | OIDC huvudväg + e-post/TOTP reservkonto | |

| Option | Description | Selected |
|--------|-------------|----------|
| Utfärdare + stabilt subjekt-ID | (issuer, sub) som identitet, e-post visningsuppgift | ✓ |
| E-post som nyckel | Enklare men bryter regeln om e-post som identitet | |

| Option | Description | Selected |
|--------|-------------|----------|
| IdP:n ansvarar, appen kräver bevis | amr/acr-anspråk krävs för administrativa åtgärder | ✓ |
| Ingen MFA i fas 2 | Skjuts till fas 7 | |
| Appen kör egen TOTP | Dubbla faktorer i produktion | |

**User's choice:** rekommenderade alternativ i alla tre.

---

## Första företrädaren

| Option | Description | Selected |
|--------|-------------|----------|
| Leverantörsutfärdad inbjudan | Tidsbegränsad engångsinbjudan bunden till person och utfärdare | ✓ |
| Förkonfigurerad kund via admin-CLI | Kräver känt sub i förväg | |
| Självregistrering med granskning | Publik yta som måste skyddas | |

| Option | Description | Selected |
|--------|-------------|----------|
| Kund ≠ huvudman | Egen tenant-nivå ovanför organizers | ✓ |
| Kund = huvudman | Dagens organizers som kundgräns | |

| Option | Description | Selected |
|--------|-------------|----------|
| Bara kundadministration | Ingen elevåtkomst av etableringen | ✓ |
| Full huvudmannarätt | Snabbare men bryter principen | |

**User's choice:** rekommenderade alternativ i alla tre.

---

## Uppdragsval och kontextbyte

| Option | Description | Selected |
|--------|-------------|----------|
| Alltid i sidhuvudet | Som Exempelskola-väljaren och Plan Digital | ✓ |
| Väljare vid inloggning | Låst per session | |
| Båda | Mellansida först, sedan sidhuvud | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rensa allt, alla flikar | BroadcastChannel, varning för osparat | ✓ |
| Rensa i aktiv flik | Gamla flikar kan visa föregående kund | |

| Option | Description | Selected |
|--------|-------------|----------|
| Bara giltiga idag; kommande/utgångna gråa | Servern prövar giltighet per anrop | ✓ |
| Bara giltiga, övriga döljs | Renare men mindre begripligt | |

**User's choice:** rekommenderade alternativ i alla tre.

---

## Spärr, sessionsslut och logg

| Option | Description | Selected |
|--------|-------------|----------|
| Serverlager i Workern + RLS som andra linje | Cookie-session, kontext per anrop, aktör härleds på servern | ✓ |
| Direkt klient → Postgres med triggers | Mindre infrastruktur, svårare enhetlighet | |

| Option | Description | Selected |
|--------|-------------|----------|
| Prövning per anrop mot medlemskapstabellen | Token bevisar identitet, aldrig rättighet; kort glidande session | ✓ |
| Kort token + omförhandling | Fönster där spärrad användare kommer åt | |

| Option | Description | Selected |
|--------|-------------|----------|
| Kundadministratör inom sin kund; leverantör som nödväg | MFA-bevis; loggad nödrutin | ✓ |
| Bara leverantören | Kunden kan inte agera själv | |

| Option | Description | Selected |
|--------|-------------|----------|
| Alla beständiga ändringar + spärr/inloggning; kundens granskare läser | Server-skriven, oföränderlig, exporterbar | ✓ |
| Bara skrivningar, bara leverantören läser | Minsta uppfyllnad | |

**User's choice:** rekommenderade alternativ i alla fyra.

---

## Claude's Discretion

Val av OIDC-testleverantör och seedning; sessionsmekanik i Workern; tabellmodell och migration av `profiles`/`assignments`; skydd mot loggfyllning; flikrensningskanal; testupplägg (utöka fas 1:s prov).

## Deferred Ideas

Leverantörens egen åtkomstväg (fas 6); vårdnadshavar-/elevinloggning; SCIM (fas 7); de två väntande todos.
