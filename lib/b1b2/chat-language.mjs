/** Shared prompt and deterministic guard for the conversational partner. */
export function languageRules(week) {
  const stage = week <= 8
    ? 'Use mostly B1 vocabulary and short sentences. Use at most one new B2 phrase per turn. No sentence may exceed 20 words.'
    : week <= 16 ? 'Use language suitable for B1+ learners.' : 'Use language suitable for B2 learners.';
  return `Use British English only, including spelling and vocabulary. ${stage} If the learner seems lost or asks for clarification, say it again more simply.`;
}

export function sentencesWithinLimit(reply, limit = 20) {
  const sentences = reply.trim().split(/(?<=[.!?])\s+|\n+/u).filter(Boolean);
  return sentences.length > 0 && sentences.every((sentence) => (sentence.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? []).length <= limit);
}

export function safeChatReply(reply, week) {
  const text = reply?.trim();
  if (!text || (week <= 8 && !sentencesWithinLimit(text))) {
    return 'I see. Could you tell me a little more?';
  }
  return text;
}
