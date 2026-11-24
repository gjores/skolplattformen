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

pub const CONTRACT_VERSION: u32 = 5;
pub const SUPPORTED_PROBLEM_VERSIONS: [u32; 2] = [4, 5];
pub fn supported_problem_version(version: u32) -> bool { SUPPORTED_PROBLEM_VERSIONS.contains(&version) }
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
    /// Kalenderhärledda skoldagar per verkligt elevkluster och period.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub student_day_balance: Vec<StudentDayBalance>,
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
pub struct StudentDayBalance {
    pub cluster: String,
    /// Tom sträng avser ett problem utan namngivna perioder.
    pub period: String,
    pub days: Vec<u32>,
}

pub fn lesson_pairs(count: u32) -> i64 {
    i64::from(count) * i64::from(count.saturating_sub(1)) / 2
}

/// Det minsta möjliga antalet par när `count` ordnas jämnt över `days`.
pub fn balanced_lesson_pairs(count: u32, days: u32) -> i64 {
    let per_day = count / days;
    i64::from(days) * lesson_pairs(per_day) + i64::from(count % days) * i64::from(per_day)
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
    /// Gemensamt tidsintervall för flera periodrader, avgränsat till samma aktivitet (motor5).
    #[serde(default, skip_serializing_if = "Option::is_none", deserialize_with = "optional_budget")]
    pub budget: Option<String>,
    /// Skoldagar per veckodag i perioden, en post per dag i `time.days`.
    pub weekday_days: Vec<u32>,
    pub min_min: u64,
    pub max_min: u64,
}

fn optional_budget<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Option<String>, D::Error> {
    // Saknat fält är legacy. Ett uttryckligt null är inte ett giltigt budget-ID.
    String::deserialize(deserializer).map(Some)
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
    /// Om passet är undervisning vid fördelningen av elevernas pass över veckan.
    #[serde(default = "instructional", skip_serializing_if = "is_instructional")]
    pub instructional: bool,
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
    /// Tid före och efter passet som följer passet när det flyttas (omklädning, dusch, städning, övergång).
    /// Marginalen upptar bara de parter den anger, räknas i deras dag (krockar, dagslängd, lunch, håltid)
    /// men aldrig i aktivitetens tid. Utan värde: ingen marginal.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub margin: Option<Margin>,
}

fn instructional() -> bool { true }
fn is_instructional(value: &bool) -> bool { *value }

/// Marginal före och efter ett pass för en part. Minuterna följer tidssteget.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct MarginSide {
    #[serde(default)]
    pub before_min: u32,
    #[serde(default)]
    pub after_min: u32,
}

impl MarginSide {
    pub fn max(self, other: MarginSide) -> MarginSide {
        MarginSide { before_min: self.before_min.max(other.before_min), after_min: self.after_min.max(other.after_min) }
    }
    pub fn is_zero(&self) -> bool {
        self.before_min == 0 && self.after_min == 0
    }
}

/// Passets marginal per part. Två pass får inte ligga så att det ena passets marginal överlappar det andras
/// undervisning för en gemensam part; marginaler får överlappa varandra. Rasten (`rules.break_min`)
/// gäller mellan passens undervisning och räknas inte ovanpå marginalen.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Margin {
    #[serde(default)]
    pub students: MarginSide,
    #[serde(default)]
    pub teachers: MarginSide,
    #[serde(default)]
    pub rooms: MarginSide,
}

/// Den part en marginal gäller.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MarginPart {
    Students,
    Teachers,
    Rooms,
}

impl Lesson {
    pub fn counted(&self) -> u32 {
        self.counted_min.unwrap_or(self.duration_min)
    }

    /// Marginalen för en part. Noll när passet saknar parten (inga grupper, lärare eller salskrav).
    pub fn margin_for(&self, part: MarginPart) -> MarginSide {
        let Some(m) = &self.margin else { return MarginSide::default() };
        match part {
            MarginPart::Students if !self.groups.is_empty() => m.students,
            MarginPart::Teachers if !self.teachers.is_empty() => m.teachers,
            MarginPart::Rooms if self.rooms.is_some() => m.rooms,
            _ => MarginSide::default(),
        }
    }

    /// Den största marginalen åt varje håll. Passet och denna marginal ska rymmas i skoldagen.
    pub fn outer_margin(&self) -> MarginSide {
        self.margin_for(MarginPart::Students).max(self.margin_for(MarginPart::Teachers)).max(self.margin_for(MarginPart::Rooms))
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
/// - **Passfördelning.** För varje angivet elevkluster och tillämplig dag
///   vägs antalet par av undervisningspass samma dag över jämnast möjliga
///   fördelning med `student_day_balance` och elevantalet. Med aktivt mål jämförs underskridande av dagarnas
///   rimliga miniminivå före denna och övriga mjuka kostnader.
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
    #[serde(default, skip_serializing_if = "zero_weight")]
    pub student_day_balance: i64,
}

fn zero_weight(weight: &i64) -> bool { *weight == 0 }
fn zero_metric(metric: &u64) -> bool { *metric == 0 }

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
            student_day_balance: 0,
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
    /// Saknade undervisningspass upp till dagens målnivå, gånger elevantalet.
    #[serde(default, skip_serializing_if = "zero_metric")]
    pub student_day_shortfall: u64,
    /// Par av undervisningspass på samma skoldag över ett idealt jämnt mönster, gånger elevantalet.
    #[serde(default, skip_serializing_if = "zero_metric")]
    pub student_day_concentration: u64,
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

/// Faktiska sökhändelser, summerade över samtliga söktrådar. De är inte ett
/// mått på bevisad svårighet. Samma frö, iterationsgräns och en tråd ger samma tal.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct LessonSearchStat {
    pub lesson: String,
    pub attempts: u64,
    pub moves: u64,
    pub backtracks: u64,
    pub ejections: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct BottleneckStat {
    /// Orsaken som faktiskt påträffades vid ett placeringsförsök.
    pub code: String,
    pub resource: Option<String>,
    pub count: u64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SearchStatistics {
    /// Högst 20 pass, fallande efter backtracks + ejections, sedan attempts.
    pub lessons: Vec<LessonSearchStat>,
    /// Högst 20 kombinationer av villkor och resurs, fallande efter antal.
    pub bottlenecks: Vec<BottleneckStat>,
    pub iterations: u64,
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
    pub search_statistics: SearchStatistics,
}

/// Avgränsad lokal placeringshjälp. Den ändrar aldrig problemet eller den insända placeringen.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SuggestionMode { Lesson, Target, Rest }

/// Alla målfält är obligatoriska på HTTP-vägen, även den uttryckliga salslistan.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SuggestionTarget {
    pub day: u32,
    pub start_min: u32,
    pub rooms: Vec<String>,
}
fn required_nullable<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where D: serde::Deserializer<'de>, T: Deserialize<'de> {
    Option::<T>::deserialize(deserializer)
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct SuggestionRequest {
    pub problem: Problem,
    pub placements: Vec<Placement>,
    pub mode: SuggestionMode,
    #[serde(deserialize_with = "required_nullable")]
    pub lesson: Option<String>,
    #[serde(deserialize_with = "required_nullable")]
    pub target: Option<SuggestionTarget>,
    /// Antal redan lagda, undanträngda pass utöver det valda passet (1–3).
    pub depth: u8,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct SuggestionChange {
    pub lesson: String,
    pub from: Option<Placement>,
    pub to: Placement,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Suggestion {
    /// Hela resulterande placeringen, inklusive alla oförändrade redan lagda pass.
    pub placements: Vec<Placement>,
    pub changes: Vec<SuggestionChange>,
    pub metrics_before: Metrics,
    pub metrics_after: Metrics,
    /// Samma tal som metrics_after.cost; reference är insända placements.
    pub cost: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Suggestions {
    pub version: u32,
    pub problem_id: String,
    pub depth: u8,
    /// Budgeten tog slut. Inga delvis kontrollerade alternativ returneras.
    pub timed_out: bool,
    pub elapsed_ms: u64,
    pub suggestions: Vec<Suggestion>,
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
        if !supported_problem_version(self.version) {
            err("version", format!("Underlaget har kontraktsversion {}, motorn läser 4 och {}.", self.version, CONTRACT_VERSION), vec![], vec![]);
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
        let mut balance_keys = HashSet::new();
        let mut balance_size = 0u128;
        let cluster_sizes: HashMap<&str, u32> = self.clusters.iter().map(|c| (c.id.as_str(), c.size)).collect();
        if !(0..=10_000).contains(&self.weights.student_day_balance) {
            err("student_day_balance", "Vikten för jämna skoldagar måste vara mellan 0 och 10 000.".into(), vec![], vec![]);
        }
        for row in &self.student_day_balance {
            let period_ok = if periods.is_empty() { row.period.is_empty() } else { periods.contains(row.period.as_str()) };
            let unique_days: HashSet<_> = row.days.iter().collect();
            if !clusters.contains(row.cluster.as_str()) || !period_ok
                || !balance_keys.insert((row.cluster.as_str(), row.period.as_str()))
                || row.days.is_empty() || unique_days.len() != row.days.len() || row.days.iter().any(|day| *day >= days) {
                err("student_day_balance", format!("Jämna skoldagar för {} har ogiltigt kluster, period eller veckodagar.", row.cluster), vec![], vec![row.cluster.clone()]);
            }
            balance_size += u128::from(cluster_sizes.get(row.cluster.as_str()).copied().unwrap_or(0))
                * row.days.len() as u128;
        }
        // Även kontroll av ett felaktigt, överlappande schema måste kunna räkna utan överflöde.
        let n = self.lessons.len() as u128;
        if balance_size.saturating_mul(n.saturating_mul(n)).saturating_mul(self.weights.student_day_balance.max(1) as u128)
            > i64::MAX as u128 / 4 {
            err("student_day_balance", "Underlaget för jämna skoldagar är för stort för säker beräkning.".into(), vec![], vec![]);
        }
        let mut budget_max_total = 0u128;
        for a in &self.activities {
            let mut budgets: HashMap<&str, (u64, u64, HashSet<&str>)> = HashMap::new();
            if a.time.iter().any(|t| t.budget.is_some()) && a.time.len() > MAX_PERIODS {
                err("activity_time_budget", format!("Aktivitet {} har fler än {MAX_PERIODS} tidsrader i årsbudgeten.", a.id), vec![], vec![a.id.clone()]);
            }
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
                if let Some(budget) = &t.budget {
                    let mut invalid = self.version != 5 || budget.is_empty() || budget.len() > 200 || budget.trim() != budget
                        || budget.chars().any(char::is_control) || t.weekday_days.iter().any(|&n| n > 366)
                        || t.max_min > 1_000_000_000;
                    if let Some(period) = t.period.as_deref() {
                        if !budgets.contains_key(budget.as_str()) { budget_max_total += t.max_min as u128; }
                        let entry = budgets.entry(budget.as_str()).or_insert_with(|| (t.min_min, t.max_min, HashSet::new()));
                        invalid |= entry.0 != t.min_min || entry.1 != t.max_min || !entry.2.insert(period);
                    } else { invalid = true; }
                    if invalid {
                        err("activity_time_budget", format!("Aktivitet {} har en ogiltig årsbudget: motor5, giltigt budget-ID, unik period och samma min/max krävs.", a.id), vec![], vec![a.id.clone()]);
                    }
                }
            }
        }
        // Lämna marginal för den interna avvikelsekostnaden (4 × minuter ×10^7).
        if budget_max_total > i64::MAX as u128 / 100_000_000 {
            err("activity_time_budget", "Årsbudgeternas sammanlagda minutgräns är för stor för säker beräkning.".into(), vec![], vec![]);
        }
        let budget_rows: HashMap<&str, Vec<&ActivityTime>> = self.activities.iter().map(|a|
            (a.id.as_str(), a.time.iter().filter(|t| t.budget.is_some()).collect())).collect();
        let mut contribution_bound = 0u128;
        for lesson in &self.lessons {
            if let Some(rows) = lesson.activity.as_deref().and_then(|a| budget_rows.get(a)) {
                for row in rows.iter().filter(|row| row.period.as_ref().is_none_or(|p| lesson.periods.is_empty() || lesson.periods.contains(p))) {
                    contribution_bound += lesson.counted() as u128 * row.weekday_days.iter().max().copied().unwrap_or(0) as u128;
                }
            }
        }
        if contribution_bound > i64::MAX as u128 / 100_000_000 {
            err("activity_time_budget", "Årsbudgeternas möjliga minutbidrag är för stora för säker beräkning.".into(), vec![], vec![]);
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
            if let Some(m) = &l.margin {
                if [m.students, m.teachers, m.rooms].iter().any(|x| x.before_min % step != 0 || x.after_min % step != 0 || x.before_min > 1440 || x.after_min > 1440) {
                    err("time_step", format!("Pass {} har en marginal som inte följer tidssteget {step} min.", l.id), id(), vec![]);
                }
            }
            // En salsbokning kan sakna lärare och elevgrupp. Salskravets antal
            // och referenser kontrolleras nedan även när passet saknar deltagare.
            if l.teachers.is_empty() && l.groups.is_empty() && l.rooms.as_ref().is_none_or(|req| req.count == 0) {
                err("empty_lesson", format!("Pass {} behöver lärare, grupp eller ett giltigt salsbehov.", l.id), id(), vec![]);
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
                    let m = l.outer_margin();
                    s.start_min >= d.start_min + m.before_min && s.start_min + l.duration_min + m.after_min <= d.end_min && (s.start_min - d.start_min) % step == 0
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
