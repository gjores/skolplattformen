import { supabase } from './supabase.ts';
import type { ClassTimplan } from './cohort-model.ts';

function client() {
  const db = supabase();
  if (!db) throw new Error('Databasen är inte ansluten.');
  return db;
}
export async function copyCohortInDatabase(sourceId: string, year: number) {
  const { data, error } = await client().rpc('copy_offering_cohort', {
    source_id: sourceId,
    target_year: year,
  });
  if (error) throw new Error(error.message);
  return data;
}
export async function loadClassTimplans(
  unitId: string,
): Promise<ClassTimplan[]> {
  const { data, error } = await client()
    .from('class_timplans')
    .select('*')
    .eq('unit_id', unitId);
  if (error)
    throw new Error(`Kunde inte läsa klasskopplingarna: ${error.message}`);
  return (data ?? []).map((r) => ({
    unitId: r.unit_id,
    className: r.class_name,
    startYear: r.start_year,
    timplanId: r.timplan_id,
    columnId: r.column_id,
  }));
}
export async function saveClassTimplan(b: ClassTimplan) {
  const { error } = await client()
    .from('class_timplans')
    .upsert({
      unit_id: b.unitId,
      class_name: b.className,
      start_year: b.startYear,
      timplan_id: b.timplanId,
      column_id: b.columnId,
    });
  if (error)
    throw new Error(`Kunde inte spara klasskopplingen: ${error.message}`);
}
export async function deleteClassTimplan(b: ClassTimplan) {
  const { error } = await client()
    .from('class_timplans')
    .delete()
    .eq('unit_id', b.unitId)
    .eq('class_name', b.className)
    .eq('start_year', b.startYear);
  if (error)
    throw new Error(`Kunde inte ta bort klasskopplingen: ${error.message}`);
}
