/** Local choice codes. They have not been matched to Skolverket/UHR export codes. */
export const exportVerified = false;
export type ProgramplanLanguage = {readonly code: string; readonly name: string};
export type ProgramplanLanguageLadder = {readonly id: string; readonly name: string; readonly languageRequired: boolean;
  readonly languageCode: string | null; readonly steps: readonly {readonly subjectCode: string; readonly itemCode: string}[]};
export const PROGRAMPLAN_LANGUAGES: readonly ProgramplanLanguage[] = Object.freeze([
  ['fr','Franska'],['es','Spanska'],['de','Tyska'],['it','Italienska'],['zh','Kinesiska'],['ja','Japanska'],['ru','Ryska'],['ar','Arabiska'],['pt','Portugisiska'],
  ['en','Engelska'],['fi','Finska'],['yi','Jiddisch'],['fit','Meänkieli'],['rom','Romani chib'],['se','Samiska'],['so','Somaliska'],['fa','Persiska'],
  ['ku','Kurdiska'],['tr','Turkiska'],['pl','Polska'],['uk','Ukrainska'],['bs','Bosniska'],['hr','Kroatiska'],['sr','Serbiska'],['sq','Albanska'],
  ['el','Grekiska'],['ro','Rumänska'],['hu','Ungerska'],['vi','Vietnamesiska'],['th','Thailändska'],['ti','Tigrinja'],['am','Amhariska'],['ur','Urdu'],
  ['hi','Hindi'],['bn','Bengali'],['ta','Tamil'],['ps','Pashto'],['nl','Nederländska'],['da','Danska'],['no','Norska'],['is','Isländska'],['he','Hebreiska'],
].map(([code,name])=>Object.freeze({code,name})));
function ladder(id:string,name:string,steps:[string,number][],languageRequired=true,languageCode:string|null=null):ProgramplanLanguageLadder {
  return Object.freeze({id,name,languageRequired,languageCode,steps:Object.freeze(steps.map(([subjectCode,n])=>Object.freeze({subjectCode,itemCode:`${subjectCode}${n}000X`})))});
}
const sequence=(prefix:string):[string,number][]=>[[`${prefix}Y`,1],[`${prefix}G`,1],[`${prefix}O`,1],[`${prefix}O`,2],[`${prefix}F`,1],[`${prefix}F`,2],[`${prefix}F`,3]];
export const PROGRAMPLAN_LANGUAGE_LADDERS: readonly ProgramplanLanguageLadder[] = Object.freeze([
  ladder('modern','Moderna språk',sequence('MOD')),
  ladder('sign','Svenskt teckenspråk för hörande',sequence('SVE'),false),
  ladder('motherTongue','Modersmål',[["MODE",1],["MODE",2],["MODE",3]]),
  ...([['FIN','Finska','fi'],['JID','Jiddisch','yi'],['MEA','Meänkieli','fit'],['ROM','Romani chib','rom'],['SAM','Samiska','se']] as const)
    .flatMap(([prefix,name,code])=>(['X','Y','W'] as const).map(suffix=>ladder(`${prefix}${suffix}`,`${name} (${prefix}${suffix})`,[1,2,3].map(n=>[`${prefix}${suffix}`,n]),true,code))),
]);
export const programplanLanguages = PROGRAMPLAN_LANGUAGES;
export const programplanLanguageLadders = PROGRAMPLAN_LANGUAGE_LADDERS;
export function programplanLanguageName(code:string|null):string { return code===null?'Svenskt teckenspråk':PROGRAMPLAN_LANGUAGES.find(x=>x.code===code)?.name??code; }
