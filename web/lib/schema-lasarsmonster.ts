/** Årsmodellen har en budget. Termandelar får därför aldrig bli separata minimikrav. */
export const arsbehov = (minutes: number[]) => Math.max(0, Math.ceil(minutes.reduce((sum, n) => sum + Math.max(0, n), 0) - 1e-9));
export const arstak = (minutes: number) => Math.ceil(minutes / 5 - 1e-9) * 5;

/** Hela årsbeloppet avrundas en gång; termandelarna är enbart information och summerar till årsbeloppet. */
export function arsandelar(minutes: number[], annual: number): number[] {
  const total = minutes.reduce((sum, n) => sum + Math.max(0, n), 0);
  if (!total) return minutes.map(() => 0);
  let used = 0;
  return minutes.map((n, i) => {
    const next = i === minutes.length - 1 ? annual - used : Math.floor(annual * Math.max(0, n) / total + 1e-9);
    used += next;
    return next;
  });
}

/** Samma aktiva personer; vid undervisning i tur måste även deras relativa andelar vara lika. */
export function sammaArsresurser(rows: { teachers: { personId: string; minutes: number }[]; together: boolean }[]): boolean {
  const key = (row: typeof rows[number]) => {
    const active = row.teachers.filter(t => t.minutes > 0).sort((a, b) => a.personId.localeCompare(b.personId));
    const total = active.reduce((sum, t) => sum + t.minutes, 0);
    return JSON.stringify([row.together, active.map(t => [t.personId, row.together || active.length < 2 ? 1 : Math.round(t.minutes / total * 1e9)])]);
  };
  return rows.length > 0 && rows.every(row => key(row) === key(rows[0]));
}

/** En enda nedre gräns: varje termmönster bidrar till samma summa. Ingen påhittad terminskvot prövas. */
export function arsmonsterGerTid(lengths: number[], weekdayDays: number[][], needMin: number, everyDay = false): boolean {
  if (!lengths.length || !weekdayDays.length) return false;
  const factors = weekdayDays.map(days => days.filter(n => n > 0));
  if (factors.some(days => !days.length)) return false;
  const repetitions = factors.reduce((sum, days) => sum + (everyDay ? Math.min(...days) : Math.max(...days)), 0);
  return lengths.reduce((sum, n) => sum + n, 0) * repetitions >= needMin;
}

export type ArsTillfalle = { lesson: number; durationMin: number };
/** Korta först ett helt gemensamt pass över samtliga terminer; sprid därefter resten över årets tillfällen. */
export function trimmaLasar(occasions: ArsTillfalle[], maxMin: number, floor: number): number[] {
  const cut = occasions.map(() => 0);
  let left = Math.max(0, Math.floor((occasions.reduce((sum, o) => sum + o.durationMin, 0) - maxMin) / 5));
  const lessons = [...new Set(occasions.map(o => o.lesson))];
  const canCut = (i: number) => occasions[i].durationMin - cut[i] - 5 >= Math.min(floor, occasions[i].durationMin);
  for (let changed = true; changed && left > 0;) {
    changed = false;
    for (const lesson of lessons) {
      const mine = occasions.flatMap((o, i) => o.lesson === lesson ? [i] : []);
      if (mine.length > left || mine.some(i => !canCut(i))) continue;
      for (const i of mine) cut[i] += 5;
      left -= mine.length;
      changed = true;
    }
  }
  while (left > 0) {
    const room = occasions.flatMap((_, i) => canCut(i) ? [i] : []);
    if (!room.length) break;
    const counts = lessons.map(lesson => room.filter(i => occasions[i].lesson === lesson).length);
    const lesson = lessons[counts.indexOf(Math.max(...counts))], open = room.filter(i => occasions[i].lesson === lesson), take = Math.min(left, open.length);
    for (let k = 0; k < take; k++) cut[open[Math.floor((k + 0.5) * open.length / take)]] += 5;
    left -= take;
  }
  return cut;
}
