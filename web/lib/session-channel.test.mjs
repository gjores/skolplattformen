import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  messageText,
  reduceEpochHeader,
  shouldLock,
} from './session-channel.ts';

test('en ny kontextepok låser fliken', () => {
  assert.deepEqual(shouldLock({ knownEpoch: 2 }, { type: 'epoch', epoch: 3 }), {
    lock: true,
    reason: 'context',
  });
});

test('samma kontextepok lämnar fliken öppen', () => {
  assert.deepEqual(shouldLock({ knownEpoch: 2 }, { type: 'epoch', epoch: 2 }), {
    lock: false,
  });
});

test('utloggningssignalen låser fliken', () => {
  assert.deepEqual(shouldLock({ knownEpoch: 2 }, { type: 'logged-out' }), {
    lock: true,
    reason: 'logged-out',
  });
});

test('okända kanalmeddelanden ignoreras', () => {
  for (const message of [null, {}, { type: 'epoch', epoch: '3' }, { type: 'other' }]) {
    assert.deepEqual(shouldLock({ knownEpoch: 2 }, message), { lock: false });
  }
});

test('en ny giltig svarsepok upptäcks', () => {
  assert.deepEqual(reduceEpochHeader(1, '2'), { changed: true, epoch: 2 });
});

test('saknad svarsepok behåller känd epok', () => {
  assert.deepEqual(reduceEpochHeader(1, null), { changed: false, epoch: 1 });
});

test('ogiltig svarsepok ignoreras', () => {
  for (const header of ['x', '', '-1', '1.5']) {
    assert.deepEqual(reduceEpochHeader(1, header), { changed: false, epoch: 1 });
  }
});

test('första giltiga svarsepoken blir känd utan kontextlås', () => {
  assert.deepEqual(reduceEpochHeader(null, '7'), { changed: false, epoch: 7 });
});

test('centrala nekandekoder får verksamhetsnära svenska texter', () => {
  assert.equal(messageText('mfa_required'), 'Åtgärden kräver verifiering med engångskod.');
  assert.equal(messageText('membership_blocked'), 'Medlemskapet är spärrat.');
  assert.equal(messageText('assignment_ended'), 'Uppdraget är avslutat.');
  assert.equal(
    messageText('not_found'),
    'Objektet finns inte eller är inte tillgängligt i din kontext.',
  );
});

test('alla serverns felkoder har en särskild svensk text', () => {
  const errorCodes = [
    'no_session',
    'session_expired',
    'session_revoked',
    'no_context',
    'membership_blocked',
    'customer_closed',
    'mfa_required',
    'forbidden',
    'assignment_expired',
    'assignment_ended',
    'assignment_upcoming',
    'invitation_invalid',
    'conflict',
    'context_changed',
    'registry_unavailable',
    'db_unreachable',
    'csrf',
    'idp_registration_failed',
    'login_state_invalid',
    'not_found',
    'bad_request',
  ];

  for (const code of errorCodes) {
    assert.ok(!messageText(code).includes(`kod: ${code}`), `${code} saknar särskild text`);
  }
});

test('okänd felkod återges utan att döljas', () => {
  assert.equal(messageText('ny_kod'), 'Något gick fel (kod: ny_kod).');
});
