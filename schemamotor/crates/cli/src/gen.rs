//! Syntetiska skolor för prov och mätning. Inga verkliga uppgifter: alla
//! namn är löpnummer och alla tal kommer ur en slumpgenerator med angivet frö.

use schemamotor_model::*;

struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 33
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n.max(1)
    }
}

/// Ämne: kod, pass per vecka, längd, salens egenskap.
type Subject = (&'static str, u32, u32, &'static str);

const GR: &[Subject] = &[
    ("sv", 3, 60, "klassrum"),
    ("ma", 4, 50, "klassrum"),
    ("en", 3, 50, "klassrum"),
    ("so", 3, 60, "klassrum"),
    ("no", 2, 60, "klassrum"),
    ("nolab", 1, 80, "labb"),
    ("idh", 2, 60, "idrott"),
    ("bild", 1, 60, "bild"),
    ("mu", 1, 50, "musik"),
    ("sl", 1, 90, "slojd"),
    ("tk", 1, 50, "klassrum"),
    ("hkk", 1, 60, "hkk"),
];

const GY: &[Subject] = &[
    ("sve", 2, 80, "klassrum"),
    ("eng", 2, 80, "klassrum"),
    ("mat", 2, 80, "klassrum"),
    ("his", 1, 90, "klassrum"),
    ("sam", 2, 70, "klassrum"),
    ("nak", 1, 90, "labb"),
    ("idr", 1, 90, "idrott"),
    ("prog1", 2, 80, "klassrum"),
    ("prog2", 2, 80, "klassrum"),
    ("mentor", 1, 40, "klassrum"),
];

pub struct Kind {
    pub name: &'static str,
    pub gymnasium: bool,
    pub grades: u32,
    pub per_grade: u32,
}

pub const KINDS: &[Kind] = &[
    Kind { name: "liten", gymnasium: false, grades: 1, per_grade: 2 },
    Kind { name: "mellan", gymnasium: false, grades: 3, per_grade: 2 },
    Kind { name: "grundskola", gymnasium: false, grades: 3, per_grade: 4 },
    Kind { name: "gymnasium", gymnasium: true, grades: 3, per_grade: 8 },
    Kind { name: "stor", gymnasium: true, grades: 3, per_grade: 14 },
];

pub fn school(kind: &Kind, seed: u64) -> Problem {
    let mut rng = Rng(seed.wrapping_mul(2654435761).wrapping_add(17));
    let subjects = if kind.gymnasium { GY } else { GR };
    let (day_end, late) = if kind.gymnasium { (17 * 60, 16 * 60) } else { (16 * 60, 15 * 60) };
    let options = if kind.gymnasium { 4 } else { 3 };
    // Blockets pass per vecka och längd, och hur många block varje årskurs har.
    let (block_n, block_len, blocks) = if kind.gymnasium { (2, 80, 2) } else { (3, 50, 1) };

    let mut p = Problem {
        version: CONTRACT_VERSION,
        id: format!("syntet-{}-{}", kind.name, seed),
        time: TimeGrid { step_min: 5, start_grid_min: 10, days: (0..5).map(|_| Day { start_min: 8 * 60, end_min: day_end }).collect() },
        periods: vec![],
        teachers: vec![],
        clusters: vec![],
        groups: vec![],
        rooms: vec![],
        activities: vec![],
        lessons: vec![],
        links: vec![],
        rules: Rules { break_min: 10, lunch: Some(Lunch { window_start_min: 10 * 60 + 30, window_end_min: 13 * 60 + 30, length_min: 40, teachers: true }), same_day: SameDay::Avoid, student_max_min_per_day: Some(420) },
        weights: Weights { late_after_min: Some(late), ..Weights::default() },
        reference: vec![],
    };

    // Lärare per ämne med ungefär 18 timmars undervisning i veckan.
    let mut load: Vec<(String, u32)> = Vec::new();
    let mut teacher_for = |p: &mut Problem, rng: &mut Rng, subject: &str, minutes: u32| -> String {
        let key = subject.trim_end_matches(char::is_numeric);
        if let Some(t) = load.iter_mut().find(|t| t.0.starts_with(&format!("t-{key}-")) && t.1 + minutes <= 1080) {
            t.1 += minutes;
            return t.0.clone();
        }
        let id = format!("t-{key}-{}", load.len() + 1);
        let mut unavailable = Vec::new();
        match rng.below(6) {
            0 => unavailable.push(Interval { day: rng.below(5) as u32, start_min: 8 * 60, end_min: day_end }),
            1 => unavailable.push(Interval { day: rng.below(5) as u32, start_min: 8 * 60, end_min: 10 * 60 }),
            2 => unavailable.push(Interval { day: rng.below(5) as u32, start_min: 14 * 60, end_min: day_end }),
            _ => {}
        }
        p.teachers.push(Teacher { id: id.clone(), unavailable, max_min_per_day: Some(330) });
        load.push((id.clone(), minutes));
        id
    };

    let mut n = 0u32;
    let mut room_need: Vec<(&str, u32)> = Vec::new();
    let mut classes = 0u32;
    for grade in 0..kind.grades {
        let year = if kind.gymnasium { grade + 1 } else { grade + 7 };
        let mut option_clusters: Vec<Vec<Vec<String>>> = vec![vec![Vec::new(); options]; blocks];
        for c in 0..kind.per_grade {
            classes += 1;
            let class = format!("{year}{}", (b'A' + c as u8) as char);
            // Klassen delas i kluster efter elevernas val i varje block.
            let size = 22 + rng.below(9) as u32;
            let mut clusters = Vec::new();
            let combos = if blocks == 1 { options } else { options * 2 };
            for k in 0..combos {
                let id = format!("{class}-k{k}");
                let share = size / combos as u32 + u32::from((k as u32) < size % combos as u32);
                p.clusters.push(Cluster { id: id.clone(), size: share.max(1) });
                option_clusters[0][k % options].push(id.clone());
                if blocks == 2 {
                    option_clusters[1][(k / options + k) % options].push(id.clone());
                }
                clusters.push(id);
            }
            p.groups.push(Group { id: class.clone(), clusters, size: None, unavailable: vec![] });
            p.rooms.push(Room { id: format!("r-{class}"), capacity: Some(32), features: vec!["klassrum".into()], unavailable: vec![] });
            for &(subject, count, len, feature) in subjects {
                let teacher = teacher_for(&mut p, &mut rng, subject, count * len);
                let activity = format!("{class}-{subject}");
                p.activities.push(Activity { id: activity.clone(), same_day: None });
                match room_need.iter_mut().find(|x| x.0 == feature) {
                    Some(x) => x.1 += count * len,
                    None => room_need.push((feature, count * len)),
                }
                for _ in 0..count {
                    n += 1;
                    p.lessons.push(Lesson {
                        id: format!("L{n}"),
                        activity: Some(activity.clone()),
                        duration_min: len,
                        teachers: vec![teacher.clone()],
                        groups: vec![class.clone()],
                        periods: vec![],
                        rooms: Some(RoomRequirement { count: 1, features: vec![feature.into()], min_capacity: None, allowed: vec![] }),
                        allowed: vec![],
                        locked: None,
                    });
                }
            }
        }
        // Valbara block: alternativen går parallellt för hela årskursen.
        for (b, by_option) in option_clusters.iter().enumerate() {
            let mut per_option = Vec::new();
            for (o, clusters) in by_option.iter().enumerate() {
                let group = format!("{year}-block{b}-val{o}");
                p.groups.push(Group { id: group.clone(), clusters: clusters.clone(), size: None, unavailable: vec![] });
                // Stora val delas på flera lärare och salar.
                let halves = (kind.per_grade as usize).div_ceil(4);
                let teachers: Vec<String> = (0..halves).map(|h| teacher_for(&mut p, &mut rng, &format!("val{year}b{b}o{o}h{h}x"), block_n * block_len)).collect();
                let activity = format!("{group}-kurs");
                p.activities.push(Activity { id: activity.clone(), same_day: None });
                per_option.push((group, teachers, activity, halves as u32));
            }
            for _ in 0..block_n {
                let mut ids = Vec::new();
                for (group, teachers, activity, halves) in &per_option {
                    n += 1;
                    ids.push(format!("L{n}"));
                    match room_need.iter_mut().find(|x| x.0 == "klassrum") {
                        Some(x) => x.1 += block_len * halves,
                        None => room_need.push(("klassrum", block_len * halves)),
                    }
                    p.lessons.push(Lesson {
                        id: format!("L{n}"),
                        activity: Some(activity.clone()),
                        duration_min: block_len,
                        teachers: teachers.clone(),
                        groups: vec![group.clone()],
                        periods: vec![],
                        rooms: Some(RoomRequirement { count: *halves, features: vec!["klassrum".into()], min_capacity: None, allowed: vec![] }),
                        allowed: vec![],
                        locked: None,
                    });
                }
                p.links.push(Link { kind: LinkKind::Simultaneous, lessons: ids });
            }
        }
    }
    // Specialsalar efter behov, med ungefär 65 % beläggning.
    let week = (day_end - 8 * 60) * 5;
    for (feature, need) in room_need {
        if feature == "klassrum" {
            // Minst så många att ett helt block ryms samtidigt, med marginal.
            let block_rooms = options as u32 * kind.per_grade.div_ceil(4) + 2;
            let extra = ((need as f64 / (week as f64 * 0.7)).ceil() as u32).max(block_rooms);
            for k in classes..extra.max(classes) {
                p.rooms.push(Room { id: format!("r-extra-{k}"), capacity: Some(32), features: vec!["klassrum".into()], unavailable: vec![] });
            }
            continue;
        }
        let count = (need as f64 / (week as f64 * 0.65)).ceil() as u32;
        for k in 0..count.max(1) {
            p.rooms.push(Room { id: format!("r-{feature}-{}", k + 1), capacity: Some(32), features: vec![feature.into()], unavailable: vec![] });
        }
    }
    p
}
