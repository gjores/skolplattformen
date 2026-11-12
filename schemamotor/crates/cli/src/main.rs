//! Kommandorad för schemamotorn.
//!
//!   schemamotor solve <underlag.json> [--out fil] [--time ms] [--iters n] [--threads n] [--seed n]
//!   schemamotor validate <underlag.json> <resultat.json>
//!   schemamotor gen <typ> [--seed n] [--out fil]
//!   schemamotor bench [--time ms] [--seeds n] [--kinds a,b] [--threads n] [--out katalog]

mod bench;
mod gen;

use schemamotor_model::*;
use schemamotor_solve::Options;
use std::sync::atomic::AtomicBool;

pub struct Args {
    pub free: Vec<String>,
    flags: Vec<(String, String)>,
}

impl Args {
    fn parse() -> Args {
        let mut free = Vec::new();
        let mut flags = Vec::new();
        let mut it = std::env::args().skip(1);
        while let Some(a) = it.next() {
            match a.strip_prefix("--") {
                Some(name) => flags.push((name.to_string(), it.next().unwrap_or_default())),
                None => free.push(a),
            }
        }
        Args { free, flags }
    }
    pub fn get(&self, name: &str) -> Option<&str> {
        self.flags.iter().find(|f| f.0 == name).map(|f| f.1.as_str())
    }
    pub fn num(&self, name: &str) -> Option<u64> {
        self.get(name).map(|v| v.parse().unwrap_or_else(|_| fail(&format!("--{name} ska vara ett heltal"))))
    }
}

pub fn fail(msg: &str) -> ! {
    eprintln!("fel: {msg}");
    std::process::exit(2);
}

fn read<T: serde::de::DeserializeOwned>(path: &str) -> T {
    let text = std::fs::read_to_string(path).unwrap_or_else(|e| fail(&format!("kan inte läsa {path}: {e}")));
    serde_json::from_str(&text).unwrap_or_else(|e| fail(&format!("{path} följer inte kontraktet: {e}")))
}

fn write(path: Option<&str>, value: &impl serde::Serialize) {
    let text = serde_json::to_string_pretty(value).expect("json");
    match path {
        Some(p) => std::fs::write(p, text).unwrap_or_else(|e| fail(&format!("kan inte skriva {p}: {e}"))),
        None => println!("{text}"),
    }
}

pub fn options(args: &Args) -> Options {
    Options { time_limit_ms: args.num("time"), max_iters: args.num("iters"), threads: args.num("threads").unwrap_or(0) as usize, seed: args.num("seed").unwrap_or(1) }
}

fn main() {
    let args = Args::parse();
    match args.free.first().map(|s| s.as_str()) {
        Some("solve") => {
            let problem: Problem = read(args.free.get(1).unwrap_or_else(|| fail("ange underlag")));
            let solution = schemamotor_solve::solve(&problem, &options(&args), &AtomicBool::new(false));
            let m = &solution.metrics;
            eprintln!("{:?}: {} av {} pass placerade, kostnad {}, {} ms", solution.status, m.placed_lessons, m.lessons, m.cost, solution.stats.elapsed_ms);
            for d in &solution.diagnoses {
                eprintln!("  {}{}", if d.proof { "[bevis] " } else { "" }, d.message);
            }
            write(args.get("out"), &solution);
        }
        Some("validate") => {
            let problem: Problem = read(args.free.get(1).unwrap_or_else(|| fail("ange underlag")));
            let solution: Solution = read(args.free.get(2).unwrap_or_else(|| fail("ange resultat")));
            let report = schemamotor_validate::validate_solution(&problem, &solution);
            for v in &report.violations {
                println!("{}: {}", v.code, v.message);
            }
            println!("{} regelbrott, kostnad {}", report.violations.len(), report.metrics.cost);
            if !report.ok() {
                std::process::exit(1);
            }
        }
        Some("gen") => {
            let name = args.free.get(1).map(|s| s.as_str()).unwrap_or("mellan");
            let kind = gen::KINDS.iter().find(|k| k.name == name).unwrap_or_else(|| fail("okänd typ; välj liten, mellan, grundskola, gymnasium eller stor"));
            write(args.get("out"), &gen::school(kind, args.num("seed").unwrap_or(1)));
        }
        Some("bench") => bench::run(&args),
        _ => fail("använd solve, validate, gen eller bench"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Syntetiska skolor med block, kluster, specialsalar och lunch: motorn
    /// ska lägga allt och validatorn ska räkna fram samma utfall.
    #[test]
    fn generated_schools_are_solved_and_pass_the_validator() {
        for (name, seed) in [("liten", 1), ("liten", 2), ("mellan", 1), ("gymnasium", 3)] {
            let kind = gen::KINDS.iter().find(|k| k.name == name).unwrap();
            let problem = gen::school(kind, seed);
            assert!(problem.check().is_empty());
            let opt = Options { time_limit_ms: None, max_iters: Some(40_000), threads: 1, seed: 1 };
            let s = schemamotor_solve::solve(&problem, &opt, &AtomicBool::new(false));
            let report = schemamotor_validate::validate_solution(&problem, &s);
            assert!(report.ok(), "{name} {seed}: {:?}", report.violations.iter().map(|v| &v.message).collect::<Vec<_>>());
            assert_eq!(s.status, Status::Complete, "{name} {seed}: {:?}", s.diagnoses);
            assert_eq!(s.metrics, report.metrics);
        }
    }

    #[test]
    fn the_contract_survives_a_round_trip_and_rejects_unknown_fields() {
        let problem = gen::school(&gen::KINDS[0], 1);
        let text = serde_json::to_string(&problem).unwrap();
        let back: Problem = serde_json::from_str(&text).unwrap();
        assert_eq!(problem.hash(), back.hash());
        let odd = text.replacen("\"version\"", "\"okänt\":1,\"version\"", 1);
        assert!(serde_json::from_str::<Problem>(&odd).is_err());
    }
}
