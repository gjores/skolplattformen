//! Egna samtidighetsblock (05.2-SM-UXF-51): appen skickar en koppling `simultaneous` mellan pass ur olika undervisningar.
//! Passen ska få samma dag och start, med egna lärare, grupper och salar.
use schemamotor_model::{Problem, Solution, Status};
use schemamotor_solve::{solve, Options};
use schemamotor_validate::validate_solution;
use serde_json::json;
use std::sync::atomic::AtomicBool;

fn problem(langd_b: u32) -> Problem {
    serde_json::from_value(json!({
        "version": 5, "id": "eget-block",
        "time": { "step_min": 5, "days": [{ "start_min": 480, "end_min": 720 }, { "start_min": 480, "end_min": 720 }] },
        "teachers": [{ "id": "larare-1" }, { "id": "larare-2" }, { "id": "larare-3" }],
        "clusters": [{ "id": "kluster-1", "size": 12 }, { "id": "kluster-2", "size": 14 }, { "id": "kluster-3", "size": 20 }],
        "groups": [{ "id": "grupp-1", "clusters": ["kluster-1"] }, { "id": "grupp-2", "clusters": ["kluster-2"] }, { "id": "grupp-3", "clusters": ["kluster-3"] }],
        "rooms": [{ "id": "sal-1" }, { "id": "sal-2" }],
        "lessons": [
            { "id": "pass-1", "duration_min": 60, "teachers": ["larare-1"], "groups": ["grupp-1"], "rooms": { "count": 1, "allowed": ["sal-1", "sal-2"] } },
            { "id": "pass-2", "duration_min": langd_b, "teachers": ["larare-2"], "groups": ["grupp-2"], "rooms": { "count": 1, "allowed": ["sal-1", "sal-2"] } },
            { "id": "pass-3", "duration_min": 60, "teachers": ["larare-3"], "groups": ["grupp-3"] },
            { "id": "pass-4", "duration_min": 60, "teachers": ["larare-1"], "groups": ["grupp-3"] }
        ],
        "links": [{ "kind": "simultaneous", "lessons": ["pass-1", "pass-2"] }],
        "rules": { "break_min": 0, "same_day": "allow", "lunch": null }
    })).unwrap()
}
fn run(p: &Problem) -> Solution { solve(p, &Options { time_limit_ms: None, max_iters: Some(5_000), threads: 1, seed: 7 }, &AtomicBool::new(false)) }

#[test]
fn an_own_block_gets_the_same_day_and_start_with_separate_teachers_groups_and_rooms() {
    let p = problem(60);
    assert!(p.check().is_empty());
    let s = run(&p);
    assert_eq!(s.status, Status::Complete);
    assert!(validate_solution(&p, &s).ok());
    let at = |id: &str| s.placements.iter().find(|x| x.lesson == id).unwrap();
    assert_eq!((at("pass-1").day, at("pass-1").start_min), (at("pass-2").day, at("pass-2").start_min));
    assert_ne!(at("pass-1").rooms, at("pass-2").rooms, "varje pass behåller sin egen sal");
}

#[test]
fn passes_of_different_length_share_the_start_and_end_differently() {
    // Kopplingen gäller start, inte slut: ett pass på 45 minuter och ett på 60 börjar samtidigt och godkänns av kontrollen.
    let p = problem(45);
    assert!(p.check().is_empty());
    let s = run(&p);
    assert_eq!(s.status, Status::Complete);
    assert!(validate_solution(&p, &s).ok());
    let at = |id: &str| s.placements.iter().find(|x| x.lesson == id).map(|x| (x.day, x.start_min)).unwrap();
    assert_eq!(at("pass-1"), at("pass-2"));
}
