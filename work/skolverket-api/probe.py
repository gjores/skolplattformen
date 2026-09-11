"""Kontroll av Skolverkets öppna API:er mot projektets behov.

Kör: python3 work/skolverket-api/probe.py
Skriver en kort rapport till stdout. Ingen skrivning, ingen autentisering.
Underlag till docs/oppna-api-skolverket.md.
"""

import json
import sys
import time
import urllib.error
import urllib.request

SYLLABUS = "https://api.skolverket.se/syllabus/v1"
SKOLENHET = "https://api.skolverket.se/skolenhetsregistret/v1"
PLANNED = "https://api.skolverket.se/planned-educations/v3"
PLANNED_ACCEPT = "application/vnd.skolverket.plannededucations.api.v3.hal+json"


def get(url, accept="application/json"):
    req = urllib.request.Request(url, headers={"Accept": accept})
    started = time.time()
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    return json.loads(raw), len(raw), time.time() - started


def line(label, ok, detail=""):
    print(f"{'OK ' if ok else 'FEL'}  {label:<44} {detail}")


def syllabus_regimes():
    """typeOfSyllabus är den maskinläsbara motsvarigheten till projektets Regime."""
    d, size, t = get(f"{SYLLABUS}/subjects?schooltype=gy")
    subjects = d["subjects"]
    counts = {}
    for s in subjects:
        counts[s["typeOfSyllabus"]] = counts.get(s["typeOfSyllabus"], 0) + 1
    line(
        "syllabus /subjects?schooltype=gy",
        True,
        f"{len(subjects)} ämnen, {size // 1024} kB, {t:.2f}s, {counts}",
    )
    gy25 = [s for s in subjects if s["typeOfSyllabus"] == "GRADE_SUBJECT_SYLLABUS"]
    gy11 = [s for s in subjects if s["typeOfSyllabus"] == "SUBJECT_SYLLABUS"]
    line("  Gy25 = GRADE_SUBJECT_SYLLABUS", bool(gy25), f"{len(gy25)} ämnen med nivåer")
    line("  Gy11 = SUBJECT_SYLLABUS", bool(gy11), f"{len(gy11)} ämnen med kurser")
    utgangna = [s for s in gy11 if s.get("canceledSkolfs")]
    line("  giltighet finns i svaret", bool(utgangna),
         f"{len(utgangna)} med canceledSkolfs/canceledDate")
    return gy25, gy11


def syllabus_levels(gy25):
    """Nivå i Gy25-ämne: kod, namn och poäng — det som en studieplansrad behöver."""
    mate = next(s for s in gy25 if s["code"] == "MATE")
    levels = [(c["code"], c["name"], c["points"]) for c in mate["courses"]]
    line("  MATE (Matematik, Gy25) nivåer", len(levels) > 0, str(levels[:3]))
    d, _, _ = get(f"{SYLLABUS}/subjects/MATE")
    s = d.get("subject", d)
    steps = [k["gradeStep"] for k in s.get("knowledgeRequirements", [])]
    line("  MATE betygskriterier", steps == ["E", "D", "C", "B", "A"], str(steps))
    line("  MATE centralt innehåll per nivå",
         bool(s["courses"][0].get("centralContent")),
         f"version {s.get('version')}, skolfs {s.get('skolfsGrund')}")


def syllabus_course():
    d, _, _ = get(f"{SYLLABUS}/courses/MATMAT01b")
    c = d.get("course", d)
    line("syllabus /courses/MATMAT01b (Gy11)", c["name"] == "Matematik 1b",
         f"{c['points']} p, {c['typeOfSyllabus']}, ämne {c.get('subjectParent', {}).get('subjectCode', '?')}")


def syllabus_gr():
    d, size, _ = get(f"{SYLLABUS}/subjects?schooltype=gr")
    line("syllabus /subjects?schooltype=gr", True, f"{len(d['subjects'])} ämnen, {size // 1024} kB")
    d2, _, _ = get(f"{SYLLABUS}/subjects/GRGRSVE01")
    s = d2.get("subject", d2)
    line("  GRGRSVE01 (Svenska, Lgr22)", s["typeOfSyllabus"] == "COURSE_SYLLABUS",
         f"version {s.get('version')}, betygsskala {s.get('gradeScale')}")


def syllabus_programs():
    d, size, _ = get(f"{SYLLABUS}/programs?schooltype=gy")
    ps = d["programs"]
    sa = next((p for p in ps if p["code"] == "SA"), None)
    line("syllabus /programs?schooltype=gy", True, f"{len(ps)} program, {size // 1024} kB")
    if sa:
        line("  SA inriktningar", True,
             str([o["code"] for o in sa.get("orientations", [])]))


def syllabus_versions():
    d, _, _ = get(f"{SYLLABUS}/subjects/GRGRSVE01/versions")
    versions = d["subjects"]
    line("syllabus /subjects/{code}/versions", len(versions) > 1,
         f"GRGRSVE01: {len(versions)} versioner, senast skolfs "
         f"{versions[0].get('skolfsAndring')} — grund för Styrdokumentsversion")


def skolenhetsregistret():
    d, size, t = get(f"{SKOLENHET}/skolenhet")
    line("skolenhetsregistret /skolenhet", True,
         f"{len(d['Skolenheter'])} enheter, {size // 1024} kB, {t:.2f}s")
    d2, _, _ = get(f"{SKOLENHET}/skolenhet/19207279")
    info = d2["SkolenhetInfo"]
    line("  detalj: rektor, adress, skolformer",
         bool(info.get("Rektorsnamn") and info.get("Skolformer")),
         f"{info['Namn']}, {[f['Benamning'] for f in info['Skolformer']]}")


def planned_educations():
    d, size, _ = get(f"{PLANNED}/school-units?size=2", PLANNED_ACCEPT)
    units = d["body"]["_embedded"]["listedSchoolUnits"]
    line("planned-educations /school-units", bool(units),
         f"kräver Accept: {PLANNED_ACCEPT[:46]}…")
    line("  obs: 406 utan rätt Accept-header", True, "")


def cors():
    req = urllib.request.Request(
        f"{SYLLABUS}/valuestore/schooltypes",
        headers={"Origin": "http://localhost:3000", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        acao = r.headers.get("access-control-allow-origin")
    line("CORS på syllabus", acao == "*", f"access-control-allow-origin: {acao}")


def main():
    print("Skolverkets öppna API:er — kontroll utan autentisering\n")
    try:
        gy25, _ = syllabus_regimes()
        syllabus_levels(gy25)
        syllabus_course()
        syllabus_gr()
        syllabus_programs()
        syllabus_versions()
        skolenhetsregistret()
        planned_educations()
        cors()
    except (urllib.error.URLError, KeyError, StopIteration) as e:
        print(f"\nAvbrott: {type(e).__name__}: {e}", file=sys.stderr)
        return 1
    print("\nKontrollen läser endast. Den bevisar tillgänglighet vid körtillfället,")
    print("inte att innehållet är rätt tolkat för en enskild elevkull.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
