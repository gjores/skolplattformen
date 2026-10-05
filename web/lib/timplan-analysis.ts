// Regelförankrad analys av timplaner för grundskola och introduktionsprogram.
// RED-stadiet: bara kontrakt (typer) och en tom analys, så att proven fallerar på sina påståenden.

export type Category = 'fel' | 'risk' | 'info' | 'ok';
export type Stage = 'låg' | 'mellan' | 'hög';
export type StageHours = Record<Stage, number>;
export type RuleSource = { url: string; label: string; verifiedOn: string; validFrom: string | null; validTo: string | null };
export type GrundskolaProfile = {
  id: string; schoolKind: 'grundskola'; source: RuleSource;
  stageHours: StageHours; total: number;
  subjects: { rowId: string; name: string; hours: StageHours; protected: boolean; shared?: { stages: Stage[]; hours: number } }[];
  groups: { rowId: string; name: string; hours: StageHours; memberStages: Stage[]; members: { rowId: string; name: string; minimum: StageHours }[] }[];
  schoolChoice: { rowId: string; maxHours: number; maxReductionPercent: number };
};
export type ImProfile = {
  id: string; schoolKind: 'introduktionsprogram'; source: RuleSource;
  minTeachingHoursPerWeek: number;
  rows: { rowId: string; name: string; kind: 'undervisning' | 'annan' }[];
};
export type RuleProfile = GrundskolaProfile | ImProfile;
export type ActionTarget =
  | { type: 'cell'; rowId: string; columnId: string }
  | { type: 'row'; rowId: string; columnIds: string[] }
  | null;
export type TimplanIssue = {
  issueId: string; ruleId: string; category: Category; title: string; detail: string;
  actual: number | null; expected: number | null; unit: 'timmar' | 'timmar per vecka' | null;
  basis: 'regel' | 'lokal' | 'underlag'; sourceUrl: string | null; validFrom: string | null; validTo: string | null;
  localParameter: { name: string; value: number } | null;
  mandatory: boolean; affectedRows: string[]; affectedColumns: string[]; actionTarget: ActionTarget;
};
export type AnalysisInput = {
  schoolKind: 'grundskola' | 'introduktionsprogram';
  schoolId: string; savedRevision: number | null; analysisVersion: string;
  appliesOn: string | null; profile: RuleProfile | null;
  grades?: number[]; cells: Record<string, number[]>;
  valuesAre: 'saved' | 'own-unsaved';
};
export type TimplanAnalysis = {
  analysisVersion: string; schoolKind: AnalysisInput['schoolKind']; schoolId: string; savedRevision: number | null;
  profileId: string | null; issues: TimplanIssue[]; counts: Record<Category, number>;
};

export const GRUNDSKOLA_PROFILE: GrundskolaProfile | null = null;

export function analyseTimplan(input: AnalysisInput): TimplanAnalysis {
  return {
    analysisVersion: input.analysisVersion, schoolKind: input.schoolKind, schoolId: input.schoolId,
    savedRevision: input.savedRevision, profileId: null, issues: [], counts: { fel: 0, risk: 0, info: 0, ok: 0 },
  };
}
