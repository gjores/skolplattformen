// Klient mot Supabase. Skapas bara när adress och nyckel finns; annars kör
// appen vidare med sessionsdata som förut. Nyckeln är projektets anon-nyckel,
// avsedd att ligga i klienten; skyddet ligger i radnivåskyddet i databasen.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type Client = SupabaseClient<Database>;

let client: Client | null = null;
export function supabase(): Client | null {
  if (!url || !key) return null;
  client ??= createClient<Database>(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

export const hasBackend = Boolean(url && key);

/**
 * Exempelinloggning för förhandsversionen: anonym användare knuten till
 * demohuvudmannen med rollen huvudman. Ingen verklig behörighetskontroll.
 */
export async function signInDemo(name = 'Exempelanvändare') {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const { data: session } = await db.auth.getSession();
  if (!session.session) {
    const { error } = await db.auth.signInAnonymously();
    if (error) throw new Error(`Kunde inte logga in: ${error.message}`);
  }
  const { data, error } = await db.rpc('bootstrap_demo_profile', { display_name: name });
  if (error) throw new Error(`Kunde inte knyta användaren till huvudmannen: ${error.message}`);
  return data;
}
