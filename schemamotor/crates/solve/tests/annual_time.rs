use schemamotor_model::*;
use schemamotor_solve::{diagnose, solve, Options};
use schemamotor_validate::{validate, validate_solution};
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;

fn annual(split: bool, min: u64, max: u64) -> Problem {
    let lessons = if split { json!([
        {"id":"ht-pass","activity":"a","periods":["ht"],"duration_min":30,"teachers":["ht-teacher"]},
        {"id":"vt-pass","activity":"a","periods":["vt"],"duration_min":60,"teachers":["vt-teacher"]}
    ]) } else { json!([{"id":"year-pass","activity":"a","duration_min":30,"teachers":["ht-teacher"]}]) };
    from(json!({"version":5,"id":"annual","time":{"step_min":5,"days":[{"start_min":480,"end_min":600},{"start_min":480,"end_min":600}]},
        "periods":[{"id":"ht"},{"id":"vt"}],"teachers":[{"id":"ht-teacher"},{"id":"vt-teacher"}],
        "activities":[{"id":"a","time":[
            {"budget":"arsbudget-1","period":"ht","weekday_days":[2,5],"min_min":min,"max_min":max},
            {"budget":"arsbudget-1","period":"vt","weekday_days":[7,3],"min_min":min,"max_min":max}]}],
        "lessons":lessons,"rules":{"same_day":"allow"}}))
}
fn from(value: Value) -> Problem { serde_json::from_value(value).unwrap() }
fn at(id: &str, day: u32) -> Placement { Placement { lesson:id.into(), day, start_min:480, rooms:vec![] } }
fn run(p: &Problem) -> Solution { solve(p, &Options { max_iters:Some(5_000), time_limit_ms:None, threads:1, seed:7 }, &AtomicBool::new(false)) }

#[test]
fn shared_pass_counts_each_active_term_and_solve_agrees_with_independent_validation() {
    let p=annual(false,270,270); assert!(p.check().is_empty(),"{:?}",p.check());
    assert!(validate(&p,&[at("year-pass",0)]).ok());
    assert!(validate(&p,&[at("year-pass",1)]).violations.iter().any(|v|v.code=="activity_time"&&v.message.contains("240")));
    let s=run(&p);assert_eq!(s.status,Status::Complete);assert_eq!(s.version,5);assert_eq!(s.placements[0].day,0);
    assert!(validate_solution(&p,&s).ok());
}
#[test]
fn term_specific_passes_use_their_own_weekday_vectors_without_double_counting() {
    let p=annual(true,480,480);
    assert!(validate(&p,&[at("ht-pass",0),at("vt-pass",0)]).ok());
    assert!(validate(&p,&[at("ht-pass",1),at("vt-pass",1)]).violations.iter().any(|v|v.code=="activity_time"&&v.message.contains("330")));
    let s=run(&p);assert_eq!(s.status,Status::Complete,"{:?}",s.diagnoses);assert!(validate_solution(&p,&s).ok());
}
#[test]
fn annual_underflow_and_indivisibility_have_sound_proofs() {
    let p=annual(true,600,620);assert!(diagnose(&p).iter().any(|d|d.proof&&d.code=="activity_time"));
    let p=annual(true,490,500);assert!(diagnose(&p).iter().any(|d|d.proof&&d.code=="indivisible_time"));
    assert_ne!(run(&p).status,Status::Complete);
}
#[test]
fn one_placed_term_cannot_claim_a_complete_annual_schedule() {
    let p=annual(true,60,480);let mut s=run(&p);s.placements=vec![at("ht-pass",0)];s.unplaced=vec!["vt-pass".into()];
    s.metrics=validate(&p,&s.placements).metrics;s.status=Status::Complete;
    assert!(validate_solution(&p,&s).violations.iter().any(|v|v.code=="status_mismatch"));
}
#[test]
fn budget_scope_is_each_activity_even_when_strings_match() {
    let mut value=serde_json::to_value(annual(false,270,270)).unwrap();
    let mut second=value["activities"][0].clone();second["id"]=json!("b");value["activities"].as_array_mut().unwrap().push(second);
    value["lessons"].as_array_mut().unwrap().push(json!({"id":"second-year","activity":"b","duration_min":30,"teachers":["vt-teacher"]}));
    let p=from(value);assert!(p.check().is_empty());
    assert!(validate(&p,&[at("year-pass",0),at("second-year",0)]).ok());assert_eq!(run(&p).status,Status::Complete);
}
#[test]
fn counted_minutes_and_simultaneous_parts_use_one_shared_budget_without_margin_minutes() {
    let mut value=serde_json::to_value(annual(false,270,270)).unwrap();
    value["lessons"][0]["counted_min"]=json!(20);value["lessons"][0]["margin"]=json!({"teachers":{"after_min":10}});
    value["lessons"].as_array_mut().unwrap().push(json!({"id":"other","activity":"a","duration_min":30,"counted_min":10,"teachers":["vt-teacher"]}));
    value["links"]=json!([{"kind":"simultaneous","lessons":["year-pass","other"]}]);
    let p=from(value);assert!(p.check().is_empty());assert!(validate(&p,&[at("year-pass",0),at("other",0)]).ok());
    let s=run(&p);assert_eq!(s.status,Status::Complete,"{:?}",s.diagnoses);assert!(validate_solution(&p,&s).ok());
}
#[test]
fn explicit_null_or_nonstring_budget_is_rejected_instead_of_becoming_legacy() {
    let value=serde_json::to_value(annual(false,270,270)).unwrap();
    for invalid in [Value::Null,json!(42),json!(true),json!({})] {
        let mut bad=value.clone();bad["activities"][0]["time"][0]["budget"]=invalid;
        assert!(serde_json::from_value::<Problem>(bad).is_err());
    }
}
#[test]
fn inconsistent_duplicate_or_malformed_budget_rows_and_v4_budget_are_refused() {
    let value=serde_json::to_value(annual(false,270,270)).unwrap();
    for (path,replacement) in [
        ("/version",json!(4)),("/activities/0/time/1/max_min",json!(275)),
        ("/activities/0/time/1/period",json!("ht")),("/activities/0/time/0/budget",json!("")),
        ("/activities/0/time/0/budget",json!("x".repeat(201))),
        ("/activities/0/time/0/period",json!("unknown"))] {
        let mut bad=value.clone();*bad.pointer_mut(path).unwrap()=replacement;let p=from(bad);
        assert!(!p.check().is_empty(),"{path}"); assert_ne!(run(&p).status,Status::Complete,"{path}");
        assert!(!validate(&p,&[at("year-pass",0)]).ok(),"{path}");
    }
}
#[test]
fn v4_and_v5_without_budget_keep_independent_time_rules_and_answer_version() {
    for version in [4,5] {
        let mut value=serde_json::to_value(annual(false,270,270)).unwrap();value["version"]=json!(version);
        for row in value["activities"][0]["time"].as_array_mut().unwrap() { row.as_object_mut().unwrap().remove("budget");row["min_min"]=json!(0);row["max_min"]=json!(210); }
        let p=from(value);assert!(p.check().is_empty());let s=run(&p);assert_eq!(s.version,version);assert_eq!(s.status,Status::Complete);assert!(validate_solution(&p,&s).ok());
        assert!(serde_json::to_string(&p).unwrap().find("budget").is_none());
    }
}
