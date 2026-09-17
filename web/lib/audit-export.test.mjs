import assert from 'node:assert/strict';
import test from 'node:test';

import { csvCell, csvRow } from './audit-export.ts';

test('CSV neutraliserar formler och kontrolltecken i början av cellen', () => {
  for (const value of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\tformel', '\rformel']) {
    assert.match(csvCell(value), /^(?:'|"')/u, value);
  }
});

test('CSV citerar semikolon, citattecken och radbrytningar utan att ändra Unicode', () => {
  assert.equal(csvCell('Åsa; "Öhman"\nrad två'), '"Åsa; ""Öhman""\nrad två"');
  assert.equal(csvRow(['svenska', 'åäö']), 'svenska;åäö');
});
