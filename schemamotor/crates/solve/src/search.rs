//! Sökningen: först ett komplett schema genom att placera och vid behov kasta
//! ut (iterativ framåtsökning med konfliktstatistik), sedan förbättring med
//! simulerad avsvalning där varje drag är en flytt, ett byte eller en kedja.

use crate::compile::*;
use crate::state::*;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Instant;

pub struct Rng(pub u64);

impl Rng {
    pub fn next(&mut self) -> u64 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545F4914F6CDD1D)
    }
    pub fn below(&mut self, n: usize) -> usize {
        (self.next() >> 11) as usize % n.max(1)
    }
    pub fn unit(&mut self) -> f64 {
        (self.next() >> 11) as f64 / (1u64 << 53) as f64
    }
}

pub struct Ctl<'a> {
    pub start: Instant,
    pub deadline: Option<Instant>,
    pub max_iters: Option<u64>,
    pub cancel: &'a AtomicBool,
    /// Millisekunder till första kompletta schema; `u64::MAX` tills det finns.
    pub first_complete: &'a AtomicU64,
}

pub struct Outcome {
    pub snap: Vec<(Option<Pos>, Vec<u16>)>,
    pub obj: i64,
    pub iterations: u64,
}

struct Search<'a, 'b> {
    st: State<'a>,
    inst: &'a Inst,
    ctl: &'b Ctl<'b>,
    rng: Rng,
    it: u64,
    plan: Plan,
    best: Vec<(Option<Pos>, Vec<u16>)>,
    best_obj: i64,
}

fn nth_bit(mut m: u128, n: u32) -> u32 {
    for _ in 0..n {
        m &= m - 1;
    }
    m.trailing_zeros()
}

impl<'a, 'b> Search<'a, 'b> {
    fn stop(&self) -> bool {
        if self.ctl.cancel.load(Ordering::Relaxed) {
            return true;
        }
        if self.ctl.max_iters.is_some_and(|m| self.it >= m) {
            return true;
        }
        self.it & 31 == 0 && self.ctl.deadline.is_some_and(|d| Instant::now() >= d)
    }

    /// Andel av budgeten som är förbrukad.
    fn progress(&self) -> f64 {
        let by_iter = self.ctl.max_iters.map_or(0.0, |m| self.it as f64 / m.max(1) as f64);
        let by_time = self.ctl.deadline.map_or(0.0, |d| {
            let total = d.duration_since(self.ctl.start).as_secs_f64();
            if total <= 0.0 { 1.0 } else { self.ctl.start.elapsed().as_secs_f64() / total }
        });
        by_iter.max(by_time).min(1.0)
    }

    fn keep_best(&mut self) {
        let obj = self.st.obj();
        if obj < self.best_obj {
            self.best_obj = obj;
            self.best = self.st.snapshot();
            if self.st.unplaced == 0 {
                let ms = self.ctl.start.elapsed().as_millis() as u64;
                self.ctl.first_complete.fetch_min(ms, Ordering::Relaxed);
            }
        }
    }

    fn random_slot(&mut self, u: usize, near: Option<Pos>) -> Option<(usize, u32)> {
        let unit = &self.inst.units[u];
        if unit.dom_size == 0 {
            return None;
        }
        if let Some((d, _)) = near {
            let m = unit.dom[d as usize];
            if m != 0 && self.rng.below(3) == 0 {
                let k = self.rng.below(m.count_ones() as usize) as u32;
                return Some((d as usize, nth_bit(m, k)));
            }
        }
        let mut k = self.rng.below(unit.dom_size as usize) as u32;
        for d in 0..self.inst.days {
            let c = unit.dom[d].count_ones();
            if k < c {
                return Some((d, nth_bit(unit.dom[d], k)));
            }
            k -= c;
        }
        None
    }

    /// En starttid tätt intill något som en av enhetens lärare eller elever
    /// redan har den dagen, så att draget inte skapar en håltimme.
    fn adjacent_slot(&mut self, u: usize) -> Option<(usize, u32)> {
        let inst = self.inst;
        let unit = &inst.units[u];
        if unit.ents.is_empty() {
            return None;
        }
        let (ent, len) = unit.ents[self.rng.below(unit.ents.len())];
        let d = self.rng.below(inst.days);
        let p = unit.pm.trailing_zeros() as usize;
        let mut occ = self.st.occ_of(ent as usize, p, d);
        if self.st.pos[u].is_some_and(|x| x.0 as usize == d) {
            occ &= !span(self.st.pos[u].unwrap().1 as u32, len as u32);
        }
        if occ == 0 {
            return None;
        }
        let bit = nth_bit(occ, self.rng.below(occ.count_ones() as usize) as u32);
        let s = if self.rng.below(2) == 0 {
            // Direkt efter blocket.
            let run = (!(occ >> bit)).trailing_zeros();
            bit + run + inst.pad
        } else {
            let before = (!(occ << (127 - bit))).leading_zeros();
            (bit + 1).checked_sub(before + inst.pad + len as u32)?
        };
        (s < 128 && unit.dom[d] >> s & 1 == 1).then_some((d, s))
    }

    /// Bästa lediga plats för `u` bland alla, eller bland `sample` slumpade.
    fn best_free(&mut self, u: usize, sample: Option<usize>) -> Option<(usize, u32, Vec<u16>)> {
        let inst = self.inst;
        let mut best: Option<(i64, usize, u32, Vec<u16>)> = None;
        let mut plan = std::mem::take(&mut self.plan);
        let mut consider = |me: &mut Self, d: usize, s: u32, plan: &mut Plan| {
            if !me.st.plan(u, d, s, false, plan) {
                return;
            }
            let mark = me.st.mark();
            me.st.place(u, d, s, &plan.rooms);
            let obj = me.st.obj() * 8 + (me.rng.next() & 7) as i64;
            me.st.rollback(mark);
            if best.as_ref().is_none_or(|b| obj < b.0) {
                best = Some((obj, d, s, plan.rooms.clone()));
            }
        };
        match sample {
            Some(n) => {
                for _ in 0..n {
                    if let Some((d, s)) = self.random_slot(u, None) {
                        consider(self, d, s, &mut plan);
                    }
                }
            }
            None => {
                for d in 0..inst.days {
                    let mut m = inst.units[u].dom[d];
                    while m != 0 {
                        let s = m.trailing_zeros();
                        m &= m - 1;
                        consider(self, d, s, &mut plan);
                    }
                }
            }
        }
        self.plan = plan;
        best.map(|b| (b.1, b.2, b.3))
    }

    fn seed_start(&mut self) {
        let inst = self.inst;
        let mut plan = Plan::default();
        // Låsta pass först, sedan referensschemat.
        for locked in [true, false] {
            for u in 0..inst.units.len() {
                let unit = &inst.units[u];
                if self.st.pos[u].is_some() || unit.locked != locked {
                    continue;
                }
                let target = if locked {
                    (0..inst.days).find(|&d| unit.dom[d] != 0).map(|d| (d, unit.dom[d].trailing_zeros()))
                } else {
                    unit.parts.iter().find_map(|p| p.reference).map(|(d, s)| (d as usize, s as u32))
                };
                if let Some((d, s)) = target {
                    if self.st.plan(u, d, s, false, &mut plan) {
                        self.st.place(u, d, s, &plan.rooms);
                    }
                }
            }
        }
        self.st.commit();
    }

    fn construct(&mut self) {
        let inst = self.inst;
        let n = inst.units.len();
        let mut todo: Vec<usize> = (0..n).filter(|&u| self.st.pos[u].is_none() && inst.units[u].dom_size > 0 && inst.units[u].self_conflict.is_none()).collect();
        let mut heat = vec![0u32; n];
        let mut cbs = vec![0u32; n * inst.days * 128];
        let budget = self.ctl.max_iters.map(|m| m / 2);
        let mut stall = 0u64;
        let patience = 20_000 + 60 * n as u64;
        let mut best_left = self.st.unplaced_min;
        let mut plan = Plan::default();
        let mut chosen = Plan::default();
        self.keep_best();
        while !todo.is_empty() && !self.stop() && stall < patience && budget.is_none_or(|b| self.it < b) && self.progress() < 0.6 {
            self.it += 1;
            // Svårast först: liten domän och ofta utkastad.
            let k = if self.rng.below(10) == 0 {
                self.rng.below(todo.len())
            } else {
                let mut bk = 0;
                let mut bv = f64::MAX;
                for (k, &u) in todo.iter().enumerate() {
                    let unit = &inst.units[u];
                    let v = unit.dom_size as f64 / ((1.0 + heat[u] as f64) * unit.dur_min as f64 * (unit.ents.len() + unit.nrooms + 1) as f64) + self.rng.unit() * 1e-6;
                    if v < bv {
                        bv = v;
                        bk = k;
                    }
                }
                bk
            };
            let u = todo[k];
            let mut best: Option<(f64, usize, u32)> = None;
            for d in 0..inst.days {
                let mut m = inst.units[u].dom[d];
                while m != 0 {
                    let s = m.trailing_zeros();
                    m &= m - 1;
                    if !self.st.plan(u, d, s, true, &mut plan) {
                        continue;
                    }
                    let score = if plan.eject.is_empty() {
                        let mark = self.st.mark();
                        let before = self.st.soft;
                        self.st.place(u, d, s, &plan.rooms);
                        let delta = (self.st.soft - before) as f64;
                        self.st.rollback(mark);
                        -1e12 + delta + self.rng.unit()
                    } else {
                        let mut pen = 0.0;
                        for &v in &plan.eject {
                            let (vd, vs) = self.st.pos[v as usize].unwrap();
                            let c = cbs[(v as usize * inst.days + vd as usize) * 128 + vs as usize];
                            pen += inst.units[v as usize].dur_min as f64 * (1.0 + c as f64);
                        }
                        pen * (1.0 + 0.1 * self.rng.unit())
                    };
                    if best.is_none_or(|b| score < b.0) {
                        best = Some((score, d, s));
                        std::mem::swap(&mut chosen, &mut plan);
                    }
                }
            }
            todo.swap_remove(k);
            let Some((_, d, s)) = best else { continue };
            for &v in &chosen.eject {
                let (vd, vs) = self.st.pos[v as usize].unwrap();
                cbs[(v as usize * inst.days + vd as usize) * 128 + vs as usize] += 1;
                heat[v as usize] += 1;
                todo.push(v as usize);
            }
            self.st.execute(u, d, s, &chosen);
            self.st.commit();
            if self.st.unplaced_min < best_left {
                best_left = self.st.unplaced_min;
                stall = 0;
                self.keep_best();
            } else {
                stall += 1;
            }
        }
        if self.st.obj() > self.best_obj {
            let best = std::mem::take(&mut self.best);
            self.st.restore(&best);
            self.best = best;
        }
    }

    /// Ett drag: ställ `u` på en ny plats, kasta ut det som står i vägen och
    /// sätt tillbaka det på bästa lediga plats. Falskt om draget inte gick.
    fn try_move(&mut self, u: usize, d: usize, s: u32) -> bool {
        let old = self.st.pos[u];
        if old == Some((d as u8, s as u8)) {
            return false;
        }
        if old.is_some() {
            self.st.unplace(u);
        }
        let mut plan = std::mem::take(&mut self.plan);
        let ok = self.st.plan(u, d, s, true, &mut plan) && plan.eject.len() <= 3;
        if ok {
            self.st.execute(u, d, s, &plan);
        }
        let ejected = plan.eject.clone();
        self.plan = plan;
        if !ok {
            return false;
        }
        for v in ejected {
            let v = v as usize;
            // Byte: pröva först platsen som blev ledig.
            if let Some((od, os)) = old {
                let mut plan = std::mem::take(&mut self.plan);
                let fits = self.st.plan(v, od as usize, os as u32, false, &mut plan);
                if fits && self.rng.below(2) == 0 {
                    self.st.place(v, od as usize, os as u32, &plan.rooms);
                }
                self.plan = plan;
                if self.st.pos[v].is_some() {
                    continue;
                }
            }
            match self.best_free(v, Some(16)) {
                Some((vd, vs, rooms)) => self.st.place(v, vd, vs, &rooms),
                None => match self.best_free(v, None) {
                    Some((vd, vs, rooms)) => self.st.place(v, vd, vs, &rooms),
                    None => return false,
                },
            }
        }
        true
    }

    fn anneal(&mut self) {
        let inst = self.inst;
        let movable: Vec<usize> = (0..inst.units.len()).filter(|&u| !inst.units[u].locked && inst.units[u].dom_size > 1 && inst.units[u].self_conflict.is_none()).collect();
        if movable.is_empty() {
            return;
        }
        // Starttemperatur ur ett stickprov av drag.
        let mut sum = 0.0;
        let mut cnt = 0;
        for _ in 0..200 {
            let u = movable[self.rng.below(movable.len())];
            let Some((d, s)) = self.random_slot(u, None) else { continue };
            let mark = self.st.mark();
            let before = self.st.obj();
            if self.try_move(u, d, s) {
                let delta = self.st.obj() - before;
                if delta > 0 && delta < BIG {
                    sum += delta as f64;
                    cnt += 1;
                }
            }
            self.st.rollback(mark);
        }
        self.st.commit();
        let t0 = if cnt > 0 { (sum / cnt as f64) * 0.25 } else { 1.0 }.max(1.0);
        let t1 = (t0 * 0.002).max(0.05);
        let from = self.progress();
        let mut temp = t0;
        let mut since_best = 0u64;
        while !self.stop() {
            self.it += 1;
            if self.it & 127 == 0 {
                let frac = ((self.progress() - from) / (1.0 - from).max(1e-9)).clamp(0.0, 1.0);
                temp = t0 * (t1 / t0).powf(frac);
            }
            let u = movable[self.rng.below(movable.len())];
            // Vartannat drag siktar på en plats intill befintlig undervisning.
            let near = if self.rng.below(2) == 0 { self.adjacent_slot(u) } else { None };
            let Some((d, s)) = near.or_else(|| self.random_slot(u, self.st.pos[u])) else { continue };
            let mark = self.st.mark();
            let before = self.st.obj();
            let moved = self.try_move(u, d, s);
            let delta = self.st.obj() - before;
            if !moved || (delta > 0 && (delta >= BIG || self.rng.unit() >= (-(delta as f64) / temp).exp())) {
                self.st.rollback(mark);
            } else {
                self.st.commit();
                if self.st.obj() < self.best_obj {
                    since_best = 0;
                    self.keep_best();
                }
            }
            since_best += 1;
            // Fastnat länge: börja om från det bästa.
            if since_best > 400_000 {
                since_best = 0;
                let best = std::mem::take(&mut self.best);
                self.st.restore(&best);
                self.best = best;
            }
        }
        self.st.commit();
    }
}

pub fn run(inst: &Inst, ctl: &Ctl, seed: u64) -> Outcome {
    let mut search = Search { st: State::new(inst), inst, ctl, rng: Rng(seed.wrapping_mul(0x9E3779B97F4A7C15) | 1), it: 0, plan: Plan::default(), best: Vec::new(), best_obj: i64::MAX };
    search.seed_start();
    search.best = search.st.snapshot();
    search.best_obj = search.st.obj();
    if search.st.unplaced == 0 {
        search.ctl.first_complete.fetch_min(search.ctl.start.elapsed().as_millis() as u64, Ordering::Relaxed);
    }
    search.construct();
    search.anneal();
    Outcome { snap: search.best, obj: search.best_obj, iterations: search.it }
}
