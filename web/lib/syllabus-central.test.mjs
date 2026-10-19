import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parseCentralContentHtml, centralSubjectFromApi, centralCatalogId, centralItemKey, syllabusRefFromRowKey } from './syllabus-central.ts';

const sections = html => parseCentralContentHtml(html).map(s => [s.heading, s.items.map(i => i.text)]);

test('rubriker i <em> och inledning som hoppas över (ENGE-mönster)', () => {
  assert.deepEqual(sections('<p>Undervisningen i ämnet engelska på nivå 1 ska behandla följande centrala innehåll:</p> <p><em>Reception</em></p> <ul> <li>Skönlitteratur och annan fiktion.</li> <li>Sånger  och\n dikter.</li> </ul> <p><strong> Produktion </strong></p><ul><li>Muntlig &amp; skriftlig.</li></ul>'),
    [['Reception', ['Skönlitteratur och annan fiktion.', 'Sånger och dikter.']], ['Produktion', ['Muntlig & skriftlig.']]]);
});

test('lista utan rubrik (PEDG-mönster) och tom punkt', () => {
  assert.deepEqual(sections('<p>Undervisningen i ämnet pedagogik på nivå 1 ska behandla följande centrala innehåll:</p> <ul> <li>Planering.</li><li></li> <li>Dokumentation.</li> </ul>'),
    [[null, ['Planering.', 'Dokumentation.']]]);
});

test('vanlig <p>, trasig <em> och inledning i <h4>/<h5> eller <span>', () => {
  assert.deepEqual(sections('<h4><em>Undervisningen i ämnet dans på nivå 1 ska behandla följande centrala innehåll:</em></h4><p>Ritningar och modellering</p><ul><li>Skisser.</li></ul><p><em>Fysikens arbetsmetode</em>r</p><ul><li>Mätning.</li></ul><p></p>'),
    [['Ritningar och modellering', ['Skisser.']], ['Fysikens arbetsmetoder', ['Mätning.']]]);
  assert.deepEqual(sections('<p><span style="font-size: 1.125rem;">Undervisningen i ämnet finsnickeri – teknik på nivå 4 ska behandla följande centrala innehåll:</span></p><ul><li>Fogar.</li></ul>'), [[null, ['Fogar.']]]);
  assert.deepEqual(sections('<p>Undervisningen på nivå 1 ska behandla följande centrala innehåll:</p>'), []);
});

test('text utanför block, nästlad lista och okänd entitet avbryter tolkningen', () => {
  assert.throws(() => parseCentralContentHtml('<p>Rubrik</p>lös text<ul><li>A</li></ul>'), { code: 'unparsed_text' });
  assert.throws(() => parseCentralContentHtml('<ul><li>A<ul><li>B</li></ul></li></ul>'));
  assert.throws(() => parseCentralContentHtml('<ul><li>A &bogus; B</li></ul>'));
});

test('nycklar binds till ämne, version, nivå och rubrik; dubbletter skiljs åt', async () => {
  const html = '<p><em>Motorsåg</em></p><ul><li>Uppföljning.</li></ul><p><em>Röjmotorsåg</em></p><ul><li>Uppföljning.</li><li>Uppföljning.</li></ul>';
  const s = await centralSubjectFromApi({ code: 'MOTO', version: 1, name: 'Motor', courses: [{ code: 'MOTO1000X', name: 'Nivå 1', centralContent: { text: html } }] });
  const keys = s.levels[0].sections.flatMap(x => x.items.map(i => i.key));
  assert.equal(new Set(keys).size, 3);
  assert.ok(keys.every(k => /^[0-9a-f]{32}$/.test(k)));
  assert.equal(keys[0], await centralItemKey('MOTO', 1, 'MOTO1000X', 'Motorsåg', 'Uppföljning.'));
  assert.notEqual(keys[0], await centralItemKey('MOTO', 2, 'MOTO1000X', 'Motorsåg', 'Uppföljning.'));
});

test('radnyckel ger ämne, version och nivå bara för fasta ämnesnivåer', () => {
  assert.deepEqual(syllabusRefFromRowKey('programmeSpecific:PEDG:1:PEDG1000X'), { subject: 'PEDG', version: 1, level: 'PEDG1000X' });
  assert.deepEqual(syllabusRefFromRowKey('specialization:ANAT:2:ANAT1A10X'), { subject: 'ANAT', version: 2, level: 'ANAT1A10X' });
  for (const key of ['alternative:foundation:A:1:A1+B:1:B1', 'block:x', 'meta:diplomaWork', 'foundation:PEDG:0:PEDG1000X', 'foundation:PEDG:1'])
    assert.equal(syllabusRefFromRowKey(key), null);
});

test('genererad katalog: index, filer, nycklar och katalog-ID stämmer', async () => {
  const index = JSON.parse(await readFile(new URL('./syllabus-central.index.json', import.meta.url), 'utf8'));
  const dir = new URL('./syllabus-central/', import.meta.url);
  const files = (await readdir(dir)).sort();
  assert.deepEqual(files, index.subjects.map(([c, v]) => `${c}-${v}.json`).sort());
  const subjects = await Promise.all(files.map(async f => JSON.parse(await readFile(new URL(f, dir), 'utf8'))));
  assert.equal(await centralCatalogId(index.source, subjects), index.catalogId);
  const catalog = JSON.parse(await readFile(new URL('./programplan-catalog.generated.json', import.meta.url), 'utf8'));
  for (const s of subjects) {
    const ref = catalog.subjects.find(x => x.code === s.code && x.version === s.version);
    assert.deepEqual(s.levels.map(l => l.code), ref.items.map(i => i.code), `${s.code}-${s.version}`);
    for (const l of s.levels) {
      const counts = new Map();
      for (const section of l.sections) for (const item of section.items) {
        const same = JSON.stringify([section.heading, item.text]), n = counts.get(same) ?? 0; counts.set(same, n + 1);
        assert.equal(item.key, await centralItemKey(s.code, s.version, l.code, section.heading, item.text, n));
      }
    }
  }
  assert.equal(subjects.reduce((n, s) => n + s.levels.reduce((m, l) => m + l.sections.reduce((k, x) => k + x.items.length, 0), 0), 0), 18051);
});
