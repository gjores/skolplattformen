import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findSubject,
  label,
  regimeOf,
  snapshotInfo,
  syllabusIssues,
} from './syllabus.ts';

const now = '2026-09-05';

test('styrdokumentsordningen härleds ur typeOfSyllabus, inte ur en lokal etikett', () => {
  assert.equal(regimeOf({ subject: 'MATE', version: 1 }), 'Gy25');
  assert.equal(regimeOf({ subject: 'MAT', version: 11 }), 'Gy11');
  assert.equal(regimeOf({ subject: 'GRGRSVE01', version: 15 }), 'Grundskola');
  assert.equal(regimeOf({ subject: 'FINNS-INTE', version: 1 }), undefined);
});

test('nivå får ämnesnamnet framför sig, kurs som redan bär det får det inte', () => {
  assert.equal(
    label({ subject: 'MATE', item: 'MATE1B00X', version: 1 }),
    'Matematik, Nivå 1b',
  );
  assert.equal(
    label({ subject: 'MAT', item: 'MATMAT02b', version: 11 }),
    'Matematik 2b',
  );
  assert.equal(label({ subject: 'GRGRSVE01', version: 15 }), 'Svenska');
});

test('en okänd kod rapporteras i stället för att tolkas som tom katalog', () => {
  const issues = syllabusIssues({ subject: 'MATX', version: 1 }, { today: now });
  assert.equal(issues.length, 1);
  assert(issues[0].includes(snapshotInfo.fetched));
  assert(
    syllabusIssues(
      { subject: 'MATE', item: 'MATE9Z00X', version: 1 },
      { today: now },
    ).some((i) => i.includes('finns inte som nivå eller kurs')),
  );
});

test('en nyare version i katalogen än i posten märks', () => {
  const issues = syllabusIssues(
    { subject: 'GRGRSVE01', version: 14 },
    { today: now },
  );
  assert(issues.some((i) => i.includes('version 14')));
  assert.equal(
    syllabusIssues({ subject: 'GRGRSVE01', version: 15 }, { today: now })
      .length,
    0,
  );
});

test('utbildningskullen avgör om ett upphävt ämne är rimligt', () => {
  const gy11 = { subject: 'SVE', item: 'SVESVE03', version: 8 };
  const subject = findSubject('SVE');
  assert.equal(subject.canceledDate, '2025-07-01');
  // Eleven började före upphävandet: kursen gäller fortfarande för den kullen.
  assert.equal(
    syllabusIssues(gy11, { today: now, startedOn: '2024-08-19' }).length,
    0,
  );
  // Eleven började efter: planraden pekar på fel styrdokument.
  assert(
    syllabusIssues(gy11, { today: now, startedOn: '2026-08-17' }).some((i) =>
      i.includes('var upphävt'),
    ),
  );
  // Efter sista giltighetsdag gäller kursen inte för någon.
  assert(
    syllabusIssues(gy11, { today: '2031-01-15' }).some((i) =>
      i.includes('upphörde att gälla'),
    ),
  );
});

test('poäng som avviker från styrdokumentet rapporteras', () => {
  assert(
    syllabusIssues(
      { subject: 'MATE', item: 'MATE1B00X', version: 1 },
      { today: now, localPoints: 50 },
    ).some((i) => i.includes('100 poäng')),
  );
  assert.equal(
    syllabusIssues(
      { subject: 'MATE', item: 'MATE1B00X', version: 1 },
      { today: now, localPoints: 100 },
    ).length,
    0,
  );
});
