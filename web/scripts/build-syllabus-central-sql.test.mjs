import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centralCatalogId, centralSubjectFromApi } from '../lib/syllabus-central.ts';
import { createSyllabusCentralSql, runSyllabusCentralSql } from './build-syllabus-central-sql.mjs';

const source = { url: 'https://api.skolverket.se/syllabus/v1', apiVersion: 'test', fetched: '2026-10-19' };
async function fixture() {
  const subject = await centralSubjectFromApi({ code: 'TEST', version: 1, name: 'Test', courses: [{ code: 'TEST1000X', name: 'Nivå 1',
    centralContent: { text: "<ul><li>Elevens 'egna' val.</li></ul><p><em>Rubrik</em></p><ul><li>Andra.</li></ul>" } }] });
  return { index: { schemaVersion: 1, source, catalogId: await centralCatalogId(source, [subject]), subjects: [['TEST', 1]] }, subjects: [subject] };
}

test('seed citerar text, behåller rubrik null och räknar rader', async () => {
  const { index, subjects } = await fixture();
  const sql = await createSyllabusCentralSql(index, subjects);
  assert.match(sql, /values \('sha256:[0-9a-f]{64}','https:\/\/api\.skolverket\.se\/syllabus\/v1','test','2026-10-19',1,1,2\);/);
  assert.match(sql, /\('sha256:[0-9a-f]{64}','TEST',1,'TEST1000X',0,null,0,'[0-9a-f]{32}','Elevens ''egna'' val\.'\)/);
  assert.match(sql, /'TEST1000X',1,'Rubrik',0,'[0-9a-f]{32}','Andra\.'\);/);
});

test('ändrad punkttext efter katalog-ID nekas', async () => {
  const { index, subjects } = await fixture();
  subjects[0].levels[0].sections[0].items[0].text = 'Påhittad punkt.';
  await assert.rejects(createSyllabusCentralSql(index, subjects), /central_catalog_integrity_failed/);
});

test('incheckad seed motsvarar genererad katalog', async () => {
  assert.deepEqual((await runSyllabusCentralSql({ check: true })).status, 'checked');
});
