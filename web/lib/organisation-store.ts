import type { SchoolAddress } from './registry-address.ts';
// Datalager mellan organisationsmodellen och Supabase.
//
// Modellen (organisation-model.ts) äger reglerna och kontrollerna; det här
// lagret översätter mellan dess typer och tabellraderna. Varje skrivning görs
// mot databasen och läses tillbaka, så att radnivåskyddet är det som avgör
// vad som faktiskt gick igenom.

import { supabase, signInDemo, type Client } from './supabase.ts';
import type { Database } from './database.types.ts';
import {
  createOrganisationState,
  schoolTypeNames,
  type Assignment,
  type Offering,
  type OrganisationState,
  type Organizer,
  type Permit,
  type PointPlan,
  type SchoolUnit,
} from './organisation-model.ts';

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
type PlanStatus = Database['public']['Enums']['plan_status'];

const planStatusIn = (s: PlanStatus): PointPlan['status'] =>
  s === 'faststalld' ? 'fastställd' : s;
const planStatusOut = (s: PointPlan['status']): PlanStatus =>
  s === 'fastställd' ? 'faststalld' : s;

function toUnit(
  row: Row<'school_units'>,
  types: Row<'school_unit_types'>[],
  organizer: Organizer,
  pupils: number,
): SchoolUnit {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    organizer,
    municipality: { code: row.municipality_code, name: row.municipality_name ?? row.municipality_code },
    schoolTypes: types
      .filter((t) => t.unit_id === row.id)
      .map((t) => ({
        code: t.school_type,
        name: schoolTypeNames[t.school_type] ?? t.school_type,
        grades: t.grades?.length ? t.grades : undefined,
        programmes: t.programmes.length ? t.programmes : undefined,
      })),
    headMaster: row.head_master ?? undefined,
    locality: row.locality ?? undefined,
    address: row.address as SchoolAddress | undefined,
    status: row.status,
    source: {
      name: row.source_name,
      fetched: row.source_fetched ?? undefined,
      modified: row.source_modified ?? undefined,
      url: row.source_url ?? undefined,
    },
    pupilRegister: {
      source: row.pupil_register_source,
      count: pupils,
      note: 'Elevregistret kopplas per skolenhet, i ett senare steg enligt SS 12000.',
    },
  };
}

function toOffering(row: Row<'offerings'>, permits: Row<'permits'>[], plans: Row<'point_plans'>[], events: Row<'point_plan_events'>[]): Offering {
  return {
    id: row.id,
    unitId: row.unit_id,
    kind: row.kind,
    name: row.name,
    localCode: row.local_code ?? undefined,
    programCode: row.program_code ?? undefined,
    orientationCode: row.orientation_code ?? undefined,
    grades: row.grades ?? undefined,
    cohort: row.cohort,
    status: row.status,
    permits: permits
      .filter((p) => p.offering_id === row.id)
      .map(
        (p): Permit => ({
          id: p.id,
          issuer: p.issuer,
          reference: p.reference,
          decided: p.decided,
          validFrom: p.valid_from,
          validTo: p.valid_to ?? undefined,
          scope: p.scope,
          file: p.file_name ? { name: p.file_name, size: p.file_size ?? 0, type: p.file_type ?? '' } : undefined,
        }),
      ),
    pointPlans: plans
      .filter((p) => p.offering_id === row.id)
      .sort((a, b) => b.version - a.version)
      .map(
        (p): PointPlan => ({
          id: p.id,
          version: p.version,
          status: planStatusIn(p.status),
          specialization: p.specialization,
          decidedOn: p.decided_on ?? undefined,
          history: events
            .filter((e) => e.point_plan_id === p.id)
            .map((e) => ({ id: e.id, time: e.created_at.slice(0, 10), role: e.actor_role, action: e.action, comment: e.comment })),
        }),
      ),
  };
}

/** Skriver modellens exempeldata till en tom databas första gången. */
async function seed(db: Client, organizerId: string) {
  const demo = createOrganisationState();
  const { data: user } = await db.auth.getUser();
  const actor = user.user?.id ?? null;
  const unitIds = new Map<string, string>();
  for (const unit of demo.units) {
    const { data, error } = await db
      .from('school_units')
      .insert({
        organizer_id: organizerId,
        code: unit.code,
        name: unit.name,
        municipality_code: unit.municipality.code,
        municipality_name: unit.municipality.name,
        status: unit.status,
        head_master: unit.headMaster,
        locality: unit.locality,
      address: unit.address ? {...unit.address} : null,
        source_name: unit.source.name,
        source_url: unit.source.url,
        source_fetched: unit.source.fetched,
        source_modified: unit.source.modified,
        pupil_register_source: unit.pupilRegister.source,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Kunde inte lägga upp ${unit.name}: ${error.message}`);
    unitIds.set(unit.id, data.id);
    const types = unit.schoolTypes.map((t) => ({
      unit_id: data.id,
      school_type: t.code,
      grades: t.grades ?? null,
      programmes: t.programmes ?? [],
    }));
    if (types.length) {
      const { error: typeError } = await db.from('school_unit_types').insert(types);
      if (typeError) throw new Error(`Kunde inte lägga upp skolformer: ${typeError.message}`);
    }
  }
  for (const offering of demo.offerings) {
    const { data, error } = await db
      .from('offerings')
      .insert({
        organizer_id: organizerId,
        unit_id: unitIds.get(offering.unitId)!,
        kind: offering.kind,
        name: offering.name,
        local_code: offering.localCode,
        program_code: offering.programCode,
        orientation_code: offering.orientationCode,
        grades: offering.grades,
        cohort: offering.cohort,
        status: offering.status,
      })
      .select('id')
      .single();
    if (error) throw new Error(`Kunde inte lägga upp ${offering.name}: ${error.message}`);
    if (offering.permits.length) {
      const { error: permitError } = await db.from('permits').insert(
        offering.permits.map((p) => ({
          organizer_id: organizerId,
          offering_id: data.id,
          issuer: p.issuer,
          reference: p.reference,
          decided: p.decided,
          valid_from: p.validFrom,
          valid_to: p.validTo ?? null,
          scope: p.scope,
        })),
      );
      if (permitError) throw new Error(`Kunde inte lägga upp tillstånd: ${permitError.message}`);
    }
    for (const plan of offering.pointPlans) {
      // Radnivåskyddet tillåter bara utkast som ny rad; en fastställd plan
      // uppstår genom att huvudmannen fastställer utkastet. Seedningen går
      // därför samma väg som gränssnittet.
      const { data: planRow, error: planError } = await db
        .from('point_plans')
        .insert({
          organizer_id: organizerId,
          offering_id: data.id,
          version: plan.version,
          status: 'utkast',
          specialization: plan.specialization,
        })
        .select('id')
        .single();
      if (planError) throw new Error(`Kunde inte lägga upp poängplan: ${planError.message}`);
      if (plan.status !== 'utkast') {
        const { error: decideError } = await db
          .from('point_plans')
          .update({ status: planStatusOut(plan.status), decided_on: plan.decidedOn ?? null })
          .eq('id', planRow.id);
        if (decideError) throw new Error(`Kunde inte fastställa poängplan: ${decideError.message}`);
      }
      const events = plan.history.map((h) => ({
        point_plan_id: planRow.id,
        actor,
        actor_role: h.role,
        action: h.action,
        comment: h.comment,
      }));
      if (events.length) {
        const { error: eventError } = await db.from('point_plan_events').insert(events);
        if (eventError) throw new Error(`Kunde inte lägga upp poängplanens historik: ${eventError.message}`);
      }
    }
  }
  for (const assignment of demo.assignments) {
    const { data, error } = await db
      .from('assignments')
      .insert({ organizer_id: organizerId, name: assignment.name, role: assignment.role })
      .select('id')
      .single();
    if (error) throw new Error(`Kunde inte lägga upp uppdrag: ${error.message}`);
    const units = assignment.unitIds.map((id) => ({ assignment_id: data.id, unit_id: unitIds.get(id)! })).filter((r) => r.unit_id);
    if (units.length) {
      const { error: unitError } = await db.from('assignment_units').insert(units);
      if (unitError) throw new Error(`Kunde inte koppla uppdrag till skolenhet: ${unitError.message}`);
    }
  }
}

/** Huvudmannen för den inloggade. Flera användare delar huvudman, så det här
 *  läses ur databasens egen funktion i stället för ur profiltabellen. */
async function currentOrganizer(db: Client): Promise<string> {
  const { data, error } = await db.rpc('current_organizer_id');
  if (error) throw new Error(`Kunde inte läsa huvudmannen: ${error.message}`);
  if (!data) throw new Error('Användaren är inte knuten till någon huvudman.');
  return data;
}

/** Läser hela huvudmannens grund. Seedar exempeldata om databasen är tom. */
export async function loadOrganisation(pupilCount = 0): Promise<OrganisationState> {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  await signInDemo();
  const organizerId = await currentOrganizer(db);

  const { data: organizerRow, error: organizerError } = await db.from('organizers').select('*').eq('id', organizerId).single();
  if (organizerError) throw new Error(`Kunde inte läsa huvudmannen: ${organizerError.message}`);
  const organizer: Organizer = {
    name: organizerRow.name,
    organizationNumber: organizerRow.organization_number ?? undefined,
    type: organizerRow.type,
  };

  let { data: units, error: unitError } = await db.from('school_units').select('*').order('created_at');
  if (unitError) throw new Error(`Kunde inte läsa skolenheter: ${unitError.message}`);
  if (!units?.length) {
    // En avbruten seedning får inte lämna halva exempeldata kvar; nästa
    // laddning ska kunna göra om den från början.
    try {
      await seed(db, organizerId);
    } catch (e) {
      await db.from('school_units').delete().eq('organizer_id', organizerId);
      await db.from('assignments').delete().eq('organizer_id', organizerId);
      throw e;
    }
    ({ data: units, error: unitError } = await db.from('school_units').select('*').order('created_at'));
    if (unitError) throw new Error(`Kunde inte läsa skolenheter: ${unitError.message}`);
  }

  const [types, offerings, permits, plans, events, assignments, assignmentUnits, log] = await Promise.all([
    db.from('school_unit_types').select('*'),
    db.from('offerings').select('*').order('created_at'),
    db.from('permits').select('*').order('created_at'),
    db.from('point_plans').select('*').order('version'),
    db.from('point_plan_events').select('*').order('created_at', { ascending: false }),
    db.from('assignments').select('*').order('created_at'),
    db.from('assignment_units').select('*'),
    db.from('organisation_events').select('*').order('created_at', { ascending: false }).limit(50),
  ]);

  const rows = <T,>(r: { data: T[] | null; error: { message: string } | null }, what: string): T[] => {
    if (r.error) throw new Error(`Kunde inte läsa ${what}: ${r.error.message}`);
    return r.data ?? [];
  };

  return {
    organizer,
    units: (units ?? []).map((u) => toUnit(u, rows(types, 'skolformer'), organizer, pupilCount)),
    activeUnitId: units?.[0]?.id ?? '',
    offerings: rows(offerings, 'utbildningar').map((o) =>
      toOffering(o, rows(permits, 'tillstånd'), rows(plans, 'poängplaner'), rows(events, 'poängplanshändelser')),
    ),
    assignments: rows(assignments, 'uppdrag').map(
      (a): Assignment => ({
        id: a.id,
        name: a.name,
        role: a.role,
        unitIds: rows(assignmentUnits, 'uppdrag').filter((au) => au.assignment_id === a.id).map((au) => au.unit_id),
      }),
    ),
    log: rows(log, 'händelser').map((e) => ({
      id: e.id,
      time: e.created_at.slice(11, 16),
      role: e.actor_role,
      action: e.action,
      comment: e.comment,
    })),
  };
}

async function logEvent(db: Client, organizerId: string, action: string, comment: string) {
  const { data } = await db.auth.getUser();
  await db.from('organisation_events').insert({
    organizer_id: organizerId,
    actor: data.user?.id,
    actor_role: 'huvudman',
    action,
    comment,
  });
}


/** Lägger till en skolenhet ur registret och sparar registrets svar. */
export async function saveUnitFromRegistry(unit: SchoolUnit, payload: unknown, sourceUrl?: string, principalId?: string, principalName?: string) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const {data,error} = await db.rpc('import_school_unit', {
    unit_data: JSON.parse(JSON.stringify({...unit,source:{...unit.source,url:sourceUrl??unit.source.url}})),
    registry_payload: JSON.parse(JSON.stringify(payload)),
    principal_id: principalId,
    principal_name: principalName,
  });
  if(error) throw new Error(error.code==='23505'?`${unit.name} finns redan bland huvudmannens skolenheter.`:`Kunde inte spara skolenheten: ${error.message}`);
  return data;
}

export async function savePrincipal(unitId:string, principalId?:string, name?:string) {
  const db=supabase();
  if(!db)throw new Error('Ingen backend konfigurerad.');
  const {error}=await db.rpc('appoint_school_principal',{school_id:unitId,principal_id:principalId,principal_name:name});
  if(error)throw new Error(`Kunde inte utse rektor: ${error.message}`);
}

export async function saveGrades(unitId: string, grades: number[]) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const { error } = await db.from('school_unit_types').update({ grades }).eq('unit_id', unitId).eq('school_type', 'GR');
  if (error) throw new Error(`Kunde inte spara årskurserna: ${error.message}`);
  await db.from('offerings').update({ grades }).eq('unit_id', unitId).eq('kind', 'grundskola');
}

export async function deleteUnit(unitId: string, name: string) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const org = await currentOrganizer(db);
  const { error } = await db.from('school_units').delete().eq('id', unitId);
  if (error) throw new Error(`Kunde inte ta bort skolenheten: ${error.message}`);
  await logEvent(db, org, 'Skolenhet borttagen', `${name} och dess planerade utbildningar.`);
}

export async function saveOffering(offering: Offering) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const org = await currentOrganizer(db);
  const { data, error } = await db
    .from('offerings')
    .insert({
      organizer_id: org,
      unit_id: offering.unitId,
      kind: offering.kind,
      name: offering.name,
      local_code: offering.localCode,
      program_code: offering.programCode,
      orientation_code: offering.orientationCode,
      grades: offering.grades,
      cohort: offering.cohort,
      status: offering.status,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Kunde inte spara utbildningen: ${error.message}`);
  await logEvent(db, org, 'Utbildning tillagd', offering.name);
  return data.id;
}

export async function updateOfferingRow(id: string, patch: Partial<Pick<Offering, 'name' | 'localCode' | 'cohort' | 'status'>>) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const { error } = await db
    .from('offerings')
    .update({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.localCode !== undefined ? { local_code: patch.localCode || null } : {}),
      ...(patch.cohort !== undefined ? { cohort: patch.cohort } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    })
    .eq('id', id);
  if (error) throw new Error(`Kunde inte spara ändringen: ${error.message}`);
}

export async function deleteOffering(id: string, name: string) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const org = await currentOrganizer(db);
  const { error } = await db.from('offerings').delete().eq('id', id);
  if (error) throw new Error(`Kunde inte ta bort utbildningen: ${error.message}`);
  await logEvent(db, org, 'Utbildning borttagen', name);
}

export async function savePermit(offeringId: string, permit: Omit<Permit, 'id'>) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const org = await currentOrganizer(db);
  const { error } = await db.from('permits').insert({
    organizer_id: org,
    offering_id: offeringId,
    issuer: permit.issuer,
    reference: permit.reference,
    decided: permit.decided,
    valid_from: permit.validFrom,
    valid_to: permit.validTo ?? null,
    scope: permit.scope,
    file_name: permit.file?.name,
    file_size: permit.file?.size,
    file_type: permit.file?.type,
  });
  if (error) throw new Error(`Kunde inte spara tillståndet: ${error.message}`);
  await logEvent(db, org, 'Tillstånd registrerat', `${permit.issuer} ${permit.reference}.`);
}

export async function deletePermit(id: string) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const { error } = await db.from('permits').delete().eq('id', id);
  if (error) throw new Error(`Kunde inte ta bort tillståndet: ${error.message}`);
}

export async function saveAssignmentUnit(assignmentId: string, unitId: string, on: boolean) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const { error } = on
    ? await db.from('assignment_units').insert({ assignment_id: assignmentId, unit_id: unitId })
    : await db.from('assignment_units').delete().eq('assignment_id', assignmentId).eq('unit_id', unitId);
  if (error && error.code !== '23505') throw new Error(`Kunde inte spara uppdraget: ${error.message}`);
}

export async function savePointPlanDraft(offeringId: string, version: number, specialization: string[], comment: string) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const org = await currentOrganizer(db);
  const { data, error } = await db
    .from('point_plans')
    .insert({ organizer_id: org, offering_id: offeringId, version, status: 'utkast', specialization })
    .select('id')
    .single();
  if (error)
    throw new Error(
      error.code === '23505' ? 'Det finns redan ett utkast för utbildningen.' : `Kunde inte skapa poängplanen: ${error.message}`,
    );
  await savePointPlanEvent(data.id, 'rektor', 'Utkast påbörjat', comment);
  return data.id;
}

export async function savePointPlanPicks(planId: string, specialization: string[]) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const { error } = await db.from('point_plans').update({ specialization }).eq('id', planId);
  if (error) throw new Error(`Kunde inte spara programfördjupningen: ${error.message}`);
}

export async function savePointPlanEvent(planId: string, role: Database['public']['Enums']['app_role'], action: string, comment: string) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const { data: user } = await db.auth.getUser();
  const { error } = await db
    .from('point_plan_events')
    .insert({ point_plan_id: planId, actor: user.user?.id, actor_role: role, action, comment });
  if (error) throw new Error(`Kunde inte spara händelsen: ${error.message}`);
}

/** Fastställer ett utkast och markerar den tidigare gällande versionen som ersatt. */
export async function decidePointPlan(offeringId: string, planId: string, version: number, decidedOn: string, comment: string) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const org = await currentOrganizer(db);
  const { data: user } = await db.auth.getUser();
  const previous = await db.from('point_plans').select('id').eq('offering_id', offeringId).eq('status', 'faststalld').maybeSingle();
  if (previous.data) {
    const { error } = await db.from('point_plans').update({ status: 'ersatt' }).eq('id', previous.data.id);
    if (error) throw new Error(`Kunde inte ersätta den tidigare versionen: ${error.message}`);
    await savePointPlanEvent(previous.data.id, 'huvudman', 'Ersatt', `Ersatt av version ${version}.`);
  }
  const { error } = await db
    .from('point_plans')
    .update({ status: 'faststalld', decided_on: decidedOn, decided_by: user.user?.id })
    .eq('id', planId);
  if (error) throw new Error(`Kunde inte fastställa poängplanen: ${error.message}`);
  await savePointPlanEvent(planId, 'huvudman', 'Fastställd', comment);
  await logEvent(db, org, 'Poängplan fastställd', `Version ${version}. ${comment}`);
}

/** Uppdaterar en befintlig skolenhets grunduppgifter ur registret. */
export async function updateUnitFromRegistry(unitId: string, unit: SchoolUnit, payload: unknown, sourceUrl?: string) {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  const org = await currentOrganizer(db);
  const { error } = await db
    .from('school_units')
    .update({
      code: unit.code,
      name: unit.name,
      municipality_code: unit.municipality.code,
      municipality_name: unit.municipality.name,
      status: unit.status,
      head_master: unit.headMaster,
      locality: unit.locality,
      address: unit.address ? {...unit.address} : null,
      source_name: unit.source.name,
      source_url: unit.source.url,
      source_fetched: unit.source.fetched,
      source_modified: unit.source.modified,
    })
    .eq('id', unitId);
  if (error)
    throw new Error(
      error.code === '23505' ? `${unit.name} finns redan bland huvudmannens skolenheter.` : `Kunde inte spara skolenheten: ${error.message}`,
    );
  await db.from('school_unit_types').delete().eq('unit_id', unitId);
  const types = unit.schoolTypes.map((t) => ({
    unit_id: unitId,
    school_type: t.code,
    grades: t.grades ?? null,
    programmes: t.programmes ?? [],
  }));
  if (types.length) {
    const { error: typeError } = await db.from('school_unit_types').insert(types);
    if (typeError) throw new Error(`Kunde inte spara skolformerna: ${typeError.message}`);
  }
  const { data: user } = await db.auth.getUser();
  await db.from('registry_snapshots').insert({
    unit_code: unit.code,
    fetched_by: user.user?.id,
    source_url: sourceUrl ?? unit.source.url ?? 'okänd',
    payload: payload as never,
  });
  await logEvent(db, org, 'Skolenhet hämtad', `${unit.name} (${unit.code}) ur Skolenhetsregistret.`);
}
