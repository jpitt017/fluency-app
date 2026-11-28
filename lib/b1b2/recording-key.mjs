// Both schemas issue UUIDv8 IDs in disjoint namespaces. Old app IDs are
// UUIDv4, so they cannot collide with either new-app allocator.
const SEQUENCED_UUID = /^f[0-9a-f]{7}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_ENDPOINT = '/internal/recording-key-allocation';
const MAX_COUNTER = (1n << 60n) - 1n;
// This fixed reversible mask only obscures the counter; it is not a secret.
const LEGACY_MASK = 0x6d7e4f183b5a2c9n;

function legacyCounter(value) {
  // PostgREST casts the bigint to text, avoiding JS number rounding. Also
  // accept safe integers for providers that return a number despite the cast.
  if (typeof value === 'number' && Number.isSafeInteger(value)) value = String(value);
  if (typeof value !== 'string' || value.length > 19 || !/^[1-9][0-9]*$/.test(value)) return null;
  const counter = BigInt(value);
  return counter <= MAX_COUNTER ? counter : null;
}

/**
 * 0080 has no recording-key RPC. Its existing ai_request_logs identity is a
 * non-cycling database sequence, independent of any learner row. Consume it
 * via a temporary, ownerless bookkeeping row and remove that row before using
 * the ID. A failed or ambiguous insert/cleanup never issues a key; nextval is
 * not rolled back and a later retry consumes another value. The preflight
 * must verify the live 0080 identity's definition and service-role grants.
 */
async function allocateOn0080(admin) {
  if (!admin || typeof admin.from !== 'function') throw new Error('Recording key allocation is unavailable');
  const inserted = await admin.from('ai_request_logs').insert({
    user_id: null, endpoint: LEGACY_ENDPOINT, model: 'internal', status_code: 204, latency_ms: 0,
  }).select('id::text').single();
  if (inserted.error) throw new Error('Recording key allocation is unavailable');
  const counter = legacyCounter(inserted.data?.id);
  if (counter === null) throw new Error('Recording key allocation is unavailable');
  const removed = await admin.from('ai_request_logs').delete()
    .eq('id', counter.toString()).eq('endpoint', LEGACY_ENDPOINT).is('user_id', null)
    .select('id::text').maybeSingle();
  if (removed.error || legacyCounter(removed.data?.id) !== counter) {
    throw new Error('Recording key allocation is unavailable');
  }
  const encoded = (counter ^ LEGACY_MASK).toString(16).padStart(15, '0');
  return `00000000-0000-8000-8${encoded.slice(0, 3)}-${encoded.slice(3)}`;
}

/** Allocate once per recording/report, before transcription or any upload.
 * Never silently downgrade if either schema's durable allocator is unavailable. */
export async function freshRecordingKeyId(admin, generation) {
  if (generation === null) return allocateOn0080(admin);
  if (!admin || typeof admin.rpc !== 'function' || typeof generation !== 'string') {
    throw new Error('Recording key allocation is unavailable');
  }
  const { data, error } = await admin.rpc('allocate_recording_key');
  if (error || typeof data !== 'string' || !SEQUENCED_UUID.test(data)) {
    throw new Error('Recording key allocation is unavailable');
  }
  return data.toLowerCase();
}
