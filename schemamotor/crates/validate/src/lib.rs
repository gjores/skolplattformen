//! Oberoende regelkontroll.
//!
//! Kontrollen delar datatyper med lösaren men ingen logik. Den räknar i minuter
//! och jämför pass parvis, utan lösarens bitmasker och index. Appen kör den på
//! varje förslag innan något sparas. Ett förslag med minst ett brott ska avvisas.

use schemamotor_model::*;
use std::collections::{BTreeMap, BTreeSet, HashMap};

#[derive(Clone, Debug, PartialEq)]
pub struct Violation {
    pub code: &'static str,
    pub message: String,
    pub lessons: Vec<String>,
    pub resources: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Report {
    pub violations: Vec<Violation>,
    pub metrics: Metrics,
}

impl Report {
    pub fn ok(&self) -> bool {
        self.violations.is_empty()
    }
}

#[derive(Clone)]
struct Placed<'a> {
    lesson: &'a Lesson,
    day: u32,
    start: u32,
    end: u32,
    rooms: &'a [String],
}

fn share_period(a: &Lesson, b: &Lesson) -> bool {
    a.periods.is_empty() || b.periods.is_empty() || a.periods.iter().any(|p| b.periods.contains(p))
}

fn in_period(l: &Lesson, period: Option<&str>) -> bool {
    match period {
        None => true,
        Some(p) => l.periods.is_empty() || l.periods.iter().any(|x| x == p),
    }
}

fn overlaps(a_start: u32, a_end: u32, b_start: u32, b_end: u32) -> bool {
    a_start < b_end && b_start < a_end
}

fn hits(ivs: &[Interval], day: u32, start: u32, end: u32) -> bool {
    ivs.iter().any(|iv| iv.day == day && overlaps(iv.start_min, iv.end_min, start, end))
}

/// Kontrollera placeringarna mot underlagets hårda regler och räkna utfallet.
pub fn validate(problem: &Problem, placements: &[Placement]) -> Report {
    let mut v: Vec<Violation> = Vec::new();
    let lessons: HashMap<&str, &Lesson> = problem.lessons.iter().map(|l| (l.id.as_str(), l)).collect();
    let rooms: HashMap<&str, &Room> = problem.rooms.iter().map(|r| (r.id.as_str(), r)).collect();
    let groups: HashMap<&str, &Group> = problem.groups.iter().map(|g| (g.id.as_str(), g)).collect();
    let teachers: HashMap<&str, &Teacher> = problem.teachers.iter().map(|t| (t.id.as_str(), t)).collect();
    let mut cluster_size: HashMap<String, u32> = problem.clusters.iter().map(|c| (c.id.clone(), c.size)).collect();
    let grid = problem.start_grid();
    let brk = problem.rules.break_min;

    let mut placed: BTreeMap<&str, Placed> = BTreeMap::new();
    for p in placements {
        let Some(lesson) = lessons.get(p.lesson.as_str()).copied() else {
            v.push(Violation { code: "unknown_lesson", message: format!("Placeringen gäller okänt pass {}.", p.lesson), lessons: vec![p.lesson.clone()], resources: vec![] });
            continue;
        };
        let one = Placed { lesson, day: p.day, start: p.start_min, end: p.start_min + lesson.duration_min, rooms: &p.rooms };
        if placed.insert(lesson.id.as_str(), one).is_some() {
            v.push(Violation { code: "placed_twice", message: format!("Pass {} är placerat flera gånger.", lesson.id), lessons: vec![lesson.id.clone()], resources: vec![] });
        }
    }

    // Varje pass för sig.
    for p in placed.values() {
        let l = p.lesson;
        let id = || vec![l.id.clone()];
        let Some(day) = problem.time.days.get(p.day as usize) else {
            v.push(Violation { code: "outside_day", message: format!("Pass {} ligger på en dag som inte finns.", l.id), lessons: id(), resources: vec![] });
            continue;
        };
        if p.start < day.start_min || p.end > day.end_min {
            v.push(Violation { code: "outside_day", message: format!("Pass {} ligger utanför skoldagen.", l.id), lessons: id(), resources: vec![] });
        } else if (p.start - day.start_min) % grid != 0 {
            v.push(Violation { code: "off_grid", message: format!("Pass {} börjar utanför startrutnätet.", l.id), lessons: id(), resources: vec![] });
        }
        if !l.allowed.is_empty() && !l.allowed.iter().any(|iv| iv.day == p.day && iv.start_min <= p.start && p.end <= iv.end_min) {
            v.push(Violation { code: "outside_allowed", message: format!("Pass {} ligger utanför sina tillåtna fönster.", l.id), lessons: id(), resources: vec![] });
        }
        if let Some(lock) = &l.locked {
            let mut want: Vec<&String> = lock.rooms.iter().collect();
            let mut have: Vec<&String> = p.rooms.iter().collect();
            want.sort();
            have.sort();
            if lock.day != p.day || lock.start_min != p.start || (!want.is_empty() && want != have) {
                v.push(Violation { code: "lock_broken", message: format!("Pass {} är låst men har flyttats.", l.id), lessons: id(), resources: vec![] });
            }
        }
        for t in &l.teachers {
            if let Some(teacher) = teachers.get(t.as_str()) {
                if hits(&teacher.unavailable, p.day, p.start, p.end) {
                    v.push(Violation { code: "teacher_unavailable", message: format!("Pass {} ligger när lärare {t} inte är tillgänglig.", l.id), lessons: id(), resources: vec![t.clone()] });
                }
            }
        }
        for g in &l.groups {
            if let Some(group) = groups.get(g.as_str()) {
                if hits(&group.unavailable, p.day, p.start, p.end) {
                    v.push(Violation { code: "group_unavailable", message: format!("Pass {} ligger när grupp {g} inte är tillgänglig.", l.id), lessons: id(), resources: vec![g.clone()] });
                }
            }
        }
        match &l.rooms {
            None => {
                if !p.rooms.is_empty() {
                    v.push(Violation { code: "room_unwanted", message: format!("Pass {} har fått en sal utan att begära någon.", l.id), lessons: id(), resources: p.rooms.to_vec() });
                }
            }
            Some(req) => {
                let distinct: BTreeSet<&String> = p.rooms.iter().collect();
                if distinct.len() != p.rooms.len() || p.rooms.len() as u32 != req.count {
                    v.push(Violation { code: "room_count", message: format!("Pass {} ska ha {} sal(ar) men har {}.", l.id, req.count, distinct.len()), lessons: id(), resources: vec![] });
                }
                for r in p.rooms.iter() {
                    let Some(room) = rooms.get(r.as_str()) else {
                        v.push(Violation { code: "unknown_room", message: format!("Pass {} har fått okänd sal {r}.", l.id), lessons: id(), resources: vec![r.clone()] });
                        continue;
                    };
                    let fits = req.features.iter().all(|f| room.features.contains(f))
                        && req.min_capacity.is_none_or(|c| room.capacity.is_some_and(|rc| rc >= c))
                        && (req.allowed.is_empty() || req.allowed.contains(r));
                    if !fits {
                        v.push(Violation { code: "room_unfit", message: format!("Sal {r} uppfyller inte kraven för pass {}.", l.id), lessons: id(), resources: vec![r.clone()] });
                    }
                    if hits(&room.unavailable, p.day, p.start, p.end) {
                        v.push(Violation { code: "room_unavailable", message: format!("Pass {} ligger när sal {r} inte är tillgänglig.", l.id), lessons: id(), resources: vec![r.clone()] });
                    }
                }
            }
        }
    }

    // Vilka pass som hör till varje lärare, kluster och sal.
    let mut by_teacher: BTreeMap<&str, Vec<&Placed>> = BTreeMap::new();
    let mut by_cluster: BTreeMap<String, Vec<&Placed>> = BTreeMap::new();
    let mut by_room: BTreeMap<&str, Vec<&Placed>> = BTreeMap::new();
    for p in placed.values() {
        for t in &p.lesson.teachers {
            by_teacher.entry(t.as_str()).or_default().push(p);
        }
        let mut mine: BTreeSet<String> = BTreeSet::new();
        for g in &p.lesson.groups {
            match groups.get(g.as_str()) {
                Some(group) if !group.clusters.is_empty() => mine.extend(group.clusters.iter().cloned()),
                Some(group) => {
                    let key = format!("group:{}", group.id);
                    cluster_size.entry(key.clone()).or_insert(group.size.unwrap_or(1));
                    mine.insert(key);
                }
                None => {}
            }
        }
        for c in mine {
            by_cluster.entry(c).or_default().push(p);
        }
        for r in p.rooms {
            by_room.entry(r.as_str()).or_default().push(p);
        }
    }

    let clash = |kind: &'static str, code: &'static str, res: &str, list: &[&Placed], gap: u32, v: &mut Vec<Violation>| {
        for (i, a) in list.iter().enumerate() {
            for b in &list[i + 1..] {
                if a.day == b.day && share_period(a.lesson, b.lesson) && overlaps(a.start, a.end + gap, b.start, b.end + gap) {
                    let what = if overlaps(a.start, a.end, b.start, b.end) { "krockar" } else { "ligger för tätt" };
                    v.push(Violation { code, message: format!("Pass {} och {} {what} för {kind} {res}.", a.lesson.id, b.lesson.id), lessons: vec![a.lesson.id.clone(), b.lesson.id.clone()], resources: vec![res.to_string()] });
                }
            }
        }
    };
    for (t, list) in &by_teacher {
        clash("lärare", "teacher_clash", t, list, brk, &mut v);
    }
    for (c, list) in &by_cluster {
        clash("elever i", "student_clash", c, list, brk, &mut v);
    }
    for (r, list) in &by_room {
        clash("sal", "room_clash", r, list, 0, &mut v);
    }

    for (i, link) in problem.links.iter().enumerate() {
        let members: Vec<Option<&Placed>> = link.lessons.iter().map(|id| placed.get(id.as_str())).collect();
        match link.kind {
            LinkKind::Simultaneous => {
                let some: Vec<&Placed> = members.iter().flatten().copied().collect();
                let split = !some.is_empty() && some.len() != members.len();
                let apart = some.windows(2).any(|w| w[0].day != w[1].day || w[0].start != w[1].start);
                if split || apart {
                    v.push(Violation { code: "not_simultaneous", message: format!("Koppling {i}: passen ska gå samtidigt men gör det inte."), lessons: link.lessons.clone(), resources: vec![] });
                }
            }
            LinkKind::NoOverlap => {
                let some: Vec<&Placed> = members.iter().flatten().copied().collect();
                for (k, a) in some.iter().enumerate() {
                    for b in &some[k + 1..] {
                        if a.day == b.day && share_period(a.lesson, b.lesson) && overlaps(a.start, a.end, b.start, b.end) {
                            v.push(Violation { code: "overlap_forbidden", message: format!("Pass {} och {} får inte överlappa.", a.lesson.id, b.lesson.id), lessons: vec![a.lesson.id.clone(), b.lesson.id.clone()], resources: vec![] });
                        }
                    }
                }
            }
        }
    }

    // Per period: lunch, dagsgränser, samma dag och utfall.
    let period_ids: Vec<Option<&str>> = if problem.periods.is_empty() { vec![None] } else { problem.periods.iter().map(|p| Some(p.id.as_str())).collect() };
    let n_days = problem.time.days.len() as u32;
    let mut m = Metrics { lessons: problem.lessons.len() as u32, ..Metrics::default() };
    let w = &problem.weights;
    let lunch = problem.rules.lunch.as_ref();

    // Sammanslagna upptagna intervall för en part, en period och en dag.
    let busy = |list: &[&Placed], period: Option<&str>, day: u32| -> Vec<(u32, u32)> {
        let mut ivs: Vec<(u32, u32)> = list.iter().filter(|p| p.day == day && in_period(p.lesson, period)).map(|p| (p.start, p.end)).collect();
        ivs.sort();
        let mut merged: Vec<(u32, u32)> = Vec::new();
        for (s, e) in ivs {
            match merged.last_mut() {
                Some(last) if s < last.1 => last.1 = last.1.max(e),
                _ => merged.push((s, e)),
            }
        }
        merged
    };
    let lunch_free = |ivs: &[(u32, u32)], l: &Lunch| -> bool {
        // Finns en ledig sträcka på minst length_min i fönstret?
        let mut cursor = l.window_start_min;
        for &(s, e) in ivs {
            if e <= cursor {
                continue;
            }
            if s >= l.window_end_min {
                break;
            }
            if s > cursor && s - cursor >= l.length_min {
                return true;
            }
            cursor = cursor.max(e);
        }
        cursor < l.window_end_min && l.window_end_min - cursor >= l.length_min
    };
    let gaps = |ivs: &[(u32, u32)], with_lunch: bool| -> u32 {
        let mut counted = 0u32;
        let mut lunch_gap = false;
        for pair in ivs.windows(2) {
            let (s, e) = (pair[0].1, pair[1].0);
            counted += (e - s).saturating_sub(brk);
            if let (true, Some(l)) = (with_lunch, lunch) {
                let lo = s.max(l.window_start_min);
                let hi = e.min(l.window_end_min);
                if hi > lo && hi - lo >= l.length_min {
                    lunch_gap = true;
                }
            }
        }
        if let (true, Some(l)) = (lunch_gap, lunch) {
            counted = counted.saturating_sub(l.length_min.saturating_sub(brk));
        }
        counted
    };

    for &period in &period_ids {
        for day in 0..n_days {
            for (t, list) in &by_teacher {
                let ivs = busy(list, period, day);
                if ivs.is_empty() {
                    continue;
                }
                let total: u32 = ivs.iter().map(|(s, e)| e - s).sum();
                if let Some(max) = teachers.get(t).and_then(|x| x.max_min_per_day) {
                    if total > max {
                        v.push(Violation { code: "teacher_day_too_long", message: format!("Lärare {t} har {total} min undervisning dag {day}, högst {max} är tillåtet."), lessons: vec![], resources: vec![t.to_string()] });
                    }
                }
                let with_lunch = lunch.is_some_and(|l| l.teachers);
                if with_lunch && !lunch_free(&ivs, lunch.unwrap()) {
                    v.push(Violation { code: "teacher_no_lunch", message: format!("Lärare {t} saknar lunch dag {day}."), lessons: vec![], resources: vec![t.to_string()] });
                }
                m.teacher_gap_min += gaps(&ivs, with_lunch) as u64;
            }
            for (c, list) in &by_cluster {
                let ivs = busy(list, period, day);
                if ivs.is_empty() {
                    continue;
                }
                let size = *cluster_size.get(c).unwrap_or(&1) as u64;
                let total: u32 = ivs.iter().map(|(s, e)| e - s).sum();
                if let Some(max) = problem.rules.student_max_min_per_day {
                    if total > max {
                        v.push(Violation { code: "student_day_too_long", message: format!("Eleverna i {c} har {total} min undervisning dag {day}, högst {max} är tillåtet."), lessons: vec![], resources: vec![c.clone()] });
                    }
                }
                if let Some(l) = lunch {
                    if !lunch_free(&ivs, l) {
                        v.push(Violation { code: "student_no_lunch", message: format!("Eleverna i {c} saknar lunch dag {day}."), lessons: vec![], resources: vec![c.clone()] });
                    }
                }
                m.student_gap_min += gaps(&ivs, lunch.is_some()) as u64 * size;
                if let Some(late) = w.late_after_min {
                    let end = ivs.last().unwrap().1;
                    m.student_late_min += end.saturating_sub(late) as u64 * size;
                }
            }
        }
        // Samma aktivitet flera gånger samma dag.
        let mut per_activity: BTreeMap<(&str, u32), Vec<&str>> = BTreeMap::new();
        for p in placed.values() {
            if let (Some(a), true) = (&p.lesson.activity, in_period(p.lesson, period)) {
                per_activity.entry((a.as_str(), p.day)).or_default().push(p.lesson.id.as_str());
            }
        }
        for ((a, day), ids) in per_activity {
            if ids.len() < 2 {
                continue;
            }
            let rule = problem.activities.iter().find(|x| x.id == a).and_then(|x| x.same_day).unwrap_or(problem.rules.same_day);
            match rule {
                SameDay::Forbid => v.push(Violation { code: "same_day", message: format!("Aktivitet {a} har flera pass dag {day}."), lessons: ids.iter().map(|s| s.to_string()).collect(), resources: vec![] }),
                SameDay::Avoid => m.same_day_repeats += ids.len() as u32 - 1,
                SameDay::Allow => {}
            }
        }
    }
    // Aktiviteternas tid, när alla deras pass i perioden är placerade.
    for a in &problem.activities {
        for t in &a.time {
            let own: Vec<&Lesson> = problem.lessons.iter().filter(|l| l.activity.as_deref() == Some(a.id.as_str()) && in_period(l, t.period.as_deref())).collect();
            if own.is_empty() || own.iter().any(|l| !placed.contains_key(l.id.as_str())) {
                continue;
            }
            let sum = t.minutes(own.iter().map(|l| (l.counted(), placed[l.id.as_str()].day)));
            if sum < t.min_min || sum > t.max_min {
                let period = t.period.as_ref().map_or(String::new(), |x| format!(" i period {x}"));
                v.push(Violation {
                    code: "activity_time",
                    message: format!("Aktivitet {} får {sum} min{period} men ska ha {}–{} min.", a.id, t.min_min, t.max_min),
                    lessons: own.iter().map(|l| l.id.clone()).collect(),
                    resources: vec![a.id.clone()],
                });
            }
        }
    }
    // Samma brott kan upptäckas i flera perioder.
    let mut seen = BTreeSet::new();
    v.retain(|x| seen.insert((x.code, x.message.clone())));

    let reference: HashMap<&str, &Placement> = problem.reference.iter().map(|p| (p.lesson.as_str(), p)).collect();
    for l in &problem.lessons {
        match placed.get(l.id.as_str()) {
            Some(p) => {
                m.placed_lessons += 1;
                m.placed_min += l.duration_min as u64;
                if let Some(r) = reference.get(l.id.as_str()) {
                    let mut a: Vec<&String> = r.rooms.iter().collect();
                    let mut b: Vec<&String> = p.rooms.iter().collect();
                    a.sort();
                    b.sort();
                    if r.day != p.day || r.start_min != p.start {
                        m.moved_lessons += 1;
                    } else if a != b {
                        m.room_moved_lessons += 1;
                    }
                }
            }
            None => {
                m.unplaced_lessons += 1;
                m.unplaced_min += l.duration_min as u64;
            }
        }
    }
    m.cost = m.student_gap_min as i64 * w.student_gap
        + m.teacher_gap_min as i64 * w.teacher_gap
        + m.student_late_min as i64 * w.student_late
        + m.same_day_repeats as i64 * w.same_day
        + m.moved_lessons as i64 * w.moved
        + m.room_moved_lessons as i64 * w.room_moved;

    Report { violations: v, metrics: m }
}

/// Kontrollera ett helt resultat: placeringarna, att resultatet hör till
/// underlaget, och att dess besked och utfall stämmer med kontrollens egna.
pub fn validate_solution(problem: &Problem, solution: &Solution) -> Report {
    let mut report = validate(problem, &solution.placements);
    let time_broken = report.violations.iter().any(|x| x.code == "activity_time");
    let mut push = |code: &'static str, message: String| report.violations.push(Violation { code, message, lessons: vec![], resources: vec![] });
    if solution.problem_hash != problem.hash() {
        push("stale", "Resultatet är beräknat på ett annat underlag.".into());
    }
    if solution.metrics != report.metrics {
        push("metrics_mismatch", "Resultatets utfall stämmer inte med kontrollens.".into());
    }
    if solution.status == Status::Complete && report.metrics.unplaced_lessons > 0 {
        push("status_mismatch", "Resultatet anges som komplett men har oplacerade pass.".into());
    }
    if solution.status == Status::Complete && time_broken {
        push("status_mismatch", "Resultatet anges som komplett men en aktivitet får fel tid.".into());
    }
    let placed: BTreeSet<&str> = solution.placements.iter().map(|p| p.lesson.as_str()).collect();
    let unplaced: BTreeSet<&str> = solution.unplaced.iter().map(|s| s.as_str()).collect();
    let all_accounted = problem.lessons.iter().all(|l| placed.contains(l.id.as_str()) != unplaced.contains(l.id.as_str()));
    if !all_accounted || placed.len() + unplaced.len() != problem.lessons.len() {
        push("unaccounted", "Varje pass ska vara antingen placerat eller oplacerat.".into());
    }
    report
}
