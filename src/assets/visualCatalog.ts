import heroTechEducationImg from './images/hero_tech_education_1793024573658.jpg';
import thumbEngineeringTechImg from './images/thumb_engineering_tech_1793024575386.jpg';
import thumbBiosystemsTechImg from './images/thumb_biosystems_tech_1793024575596.jpg';
import thumbIctSystemsImg from './images/thumb_ict_systems_1793024575652.jpg';

export const VISUAL_ASSETS = {
  heroTechEducation: heroTechEducationImg,
  thumbEngineeringTech: thumbEngineeringTechImg,
  thumbBiosystemsTech: thumbBiosystemsTechImg,
  thumbIctSystems: thumbIctSystemsImg,
} as const;

export function getDefaultSubjectThumbnail(subject: string): string {
  const s = subject.toLowerCase();
  if (s.includes('bio') || s.includes('agri') || s.includes('food')) {
    return VISUAL_ASSETS.thumbBiosystemsTech;
  }
  if (s.includes('ict') || s.includes('software') || s.includes('network') || s.includes('data')) {
    return VISUAL_ASSETS.thumbIctSystems;
  }
  return VISUAL_ASSETS.thumbEngineeringTech;
}
