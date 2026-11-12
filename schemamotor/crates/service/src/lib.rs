//! Schemamotorn som egen tjänst (SCHEMA-04, första skiva).
//!
//! `POST /v1/solve` tar ett underlag och svarar med resultatet. Tjänsten läser
//! ingen databas, sparar inget och loggar aldrig innehåll. Varje anrop kräver
//! bärartoken. Storlek, räknetid och antal samtidiga körningar är begränsade.
//! `POST /v1/validate` tar underlag och placeringar och svarar med kontrollantens
//! regelbrott; inget räknas om och inget rättas.
//! Kö, jobbstatus och avbryt återstår.

use schemamotor_model::{Placement, Problem, CONTRACT_VERSION};
use schemamotor_solve::{solve, Options};
use schemamotor_validate::validate;
use serde::Deserialize;
use std::io::Read;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use tiny_http::{Header, Method, Request, Response, Server};

#[derive(Clone, Debug)]
pub struct Config {
    /// Minst 16 tecken. Appens server bär samma värde.
    pub token: String,
    pub max_body_bytes: usize,
    pub default_time_ms: u64,
    pub max_time_ms: u64,
    pub max_concurrent: usize,
    /// 0 = alla kärnor.
    pub threads: usize,
}

impl Config {
    pub fn new(token: String) -> Config {
        Config { token, max_body_bytes: 8 << 20, default_time_ms: 10_000, max_time_ms: 60_000, max_concurrent: 2, threads: 0 }
    }
}

/// Jämför utan att tiden avslöjar var strängarna skiljer sig.
fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn reply(request: Request, status: u16, body: String) {
    let json = Header::from_bytes("Content-Type", "application/json; charset=utf-8").unwrap();
    let cache = Header::from_bytes("Cache-Control", "no-store").unwrap();
    let _ = request.respond(Response::from_string(body).with_status_code(status).with_header(json).with_header(cache));
}

fn error(request: Request, status: u16, code: &str) {
    reply(request, status, format!("{{\"error\":\"{code}\"}}"));
}

fn time_ms(url: &str, cfg: &Config) -> Result<u64, ()> {
    let Some((_, query)) = url.split_once('?') else { return Ok(cfg.default_time_ms) };
    let mut out = cfg.default_time_ms;
    for pair in query.split('&') {
        match pair.split_once('=') {
            Some(("time_ms", v)) => out = v.parse::<u64>().map_err(|_| ())?,
            _ => return Err(()),
        }
    }
    if out == 0 {
        return Err(());
    }
    Ok(out.min(cfg.max_time_ms))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Check {
    problem: Problem,
    placements: Vec<Placement>,
}

struct Running<'a>(&'a AtomicUsize);
impl Drop for Running<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

fn handle(mut request: Request, cfg: &Config, running: &AtomicUsize) {
    let path = request.url().split('?').next().unwrap_or("").to_string();
    if path == "/v1/health" && *request.method() == Method::Get {
        return reply(request, 200, format!("{{\"contract_version\":{CONTRACT_VERSION}}}"));
    }
    let check = path == "/v1/validate";
    if path != "/v1/solve" && !check {
        return error(request, 404, "not_found");
    }
    if *request.method() != Method::Post {
        return error(request, 405, "method_not_allowed");
    }
    let expected = format!("Bearer {}", cfg.token);
    let authorized = request.headers().iter().any(|h| h.field.equiv("Authorization") && same(h.value.as_str().as_bytes(), expected.as_bytes()));
    if !authorized {
        return error(request, 401, "unauthorized");
    }
    let Ok(limit) = time_ms(request.url(), cfg) else { return error(request, 400, "bad_request") };
    if check && request.url().contains('?') {
        return error(request, 400, "bad_request");
    }
    if request.body_length().is_some_and(|n| n > cfg.max_body_bytes) {
        return error(request, 413, "too_large");
    }
    let mut body = Vec::new();
    if request.as_reader().take(cfg.max_body_bytes as u64 + 1).read_to_end(&mut body).is_err() {
        return error(request, 400, "bad_request");
    }
    if body.len() > cfg.max_body_bytes {
        return error(request, 413, "too_large");
    }
    if check {
        let Ok(input) = serde_json::from_slice::<Check>(&body) else { return error(request, 400, "bad_problem") };
        if running.fetch_add(1, Ordering::SeqCst) >= cfg.max_concurrent {
            running.fetch_sub(1, Ordering::SeqCst);
            return error(request, 429, "busy");
        }
        let _guard = Running(running);
        let report = validate(&input.problem, &input.placements);
        let violations: Vec<_> = report
            .violations
            .iter()
            .map(|v| serde_json::json!({"code": v.code, "message": v.message, "lessons": v.lessons, "resources": v.resources}))
            .collect();
        let out = serde_json::json!({"version": CONTRACT_VERSION, "problem_id": input.problem.id, "violations": violations, "metrics": report.metrics});
        return reply(request, 200, out.to_string());
    }
    let Ok(problem) = serde_json::from_slice::<Problem>(&body) else { return error(request, 400, "bad_problem") };
    if running.fetch_add(1, Ordering::SeqCst) >= cfg.max_concurrent {
        running.fetch_sub(1, Ordering::SeqCst);
        return error(request, 429, "busy");
    }
    let _guard = Running(running);
    let options = Options { time_limit_ms: Some(limit), max_iters: None, threads: cfg.threads, seed: 1 };
    let solution = solve(&problem, &options, &AtomicBool::new(false));
    reply(request, 200, serde_json::to_string(&solution).expect("resultat"));
}

/// Tar emot anrop tills servern stängs. Varje anrop får en egen tråd.
pub fn serve(server: Arc<Server>, cfg: Config) {
    let running = Arc::new(AtomicUsize::new(0));
    for request in server.incoming_requests() {
        let (cfg, running) = (cfg.clone(), running.clone());
        std::thread::spawn(move || handle(request, &cfg, &running));
    }
}
