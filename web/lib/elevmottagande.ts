export const ELEVMOTTAGANDE_LIMIT = 200;

export type ElevmottagandeScope = {
  unitId: string;
  schoolYear: number;
  offeringId: string | null;
};

export type ElevmottagandeReadRequest = Omit<ElevmottagandeScope, 'offeringId'> & {
  on: string;
  offeringId?: string | null;
};

export type ElevmottagandeMembership = {
  id: string;
  classId: string;
  className: string;
  startsOn: string;
  endsOn: string | null;
};

export type ElevmottagandeRosterRow = {
  pupilId: string;
  placementId: string;
  name: string;
  offeringId: string;
  educationName: string;
  startsOn: string;
  endsOn: string | null;
  version: number;
  classification: 'unplaced' | 'booked' | 'registered' | 'historical';
  membership: ElevmottagandeMembership | null;
  canAllocate: boolean;
};

export type ElevmottagandeClass = {
  id: string;
  name: string;
  offeringId: string;
  startsOn: string | null;
  endsOn: string | null;
  count: number;
  timetable: null | { planId: string; name: string; version: number; columnId: string; revision: number };
};

export type ElevmottagandeRead = ElevmottagandeScope & {
  on: string;
  canAllocate: boolean;
  latestCommandId: string | null;
  offerings: Array<{ id: string; name: string }>;
  classes: ElevmottagandeClass[];
  timetableChoices: Array<{ id: string; name: string; version: number; offeringId: string }>;
  rows: ElevmottagandeRosterRow[];
};

export type ElevmottagandeAllocation = { placementId: string; classId: string; startsOn: string };
export type ElevmottagandeAllocationRequest = ElevmottagandeScope & (
  | { action: 'preview'; on: string; rows: ElevmottagandeAllocation[] }
  | { action: 'save'; on: string; commandId: string; previewToken: string }
  | { action: 'status'; commandId?: string }
);

export type ElevmottagandeAllocationReason =
  | 'existing_membership' | 'placement_period' | 'class_period' | 'class_education' | 'source_owned'
  | 'source_changed' | 'no_access';

type AllocationRow = ElevmottagandeAllocation & {
  pupilId: string;
  name: string;
  className: string;
  membership: ElevmottagandeMembership | null;
  reason: ElevmottagandeAllocationReason | null;
};

export type ElevmottagandePreview = {
  previewToken: string;
  rows: Array<AllocationRow & { status: 'ready' | 'blocked' }>;
  classes: Array<{ id: string; name: string; on: string; before: number; after: number }>;
};

export type ElevmottagandeReceipt = {
  commandId: string;
  rows: Array<AllocationRow & { status: 'saved' | 'blocked' | 'changed' }>;
};
