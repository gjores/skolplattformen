//! Tjänsten prövad över riktig HTTP på en ledig lokal port, med syntetiskt underlag.

use schemamotor_model::{Problem, Solution, Status};
use schemamotor_tjanst::{serve, Config};
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Arc;

const TOKEN: &str = "prov-token-bara-for-test";

fn start(cfg: Config) -> String {
    let server = Arc::new(tiny_http::Server::http("127.0.0.1:0").unwrap());
    let addr = server.server_addr().to_ip().unwrap().to_string();
    std::thread::spawn(move || serve(server, cfg));
    addr
}

fn call(addr: &str, method: &str, path: &str, token: Option<&str>, body: &str) -> (u16, String) {
    let mut s = TcpStream::connect(addr).unwrap();
    let auth = token.map(|t| format!("Authorization: Bearer {t}\r\n")).unwrap_or_default();
    write!(s, "{method} {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\n{auth}Content-Length: {}\r\n\r\n{body}", body.len()).unwrap();
    let mut out = String::new();
    s.read_to_string(&mut out).unwrap();
    let status = out.split_whitespace().nth(1).unwrap().parse().unwrap();
    (status, out.split_once("\r\n\r\n").map(|x| x.1.to_string()).unwrap_or_default())
}

fn problem(lessons: usize) -> String {
    let lessons: Vec<_> = (0..lessons).map(|i| serde_json::json!({"id": format!("pass-{i}"), "duration_min": 60, "teachers": ["larare-1"], "groups": ["grupp-1"]})).collect();
    serde_json::json!({
        "version": schemamotor_model::CONTRACT_VERSION, "id": "prov",
        "time": {"step_min": 5, "days": [{"start_min": 480, "end_min": 960}, {"start_min": 480, "end_min": 960}]},
        "teachers": [{"id": "larare-1"}], "clusters": [{"id": "kluster-1", "size": 25}],
        "groups": [{"id": "grupp-1", "clusters": ["kluster-1"]}], "lessons": lessons,
        "rules": {"break_min": 10, "lunch": null, "same_day": "avoid"}, "weights": {"late_after_min": null}
    })
    .to_string()
}

fn annual_problem() -> serde_json::Value {
    let mut p:serde_json::Value=serde_json::from_str(&problem(1)).unwrap();
    p["version"]=serde_json::json!(5);p["periods"]=serde_json::json!([{"id":"ht"},{"id":"vt"}]);
    p["lessons"][0]["duration_min"]=serde_json::json!(30);p["lessons"][0]["activity"]=serde_json::json!("year");
    p["activities"]=serde_json::json!([{"id":"year","time":[
        {"period":"ht","budget":"arsbudget-1","weekday_days":[2,5],"min_min":270,"max_min":270},
        {"period":"vt","budget":"arsbudget-1","weekday_days":[7,3],"min_min":270,"max_min":270}]}]);p
}

#[test]
fn v4_and_v5_return_the_requested_version_across_all_five_http_endpoints() {
    let mut config=Config::new(TOKEN.into());config.threads=1;let addr=start(config);
    let health:serde_json::Value=serde_json::from_str(&call(&addr,"GET","/v1/health",None,"").1).unwrap();
    assert_eq!(health["contract_version"],5);assert_eq!(health["supported_problem_versions"],serde_json::json!([4,5]));
    for version in [4,5] {
        let mut p:serde_json::Value=if version==5 {annual_problem()} else {serde_json::from_str(&problem(1)).unwrap()};p["version"]=serde_json::json!(version);
        let (status,text)=call(&addr,"POST","/v1/solve?time_ms=200",Some(TOKEN),&p.to_string());assert_eq!(status,200);
        let solution:Solution=serde_json::from_str(&text).unwrap();assert_eq!(solution.version,version);assert_eq!(solution.status,Status::Complete);
        let placements=serde_json::to_value(&solution.placements).unwrap();
        for (endpoint,body) in [
            ("validate",serde_json::json!({"problem":p,"placements":placements})),
            ("positions",serde_json::json!({"problem":p,"placements":placements,"lesson":"pass-0"})),
            ("diagnose",p.clone()),
            ("suggest",serde_json::json!({"problem":p,"placements":[],"mode":"lesson","lesson":"pass-0","target":null,"depth":1})),
        ] {
            let (status,text)=call(&addr,"POST",&format!("/v1/{endpoint}"),Some(TOKEN),&body.to_string());assert_eq!(status,200,"v{version} {endpoint}: {text}");
            let answer:serde_json::Value=serde_json::from_str(&text).unwrap();assert_eq!(answer["version"],version,"{endpoint}");
            if endpoint=="validate" {assert!(answer["violations"].as_array().unwrap().is_empty());}
        }
    }
}

#[test]
fn annual_http_validation_and_positions_detect_the_wrong_weekday_and_v4_budget_is_never_green() {
    let addr=start(Config::new(TOKEN.into()));let p=annual_problem();
    let wrong=serde_json::json!([{"lesson":"pass-0","day":1,"start_min":480}]);
    let (_,text)=call(&addr,"POST","/v1/validate",Some(TOKEN),&serde_json::json!({"problem":p,"placements":wrong}).to_string());
    let answer:serde_json::Value=serde_json::from_str(&text).unwrap();assert!(answer["violations"].as_array().unwrap().iter().any(|v|v["code"]=="activity_time"&&v["message"].as_str().unwrap().contains("240")));
    let (_,text)=call(&addr,"POST","/v1/positions",Some(TOKEN),&serde_json::json!({"problem":p,"placements":[],"lesson":"pass-0"}).to_string());
    let answer:serde_json::Value=serde_json::from_str(&text).unwrap();assert!(answer["positions"].as_array().unwrap().iter().any(|v|v["day"]==1&&v["state"]=="violation"));
    let mut old=p;old["version"]=serde_json::json!(4);
    let (_,text)=call(&addr,"POST","/v1/solve?time_ms=10",Some(TOKEN),&old.to_string());let solution:Solution=serde_json::from_str(&text).unwrap();assert_eq!(solution.version,4);assert_eq!(solution.status,Status::InputMissing);
    let (_,text)=call(&addr,"POST","/v1/validate",Some(TOKEN),&serde_json::json!({"problem":old,"placements":[]}).to_string());let report:serde_json::Value=serde_json::from_str(&text).unwrap();assert!(!report["violations"].as_array().unwrap().is_empty());
    assert_eq!(call(&addr,"POST","/v1/positions",Some(TOKEN),&serde_json::json!({"problem":old,"placements":[],"lesson":"pass-0"}).to_string()).0,400);
    assert_eq!(call(&addr,"POST","/v1/suggest",Some(TOKEN),&serde_json::json!({"problem":old,"placements":[],"mode":"lesson","lesson":"pass-0","target":null,"depth":1}).to_string()).0,400);
}

#[test]
fn room_only_booking_over_http_preserves_margin_conflicts_and_free_rooms_in_v4_and_v5() {
    let mut config = Config::new(TOKEN.into());
    config.threads = 1;
    let addr = start(config);
    for version in [4, 5] {
        let p = serde_json::json!({
            "version": version, "id": "room-booking",
            "time": { "step_min": 5, "days": [{ "start_min": 480, "end_min": 660 }] },
            "teachers": [{ "id": "t" }], "rooms": [{ "id": "r1" }, { "id": "r2" }],
            "lessons": [
                { "id": "booking", "duration_min": 20, "rooms": { "count": 1, "allowed": ["r1"] },
                  "locked": { "day": 0, "start_min": 540, "rooms": ["r1"] },
                  "margin": { "rooms": { "before_min": 10 } } },
                { "id": "teaching", "duration_min": 60, "teachers": ["t"],
                  "allowed": [{ "day": 0, "start_min": 480, "end_min": 540 }],
                  "rooms": { "count": 1, "allowed": ["r1", "r2"] } }
            ], "rules": { "break_min": 0, "same_day": "allow", "lunch": null }
        });
        for (room, collision) in [("r1", true), ("r2", false)] {
            let body = serde_json::json!({ "problem": p, "placements": [
                { "lesson": "booking", "day": 0, "start_min": 540, "rooms": ["r1"] },
                { "lesson": "teaching", "day": 0, "start_min": 480, "rooms": [room] }
            ] });
            let (status, text) = call(&addr, "POST", "/v1/validate", Some(TOKEN), &body.to_string());
            assert_eq!(status, 200);
            let answer: serde_json::Value = serde_json::from_str(&text).unwrap();
            assert_eq!(answer["version"], version);
            let violations = answer["violations"].as_array().unwrap();
            if collision {
                assert!(violations.iter().any(|v| v["code"] == "room_clash"));
                assert!(!violations.iter().any(|v| v["code"] == "bad_problem"));
            } else { assert!(violations.is_empty(), "v{version}: {text}"); }
        }
        let (status, text) = call(&addr, "POST", "/v1/solve?time_ms=200", Some(TOKEN), &p.to_string());
        assert_eq!(status, 200);
        let solution: Solution = serde_json::from_str(&text).unwrap();
        assert_eq!(solution.version, version);
        assert_eq!(solution.status, Status::Complete);
        let problem: Problem = serde_json::from_value(p).unwrap();
        assert!(schemamotor_validate::validate_solution(&problem, &solution).ok());
        assert_eq!(solution.placements.iter().find(|p| p.lesson == "teaching").unwrap().rooms, ["r2"]);
    }
}

#[test]
fn solve_requires_token_and_returns_a_valid_schedule() {
    let addr = start(Config::new(TOKEN.into()));
    assert_eq!(call(&addr, "GET", "/v1/health", None, "").0, 200);
    let body = problem(6);
    assert_eq!(call(&addr, "POST", "/v1/solve", None, &body).0, 401);
    assert_eq!(call(&addr, "POST", "/v1/solve", Some("fel-token-som-ar-lika-lang"), &body).0, 401);
    let (status, text) = call(&addr, "POST", "/v1/solve?time_ms=300", Some(TOKEN), &body);
    assert_eq!(status, 200);
    let solution: Solution = serde_json::from_str(&text).unwrap();
    assert_eq!(solution.status, Status::Complete);
    let p: Problem = serde_json::from_str(&body).unwrap();
    let report = schemamotor_validate::validate_solution(&p, &solution);
    assert!(report.violations.is_empty(), "{:?}", report.violations);
}

#[test]
fn bad_requests_are_refused_without_solving() {
    let mut cfg = Config::new(TOKEN.into());
    cfg.max_body_bytes = 2000;
    let addr = start(cfg);
    assert_eq!(call(&addr, "POST", "/v1/solve", Some(TOKEN), "{\"version\":1}").0, 400);
    assert_eq!(call(&addr, "POST", "/v1/solve", Some(TOKEN), &problem(1).replace("\"id\":\"prov\"", "\"id\":\"prov\",\"okand\":1")).0, 400);
    assert_eq!(call(&addr, "POST", "/v1/solve?time_ms=0", Some(TOKEN), &problem(1)).0, 400);
    assert_eq!(call(&addr, "POST", "/v1/solve?time_ms=20&seed=2&seed=2", Some(TOKEN), &problem(1)).0, 400);
    assert_eq!(call(&addr, "POST", "/v1/solve", Some(TOKEN), &problem(40)).0, 413);
    assert_eq!(call(&addr, "GET", "/v1/solve", Some(TOKEN), "").0, 405);
    assert_eq!(call(&addr, "POST", "/v1/annat", Some(TOKEN), "").0, 404);
}

#[test]
fn solve_accepts_u64_seed_and_reports_the_used_seed_without_changing_problem_contract() {
    let mut cfg = Config::new(TOKEN.into());
    cfg.threads = 1;
    let addr = start(cfg);
    for (query, seed) in [("time_ms=30", 1), ("seed=0&time_ms=30", 0), ("time_ms=30&seed=9007199254740991", 9_007_199_254_740_991), ("time_ms=30&seed=18446744073709551615", u64::MAX)] {
        let (status, text) = call(&addr, "POST", &format!("/v1/solve?{query}"), Some(TOKEN), &problem(2));
        assert_eq!(status, 200);
        let answer: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert_eq!(answer["version"], schemamotor_model::CONTRACT_VERSION);
        assert_eq!(answer["stats"]["seed"], seed);
        let parsed: Solution = serde_json::from_value(answer).unwrap();
        let p: Problem = serde_json::from_str(&problem(2)).unwrap();
        assert!(schemamotor_validate::validate_solution(&p, &parsed).ok());
    }
    for query in ["seed=-1", "seed=+1", "seed=1.5", "seed=18446744073709551616", "seed=1&seed=1", "time_ms=30&time_ms=30", "time_ms=30&seed=1&unknown=1"] {
        assert_eq!(call(&addr, "POST", &format!("/v1/solve?{query}"), Some(TOKEN), &problem(2)).0, 400, "{query}");
    }
    for endpoint in ["validate", "positions", "diagnose", "suggest"] {
        assert_eq!(call(&addr, "POST", &format!("/v1/{endpoint}?seed=1"), Some(TOKEN), &problem(2)).0, 400);
    }
}

#[test]
fn busy_service_answers_429_and_time_is_capped() {
    let mut cfg = Config::new(TOKEN.into());
    cfg.max_concurrent = 1;
    cfg.max_time_ms = 1500;
    cfg.threads = 1;
    let addr = start(cfg);
    // Tio pass om 60 min ryms inte på två dagar: körningen tar hela den kapade tiden.
    let body = problem(20);
    let (a, b) = (addr.clone(), body.clone());
    let started = std::time::Instant::now();
    let slow = std::thread::spawn(move || call(&a, "POST", "/v1/solve?time_ms=999999", Some(TOKEN), &b));
    std::thread::sleep(std::time::Duration::from_millis(300));
    assert_eq!(call(&addr, "POST", "/v1/solve", Some(TOKEN), &body).0, 429);
    assert_eq!(call(&addr,"POST","/v1/suggest",Some(TOKEN),&suggestion_body(body.clone())).0,429);
    let (status, _) = slow.join().unwrap();
    assert_eq!(status, 200);
    assert!(started.elapsed().as_millis() < 5000);
    assert_eq!(call(&addr, "POST", "/v1/solve?time_ms=200", Some(TOKEN), &problem(2)).0, 200);
}

#[test]
fn validate_reports_violations_without_changing_anything() {
    let addr = start(Config::new(TOKEN.into()));
    let problem: serde_json::Value = serde_json::from_str(&problem(2)).unwrap();
    let body = |b_start: u32| serde_json::json!({"problem": problem, "placements": [
        {"lesson": "pass-0", "day": 0, "start_min": 480}, {"lesson": "pass-1", "day": 0, "start_min": b_start}]})
    .to_string();
    assert_eq!(call(&addr, "POST", "/v1/validate", None, &body(480)).0, 401);
    assert_eq!(call(&addr, "POST", "/v1/validate?time_ms=5", Some(TOKEN), &body(480)).0, 400);
    assert_eq!(call(&addr, "POST", "/v1/validate", Some(TOKEN), "{\"problem\":1}").0, 400);

    let (status, out) = call(&addr, "POST", "/v1/validate", Some(TOKEN), &body(500));
    assert_eq!(status, 200);
    let clash: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(clash["problem_id"], "prov");
    let violations = clash["violations"].as_array().unwrap();
    assert!(!violations.is_empty());
    assert!(violations.iter().all(|v| v["lessons"].as_array().unwrap().len() == 2 && v["message"].as_str().is_some()));

    let (status, out) = call(&addr, "POST", "/v1/validate", Some(TOKEN), &body(600));
    assert_eq!(status, 200);
    let fine: serde_json::Value = serde_json::from_str(&out).unwrap();
    assert_eq!(fine["violations"].as_array().unwrap().len(), 0);
    assert_eq!(fine["metrics"]["placed_lessons"], 2);
}

#[test]
fn preflight_requires_authorization_and_reports_without_searching() {
    let addr = start(Config::new(TOKEN.into()));
    let body = problem(30);
    assert_eq!(call(&addr,"POST","/v1/diagnose",None,&body).0,401);
    assert_eq!(call(&addr,"GET","/v1/diagnose",Some(TOKEN),"").0,405);
    assert_eq!(call(&addr,"POST","/v1/diagnose?time_ms=100",Some(TOKEN),&body).0,400);
    let (status,text)=call(&addr,"POST","/v1/diagnose",Some(TOKEN),&body);
    assert_eq!(status,200);
    let out:serde_json::Value=serde_json::from_str(&text).unwrap();
    assert_eq!(out["version"],schemamotor_model::CONTRACT_VERSION);
    assert_eq!(out["problem_id"],"prov");
    assert!(out["diagnoses"].as_array().unwrap().iter().any(|d|d["code"]=="too_little_time"));
    assert!(out.get("placements").is_none() && out.get("search_statistics").is_none());
    let old=body.replace(&format!("\"version\":{}",schemamotor_model::CONTRACT_VERSION),"\"version\":2");
    let (_,text)=call(&addr,"POST","/v1/diagnose",Some(TOKEN),&old);
    let out:serde_json::Value=serde_json::from_str(&text).unwrap();
    assert_eq!(out["diagnoses"][0]["code"],"version");
}

fn suggestion_body(body:String)->String {
    serde_json::json!({"problem":serde_json::from_str::<serde_json::Value>(&body).unwrap(),"placements":[],"mode":"lesson","lesson":"pass-0","target":null,"depth":1}).to_string()
}

#[test]
fn suggest_preserves_http_grinds_and_returns_the_exact_new_contract() {
    let addr=start(Config::new(TOKEN.into()));
    let body=suggestion_body(problem(2));
    let mut extra:serde_json::Value=serde_json::from_str(&body).unwrap();extra["unknown"]=serde_json::json!(true);
    assert_eq!(call(&addr,"POST","/v1/suggest",Some(TOKEN),&extra.to_string()).0,400);
    extra.as_object_mut().unwrap().remove("unknown");extra.as_object_mut().unwrap().remove("target");
    assert_eq!(call(&addr,"POST","/v1/suggest",Some(TOKEN),&extra.to_string()).0,400);
    assert_eq!(call(&addr,"POST","/v1/suggest",None,&body).0,401);
    assert_eq!(call(&addr,"GET","/v1/suggest",Some(TOKEN),"").0,405);
    assert_eq!(call(&addr,"POST","/v1/suggest?time_ms=90000",Some(TOKEN),&body).0,400);
    let mut raw:serde_json::Value=serde_json::from_str(&body).unwrap();raw["depth"]=serde_json::json!(0);
    assert_eq!(call(&addr,"POST","/v1/suggest",Some(TOKEN),&raw.to_string()),(400,"{\"error\":\"bad_request\"}".into()));
    raw["depth"]=serde_json::json!(1);raw["problem"]["version"]=serde_json::json!(3);
    assert_eq!(call(&addr,"POST","/v1/suggest",Some(TOKEN),&raw.to_string()),(400,"{\"error\":\"version_mismatch\"}".into()));
    let (status,text)=call(&addr,"POST","/v1/suggest",Some(TOKEN),&body);
    assert_eq!(status,200);
    let out:schemamotor_model::Suggestions=serde_json::from_str(&text).unwrap();
    assert_eq!(out.version,schemamotor_model::CONTRACT_VERSION);assert_eq!(out.depth,1);
    assert!(!out.suggestions.is_empty()&&out.suggestions.len()<=5);
    assert!(out.suggestions.iter().all(|s|s.placements.len()==1&&s.changes.len()==1&&s.changes[0].from.is_none()&&s.cost==s.metrics_after.cost));
    let mut cfg=Config::new(TOKEN.into());cfg.max_body_bytes=100;
    let small=start(cfg);assert_eq!(call(&small,"POST","/v1/suggest",Some(TOKEN),&body).0,413);
}

#[test]
fn suggest_refuses_a_hard_violation_without_silently_changing_the_input() {
    let addr=start(Config::new(TOKEN.into()));
    let mut raw:serde_json::Value=serde_json::from_str(&suggestion_body(problem(2))).unwrap();
    raw["placements"]=serde_json::json!([{"lesson":"pass-0","day":0,"start_min":480},{"lesson":"pass-1","day":0,"start_min":480}]);
    let (status,text)=call(&addr,"POST","/v1/suggest",Some(TOKEN),&raw.to_string());
    assert_eq!(status,400);let out:serde_json::Value=serde_json::from_str(&text).unwrap();
    assert_eq!(out["error"],"invalid_baseline");
    assert!(out["details"]["violations"].as_array().unwrap().iter().any(|v|v["code"]=="teacher_clash"));
    assert!(out.get("suggestions").is_none());
}

#[test]
fn suggest_has_a_real_two_second_budget_instead_of_an_unbounded_rest_search() {
    let addr=start(Config::new(TOKEN.into()));
    let lessons:Vec<_>=(0..10).map(|i|serde_json::json!({"id":format!("p{i}"),"duration_min":60,"teachers":["t"],"activity":"a"})).collect();
    let p=serde_json::json!({"version":schemamotor_model::CONTRACT_VERSION,"id":"budget","time":{"step_min":5,"start_grid_min":60,"days":[{"start_min":480,"end_min":1080}]},"teachers":[{"id":"t"}],"activities":[{"id":"a"}],"lessons":lessons,"rules":{"same_day":"avoid"}});
    let body=serde_json::json!({"problem":p,"placements":[],"mode":"rest","lesson":null,"target":null,"depth":3});
    let now=std::time::Instant::now();
    let (status,text)=call(&addr,"POST","/v1/suggest",Some(TOKEN),&body.to_string());
    assert_eq!(status,200);let out:schemamotor_model::Suggestions=serde_json::from_str(&text).unwrap();
    assert!(out.timed_out);assert!(out.elapsed_ms<=2250);assert!(now.elapsed()<std::time::Duration::from_secs(3));
    for s in out.suggestions {
        assert_eq!(s.placements.len(),10);
        let p:Problem=serde_json::from_value(p.clone()).unwrap();
        assert!(schemamotor_validate::validate(&p,&s.placements).ok());
    }
}
