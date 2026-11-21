import type Groq from 'groq-sdk';
import type { ChatCompletionMessageParam } from 'groq-sdk/resources/chat/completions';

const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const FALLBACK_JSON_MODEL = 'llama-3.3-70b-versatile';

export function parseJsonObjectFromText(raw: string | null | undefined): Record<string, unknown> {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Model returned an empty response.');
  }

  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  if (!trimmed) {
    throw new Error('Model returned an empty response.');
  }

  try {
    const direct = JSON.parse(trimmed) as unknown;
    if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
      return direct as Record<string, unknown>;
    }
  } catch {
    /* Fall through to balanced-brace extraction */
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const sliced = trimmed.slice(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(sliced) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }

  throw new Error('Model response did not contain a valid JSON object.');
}

function isJsonValidateError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { status?: number; message?: string; error?: { code?: string; error?: { code?: string } } };
  const code = anyErr.error?.code ?? anyErr.error?.error?.code ?? '';
  const msg = String(anyErr.message ?? '');
  return (
    code === 'json_validate_failed' ||
    msg.includes('json_validate_failed') ||
    (anyErr.status === 400 && /failed to validate json/i.test(msg))
  );
}

export interface GroqJsonResult {
  parsed: Record<string, unknown>;
  promptTokens: number;
  completionTokens: number;
  modelUsed: string;
}

export async function createGroqJsonCompletion(
  groq: Groq,
  params: {
    model?: string;
    messages: ChatCompletionMessageParam[];
    temperature?: number;
    maxCompletionTokens?: number;
    reasoningEffort?: 'low' | 'medium' | 'high';
  },
): Promise<GroqJsonResult> {
  const primaryModel = params.model ?? DEFAULT_MODEL;
  const maxCompletionTokens = Math.max(params.maxCompletionTokens ?? 4096, 1024);
  const temperature = params.temperature ?? 0.25;
  const reasoningEffort = params.reasoningEffort ?? 'low';

  let promptTokens = 0;
  let completionTokens = 0;

  try {
    const res = await groq.chat.completions.create({
      model: primaryModel,
      messages: params.messages,
      temperature,
      max_completion_tokens: maxCompletionTokens,
      reasoning_effort: reasoningEffort,
      include_reasoning: false,
      response_format: { type: 'json_object' },
    });
    promptTokens += res.usage?.prompt_tokens ?? 0;
    completionTokens += res.usage?.completion_tokens ?? 0;

    const parsed = parseJsonObjectFromText(res.choices[0]?.message?.content);
    return { parsed, promptTokens, completionTokens, modelUsed: primaryModel };
  } catch (err: unknown) {
    if (!isJsonValidateError(err) && err instanceof SyntaxError === false && !(err instanceof Error && /empty response|valid JSON/i.test(err.message))) {
      throw err;
    }
  }

  // Retry 1: same reasoning model without strict json_object validation, extracting JSON from text
  try {
    const retryRes = await groq.chat.completions.create({
      model: primaryModel,
      messages: params.messages,
      temperature,
      max_completion_tokens: Math.max(maxCompletionTokens, 4096),
      reasoning_effort: 'low',
      include_reasoning: false,
    });
    promptTokens += retryRes.usage?.prompt_tokens ?? 0;
    completionTokens += retryRes.usage?.completion_tokens ?? 0;

    const parsed = parseJsonObjectFromText(retryRes.choices[0]?.message?.content);
    return { parsed, promptTokens, completionTokens, modelUsed: primaryModel };
  } catch {
    /* Fall back to non-reasoning JSON model */
  }

  // Retry 2: fallback non-reasoning Groq JSON model
  const fallbackRes = await groq.chat.completions.create({
    model: FALLBACK_JSON_MODEL,
    messages: params.messages,
    temperature,
    max_completion_tokens: 2048,
    response_format: { type: 'json_object' },
  });
  promptTokens += fallbackRes.usage?.prompt_tokens ?? 0;
  completionTokens += fallbackRes.usage?.completion_tokens ?? 0;

  const parsed = parseJsonObjectFromText(fallbackRes.choices[0]?.message?.content);
  return { parsed, promptTokens, completionTokens, modelUsed: FALLBACK_JSON_MODEL };
}
