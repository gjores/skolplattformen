//! Översätter underlaget till lösarens indexerade form.
//!
//! En dag är ett 128-bitarsord där bit `i` är tidssteget som börjar
//! `i * step_min` efter dagens start. Pass som ska gå samtidigt slås ihop till
//! en enhet som placeras som en helhet.

use schemamotor_model::*;
use std::collections::HashMap;

pub const NO_ROOM: u16 = u16::MAX;

#[derive(Clone, Debug)]
pub struct Part {
    pub lesson: usize,
    pub len: u8,
    pub room_count: u8,
    /// Salar som uppfyller kravet, de minst generella först.
    pub cands: Vec<u16>,
    /// Var partens salar börjar i enhetens salslista.
    pub room_off: usize,
    pub reference: Option<(u8, u8)>,
    pub ref_rooms: Vec<u16>,
    /// Salens marginal före och efter passet, i steg.
    pub room_margin: (u8, u8),
}

#[derive(Clone, Debug)]
pub struct Unit {
    pub parts: Vec<Part>,
    /// Periodmask.
    pub pm: u32,
    /// Lärare och kluster med längsta längd i enheten.
    pub ents: Vec<(u32, u8)>,
    /// Marginal före och efter passet i steg, per post i `ents`.
    pub ent_margin: Vec<(u8, u8)>,
    /// Virtuella resurser från kopplingar av typen `no_overlap`.
    pub virt: Vec<(u32, u8)>,
    /// Aktiviteter med antal pass i enheten.
    pub acts: Vec<(u32, u16)>,
    /// Tillåtna starttider per dag.
    pub dom: Vec<u128>,
    pub dom_size: u32,
    pub locked: bool,
    pub dur_min: u32,
    pub nrooms: usize,
    /// Tidsregler som enheten bidrar till, med enhetens minuter i aktiviteten.
    pub time: Vec<(u32, i64)>,
    /// Enheten bryter mot en regel i sig själv (text för diagnos).
    pub self_conflict: Option<String>,
}

/// En aktivitets tid i en eller flera perioder (`ActivityTime`).
pub struct TimeRule {
    pub act: usize,
    pub period: Option<String>,
    pub days: Vec<i64>,
    pub min: i64,
    pub max: i64,
}

impl TimeRule {
    /// Minuter utanför det tillåtna intervallet.
    pub fn dev(&self, sum: i64) -> i64 {
        (self.min - sum).max(0) + (sum - self.max).max(0)
    }

    /// Avvikelsen i sökningens kostnad: en minut under timplanen väger som
    /// fyra minuter över, så att ett schema som inte når intervallet hellre
    /// ger för mycket tid än för lite.
    pub fn cost(&self, sum: i64) -> i64 {
        4 * (self.min - sum).max(0) + (sum - self.max).max(0)
    }
}

pub struct Inst {
    pub step: u32,
    pub pad: u32,
    pub days: usize,
    pub periods: usize,
    pub nslots: Vec<u32>,
    pub day_start: Vec<u32>,
    pub n_teachers: usize,
    pub n_ents: usize,
    pub n_rooms: usize,
    pub n_res: usize,
    pub ent_size: Vec<i64>,
    pub ent_gap_w: Vec<i64>,
    /// Högsta antal undervisningssteg per dag.
    pub ent_max: Vec<u32>,
    pub ent_lunch: Vec<bool>,
    /// Lunchfönster per dag och lunchens längd i steg.
    pub lunch_win: Vec<u128>,
    pub lunch_len: u32,
    /// Steget där en sen dag börjar, per dag.
    pub late_slot: Option<Vec<i64>>,
    pub room_block: Vec<u128>,
    /// Något pass har marginal. Utan marginal är upptagen tid med marginal densamma som undervisningen.
    pub has_margin: bool,
    pub units: Vec<Unit>,
    pub lesson_unit: Vec<usize>,
    pub res_names: Vec<String>,
    pub act_rule: Vec<SameDay>,
    /// Enheter per resurs (lärare, kluster, virtuella; inte salar).
    pub res_units: Vec<Vec<u32>>,
    pub act_units: Vec<Vec<u32>>,
    pub times: Vec<TimeRule>,
    /// Enheter per tidsregel.
    pub time_units: Vec<Vec<u32>>,
    pub w: Weights,
}

pub fn span(start: u32, len: u32) -> u128 {
    if len == 0 || start >= 128 {
        return 0;
    }
    let ones = if len >= 128 { u128::MAX } else { (1u128 << len) - 1 };
    ones << start
}

impl Inst {
    pub fn is_teacher(&self, ent: usize) -> bool {
        ent < self.n_teachers
    }
    pub fn room_res(&self, room: u16) -> usize {
        self.n_ents + room as usize
    }
    pub fn slot_min(&self, day: usize, slot: u32) -> u32 {
        self.day_start[day] + slot * self.step
    }
    pub fn unit_label(&self, p: &Problem, u: usize) -> String {
        let ids: Vec<&str> = self.units[u].parts.iter().map(|x| p.lessons[x.lesson].id.as_str()).collect();
        ids.join(" + ")
    }
    pub fn unit_lessons(&self, p: &Problem, u: usize) -> Vec<String> {
        self.units[u].parts.iter().map(|x| p.lessons[x.lesson].id.clone()).collect()
    }
}

fn hits(ivs: &[Interval], day: u32, start: u32, end: u32) -> bool {
    ivs.iter().any(|iv| iv.day == day && iv.start_min < end && start < iv.end_min)
}

/// Förutsätter att `Problem::check` inte gav några fel.
pub fn compile(p: &Problem) -> Inst {
    let step = p.time.step_min;
    let grid = p.start_grid();
    let pad = p.rules.break_min / step;
    let days = p.time.days.len();
    let periods = p.period_count();
    let all_periods: u32 = if periods >= 32 { u32::MAX } else { (1u32 << periods) - 1 };
    let period_ix: HashMap<&str, usize> = p.periods.iter().enumerate().map(|(i, x)| (x.id.as_str(), i)).collect();
    let teacher_ix: HashMap<&str, usize> = p.teachers.iter().enumerate().map(|(i, x)| (x.id.as_str(), i)).collect();
    let room_ix: HashMap<&str, usize> = p.rooms.iter().enumerate().map(|(i, x)| (x.id.as_str(), i)).collect();
    let group_ix: HashMap<&str, usize> = p.groups.iter().enumerate().map(|(i, x)| (x.id.as_str(), i)).collect();
    let act_ix: HashMap<&str, usize> = p.activities.iter().enumerate().map(|(i, x)| (x.id.as_str(), i)).collect();
    let lesson_ix: HashMap<&str, usize> = p.lessons.iter().enumerate().map(|(i, x)| (x.id.as_str(), i)).collect();

    // Kluster: de angivna, plus ett eget för varje grupp utan kluster.
    let n_teachers = p.teachers.len();
    let mut cluster_names: Vec<String> = p.clusters.iter().map(|c| c.id.clone()).collect();
    let mut cluster_size: Vec<i64> = p.clusters.iter().map(|c| c.size as i64).collect();
    let cluster_ix: HashMap<&str, usize> = p.clusters.iter().enumerate().map(|(i, x)| (x.id.as_str(), i)).collect();
    let mut group_clusters: Vec<Vec<usize>> = Vec::with_capacity(p.groups.len());
    for g in &p.groups {
        if g.clusters.is_empty() {
            cluster_names.push(format!("group:{}", g.id));
            cluster_size.push(g.size.unwrap_or(1) as i64);
            group_clusters.push(vec![cluster_names.len() - 1]);
        } else {
            group_clusters.push(g.clusters.iter().map(|c| cluster_ix[c.as_str()]).collect());
        }
    }
    let n_ents = n_teachers + cluster_names.len();
    let n_rooms = p.rooms.len();

    let lunch = p.rules.lunch.as_ref();
    let mut ent_size = vec![1i64; n_teachers];
    ent_size.extend(cluster_size.iter().copied());
    let mut ent_gap_w = vec![p.weights.teacher_gap; n_teachers];
    ent_gap_w.extend(cluster_size.iter().map(|s| s * p.weights.student_gap));
    let mut ent_max: Vec<u32> = p.teachers.iter().map(|t| t.max_min_per_day.map_or(u32::MAX, |m| m / step)).collect();
    ent_max.extend(cluster_names.iter().map(|_| p.rules.student_max_min_per_day.map_or(u32::MAX, |m| m / step)));
    let mut ent_lunch = vec![lunch.is_some_and(|l| l.teachers); n_teachers];
    ent_lunch.extend(cluster_names.iter().map(|_| lunch.is_some()));

    let day_start: Vec<u32> = p.time.days.iter().map(|d| d.start_min).collect();
    let nslots: Vec<u32> = p.time.days.iter().map(|d| (d.end_min - d.start_min) / step).collect();
    let lunch_win: Vec<u128> = p
        .time
        .days
        .iter()
        .map(|d| match lunch {
            None => 0,
            Some(l) => {
                let lo = l.window_start_min.max(d.start_min);
                let hi = l.window_end_min;
                if hi <= lo {
                    0
                } else {
                    let a = (lo - d.start_min) / step;
                    let b = ((hi - d.start_min) / step).min(128);
                    if b > a { span(a, b - a) } else { 0 }
                }
            }
        })
        .collect();
    let late_slot = p.weights.late_after_min.map(|m| p.time.days.iter().map(|d| (m as i64 - d.start_min as i64) / step as i64).collect());

    let mut room_block = vec![0u128; n_rooms * days];
    for (r, room) in p.rooms.iter().enumerate() {
        for iv in &room.unavailable {
            let d = iv.day as usize;
            let ds = day_start[d];
            let a = iv.start_min.max(ds);
            if iv.end_min > a {
                let s = (a - ds) / step;
                let e = ((iv.end_min - ds) / step).min(128);
                if e > s {
                    room_block[r * days + d] |= span(s, e - s);
                }
            }
        }
    }
    // Salar i ordning efter hur generella de är: få egenskaper och liten först.
    let mut room_order: Vec<usize> = (0..n_rooms).collect();
    room_order.sort_by_key(|&r| (p.rooms[r].features.len(), p.rooms[r].capacity.unwrap_or(u32::MAX), r));

    // Enheter: samtidighetskopplingar slår ihop pass.
    let mut unit_of: Vec<usize> = (0..p.lessons.len()).collect();
    for link in p.links.iter().filter(|l| l.kind == LinkKind::Simultaneous) {
        let first = lesson_ix[link.lessons[0].as_str()];
        for id in &link.lessons[1..] {
            unit_of[lesson_ix[id.as_str()]] = first;
        }
    }
    let mut members: Vec<Vec<usize>> = vec![Vec::new(); p.lessons.len()];
    for (l, &u) in unit_of.iter().enumerate() {
        members[u].push(l);
    }
    let reference: HashMap<&str, &Placement> = p.reference.iter().map(|x| (x.lesson.as_str(), x)).collect();

    let mut n_virtual = 0usize;
    let mut lesson_virt: Vec<Vec<usize>> = vec![Vec::new(); p.lessons.len()];
    for link in p.links.iter().filter(|l| l.kind == LinkKind::NoOverlap) {
        for id in &link.lessons {
            lesson_virt[lesson_ix[id.as_str()]].push(n_virtual);
        }
        n_virtual += 1;
    }
    let n_res = n_ents + n_rooms + n_virtual;

    let mut units: Vec<Unit> = Vec::new();
    let mut lesson_unit = vec![0usize; p.lessons.len()];
    for group in members.into_iter().filter(|m| !m.is_empty()) {
        let ui = units.len();
        let first = &p.lessons[group[0]];
        let pm = if first.periods.is_empty() { all_periods } else { first.periods.iter().fold(0u32, |m, x| m | 1 << period_ix[x.as_str()]) };
        let mut parts = Vec::new();
        let mut ents: Vec<(u32, u8)> = Vec::new();
        let mut ent_margin: Vec<(u8, u8)> = Vec::new();
        let mut virt: Vec<(u32, u8)> = Vec::new();
        let mut acts: Vec<(u32, u16)> = Vec::new();
        let mut nrooms = 0usize;
        let mut self_conflict = None;
        let mut locked: Option<(u32, u32)> = None;
        for &li in &group {
            lesson_unit[li] = ui;
            let l = &p.lessons[li];
            let len = (l.duration_min / step) as u8;
            let steps = |m: MarginSide| ((m.before_min / step) as u8, (m.after_min / step) as u8);
            let (tm, sm) = (steps(l.margin_for(MarginPart::Teachers)), steps(l.margin_for(MarginPart::Students)));
            let mut mine: Vec<u32> = l.teachers.iter().map(|t| teacher_ix[t.as_str()] as u32).collect();
            for g in &l.groups {
                mine.extend(group_clusters[group_ix[g.as_str()]].iter().map(|&c| (n_teachers + c) as u32));
            }
            mine.sort();
            mine.dedup();
            for e in mine {
                if ents.iter().any(|x| x.0 == e) {
                    let name = if (e as usize) < n_teachers { format!("lärare {}", p.teachers[e as usize].id) } else { format!("elever i {}", cluster_names[e as usize - n_teachers]) };
                    self_conflict = Some(format!("passen ska gå samtidigt men delar {name}"));
                } else {
                    ents.push((e, len));
                    ent_margin.push(if (e as usize) < n_teachers { tm } else { sm });
                }
            }
            for &v in &lesson_virt[li] {
                let res = (n_ents + n_rooms + v) as u32;
                if virt.iter().any(|x| x.0 == res) {
                    self_conflict = Some("passen ska gå samtidigt men får enligt en annan koppling inte överlappa".into());
                } else {
                    virt.push((res, len));
                }
            }
            if let Some(a) = &l.activity {
                let a = act_ix[a.as_str()] as u32;
                match acts.iter_mut().find(|x| x.0 == a) {
                    Some(x) => x.1 += 1,
                    None => acts.push((a, 1)),
                }
            }
            let (mut room_count, mut cands) = (0u8, Vec::new());
            if let Some(req) = &l.rooms {
                room_count = req.count as u8;
                cands = room_order
                    .iter()
                    .copied()
                    .filter(|&r| {
                        let room = &p.rooms[r];
                        req.features.iter().all(|f| room.features.contains(f))
                            && req.min_capacity.is_none_or(|c| room.capacity.is_some_and(|rc| rc >= c))
                            && (req.allowed.is_empty() || req.allowed.contains(&room.id))
                    })
                    .map(|r| r as u16)
                    .collect();
            }
            if let Some(lock) = &l.locked {
                locked = Some((lock.day, (lock.start_min - day_start[lock.day as usize]) / step));
                if !lock.rooms.is_empty() {
                    let want: Vec<u16> = lock.rooms.iter().map(|r| room_ix[r.as_str()] as u16).collect();
                    if l.rooms.is_none() || want.len() != room_count as usize || want.iter().any(|r| !cands.contains(r)) {
                        self_conflict = Some("de låsta salarna uppfyller inte passets salskrav".into());
                    }
                    cands = want;
                }
            }
            let r = reference.get(l.id.as_str());
            let ref_pos = r.and_then(|r| {
                let d = r.day as usize;
                (d < days && r.start_min >= day_start[d] && (r.start_min - day_start[d]) % step == 0 && (r.start_min - day_start[d]) / step < 128).then(|| (d as u8, ((r.start_min - day_start[d]) / step) as u8))
            });
            let ref_rooms: Vec<u16> = r.map(|r| r.rooms.iter().filter_map(|x| room_ix.get(x.as_str()).map(|&i| i as u16)).collect()).unwrap_or_default();
            parts.push(Part { lesson: li, len, room_count, cands, room_off: nrooms, reference: ref_pos, ref_rooms, room_margin: steps(l.margin_for(MarginPart::Rooms)) });
            nrooms += room_count as usize;
        }

        // Statisk domän, räknad i minuter.
        let mut dom = vec![0u128; days];
        for d in 0..days {
            let day = &p.time.days[d];
            for i in 0..nslots[d] {
                let start = day.start_min + i * step;
                if (start - day.start_min) % grid != 0 {
                    continue;
                }
                if let Some((ld, ls)) = locked {
                    if ld as usize != d || ls != i {
                        continue;
                    }
                }
                let ok = group.iter().all(|&li| {
                    let l = &p.lessons[li];
                    let end = start + l.duration_min;
                    // Passet och dess marginal ryms i skoldagen; marginalen räknas i lärarnas och gruppernas otillgängliga tid.
                    let (outer, tm, gm) = (l.outer_margin(), l.margin_for(MarginPart::Teachers), l.margin_for(MarginPart::Students));
                    start >= day.start_min + outer.before_min
                        && end + outer.after_min <= day.end_min
                        && (l.allowed.is_empty() || l.allowed.iter().any(|iv| iv.day as usize == d && iv.start_min <= start && end <= iv.end_min))
                        && !l.teachers.iter().any(|t| hits(&p.teachers[teacher_ix[t.as_str()]].unavailable, d as u32, start - tm.before_min, end + tm.after_min))
                        && !l.groups.iter().any(|g| hits(&p.groups[group_ix[g.as_str()]].unavailable, d as u32, start - gm.before_min, end + gm.after_min))
                });
                if ok {
                    dom[d] |= 1u128 << i;
                }
            }
        }
        let dom_size = dom.iter().map(|m| m.count_ones()).sum();
        let dur_min = group.iter().map(|&li| p.lessons[li].duration_min).sum();
        if acts.iter().any(|&(a, n)| n > 1 && p.activities[a as usize].same_day.unwrap_or(p.rules.same_day) == SameDay::Forbid) {
            self_conflict = Some("passen ska gå samtidigt men hör till samma aktivitet, som bara får ha ett pass per dag".into());
        }
        units.push(Unit { parts, pm, ents, ent_margin, virt, acts, dom, dom_size, locked: locked.is_some(), dur_min, nrooms, time: Vec::new(), self_conflict });
    }

    // Tidsregler: varje enhet bidrar med sina pass i aktiviteten, i de perioder den går.
    let mut times: Vec<TimeRule> = Vec::new();
    let mut act_times: Vec<Vec<(usize, u32)>> = vec![Vec::new(); p.activities.len()];
    for (a, act) in p.activities.iter().enumerate() {
        for t in &act.time {
            let pm = t.period.as_ref().map_or(all_periods, |x| 1 << period_ix[x.as_str()]);
            act_times[a].push((times.len(), pm));
            times.push(TimeRule { act: a, period: t.period.clone(), days: t.weekday_days.iter().map(|&n| n as i64).collect(), min: t.min_min as i64, max: t.max_min as i64 });
        }
    }
    for unit in units.iter_mut() {
        for part in &unit.parts {
            let Some(a) = p.lessons[part.lesson].activity.as_ref().map(|a| act_ix[a.as_str()]) else { continue };
            for &(r, pm) in &act_times[a] {
                if unit.pm & pm == 0 {
                    continue;
                }
                let dur = p.lessons[part.lesson].counted() as i64;
                match unit.time.iter_mut().find(|x| x.0 == r as u32) {
                    Some(x) => x.1 += dur,
                    None => unit.time.push((r as u32, dur)),
                }
            }
        }
    }

    let mut time_units: Vec<Vec<u32>> = vec![Vec::new(); times.len()];
    for (u, unit) in units.iter().enumerate() {
        for &(r, _) in &unit.time {
            time_units[r as usize].push(u as u32);
        }
    }

    let mut res_units: Vec<Vec<u32>> = vec![Vec::new(); n_res];
    let mut act_units: Vec<Vec<u32>> = vec![Vec::new(); p.activities.len()];
    for (u, unit) in units.iter().enumerate() {
        for &(r, _) in unit.ents.iter().chain(unit.virt.iter()) {
            res_units[r as usize].push(u as u32);
        }
        for &(a, _) in &unit.acts {
            act_units[a as usize].push(u as u32);
        }
    }
    let mut res_names: Vec<String> = p.teachers.iter().map(|t| t.id.clone()).collect();
    res_names.extend(cluster_names.iter().cloned());
    res_names.extend(p.rooms.iter().map(|r| r.id.clone()));
    res_names.extend((0..n_virtual).map(|v| format!("koppling {v}")));

    Inst {
        step,
        pad,
        days,
        periods,
        nslots,
        day_start,
        n_teachers,
        n_ents,
        n_rooms,
        n_res,
        ent_size,
        ent_gap_w,
        ent_max,
        ent_lunch,
        lunch_win,
        lunch_len: lunch.map_or(0, |l| l.length_min / step),
        late_slot,
        room_block,
        has_margin: p.lessons.iter().any(|l| !l.outer_margin().is_zero()),
        units,
        lesson_unit,
        res_names,
        act_rule: p.activities.iter().map(|a| a.same_day.unwrap_or(p.rules.same_day)).collect(),
        res_units,
        act_units,
        times,
        time_units,
        w: p.weights.clone(),
    }
}
