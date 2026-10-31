import type {ElectivePreparationScope} from './elective-preparation.ts';
import type {TjanstNeed,TjanstPlanRead} from './tjanst-contract.ts';
/** Navigation intent only; the protected read validates every source again. */
export type ElectivePreparationStaffTarget=Pick<ElectivePreparationScope,'unitId'|'schoolYear'>;
export type ElectivePreparationIntent=ElectivePreparationScope&{rowKey:string};
export function electivePreparationTarget(data:TjanstPlanRead,need:TjanstNeed):ElectivePreparationIntent|null{
 const cls=data.classes.find(value=>value.needs.some(item=>item.sourceKey===need.sourceKey));
 if(!need.organizationPending||!cls?.link||need.sourceKind!=='class_timplan'||!/^(ar[1-3]|ak[1-9])$/u.test(cls.link.column))return null;
 return{unitId:data.unitId,schoolYear:data.schoolYear,planId:cls.link.timplanId,columnId:cls.link.column,rowKey:need.rowKey};
}
