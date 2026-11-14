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
    assert_eq!(call(&addr, "POST", "/v1/solve?seed=2", Some(TOKEN), &problem(1)).0, 400);
    assert_eq!(call(&addr, "POST", "/v1/solve", Some(TOKEN), &problem(40)).0, 413);
    assert_eq!(call(&addr, "GET", "/v1/solve", Some(TOKEN), "").0, 405);
    assert_eq!(call(&addr, "POST", "/v1/annat", Some(TOKEN), "").0, 404);
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
