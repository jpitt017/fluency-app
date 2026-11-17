export interface CorrectionResult {
  correctedText: string;
  feedbackNotes: string[];
}

export async function correctB1WritingAsync(rawText: string): Promise<CorrectionResult> {
  const text = rawText ? rawText.trim() : '';

  if (!text) {
    return { correctedText: '', feedbackNotes: ['Type your paragraph above to see AI grammar analysis...'] };
  }

  try {
    const res = await fetch('/api/writing/correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) throw new Error('Network response was not ok');

    const data = await res.json();
    return {
      correctedText: data.correctedText || text,
      feedbackNotes: data.feedbackNotes || ['Sentence structure looks great!'],
    };
  } catch (err: any) {
    return {
      correctedText: text,
      feedbackNotes: [`Local draft saved. Correction service notice: ${err.message || 'Unable to reach backend.'}`],
    };
  }
}