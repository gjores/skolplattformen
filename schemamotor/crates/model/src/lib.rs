//! Kontrakt för schemamotorn: beräkningsunderlag (`Problem`) och resultat (`Solution`).
//!
//! Underlaget är oföränderligt och självbärande. Motorn läser inget annat och
//! skriver ingenstans. Alla tider är minuter efter midnatt och hela multiplar av
//! `time.step_min`. Identiteter är appens stabila ID:n; namn och personuppgifter
//! hör inte hemma här.
//!
//! Regler (hårda) och önskemål (mjuka, med vikt) är data i `rules` och `weights`.
//! Kostnadens exakta betydelse står vid [`Weights`]; lösaren och den oberoende
//! kontrollen räknar den var för sig och ska komma till samma tal.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};

pub const CONTRACT_VERSION: u32 = 1;
/// Lösaren håller en dag i ett 128-bitarsord.
pub const MAX_SLOTS_PER_DAY: u32 = 128;
pub const MAX_PERIODS: usize = 32;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Problem {
    pub version: u32,
    pub id: String,
    pub time: TimeGrid,
    /// Läsårsdelar (t.ex. ht/vt eller A-/B-vecka). Två pass krockar bara om de
    /// delar minst en period. Tom lista betyder en enda period.
    #[serde(default)]
    pub periods: Vec<Period>,
    #[serde(default)]
    pub teachers: Vec<Teacher>,
    /// Elevkluster: elever med identiska gruppmedlemskap. Krockar prövas per kluster.
    #[serde(default)]
    pub clusters: Vec<Cluster>,
    #[serde(default)]
    pub groups: Vec<Group>,
    #[serde(default)]
    pub rooms: Vec<Room>,
    #[serde(default)]
    pub activities: Vec<Activity>,
    pub lessons: Vec<Lesson>,
    #[serde(default)]
    pub links: Vec<Link>,
    #[serde(default)]
    pub rules: Rules,
    #[serde(default)]
    pub weights: Weights,
    /// Referensschema för minimal ändring. Flyttade pass kostar `weights.moved`.
    #[serde(default)]
    pub reference: Vec<Placement>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct TimeGrid {
    /// Tidens upplösning i minuter.
    pub step_min: u32,
    /// Pass får börja på multiplar av detta, räknat från dagens start. 0 = `step_min`.
    #[serde(default)]
    pub start_grid_min: u32,
    pub days: Vec<Day>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Day {
    pub start_min: u32,
    pub end_min: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Period {
    pub id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Interval {
    pub day: u32,
    pub start_min: u32,
    pub end_min: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Teacher {
    pub id: String,
    #[serde(default)]
    pub unavailable: Vec<Interval>,
    #[serde(default)]
    pub max_min_per_day: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Cluster {
    pub id: String,
    /// Antal elever. Viktar elevernas håltimmar och sena dagar.
    pub size: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Group {
    pub id: String,
    /// Klustren som ingår. Tom lista: gruppen är sitt eget kluster med `size` elever.
    #[serde(default)]
    pub clusters: Vec<String>,
    #[serde(default)]
    pub size: Option<u32>,
    #[serde(default)]
    pub unavailable: Vec<Interval>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Room {
    pub id: String,
    #[serde(default)]
    pub capacity: Option<u32>,
    #[serde(default)]
    pub features: Vec<String>,
    #[serde(default)]
    pub unavailable: Vec<Interval>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SameDay {
    /// Hård regel: högst ett pass per aktivitet och dag.
    Forbid,
    /// Önskemål: varje extra pass samma dag kostar `weights.same_day`.
    Avoid,
    Allow,
}

/// Ett undervisningsbehov: en grupps ämne eller kurs. Passen i en aktivitet
/// sprids över veckan enligt `same_day`.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Activity {
    pub id: String,
    /// Ersätter `rules.same_day` för den här aktiviteten.
    #[serde(default)]
    pub same_day: Option<SameDay>,
    /// Hård regel: aktivitetens tid per period. Tom lista: ingen regel.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub time: Vec<ActivityTime>,
}

/// Aktivitetens tid i en period: summan av passens längd gånger antalet
/// skoldagar på passets veckodag i perioden ska ligga inom `min_min..=max_min`.
/// Räknas på de pass i aktiviteten som går i perioden.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ActivityTime {
    /// Perioden. Utan värde: alla pass, oavsett period.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub period: Option<String>,
    /// Skoldagar per veckodag i perioden, en post per dag i `time.days`.
    pub weekday_days: Vec<u32>,
    pub min_min: u64,
    pub max_min: u64,
}

impl ActivityTime {
    /// Passens tid i perioden när de ligger på dessa dagar.
    pub fn minutes(&self, lessons: impl Iterator<Item = (u32, u32)>) -> u64 {
        lessons.map(|(duration, day)| duration as u64 * self.weekday_days.get(day as usize).copied().unwrap_or(0) as u64).sum()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Lesson {
    pub id: String,
    #[serde(default)]
    pub activity: Option<String>,
    pub duration_min: u32,
    #[serde(default)]
    pub teachers: Vec<String>,
    #[serde(default)]
    pub groups: Vec<String>,
    /// Tom lista: alla perioder.
    #[serde(default)]
    pub periods: Vec<String>,
    #[serde(default)]
    pub rooms: Option<RoomRequirement>,
    /// Tillåtna tidsfönster. Tom lista: hela skoldagen.
    #[serde(default)]
    pub allowed: Vec<Interval>,
    /// Låst placering. Hård.
    #[serde(default)]
    pub locked: Option<Slot>,
    /// Minuter som räknas i aktivitetens tid (`ActivityTime`) när passet
    /// upptar mer tid än undervisningen, t.ex. med marginal. Utan värde: `duration_min`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub counted_min: Option<u32>,
}

impl Lesson {
    pub fn counted(&self) -> u32 {
        self.counted_min.unwrap_or(self.duration_min)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RoomRequirement {
    #[serde(default = "one")]
    pub count: u32,
    /// Egenskaper som salen måste ha, t.ex. "idrott" eller "labb".
    #[serde(default)]
    pub features: Vec<String>,
    #[serde(default)]
    pub min_capacity: Option<u32>,
    /// Om listan inte är tom får bara dessa salar användas.
    #[serde(default)]
    pub allowed: Vec<String>,
}

fn one() -> u32 {
    1
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Slot {
    pub day: u32,
    pub start_min: u32,
    /// Tom lista: motorn väljer sal.
    #[serde(default)]
    pub rooms: Vec<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LinkKind {
    /// Passen börjar samma dag och tid (valbart block som ska gå parallellt).
    Simultaneous,
    /// Passen får inte överlappa i tid.
    NoOverlap,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Link {
    pub kind: LinkKind,
    pub lessons: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Lunch {
    pub window_start_min: u32,
    pub window_end_min: u32,
    pub length_min: u32,
    #[serde(default)]
    pub teachers: bool,
}

/// Hårda regler.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Rules {
    /// Minsta tid mellan två pass för samma lärare eller elev.
    #[serde(default)]
    pub break_min: u32,
    /// Varje dag med undervisning ska ha en sammanhängande ledig tid på
    /// `length_min` inom fönstret. Gäller elever, och lärare om `teachers`.
    #[serde(default)]
    pub lunch: Option<Lunch>,
    #[serde(default = "avoid")]
    pub same_day: SameDay,
    #[serde(default)]
    pub student_max_min_per_day: Option<u32>,
}

fn avoid() -> SameDay {
    SameDay::Avoid
}

impl Default for Rules {
    fn default() -> Self {
        Rules { break_min: 0, lunch: None, same_day: SameDay::Avoid, student_max_min_per_day: None }
    }
}

/// Önskemål. Kostnaden är summan av följande, räknat per period:
///
/// - **Håltimmar.** För varje lärare eller kluster och dag: tiden mellan första
///   passets start och sista passets slut som inte är undervisning, minus
///   `break_min` per mellanrum. Finns lunchregeln för parten och ett mellanrum
///   täcker minst `length_min` av lunchfönstret dras `length_min − break_min`
///   en gång (om positivt). Minuterna gånger `teacher_gap`, respektive
///   `student_gap` gånger klustrets storlek.
/// - **Sen dag.** Minuter som klustrets sista pass slutar efter `late_after_min`,
///   gånger `student_late` gånger storleken.
/// - **Samma dag.** För aktivitet med `Avoid`: `same_day` per pass utöver det
///   första samma dag.
/// - **Flytt.** `moved` per pass vars dag eller starttid skiljer sig från
///   referensen; `room_moved` om bara salarna skiljer sig.
///
/// Oplacerade pass ingår inte i kostnaden. De jämförs alltid före kostnaden.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Weights {
    #[serde(default = "w1")]
    pub student_gap: i64,
    #[serde(default = "w10")]
    pub teacher_gap: i64,
    #[serde(default = "w1")]
    pub student_late: i64,
    #[serde(default)]
    pub late_after_min: Option<u32>,
    #[serde(default = "w1500")]
    pub same_day: i64,
    #[serde(default = "w3000")]
    pub moved: i64,
    #[serde(default = "w100")]
    pub room_moved: i64,
}

fn w1() -> i64 {
    1
}
fn w10() -> i64 {
    10
}
fn w100() -> i64 {
    100
}
fn w1500() -> i64 {
    1500
}
fn w3000() -> i64 {
    3000
}

impl Default for Weights {
    fn default() -> Self {
        Weights {
            student_gap: 1,
            teacher_gap: 10,
            student_late: 1,
            late_after_min: None,
            same_day: 1500,
            moved: 3000,
            room_moved: 100,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Placement {
    pub lesson: String,
    pub day: u32,
    pub start_min: u32,
    #[serde(default)]
    pub rooms: Vec<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    /// Alla pass är placerade och inga hårda regler bryts.
    Complete,
    /// Tids- eller iterationsgränsen nåddes med pass kvar. Inget är bevisat.
    TimeLimit,
    /// Bevisat olösbart; `diagnoses` anger orsakerna.
    Infeasible,
    /// Underlaget är ofullständigt eller motsägelsefullt i sig.
    InputMissing,
    /// Avbruten utifrån.
    Cancelled,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Diagnosis {
    pub code: String,
    /// Klartext på svenska, med ID:n. Appen byter ID mot namn.
    pub message: String,
    #[serde(default)]
    pub lessons: Vec<String>,
    #[serde(default)]
    pub resources: Vec<String>,
    /// Sant om diagnosen är ett bevis för att underlaget är olösbart.
    #[serde(default)]
    pub proof: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Metrics {
    pub lessons: u32,
    pub placed_lessons: u32,
    pub unplaced_lessons: u32,
    pub placed_min: u64,
    pub unplaced_min: u64,
    /// Elevminuter håltimme (minuter gånger klustrets storlek).
    pub student_gap_min: u64,
    pub teacher_gap_min: u64,
    pub student_late_min: u64,
    pub same_day_repeats: u32,
    pub moved_lessons: u32,
    pub room_moved_lessons: u32,
    pub cost: i64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Stats {
    pub elapsed_ms: u64,
    /// Tid till första schema med alla pass placerade.
    pub first_complete_ms: Option<u64>,
    pub iterations: u64,
    pub threads: u32,
    pub seed: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Solution {
    pub version: u32,
    pub problem_id: String,
    /// SHA-256 över underlaget. Ett resultat gäller bara för exakt detta underlag.
    pub problem_hash: String,
    pub status: Status,
    pub placements: Vec<Placement>,
    pub unplaced: Vec<String>,
    pub diagnoses: Vec<Diagnosis>,
    pub metrics: Metrics,
    pub stats: Stats,
}

impl Problem {
    pub fn hash(&self) -> String {
        let bytes = serde_json::to_vec(self).expect("problem serialises");
        let digest = Sha256::digest(&bytes);
        digest.iter().map(|b| format!("{b:02x}")).collect()
    }

    pub fn start_grid(&self) -> u32 {
        if self.time.start_grid_min == 0 {
            self.time.step_min
        } else {
            self.time.start_grid_min
        }
    }

    /// Lektionens perioder som index. Tom `periods` betyder alla.
    pub fn period_count(&self) -> usize {
        self.periods.len().max(1)
    }

    /// Formfel i underlaget. Tom lista: underlaget kan beräknas.
    pub fn check(&self) -> Vec<Diagnosis> {
        let mut out = Vec::new();
        let mut err = |code: &str, message: String, lessons: Vec<String>, resources: Vec<String>| {
            out.push(Diagnosis { code: code.to_string(), message, lessons, resources, proof: false });
        };
        if self.version != CONTRACT_VERSION {
            err("version", format!("Underlaget har kontraktsversion {}, motorn läser {}.", self.version, CONTRACT_VERSION), vec![], vec![]);
        }
        let step = self.time.step_min;
        if step == 0 {
            err("time_step", "Tidssteget måste vara minst en minut.".into(), vec![], vec![]);
            return out;
        }
        let grid = self.start_grid();
        if grid % step != 0 {
            err("time_step", format!("Startrutnätet {grid} min är inte en multipel av tidssteget {step} min."), vec![], vec![]);
        }
        if self.time.days.is_empty() {
            err("no_days", "Underlaget saknar skoldagar.".into(), vec![], vec![]);
        }
        let pad = self.rules.break_min;
        if pad % step != 0 {
            err("time_step", format!("Rasten {pad} min är inte en multipel av tidssteget {step} min."), vec![], vec![]);
        }
        for (i, d) in self.time.days.iter().enumerate() {
            if d.start_min >= d.end_min || d.end_min > 1440 {
                err("day", format!("Dag {i} har ogiltig tid {}–{}.", d.start_min, d.end_min), vec![], vec![]);
            } else if d.start_min % step != 0 || d.end_min % step != 0 {
                err("time_step", format!("Dag {i} följer inte tidssteget {step} min."), vec![], vec![]);
            } else if (d.end_min - d.start_min + pad) / step > MAX_SLOTS_PER_DAY {
                err("day_too_long", format!("Dag {i} ger fler än {MAX_SLOTS_PER_DAY} tidssteg. Välj ett större tidssteg."), vec![], vec![]);
            }
        }
        if self.periods.len() > MAX_PERIODS {
            err("periods", format!("Högst {MAX_PERIODS} perioder stöds."), vec![], vec![]);
        }
        if let Some(l) = &self.rules.lunch {
            if l.window_start_min % step != 0 || l.window_end_min % step != 0 || l.length_min % step != 0 || l.length_min == 0 {
                err("time_step", format!("Lunchregeln följer inte tidssteget {step} min."), vec![], vec![]);
            }
            if l.window_start_min + l.length_min > l.window_end_min {
                err("lunch", "Lunchfönstret är kortare än lunchen.".into(), vec![], vec![]);
            }
        }
        if let Some(m) = self.weights.late_after_min {
            if m % step != 0 {
                err("time_step", format!("Gränsen för sen dag följer inte tidssteget {step} min."), vec![], vec![]);
            }
        }

        let days = self.time.days.len() as u32;
        drop(err);
        dups("period", self.periods.iter().map(|p| p.id.as_str()), &mut out);
        dups("lärare", self.teachers.iter().map(|t| t.id.as_str()), &mut out);
        dups("kluster", self.clusters.iter().map(|c| c.id.as_str()), &mut out);
        dups("grupp", self.groups.iter().map(|g| g.id.as_str()), &mut out);
        dups("sal", self.rooms.iter().map(|r| r.id.as_str()), &mut out);
        dups("aktivitet", self.activities.iter().map(|a| a.id.as_str()), &mut out);
        dups("pass", self.lessons.iter().map(|l| l.id.as_str()), &mut out);

        let mut err = |code: &str, message: String, lessons: Vec<String>, resources: Vec<String>| {
            out.push(Diagnosis { code: code.to_string(), message, lessons, resources, proof: false });
        };
        let check_iv = |iv: &Interval| -> bool {
            iv.day < days
                && iv.start_min < iv.end_min
                && iv.end_min <= 1440
                && iv.start_min % step == 0
                && iv.end_min % step == 0
        };
        for t in &self.teachers {
            if t.unavailable.iter().any(|iv| !check_iv(iv)) {
                err("interval", format!("Lärare {} har en otillgänglig tid som är ogiltig eller inte följer tidssteget.", t.id), vec![], vec![t.id.clone()]);
            }
        }
        for r in &self.rooms {
            if r.unavailable.iter().any(|iv| !check_iv(iv)) {
                err("interval", format!("Sal {} har en otillgänglig tid som är ogiltig eller inte följer tidssteget.", r.id), vec![], vec![r.id.clone()]);
            }
        }
        let periods: HashSet<&str> = self.periods.iter().map(|p| p.id.as_str()).collect();
        let teachers: HashSet<&str> = self.teachers.iter().map(|t| t.id.as_str()).collect();
        let clusters: HashSet<&str> = self.clusters.iter().map(|c| c.id.as_str()).collect();
        let groups: HashSet<&str> = self.groups.iter().map(|g| g.id.as_str()).collect();
        let rooms: HashSet<&str> = self.rooms.iter().map(|r| r.id.as_str()).collect();
        let activities: HashSet<&str> = self.activities.iter().map(|a| a.id.as_str()).collect();
        for a in &self.activities {
            for t in &a.time {
                if t.weekday_days.len() != days as usize {
                    err("activity_time", format!("Aktivitet {} har skoldagar för {} veckodagar men underlaget har {days}.", a.id, t.weekday_days.len()), vec![], vec![a.id.clone()]);
                }
                if t.min_min > t.max_min {
                    err("activity_time", format!("Aktivitet {} har lägsta tid över högsta tid.", a.id), vec![], vec![a.id.clone()]);
                }
                if let Some(p) = &t.period {
                    if !periods.contains(p.as_str()) {
                        err("unknown_ref", format!("Aktivitet {} hänvisar till okänd period {p}.", a.id), vec![], vec![a.id.clone(), p.clone()]);
                    }
                }
            }
        }
        for g in &self.groups {
            if g.unavailable.iter().any(|iv| !check_iv(iv)) {
                err("interval", format!("Grupp {} har en otillgänglig tid som är ogiltig eller inte följer tidssteget.", g.id), vec![], vec![g.id.clone()]);
            }
            for c in &g.clusters {
                if !clusters.contains(c.as_str()) {
                    err("unknown_ref", format!("Grupp {} hänvisar till okänt kluster {c}.", g.id), vec![], vec![g.id.clone()]);
                }
            }
        }
        let lessons: HashMap<&str, &Lesson> = self.lessons.iter().map(|l| (l.id.as_str(), l)).collect();
        for l in &self.lessons {
            let id = || vec![l.id.clone()];
            if l.duration_min == 0 || l.duration_min % step != 0 {
                err("duration", format!("Pass {} har längden {} min, som inte följer tidssteget {step} min.", l.id, l.duration_min), id(), vec![]);
            }
            if l.counted_min.is_some_and(|c| c > l.duration_min) {
                err("duration", format!("Pass {} räknar fler minuter än det varar.", l.id), id(), vec![]);
            }
            if l.teachers.is_empty() && l.groups.is_empty() {
                err("empty_lesson", format!("Pass {} har varken lärare eller grupp.", l.id), id(), vec![]);
            }
            for t in &l.teachers {
                if !teachers.contains(t.as_str()) {
                    err("unknown_ref", format!("Pass {} hänvisar till okänd lärare {t}.", l.id), id(), vec![t.clone()]);
                }
            }
            for g in &l.groups {
                if !groups.contains(g.as_str()) {
                    err("unknown_ref", format!("Pass {} hänvisar till okänd grupp {g}.", l.id), id(), vec![g.clone()]);
                }
            }
            for p in &l.periods {
                if !periods.contains(p.as_str()) {
                    err("unknown_ref", format!("Pass {} hänvisar till okänd period {p}.", l.id), id(), vec![p.clone()]);
                }
            }
            if let Some(a) = &l.activity {
                if !activities.contains(a.as_str()) {
                    err("unknown_ref", format!("Pass {} hänvisar till okänd aktivitet {a}.", l.id), id(), vec![a.clone()]);
                }
            }
            if let Some(req) = &l.rooms {
                if req.count == 0 {
                    err("room_count", format!("Pass {} begär noll salar. Ta bort salskravet i stället.", l.id), id(), vec![]);
                }
                for r in &req.allowed {
                    if !rooms.contains(r.as_str()) {
                        err("unknown_ref", format!("Pass {} hänvisar till okänd sal {r}.", l.id), id(), vec![r.clone()]);
                    }
                }
            }
            if l.allowed.iter().any(|iv| !check_iv(iv)) {
                err("interval", format!("Pass {} har ett tillåtet fönster som är ogiltigt eller inte följer tidssteget.", l.id), id(), vec![]);
            }
            if let Some(s) = &l.locked {
                let ok = (s.day as usize) < self.time.days.len() && {
                    let d = &self.time.days[s.day as usize];
                    s.start_min >= d.start_min && s.start_min + l.duration_min <= d.end_min && (s.start_min - d.start_min) % step == 0
                };
                if !ok {
                    err("locked", format!("Pass {} är låst till en tid utanför skoldagen eller tidssteget.", l.id), id(), vec![]);
                }
                for r in &s.rooms {
                    if !rooms.contains(r.as_str()) {
                        err("unknown_ref", format!("Pass {} är låst till okänd sal {r}.", l.id), id(), vec![r.clone()]);
                    }
                }
            }
        }
        let mut in_sim: HashSet<&str> = HashSet::new();
        for (i, link) in self.links.iter().enumerate() {
            if link.lessons.len() < 2 {
                err("link", format!("Koppling {i} har färre än två pass."), link.lessons.clone(), vec![]);
            }
            let mut uniq = HashSet::new();
            for id in &link.lessons {
                if !lessons.contains_key(id.as_str()) {
                    err("unknown_ref", format!("Koppling {i} hänvisar till okänt pass {id}."), vec![id.clone()], vec![]);
                }
                if !uniq.insert(id.as_str()) {
                    err("link", format!("Koppling {i} nämner pass {id} flera gånger."), vec![id.clone()], vec![]);
                }
            }
            if link.kind == LinkKind::Simultaneous {
                let known: Vec<&Lesson> = link.lessons.iter().filter_map(|id| lessons.get(id.as_str()).copied()).collect();
                for id in &link.lessons {
                    if !in_sim.insert(id.as_str()) {
                        err("link", format!("Pass {id} ingår i flera samtidighetskopplingar. Slå ihop dem till en."), vec![id.clone()], vec![]);
                    }
                }
                if let Some(first) = known.first() {
                    let mut a: Vec<&String> = first.periods.iter().collect();
                    a.sort();
                    for other in &known[1..] {
                        let mut b: Vec<&String> = other.periods.iter().collect();
                        b.sort();
                        if a != b {
                            err("link", format!("Koppling {i}: pass som ska gå samtidigt måste ha samma perioder."), link.lessons.clone(), vec![]);
                            break;
                        }
                    }
                    let locks: Vec<&Slot> = known.iter().filter_map(|l| l.locked.as_ref()).collect();
                    if locks.windows(2).any(|w| w[0].day != w[1].day || w[0].start_min != w[1].start_min) {
                        err("locked", format!("Koppling {i}: pass som ska gå samtidigt är låsta till olika tider."), link.lessons.clone(), vec![]);
                    }
                }
            }
        }
        for p in &self.reference {
            if !lessons.contains_key(p.lesson.as_str()) {
                err("unknown_ref", format!("Referensschemat hänvisar till okänt pass {}.", p.lesson), vec![p.lesson.clone()], vec![]);
            }
        }
        out
    }
}

fn dups<'a>(kind: &str, ids: impl Iterator<Item = &'a str>, out: &mut Vec<Diagnosis>) {
    let mut seen = HashSet::new();
    for id in ids {
        if id.is_empty() {
            out.push(Diagnosis { code: "id".into(), message: format!("En post av typen {kind} saknar ID."), lessons: vec![], resources: vec![], proof: false });
        } else if !seen.insert(id) {
            out.push(Diagnosis { code: "duplicate_id".into(), message: format!("ID {id} förekommer flera gånger ({kind})."), lessons: vec![], resources: vec![id.to_string()], proof: false });
        }
    }
}
