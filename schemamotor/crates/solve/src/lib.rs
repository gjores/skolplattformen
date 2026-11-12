//! Schemamotorns lösare.
//!
//! `solve` tar ett underlag och ger ett resultat. Den läser och skriver inget
//! annat. Beskedet är ett av fem: komplett, tidsgräns, bevisat olösbart,
//! underlag saknas eller avbruten.

mod compile;
mod proof;
mod search;
mod state;

use schemamotor_model::*;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

#[derive(Clone, Debug)]
pub struct Options {
    /// Tidsgräns. Utan både tids- och iterationsgräns används 10 sekunder.
    pub time_limit_ms: Option<u64>,
    /// Iterationsgräns per tråd. Med en tråd och utan tidsgräns blir körningen
    /// upprepbar: samma underlag och frö ger samma resultat.
    pub max_iters: Option<u64>,
    /// 0 = alla kärnor.
    pub threads: usize,
    pub seed: u64,
}

impl Default for Options {
    fn default() -> Self {
        Options { time_limit_ms: None, max_iters: None, threads: 0, seed: 1 }
    }
}

fn empty(p: &Problem, status: Status, diagnoses: Vec<Diagnosis>, opt: &Options, start: Instant) -> Solution {
    Solution {
        version: CONTRACT_VERSION,
        problem_id: p.id.clone(),
        problem_hash: p.hash(),
        status,
        placements: vec![],
        unplaced: p.lessons.iter().map(|l| l.id.clone()).collect(),
        diagnoses,
        metrics: Metrics {
            lessons: p.lessons.len() as u32,
            unplaced_lessons: p.lessons.len() as u32,
            unplaced_min: p.lessons.iter().map(|l| l.duration_min as u64).sum(),
            ..Metrics::default()
        },
        stats: Stats { elapsed_ms: start.elapsed().as_millis() as u64, first_complete_ms: None, iterations: 0, threads: 0, seed: opt.seed },
    }
}

pub fn solve(p: &Problem, opt: &Options, cancel: &AtomicBool) -> Solution {
    let start = Instant::now();
    let errors = p.check();
    if !errors.is_empty() {
        return empty(p, Status::InputMissing, errors, opt, start);
    }
    if p.lessons.is_empty() {
        return empty(p, Status::Complete, vec![], opt, start);
    }
    let inst = compile::compile(p);
    let mut diagnoses = proof::presolve(p, &inst);
    let proved = !diagnoses.is_empty();

    let threads = if opt.threads == 0 { std::thread::available_parallelism().map_or(1, |n| n.get()) } else { opt.threads };
    let mut limit = match (opt.time_limit_ms, opt.max_iters) {
        (None, None) => Some(10_000),
        (t, _) => t,
    };
    // Ett bevisat olösbart underlag får ändå ett delschema, men på kortare tid.
    if proved {
        limit = limit.map(|ms| (ms / 4).max(200.min(ms)));
    }
    let first_complete = AtomicU64::new(u64::MAX);
    let ctl = search::Ctl { start, deadline: limit.map(|ms| start + Duration::from_millis(ms)), max_iters: opt.max_iters, cancel, first_complete: &first_complete };
    let outcomes: Vec<search::Outcome> = if threads == 1 {
        vec![search::run(&inst, &ctl, opt.seed)]
    } else {
        std::thread::scope(|scope| {
            let handles: Vec<_> = (0..threads).map(|i| { let (inst, ctl) = (&inst, &ctl); scope.spawn(move || search::run(inst, ctl, opt.seed.wrapping_add(i as u64 * 7919))) }).collect();
            handles.into_iter().map(|h| h.join().expect("söktråd")).collect()
        })
    };
    let iterations = outcomes.iter().map(|o| o.iterations).sum();
    let best = outcomes.iter().min_by_key(|o| o.obj).unwrap();

    let mut st = state::State::new(&inst);
    st.restore(&best.snap);
    let parts = st.breakdown();
    let w = &p.weights;
    let mut m = Metrics { lessons: p.lessons.len() as u32, ..Metrics::default() };
    let mut placements = Vec::new();
    let mut unplaced = Vec::new();
    for (li, l) in p.lessons.iter().enumerate() {
        let u = inst.lesson_unit[li];
        match st.pos[u] {
            Some((d, s)) => {
                let part = inst.units[u].parts.iter().find(|x| x.lesson == li).unwrap();
                let rooms = st.rooms[u][part.room_off..part.room_off + part.room_count as usize].iter().map(|&r| p.rooms[r as usize].id.clone()).collect();
                placements.push(Placement { lesson: l.id.clone(), day: d as u32, start_min: inst.slot_min(d as usize, s as u32), rooms });
                m.placed_lessons += 1;
                m.placed_min += l.duration_min as u64;
            }
            None => {
                unplaced.push(l.id.clone());
                m.unplaced_lessons += 1;
                m.unplaced_min += l.duration_min as u64;
            }
        }
    }
    m.student_gap_min = parts[0] as u64;
    m.teacher_gap_min = parts[1] as u64;
    m.student_late_min = parts[2] as u64;
    m.same_day_repeats = parts[3] as u32;
    m.moved_lessons = parts[4] as u32;
    m.room_moved_lessons = parts[5] as u32;
    m.cost = parts[0] * w.student_gap + parts[1] * w.teacher_gap + parts[2] * w.student_late + parts[3] * w.same_day + parts[4] * w.moved + parts[5] * w.room_moved;
    debug_assert_eq!(m.cost, st.soft);

    if !unplaced.is_empty() {
        let more = proof::explain_unplaced(p, &inst, &st, &diagnoses);
        diagnoses.extend(more);
    }
    let status = if diagnoses.iter().any(|d| d.proof) {
        Status::Infeasible
    } else if unplaced.is_empty() {
        Status::Complete
    } else if cancel.load(Ordering::Relaxed) {
        Status::Cancelled
    } else {
        Status::TimeLimit
    };
    let first = first_complete.load(Ordering::Relaxed);
    Solution {
        version: CONTRACT_VERSION,
        problem_id: p.id.clone(),
        problem_hash: p.hash(),
        status,
        placements,
        unplaced,
        diagnoses,
        metrics: m,
        stats: Stats { elapsed_ms: start.elapsed().as_millis() as u64, first_complete_ms: (first != u64::MAX).then_some(first), iterations, threads: threads as u32, seed: opt.seed },
    }
}
