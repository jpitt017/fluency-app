import 'server-only';
import { cookies } from 'next/headers';
import { learnerWeekFromParam } from './syllabus';

// Until course progress tracks weeks, use the last week opened in this browser.
export async function currentLearnerWeek(): Promise<number> {
  return learnerWeekFromParam((await cookies()).get('learner_week')?.value);
}
