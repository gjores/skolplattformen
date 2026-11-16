//! SM-PLACERING: exakt kontroll av lokala byten/kedjor mot den oberoende validatorn.
use schemamotor_model::*;
use schemamotor_solve::{solve, suggest, suggest_with_budget, Options};
use schemamotor_validate::{validate, validate_before};
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;
use std::time::{Duration, Instant};

fn problem(extra: Value) -> Problem {
    let mut value = json!({"version":CONTRACT_VERSION,"id":"suggest-prov",
        "time":{"step_min":5,"start_grid_min":60,"days":[{"start_min":480,"end_min":660}]},
        "teachers":[{"id":"t"}],"lessons":[],"rules":{"same_day":"allow"}});
    for (k, v) in extra.as_object().unwrap() {
        value[k] = v.clone();
    }
    serde_json::from_value(value).unwrap()
}
fn lesson(id: &str, from: u32, to: u32) -> Value {
    json!({"id":id,"duration_min":60,"teachers":["t"],"allowed":[{"day":0,"start_min":from,"end_min":to}]})
}
fn at(id: &str, start: u32) -> Placement {
    Placement {
        lesson: id.into(),
        day: 0,
        start_min: start,
        rooms: vec![],
    }
}
fn request(
    p: Problem,
    placements: Vec<Placement>,
    mode: SuggestionMode,
    lesson: Option<&str>,
    target: Option<Slot>,
    depth: u8,
) -> SuggestionRequest {
    SuggestionRequest {
        problem: p,
        placements,
        mode,
        lesson: lesson.map(str::to_owned),
        target: target.map(|at| SuggestionTarget {
            day: at.day,
            start_min: at.start_min,
            rooms: at.rooms,
        }),
        depth,
    }
}
fn run(r: &SuggestionRequest) -> Suggestions {
    let before = serde_json::to_string(r).unwrap();
    let result = suggest(r).unwrap();
    assert_eq!(
        before,
        serde_json::to_string(r).unwrap(),
        "motorn ändrade begäran"
    );
    assert!(result.suggestions.len() <= 5);
    for s in &result.suggestions {
        let mut p = r.problem.clone();
        p.reference = r.placements.clone();
        let check = validate(&p, &s.placements);
        assert!(check.ok(), "{:?}", check.violations);
        assert_eq!(s.metrics_after, check.metrics);
        assert_eq!(s.metrics_before, validate(&p, &r.placements).metrics);
        assert_eq!(s.cost, s.metrics_after.cost);
        assert!(
            r.placements
                .iter()
                .all(|old| s.placements.iter().any(|p| p.lesson == old.lesson)),
            "ett tidigare lagt pass tappades"
        );
        let changed: Vec<_> = s
            .changes
            .iter()
            .filter(|c| c.from.is_some() && r.lesson.as_deref() != Some(c.lesson.as_str()))
            .collect();
        assert!(changed.len() <= r.depth as usize);
        for c in &s.changes {
            assert_eq!(c.to.lesson, c.lesson);
            assert_eq!(
                c.from.as_ref(),
                r.placements.iter().find(|p| p.lesson == c.lesson)
            );
            assert!(s.placements.contains(&c.to));
        }
    }
    result
}

#[test]
fn a_direct_placement_preserves_every_existing_lesson() {
    let p = problem(json!({"lessons":[lesson("a",480,540),lesson("b",540,660)]}));
    let r = request(
        p,
        vec![at("b", 600)],
        SuggestionMode::Lesson,
        Some("a"),
        None,
        1,
    );
    let out = run(&r);
    let first = &out.suggestions[0];
    assert_eq!(first.placements, vec![at("a", 480), at("b", 600)]);
    assert_eq!(first.changes.len(), 1);
    assert!(first.changes[0].from.is_none());
    assert_eq!(first.metrics_after.moved_lessons, 0);
}

#[test]
fn a_target_swap_is_available_on_depth_one() {
    let p = problem(json!({"lessons":[lesson("a",480,600),lesson("b",480,600)]}));
    let r = request(
        p,
        vec![at("a", 540), at("b", 480)],
        SuggestionMode::Target,
        Some("a"),
        Some(Slot {
            day: 0,
            start_min: 480,
            rooms: vec![],
        }),
        1,
    );
    let out = run(&r);
    assert_eq!(
        out.suggestions[0].placements,
        vec![at("a", 480), at("b", 540)]
    );
    assert_eq!(out.suggestions[0].changes.len(), 2);
    assert_eq!(out.suggestions[0].metrics_after.moved_lessons, 2);
}

#[test]
fn a_two_blocker_chain_needs_depth_two_and_never_parks_the_last_lesson() {
    let p =
        problem(json!({"lessons":[lesson("a",480,540),lesson("b",480,600),lesson("c",540,660)]}));
    let mut r = request(
        p,
        vec![at("b", 480), at("c", 540)],
        SuggestionMode::Lesson,
        Some("a"),
        None,
        1,
    );
    assert!(run(&r).suggestions.is_empty());
    r.depth = 2;
    let out = run(&r);
    assert_eq!(
        out.suggestions[0].placements,
        vec![at("a", 480), at("b", 540), at("c", 600)]
    );
    assert_eq!(out.suggestions[0].changes.len(), 3);
}

#[test]
fn locked_and_fixed_activity_lessons_are_never_displaced() {
    let mut fixed = lesson("fixed", 480, 540);
    fixed["locked"] = json!({"day":0,"start_min":480});
    let p = problem(json!({"lessons":[lesson("a",480,540),fixed]}));
    let r = request(
        p.clone(),
        vec![at("fixed", 480)],
        SuggestionMode::Lesson,
        Some("a"),
        None,
        3,
    );
    assert!(run(&r).suggestions.is_empty());
    let r = request(
        p,
        vec![at("fixed", 480)],
        SuggestionMode::Lesson,
        Some("fixed"),
        None,
        1,
    );
    assert_eq!(suggest(&r).unwrap_err().code, "locked_lesson");
}

#[test]
fn rest_places_every_parked_goal_including_an_unplaced_fixed_activity() {
    let mut fixed = lesson("fixed", 600, 660);
    fixed["locked"] = json!({"day":0,"start_min":600});
    let p = problem(json!({"lessons":[lesson("a",480,540),lesson("b",480,600),fixed]}));
    let r = request(p, vec![at("b", 480)], SuggestionMode::Rest, None, None, 1);
    let out = run(&r);
    assert!(!out.suggestions.is_empty());
    for s in out.suggestions {
        assert_eq!(s.placements.len(), 3);
        assert!(s.placements.contains(&at("fixed", 600)));
        assert_eq!(s.metrics_after.unplaced_lessons, 0);
    }
}

#[test]
fn rest_can_keep_more_existing_placements_than_a_calculation_from_zero() {
    let p = problem(json!({"lessons":[lesson("a",480,540),lesson("b",540,660)]}));
    let zero = solve(
        &p,
        &Options {
            time_limit_ms: None,
            max_iters: Some(500),
            threads: 1,
            seed: 7,
        },
        &AtomicBool::new(false),
    );
    assert_eq!(zero.status, Status::Complete);
    let zero_b = zero
        .placements
        .iter()
        .find(|l| l.lesson == "b")
        .unwrap()
        .start_min;
    let baseline_b = if zero_b == 540 { 600 } else { 540 };
    let r = request(
        p,
        vec![at("b", baseline_b)],
        SuggestionMode::Rest,
        None,
        None,
        1,
    );
    let out = run(&r);
    assert_eq!(out.suggestions[0].metrics_after.moved_lessons, 0);
    assert!(out.suggestions[0].placements.contains(&at("b", baseline_b)));
    assert_ne!(zero_b, baseline_b);
}

#[test]
fn explicit_target_room_can_move_only_the_room_of_a_blocker() {
    let p = problem(
        json!({"teachers":[{"id":"a"},{"id":"b"}],"rooms":[{"id":"r1"},{"id":"r2"}],
        "lessons":[{"id":"a","duration_min":60,"teachers":["a"],"rooms":{"allowed":["r1","r2"]}},
                   {"id":"b","duration_min":60,"teachers":["b"],"rooms":{"allowed":["r1","r2"]}}]}),
    );
    let mut b = at("b", 480);
    b.rooms = vec!["r1".into()];
    let r = request(
        p,
        vec![b],
        SuggestionMode::Target,
        Some("a"),
        Some(Slot {
            day: 0,
            start_min: 480,
            rooms: vec!["r1".into()],
        }),
        1,
    );
    let out = run(&r);
    let first = &out.suggestions[0];
    let b = first.placements.iter().find(|p| p.lesson == "b").unwrap();
    assert_eq!(
        (b.start_min, b.rooms.as_slice()),
        (480, ["r2".to_string()].as_slice())
    );
    assert_eq!(first.metrics_after.room_moved_lessons, 1);
}

#[test]
fn student_clusters_and_margins_block_moves_but_separate_periods_can_share_time() {
    let extra = json!({"teachers":[{"id":"a"},{"id":"b"}],"clusters":[{"id":"c","size":2}],
        "groups":[{"id":"g1","clusters":["c"]},{"id":"g2","clusters":["c"]}],
        "periods":[{"id":"ht"},{"id":"vt"}],
        "lessons":[{"id":"a","duration_min":60,"teachers":["a"],"groups":["g1"],"periods":["ht"],"allowed":[{"day":0,"start_min":480,"end_min":540}],"margin":{"students":{"after_min":15}}},
                   {"id":"b","duration_min":60,"teachers":["b"],"groups":["g2"],"periods":["ht"],"locked":{"day":0,"start_min":540}}]});
    let mut p = problem(extra);
    let r = request(
        p.clone(),
        vec![at("b", 540)],
        SuggestionMode::Lesson,
        Some("a"),
        None,
        3,
    );
    assert!(run(&r).suggestions.is_empty());
    p.lessons[1].periods = vec!["vt".into()];
    let r = request(
        p,
        vec![at("b", 540)],
        SuggestionMode::Lesson,
        Some("a"),
        None,
        1,
    );
    assert!(run(&r).suggestions[0].placements.contains(&at("a", 480)));
}

#[test]
fn room_margin_is_respected_when_a_chain_is_suggested() {
    let p = problem(
        json!({"teachers":[{"id":"a"},{"id":"b"}],"rooms":[{"id":"r"}],
        "time":{"step_min":5,"start_grid_min":60,"days":[{"start_min":480,"end_min":720}]},
        "lessons":[{"id":"a","duration_min":60,"teachers":["a"],"allowed":[{"day":0,"start_min":480,"end_min":540}],"rooms":{"allowed":["r"]},"margin":{"rooms":{"after_min":15}}},
                   {"id":"b","duration_min":60,"teachers":["b"],"rooms":{"allowed":["r"]}}]}),
    );
    let mut b = at("b", 540);
    b.rooms = vec!["r".into()];
    let r = request(p, vec![b], SuggestionMode::Lesson, Some("a"), None, 1);
    let out = run(&r);
    let first = &out.suggestions[0];
    assert_eq!(
        first
            .placements
            .iter()
            .find(|p| p.lesson == "b")
            .unwrap()
            .start_min,
        600
    );
}

#[test]
fn simultaneous_units_keep_every_member_and_locks_stop_the_whole_unit() {
    let p = problem(json!({"teachers":[{"id":"ta"},{"id":"tb"}],
        "lessons":[{"id":"a","duration_min":60,"teachers":["ta"]},{"id":"b","duration_min":60,"teachers":["tb"]}],
        "links":[{"kind":"simultaneous","lessons":["a","b"]}]}));
    let partial = request(
        p.clone(),
        vec![at("a", 480)],
        SuggestionMode::Rest,
        None,
        None,
        1,
    );
    let error = suggest(&partial).unwrap_err();
    assert_eq!(error.code, "invalid_baseline");
    assert!(error
        .violations
        .iter()
        .any(|v| v.code == "not_simultaneous"));
    let r = request(p.clone(), vec![], SuggestionMode::Rest, None, None, 1);
    for s in run(&r).suggestions {
        assert_eq!(s.placements.len(), 2);
        assert_eq!(s.placements[0].start_min, s.placements[1].start_min);
        assert!(s.changes.iter().all(|c| c.from.is_none()));
    }
    let r = request(
        p.clone(),
        vec![at("a", 480), at("b", 480)],
        SuggestionMode::Target,
        Some("a"),
        Some(Slot {
            day: 0,
            start_min: 540,
            rooms: vec![],
        }),
        1,
    );
    assert_eq!(run(&r).suggestions[0].changes.len(), 2);
    let mut p = p;
    p.lessons[1].locked = Some(Slot {
        day: 0,
        start_min: 480,
        rooms: vec![],
    });
    let r = request(
        p,
        vec![at("a", 480), at("b", 480)],
        SuggestionMode::Target,
        Some("a"),
        Some(Slot {
            day: 0,
            start_min: 540,
            rooms: vec![],
        }),
        1,
    );
    assert_eq!(suggest(&r).unwrap_err().code, "locked_lesson");
}

#[test]
fn invalid_baseline_and_parameters_stop_before_a_suggestion_is_made() {
    let p = problem(json!({"lessons":[lesson("a",480,660),lesson("b",480,660)]}));
    let r = request(
        p.clone(),
        vec![at("a", 480), at("b", 480)],
        SuggestionMode::Lesson,
        Some("a"),
        None,
        1,
    );
    let error = suggest(&r).unwrap_err();
    assert_eq!(error.code, "invalid_baseline");
    assert!(error.violations.iter().any(|v| v.code == "teacher_clash"));
    for depth in [0, 4] {
        let r = request(
            p.clone(),
            vec![],
            SuggestionMode::Lesson,
            Some("a"),
            None,
            depth,
        );
        assert_eq!(suggest(&r).unwrap_err().code, "bad_request");
    }
    let r = request(
        p.clone(),
        vec![],
        SuggestionMode::Target,
        Some("a"),
        Some(Slot {
            day: 8,
            start_min: 480,
            rooms: vec![],
        }),
        1,
    );
    assert_eq!(suggest(&r).unwrap_err().code, "bad_target");
    let r = request(
        p.clone(),
        vec![],
        SuggestionMode::Lesson,
        Some("unknown"),
        None,
        1,
    );
    assert_eq!(suggest(&r).unwrap_err().code, "unknown_lesson");
    let mut p = p;
    p.version = 3;
    let r = request(p, vec![], SuggestionMode::Lesson, Some("a"), None, 1);
    assert_eq!(suggest(&r).unwrap_err().code, "version_mismatch");
}

#[test]
fn suggestions_have_stable_order_and_timeout_never_returns_unchecked_fragments() {
    let p = problem(
        json!({"time":{"step_min":5,"start_grid_min":5,"days":[{"start_min":480,"end_min":660}]},"lessons":[lesson("a",480,660)]}),
    );
    let r = request(p, vec![], SuggestionMode::Lesson, Some("a"), None, 1);
    let a = run(&r);
    let b = run(&r);
    assert_eq!(a.suggestions, b.suggestions);
    assert_eq!(a.suggestions.len(), 5);
    let now = Instant::now();
    let out = suggest_with_budget(&r, Duration::ZERO).unwrap();
    assert!(out.timed_out && out.suggestions.is_empty());
    assert!(now.elapsed() < Duration::from_millis(100));
    assert!(validate_before(&r.problem, &r.placements, Instant::now()).is_err());
}

#[test]
fn six_hundred_valid_parked_goals_need_no_recursive_stack_or_artificial_limit() {
    let teachers: Vec<_> = (0..600).map(|i| json!({"id":format!("t{i}")})).collect();
    let lessons: Vec<_> = (0..600)
        .map(|i| json!({"id":format!("l{i}"),"duration_min":60,"teachers":[format!("t{i}")]}))
        .collect();
    let r = request(
        problem(json!({"teachers":teachers,"lessons":lessons})),
        vec![],
        SuggestionMode::Rest,
        None,
        None,
        1,
    );
    let now = Instant::now();
    let out = run(&r);
    assert!(!out.suggestions.is_empty());
    assert!(out
        .suggestions
        .iter()
        .all(|s| s.placements.len() == 600 && s.changes.len() == 600));
    assert!(now.elapsed() < Duration::from_secs(2));
}

#[test]
fn a_real_search_deadline_returns_only_complete_independently_checked_suggestions() {
    let lessons: Vec<_> = (0..8)
        .map(|i| json!({"id":format!("l{i}"),"duration_min":60,"teachers":["t"],"activity":"a"}))
        .collect();
    let p = problem(
        json!({"time":{"step_min":5,"start_grid_min":60,"days":[{"start_min":480,"end_min":960}]},"activities":[{"id":"a"}],"lessons":lessons,"rules":{"same_day":"avoid"}}),
    );
    let r = request(p, vec![], SuggestionMode::Rest, None, None, 3);
    let now = Instant::now();
    let out = suggest_with_budget(&r, Duration::from_millis(10)).unwrap();
    assert!(out.timed_out);
    assert!(now.elapsed() < Duration::from_millis(250));
    for s in out.suggestions {
        assert_eq!(s.placements.len(), 8);
        assert!(validate(&r.problem, &s.placements).ok());
    }
}

#[test]
fn depth_three_can_move_three_existing_blockers_but_depth_two_cannot() {
    let p = problem(
        json!({"time":{"step_min":5,"start_grid_min":60,"days":[{"start_min":480,"end_min":720}]},
        "lessons":[lesson("a",480,540),lesson("b",480,600),lesson("c",540,660),lesson("d",600,720)]}),
    );
    let mut r = request(
        p,
        vec![at("b", 480), at("c", 540), at("d", 600)],
        SuggestionMode::Lesson,
        Some("a"),
        None,
        2,
    );
    assert!(run(&r).suggestions.is_empty());
    r.depth = 3;
    assert_eq!(
        run(&r).suggestions[0].placements,
        vec![at("a", 480), at("b", 540), at("c", 600), at("d", 660)]
    );
}

#[test]
fn shorter_time_displacement_ranks_before_lower_soft_cost() {
    let p = problem(
        json!({"time":{"step_min":5,"start_grid_min":60,"days":[{"start_min":480,"end_min":780}]},
        "teachers":[{"id":"a"},{"id":"b"}],"groups":[{"id":"g","size":1}],
        "lessons":[{"id":"a","duration_min":60,"teachers":["a"],"groups":["g"],"allowed":[{"day":0,"start_min":480,"end_min":540}]},
                   {"id":"b","duration_min":60,"teachers":["b"],"groups":["g"]},
                   {"id":"d","duration_min":60,"teachers":["b"],"locked":{"day":0,"start_min":660}}]}),
    );
    let r = request(
        p,
        vec![at("b", 480), at("d", 660)],
        SuggestionMode::Lesson,
        Some("a"),
        None,
        1,
    );
    let out = run(&r);
    assert_eq!(
        out.suggestions[0]
            .placements
            .iter()
            .find(|p| p.lesson == "b")
            .unwrap()
            .start_min,
        540
    );
    assert!(
        out.suggestions
            .iter()
            .any(|s| s.cost < out.suggestions[0].cost),
        "måste faktiskt finnas ett billigare men mer förskjutet alternativ"
    );
}

#[test]
fn integer_extremes_cannot_overflow_into_a_normalized_suggestion() {
    let p = problem(json!({"lessons":[lesson("a",480,660)]}));
    let r = request(
        p.clone(),
        vec![],
        SuggestionMode::Target,
        Some("a"),
        Some(Slot {
            day: 0,
            start_min: u32::MAX,
            rooms: vec![],
        }),
        1,
    );
    assert_eq!(suggest(&r).unwrap_err().code, "bad_target");
    let mut invalid = at("a", 480);
    invalid.start_min = u32::MAX;
    let r = request(p, vec![invalid], SuggestionMode::Lesson, Some("a"), None, 1);
    assert_eq!(suggest(&r).unwrap_err().code, "invalid_baseline");
}

#[test]
fn request_requires_explicit_nullable_fields_and_all_target_fields() {
    let p = problem(json!({"lessons":[lesson("a",480,660)]}));
    let r = request(
        p,
        vec![],
        SuggestionMode::Target,
        Some("a"),
        Some(Slot {
            day: 0,
            start_min: 480,
            rooms: vec![],
        }),
        1,
    );
    let raw = serde_json::to_value(&r).unwrap();
    assert!(serde_json::from_value::<SuggestionRequest>(raw.clone()).is_ok());
    for field in ["lesson", "target"] {
        let mut missing = raw.clone();
        missing.as_object_mut().unwrap().remove(field);
        assert!(serde_json::from_value::<SuggestionRequest>(missing).is_err());
    }
    let mut missing = raw.clone();
    missing["target"].as_object_mut().unwrap().remove("rooms");
    assert!(serde_json::from_value::<SuggestionRequest>(missing).is_err());
    let mut extra = raw;
    extra["target"]["unknown"] = json!(true);
    assert!(serde_json::from_value::<SuggestionRequest>(extra).is_err());
}
