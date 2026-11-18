//! Faktisk sökning: referensen används som start redan innan första iterationen och kan därefter kompletteras utan att lås flyttas.
use schemamotor_model::*;
use schemamotor_solve::{solve, Options};
use schemamotor_validate::validate_solution;
use serde_json::json;
use std::sync::atomic::AtomicBool;

fn problem() -> Problem {
    serde_json::from_value(json!({
        "version": CONTRACT_VERSION, "id": "syntetisk-fortsattning",
        "time": { "step_min": 5, "start_grid_min": 5, "days": [{"start_min": 480, "end_min": 960}, {"start_min": 480, "end_min": 960}] },
        "teachers": [{"id": "t1"}], "groups": [{"id": "g1"}],
        "lessons": [
            {"id": "a", "duration_min": 60, "teachers": ["t1"], "groups": ["g1"], "locked": {"day": 1, "start_min": 600}},
            {"id": "b", "duration_min": 60, "teachers": ["t1"], "groups": ["g1"]},
            {"id": "c", "duration_min": 60, "teachers": ["t1"], "groups": ["g1"]}
        ],
        "reference": [{"lesson": "a", "day": 1, "start_min": 600}, {"lesson": "b", "day": 1, "start_min": 660}]
    })).unwrap()
}
fn run(p: &Problem, iters: u64) -> Solution {
    solve(p, &Options { time_limit_ms: None, max_iters: Some(iters), threads: 1, seed: 7 }, &AtomicBool::new(false))
}

#[test]
fn zero_iterations_returns_current_reference_and_lock_instead_of_an_empty_restart() {
    let p = problem();
    let solution = run(&p, 0);
    assert_eq!(solution.placements.len(), 2);
    for reference in &p.reference {
        let at = solution.placements.iter().find(|at| at.lesson == reference.lesson).unwrap();
        assert_eq!((at.day, at.start_min, &at.rooms), (reference.day, reference.start_min, &reference.rooms));
    }
    assert_eq!(solution.unplaced, vec!["c"]);
    assert!(validate_solution(&p, &solution).ok());
}

#[test]
fn continued_search_completes_partial_reference_and_keeps_locked_time() {
    let p = problem();
    let solution = run(&p, 3000);
    assert_eq!(solution.status, Status::Complete);
    assert_eq!(solution.placements.len(), 3);
    let locked = solution.placements.iter().find(|at| at.lesson == "a").unwrap();
    assert_eq!((locked.day, locked.start_min), (1, 600));
    assert!(validate_solution(&p, &solution).ok());
}

#[test]
fn invalid_reference_is_not_a_guarantee_that_every_manual_position_can_be_kept() {
    let mut p = problem();
    p.reference[1].start_min = 600; // Samma lärare som det låsta passet.
    let solution = run(&p, 0);
    assert_eq!(solution.placements.len(), 1);
    assert_eq!(solution.placements[0].lesson, "a");
    assert!(solution.unplaced.contains(&"b".to_string()));
    assert!(validate_solution(&p, &solution).ok());
}
