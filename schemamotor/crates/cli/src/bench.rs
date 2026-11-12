//! Mätning på syntetiska skolor. Varje resultat granskas av den fristående
//! validatorn; en rad räknas bara som godkänd när den hittar noll regelbrott.

use crate::{fail, gen, Args};
use schemamotor_model::*;
use schemamotor_solve::{solve, Options};
use std::sync::atomic::AtomicBool;

#[derive(serde::Serialize)]
struct Row {
    kind: String,
    seed: u64,
    lessons: u32,
    teachers: usize,
    rooms: usize,
    status: Status,
    placed_lessons: u32,
    first_complete_ms: Option<u64>,
    elapsed_ms: u64,
    iterations: u64,
    violations: usize,
    metrics: Metrics,
    /// Minsta ändring: en lärare blir borta en dag. Flyttade pass med och utan
    /// det gamla schemat som utgångspunkt.
    change_affected: u32,
    change_moved_with_reference: u32,
    change_moved_without_reference: u32,
    change_status: Status,
    change_unplaced: u32,
    change_violations: usize,
}

pub fn run(args: &Args) {
    let time = args.num("time").unwrap_or(10_000);
    let seeds = args.num("seeds").unwrap_or(1);
    let threads = args.num("threads").unwrap_or(0) as usize;
    let kinds: Vec<&gen::Kind> = match args.get("kinds") {
        Some(list) => list.split(',').map(|n| gen::KINDS.iter().find(|k| k.name == n).unwrap_or_else(|| fail(&format!("okänd typ {n}")))).collect(),
        None => gen::KINDS.iter().collect(),
    };
    let never = AtomicBool::new(false);
    let mut rows = Vec::new();
    println!("{:<11}{:>5}{:>7}{:>7}{:>6}  {:<11}{:>8}{:>9}{:>9}{:>10}{:>7}{:>7}{:>7}{:>6}  {:>14}", "typ", "frö", "pass", "lärare", "salar", "besked", "plac", "först ms", "tid ms", "kostnad", "e-hål", "l-hål", "sent", "brott", "ändring m/u ref");
    for kind in kinds {
        for seed in 1..=seeds {
            let problem = gen::school(kind, seed);
            let opt = Options { time_limit_ms: Some(time), max_iters: None, threads, seed };
            let s = solve(&problem, &opt, &never);
            let report = schemamotor_validate::validate_solution(&problem, &s);

            // Den mest belastade läraren som rimligen kan vara borta en dag (ingen
            // annan frånvaro, högst 900 minuter i veckan) blir borta hela första
            // dagen hen undervisar.
            let mut changed = problem.clone();
            let minutes = |id: &str| problem.lessons.iter().filter(|l| l.teachers.iter().any(|t| t == id)).map(|l| l.duration_min).sum::<u32>();
            let mut busiest: Vec<(u32, &str)> = problem.teachers.iter().filter(|t| t.unavailable.is_empty()).map(|t| (minutes(&t.id), t.id.as_str())).filter(|x| x.0 <= 900).collect();
            busiest.sort();
            let who = busiest.last().map(|b| b.1.to_string()).unwrap_or_default();
            let taught: Vec<&Placement> = s.placements.iter().filter(|pl| problem.lessons.iter().any(|l| l.id == pl.lesson && l.teachers.contains(&who))).collect();
            let day = taught.first().map_or(0, |pl| pl.day);
            let affected = taught.iter().filter(|pl| pl.day == day).count() as u32;
            let d = &problem.time.days[day as usize];
            if let Some(t) = changed.teachers.iter_mut().find(|t| t.id == who) {
                t.unavailable.push(Interval { day, start_min: d.start_min, end_min: d.end_min });
            }
            let mut with = changed.clone();
            with.reference = s.placements.clone();
            let opt2 = Options { time_limit_ms: Some(time / 2), ..opt.clone() };
            let a = solve(&with, &opt2, &never);
            let ra = schemamotor_validate::validate_solution(&with, &a);
            let b = solve(&changed, &opt2, &never);
            // Mät den fria lösningen mot samma utgångsschema.
            let rb = schemamotor_validate::validate(&with, &b.placements);

            println!(
                "{:<11}{:>5}{:>7}{:>7}{:>6}  {:<11}{:>8}{:>9}{:>9}{:>10}{:>7}{:>7}{:>7}{:>6}  {:>3}: {:>4} / {:>4}{}",
                kind.name, seed, s.metrics.lessons, problem.teachers.len(), problem.rooms.len(), format!("{:?}", s.status), s.metrics.placed_lessons,
                s.stats.first_complete_ms.map_or("-".into(), |v| v.to_string()), s.stats.elapsed_ms, s.metrics.cost, s.metrics.student_gap_min, s.metrics.teacher_gap_min,
                s.metrics.student_late_min, report.violations.len(), affected, ra.metrics.moved_lessons, rb.metrics.moved_lessons,
                if a.metrics.unplaced_lessons > 0 { format!("  ({} oplacerade, {:?}; utan referens {} oplacerade, {:?})", a.metrics.unplaced_lessons, a.status, b.metrics.unplaced_lessons, b.status) } else { String::new() }
            );
            for v in report.violations.iter().chain(&ra.violations).take(5) {
                println!("    {}: {}", v.code, v.message);
            }
            rows.push(Row {
                kind: kind.name.into(), seed, lessons: s.metrics.lessons, teachers: problem.teachers.len(), rooms: problem.rooms.len(), status: s.status, placed_lessons: s.metrics.placed_lessons,
                first_complete_ms: s.stats.first_complete_ms, elapsed_ms: s.stats.elapsed_ms, iterations: s.stats.iterations, violations: report.violations.len(), metrics: s.metrics,
                change_affected: affected, change_moved_with_reference: ra.metrics.moved_lessons, change_moved_without_reference: rb.metrics.moved_lessons, change_status: a.status, change_unplaced: a.metrics.unplaced_lessons, change_violations: ra.violations.len(),
            });
        }
    }
    if let Some(dir) = args.get("out") {
        std::fs::create_dir_all(dir).unwrap_or_else(|e| fail(&format!("kan inte skapa {dir}: {e}")));
        let path = format!("{dir}/bench.json");
        std::fs::write(&path, serde_json::to_string_pretty(&rows).expect("json")).unwrap_or_else(|e| fail(&format!("kan inte skriva {path}: {e}")));
    }
    if rows.iter().any(|r| r.violations > 0 || r.change_violations > 0) {
        std::process::exit(1);
    }
}
