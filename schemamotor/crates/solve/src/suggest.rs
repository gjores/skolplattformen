//! Avgränsad placeringshjälp med direkta placeringar och korta undanträngningskedjor.
//! Alla redan lagda pass stannar kvar eller tas uttryckligt med i ändringslistan.
//! Motorns bitmasker söker; den oberoende kontrollanten godkänner varje helt alternativ.
use crate::compile::{compile, Inst};
use crate::state::{Plan, State};
use schemamotor_model::*;
use schemamotor_validate::{validate_before, Report};
use std::collections::{BTreeSet, HashMap};
use std::time::{Duration, Instant};

const MAX_SUGGESTIONS: usize = 5;
const SEARCH_BUDGET: Duration = Duration::from_secs(2);

#[derive(Clone, Debug)]
pub struct SuggestError {
    pub code: &'static str,
    pub violations: Vec<Diagnosis>,
}
impl SuggestError {
    fn code(code: &'static str) -> Self {
        Self {
            code,
            violations: vec![],
        }
    }
}

type Snapshot = Vec<(Option<(u8, u8)>, Vec<u16>)>;
#[derive(Clone)]
struct Ranked {
    suggestion: Suggestion,
    moved: usize,
    distance: u64,
    key: String,
}
struct Candidate {
    day: usize,
    slot: u32,
    plan: Plan,
    displaced: BTreeSet<usize>,
}
struct Branch {
    mark: usize,
    added: Vec<(u32, usize)>,
}
struct Frame {
    unit: usize,
    // Dag och tidssteg ryms i byte; ingen lista av fulla Plan per väntande mål.
    slots: Vec<(u8, u8)>,
    next: usize,
    used: BTreeSet<usize>,
    branch: Option<Branch>,
}
struct Search<'a> {
    problem: &'a Problem,
    inst: &'a Inst,
    state: State<'a>,
    baseline: &'a HashMap<String, Placement>,
    before: &'a Metrics,
    exempt: Option<&'a str>,
    target: Option<(usize, usize, u32)>,
    deadline: Instant,
    protected: Vec<bool>,
    results: Vec<Ranked>,
    timed_out: bool,
    perfect: bool,
}

fn same(a: &Placement, b: &Placement) -> bool {
    if a.day != b.day || a.start_min != b.start_min {
        return false;
    }
    let mut ar = a.rooms.clone();
    ar.sort();
    let mut br = b.rooms.clone();
    br.sort();
    ar == br
}
fn distance(a: &Placement, day: u32, min: u32) -> u64 {
    (a.day as i64 * 1440 + a.start_min as i64 - day as i64 * 1440 - min as i64).unsigned_abs()
}
fn unchanged_rooms(old: &Placement, rooms: &[u16], p: &Problem) -> bool {
    let mut a = old.rooms.clone();
    a.sort();
    let mut b: Vec<_> = rooms
        .iter()
        .map(|&r| p.rooms[r as usize].id.clone())
        .collect();
    b.sort();
    a == b
}
fn placements(p: &Problem, inst: &Inst, state: &State) -> Vec<Placement> {
    let mut result = vec![None; p.lessons.len()];
    for (u, unit) in inst.units.iter().enumerate() {
        let Some((day, slot)) = state.pos[u] else {
            continue;
        };
        for part in &unit.parts {
            let rooms = state.rooms[u][part.room_off..part.room_off + part.room_count as usize]
                .iter()
                .map(|&r| p.rooms[r as usize].id.clone())
                .collect();
            result[part.lesson] = Some(Placement {
                lesson: p.lessons[part.lesson].id.clone(),
                day: day as u32,
                start_min: inst.slot_min(day as usize, slot as u32),
                rooms,
            });
        }
    }
    result.into_iter().flatten().collect()
}
fn seed(p: &Problem, inst: &Inst, baseline: &HashMap<String, Placement>) -> Snapshot {
    let room_ix: HashMap<_, _> = p
        .rooms
        .iter()
        .enumerate()
        .map(|(i, r)| (r.id.as_str(), i as u16))
        .collect();
    inst.units
        .iter()
        .map(|unit| {
            let Some(first) = baseline.get(&p.lessons[unit.parts[0].lesson].id) else {
                return (None, vec![0; unit.nrooms]);
            };
            let slot =
                (first.start_min - p.time.days[first.day as usize].start_min) / p.time.step_min;
            let mut rooms = Vec::new();
            for part in &unit.parts {
                let at = &baseline[&p.lessons[part.lesson].id];
                rooms.extend(at.rooms.iter().map(|r| room_ix[r.as_str()]));
            }
            (Some((first.day as u8, slot as u8)), rooms)
        })
        .collect()
}

impl<'a> Search<'a> {
    fn stop(&mut self) -> bool {
        if Instant::now() >= self.deadline {
            self.timed_out = true;
        }
        self.timed_out || self.perfect
    }
    fn displaced_parts(&self, u: usize, into: &mut BTreeSet<usize>) {
        for part in &self.inst.units[u].parts {
            let lesson = &self.problem.lessons[part.lesson].id;
            if self.baseline.contains_key(lesson) && self.exempt != Some(lesson.as_str()) {
                into.insert(part.lesson);
            }
        }
    }
    fn slots(&mut self, u: usize) -> Vec<(u8, u8)> {
        let unit = &self.inst.units[u];
        if unit.self_conflict.is_some() || unit.dom_size == 0 {
            return vec![];
        }
        let mut out = Vec::new();
        for day in 0..self.inst.days {
            let mut mask = unit.dom[day];
            while mask != 0 {
                if self.stop() {
                    return out;
                }
                let slot = mask.trailing_zeros();
                mask &= mask - 1;
                if self
                    .target
                    .is_some_and(|(target_u, d, s)| target_u == u && (d != day || s != slot))
                {
                    continue;
                }
                out.push((day as u8, slot as u8));
            }
        }
        out.sort_by_key(|&(day, slot)| {
            let min = self.inst.slot_min(day as usize, slot as u32);
            let dist: u64 = unit
                .parts
                .iter()
                .filter_map(|part| self.baseline.get(&self.problem.lessons[part.lesson].id))
                .map(|old| distance(old, day as u32, min))
                .sum();
            (dist, day, slot)
        });
        out
    }
    fn candidate(
        &self,
        u: usize,
        day: usize,
        slot: u32,
        used: &BTreeSet<usize>,
        budget: usize,
    ) -> Option<Candidate> {
        let unit = &self.inst.units[u];
        let mut plan = Plan::default();
        if !self.state.plan(u, day, slot, true, &mut plan)
            || plan.eject.iter().any(|&v| self.protected[v as usize])
        {
            return None;
        }
        let mut displaced = used.clone();
        let min = self.inst.slot_min(day, slot);
        for part in &unit.parts {
            let id = &self.problem.lessons[part.lesson].id;
            if let Some(old) = self.baseline.get(id) {
                let rooms = &plan.rooms[part.room_off..part.room_off + part.room_count as usize];
                if self.exempt != Some(id.as_str())
                    && (old.day != day as u32
                        || old.start_min != min
                        || !unchanged_rooms(old, rooms, self.problem))
                {
                    displaced.insert(part.lesson);
                }
            }
        }
        for &v in &plan.eject {
            self.displaced_parts(v as usize, &mut displaced);
        }
        if displaced.len() > budget {
            return None;
        }
        Some(Candidate {
            day,
            slot,
            plan,
            displaced,
        })
    }
    fn save(&mut self, budget: usize) {
        if self.stop() {
            return;
        }
        let mut after = placements(self.problem, self.inst, &self.state);
        let placed_ids: BTreeSet<_> = after.iter().map(|p| p.lesson.as_str()).collect();
        if self
            .baseline
            .keys()
            .any(|id| !placed_ids.contains(id.as_str()))
        {
            return;
        }
        // Bevara också salarnas ordning för helt oförändrade placeringar.
        for at in &mut after {
            if let Some(old) = self.baseline.get(&at.lesson).filter(|old| same(old, at)) {
                *at = old.clone();
            }
        }
        let changes: Vec<_> = after
            .iter()
            .filter_map(|at| {
                let from = self.baseline.get(&at.lesson);
                if from.is_some_and(|old| same(old, at)) {
                    None
                } else {
                    Some(SuggestionChange {
                        lesson: at.lesson.clone(),
                        from: from.cloned(),
                        to: at.clone(),
                    })
                }
            })
            .collect();
        if changes.is_empty() {
            return;
        }
        let extra = changes
            .iter()
            .filter(|c| c.from.is_some() && self.exempt != Some(c.lesson.as_str()))
            .count();
        if extra > budget {
            return;
        }
        let mut canonical = after.clone();
        canonical.sort_by(|a, b| a.lesson.cmp(&b.lesson));
        for at in &mut canonical {
            at.rooms.sort();
        }
        let key = serde_json::to_string(&canonical).expect("placeringar");
        if self.results.iter().any(|r| r.key == key) {
            return;
        }
        let report = match validate_before(self.problem, &after, self.deadline) {
            Ok(report) => report,
            Err(_) => {
                self.timed_out = true;
                return;
            }
        };
        if !report.ok() {
            return;
        }
        let moved = changes.iter().filter(|c| c.from.is_some()).count();
        let distance = changes
            .iter()
            .filter_map(|c| {
                c.from
                    .as_ref()
                    .map(|old| distance(old, c.to.day, c.to.start_min))
            })
            .sum();
        self.results.push(Ranked {
            suggestion: Suggestion {
                placements: after,
                changes,
                metrics_before: self.before.clone(),
                cost: report.metrics.cost,
                metrics_after: report.metrics,
            },
            moved,
            distance,
            key,
        });
        self.results.sort_by(|a, b| {
            a.moved
                .cmp(&b.moved)
                .then(a.distance.cmp(&b.distance))
                .then(a.suggestion.cost.cmp(&b.suggestion.cost))
                .then(a.key.cmp(&b.key))
        });
        self.results.truncate(MAX_SUGGESTIONS);
        // Fem alternativ som inte flyttar något redan lagt pass, saknar tidsförskjutning
        // och kostar noll är redan lägsta möjliga i dessa tre led för icke-negativa vikter.
        let w = &self.problem.weights;
        let nonnegative = [
            w.student_gap,
            w.teacher_gap,
            w.student_late,
            w.same_day,
            w.moved,
            w.room_moved,
        ]
        .iter()
        .all(|&w| w >= 0);
        self.perfect = nonnegative
            && self.results.len() == MAX_SUGGESTIONS
            && self
                .results
                .iter()
                .all(|r| r.moved == 0 && r.distance == 0 && r.suggestion.cost == 0);
    }
    fn undo_branch(&mut self, u: usize, branch: Branch, pending: &mut BTreeSet<(u32, usize)>) {
        self.protected[u] = false;
        self.state.rollback(branch.mark);
        for key in branch.added {
            pending.remove(&key);
        }
    }
    fn visit(&mut self, goals: &[usize], budget: usize) {
        let key = |u: usize| (self.inst.units[u].dom_size, u);
        let mut pending: BTreeSet<_> = goals.iter().map(|&u| key(u)).collect();
        let Some((_, first)) = pending.pop_first() else {
            self.save(budget);
            return;
        };
        let mut stack = vec![Frame {
            unit: first,
            slots: self.slots(first),
            next: 0,
            used: BTreeSet::new(),
            branch: None,
        }];
        while !stack.is_empty() && !self.stop() {
            let frame = stack.last_mut().expect("sökram");
            if frame.next >= frame.slots.len() {
                let done = stack.pop().expect("färdig ram");
                pending.insert((self.inst.units[done.unit].dom_size, done.unit));
                if let Some(parent) = stack.last_mut() {
                    let branch = parent.branch.take().expect("överordnat drag");
                    self.undo_branch(parent.unit, branch, &mut pending);
                }
                continue;
            }
            let u = frame.unit;
            let (day, slot) = frame.slots[frame.next];
            frame.next += 1;
            let Some(candidate) = self.candidate(u, day as usize, slot as u32, &frame.used, budget)
            else {
                continue;
            };
            let mark = self.state.mark();
            self.state
                .execute(u, candidate.day, candidate.slot, &candidate.plan);
            self.protected[u] = true;
            let mut added = Vec::new();
            for &v in &candidate.plan.eject {
                let key = (self.inst.units[v as usize].dom_size, v as usize);
                if pending.insert(key) {
                    added.push(key);
                }
            }
            let branch = Branch { mark, added };
            if pending.is_empty() {
                self.save(budget);
                self.undo_branch(u, branch, &mut pending);
            } else {
                frame.branch = Some(branch);
                let (_, next) = pending.pop_first().expect("väntande pass");
                stack.push(Frame {
                    unit: next,
                    slots: self.slots(next),
                    next: 0,
                    used: candidate.displaced,
                    branch: None,
                });
            }
        }
    }
}

fn baseline_error(report: Report) -> SuggestError {
    let mut violations: Vec<_> = report
        .violations
        .into_iter()
        .map(|v| Diagnosis {
            code: v.code.into(),
            message: v.message,
            lessons: v.lessons,
            resources: v.resources,
            proof: false,
        })
        .collect();
    if violations.len() > 500 {
        let more = violations.len() - 499;
        violations.truncate(499);
        violations.push(Diagnosis {
            code: "more_violations".into(),
            message: format!("Ytterligare {more} regelbrott finns i ursprungsplaceringen."),
            lessons: vec![],
            resources: vec![],
            proof: false,
        });
    }
    SuggestError {
        code: "invalid_baseline",
        violations,
    }
}

pub fn suggest(input: &SuggestionRequest) -> Result<Suggestions, SuggestError> {
    suggest_with_budget(input, SEARCH_BUDGET)
}

/// Lägre budget är bara för deterministiska avbrottsprov. HTTP erbjuder ingen större eller egen budget.
pub fn suggest_with_budget(
    input: &SuggestionRequest,
    budget: Duration,
) -> Result<Suggestions, SuggestError> {
    let start = Instant::now();
    let deadline = start + budget.min(SEARCH_BUDGET);
    let mut out = Suggestions {
        version: input.problem.version,
        problem_id: input.problem.id.clone(),
        depth: input.depth,
        timed_out: false,
        elapsed_ms: 0,
        suggestions: vec![],
    };
    if !supported_problem_version(input.problem.version) {
        return Err(SuggestError::code("version_mismatch"));
    }
    if !(1..=3).contains(&input.depth)
        || !match input.mode {
            SuggestionMode::Rest => input.lesson.is_none() && input.target.is_none(),
            SuggestionMode::Lesson => input.lesson.is_some() && input.target.is_none(),
            SuggestionMode::Target => input.lesson.is_some() && input.target.is_some(),
        }
    {
        return Err(SuggestError::code("bad_request"));
    }
    // Kontrollera tal som används i additions-/indexberäkningar innan den allmänna modellkontrollen.
    let bounded_times = input.problem.lessons.iter().all(|l| {
        l.duration_min <= 1440
            && l.locked.as_ref().is_none_or(|at| at.start_min <= 1440)
            && l.margin.as_ref().is_none_or(|m| {
                [m.students, m.teachers, m.rooms]
                    .iter()
                    .all(|s| s.before_min <= 1440 && s.after_min <= 1440)
            })
    }) && input
        .problem
        .time
        .days
        .iter()
        .all(|d| d.start_min <= 1440 && d.end_min <= 1440)
        && input.problem.rules.break_min <= 1440
        && input.problem.rules.lunch.as_ref().is_none_or(|l| {
            l.window_start_min <= 1440 && l.window_end_min <= 1440 && l.length_min <= 1440
        });
    if !bounded_times
        || input.problem.lessons.len() > 20_000
        || input.placements.len() > input.problem.lessons.len()
        || input.problem.time.days.len() > 7
        || !input.problem.check().is_empty()
    {
        return Err(SuggestError::code("bad_problem"));
    }
    let selected = input
        .lesson
        .as_ref()
        .map(|id| {
            input
                .problem
                .lessons
                .iter()
                .position(|l| &l.id == id)
                .ok_or_else(|| SuggestError::code("unknown_lesson"))
        })
        .transpose()?;
    let mut problem = input.problem.clone();
    // Jämför samtliga alternativ mot exakt den insända arbetsplaceringen.
    problem.reference = input.placements.clone();
    if let Some(at) = input.placements.iter().find(|at| at.start_min > 1440) {
        return Err(SuggestError {
            code: "invalid_baseline",
            violations: vec![Diagnosis {
                code: "outside_day".into(),
                message: format!("Pass {} har en starttid utanför dygnet.", at.lesson),
                lessons: vec![at.lesson.clone()],
                resources: vec![],
                proof: false,
            }],
        });
    }
    let before = match validate_before(&problem, &input.placements, deadline) {
        Ok(report) if report.ok() => report.metrics,
        Ok(report) => return Err(baseline_error(report)),
        Err(_) => {
            out.timed_out = true;
            out.elapsed_ms = start.elapsed().as_millis() as u64;
            return Ok(out);
        }
    };
    let baseline: HashMap<_, _> = input
        .placements
        .iter()
        .map(|p| (p.lesson.clone(), p.clone()))
        .collect();
    let mut inst = compile(&problem);
    let selected_unit = selected.map(|li| inst.lesson_unit[li]);
    if selected_unit.is_some_and(|u| {
        inst.units[u].locked
            && inst.units[u]
                .parts
                .iter()
                .any(|part| baseline.contains_key(&problem.lessons[part.lesson].id))
    }) {
        return Err(SuggestError::code("locked_lesson"));
    }
    let mut target = None;
    if let (Some(slot), Some(li), Some(u)) = (&input.target, selected, selected_unit) {
        let day = slot.day as usize;
        let Some(frame) = problem.time.days.get(day) else {
            return Err(SuggestError::code("bad_target"));
        };
        if slot.start_min < frame.start_min
            || slot
                .start_min
                .checked_add(problem.lessons[li].duration_min)
                .is_none_or(|end| end > frame.end_min)
            || (slot.start_min - frame.start_min) % problem.start_grid() != 0
        {
            return Err(SuggestError::code("bad_target"));
        }
        target = Some((
            u,
            day,
            (slot.start_min - frame.start_min) / problem.time.step_min,
        ));
        if !slot.rooms.is_empty() {
            let part = inst.units[u]
                .parts
                .iter_mut()
                .find(|part| part.lesson == li)
                .expect("valt pass");
            let mut chosen = Vec::new();
            for room in &slot.rooms {
                let Some(index) = problem.rooms.iter().position(|r| &r.id == room) else {
                    return Err(SuggestError::code("bad_target"));
                };
                if chosen.contains(&(index as u16)) || !part.cands.contains(&(index as u16)) {
                    return Err(SuggestError::code("bad_target"));
                }
                chosen.push(index as u16);
            }
            if chosen.len() != part.room_count as usize {
                return Err(SuggestError::code("bad_target"));
            }
            part.cands = chosen;
        }
    }
    let snapshot = seed(&problem, &inst, &baseline);
    let mut goals: Vec<_> = if let Some(u) = selected_unit {
        vec![u]
    } else {
        snapshot
            .iter()
            .enumerate()
            .filter_map(|(u, (at, _))| at.is_none().then_some(u))
            .collect()
    };
    if goals.is_empty() {
        out.elapsed_ms = start.elapsed().as_millis() as u64;
        return Ok(out);
    }
    if Instant::now() >= deadline {
        out.timed_out = true;
        out.elapsed_ms = start.elapsed().as_millis() as u64;
        return Ok(out);
    }
    goals.sort_by_key(|&u| (inst.units[u].dom_size, u));
    let mut state = State::new(&inst);
    state.restore(&snapshot);
    if let Some(u) = selected_unit {
        if state.pos[u].is_some() {
            state.unplace(u);
            state.commit();
        }
    }
    let mut search = Search {
        problem: &problem,
        inst: &inst,
        state,
        baseline: &baseline,
        before: &before,
        exempt: input.lesson.as_deref(),
        target,
        deadline,
        protected: vec![false; inst.units.len()],
        results: vec![],
        timed_out: false,
        perfect: false,
    };
    for limit in 0..=input.depth as usize {
        search.visit(&goals, limit);
        if search.stop() || search.results.len() == MAX_SUGGESTIONS {
            break;
        }
    }
    out.timed_out = search.timed_out;
    out.suggestions = search.results.into_iter().map(|r| r.suggestion).collect();
    out.elapsed_ms = start.elapsed().as_millis() as u64;
    Ok(out)
}
