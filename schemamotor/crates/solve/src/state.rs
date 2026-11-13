//! Schemats tillstånd under sökningen: beläggning per resurs, kostnad som
//! hålls aktuell vid varje placering, och en journal för att ångra.

use crate::compile::*;
use schemamotor_model::SameDay;

/// Kostnad per oplacerad minut. Större än varje rimlig summa av önskemål.
pub const BIG: i64 = 1_000_000_000;
/// Kostnad per minut utanför en aktivitets tid (hård regel). Större än
/// önskemålen men mindre än ett oplacerat pass: en minut av ett pass ger
/// högst en minut per skoldag, viktad högst fyra gånger, och ingen veckodag
/// har 25 skoldagar i en period.
pub const TIME: i64 = BIG / 100;

pub type Pos = (u8, u8);

#[derive(Default, Clone)]
pub struct Plan {
    pub rooms: Vec<u16>,
    pub eject: Vec<u32>,
}

pub struct State<'a> {
    pub inst: &'a Inst,
    pub pos: Vec<Option<Pos>>,
    pub rooms: Vec<Vec<u16>>,
    occ: Vec<u128>,
    placed_on: Vec<Vec<u32>>,
    ent_cost: Vec<i64>,
    act_cnt: Vec<u16>,
    time_sum: Vec<i64>,
    /// Minuter utanför aktiviteternas tid, viktade enligt `TimeRule::cost`.
    pub time_dev: i64,
    pub soft: i64,
    pub unplaced_min: i64,
    pub unplaced: usize,
    journal: Vec<(u32, Option<Pos>, Vec<u16>)>,
}

pub fn has_run(free: u128, len: u32) -> bool {
    let mut x = free;
    let mut have = 1;
    while have < len && x != 0 {
        let shift = have.min(len - have);
        x &= x >> shift;
        have += shift;
    }
    x != 0
}

impl<'a> State<'a> {
    pub fn new(inst: &'a Inst) -> Self {
        let cells = inst.periods * inst.days;
        State {
            inst,
            pos: vec![None; inst.units.len()],
            rooms: inst.units.iter().map(|u| vec![NO_ROOM; u.nrooms]).collect(),
            occ: vec![0; inst.n_res * cells],
            placed_on: vec![Vec::new(); inst.n_res],
            ent_cost: vec![0; inst.n_ents * cells],
            act_cnt: vec![0; inst.act_rule.len() * cells],
            time_sum: vec![0; inst.times.len()],
            time_dev: inst.times.iter().map(|t| t.cost(0)).sum(),
            soft: 0,
            unplaced_min: inst.units.iter().map(|u| u.dur_min as i64).sum(),
            unplaced: inst.units.len(),
            journal: Vec::new(),
        }
    }

    #[inline]
    fn ix(&self, res: usize, p: usize, d: usize) -> usize {
        (res * self.inst.periods + p) * self.inst.days + d
    }

    pub fn obj(&self) -> i64 {
        self.unplaced_min * BIG + self.time_dev * TIME + self.soft
    }

    pub fn occ_of(&self, res: usize, p: usize, d: usize) -> u128 {
        self.occ[self.ix(res, p, d)]
    }

    /// Håltimmessteg och sena steg för en lärares eller ett klusters dag.
    fn day_parts(&self, ent: usize, d: usize, occ: u128) -> (i64, i64) {
        if occ == 0 {
            return (0, 0);
        }
        let inst = self.inst;
        let lunch = inst.ent_lunch[ent];
        let mut pos = occ.trailing_zeros();
        let mut x = occ >> pos;
        let mut gap = 0u32;
        let mut lunch_gap = false;
        loop {
            let ones = (!x).trailing_zeros();
            if ones >= 128 {
                break;
            }
            x >>= ones;
            pos += ones;
            if x == 0 {
                break;
            }
            let zeros = x.trailing_zeros();
            gap += zeros.saturating_sub(inst.pad);
            if lunch && (span(pos, zeros) & inst.lunch_win[d]).count_ones() >= inst.lunch_len {
                lunch_gap = true;
            }
            x >>= zeros;
            pos += zeros;
        }
        if lunch_gap {
            gap = gap.saturating_sub(inst.lunch_len.saturating_sub(inst.pad));
        }
        let mut late = 0;
        if !inst.is_teacher(ent) {
            if let Some(l) = &inst.late_slot {
                late = (128 - occ.leading_zeros() as i64 - l[d]).max(0);
            }
        }
        (gap as i64, late)
    }

    fn day_cost(&self, ent: usize, d: usize, occ: u128) -> i64 {
        let (gap, late) = self.day_parts(ent, d, occ);
        let inst = self.inst;
        gap * inst.step as i64 * inst.ent_gap_w[ent] + late * inst.step as i64 * inst.ent_size[ent] * inst.w.student_late
    }

    /// Utfallet uppdelat: elevhåltimmar, lärarhåltimmar och sen tid i minuter,
    /// upprepningar samma dag, flyttade pass och pass med bytt sal.
    pub fn breakdown(&self) -> [i64; 6] {
        let inst = self.inst;
        let mut out = [0i64; 6];
        for ent in 0..inst.n_ents {
            for p in 0..inst.periods {
                for d in 0..inst.days {
                    let (gap, late) = self.day_parts(ent, d, self.occ[self.ix(ent, p, d)]);
                    let step = inst.step as i64;
                    if inst.is_teacher(ent) {
                        out[1] += gap * step;
                    } else {
                        out[0] += gap * step * inst.ent_size[ent];
                        out[2] += late * step * inst.ent_size[ent];
                    }
                }
            }
        }
        for (a, rule) in inst.act_rule.iter().enumerate() {
            if *rule == SameDay::Avoid {
                let cells = inst.periods * inst.days;
                out[3] += self.act_cnt[a * cells..(a + 1) * cells].iter().map(|&c| c.saturating_sub(1) as i64).sum::<i64>();
            }
        }
        for u in 0..inst.units.len() {
            let Some((d, s)) = self.pos[u] else { continue };
            for part in &inst.units[u].parts {
                let Some(r) = part.reference else { continue };
                if r != (d, s) {
                    out[4] += 1;
                } else {
                    let mut a: Vec<u16> = self.rooms[u][part.room_off..part.room_off + part.room_count as usize].to_vec();
                    let mut b = part.ref_rooms.clone();
                    a.sort();
                    b.sort();
                    if a != b {
                        out[5] += 1;
                    }
                }
            }
        }
        out
    }

    /// Hårda dagsregler: högsta undervisningstid och lunch.
    fn day_ok(&self, ent: usize, d: usize, occ: u128) -> bool {
        let inst = self.inst;
        if occ.count_ones() > inst.ent_max[ent] {
            return false;
        }
        !inst.ent_lunch[ent] || has_run(!occ & inst.lunch_win[d], inst.lunch_len)
    }

    /// Enhetens mask på en resurs där den står nu.
    fn mask_on(&self, v: usize, res: usize) -> u128 {
        let unit = &self.inst.units[v];
        let Some((_, s)) = self.pos[v] else { return 0 };
        if let Some(x) = unit.ents.iter().chain(unit.virt.iter()).find(|x| x.0 as usize == res) {
            return span(s as u32, x.1 as u32);
        }
        let mut m = 0;
        for part in &unit.parts {
            for k in 0..part.room_count as usize {
                let r = self.rooms[v][part.room_off + k];
                if r != NO_ROOM && self.inst.room_res(r) == res {
                    m |= span(s as u32, part.len as u32);
                }
            }
        }
        m
    }

    /// Lägg till de placerade enheter på `res` som dag `d` skär `mask`.
    /// Falskt om någon av dem är låst.
    fn collect(&self, res: usize, d: usize, pm: u32, mask: u128, skip: usize, out: &mut Vec<u32>) -> bool {
        for &v in &self.placed_on[res] {
            let vu = v as usize;
            if vu == skip || out.contains(&v) {
                continue;
            }
            let (vd, _) = self.pos[vu].unwrap();
            if vd as usize != d || self.inst.units[vu].pm & pm == 0 || self.mask_on(vu, res) & mask == 0 {
                continue;
            }
            if self.inst.units[vu].locked {
                return false;
            }
            out.push(v);
        }
        true
    }

    /// Beläggningen på `res` utan de enheter som ska kastas ut.
    fn occ_without(&self, res: usize, p: usize, d: usize, eject: &[u32]) -> u128 {
        let mut o = self.occ[self.ix(res, p, d)];
        for &v in eject {
            let vu = v as usize;
            if self.pos[vu].unwrap().0 as usize == d && self.inst.units[vu].pm >> p & 1 == 1 {
                o &= !self.mask_on(vu, res);
            }
        }
        o
    }

    /// Pröva att ställa enhet `u` på dag `d`, steg `s`. Med `eject` får andra
    /// enheter kastas ut; de samlas i `out.eject`. Salar väljs till `out.rooms`.
    pub fn plan(&self, u: usize, d: usize, s: u32, eject: bool, out: &mut Plan) -> bool {
        let inst = self.inst;
        let unit = &inst.units[u];
        out.eject.clear();
        out.rooms.clear();
        if unit.dom[d] >> s & 1 == 0 || unit.self_conflict.is_some() {
            return false;
        }
        let pad = inst.pad;
        for &(res, len) in &unit.ents {
            let lo = s.saturating_sub(pad);
            let wide = span(lo, s - lo + len as u32 + pad);
            for p in 0..inst.periods {
                if unit.pm >> p & 1 == 1 && self.occ[self.ix(res as usize, p, d)] & wide != 0 {
                    if !eject || !self.collect(res as usize, d, unit.pm, wide, u, &mut out.eject) {
                        return false;
                    }
                    break;
                }
            }
        }
        for &(res, len) in &unit.virt {
            let m = span(s, len as u32);
            for p in 0..inst.periods {
                if unit.pm >> p & 1 == 1 && self.occ[self.ix(res as usize, p, d)] & m != 0 {
                    if !eject || !self.collect(res as usize, d, unit.pm, m, u, &mut out.eject) {
                        return false;
                    }
                    break;
                }
            }
        }
        for &(a, _) in &unit.acts {
            if inst.act_rule[a as usize] != SameDay::Forbid {
                continue;
            }
            let taken = (0..inst.periods).any(|p| unit.pm >> p & 1 == 1 && self.act_cnt[(a as usize * inst.periods + p) * inst.days + d] > 0);
            if !taken {
                continue;
            }
            if !eject {
                return false;
            }
            for &v in &inst.act_units[a as usize] {
                let vu = v as usize;
                if vu == u || out.eject.contains(&v) || inst.units[vu].pm & unit.pm == 0 {
                    continue;
                }
                if self.pos[vu].is_some_and(|x| x.0 as usize == d) {
                    if inst.units[vu].locked {
                        return false;
                    }
                    out.eject.push(v);
                }
            }
        }
        // Dagsregler för varje lärare och kluster.
        for &(ent, len) in &unit.ents {
            let ent = ent as usize;
            if inst.ent_max[ent] == u32::MAX && !inst.ent_lunch[ent] {
                continue;
            }
            let m = span(s, len as u32);
            for p in 0..inst.periods {
                if unit.pm >> p & 1 == 0 {
                    continue;
                }
                loop {
                    let o = if out.eject.is_empty() { self.occ[self.ix(ent, p, d)] } else { self.occ_without(ent, p, d, &out.eject) };
                    if self.day_ok(ent, d, o | m) {
                        break;
                    }
                    if !eject {
                        return false;
                    }
                    // Kasta ut den enhet som ger mest luft; lunchbrott kräver en i fönstret.
                    let lunch_fail = o.count_ones() + len as u32 <= inst.ent_max[ent];
                    let mut pick: Option<(u32, u32)> = None;
                    for &v in &self.placed_on[ent] {
                        let vu = v as usize;
                        if out.eject.contains(&v) || inst.units[vu].locked || self.pos[vu].unwrap().0 as usize != d || inst.units[vu].pm >> p & 1 == 0 {
                            continue;
                        }
                        let vm = self.mask_on(vu, ent);
                        let gain = if lunch_fail { (vm & inst.lunch_win[d]).count_ones() } else { vm.count_ones() };
                        if gain > 0 && pick.is_none_or(|x| gain > x.1) {
                            pick = Some((v, gain));
                        }
                    }
                    match pick {
                        Some((v, _)) => out.eject.push(v),
                        None => return false,
                    }
                }
            }
        }
        // Salar.
        for part in &unit.parts {
            if part.room_count == 0 {
                continue;
            }
            let m = span(s, part.len as u32);
            let first = out.rooms.len();
            let want = first + part.room_count as usize;
            let prefer = part.reference.is_some_and(|r| r == (d as u8, s as u8));
            let order = part.ref_rooms.iter().filter(|r| prefer && part.cands.contains(r)).chain(part.cands.iter());
            for &r in order {
                if out.rooms.len() == want {
                    break;
                }
                if out.rooms.contains(&r) || inst.room_block[r as usize * inst.days + d] & m != 0 {
                    continue;
                }
                let res = inst.room_res(r);
                let free = (0..inst.periods).all(|p| {
                    unit.pm >> p & 1 == 0 || {
                        let o = self.occ[self.ix(res, p, d)];
                        o & m == 0 || (!out.eject.is_empty() && self.occ_without(res, p, d, &out.eject) & m == 0)
                    }
                });
                if free {
                    out.rooms.push(r);
                }
            }
            while out.rooms.len() < want {
                if !eject {
                    return false;
                }
                // Ta den sal som kräver minst utkastad undervisning.
                let mut best: Option<(u16, u32, Vec<u32>)> = None;
                for &r in &part.cands {
                    if out.rooms.contains(&r) || inst.room_block[r as usize * inst.days + d] & m != 0 {
                        continue;
                    }
                    let mut who = Vec::new();
                    if !self.collect(inst.room_res(r), d, unit.pm, m, u, &mut who) {
                        continue;
                    }
                    who.retain(|v| !out.eject.contains(v));
                    let load: u32 = who.iter().map(|&v| inst.units[v as usize].dur_min).sum();
                    if best.as_ref().is_none_or(|b| load < b.1) {
                        best = Some((r, load, who));
                    }
                }
                match best {
                    Some((r, _, who)) => {
                        out.eject.extend(who);
                        out.rooms.push(r);
                    }
                    None => return false,
                }
            }
        }
        true
    }

    fn moved_cost(&self, u: usize, d: u8, s: u8, rooms: &[u16]) -> i64 {
        let mut c = 0;
        for part in &self.inst.units[u].parts {
            let Some(r) = part.reference else { continue };
            if r != (d, s) {
                c += self.inst.w.moved;
            } else {
                let mut a: Vec<u16> = rooms[part.room_off..part.room_off + part.room_count as usize].to_vec();
                let mut b = part.ref_rooms.clone();
                a.sort();
                b.sort();
                if a != b {
                    c += self.inst.w.room_moved;
                }
            }
        }
        c
    }

    fn apply(&mut self, u: usize, d: u8, s: u8, add: bool) {
        let inst = self.inst;
        let unit = &inst.units[u];
        let (du, su) = (d as usize, s as u32);
        for &(res, len) in unit.ents.iter().chain(unit.virt.iter()) {
            let res = res as usize;
            let m = span(su, len as u32);
            for p in 0..inst.periods {
                if unit.pm >> p & 1 == 0 {
                    continue;
                }
                let i = self.ix(res, p, du);
                let o = if add { self.occ[i] | m } else { self.occ[i] & !m };
                self.occ[i] = o;
                if res < inst.n_ents {
                    let c = self.day_cost(res, du, o);
                    self.soft += c - self.ent_cost[i];
                    self.ent_cost[i] = c;
                }
            }
            if add {
                self.placed_on[res].push(u as u32);
            } else {
                let k = self.placed_on[res].iter().position(|&x| x == u as u32).unwrap();
                self.placed_on[res].swap_remove(k);
            }
        }
        for part in &unit.parts {
            let m = span(su, part.len as u32);
            for k in 0..part.room_count as usize {
                let res = inst.room_res(self.rooms[u][part.room_off + k]);
                for p in 0..inst.periods {
                    if unit.pm >> p & 1 == 1 {
                        let i = self.ix(res, p, du);
                        if add { self.occ[i] |= m } else { self.occ[i] &= !m }
                    }
                }
                if add {
                    self.placed_on[res].push(u as u32);
                } else {
                    let k = self.placed_on[res].iter().position(|&x| x == u as u32).unwrap();
                    self.placed_on[res].swap_remove(k);
                }
            }
        }
        for &(a, n) in &unit.acts {
            let avoid = inst.act_rule[a as usize] == SameDay::Avoid;
            for p in 0..inst.periods {
                if unit.pm >> p & 1 == 0 {
                    continue;
                }
                let i = (a as usize * inst.periods + p) * inst.days + du;
                let old = self.act_cnt[i];
                let new = if add { old + n } else { old - n };
                self.act_cnt[i] = new;
                if avoid {
                    self.soft += (new.saturating_sub(1) as i64 - old.saturating_sub(1) as i64) * inst.w.same_day;
                }
            }
        }
        for &(r, m) in &unit.time {
            let rule = &inst.times[r as usize];
            let i = r as usize;
            let old = rule.cost(self.time_sum[i]);
            self.time_sum[i] += if add { m * rule.days[du] } else { -m * rule.days[du] };
            self.time_dev += rule.cost(self.time_sum[i]) - old;
        }
        let moved = self.moved_cost(u, d, s, &self.rooms[u]);
        let dur = unit.dur_min as i64;
        if add {
            self.soft += moved;
            self.unplaced_min -= dur;
            self.unplaced -= 1;
        } else {
            self.soft -= moved;
            self.unplaced_min += dur;
            self.unplaced += 1;
        }
    }

    pub fn place(&mut self, u: usize, d: usize, s: u32, rooms: &[u16]) {
        debug_assert!(self.pos[u].is_none());
        self.journal.push((u as u32, None, Vec::new()));
        self.rooms[u].copy_from_slice(rooms);
        self.pos[u] = Some((d as u8, s as u8));
        self.apply(u, d as u8, s as u8, true);
    }

    pub fn unplace(&mut self, u: usize) {
        let (d, s) = self.pos[u].expect("placed");
        self.journal.push((u as u32, Some((d, s)), self.rooms[u].clone()));
        self.apply(u, d, s, false);
        self.pos[u] = None;
    }

    /// Aktivitetens tid enligt regel `r` som schemat ligger nu.
    pub fn time_of(&self, r: usize) -> i64 {
        self.time_sum[r]
    }

    pub fn mark(&self) -> usize {
        self.journal.len()
    }

    pub fn commit(&mut self) {
        self.journal.clear();
    }

    /// Ångra allt som gjorts sedan `mark`.
    pub fn rollback(&mut self, mark: usize) {
        while self.journal.len() > mark {
            let (u, old, rooms) = self.journal.pop().unwrap();
            let u = u as usize;
            match old {
                None => {
                    let (d, s) = self.pos[u].unwrap();
                    self.apply(u, d, s, false);
                    self.pos[u] = None;
                }
                Some((d, s)) => {
                    self.rooms[u].copy_from_slice(&rooms);
                    self.pos[u] = Some((d, s));
                    self.apply(u, d, s, true);
                }
            }
        }
    }

    /// Verkställ en plan: kasta ut, placera.
    pub fn execute(&mut self, u: usize, d: usize, s: u32, plan: &Plan) {
        for &v in &plan.eject {
            self.unplace(v as usize);
        }
        self.place(u, d, s, &plan.rooms);
    }

    pub fn snapshot(&self) -> Vec<(Option<Pos>, Vec<u16>)> {
        self.pos.iter().cloned().zip(self.rooms.iter().cloned()).collect()
    }

    pub fn restore(&mut self, snap: &[(Option<Pos>, Vec<u16>)]) {
        for u in 0..self.pos.len() {
            if self.pos[u].is_some() {
                self.unplace(u);
            }
        }
        for (u, (pos, rooms)) in snap.iter().enumerate() {
            if let Some((d, s)) = pos {
                self.place(u, *d as usize, *s as u32, rooms);
            }
        }
        self.commit();
    }
}
