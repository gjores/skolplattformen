use schemamotor_model::{Placement, Problem, Status, CONTRACT_VERSION};
use schemamotor_solve::{solve, Options};
use schemamotor_validate::{positions, validate, validate_solution, PositionState};
use serde_json::json;
use std::sync::atomic::AtomicBool;

fn problem(lessons: usize, days: &[u32]) -> Problem {
    serde_json::from_value(json!({
        "version": CONTRACT_VERSION, "id": "jämna skoldagar",
        "time": { "step_min": 5, "days": (0..5).map(|_| json!({ "start_min": 480, "end_min": 960 })).collect::<Vec<_>>() },
        "clusters": [{ "id": "a", "size": 3 }],
        "groups": [{ "id": "klass", "clusters": ["a"] }],
        "lessons": (0..lessons).map(|n| json!({ "id": format!("pass-{n}"), "duration_min": 30, "groups": ["klass"] })).collect::<Vec<_>>(),
        "weights": { "student_day_balance": 5, "moved": 100_000 },
        "student_day_balance": [{ "cluster": "a", "period": "", "days": days }],
    })).unwrap()
}

fn pos(lesson: &str, day: u32, start_min: u32) -> Placement {
    Placement { lesson: lesson.into(), day, start_min, rooms: vec![] }
}

fn solve_test(problem: &Problem) -> schemamotor_model::Solution {
    let opts = Options { time_limit_ms: None, max_iters: Some(8_000), threads: 1, seed: 11 };
    let solution = solve(problem, &opts, &AtomicBool::new(false));
    let checked = validate_solution(problem, &solution);
    assert!(checked.ok(), "{:?}", checked.violations);
    solution
}

#[test]
fn två_pass_varje_skoldag_går_före_en_dyr_flytt_fran_referensen() {
    let mut p = problem(10, &[0, 1, 2, 3, 4]);
    p.reference = p.lessons.iter().enumerate().map(|(i, l)| pos(&l.id, 0, 480 + i as u32 * 30)).collect();
    let before = validate(&p, &p.reference);
    assert_eq!(before.metrics.student_day_shortfall, 24);
    assert_eq!(before.metrics.student_day_concentration, 120);
    let solution = solve_test(&p);
    assert_eq!(solution.status, Status::Complete);
    assert_eq!(solution.metrics.student_day_shortfall, 0);
    assert_eq!(solution.metrics.student_day_concentration, 0);
    for day in 0..5 {
        assert_eq!(solution.placements.iter().filter(|p| p.day == day).count(), 2);
    }
}

#[test]
fn få_pass_bedöms_till_jämn_fördelning_utan_att_kräva_två_per_dag() {
    let p = problem(3, &[0, 1, 2, 3, 4]);
    let packed = [pos("pass-0", 0, 480), pos("pass-1", 0, 510), pos("pass-2", 0, 540)];
    let before = validate(&p, &packed);
    assert!(before.ok());
    assert_eq!(before.metrics.student_day_shortfall, 0);
    assert_eq!(before.metrics.student_day_concentration, 9);
    let solution = solve_test(&p);
    assert_eq!(solution.metrics.student_day_concentration, 0);
    assert_eq!(solution.metrics.student_day_shortfall, 0);
}

#[test]
fn timplanen_vinner_över_miniminivan_när_bada_inte_gar_att_uppfylla() {
    let mut p = problem(2, &[0, 1]);
    p.activities.push(serde_json::from_value(json!({ "id": "kurs", "time": [
        { "weekday_days": [1, 0, 0, 0, 0], "min_min": 60, "max_min": 60 }
    ] })).unwrap());
    for l in &mut p.lessons { l.activity = Some("kurs".into()); }
    let solution = solve_test(&p);
    assert_eq!(solution.status, Status::Complete);
    assert_eq!(solution.placements.iter().map(|p| p.day).collect::<Vec<_>>(), vec![0, 0]);
    assert_eq!(solution.metrics.student_day_shortfall, 3);
}

#[test]
fn deltagarkluster_perioder_och_kalenderdagar_avgränsar_passräkningen() {
    let p: Problem = serde_json::from_value(json!({
        "version": CONTRACT_VERSION, "id": "parallella grupper",
        "time": { "step_min": 5, "days": (0..3).map(|_| json!({ "start_min": 480, "end_min": 960 })).collect::<Vec<_>>() },
        "periods": [{ "id": "ht" }, { "id": "vt" }],
        "clusters": [{ "id": "a", "size": 3 }, { "id": "b", "size": 5 }],
        "groups": [{ "id": "klass", "clusters": ["a", "b"] }, { "id": "ga", "clusters": ["a"] }, { "id": "gb", "clusters": ["b"] }],
        "lessons": [
            { "id": "a-ht", "duration_min": 30, "groups": ["ga"], "periods": ["ht"], "locked": { "day": 0, "start_min": 480 } },
            { "id": "b-ht", "duration_min": 30, "groups": ["gb"], "periods": ["ht"], "locked": { "day": 0, "start_min": 480 } },
            { "id": "klass-ht", "duration_min": 30, "groups": ["klass", "ga"], "periods": ["ht"], "locked": { "day": 0, "start_min": 510 } },
            { "id": "aktivitet-ht", "duration_min": 30, "groups": ["klass"], "periods": ["ht"], "instructional": false, "locked": { "day": 1, "start_min": 480 } },
            { "id": "klass-vt", "duration_min": 30, "groups": ["klass"], "periods": ["vt"], "locked": { "day": 2, "start_min": 480 } },
        ],
        "links": [{ "kind": "simultaneous", "lessons": ["a-ht", "b-ht"] }],
        "weights": { "student_day_balance": 5 },
        "student_day_balance": [
            { "cluster": "a", "period": "ht", "days": [0, 1] },
            { "cluster": "b", "period": "ht", "days": [0, 1] },
            { "cluster": "a", "period": "vt", "days": [2] },
            { "cluster": "b", "period": "vt", "days": [2] },
        ],
    })).unwrap();
    let solution = solve_test(&p);
    assert_eq!(solution.status, Status::Complete);
    assert_eq!(solution.metrics.student_day_shortfall, 8);
    assert_eq!(solution.metrics.student_day_concentration, 8);
}

#[test]
fn läget_ger_besked_om_ojämnare_undervisning_utan_regelbrott() {
    let p = problem(2, &[0, 1]);
    let current = [pos("pass-0", 0, 480), pos("pass-1", 1, 480)];
    let all = positions(&p, &current, "pass-1", None).unwrap();
    let same_day = all.iter().find(|l| l.day == 0 && l.start_min == 510).unwrap();
    assert_eq!(same_day.state, PositionState::Preference);
    assert!(same_day.reasons.iter().any(|r| r.code == "student_day_balance"));
}

#[test]
fn ogiltig_kalender_och_fel_period_stoppas_även_i_äldre_motorformat() {
    let mut p = problem(1, &[0, 1]);
    p.version = 4;
    p.student_day_balance[0].days = vec![1, 1];
    assert!(!validate(&p, &[]).ok());
    p.student_day_balance[0].days = vec![0, 1];
    p.student_day_balance[0].period = "fel period".into();
    assert!(!p.check().is_empty());
    assert!(!validate(&p, &[]).ok());
}
