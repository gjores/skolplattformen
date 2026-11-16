//! Stabila sal-ID (05.2-SM-UXF-21): appens salregister ger glesa ID som `sal-2` och `sal-7`. Motorn får inte anta att ID:n är en obruten följd,
//! och platser och egenskaper ska prövas av både sökning och oberoende kontroll.
use schemamotor_model::{Placement, Problem, Solution, Status};
use schemamotor_solve::{solve, Options};
use schemamotor_validate::{validate, validate_solution};
use serde_json::json;
use std::sync::atomic::AtomicBool;

fn register() -> Problem {
    serde_json::from_value(json!({
        "version": 5, "id": "glesa-sal-id",
        "time": { "step_min": 5, "days": [{ "start_min": 480, "end_min": 600 }] },
        "teachers": [{ "id": "larare-1" }, { "id": "larare-2" }],
        "clusters": [{ "id": "kluster-1", "size": 22 }, { "id": "kluster-2", "size": 28 }],
        "groups": [{ "id": "grupp-1", "clusters": ["kluster-1"] }, { "id": "grupp-2", "clusters": ["kluster-2"] }],
        "rooms": [
            { "id": "sal-7", "capacity": 24, "features": ["typ:laborationssal", "utr:dragskåp"] },
            { "id": "sal-2", "capacity": 30, "features": ["typ:allmän sal"] },
            { "id": "sal-12", "features": ["typ:allmän sal"] }
        ],
        "lessons": [
            { "id": "pass-1", "duration_min": 60, "teachers": ["larare-1"], "groups": ["grupp-1"],
              "rooms": { "count": 1, "allowed": ["sal-7"], "features": ["utr:dragskåp"], "min_capacity": 22 } },
            { "id": "pass-2", "duration_min": 60, "teachers": ["larare-2"], "groups": ["grupp-2"],
              "rooms": { "count": 1, "allowed": ["sal-2", "sal-12"], "features": ["typ:allmän sal"] } }
        ], "rules": { "break_min": 0, "same_day": "allow", "lunch": null }
    })).unwrap()
}
fn at(lesson: &str, start_min: u32, room: &str) -> Placement { Placement { lesson: lesson.into(), day: 0, start_min, rooms: vec![room.into()] } }
fn run(p: &Problem) -> Solution { solve(p, &Options { time_limit_ms: None, max_iters: Some(5_000), threads: 1, seed: 7 }, &AtomicBool::new(false)) }
fn codes(p: &Problem, placements: Vec<Placement>) -> Vec<String> { validate(p, &placements).violations.into_iter().map(|v| v.code.to_string()).collect() }

#[test]
fn sparse_room_ids_are_solved_and_validated_with_capacity_and_features() {
    let p = register();
    assert!(p.check().is_empty());
    let solution = run(&p);
    assert_eq!(solution.status, Status::Complete);
    assert!(validate_solution(&p, &solution).ok());
    let room = |id: &str| solution.placements.iter().find(|x| x.lesson == id).unwrap().rooms.clone();
    assert_eq!(room("pass-1"), vec!["sal-7".to_string()]);
    assert!(["sal-2", "sal-12"].contains(&room("pass-2")[0].as_str()));
}

#[test]
fn a_room_outside_the_requirement_is_reported_by_the_independent_validator() {
    let p = register();
    assert!(codes(&p, vec![at("pass-1", 480, "sal-7"), at("pass-2", 480, "sal-2")]).is_empty());
    // Fel sal för kravet, och samma sal samtidigt: två olika besked.
    assert!(codes(&p, vec![at("pass-1", 480, "sal-2"), at("pass-2", 540, "sal-12")]).contains(&"room_unfit".to_string()));
    assert!(!codes(&p, vec![at("pass-1", 480, "sal-7"), at("pass-2", 480, "sal-7")]).is_empty());
}

#[test]
fn unknown_capacity_never_satisfies_a_stated_minimum() {
    // Appen sänder därför `min_capacity` bara när alla tillåtna salar har kända platser; annars redovisas kapaciteten som inte kontrollerad.
    let mut p = register();
    p.lessons[1].rooms.as_mut().unwrap().min_capacity = Some(28);
    p.lessons[1].rooms.as_mut().unwrap().allowed = vec!["sal-12".into()];
    assert!(codes(&p, vec![at("pass-1", 480, "sal-7"), at("pass-2", 480, "sal-12")]).contains(&"room_unfit".to_string()));
}
