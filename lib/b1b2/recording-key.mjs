import { randomUUID } from 'node:crypto';

// 0081 issues UUIDv8 values from a non-cycling global sequence. The version
// separates them from the old application's UUIDv4 recording/report IDs.
const SEQUENCED_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Allocate once per new recording/report, before attempting any upload.
 * On the 0080 compatibility schema the only available fallback is a fresh
 * random UUIDv4; 0081 failures must never silently downgrade to that fallback. */
export async function freshRecordingKeyId(admin, generation) {
  if (generation === null) return randomUUID();
  if (!admin || typeof generation !== 'string') throw new Error('Recording key allocation is unavailable');
  const { data, error } = await admin.rpc('allocate_recording_key');
  if (error || typeof data !== 'string' || !SEQUENCED_UUID.test(data)) {
    throw new Error('Recording key allocation is unavailable');
  }
  return data.toLowerCase();
}
