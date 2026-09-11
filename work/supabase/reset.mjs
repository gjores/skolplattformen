// Tömmer demohuvudmannens data så att exempeldata kan seedas om.
//   node --env-file=web/.env.local work/supabase/reset.mjs
import { supabase, signInDemo } from '../../web/lib/supabase.ts';
const db = supabase();
await signInDemo('Återställning');
for (const table of ['school_years', 'timplans', 'school_units', 'assignments', 'organisation_events', 'registry_snapshots']) {
  const { error } = await db.from(table).delete().not('id', 'is', null);
  console.log(table, error ? `fel: ${error.message}` : 'tömd');
}
await db.auth.signOut();
