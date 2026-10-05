import { parseProgramplanChoiceBlocks, programplanChoiceBlockDiagnostics, programplanAlternativeGroups, defaultProgramplanChoiceBlocks, type ProgramplanChoiceBlock } from './programplan-choice-blocks.ts';
export type CatalogDates = { startDate: string | null; endDate: string | null; canceledDate: string | null; skolfs: string | null };
export type CatalogItem = { code: string; name: string; points: number };
export type CatalogSubject = CatalogDates & {
  code: string; name: string; typeOfSyllabus: string; schoolTypes: string[]; version: number; items: CatalogItem[];
};
export type CatalogBlockSubject = {
  code: string; name: string; points: number; optional: boolean; subjectVersion: number | null; levels: CatalogItem[];
};
export type CatalogOrientation = { code: string; name: string; points: number; subjects: CatalogBlockSubject[] };
export type CatalogProgram = CatalogDates & {
  code: string; name: string; category: string; version: number; foundation: CatalogBlockSubject[];
  programmeSpecific: CatalogBlockSubject[]; orientations: CatalogOrientation[]; specialization: CatalogBlockSubject[];
};
export type CatalogPayload = {
  schemaVersion: 1; source: { url: string; apiVersion: string; fetched: string };
  subjects: CatalogSubject[]; programs: CatalogProgram[];
};
export type ProgramplanCatalog = CatalogPayload & { catalogId: string };
declare const verifiedCatalogBrand: unique symbol;
export type VerifiedProgramplanCatalog = ProgramplanCatalog & {readonly [verifiedCatalogBrand]: true};
const verifiedCatalogs = new WeakSet<object>();
export type ProgramplanLevelRef = { subjectCode: string; subjectVersion: number; itemCode: string; points: number };
export type ProgramplanBasisReference = {
  catalogId: string; programRef: {code: string; version: number}; orientationCode: string | null;
  startedOn: string; specializationRefs: ProgramplanLevelRef[]; choiceBlocks?: ProgramplanChoiceBlock[];
};
export type ProgramplanDiagnostic = { code: string; subjectCode?: string; itemCode?: string; blockId?: string };
export type ProgramplanUnresolvedChoice = {
  kind: 'optional_subject' | 'subject_levels_unresolved' | 'program_rules_unverified'; blockId: string;
  subjectCode?: string; points?: number; category?: string;
};
export type ResolvedProgramplanLevel = ProgramplanLevelRef & { name: string; subjectName: string; optional: boolean };
export type ResolvedProgramplanBlock = {
  id: 'foundation' | 'programmeSpecific' | 'orientation'; name: string;
  subjects: CatalogBlockSubject[]; levels: ResolvedProgramplanLevel[];
};
export type ResolvedProgramplanBasis = {
  program: {code: string; version: number; name: string; category: string} & CatalogDates;
  orientation: {code: string; name: string; points: number} | null;
  startedOn: string; source: CatalogPayload['source']; nationalBlocks: ResolvedProgramplanBlock[];
  subjectPins: {code: string; version: number}[];
  specializationOptions: ResolvedProgramplanLevel[]; selectedSpecialization: ResolvedProgramplanLevel[];
  prerequisiteEvidence: 'not_present_in_snapshot';
};
export type ProgramplanBasisResolution = {
  status: 'resolved' | 'blocked'; catalogId: string | null; programRef: {code:string;version:number} | null;
  diagnostics: ProgramplanDiagnostic[]; unresolvedChoices: ProgramplanUnresolvedChoice[];
  basis: ResolvedProgramplanBasis | null; decisionReady: false; writeReady: false;
};
export class ProgramplanContractError extends Error {
  public code: string;
  constructor(code: string) { super(code); this.code=code; this.name='ProgramplanContractError'; }
}
function invalid(code='invalid_catalog'): never { throw new ProgramplanContractError(code); }
function record(value: unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const prototype=Object.getPrototypeOf(value);
  if ((prototype!==Object.prototype && prototype!==null) || Object.getOwnPropertySymbols(value).length
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>d.get!==undefined||d.set!==undefined)) invalid();
  return value as Record<string,unknown>;
}
function fields(value: unknown, required: string[], optional: string[]=[]): Record<string,unknown> {
  const r=record(value), allowed=new Set([...required,...optional]);
  if (required.some(key=>!Object.hasOwn(r,key)) || Object.getOwnPropertyNames(r).some(key=>!allowed.has(key))) invalid();
  return r;
}
function text(value: unknown, limit=1000): string {
  if (typeof value !== 'string' || !value.length || value.length>limit) invalid();
  return value;
}
function code(value: unknown): string {
  const c=text(value,96);
  if (!/^\p{L}[\p{L}\p{N}_-]*$/u.test(c) || ['constructor','prototype','__proto__'].includes(c)) invalid();
  return c;
}
function integer(value: unknown, min=0, max=100000): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value<min || value>max) invalid();
  return value;
}
function array(value: unknown, limit=20000): unknown[] {
  if (!Array.isArray(value) || value.length>limit) invalid();
  const descriptors=Object.getOwnPropertyDescriptors(value);
  if (Object.getPrototypeOf(value)!==Array.prototype || Object.getOwnPropertySymbols(value).length
    || Object.getOwnPropertyNames(value).length!==value.length+1
    || Object.values(descriptors).some(d=>d.get!==undefined||d.set!==undefined)) invalid();
  for(let index=0;index<value.length;index+=1)if(!Object.hasOwn(value,index))invalid();
  return value;
}
export function catalogDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value) invalid();
  return value;
}
function dates(r: Record<string,unknown>): CatalogDates {
  const result={startDate:r.startDate==null?null:catalogDate(r.startDate),endDate:r.endDate==null?null:catalogDate(r.endDate),
    canceledDate:r.canceledDate==null?null:catalogDate(r.canceledDate),skolfs:r.skolfs==null?null:text(r.skolfs,100)};
  if (result.startDate && result.endDate && result.endDate<result.startDate) invalid();
  return result;
}
function unique<T>(values: T[], key: (value:T)=>string): T[] {
  if (new Set(values.map(key)).size!==values.length) invalid('duplicate_catalog_code');
  return values;
}
function item(value: unknown): CatalogItem {
  const r=fields(value,['code','name','points']);
  return {code:code(r.code),name:text(r.name),points:integer(r.points,0,10000)};
}
function subject(value: unknown): CatalogSubject {
  const r=fields(value,['code','name','typeOfSyllabus','schoolTypes','version','items'],['startDate','endDate','canceledDate','skolfs']);
  const schools=unique(array(r.schoolTypes,20).map(v=>code(v)),v=>v).sort();
  if (!schools.length) invalid();
  return {code:code(r.code),name:text(r.name),typeOfSyllabus:code(r.typeOfSyllabus),schoolTypes:schools,
    version:integer(r.version,1),...dates(r),items:unique(array(r.items,1000).map(item),v=>v.code)};
}
function blockSubject(value: unknown, subjects: CatalogSubject[], normalized: boolean): CatalogBlockSubject {
  const r=fields(value,['code','name','points','optional','levels',...(normalized?['subjectVersion']:[])]);
  const subjectCode=code(r.code), found=subjects.find(s=>s.code===subjectCode);
  if (typeof r.optional!=='boolean') invalid();
  const levels=unique(array(r.levels,1000).map(item),v=>v.code);
  if (levels.length && !found) invalid('catalog_reference_missing');
  for (const level of levels) {
    const national=found!.items.find(i=>i.code===level.code);
    if (!national || national.points!==level.points) invalid('catalog_reference_mismatch');
  }
  const version=found?.version??null;
  if (normalized && r.subjectVersion!==version) invalid('catalog_reference_mismatch');
  return {code:subjectCode,name:text(r.name),points:integer(r.points,0,10000),optional:r.optional,
    subjectVersion:version,levels};
}
function program(value: unknown, subjects: CatalogSubject[], normalized: boolean): CatalogProgram {
  const r=fields(value,['code','name','category','version','foundation','programmeSpecific','orientations','specialization'],['startDate','endDate','canceledDate','skolfs']);
  const block=(v:unknown)=>unique(array(v,1000).map(s=>blockSubject(s,subjects,normalized)),s=>s.code);
  const orientations=unique(array(r.orientations,100).map(value=>{
    const o=fields(value,['code','name','points','subjects']);
    return {code:code(o.code),name:text(o.name),points:integer(o.points,0,10000),subjects:block(o.subjects)};
  }),o=>o.code);
  return {code:code(r.code),name:text(r.name),category:code(r.category),version:integer(r.version,1),...dates(r),
    foundation:block(r.foundation),programmeSpecific:block(r.programmeSpecific),orientations,specialization:block(r.specialization)};
}
function source(value: unknown): CatalogPayload['source'] {
  const r=fields(value,['url','apiVersion','fetched']);
  const url=text(r.url,2000); let parsed: URL;
  try { parsed=new URL(url); } catch { invalid(); }
  if (!['http:','https:'].includes(parsed!.protocol) || parsed!.username || parsed!.password) invalid();
  return {url,apiVersion:text(r.apiVersion,100),fetched:catalogDate(r.fetched)};
}
function payload(sourceValue: unknown, subjectValues: unknown, programValues: unknown, normalized: boolean): CatalogPayload {
  const subjects=unique(array(subjectValues).map(subject),s=>s.code).sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:0);
  unique(subjects.flatMap(s=>s.items),i=>i.code);
  const programs=unique(array(programValues,1000).map(p=>program(p,subjects,normalized)),p=>p.code).sort((a,b)=>a.code<b.code?-1:a.code>b.code?1:0);
  return {schemaVersion:1,source:source(sourceValue),subjects,programs};
}
/** Closed offline projection; preserves national block and level order. */
export function projectProgramplanCatalog(snapshot: unknown): CatalogPayload {
  const r=fields(snapshot,['source','apiVersion','fetched','schoolTypes','subjects','programs']);
  unique(array(r.schoolTypes,20).map(v=>code(v)),v=>v);
  return payload({url:r.source,apiVersion:r.apiVersion,fetched:r.fetched},r.subjects,r.programs,false);
}
export function parseProgramplanCatalog(value: unknown): ProgramplanCatalog {
  const r=fields(value,['schemaVersion','catalogId','source','subjects','programs']);
  if (r.schemaVersion!==1 || typeof r.catalogId!=='string' || !/^sha256:[0-9a-f]{64}$/u.test(r.catalogId)) invalid();
  return {...payload(r.source,r.subjects,r.programs,true),catalogId:r.catalogId};
}
export function canonicalCatalogJson(value: unknown): string {
  if (value===null || typeof value==='boolean' || typeof value==='string') return JSON.stringify(value);
  if (typeof value==='number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalCatalogJson).join(',')}]`;
  if (value && typeof value==='object') return `{${Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)
    .map(([key,v])=>`${JSON.stringify(key)}:${canonicalCatalogJson(v)}`).join(',')}}`;
  return invalid();
}
export function freezeCatalogValue<T>(value: T): T {
  if (value && typeof value==='object') { for (const nested of Object.values(value)) freezeCatalogValue(nested); Object.freeze(value); }
  return value;
}
/** WebCrypto works in both the protected Worker and offline Node tests. */
export async function verifyProgramplanCatalog(value: unknown): Promise<VerifiedProgramplanCatalog> {
  const parsed=parseProgramplanCatalog(value);
  const {catalogId,...payload}=parsed;
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonicalCatalogJson(payload)));
  const expected=`sha256:${Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')}`;
  if (catalogId!==expected) invalid('catalog_integrity_failed');
  // The parsed object is a fresh closed clone. Neither a caller's artifact nor
  // a clone of this capability can silently acquire verified status.
  const verified=freezeCatalogValue(parsed) as VerifiedProgramplanCatalog;
  verifiedCatalogs.add(verified);
  return verified;
}
export function parseProgramplanBasisReference(value: unknown): ProgramplanBasisReference {
  try {
    if (!value || typeof value!=='object' || Array.isArray(value)) invalid('unpinned_basis');
    const raw=record(value);
    if (!Object.hasOwn(raw,'catalogId') || !Object.hasOwn(raw,'programRef')) invalid('unpinned_basis');
    if (!Object.hasOwn(raw,'startedOn') || raw.startedOn==null || raw.startedOn==='') invalid('unknown_education_start');
    const r=fields(value,['catalogId','programRef','orientationCode','startedOn','specializationRefs'],['choiceBlocks']);
    if (typeof r.catalogId!=='string' || !/^sha256:[0-9a-f]{64}$/u.test(r.catalogId)) invalid('invalid_catalog_id');
    const p=fields(r.programRef,['code','version']);
    const refs=array(r.specializationRefs,200).map(value=>{
      const ref=fields(value,['subjectCode','subjectVersion','itemCode','points']);
      return {subjectCode:code(ref.subjectCode),subjectVersion:integer(ref.subjectVersion,1),itemCode:code(ref.itemCode),points:integer(ref.points,0,10000)};
    });
    return {catalogId:r.catalogId,programRef:{code:code(p.code),version:integer(p.version,1)},
      orientationCode:r.orientationCode===null?null:code(r.orientationCode),startedOn:catalogDate(r.startedOn),specializationRefs:refs,
      ...(Object.hasOwn(r,'choiceBlocks') ? {choiceBlocks:parseProgramplanChoiceBlocks(r.choiceBlocks)} : {})};
  } catch (error) {
    if (error instanceof ProgramplanContractError && error.code==='invalid_catalog') invalid('invalid_basis_reference');
    throw error;
  }
}
export function blockedProgramplanBasis(code: string, catalogId: string | null=null, programRef: ProgramplanBasisReference['programRef'] | null=null): ProgramplanBasisResolution {
  return freezeCatalogValue({status:'blocked',catalogId,programRef,diagnostics:[{code}],unresolvedChoices:[],basis:null,decisionReady:false,writeReady:false});
}
function dateDiagnostic(dates: CatalogDates, startedOn: string): string | null {
  if (!dates.startDate) return 'validity_metadata_missing';
  if (startedOn<dates.startDate) return 'historical_version_missing';
  if (dates.endDate && startedOn>dates.endDate) return 'version_not_applicable_at_start';
  if (dates.canceledDate && startedOn>=dates.canceledDate) return 'version_canceled_before_start';
  return null;
}
/** Only exact catalog references are resolved. Never a permission or decision. */
export function resolveProgramplanBasis(catalog: VerifiedProgramplanCatalog, value: unknown): ProgramplanBasisResolution {
  if (!catalog || typeof catalog!=='object' || !verifiedCatalogs.has(catalog)) return blockedProgramplanBasis('unverified_catalog');
  let ref: ProgramplanBasisReference;
  try { ref=parseProgramplanBasisReference(value); }
  catch (error) { return blockedProgramplanBasis(error instanceof ProgramplanContractError?error.code:'invalid_basis_reference',catalog.catalogId); }
  if (ref.catalogId!==catalog.catalogId) return blockedProgramplanBasis('catalog_mismatch',catalog.catalogId,ref.programRef);
  const p=catalog.programs.find(p=>p.code===ref.programRef.code);
  if (!p) return blockedProgramplanBasis('program_not_found',catalog.catalogId,ref.programRef);
  if (p.version!==ref.programRef.version) return blockedProgramplanBasis('historical_version_missing',catalog.catalogId,ref.programRef);
  const programDate=dateDiagnostic(p,ref.startedOn);
  if (programDate) return blockedProgramplanBasis(programDate,catalog.catalogId,ref.programRef);
  const o=ref.orientationCode===null?null:p.orientations.find(o=>o.code===ref.orientationCode);
  if (!o && ref.orientationCode!==null) return blockedProgramplanBasis('orientation_not_found',catalog.catalogId,ref.programRef);
  if (ref.orientationCode===null && p.orientations.length) return blockedProgramplanBasis('orientation_required',catalog.catalogId,ref.programRef);
  const diagnostics: ProgramplanDiagnostic[]=programplanChoiceBlockDiagnostics(p,ref), unresolvedChoices: ProgramplanUnresolvedChoice[]=[];
  const diagnose=(code:string,subjectCode?:string,itemCode?:string,blockId?:string)=>diagnostics.push({code,...(subjectCode?{subjectCode}:{}),...(itemCode?{itemCode}:{}),...(blockId?{blockId}:{})});
  const checkSubject=(s:CatalogSubject,blockId?:string)=>{
    if (s.typeOfSyllabus!=='GRADE_SUBJECT_SYLLABUS') diagnose('unsupported_regime',s.code,undefined,blockId);
    if (!s.schoolTypes.includes('GY')) diagnose('unsupported_school_type',s.code,undefined,blockId);
    const validity=dateDiagnostic(s,ref.startedOn); if(validity)diagnose(validity,s.code,undefined,blockId);
  };
  const pins=new Map<string,number>();
  const levels=(subjects:CatalogBlockSubject[],blockId:string):ResolvedProgramplanLevel[]=>subjects.flatMap(block=>{
    const resolvedAlternative=ref.choiceBlocks !== undefined && programplanAlternativeGroups(subjects).some(group=>group.includes(block));
    const resolvedSlot=ref.choiceBlocks !== undefined && defaultProgramplanChoiceBlocks(p,ref.orientationCode).some(slot=>slot.id === ({MOSP:'mosp',SPRK:'sprk',NAVE:'nave'} as Record<string,string>)[block.code]);
    if (block.optional && !resolvedAlternative) unresolvedChoices.push({kind:'optional_subject',blockId,subjectCode:block.code,points:block.points});
    if (!block.levels.length) { if(!resolvedSlot) unresolvedChoices.push({kind:'subject_levels_unresolved',blockId,subjectCode:block.code,points:block.points}); return []; }
    const s=catalog.subjects.find(s=>s.code===block.code&&s.version===block.subjectVersion);
    if (!s) {diagnose('historical_version_missing',block.code,undefined,blockId);return [];}
    checkSubject(s,blockId);pins.set(s.code,s.version);
    return block.levels.map(level=>({subjectCode:s.code,subjectVersion:s.version,itemCode:level.code,points:level.points,
      name:level.name,subjectName:s.name,optional:block.optional}));
  });
  const nationalBlocks:ResolvedProgramplanBlock[]=[
    {id:'foundation',name:'Gymnasiegemensamma ämnen',subjects:structuredClone(p.foundation),levels:levels(p.foundation,'foundation')},
    {id:'programmeSpecific',name:'Programgemensamma ämnen',subjects:structuredClone(p.programmeSpecific),levels:levels(p.programmeSpecific,'programmeSpecific')},
    ...(o?[{id:'orientation' as const,name:o.name,subjects:structuredClone(o.subjects),levels:levels(o.subjects,'orientation')}]:[]),
  ];
  const fixed=new Set(nationalBlocks.flatMap(b=>b.levels.map(l=>l.itemCode)));
  // Alternatives are retained as source information. They are not all selected
  // and cannot impose dates or prerequisites on an unchosen local level.
  const specializationOptions:ResolvedProgramplanLevel[]=p.specialization.flatMap(block=>{
    if (!block.levels.length) {unresolvedChoices.push({kind:'subject_levels_unresolved',blockId:'specialization',subjectCode:block.code,points:block.points});return [];}
    const s=catalog.subjects.find(s=>s.code===block.code&&s.version===block.subjectVersion);
    if (!s) {diagnose('historical_version_missing',block.code,undefined,'specialization');return [];}
    return block.levels.filter(level=>!fixed.has(level.code)).map(level=>({subjectCode:s.code,subjectVersion:s.version,itemCode:level.code,points:level.points,
      name:level.name,subjectName:s.name,optional:block.optional}));
  });
  const seen=new Set<string>(), selectedSpecialization:ResolvedProgramplanLevel[]=[];
  for(const selected of ref.specializationRefs){
    if (seen.has(selected.itemCode)) {diagnose('duplicate_selected_level',selected.subjectCode,selected.itemCode);continue;}seen.add(selected.itemCode);
    const s=catalog.subjects.find(s=>s.code===selected.subjectCode);
    if (!s) {diagnose('subject_not_found',selected.subjectCode,selected.itemCode);continue;}
    if (s.version!==selected.subjectVersion) {diagnose('historical_version_missing',s.code,selected.itemCode);continue;}
    checkSubject(s,'specialization');
    const item=s.items.find(i=>i.code===selected.itemCode);
    if (!item) {diagnose(catalog.subjects.some(s=>s.items.some(i=>i.code===selected.itemCode))?'wrong_subject':'item_not_found',s.code,selected.itemCode);continue;}
    if (item.points!==selected.points) {diagnose('points_mismatch',s.code,item.code);continue;}
    if (fixed.has(item.code)) {diagnose('fixed_level_duplicate',s.code,item.code);continue;}
    const allowed=specializationOptions.find(l=>l.subjectCode===s.code&&l.subjectVersion===s.version&&l.itemCode===item.code&&l.points===item.points);
    if (!allowed) {diagnose('not_specialization_option',s.code,item.code);continue;}
    pins.set(s.code,s.version);selectedSpecialization.push({...allowed});
  }
  unresolvedChoices.push({kind:'program_rules_unverified',blockId:'program',category:p.category});
  const result:ProgramplanBasisResolution={status:diagnostics.length?'blocked':'resolved',catalogId:catalog.catalogId,programRef:{...ref.programRef},
    diagnostics,unresolvedChoices,basis:diagnostics.length?null:{program:{code:p.code,version:p.version,name:p.name,category:p.category,
      startDate:p.startDate,endDate:p.endDate,canceledDate:p.canceledDate,skolfs:p.skolfs},orientation:o?{code:o.code,name:o.name,points:o.points}:null,
      startedOn:ref.startedOn,source:{...catalog.source},nationalBlocks,subjectPins:[...pins].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([code,version])=>({code,version})),
      specializationOptions,selectedSpecialization,prerequisiteEvidence:'not_present_in_snapshot'},decisionReady:false,writeReady:false};
  return freezeCatalogValue(result);
}
