import { b1Curriculum } from '@/lib/curriculum';

export const getCurriculumMetadata = () => ({
  courseId: b1Curriculum.course_id,
  level: b1Curriculum.level,
  totalHours: b1Curriculum.total_hours,
  moduleCount: b1Curriculum.modules.length,
  lessonCount: b1Curriculum.modules.reduce((total, module) => total + module.lessons.length, 0),
});
