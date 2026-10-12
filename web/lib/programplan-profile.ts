import type { CatalogProgram } from './programplan-catalog.ts';

/** National Gy25 scope, not an individual student's reduced programme. */
export type ProgramplanProfile = { points: number; hours: number; vocational: boolean };
export const VOCATIONAL_GY25_CODES = ['BA25','BF25','EE25','FR25','FS25','FT25','HT25','IN25','NB25','RL25','VF25','VO25'] as const;
const higherEducation = ['EK25','ES25','HU25','NA25','SA25','TE25'];
export function programplanProfile(program: Pick<CatalogProgram, 'code' | 'category'>): ProgramplanProfile | null {
  if (program.category === 'PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION' && higherEducation.includes(program.code)) return { points:2500, hours:2180, vocational:false };
  if (program.category !== 'VOCATIONAL_PROGRAM' || !VOCATIONAL_GY25_CODES.some(code => code === program.code)) return null;
  return ['BF25','HT25','VO25'].includes(program.code) ? { points:2700, hours:2625, vocational:true } : { points:2800, hours:2720, vocational:true };
}

/** Required frozen foundation. Swedish alternatives remain one progression of three levels. */
export function vocationalEligibilityComplete(program: CatalogProgram): boolean {
  const foundation = program.foundation;
  return ['ENGE','SVEN','SVEA'].every(code => {
    const subject = foundation.find(subject => subject.code === code);
    const levels = code === 'ENGE' ? [1,2] : [1,2,3];
    return subject !== undefined && subject.optional === (code !== 'ENGE') && subject.subjectVersion !== null
      && subject.levels.length === levels.length
      && levels.every(level => subject.levels.some(item => item.code === `${code}${level}000X` && item.points === 100));
  });
}
