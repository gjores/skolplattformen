//! Syntetiska salsbokningar behöver inga påhittade lärare eller elevgrupper.
use schemamotor_model::{Placement, Problem, Solution, Status};
use schemamotor_solve::{solve, Options};
use schemamotor_validate::{validate, validate_solution};
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;

fn booking(version: u32) -> Problem {
    serde_json::from_value(json!({
        "version": version, "id": "room-booking",
        "time": { "step_min": 5, "days": [{ "start_min": 480, "end_min": 660 }] },
        "teachers": [{ "id": "t" }], "groups": [{ "id": "g" }],
        "rooms": [{ "id": "r1" }, { "id": "r2" }],
        "lessons": [
            { "id": "booking", "duration_min": 20, "rooms": { "count": 1, "allowed": ["r1"] },
              "locked": { "day": 0, "start_min": 540, "rooms": ["r1"] },
              "margin": { "rooms": { "before_min": 10, "after_min": 15 } } },
            { "id": "teaching", "duration_min": 60, "teachers": ["t"], "groups": ["g"],
              "allowed": [{ "day": 0, "start_min": 480, "end_min": 540 }],
              "rooms": { "count": 1, "allowed": ["r1", "r2"] } }
        ], "rules": { "break_min": 0, "same_day": "allow", "lunch": null }
    })).unwrap()
}

fn at(lesson: &str, start_min: u32, rooms: &[&str]) -> Placement {
    Placement { lesson: lesson.into(), day: 0, start_min, rooms: rooms.iter().map(|r| (*r).into()).collect() }
}

fn run(p: &Problem) -> Solution {
    solve(p, &Options { time_limit_ms: None, max_iters: Some(5_000), threads: 1, seed: 7 }, &AtomicBool::new(false))
}

#[test]
fn room_only_booking_is_solved_and_validated_without_dummy_people_in_v4_and_v5() {
    for version in [4, 5] {
        let p = booking(version);
        assert!(p.lessons[0].teachers.is_empty() && p.lessons[0].groups.is_empty());
        assert!(p.check().is_empty(), "v{version}: {:?}", p.check());
        let solution = run(&p);
        assert_eq!(solution.version, version);
        assert_eq!(solution.status, Status::Complete, "v{version}: {:?}", solution.diagnoses);
        assert!(validate_solution(&p, &solution).ok());
        assert_eq!(solution.placements.iter().find(|p| p.lesson == "teaching").unwrap().rooms, ["r2"]);
        assert_eq!(p.teachers.len(), 1);
        assert_eq!(p.groups.len(), 1);
    }
}

#[test]
fn room_search_distinguishes_a_margin_clash_from_a_free_room_in_v4_and_v5() {
    for version in [4, 5] {
        let p = booking(version);
        let collision = validate(&p, &[at("booking", 540, &["r1"]), at("teaching", 480, &["r1"])]);
        assert!(collision.violations.iter().any(|v| v.code == "room_clash" && v.lessons.contains(&"booking".into())), "v{version}: {:?}", collision.violations);
        assert!(!collision.violations.iter().any(|v| v.code == "bad_problem"));
        assert!(validate(&p, &[at("booking", 540, &["r1"]), at("teaching", 480, &["r2"])]).ok());
    }
}

#[test]
fn empty_lessons_and_invalid_room_demands_still_fail_before_solving() {
    for version in [4, 5] {
        for (requirement, expected) in [
            (Value::Null, "empty_lesson"),
            (json!({ "count": 0, "allowed": ["r1"] }), "room_count"),
            (json!({ "count": 1, "allowed": ["unknown"] }), "unknown_ref"),
        ] {
            let mut value = serde_json::to_value(booking(version)).unwrap();
            value["lessons"][0]["rooms"] = requirement;
            let p: Problem = serde_json::from_value(value).unwrap();
            assert!(p.check().iter().any(|d| d.code == expected), "v{version} {expected}: {:?}", p.check());
            assert_eq!(run(&p).status, Status::InputMissing);
            // V4:s äldre fristående placeringskontroll ändras inte av denna modellrättning.
            if version == 5 { assert!(!validate(&p, &[at("booking", 540, &["r1"]), at("teaching", 480, &["r2"])]).ok()); }
        }
    }
}

#[test]
fn room_only_booking_keeps_room_count_features_capacity_and_availability_checks() {
    for version in [4, 5] {
        let p: Problem = serde_json::from_value(json!({
            "version": version, "id": "room-demands",
            "time": { "step_min": 5, "days": [{ "start_min": 480, "end_min": 660 }] },
            "rooms": [
                { "id": "r1", "features": ["studio"], "capacity": 20 },
                { "id": "r2", "features": ["studio"], "capacity": 12,
                  "unavailable": [{ "day": 0, "start_min": 600, "end_min": 660 }] },
                { "id": "r3", "features": ["classroom"], "capacity": 5 }
            ],
            "lessons": [{ "id": "booking", "duration_min": 20,
                "rooms": { "count": 2, "features": ["studio"], "min_capacity": 10 } }]
        })).unwrap();
        assert!(p.check().is_empty());
        let solution = run(&p);
        assert_eq!(solution.status, Status::Complete);
        assert!(validate_solution(&p, &solution).ok());
        for (placement, code) in [
            (at("booking", 480, &["r1"]), "room_count"),
            (at("booking", 480, &["r1", "r3"]), "room_unfit"),
            (at("booking", 600, &["r1", "r2"]), "room_unavailable"),
        ] {
            assert!(validate(&p, &[placement]).violations.iter().any(|v| v.code == code), "v{version} {code}");
        }
    }
}
