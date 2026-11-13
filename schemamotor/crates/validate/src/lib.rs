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

// ---------------------------------------------------------------------------
// Möjliga starttider för ett pass (05.2-SM-LAGEN).
//
// Varje starttid prövas med `validate` ovan: passet läggs där, övriga pass
// ligger kvar, och det som bryts utöver det som redan var brutet utan passet
// är orsakerna. Ingen regel räknas här vid sidan av kontrollen; bara valet av
// ledig sal görs i förväg, och det valet prövas sedan av kontrollen.
// ---------------------------------------------------------------------------

/// Läget för en starttid.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PositionState {
    /// Inga brott och ingen högre kostnad än nu.
    Free,
    /// Inga brott, men högre kostnad: håltid, sen dag, samma dag eller flytt.
    Preference,
    /// Brotten gäller exakt ett annat pass, som kan ligga på passets nuvarande plats utan brott.
    Swap,
    /// En hård regel bryts.
    Violation,
    /// Egen spärr, låst pass eller utanför tillåtet fönster.
    Blocked,
}

/// Varför en starttid inte är fri. `resource_kind` och `resource` saknas för önskemål,
/// som gäller hela schemat.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct Reason {
    pub code: &'static str,
    /// `teacher`, `students`, `group`, `room`, `activity` eller `lesson`.
    pub resource_kind: Option<&'static str>,
    pub resource: Option<String>,
    /// Andra pass som berörs. Passet självt räknas inte upp.
    pub lessons: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct Position {
    pub day: u32,
    pub start_min: u32,
    /// Salen eller salarna starttiden prövades med.
    pub rooms: Vec<String>,
    pub state: PositionState,
    /// Kostnaden med passet här minus kostnaden nu (utan passet om det inte är lagt).
    pub cost_delta: i64,
    pub reasons: Vec<Reason>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PositionsError {
    UnknownLesson,
    /// Klustret finns inte, eller dess elever har inte passet.
    BadPupil,
}

const BLOCKING: &[&str] = &["outside_allowed", "teacher_unavailable", "group_unavailable", "room_unavailable", "lock_broken"];
const STUDENT: &[&str] = &["student_clash", "student_day_too_long", "student_no_lunch"];

fn resource_kind(code: &str) -> &'static str {
    match code {
        "teacher_clash" | "teacher_unavailable" | "teacher_day_too_long" | "teacher_no_lunch" => "teacher",
        "student_clash" | "student_day_too_long" | "student_no_lunch" => "students",
        "group_unavailable" => "group",
        "room_clash" | "room_unavailable" | "room_unfit" | "unknown_room" | "room_unwanted" => "room",
        "same_day" | "activity_time" => "activity",
        _ => "lesson",
    }
}

/// Klustren ett pass berör: gruppernas kluster, eller gruppen själv när den saknar kluster.
fn lesson_clusters(problem: &Problem, lesson: &Lesson) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    for g in &lesson.groups {
        if let Some(group) = problem.groups.iter().find(|x| &x.id == g) {
            if group.clusters.is_empty() {
                out.insert(format!("group:{}", group.id));
            } else {
                out.extend(group.clusters.iter().cloned());
            }
        }
    }
    out
}

/// Salar för passet vid en starttid: nuvarande sal om den är ledig, annars första lediga sal som passar.
/// Räcker inte lediga salar används nuvarande eller första som passar, och kontrollen redovisar krocken.
fn choose_rooms(problem: &Problem, lesson: &Lesson, others: &[Placement], day: u32, start: u32, preferred: &[String]) -> Vec<String> {
    let Some(req) = &lesson.rooms else { return vec![] };
    let end = start + lesson.duration_min;
    let fits = |id: &str| {
        let Some(room) = problem.rooms.iter().find(|r| r.id == id) else { return false };
        req.features.iter().all(|f| room.features.contains(f))
            && req.min_capacity.is_none_or(|c| room.capacity.is_some_and(|rc| rc >= c))
            && (req.allowed.is_empty() || req.allowed.iter().any(|a| a == id))
    };
    let free = |id: &str| {
        let room_free = problem.rooms.iter().find(|r| r.id == id).is_some_and(|r| !hits(&r.unavailable, day, start, end));
        room_free
            && !others.iter().any(|p| {
                p.day == day
                    && p.rooms.iter().any(|r| r == id)
                    && problem.lessons.iter().find(|l| l.id == p.lesson).is_some_and(|o| share_period(o, lesson) && overlaps(p.start_min, p.start_min + o.duration_min, start, end))
            })
    };
    let order: Vec<&str> = if req.allowed.is_empty() { problem.rooms.iter().map(|r| r.id.as_str()).collect() } else { req.allowed.iter().map(|s| s.as_str()).collect() };
    let count = req.count as usize;
    let mut chosen: Vec<String> = Vec::new();
    for id in preferred.iter().map(|s| s.as_str()).chain(order.iter().copied()) {
        if chosen.len() == count {
            break;
        }
        if !chosen.iter().any(|c| c == id) && fits(id) && free(id) {
            chosen.push(id.to_string());
        }
    }
    if chosen.len() < count {
        for id in preferred.iter().map(|s| s.as_str()).chain(order.iter().copied()) {
            if chosen.len() == count {
                break;
            }
            if !chosen.iter().any(|c| c == id) && fits(id) {
                chosen.push(id.to_string());
            }
        }
    }
    chosen
}

type Key = (&'static str, String);

/// Brotten i `report` som inte redan finns i `before`, och som gäller eleverna i `pupil` när ett kluster är valt.
fn added<'r>(report: &'r Report, before: &BTreeSet<Key>, problem: &Problem, pupil: Option<&str>) -> Vec<&'r Violation> {
    report
        .violations
        .iter()
        .filter(|v| !before.contains(&(v.code, v.message.clone())))
        .filter(|v| match pupil {
            None => true,
            Some(c) if STUDENT.contains(&v.code) => v.resources.iter().any(|r| r == c),
            Some(c) if v.code == "group_unavailable" => v.resources.iter().any(|g| problem.groups.iter().any(|x| &x.id == g && x.clusters.iter().any(|k| k == c))),
            Some(_) => true,
        })
        .collect()
}

fn keys(report: &Report) -> BTreeSet<Key> {
    report.violations.iter().map(|v| (v.code, v.message.clone())).collect()
}

fn reasons(found: &[&Violation], lesson: &str) -> Vec<Reason> {
    let mut out = Vec::new();
    for v in found {
        let lessons: Vec<String> = v.lessons.iter().filter(|x| *x != lesson).cloned().collect();
        let kind = resource_kind(v.code);
        if v.resources.is_empty() || kind == "lesson" {
            out.push(Reason { code: v.code, resource_kind: Some(kind), resource: None, lessons });
        } else {
            for r in &v.resources {
                out.push(Reason { code: v.code, resource_kind: Some(kind), resource: Some(r.clone()), lessons: lessons.clone() });
            }
        }
    }
    out
}

/// Önskemål som blir sämre: de delar av kostnaden som ökar.
fn preference_reasons(now: &Metrics, then: &Metrics, w: &Weights) -> Vec<Reason> {
    let parts: [(&'static str, bool, i64); 6] = [
        ("student_gap", then.student_gap_min > now.student_gap_min, w.student_gap),
        ("teacher_gap", then.teacher_gap_min > now.teacher_gap_min, w.teacher_gap),
        ("student_late", then.student_late_min > now.student_late_min, w.student_late),
        ("same_day_repeat", then.same_day_repeats > now.same_day_repeats, w.same_day),
        ("moved", then.moved_lessons > now.moved_lessons, w.moved),
        ("room_moved", then.room_moved_lessons > now.room_moved_lessons, w.room_moved),
    ];
    parts
        .iter()
        .filter(|(_, worse, weight)| *worse && *weight > 0)
        .map(|(code, _, _)| Reason { code, resource_kind: None, resource: None, lessons: vec![] })
        .collect()
}

/// Pröva varje starttid på startrutnätet där passet ryms i skoldagen, mot övriga pass som de ligger.
/// `pupil` är ett kluster: då räknas elevernas brott bara för det klustret.
pub fn positions(problem: &Problem, placements: &[Placement], lesson: &str, pupil: Option<&str>) -> Result<Vec<Position>, PositionsError> {
    let l = problem.lessons.iter().find(|x| x.id == lesson).ok_or(PositionsError::UnknownLesson)?;
    if let Some(c) = pupil {
        if !problem.clusters.iter().any(|x| x.id == c) || !lesson_clusters(problem, l).contains(c) {
            return Err(PositionsError::BadPupil);
        }
    }
    let current = placements.iter().find(|p| p.lesson == lesson).cloned();
    let base: Vec<Placement> = placements.iter().filter(|p| p.lesson != lesson).cloned().collect();
    let base_report = validate(problem, &base);
    let before = keys(&base_report);
    let now = match &current {
        Some(c) => {
            let mut all = base.clone();
            all.push(c.clone());
            validate(problem, &all).metrics
        }
        None => base_report.metrics.clone(),
    };
    let preferred: Vec<String> = current.as_ref().map(|c| c.rooms.clone()).unwrap_or_default();
    let grid = problem.start_grid().max(1);
    // Utan ett annat pass: vad som redan är brutet, en gång per pass.
    let mut without: HashMap<String, (Vec<Placement>, BTreeSet<Key>)> = HashMap::new();
    let mut out = Vec::new();

    for (d, frame) in problem.time.days.iter().enumerate() {
        let day = d as u32;
        let mut start = frame.start_min;
        while start + l.duration_min <= frame.end_min {
            let rooms = choose_rooms(problem, l, &base, day, start, &preferred);
            let here = Placement { lesson: lesson.to_string(), day, start_min: start, rooms: rooms.clone() };
            let mut cand = base.clone();
            cand.push(here.clone());
            let report = validate(problem, &cand);
            let found = added(&report, &before, problem, pupil);
            let cost_delta = report.metrics.cost - now.cost;
            let state = if found.iter().any(|v| BLOCKING.contains(&v.code)) {
                PositionState::Blocked
            } else if !found.is_empty() {
                // Byte: alla brott pekar ut samma andra pass, och inget annat.
                let others: BTreeSet<&String> = found.iter().flat_map(|v| v.lessons.iter()).filter(|x| *x != lesson).collect();
                let single = others.len() == 1 && found.iter().all(|v| v.lessons.iter().any(|x| x != lesson));
                let swap = match (&current, single) {
                    (Some(old), true) => {
                        let other = others.into_iter().next().unwrap();
                        let (rest, rest_keys) = without.entry(other.clone()).or_insert_with(|| {
                            let rest: Vec<Placement> = base.iter().filter(|p| &p.lesson != other).cloned().collect();
                            let k = keys(&validate(problem, &rest));
                            (rest, k)
                        });
                        match (problem.lessons.iter().find(|x| &x.id == other), base.iter().find(|p| &p.lesson == other)) {
                            (Some(m), Some(at)) => {
                                let mut swapped = rest.clone();
                                swapped.push(here.clone());
                                let m_rooms = choose_rooms(problem, m, &swapped, old.day, old.start_min, &at.rooms);
                                swapped.push(Placement { lesson: other.clone(), day: old.day, start_min: old.start_min, rooms: m_rooms });
                                added(&validate(problem, &swapped), rest_keys, problem, pupil).is_empty()
                            }
                            _ => false,
                        }
                    }
                    _ => false,
                };
                if swap {
                    PositionState::Swap
                } else {
                    PositionState::Violation
                }
            } else if cost_delta > 0 {
                PositionState::Preference
            } else {
                PositionState::Free
            };
            let why = match state {
                PositionState::Free => vec![],
                PositionState::Preference => preference_reasons(&now, &report.metrics, &problem.weights),
                _ => reasons(&found, lesson),
            };
            out.push(Position { day, start_min: start, rooms, state, cost_delta, reasons: why });
            start += grid;
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Två dagar 08–12 med starttid varje hel timme. Pass `a` (lärare t1, grupp g1 = kluster k1 och k3) ska prövas.
    /// `b` delar kluster k3 med `a`; `c` delar lärare t1 och är låst. Lärare t1 är spärrad dag 1 från 10.
    fn school() -> (Problem, Vec<Placement>) {
        let problem: Problem = serde_json::from_value(serde_json::json!({
            "version": 1, "id": "lagen",
            "time": {"step_min": 5, "start_grid_min": 60, "days": [{"start_min": 480, "end_min": 720}, {"start_min": 480, "end_min": 720}]},
            "teachers": [{"id": "t1", "unavailable": [{"day": 1, "start_min": 600, "end_min": 720}]}, {"id": "t2"}],
            "clusters": [{"id": "k1", "size": 10}, {"id": "k2", "size": 10}, {"id": "k3", "size": 10}],
            "groups": [{"id": "g1", "clusters": ["k1", "k3"]}, {"id": "g2", "clusters": ["k2"]}, {"id": "g3", "clusters": ["k3"]}],
            "lessons": [
                {"id": "a", "duration_min": 60, "teachers": ["t1"], "groups": ["g1"]},
                {"id": "b", "duration_min": 60, "teachers": ["t2"], "groups": ["g3"]},
                {"id": "c", "duration_min": 60, "teachers": ["t1"], "groups": ["g2"], "locked": {"day": 1, "start_min": 480}}
            ],
            "rules": {"break_min": 0, "lunch": null, "same_day": "allow"}, "weights": {"late_after_min": null}
        }))
        .unwrap();
        let at = |lesson: &str, day, start_min| Placement { lesson: lesson.into(), day, start_min, rooms: vec![] };
        (problem, vec![at("a", 0, 480), at("b", 0, 540), at("c", 1, 480)])
    }

    fn at(list: &[Position], day: u32, start_min: u32) -> &Position {
        list.iter().find(|p| p.day == day && p.start_min == start_min).unwrap()
    }

    #[test]
    fn every_start_on_the_grid_gets_a_state() {
        let (problem, placed) = school();
        let list = positions(&problem, &placed, "a", None).unwrap();
        assert_eq!(list.len(), 8);
        // Nuvarande plats och en tom tid utan håltid: fri, utan orsaker.
        for (day, start) in [(0, 480), (0, 600), (1, 540)] {
            let p = at(&list, day, start);
            assert_eq!(p.state, PositionState::Free, "{day} {start}: {p:?}");
            assert!(p.reasons.is_empty() && p.cost_delta <= 0);
        }
    }

    #[test]
    fn a_planted_clash_is_a_violation_with_the_right_resource() {
        let (problem, placed) = school();
        let list = positions(&problem, &placed, "a", None).unwrap();
        let p = at(&list, 1, 480);
        assert_eq!(p.state, PositionState::Violation);
        assert_eq!(p.reasons, vec![Reason { code: "teacher_clash", resource_kind: Some("teacher"), resource: Some("t1".into()), lessons: vec!["c".into()] }]);
    }

    #[test]
    fn a_blocked_time_is_blocked() {
        let (problem, placed) = school();
        let list = positions(&problem, &placed, "a", None).unwrap();
        for start in [600, 660] {
            let p = at(&list, 1, start);
            assert_eq!(p.state, PositionState::Blocked);
            assert!(p.reasons.iter().any(|r| r.code == "teacher_unavailable" && r.resource.as_deref() == Some("t1")));
        }
    }

    #[test]
    fn a_single_lesson_that_can_trade_places_gives_a_swap() {
        let (problem, placed) = school();
        let list = positions(&problem, &placed, "a", None).unwrap();
        let p = at(&list, 0, 540);
        assert_eq!(p.state, PositionState::Swap);
        assert_eq!(p.reasons.len(), 1);
        assert_eq!((p.reasons[0].code, p.reasons[0].resource.as_deref(), &p.reasons[0].lessons), ("student_clash", Some("k3"), &vec!["b".to_string()]));
        // Utan nuvarande plats finns inget att byta med.
        let unplaced: Vec<Placement> = placed.iter().filter(|x| x.lesson != "a").cloned().collect();
        assert_eq!(at(&positions(&problem, &unplaced, "a", None).unwrap(), 0, 540).state, PositionState::Violation);
    }

    #[test]
    fn a_gap_breaks_a_preference_with_a_higher_cost() {
        let (problem, placed) = school();
        let list = positions(&problem, &placed, "a", None).unwrap();
        let p = at(&list, 0, 660);
        assert_eq!(p.state, PositionState::Preference);
        assert!(p.cost_delta > 0);
        assert_eq!(p.reasons.iter().map(|r| r.code).collect::<Vec<_>>(), vec!["student_gap"]);
    }

    #[test]
    fn one_cluster_only_counts_its_own_clashes() {
        let (problem, placed) = school();
        let list = positions(&problem, &placed, "a", Some("k1")).unwrap();
        let p = at(&list, 0, 540);
        assert!(matches!(p.state, PositionState::Free | PositionState::Preference), "{p:?}");
        assert!(p.reasons.iter().all(|r| r.code != "student_clash"));
        // Lärarens krock gäller fortfarande.
        assert_eq!(at(&list, 1, 480).state, PositionState::Violation);
        assert_eq!(positions(&problem, &placed, "a", Some("k2")), Err(PositionsError::BadPupil));
        assert_eq!(positions(&problem, &placed, "a", Some("finns-inte")), Err(PositionsError::BadPupil));
        assert_eq!(positions(&problem, &placed, "x", None), Err(PositionsError::UnknownLesson));
    }

    #[test]
    fn a_free_room_is_chosen_and_a_taken_one_is_reported() {
        let (mut problem, mut placed) = school();
        problem.rooms = vec![
            Room { id: "r1".into(), capacity: None, features: vec![], unavailable: vec![] },
            Room { id: "r2".into(), capacity: None, features: vec![], unavailable: vec![] },
        ];
        for id in ["a", "b"] {
            problem.lessons.iter_mut().find(|l| l.id == id).unwrap().rooms = Some(RoomRequirement { count: 1, features: vec![], min_capacity: None, allowed: vec![] });
        }
        placed[0].rooms = vec!["r1".into()];
        placed[1].rooms = vec!["r1".into()];
        let list = positions(&problem, &placed, "a", Some("k1")).unwrap();
        // b har r1 måndag 09: a får r2 där, och r1 annars.
        assert_eq!(at(&list, 0, 540).rooms, vec!["r2".to_string()]);
        assert_eq!(at(&list, 0, 600).rooms, vec!["r1".to_string()]);
        // Bara r1 tillåten: salen är upptagen.
        problem.lessons[0].rooms.as_mut().unwrap().allowed = vec!["r1".into()];
        let list = positions(&problem, &placed, "a", Some("k1")).unwrap();
        let p = at(&list, 0, 540);
        assert_eq!(p.state, PositionState::Swap);
        assert!(p.reasons.iter().any(|r| r.code == "room_clash" && r.resource_kind == Some("room") && r.resource.as_deref() == Some("r1")));
    }
}
