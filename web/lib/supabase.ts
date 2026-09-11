// Klientgräns för fas 1. Ingen Supabase-klient skapas i appen: exempelläget
// arbetar i minnet och skyddat läge är stängt tills fas 2 öppnar verifierad
// kontoåtkomst. Förekomst av URL/nyckel i miljön är ingen behörighet.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';
import { runtime } from './runtime-mode.ts';

export type Client = SupabaseClient<Database>;

let injected: Client | null = null;

/** Returnerar en klient endast när ett prov uttryckligen installerat en. */
export function supabase(): Client | null {
  return injected;
}

/** Fas 1: alltid false. Vyer ska läsa runtime.mode, inte gissa på nycklar. */
export const hasBackend = false;

export { runtime };

/** Endast för Node-prov med kontrollerad transport. Appkod får inte anropa den. */
export function installClientForTests(client: Client | null): void {
  injected = client;
}
