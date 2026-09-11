// Hämtar ämnes- och nivåkatalog från Skolverkets Syllabus-API och skriver en
// daterad ögonblicksbild till lib/syllabus-snapshot.ts.
//
//   node scripts/fetch-syllabus.mjs
//
// Ögonblicksbilden versioneras i projektet med avsikt. Informationsmodellen
// kräver att ett underlag går att återfinna i den version som användes, och ett
// direktanrop vid varje sidvisning uppfyller inte det. Fulltext för centralt
// innehåll och betygskriterier hämtas inte här; den hör till ett senare steg.

import { writeFile } from 'node:fs/promises';

const BASE = 'https://api.skolverket.se/syllabus/v1';
const SCHOOL_TYPES = ['gy', 'gr'];
// Poängplaner för gymnasieskolans nationella program i Gy25. Huvudmannen
// väljer utbildningar ur den listan; utgångna Gy11-program tas inte med.
const OUT = new URL('../lib/syllabus-snapshot.ts', import.meta.url);

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok)
    throw new Error(`${url} svarade ${response.status} ${response.statusText}`);
  return response.json();
}

const trim = (value) => (typeof value === 'string' && value ? value : undefined);

function reduceSubject(subject) {
  return {
    code: subject.code,
    name: subject.name,
    typeOfSyllabus: subject.typeOfSyllabus,
    schoolTypes: subject.schoolTypes ?? [],
    version: subject.version ?? 0,
    startDate: trim(subject.startDate),
    endDate: trim(subject.endDate),
    canceledDate: trim(subject.canceledDate),
    skolfs: trim(subject.skolfsGrund) ?? trim(subject.canceledSkolfs),
    items: (subject.courses ?? []).map((course) => ({
      code: course.code,
      name: course.name,
      points: Number(course.points ?? course.point ?? 0),
    })),
  };
}

function reduceBlockSubject(subject) {
  return {
    code: subject.code,
    name: subject.name,
    points: Number(subject.points ?? 0),
    optional: Boolean(subject.optional),
    levels: (subject.courses ?? []).map((course) => ({
      code: course.code,
      name: course.name,
      points: Number(course.points ?? 0),
    })),
  };
}

function reduceProgram(program) {
  const block = (key) => (program[key]?.subjects ?? []).map(reduceBlockSubject);
  return {
    code: program.code,
    name: program.name,
    category: program.category,
    version: program.version ?? 0,
    startDate: trim(program.startDate),
    endDate: trim(program.endDate),
    canceledDate: trim(program.canceledDate),
    skolfs: trim(program.skolfsGrund) ?? trim(program.skolfsAndring),
    foundation: block('foundationSubjects'),
    programmeSpecific: block('programmeSpecificSubjects'),
    orientations: (program.orientations ?? []).map((o) => ({
      code: o.code,
      name: o.name,
      points: Number(o.points ?? 0),
      subjects: (o.subjects ?? []).map(reduceBlockSubject),
    })),
    specialization: block('specialization'),
  };
}

async function main() {
  const bySubjectCode = new Map();
  let apiVersion = 'okänd';
  for (const schoolType of SCHOOL_TYPES) {
    const payload = await fetchJson(`${BASE}/subjects?schooltype=${schoolType}`);
    apiVersion = payload.apiVersion ?? apiVersion;
    for (const subject of payload.subjects ?? []) {
      // Ett ämne kan finnas i flera skolformer. Första förekomsten räcker.
      if (!bySubjectCode.has(subject.code))
        bySubjectCode.set(subject.code, reduceSubject(subject));
    }
    process.stderr.write(
      `${schoolType}: ${payload.subjects?.length ?? 0} ämnen\n`,
    );
  }
  const subjects = [...bySubjectCode.values()].sort((a, b) =>
    a.code.localeCompare(b.code, 'sv'),
  );
  const programList = await fetchJson(`${BASE}/programs?schooltype=gy`);
  const programCodes = (programList.programs ?? [])
    .filter((p) => p.studyPathType === 'PROGRAM25')
    .map((p) => p.code)
    .sort();
  const programs = [];
  for (const code of programCodes) {
    const payload = await fetchJson(`${BASE}/programs/${code}`);
    programs.push(reduceProgram(payload.program ?? payload));
  }
  process.stderr.write(`program: ${programCodes.join(', ')}\n`);
  const fetched = new Date().toISOString().slice(0, 10);
  // Ett ämne per rad håller diffen läsbar när katalogen hämtas om.
  const rows = subjects.map((s) => `  ${JSON.stringify(s)},`).join('\n');
  const programRows = programs.map((p) => `  ${JSON.stringify(p)},`).join('\n');
  const file = `// Genererad av scripts/fetch-syllabus.mjs. Redigera inte för hand.
// Källa: Skolverkets Syllabus-API (${BASE}), CC0.
// Hämtad ${fetched}, API-version ${apiVersion}.
// Innehåller ämnen, nivåer och kurser för skolformerna ${SCHOOL_TYPES.join(', ')}\n// samt poängplan för gymnasieskolans nationella program i Gy25.
// Fulltext för centralt innehåll och betygskriterier ingår inte.
import type { SyllabusSnapshot } from './syllabus.ts';

export const syllabusSnapshot: SyllabusSnapshot = {
 source: ${JSON.stringify(BASE)},
 apiVersion: ${JSON.stringify(apiVersion)},
 fetched: ${JSON.stringify(fetched)},
 schoolTypes: ${JSON.stringify(SCHOOL_TYPES)},
 subjects: [
${rows}
 ],
 programs: [
${programRows}
 ],
};
`;
  await writeFile(OUT, file, 'utf8');
  process.stderr.write(
    `Skrev ${subjects.length} ämnen till lib/syllabus-snapshot.ts (${Math.round(file.length / 1024)} kB)\n`,
  );
}

await main();
