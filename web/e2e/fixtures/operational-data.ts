import type { GymTimplanLegacy as GymTimplan } from '../../lib/gym-timplan';
export const oid=(n:number)=>`77101300-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const operationPlan:GymTimplan={id:oid(1),offeringId:oid(2),unitId:oid(3),schoolName:'Exempelskolan',version:1,revision:4,status:'faststalld',
 source:{planId:oid(4),offeringId:oid(2),version:1,revision:2,status:'utkast',catalogId:`sha256:${'a'.repeat(64)}`,startedOn:'2026-08-15',educationRevision:0,education:{name:'Samhällsvetenskapsprogrammet',cohort:'2026–2029',programCode:'SA25',orientationCode:'SABEP'}},
 currentSource:{planId:oid(4),version:1,revision:3,status:'faststalld'},sourceChanged:false,archived:false,canPlan:false,
 rows:[{key:'foundation:ENGE:1:ENGE1000X',name:'Engelska',levelName:'Nivå 1',points:100,part:'foundation',pointTerms:[50,50,0,0,0,0],rowKind:'fixed'}],hours:{'foundation:ENGE:1:ENGE1000X':[40,40,null,null,null,null]}};
