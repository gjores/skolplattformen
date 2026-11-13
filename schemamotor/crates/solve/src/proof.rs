//! Bevis och förklaringar.
//!
//! Ett bevis (`proof: true`) bygger alltid på en förenkling av underlaget där
//! regler tagits bort. Går inte ens förenklingen att lösa är underlaget olösbart.
//! Övriga diagnoser beskriver vad som stod i vägen, utan att bevisa något.

use crate::compile::*;
use crate::state::*;
use schemamotor_model::*;
use std::collections::{BTreeMap, BTreeSet};

fn ent_label(inst: &Inst, ent: usize) -> String {
    if inst.is_teacher(ent) { format!("Lärare {}", inst.res_names[ent]) } else { format!("Eleverna i {}", inst.res_names[ent]) }
}

fn diag(code: &str, message: String, lessons: Vec<String>, resources: Vec<String>, proof: bool) -> Diagnosis {
    Diagnosis { code: code.into(), message, lessons, resources, proof }
}

/// Antal möjliga starttider för ett pass när vissa hinder bortses från.
fn starts(p: &Problem, l: &Lesson, teachers: bool, groups: bool, windows: bool) -> u32 {
    let step = p.time.step_min;
    let grid = p.start_grid();
    let hit = |ivs: &[Interval], d: u32, s: u32, e: u32| ivs.iter().any(|iv| iv.day == d && iv.start_min < e && s < iv.end_min);
    let mut n = 0;
    for (d, day) in p.time.days.iter().enumerate() {
        let d = d as u32;
        let mut s = day.start_min;
        while s + l.duration_min <= day.end_min {
            let e = s + l.duration_min;
            let ok = (s - day.start_min) % grid == 0
                && (!windows || l.allowed.is_empty() || l.allowed.iter().any(|iv| iv.day == d && iv.start_min <= s && e <= iv.end_min))
                && (!teachers || !l.teachers.iter().any(|t| p.teachers.iter().find(|x| &x.id == t).is_some_and(|x| hit(&x.unavailable, d, s, e))))
                && (!groups || !l.groups.iter().any(|g| p.groups.iter().find(|x| &x.id == g).is_some_and(|x| hit(&x.unavailable, d, s, e))));
            if ok {
                n += 1;
            }
            s += step;
        }
    }
    n
}

/// Bevis som går att göra före sökningen.
pub fn presolve(p: &Problem, inst: &Inst) -> Vec<Diagnosis> {
    let mut out = Vec::new();
    let step = inst.step;
    for (u, unit) in inst.units.iter().enumerate() {
        let label = inst.unit_label(p, u);
        if let Some(why) = &unit.self_conflict {
            out.push(diag("self_conflict", format!("Pass {label} kan inte läggas ut: {why}."), inst.unit_lessons(p, u), vec![], true));
            continue;
        }
        if unit.dom_size == 0 {
            let mut why = Vec::new();
            let mut res = Vec::new();
            for part in &unit.parts {
                let l = &p.lessons[part.lesson];
                if starts(p, l, false, false, false) == 0 {
                    why.push(format!("pass {} på {} min ryms inte i någon skoldag", l.id, l.duration_min));
                } else if starts(p, l, false, false, true) == 0 {
                    why.push(format!("de tillåtna fönstren för pass {} rymmer inte passet", l.id));
                } else if starts(p, l, true, false, true) == 0 {
                    why.push(format!("lärarna ({}) är inte tillgängliga någon tid som passar pass {}", l.teachers.join(", "), l.id));
                    res.extend(l.teachers.iter().cloned());
                } else if starts(p, l, true, true, true) == 0 {
                    why.push(format!("grupperna ({}) är inte tillgängliga någon tid som passar pass {}", l.groups.join(", "), l.id));
                    res.extend(l.groups.iter().cloned());
                }
            }
            if why.is_empty() {
                why.push(if unit.locked { "den låsta tiden bryter mot passets egna villkor".into() } else { "passens villkor har ingen gemensam tid".into() });
            }
            out.push(diag("no_possible_time", format!("Pass {label} har ingen möjlig starttid: {}.", why.join("; ")), inst.unit_lessons(p, u), res, true));
            continue;
        }
        for part in &unit.parts {
            if (part.cands.len() as u32) < part.room_count as u32 {
                let l = &p.lessons[part.lesson];
                out.push(diag("no_room", format!("Pass {} behöver {} sal(ar) som uppfyller kraven, men det finns {}.", l.id, part.room_count, part.cands.len()), vec![l.id.clone()], vec![], true));
            }
        }
        // Samtidiga pass delar på salarna: varje salsbehov måste få en egen sal.
        if unit.parts.len() > 1 && unit.parts.iter().all(|x| x.cands.len() >= x.room_count as usize) && !rooms_match(unit, inst.n_rooms) {
            out.push(diag("no_room", format!("De samtidiga passen {} behöver tillsammans {} salar, men de passande salarna räcker inte till alla på en gång.", inst.unit_label(p, u), unit.nrooms), inst.unit_lessons(p, u), vec![], true));
        }
    }

    // Låsta pass mot varandra.
    let mut st = State::new(inst);
    let mut plan = Plan::default();
    for (u, unit) in inst.units.iter().enumerate() {
        if !unit.locked || unit.dom_size == 0 || unit.self_conflict.is_some() {
            continue;
        }
        let d = (0..inst.days).find(|&d| unit.dom[d] != 0).unwrap();
        let s = unit.dom[d].trailing_zeros();
        if st.plan(u, d, s, false, &mut plan) {
            st.place(u, d, s, &plan.rooms);
        } else {
            out.push(diag("locked_conflict", format!("Det låsta passet {} krockar med andra låsta pass eller bryter mot en dagsregel på sin låsta tid.", inst.unit_label(p, u)), inst.unit_lessons(p, u), vec![], true));
        }
    }

    // Tid: en lärare eller ett kluster kan inte undervisa mer än sin möjliga tid.
    for ent in 0..inst.n_ents {
        for per in 0..inst.periods {
            let mut need = 0u32;
            let mut cover = vec![0u128; inst.days];
            let mut who = Vec::new();
            for &u in &inst.res_units[ent] {
                let unit = &inst.units[u as usize];
                if unit.pm >> per & 1 == 0 || unit.dom_size == 0 || unit.self_conflict.is_some() {
                    continue;
                }
                let len = unit.ents.iter().find(|x| x.0 as usize == ent).unwrap().1 as u32;
                need += len;
                who.push(u as usize);
                for d in 0..inst.days {
                    for k in 0..len {
                        cover[d] |= unit.dom[d] << k;
                    }
                }
            }
            let avail: u32 = cover.iter().map(|m| m.count_ones().min(inst.ent_max[ent])).sum();
            if need > avail {
                let lessons = who.iter().flat_map(|&u| inst.unit_lessons(p, u)).collect();
                out.push(diag(
                    "too_little_time",
                    format!("{} har {} min undervisning att lägga ut men bara {} min möjlig tid.", ent_label(inst, ent), need * step, avail * step),
                    lessons,
                    vec![inst.res_names[ent].clone()],
                    true,
                ));
                break;
            }
        }
    }

    // Salar: pass som bara kan använda samma salar får inte kräva mer än salarnas tid.
    for per in 0..inst.periods {
        let mut by_set: BTreeMap<Vec<u16>, (u32, Vec<String>)> = BTreeMap::new();
        for unit in &inst.units {
            if unit.pm >> per & 1 == 0 {
                continue;
            }
            for part in unit.parts.iter().filter(|x| x.room_count > 0 && !x.cands.is_empty()) {
                let mut key = part.cands.clone();
                key.sort();
                let e = by_set.entry(key).or_default();
                e.0 += part.len as u32 * part.room_count as u32;
                e.1.push(p.lessons[part.lesson].id.clone());
            }
        }
        for (set, (need, lessons)) in by_set {
            let avail: u32 = set.iter().map(|&r| (0..inst.days).map(|d| (span(0, inst.nslots[d]) & !inst.room_block[r as usize * inst.days + d]).count_ones()).sum::<u32>()).sum();
            if need > avail {
                let names: Vec<String> = set.iter().map(|&r| inst.res_names[inst.room_res(r)].clone()).collect();
                out.push(diag("too_little_room_time", format!("Passen behöver {} min i salarna {} men salarna har bara {} min tillgänglig tid.", need * step, names.join(", "), avail * step), lessons, names, true));
            }
        }
        if !out.is_empty() && out.iter().any(|d| d.code == "too_little_room_time") {
            break;
        }
    }
    // Aktiviteternas tid: med passens längd och de veckodagar de kan ligga på
    // går tiden bara att få mellan `lo` och `hi`.
    for (r, rule) in inst.times.iter().enumerate() {
        let (mut lo, mut hi) = (0i64, 0i64);
        let mut lessons = Vec::new();
        for (u, unit) in inst.units.iter().enumerate() {
            let Some(&(_, m)) = unit.time.iter().find(|x| x.0 == r as u32) else { continue };
            let days: Vec<i64> = (0..inst.days).filter(|&d| unit.dom[d] != 0).map(|d| rule.days[d]).collect();
            if days.is_empty() {
                continue;
            }
            lo += m * days.iter().min().unwrap();
            hi += m * days.iter().max().unwrap();
            lessons.extend(inst.unit_lessons(p, u));
        }
        if lessons.is_empty() {
            continue;
        }
        let act = &p.activities[rule.act].id;
        let period = rule.period.as_ref().map_or(String::new(), |x| format!(" i period {x}"));
        if hi < rule.min {
            out.push(diag("activity_time", format!("Aktivitet {act} kan få högst {hi} min{period} men ska ha minst {} min.", rule.min), lessons, vec![act.clone()], true));
        } else if lo > rule.max {
            out.push(diag("activity_time", format!("Aktivitet {act} får minst {lo} min{period} men ska ha högst {} min.", rule.max), lessons, vec![act.clone()], true));
        }
    }
    out
}

struct Sub<'a> {
    inst: &'a Inst,
    units: Vec<usize>,
    /// Par som kan krocka: (i, j, längd i, längd j, rast).
    pairs: Vec<Vec<(usize, u32, u32, u32)>>,
    forbid: Vec<Vec<usize>>,
    nodes: u64,
    limit: u64,
}

impl<'a> Sub<'a> {
    fn new(inst: &'a Inst, mut units: Vec<usize>, limit: u64) -> Self {
        units.sort_by_key(|&u| (inst.units[u].dom_size, u));
        let n = units.len();
        let mut pairs = vec![Vec::new(); n];
        let mut forbid = vec![Vec::new(); n];
        for i in 0..n {
            for j in 0..i {
                let (a, b) = (&inst.units[units[i]], &inst.units[units[j]]);
                if a.pm & b.pm == 0 {
                    continue;
                }
                for &(r, la) in &a.ents {
                    if let Some(x) = b.ents.iter().find(|x| x.0 == r) {
                        pairs[i].push((j, la as u32, x.1 as u32, inst.pad));
                    }
                }
                for &(r, la) in &a.virt {
                    if let Some(x) = b.virt.iter().find(|x| x.0 == r) {
                        pairs[i].push((j, la as u32, x.1 as u32, 0));
                    }
                }
                if a.acts.iter().any(|x| inst.act_rule[x.0 as usize] == SameDay::Forbid && b.acts.iter().any(|y| y.0 == x.0)) {
                    forbid[i].push(j);
                }
            }
        }
        Sub { inst, units, pairs, forbid, nodes: 0, limit }
    }

    /// `Some(true)` lösbart, `Some(false)` bevisat olösbart, `None` gränsen nådd.
    fn solve(&mut self, i: usize, at: &mut Vec<(usize, u32)>) -> Option<bool> {
        if i == self.units.len() {
            return Some(true);
        }
        let inst = self.inst;
        let unit = &inst.units[self.units[i]];
        for d in 0..inst.days {
            let mut m = unit.dom[d];
            while m != 0 {
                let s = m.trailing_zeros();
                m &= m - 1;
                self.nodes += 1;
                if self.nodes > self.limit {
                    return None;
                }
                let clash = self.pairs[i].iter().any(|&(j, la, lb, pad)| {
                    let (jd, js) = at[j];
                    jd == d && s < js + lb + pad && js < s + la + pad
                }) || self.forbid[i].iter().any(|&j| at[j].0 == d);
                if clash {
                    continue;
                }
                at.push((d, s));
                let r = self.solve(i + 1, at);
                at.pop();
                if r != Some(false) {
                    return r;
                }
            }
        }
        Some(false)
    }
}

fn feasible(inst: &Inst, units: &[usize], limit: u64) -> Option<bool> {
    let mut sub = Sub::new(inst, units.to_vec(), limit);
    sub.solve(0, &mut Vec::new())
}

/// Förklara de pass som blev över. Försöker först bevisa att passet och dess
/// grannar inte går ihop; annars redovisas vad som oftast stod i vägen.
pub fn explain_unplaced(p: &Problem, inst: &Inst, st: &State, proved: &[Diagnosis]) -> Vec<Diagnosis> {
    let mut out: Vec<Diagnosis> = Vec::new();
    let already: BTreeSet<&str> = proved.iter().flat_map(|d| d.lessons.iter().map(|s| s.as_str())).collect();
    let mut seen_sets: BTreeSet<Vec<usize>> = BTreeSet::new();
    let mut budget = 40usize;
    let mut plan = Plan::default();
    for u in 0..inst.units.len() {
        if st.pos[u].is_some() {
            continue;
        }
        let unit = &inst.units[u];
        let lessons = inst.unit_lessons(p, u);
        if lessons.iter().any(|l| already.contains(l.as_str())) {
            continue;
        }
        let mut done = false;
        for &(ent, _) in &unit.ents {
            if budget == 0 || done {
                break;
            }
            let set: Vec<usize> = inst.res_units[ent as usize].iter().map(|&x| x as usize).filter(|&x| inst.units[x].dom_size > 0).collect();
            if set.len() > 40 {
                continue;
            }
            budget -= 1;
            if feasible(inst, &set, 300_000) != Some(false) {
                continue;
            }
            // Krymp till en minsta mängd som fortfarande är olösbar.
            let mut core = set.clone();
            let mut k = 0;
            while k < core.len() {
                let mut without = core.clone();
                without.remove(k);
                if !without.is_empty() && feasible(inst, &without, 100_000) == Some(false) {
                    core = without;
                } else {
                    k += 1;
                }
            }
            core.sort();
            done = true;
            if seen_sets.insert(core.clone()) {
                let names: Vec<String> = core.iter().map(|&x| inst.unit_label(p, x)).collect();
                out.push(diag(
                    "conflict_set",
                    format!("Passen {} kan inte läggas ut tillsammans: {} har för lite möjlig tid när passens villkor och raster räknas in.", names.join(", "), ent_label(inst, ent as usize).to_lowercase()),
                    core.iter().flat_map(|&x| inst.unit_lessons(p, x)).collect(),
                    vec![inst.res_names[ent as usize].clone()],
                    true,
                ));
            }
        }
        if done {
            continue;
        }
        // Ingen bevisning: räkna vad som står i vägen på de möjliga starttiderna.
        let mut blocked: BTreeMap<usize, u32> = BTreeMap::new();
        let mut room_blocked = 0u32;
        let mut other = 0u32;
        for d in 0..inst.days {
            let mut m = unit.dom[d];
            while m != 0 {
                let s = m.trailing_zeros();
                m &= m - 1;
                let mut any = false;
                for &(ent, len) in &unit.ents {
                    let lo = s.saturating_sub(inst.pad);
                    let wide = span(lo, s - lo + len as u32 + inst.pad);
                    if (0..inst.periods).any(|per| unit.pm >> per & 1 == 1 && st.occ_of(ent as usize, per, d) & wide != 0) {
                        *blocked.entry(ent as usize).or_default() += 1;
                        any = true;
                    }
                }
                if !any {
                    if st.plan(u, d, s, false, &mut plan) {
                        continue;
                    }
                    if unit.nrooms > 0 { room_blocked += 1 } else { other += 1 }
                }
            }
        }
        let mut causes: Vec<(u32, String, Option<String>)> = blocked.iter().map(|(&e, &n)| (n, format!("{} är upptagen ({n} av {} möjliga starttider)", lower_first(&ent_label(inst, e)), unit.dom_size), Some(inst.res_names[e].clone()))).collect();
        if room_blocked > 0 {
            causes.push((room_blocked, format!("ingen passande sal är ledig eller en dagsregel bryts ({room_blocked} starttider)"), None));
        }
        if other > 0 {
            causes.push((other, format!("en dagsregel eller koppling bryts ({other} starttider)"), None));
        }
        causes.sort_by(|a, b| b.0.cmp(&a.0));
        causes.truncate(3);
        let text = if causes.is_empty() { "ingen enskild orsak hittades".to_string() } else { causes.iter().map(|c| c.1.clone()).collect::<Vec<_>>().join("; ") };
        out.push(diag("unplaced", format!("Pass {} fick ingen plats. Det är inte bevisat omöjligt. I vägen: {text}.", inst.unit_label(p, u)), lessons, causes.into_iter().filter_map(|c| c.2).collect(), false));
    }
    out
}

fn lower_first(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_lowercase().chain(c).collect(),
        None => String::new(),
    }
}

/// Finns en egen sal åt varje salsbehov i enheten, bortsett från tiden?
fn rooms_match(unit: &Unit, n_rooms: usize) -> bool {
    let slots: Vec<&[u16]> = unit.parts.iter().flat_map(|x| std::iter::repeat_n(x.cands.as_slice(), x.room_count as usize)).collect();
    let mut owner = vec![usize::MAX; n_rooms];
    fn augment(k: usize, slots: &[&[u16]], owner: &mut [usize], seen: &mut [bool]) -> bool {
        for &r in slots[k] {
            let r = r as usize;
            if seen[r] {
                continue;
            }
            seen[r] = true;
            if owner[r] == usize::MAX || augment(owner[r], slots, owner, seen) {
                owner[r] = k;
                return true;
            }
        }
        false
    }
    (0..slots.len()).all(|k| augment(k, &slots, &mut owner, &mut vec![false; n_rooms]))
}
