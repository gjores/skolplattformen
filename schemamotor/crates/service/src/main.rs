//! `schemamotor-tjanst`: lyssnar på SCHEMAMOTOR_ADDR (förval 127.0.0.1:8787)
//! och kräver SCHEMAMOTOR_TOKEN. Tokenet skrivs aldrig ut.

use schemamotor_tjanst::{serve, Config};
use std::sync::Arc;

fn number<T: std::str::FromStr>(name: &str, default: T) -> T {
    match std::env::var(name) {
        Ok(v) => v.parse().unwrap_or_else(|_| {
            eprintln!("{name} är inte ett tal.");
            std::process::exit(2)
        }),
        Err(_) => default,
    }
}

fn main() {
    let token = std::env::var("SCHEMAMOTOR_TOKEN").unwrap_or_default();
    if token.len() < 16 {
        eprintln!("SCHEMAMOTOR_TOKEN saknas eller är kortare än 16 tecken.");
        std::process::exit(2);
    }
    let addr = std::env::var("SCHEMAMOTOR_ADDR").unwrap_or_else(|_| "127.0.0.1:8787".into());
    let mut cfg = Config::new(token);
    cfg.max_time_ms = number("SCHEMAMOTOR_MAX_TIME_MS", cfg.max_time_ms);
    cfg.max_concurrent = number("SCHEMAMOTOR_MAX_CONCURRENT", cfg.max_concurrent);
    cfg.threads = number("SCHEMAMOTOR_THREADS", cfg.threads);
    let server = tiny_http::Server::http(&addr).unwrap_or_else(|e| {
        eprintln!("Kunde inte lyssna på {addr}: {e}");
        std::process::exit(1)
    });
    eprintln!("schemamotor-tjanst lyssnar på {addr}");
    serve(Arc::new(server), cfg);
}
