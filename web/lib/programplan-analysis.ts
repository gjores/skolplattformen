// Analys av en programplan: fel mot regelverket, risker, sådant som måste kontrolleras manuellt
// och det som är uppfyllt. Fel hindrar inte att ett utkast sparas, men ska vara synliga och stoppar
// ett framtida fastställande. Bara regler som går att belägga med Skolverkets underlag tas med;
// övrigt redovisas som "Att kontrollera" i stället för att gissas.

import type { CatalogProgram, ProgramplanLevelRef, ProgramplanBasisReference, ProgramplanCatalog } from './programplan-catalog.ts';
import {programplanChoiceBlocks} from './programplan-choice-blocks.ts';
import {programplanPackageKey,programplanPackageLevelKey,programplanPackageLevelRank,programplanPackageLevels,validateProgramplanPackageEntries,type ProgramplanUnitPackages,type ProgramplanValpaket} from './programplan-packages.ts';
import {programplanLanguageName} from './programplan-languages.ts';
import { DIPLOMA_WORK_POINTS, INDIVIDUAL_CHOICE_POINTS, frameStatus, programFrame, type ProgramFrame } from './programplan-table.ts';
import { PROGRAMPLAN_TERMS, programplanRowSubject, programplanRowRank, programplanTermRows, type ProgramplanTermDistribution, type ProgramplanTermRow } from './programplan-terms.ts';

export type IssueCategory = 'fel' | 'risk' | 'info' | 'ok';
export type PlanPart = 'foundation' | 'programmeSpecific' | 'orientation' | 'specialization' | 'other' | 'meta';
export type PlanIssueTarget = { kind: 'row'; rowKey: string } | { kind: 'specialization'; mode: 'add' | 'remove' } | { kind: 'balance' } | { kind: 'start' } | { kind: 'orientation' } | {kind:'package';blockId:string;unitId:string;entryKey?:string;levelKey?:string};
export type PlanIssue = { id: string; category: IssueCategory; title: string; detail: string; part: PlanPart; rule: string; action: string | null; target?: PlanIssueTarget; unitId?:string };

export const categoryLabel: Record<IssueCategory, string> = { fel: 'Fel mot regelverk', risk: 'Risk', info: 'Att kontrollera', ok: 'Uppfyllt' };
export const categoryDescription: Record<IssueCategory, string> = {
  fel: 'Måste åtgärdas innan planen kan fastställas', risk: 'Kan ge problem för elever eller beslut',
  info: 'Kan inte kontrolleras automatiskt', ok: 'Kontroller utan anmärkning',
};
export const partLabel: Record<PlanPart, string> = {
  foundation: 'Gymnasiegemensamt', programmeSpecific: 'Programgemensamt', orientation: 'Inriktning',
  specialization: 'Programfördjupning', other: 'Individuellt val och gymnasiearbete', meta: 'Uppgifter',
};
export const categoryOrder: IssueCategory[] = ['fel', 'risk', 'info', 'ok'];

export type AnalysisInput = {
  program: CatalogProgram; orientationCode: string | null; refs: ProgramplanLevelRef[];
  startedOn: string | null; sourceFetched: string | null;
  /** Diagnoser från serverns kontroll av den sparade planen, redan formulerade som text. */
  serverNotes?: string[];
  basisReference?: ProgramplanBasisReference | null;
  /** Fördelning över terminer när planen är bunden till underlag. */
  terms?: { rows: ProgramplanTermRow[]; distribution: ProgramplanTermDistribution; ranks: Map<string, number> };
};
/** Skolans utbud kontrolleras separat från programplanens poäng- och terminsram. */
export type ProgramplanPackageAnalysisInput = AnalysisInput & {
  units?: { id: string; name: string }[];
  packages?: ProgramplanUnitPackages;
  packagesCatalog?: ProgramplanCatalog;
  /** Exakta paketversioner från skolans paketbibliotek. */
  valpaket?: ProgramplanValpaket[];
};
export type Analysis = { frame: ProgramFrame; issues: PlanIssue[]; counts: Record<IssueCategory, number>;
  /** Planen är klar för beslut: allt fördelat, inga fel och startdatum finns. Räknas fram, sparas inte. */
  ready: boolean; missing: string[] };

const fmt = (n: number) => n.toLocaleString('sv-SE');
const RULE_TOTAL = 'Skollagen bilaga 2 · programstruktur';
const RULE_STRUCTURE = 'Skolverkets programstruktur';

export function analyseProgramplan(input: AnalysisInput): Analysis {
  const { program, orientationCode, refs } = input;
  const frame = programFrame(program, orientationCode);
  const status = frameStatus(frame, refs, input.basisReference?.choiceBlocks);
  const issues: PlanIssue[] = [];
  const add = (issue: PlanIssue) => issues.push(issue);

  if (frame.unresolved === 'orientation') {
    add({ id: 'orientation-missing', category: 'fel', title: 'Inriktning saknas', detail: 'Programmet har inriktningar men ingen är vald. Poängramen för programfördjupning kan inte räknas ut.', part: 'orientation', rule: RULE_STRUCTURE, action: 'Välj inriktning', target: { kind: 'orientation' } });
  } else if (frame.unresolved === 'total') {
    add({ id: 'total-unverified', category: 'info', title: 'Poängramen kan inte kontrolleras', detail: `Yrkesprogram omfattar 2 700 eller 2 800 poäng och underlaget anger inte vilket. Programfördjupningen (${fmt(status.chosen)} poäng) jämförs därför inte mot en gräns.`, part: 'specialization', rule: RULE_TOTAL, action: null });
  } else if (status.over) {
    add({ id: 'specialization-over', category: 'fel', title: 'Programfördjupningen ryms inte i ramen', detail: `${fmt(status.chosen)} poäng valda, högst ${fmt(status.room!)} får väljas. Ta bort ${fmt(status.chosen - status.room!)} poäng.`, part: 'specialization', rule: RULE_TOTAL, action: 'Ta bort nivåer', target: { kind: 'specialization', mode: 'remove' } });
  } else if (status.remaining! > 0) {
    add({ id: 'specialization-under', category: 'fel', title: 'Outnyttjat utrymme', detail: `${fmt(status.remaining!)} poäng programfördjupning är inte fördelade. Eleverna når inte programmets ${fmt(frame.total!)} poäng.`, part: 'specialization', rule: RULE_TOTAL, action: 'Lägg till nivå', target: { kind: 'specialization', mode: 'add' } });
  }

  if (input.basisReference && input.basisReference.choiceBlocks === undefined) add({ id: 'legacy-incomplete', category: 'fel', title: 'Ofullständig plan', detail: 'Den äldre versionen saknar svenskrader och valbara block. Skapa en ny version för att komplettera planen.', part: 'meta', rule: RULE_STRUCTURE, action: null });
  const current = input.basisReference?.choiceBlocks !== undefined;
  if (current && input.basisReference!.choiceBlocks!.filter(b => b.kind === 'individualChoice').reduce((n,b) => n+b.points,0) !== 200) add({id:'individual-choice-points',category:'fel',title:'Individuellt val ska omfatta 200 poäng',detail:'Ändra blocken så att deras sammanlagda poäng blir 200.',part:'other',rule:RULE_TOTAL,action:null});
  if (current && input.terms && frame.total !== null) {
    const total = input.terms.rows.reduce((n,r) => n+r.points,0);
    if (total !== frame.total) add({id:'total-points',category:'fel',title:'Planens poängsumma avviker',detail:`Planen omfattar ${fmt(total)} av ${fmt(frame.total)} poäng.`,part:'meta',rule:RULE_TOTAL,action:null});
  }
  for (const section of frame.sections) {
    const optional = current ? [] : section.rows.filter(r => r.note === 'Alternativ — en av dem läses');
    if (optional.length > 1) {
      add({ id: `alternatives-${section.id}`, category: 'info', title: `Alternativ: ${optional.map(r => r.subjectName).join(' eller ')}`, detail: 'Programstrukturen anger alternativa ämnen. Kontrollera att skolan erbjuder det alternativ eleverna behöver.', part: section.id, rule: RULE_STRUCTURE, action: null });
    }
    for (const row of section.rows.filter(r => r.note === 'Nivåer saknas i underlaget' && !(current && ['MOSP','SPRK','NAVE'].includes(r.key)))) {
      add({ id: `levels-${section.id}-${row.key}`, category: 'risk', title: `${row.subjectName}: nivåer saknas`, detail: `Underlaget anger ${fmt(row.points)} poäng men inga nivåer. Skolan behöver bestämma vilka nivåer som erbjuds.`, part: section.id, rule: RULE_STRUCTURE, action: null });
    }
  }

  let termsComplete = false;
  if (input.terms) {
    const { rows, distribution, ranks } = input.terms;
    const byKey = new Map(distribution.map(d => [d.rowKey, d.points]));
    const partOf = (row: ProgramplanTermRow): PlanPart => row.part === 'individualChoice' || row.part === 'diplomaWork' ? 'other' : row.part;
    const open = rows.filter(r => (byKey.get(r.key)?.reduce((a, b) => a + b, 0) ?? 0) < r.points);
    termsComplete = open.length === 0;
    if (open.length) add({ id: 'terms-open', category: 'fel', title: open.length === 1 ? '1 nivå saknar terminer' : `${open.length} nivåer saknar terminer`, detail: `${open.slice(0, 4).map(r => `${r.name} ${r.levelName}`).join(', ')}${open.length > 4 ? ' med flera' : ''}. ${fmt(open.reduce((s, r) => s + r.points - (byKey.get(r.key)?.reduce((a, b) => a + b, 0) ?? 0), 0))} poäng är inte placerade.`, part: partOf(open[0]), rule: 'Fördelning över läsåren', action: 'Fördela', target: { kind: 'row', rowKey: open[0].key } });
    else add({ id: 'terms-ok', category: 'ok', title: 'Alla nivåer har terminer', detail: `${fmt(rows.reduce((s, r) => s + r.points, 0))} poäng fördelade över sex terminer.`, part: 'meta', rule: 'Fördelning över läsåren', action: null });
    issues.push(...programplanLevelOrderIssues(rows, distribution, ranks));
    const years = [0, 1, 2].map(y => distribution.reduce((s, d) => s + d.points[y * 2] + d.points[y * 2 + 1], 0));
    const total = rows.reduce((s, r) => s + r.points, 0), target = total / 3;
    if (termsComplete && years.some(y => Math.abs(y - target) > target * 0.15)) add({ id: 'terms-balance', category: 'risk', title: 'Ojämn arbetsbörda mellan läsåren', detail: `Åk 1: ${fmt(years[0])}, åk 2: ${fmt(years[1])}, åk 3: ${fmt(years[2])} poäng. Ett jämnt läsår är cirka ${fmt(Math.round(target))} poäng.`, part: 'meta', rule: 'Rimlig studiegång', action: 'Jämna ut', target: { kind: 'balance' } });
    const diploma = rows.find(r => r.part === 'diplomaWork'); const dp = diploma && byKey.get(diploma.key);
    if (dp && dp.some(p => p > 0) && dp.findIndex(p => p > 0) < 4) add({ id: 'terms-diploma', category: 'risk', title: 'Gymnasiearbetet ligger före åk 3', detail: 'Gymnasiearbetet ska visa att eleven är förberedd för det programmet leder till och läggs normalt sist i utbildningen.', part: 'other', rule: 'Gymnasieförordningen 4 kap.', action: 'Flytta', target: { kind: 'row', rowKey: diploma!.key } });
  }
  if (!input.startedOn) {
    add({ id: 'start-missing', category: 'risk', title: 'Utbildningens startdatum saknas', detail: 'Utkastet kan sparas, men planen kan inte kopplas till rätt underlag eller fastställas utan startdatum.', part: 'meta', rule: 'Krav för fastställande', action: 'Ange datum', target: { kind: 'start' } });
  }
  for (const [index, note] of (input.serverNotes ?? []).entries()) {
    add({ id: `server-${index}`, category: 'info', title: 'Kontroll från servern', detail: note, part: 'meta', rule: RULE_STRUCTURE, action: null });
  }
  add({ id: 'points-not-time', category: 'info', title: 'Poäng är inte undervisningstid', detail: 'Kontrollera att timplanen ger eleverna garanterad undervisningstid.', part: 'meta', rule: 'Gymnasieförordningen 4 kap. 22 §', action: null });
  if (input.sourceFetched) {
    add({ id: 'source', category: 'info', title: 'Underlag från Skolverket', detail: `Ämnen och nivåer hämtade ${input.sourceFetched}. Kontrollera att underlaget gäller utbildningens elevkull.`, part: 'meta', rule: 'Skolverkets API', action: null });
  }

  if (frame.specializationRoom !== null && !status.over && status.chosen > 0) {
    add({ id: 'specialization-ok', category: 'ok', title: 'Programfördjupning inom ramen', detail: `${fmt(status.chosen)} av ${fmt(frame.specializationRoom)} poäng.`, part: 'specialization', rule: RULE_TOTAL, action: null });
  }
  const orientation = frame.sections.find(s => s.id === 'orientation');
  if (orientation) add({ id: 'orientation-ok', category: 'ok', title: 'Inriktningens ämnen följer programstrukturen', detail: `${fmt(orientation.points)} poäng enligt underlaget.`, part: 'orientation', rule: RULE_STRUCTURE, action: null });
  add({ id: 'other-ok', category: 'ok', title: 'Individuellt val och gymnasiearbete avsatta', detail: `${INDIVIDUAL_CHOICE_POINTS} + ${DIPLOMA_WORK_POINTS} poäng.`, part: 'other', rule: RULE_STRUCTURE, action: null });

  issues.sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));
  const counts = { fel: 0, risk: 0, info: 0, ok: 0 } as Record<IssueCategory, number>;
  for (const issue of issues) counts[issue.category]++;
  const missing = [
    ...(!input.terms ? ['Planen är inte kopplad till underlag med terminer.'] : !termsComplete ? ['Alla nivåer är inte fördelade på terminer.'] : []),
    ...issues.filter(i => i.category === 'fel' && i.id !== 'terms-open').map(i => i.title),
    ...(!input.startedOn ? ['Utbildningens startdatum saknas.'] : []),
  ];
  return { frame, issues, counts, ready: missing.length === 0, missing };
}

/** Shared by plan and future package analysis: compare starts and actual shared terms. */
export function programplanLevelOrderIssues(rows: ProgramplanTermRow[], distribution: ProgramplanTermDistribution, ranks: Map<string, number>): PlanIssue[] {
  const byKey = new Map(distribution.map(d => [d.rowKey, d.points]));
  const issues = new Map<string, PlanIssue>();
  for (const lower of rows) for (const higher of rows) {
    if (lower === higher || programplanRowSubject(lower) !== programplanRowSubject(higher) || programplanRowRank(lower, ranks) >= programplanRowRank(higher, ranks)) continue;
    const lp = byKey.get(lower.key), hp = byKey.get(higher.key);
    const startLow = lp?.findIndex(p => p > 0) ?? -1, startHigh = hp?.findIndex(p => p > 0) ?? -1;
    if (startLow < 0 || startHigh < 0) continue;
    const before = startHigh < startLow, overlap = lp!.some((p,i) => p > 0 && hp![i] > 0);
    if (!before && !overlap) continue;
    const id = `${before ? 'level-order' : 'level-overlap'}-${higher.key}`;
    issues.set(id, {id,category:before?'fel':'risk',title:before?`${higher.name} ${higher.levelName} börjar före ${lower.levelName}`:`${higher.name}: nivåerna överlappar`,detail:before?`${higher.levelName} börjar ${PROGRAMPLAN_TERMS[startHigh]}, före ${lower.levelName} (${PROGRAMPLAN_TERMS[startLow]}).`:`${lower.levelName} och ${higher.levelName} läses under samma termin. Kontrollera studiegången.`,part:higher.part === 'individualChoice' || higher.part === 'diplomaWork' ? 'other' : higher.part,rule:'Nivåernas ordning',action:'Flytta nivån',target:{kind:'row',rowKey:higher.key}});
  }
  return [...issues.values()];
}

/** Fristående skolutbudsanalys; paketval påverkar inte programplanens beslutsstatus. */
export function analyseProgramplanPackages(input:ProgramplanPackageAnalysisInput):PlanIssue[]{
  if(!input.basisReference?.choiceBlocks||!input.units)return[];
  const blocks=programplanChoiceBlocks(input.program,input.basisReference),issues:PlanIssue[]=[];
  for(const unit of input.units){
    const saved=input.packages?.units.find(u=>u.unitId===unit.id),allLevels=new Map<string,Set<string>>(),ivLevels:ProgramplanLevelRef[]=[];
    const context={unitId:unit.id,packages:input.valpaket??[]};
    for(const block of blocks){
      const entries=saved?.selections.find(s=>s.blockId===block.id)?.entries??[],prefix=`packages-${unit.id}-${block.id}`;
      const part:PlanPart=block.part==='individualChoice'?'other':block.part;
      const add=(suffix:string,category:IssueCategory,title:string,detail:string,entryKey?:string,levelKey?:string,rule='Skolans valbara utbud')=>issues.push({id:`${prefix}-${suffix}`,unitId:unit.id,category,title,detail:`${unit.name}: ${detail}`,part,rule,action:'Visa paket',target:{kind:'package',unitId:unit.id,blockId:block.id,...(entryKey?{entryKey}:{}),...(levelKey?{levelKey}:{})}});
      if(!saved||saved.revision===0||!entries.length)add('missing','fel',`${block.name}: paketval saknas`,'Välj och spara skolans paket. Ett förslag räknas först när det är sparat.');
      if(entries.length===1)add('single','risk',`${block.name}: bara ett paket`,'Skolans utbud ger bara ett alternativ. Kontrollera att det möter elevernas behov.');
      const frame=input.terms?.distribution.find(d=>d.rowKey===block.rowKey)?.points??[0,0,0,0,0,0];
      for(const entry of entries){
        const key=programplanPackageKey(entry.ref),distribution=new Map(entry.distribution.map(d=>[d.levelKey,d.points]));
        let levels:ProgramplanLevelRef[],valid=true;
        try{levels=programplanPackageLevels(entry.ref,input.packagesCatalog,context);}catch{add(`missing-version-${key}`,'fel',`${block.name}: paketversionen kan inte läsas`,'Läs skolans paket igen. En nyare version ersätter inte skolans valda paketversion.',key);continue;}
        try{validateProgramplanPackageEntries(input.program,input.basisReference,block.id,[entry],input.packagesCatalog,context);}catch{valid=false;add(`invalid-${key}`,'fel',`${block.name}: paketets innehåll är ogiltigt`,'Kontrollera pakettyp, skola, katalog, språk, sammanhängande nivåer, poäng och nivåer som redan finns i planen.',key);}
        if(valid&&block.kind==='individualChoice')ivLevels.push(...levels);
        if(levels.reduce((n,l)=>n+l.points,0)!==block.points)add(`points-${key}`,'fel',`${block.name}: paketets poäng avviker`,`Varje paket ska omfatta ${fmt(block.points)} poäng.`,key);
        const sum=[0,0,0,0,0,0];
        for(const level of levels){const levelKey=programplanPackageLevelKey(level),p=distribution.get(levelKey)??[0,0,0,0,0,0];p.forEach((n,i)=>sum[i]+=n);if(p.reduce((n,x)=>n+x,0)!==level.points)add(`open-${key}-${levelKey}`,'fel',`${block.name}: en paketnivå saknar terminer`,`${level.itemCode} ska ha ${fmt(level.points)} poäng fördelade.`,key,levelKey);
          if(valid){const identity=`${entry.ref.type==='language'?entry.ref.languageCode??'-':'-'}:${levelKey}`,found=allLevels.get(identity)??new Set<string>();found.add(block.id);allLevels.set(identity,found);}}
        if(sum.some((n,i)=>n!==frame[i]))add(`frame-${key}`,'fel',`${block.name}: paketet avviker från ramen`,'Paketets poäng per termin ska motsvara blockets terminsram. Ändra paketets fördelning.',key);
        // Language ladders cross subjects; generic levels compare only the same catalog subject.
        for(let lower=0;lower<levels.length;lower++)for(let higher=lower+1;higher<levels.length;higher++){
          let low=levels[lower],high=levels[higher];if(entry.ref.type==='package'){if(low.subjectCode!==high.subjectCode||low.subjectVersion!==high.subjectVersion)continue;const rank=(l:ProgramplanLevelRef)=>programplanPackageLevelRank(l,input.packagesCatalog);if(rank(low)>rank(high))[low,high]=[high,low];}
          const lp=distribution.get(programplanPackageLevelKey(low)),hp=distribution.get(programplanPackageLevelKey(high));const ls=lp?.findIndex(p=>p>0)??-1,hs=hp?.findIndex(p=>p>0)??-1;if(ls<0||hs<0)continue;
          if(hs<ls)add(`order-${key}-${higher}`,'fel',`${block.name}: högre nivå börjar före lägre`,`${high.itemCode} börjar ${PROGRAMPLAN_TERMS[hs]}, före ${low.itemCode} (${PROGRAMPLAN_TERMS[ls]}).`,key,programplanPackageLevelKey(high),'Nivåernas ordning');
          else if(lp!.some((p,i)=>p>0&&hp![i]>0))add(`overlap-${key}-${higher}`,'risk',`${block.name}: paketnivåerna överlappar`,`${low.itemCode} och ${high.itemCode} läses samma termin. Kontrollera studiegången.`,key,programplanPackageLevelKey(high),'Nivåernas ordning');}
      }
      if(block.kind==='modernLanguage')for(const lang of ['fr','es','de'])for(const start of ['MODO1000X','MODY1000X'])if(!entries.some(e=>e.ref.type==='language'&&e.ref.languageCode===lang&&e.ref.levels[0]?.itemCode===start))add(`track-${lang}-${start}`,'info',`${programplanLanguageName(lang)} ${start==='MODY1000X'?'nybörjare':'fortsättning'} saknas`,'Kontrollera skolans språkutbud för detta spår.','',undefined,'Gymnasieförordningen 4 kap. 10 §');
      if(entries.some(e=>e.ref.type==='language'))add('export','info','Språkkoder behöver kontrolleras före export','Språklistan är inte avstämd mot Skolverket och UHR och används inte i export.');
    }
    const ivBlock=blocks.find(b=>b.kind==='individualChoice');
    if(ivBlock){
      const prefix=`packages-${unit.id}-${ivBlock.id}`,add=(suffix:string,category:IssueCategory,title:string,detail:string,rule:string)=>issues.push({id:`${prefix}-${suffix}`,unitId:unit.id,category,title,detail:`${unit.name}: ${detail}`,part:'other',rule,action:'Visa paket',target:{kind:'package',unitId:unit.id,blockId:ivBlock.id}});
      const fixedRows=input.terms?.rows??programplanTermRows(input.program,input.basisReference),fixedKeys=fixedRows.map(r=>r.key);
      const max=fixedRows.filter(r=>r.key.includes(':IDRO:')).reduce((n,r)=>Math.max(n,Number(r.key.split(':').at(-1)?.match(/^IDRO(\d)/u)?.[1]??0)),0),next=`IDRO${max+1}000X`;
      if(!ivLevels.some(l=>l.subjectCode==='IDRO'&&l.itemCode===next))add('right-sport','risk','Individuellt val: nästa nivå i idrott saknas',`${next} erbjuds inte i skolans IV-block. Eleven har rätt att läsa nästa nivå i idrott och hälsa; undantag får göras vid synnerliga skäl.`,'Gymnasieförordningen 4 kap. 7 § p. 1');
      else add('right-sport-ok','ok','Individuellt val: nästa nivå i idrott erbjuds',`${next} finns i skolans IV-utbud.`,'Gymnasieförordningen 4 kap. 7 § p. 1');
      add('right-art','info','Individuellt val: kontrollera estetiskt ämne',`Föreskriftens ämneslista är inte avstämd. Utbudets ämnen: ${[...new Set(ivLevels.map(l=>l.subjectCode))].join(', ')||'inget sparat utbud'}. Rättigheten får undantas vid synnerliga skäl.`,'Gymnasieförordningen 4 kap. 7 § p. 2');
      if(input.program.category==='VOCATIONAL_PROGRAM')for(const [subject,count]of [['SVEN',3],['ENGE',2]]as const){
        const missing=Array.from({length:count},(_,i)=>`${subject}${i+1}000X`).filter(code=>!fixedKeys.some(k=>k.includes(code)||(subject==='SVEN'&&k.includes(code.replace('SVEN','SVEA'))))&&!ivLevels.some(l=>l.itemCode===code||(subject==='SVEN'&&l.itemCode===code.replace('SVEN','SVEA'))));
        if(missing.length)add(`right-${subject}`,'risk','Individuellt val: behörighetsnivåer saknas',`${missing.join(', ')} finns varken i studievägen eller skolans samlade IV-utbud. Kontrollera rätten till grundläggande behörighet; undantag får göras vid synnerliga skäl.`,'Gymnasieförordningen 4 kap. 7 § p. 3, 23 §');
        else add(`right-${subject}-ok`,'ok',`${subject==='SVEN'?'Svenska/svenska som andraspråk':'Engelska'}: behörighetsnivåerna finns`,'Nivåerna finns i studievägen eller skolans IV-utbud.','Gymnasieförordningen 4 kap. 7 § p. 3, 23 §');
      }
    }
    for(const [level,ids]of allLevels)if(ids.size>1){const blockId=[...ids][0];issues.push({id:`packages-${unit.id}-duplicate-${level}`,unitId:unit.id,category:'risk',title:'Samma nivå erbjuds i flera block',detail:`${unit.name}: ${level} finns i ${[...ids].join(', ')}. Kontrollera vid elevval.`,part:'meta',rule:'Elevens studiegång',action:'Visa paket',target:{kind:'package',unitId:unit.id,blockId}});}
    if(blocks.length)issues.push({id:`packages-${unit.id}-comparability`,unitId:unit.id,category:'info',title:'Kontrollera jämförbara och överlappande nivåer',detail:`${unit.name}: Föreskriften om alternativa och jämförbara nivåer är inte avstämd. Kontrollera elevens kombination av paket och fasta nivåer.`,part:'meta',rule:'Gymnasieförordningen 4 kap. 8 §',action:'Visa paket',target:{kind:'package',unitId:unit.id,blockId:blocks[0].id}});
  }
  return [...new Map(issues.map(i=>[i.id,i])).values()];
}
