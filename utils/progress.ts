/**
 * Client helper: record completion for a lesson of the B1 → B2 course.
 * The route resolves the lesson id from the lesson number.
 */
export async function logStudentProgress(lessonNumber: number, score?: number) {
  try {
    const response = await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonNumber, completed: true, score }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? 'Failed to save progress');
    }

    return { success: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save progress';
    console.error('Failed to log student progress:', message);
    return { success: false as const, error: message };
  }
}
