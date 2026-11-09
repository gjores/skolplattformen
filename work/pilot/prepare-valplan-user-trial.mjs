// Additive user-trial data for valbara block on the protected target: synthetic pupils in
// Nystartsgymnasiet's classes and IdP accounts for one pupil and two guardians.
// Never resets data or changes mandates. Provisional: the accounts are bound to pupil 1 here, attested by the school's rektor,
// since binding belongs to onboarding from the pupil register and not to the choice flow. An account is bound after its first login.
// Passwords go only to a private, git-ignored file. `--rensa` removes what this script created.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { assertTarget } from './verify-target.mjs';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const postgres = require('postgres');
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--rensa')) throw new Error('REFUSED: bara --rensa är tillåten');
const cleanup = args[0] === '--rensa';
const target = await assertTarget('protected', { requireIdp: true });
const db = postgres(target.dbUrl, { max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} });
const privatePath = new URL('./targets/protected/valplan-user-trial-private.json', import.meta.url);
const customer = '33000000-0000-4000-8000-000000000001', unit = 'efe5d3b6-40f6-46b9-ac1b-91f3b42944db';
const id = n => `55100200-0000-4000-8000-${String(n).padStart(12, '0')}`;
const pupils = [[1, 'BFS27'], [2, 'BFS27'], [3, 'SAB27'], [4, 'SAB27'], [5, 'TEMI28'], [6, 'TEMI28']];
const accounts = [['vp.elev', 'pupil', 'Elev'], ['vp.vardnadshavare1', 'guardian', 'Vårdnadshavare 1'], ['vp.vardnadshavare2', 'guardian', 'Vårdnadshavare 2']];
// Binding id and whether the account confirms choices. Guardian 2 sees the choice without confirming it.
const bindings = { 'vp.elev': [id(101), false], 'vp.vardnadshavare1': [id(102), true], 'vp.vardnadshavare2': [id(103), false] };
const bindingSource = 'Syntetiskt användarprov VP-15';
const realm = new URL(target.idp.issuer).pathname.split('/').pop();

async function keycloak(route, method = 'GET', body) {
  const auth = await fetch(target.idp.publicUrl + '/realms/master/protocol/openid-connect/token', { method: 'POST', signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: target.idp.adminUser, password: target.idp.adminPassword }) });
  if (!auth.ok) throw new Error('IDP_ADMIN_LOGIN_FAILED');
  const r = await fetch(target.idp.publicUrl + '/admin/realms/' + realm + route, { method, signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + (await auth.json()).access_token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!r.ok) throw new Error('IDP_' + method + '_' + r.status);
  return r.status === 204 || r.status === 201 ? null : r.json();
}
const findUser = async username => { const found = await keycloak('/users?exact=true&username=' + encodeURIComponent(username)); if (found.length > 1) throw new Error('REFUSED: flera IdP-konton'); return found[0] ?? null; };
const journal = existsSync(privatePath) ? JSON.parse(readFileSync(privatePath, 'utf8')) : { accounts: [] };
const save = () => writeFileSync(privatePath, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });

async function prepare() {
  const result = await db.begin(async tx => {
    const [school] = await tx`select s.organizer_id from public.school_units s join public.organizers o on o.id=s.organizer_id join public.customers c on c.id=o.customer_id
      where s.id=${unit} and c.id=${customer} and c.name='Syntetisk fas 3 kund 1' and s.name='Nystartsgymnasiet'`;
    if (!school) throw new Error('REFUSED: avsedd syntetisk skola saknas');
    const classes = new Map((await tx`select id, name, offering_id, starts_on::text from public.school_classes where unit_id=${unit}`).map(c => [c.name, c]));
    const free = (await tx`select personal_number from public.synthetic_pupil_numbers n where not exists (select 1 from public.pupils p where p.personal_number=n.personal_number)
      order by personal_number desc limit ${pupils.length}`).map(r => r.personal_number);
    let added = 0;
    for (const [n, className] of pupils) {
      const c = classes.get(className);
      if (!c?.starts_on) throw new Error('REFUSED: klassen ' + className + ' saknas eller saknar startdatum');
      const [existing] = await tx`select organizer_id, customer_id from public.pupils where id=${id(n)}`;
      if (existing) {
        if (existing.organizer_id !== school.organizer_id || existing.customer_id !== customer) throw new Error('REFUSED: prov-ID används av annan elev');
        continue; // Keep earlier runs and anything the trial changed.
      }
      const number = free.shift();
      if (!number) throw new Error('REFUSED: syntetiska personnummer saknas');
      await tx`insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name)
        values(${id(n)},${customer},${school.organizer_id},${'Syntetisk valprovselev ' + n},${number},${'Elev V' + n})`;
      await tx`insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on)
        values(${id(n + 10)},${customer},${school.organizer_id},${id(n)},${unit},${c.offering_id},${c.starts_on})`;
      await tx`insert into public.pupil_class_memberships(customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on)
        values(${customer},${school.organizer_id},${id(n)},${unit},${c.id},${id(n + 10)},${c.starts_on})`;
      added++;
    }
    const counts = await tx`select c.name, count(m.id)::int pupils from public.school_classes c left join public.pupil_class_memberships m on m.class_id=c.id
      where c.unit_id=${unit} and m.pupil_id = any(${pupils.map(([n]) => id(n))}::uuid[]) group by c.name order by c.name`;
    return { added, classes: Object.fromEntries(counts.map(r => [r.name, r.pupils])) };
  });
  journal.pupilIds = pupils.map(([n]) => id(n));
  save();
  for (const [username, role, label] of accounts) {
    const known = journal.accounts.find(a => a.username === username), user = await findUser(username);
    if (user && !known) throw new Error('REFUSED: IdP-kontot ' + username + ' finns men saknas i den privata filen');
    if (user) continue;
    const password = randomBytes(18).toString('base64url');
    await keycloak('/users', 'POST', { username, email: username + '@synthetic.example.test', firstName: 'Syntetisk', lastName: label, enabled: true, emailVerified: true, requiredActions: [] });
    const created = await findUser(username);
    await keycloak('/users/' + created.id + '/reset-password', 'PUT', { type: 'password', value: password, temporary: false });
    journal.accounts = journal.accounts.filter(a => a.username !== username).concat({ username, role, subject: created.id, password, pupil: id(1) });
    save();
  }
  const bound = await bind();
  return { ...result, accounts: accounts.map(([username, role]) => ({ username, role, bound: bound[username] })), privateFile: 'work/pilot/targets/protected/valplan-user-trial-private.json' };
}

// What the school's attestation does in the app: passive customer membership and a binding from today, without end.
async function bind() {
  const state = {};
  await db.begin(async tx => {
    const rektor = await tx`select a.id, a.customer_id, a.organizer_id from public.access_assignments a where a.unit_id=${unit} and a.customer_id=${customer}
      and a.function='rektor' and a.ended_at is null and a.valid_from<=public.app_today() and (a.valid_to is null or a.valid_to>=public.app_today())`;
    if (rektor.length !== 1) throw new Error('REFUSED: skolan behöver exakt ett aktuellt rektorsuppdrag');
    journal.membershipIds ??= [];
    for (const [username, role] of accounts) {
      const known = journal.accounts.find(a => a.username === username), [bindingId, confirms] = bindings[username];
      const [identity] = await tx`select id from public.identities where issuer=${target.idp.issuer} and subject=${known.subject} and last_login_at is not null`;
      if (!identity) { state[username] = 'logga in en gång och kör skriptet igen'; continue; }
      const [existing] = await tx`select identity_id, revoked_at from public.elective_participant_bindings where id=${bindingId}`;
      if (existing) {
        if (existing.identity_id !== identity.id) throw new Error('REFUSED: provkopplingen gäller ett annat konto');
        state[username] = existing.revoked_at ? 'koppling borttagen i appen' : 'kopplat'; continue;
      }
      const [member] = await tx`select status from public.memberships where identity_id=${identity.id} and customer_id=${customer}`;
      if (member && member.status !== 'active') throw new Error('REFUSED: kontots medlemskap är spärrat');
      if (!member) {
        const [created] = await tx`insert into public.memberships(identity_id,customer_id) values(${identity.id},${customer}) returning id`;
        journal.membershipIds.push(created.id);
      }
      await tx`insert into public.elective_participant_bindings(id,customer_id,organizer_id,unit_id,pupil_id,identity_id,participant,confirmation_required,starts_on,source_reference,attested_by_assignment_id)
        values(${bindingId},${customer},${rektor[0].organizer_id},${unit},${id(1)},${identity.id},${role},${confirms},public.app_today(),${bindingSource},${rektor[0].id})`;
      state[username] = 'kopplat';
    }
  });
  save();
  return state;
}

async function remove() {
  const ids = pupils.map(([n]) => id(n)), own = Object.values(bindings).map(([b]) => b);
  const result = await db.begin(async tx => {
    const [used] = await tx`select (select count(*) from public.valplan_choices where pupil_id = any(${ids}::uuid[]))::int choices,
      (select count(*) from public.elective_participant_bindings where pupil_id = any(${ids}::uuid[]) and id <> all(${own}::uuid[]))::int bindings,
      (select count(*) from public.study_group_memberships where pupil_id = any(${ids}::uuid[]))::int groups`;
    if (used.choices || used.bindings || used.groups) throw new Error('REFUSED: eleverna har val, kontokopplingar eller grupper; ta bort dem i appen först');
    await tx`delete from public.elective_participant_bindings where id = any(${own}::uuid[])`;
    await tx`delete from public.memberships where id = any(${journal.membershipIds ?? []}::uuid[])`;
    await tx`delete from public.pupil_class_memberships where pupil_id = any(${ids}::uuid[])`;
    await tx`delete from public.pupil_placements where pupil_id = any(${ids}::uuid[])`;
    return { pupils: (await tx`delete from public.pupils where id = any(${ids}::uuid[]) returning id`).length };
  });
  let removed = 0;
  for (const a of journal.accounts) { const user = await findUser(a.username); if (user && user.id === a.subject) { await keycloak('/users/' + user.id, 'DELETE'); removed++; } }
  journal.accounts = []; journal.pupilIds = []; journal.membershipIds = []; save();
  return { ...result, accounts: removed };
}

try {
  console.log(JSON.stringify({ target: 'protected', school: 'Nystartsgymnasiet', status: 'READY', ...(cleanup ? await remove() : await prepare()) }));
} catch (error) {
  console.error('Provunderlag kunde inte förberedas:', /^REFUSED|^IDP_/.test(error?.message ?? '') ? error.message : /^[A-Z0-9]{5}$/.test(error?.code ?? '') ? error.code : 'TARGET_OR_FIXTURE_CHECK_FAILED');
  process.exitCode = 1;
} finally { await db.end(); }
