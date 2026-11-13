//! Motorns besked prövas mot den fristående validatorn. Allt underlag är
//! syntetiskt och byggt i testet.

use schemamotor_model::*;
use schemamotor_solve::{solve, Options};
use schemamotor_validate::{validate, validate_solution};
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;

fn problem(extra: Value) -> Problem {
    let mut v = json!({
        "version": CONTRACT_VERSION,
        "id": "prov",
        "time": { "step_min": 5, "start_grid_min": 10, "days": (0..5).map(|_| json!({ "start_min": 480, "end_min": 960 })).collect::<Vec<_>>() },
        "lessons": []
    });
    for (k, x) in extra.as_object().unwrap() {
        v[k] = x.clone();
    }
    serde_json::from_value(v).expect("underlaget följer kontraktet")
}

fn lesson(id: &str, min: u32, teacher: &str, group: &str) -> Value {
    json!({ "id": id, "duration_min": min, "teachers": [teacher], "groups": [group] })
}

fn run(p: &Problem) -> Solution {
    let opt = Options { time_limit_ms: None, max_iters: Some(30_000), threads: 1, seed: 7 };
    let s = solve(p, &opt, &AtomicBool::new(false));
    let report = validate_solution(p, &s);
    assert!(report.ok(), "validatorn underkänner: {:?}", report.violations.iter().map(|v| &v.message).collect::<Vec<_>>());
    s
}

fn proof(s: &Solution, code: &str) -> bool {
    s.diagnoses.iter().any(|d| d.proof && d.code == code)
}

/// En liten skola: två klasser, tre lärare, salar med egenskaper, lunch.
fn school() -> Problem {
    let mut lessons = Vec::new();
    for class in ["7A", "7B"] {
        for (subject, teacher, n, min) in [("sv", "t-sv", 3, 60), ("ma", "t-ma", 4, 50), ("idh", "t-idh", 2, 60)] {
            for k in 0..n {
                let mut l = lesson(&format!("{class}-{subject}-{k}"), min, teacher, class);
                l["activity"] = json!(format!("{class}-{subject}"));
                l["rooms"] = json!({ "count": 1, "features": [if subject == "idh" { "idrott" } else { "klassrum" }] });
                lessons.push(l);
            }
        }
    }
    let activities: Vec<Value> = ["7A", "7B"].iter().flat_map(|c| ["sv", "ma", "idh"].map(|s| json!({ "id": format!("{c}-{s}") }))).collect();
    problem(json!({
        "teachers": [{ "id": "t-sv" }, { "id": "t-ma", "max_min_per_day": 200 }, { "id": "t-idh" }],
        "groups": [{ "id": "7A", "size": 25 }, { "id": "7B", "size": 27 }],
        "rooms": [
            { "id": "r1", "features": ["klassrum"] }, { "id": "r2", "features": ["klassrum"] }, { "id": "hall", "features": ["idrott"] }
        ],
        "activities": activities,
        "lessons": lessons,
        "rules": { "break_min": 10, "lunch": { "window_start_min": 630, "window_end_min": 810, "length_min": 40, "teachers": true }, "same_day": "avoid", "student_max_min_per_day": 300 },
        "weights": { "late_after_min": 900 }
    }))
}

#[test]
fn complete_schedule_passes_the_validator_with_equal_metrics() {
    let p = school();
    let s = run(&p);
    assert_eq!(s.status, Status::Complete);
    assert_eq!(s.placements.len(), p.lessons.len());
    assert_eq!(s.metrics, validate(&p, &s.placements).metrics);
    assert_eq!(s.metrics.same_day_repeats, 0);
}

#[test]
fn same_input_and_seed_give_the_same_schedule() {
    let p = school();
    let (a, b) = (run(&p), run(&p));
    assert_eq!(serde_json::to_string(&a.placements).unwrap(), serde_json::to_string(&b.placements).unwrap());
    assert_eq!(a.metrics, b.metrics);
}

/// S02: läraren kan bara tisdag 09–10 men har två pass på 60 minuter.
#[test]
fn too_little_time_is_proved_not_timed_out() {
    let unavailable: Vec<Value> = (0..5u32)
        .flat_map(|d| if d == 1 { vec![json!({ "day": 1, "start_min": 480, "end_min": 540 }), json!({ "day": 1, "start_min": 600, "end_min": 960 })] } else { vec![json!({ "day": d, "start_min": 480, "end_min": 960 })] })
        .collect();
    let p = problem(json!({
        "teachers": [{ "id": "t", "unavailable": unavailable }],
        "groups": [{ "id": "g" }],
        "lessons": [lesson("a", 60, "t", "g"), lesson("b", 60, "t", "g")]
    }));
    let s = run(&p);
    assert_eq!(s.status, Status::Infeasible);
    assert!(s.diagnoses.iter().any(|d| d.proof && d.resources.contains(&"t".to_string())), "{:?}", s.diagnoses);
    assert_eq!(s.metrics.placed_lessons, 1, "ett delschema ska ändå lämnas");
}

#[test]
fn simultaneous_lessons_with_a_shared_student_are_proved_impossible() {
    let p = problem(json!({
        "teachers": [{ "id": "t1" }, { "id": "t2" }],
        "clusters": [{ "id": "k1", "size": 10 }, { "id": "k2", "size": 10 }, { "id": "k3", "size": 10 }],
        "groups": [{ "id": "val1", "clusters": ["k1", "k2"] }, { "id": "val2", "clusters": ["k2", "k3"] }],
        "lessons": [lesson("a", 60, "t1", "val1"), lesson("b", 60, "t2", "val2")],
        "links": [{ "kind": "simultaneous", "lessons": ["a", "b"] }]
    }));
    let s = run(&p);
    assert_eq!(s.status, Status::Infeasible);
    assert!(proof(&s, "self_conflict"), "{:?}", s.diagnoses);
}

#[test]
fn simultaneous_and_no_overlap_links_hold() {
    let p = problem(json!({
        "teachers": [{ "id": "t1" }, { "id": "t2" }, { "id": "t3" }],
        "groups": [{ "id": "g1" }, { "id": "g2" }, { "id": "g3" }],
        "rooms": [{ "id": "r1" }, { "id": "r2" }],
        "lessons": [
            { "id": "a", "duration_min": 60, "teachers": ["t1"], "groups": ["g1"], "rooms": { "count": 1 } },
            { "id": "b", "duration_min": 40, "teachers": ["t2"], "groups": ["g2"], "rooms": { "count": 1 } },
            lesson("c", 60, "t3", "g3"), lesson("d", 60, "t3", "g3"), lesson("e", 480, "t2", "g2")
        ],
        "links": [{ "kind": "simultaneous", "lessons": ["a", "b"] }, { "kind": "no_overlap", "lessons": ["a", "c", "d"] }]
    }));
    let s = run(&p);
    assert_eq!(s.status, Status::Complete);
    let at = |id: &str| s.placements.iter().find(|x| x.lesson == id).unwrap();
    assert_eq!((at("a").day, at("a").start_min), (at("b").day, at("b").start_min));
    assert_ne!(at("a").rooms, at("b").rooms);
}

#[test]
fn simultaneous_lessons_that_need_more_rooms_than_exist_are_proved_impossible() {
    let p = problem(json!({
        "teachers": [{ "id": "t1" }, { "id": "t2" }],
        "groups": [{ "id": "g1" }, { "id": "g2" }],
        "rooms": [{ "id": "r1" }],
        "lessons": [
            { "id": "a", "duration_min": 60, "teachers": ["t1"], "groups": ["g1"], "rooms": { "count": 1 } },
            { "id": "b", "duration_min": 60, "teachers": ["t2"], "groups": ["g2"], "rooms": { "count": 1 } }
        ],
        "links": [{ "kind": "simultaneous", "lessons": ["a", "b"] }]
    }));
    let s = run(&p);
    assert_eq!(s.status, Status::Infeasible);
    assert!(proof(&s, "no_room"), "{:?}", s.diagnoses);
}

#[test]
fn lunch_is_kept_free_on_a_full_day() {
    // En dag 08–14 med fyra timmar undervisning: lunchen måste ändå få plats.
    let mut p = problem(json!({
        "teachers": [{ "id": "t1" }, { "id": "t2" }],
        "groups": [{ "id": "g" }],
        "lessons": [lesson("a", 60, "t1", "g"), lesson("b", 60, "t2", "g"), lesson("c", 60, "t1", "g"), lesson("d", 60, "t2", "g"), lesson("e", 50, "t1", "g")],
        "rules": { "break_min": 10, "lunch": { "window_start_min": 660, "window_end_min": 780, "length_min": 40 } }
    }));
    p.time.days = vec![Day { start_min: 480, end_min: 840 }];
    let s = run(&p);
    assert_eq!(s.status, Status::Complete);

    // Samma pass på 08–13.30: dagen fylls helt och lunchen får inte plats.
    p.time.days = vec![Day { start_min: 480, end_min: 810 }];
    let s = run(&p);
    assert_ne!(s.status, Status::Complete);
    assert!(s.metrics.unplaced_lessons > 0);
}

#[test]
fn locked_lessons_stay_and_conflicting_locks_are_proved() {
    let mut a = lesson("a", 60, "t", "g");
    a["locked"] = json!({ "day": 2, "start_min": 600 });
    let mut b = lesson("b", 60, "t", "g");
    let base = json!({ "teachers": [{ "id": "t" }], "groups": [{ "id": "g" }] });
    let mut v = base.clone();
    v["lessons"] = json!([a, b]);
    let s = run(&problem(v));
    assert_eq!(s.status, Status::Complete);
    let at = s.placements.iter().find(|x| x.lesson == "a").unwrap();
    assert_eq!((at.day, at.start_min), (2, 600));

    b["locked"] = json!({ "day": 2, "start_min": 630 });
    let mut v = base;
    v["lessons"] = json!([a, b]);
    let s = run(&problem(v));
    assert_eq!(s.status, Status::Infeasible);
    assert!(proof(&s, "locked_conflict"), "{:?}", s.diagnoses);
}

#[test]
fn a_change_moves_only_what_it_has_to() {
    let mut p = school();
    let first = run(&p);
    assert_eq!(first.status, Status::Complete);
    // Idrottsläraren blir borta den dag hen har flest pass.
    let on_day = |d: u32| first.placements.iter().filter(|x| x.lesson.contains("idh") && x.day == d).count();
    let day = (0..5).max_by_key(|&d| on_day(d)).unwrap();
    let affected = on_day(day) as u32;
    assert!(affected > 0);
    p.teachers[2].unavailable.push(Interval { day, start_min: 480, end_min: 960 });
    p.reference = first.placements.clone();
    let s = run(&p);
    assert_eq!(s.status, Status::Complete);
    assert_eq!(s.metrics.moved_lessons, affected, "bara de berörda passen ska flyttas");
    assert_eq!(s.metrics, validate(&p, &s.placements).metrics);
}

#[test]
fn the_validator_catches_planted_faults() {
    let p = school();
    let s = run(&p);
    let mut bad = s.placements.clone();
    let (day, start) = (bad[0].day, bad[0].start_min);
    // Flytta klassens andra pass till samma tid som det första.
    bad[1].day = day;
    bad[1].start_min = start;
    let codes: Vec<&str> = validate(&p, &bad).violations.iter().map(|v| v.code).collect();
    assert!(codes.contains(&"teacher_clash") && codes.contains(&"student_clash"), "{codes:?}");

    let mut off = s.placements.clone();
    off[0].start_min += 3;
    assert!(validate(&p, &off).violations.iter().any(|v| v.code == "off_grid"));

    let mut gone = s.clone();
    gone.placements.pop();
    assert!(!validate_solution(&p, &gone).ok(), "ett pass som varken är placerat eller redovisat ska upptäckas");
}

#[test]
fn bad_input_is_reported_as_missing_input() {
    let p = problem(json!({ "groups": [{ "id": "g" }], "lessons": [lesson("a", 60, "finns-inte", "g")] }));
    let s = solve(&p, &Options::default(), &AtomicBool::new(false));
    assert_eq!(s.status, Status::InputMissing);
    assert!(s.placements.is_empty() && !s.diagnoses.is_empty());
}

#[test]
fn cancel_stops_the_search() {
    let p = school();
    let s = solve(&p, &Options { time_limit_ms: Some(60_000), ..Options::default() }, &AtomicBool::new(true));
    assert!(s.stats.elapsed_ms < 5_000);
    assert!(validate_solution(&p, &s).ok());
}

/// Två perioder där veckodagarna har olika många skoldagar. Två pass på 60 min:
/// på tisdag–torsdag ger varje pass 18 dagar, på måndag och fredag 17.
fn timed(min: u64, max: u64, allowed: Option<Value>) -> Problem {
    let mut lessons: Vec<Value> = (0..2).map(|k| { let mut l = lesson(&format!("sv-{k}"), 60, "t", "7A"); l["activity"] = json!("sv"); l["periods"] = json!(["ht"]); l }).collect();
    if let Some(a) = allowed {
        for l in &mut lessons {
            l["allowed"] = a.clone();
        }
    }
    problem(json!({
        "periods": [{ "id": "ht" }, { "id": "vt" }],
        "teachers": [{ "id": "t" }],
        "groups": [{ "id": "7A", "size": 20 }],
        "activities": [{ "id": "sv", "same_day": "forbid", "time": [{ "period": "ht", "weekday_days": [17, 18, 18, 18, 17], "min_min": min, "max_min": max }] }],
        "lessons": lessons,
        // Håltid för en lärare som också undervisar måndag och fredag drar mot fel dagar.
        "rules": { "break_min": 0, "same_day": "avoid" }
    }))
}

#[test]
fn activity_time_picks_weekdays_that_give_the_timetable_time() {
    // 2 × 60 × 18 = 2160 är den enda summan inom 2150–2160.
    let p = timed(2150, 2160, None);
    let s = run(&p);
    assert_eq!(s.status, Status::Complete);
    let days: Vec<u32> = s.placements.iter().map(|x| x.day).collect();
    assert!(days.iter().all(|d| (1..=3).contains(d)), "passen ska ligga tisdag–torsdag: {days:?}");
}

#[test]
fn unreachable_activity_time_is_proved() {
    // Kontrollanten underkänner delschemat, så motorn körs direkt.
    let go = |p: &Problem| solve(p, &Options { time_limit_ms: None, max_iters: Some(30_000), threads: 1, seed: 7 }, &AtomicBool::new(false));
    // Högst 2 × 60 × 18 = 2160.
    let s = go(&timed(2200, 2300, None));
    assert_eq!(s.status, Status::Infeasible);
    assert!(proof(&s, "activity_time"));
    // Bara måndag och fredag tillåtna: 2 × 60 × 17 = 2040.
    let edges = json!([{ "day": 0, "start_min": 480, "end_min": 960 }, { "day": 4, "start_min": 480, "end_min": 960 }]);
    let s = go(&timed(2100, 2160, Some(edges)));
    assert_eq!(s.status, Status::Infeasible);
    assert!(proof(&s, "activity_time"));
}

#[test]
fn the_validator_reports_activity_time() {
    let p = timed(2150, 2160, None);
    let at = |day: u32| [0u32, 1].map(|k| Placement { lesson: format!("sv-{k}"), day: day + k, start_min: 480, rooms: vec![] });
    assert!(validate(&p, &at(1)).violations.iter().all(|v| v.code != "activity_time"));
    let bad = validate(&p, &at(0));
    assert!(bad.violations.iter().any(|v| v.code == "activity_time" && v.message.contains("2100")), "{:?}", bad.violations);
    // Inget brott så länge ett pass saknas: det syns som oplacerat.
    assert!(validate(&p, &at(0)[..1]).violations.iter().all(|v| v.code != "activity_time"));
}

#[test]
fn activity_time_must_match_the_days() {
    let mut p = timed(0, 10, None);
    p.activities[0].time[0].weekday_days.pop();
    assert!(p.check().iter().any(|d| d.code == "activity_time"));
}
