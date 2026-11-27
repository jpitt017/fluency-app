import { DELETION_EPOCH_HEADER, DELETION_OWNER_HEADER, parseDeletionEpoch } from './deletion-epoch.mjs';

/** Read the generation pinned at request/recording start. On 0080, use the
 * compatible legacy form; a post-deletion request without context fails closed. */
export async function readDeletionGeneration(admin, userId, requestHeaders) {
  const marker = await admin.from('profiles').select('data_deletion_generation,data_deletion_completed_at').eq('id', userId).maybeSingle();
  if (marker.error) {
    if (['42703', 'PGRST204'].includes(marker.error.code)) return null;
    throw new Error('Upload generation is unavailable');
  }
  const current = parseDeletionEpoch(`${userId}.${marker.data?.data_deletion_generation}`);
  if (!current) throw new Error('Upload generation is unavailable');
  const owner = requestHeaders?.get?.(DELETION_OWNER_HEADER);
  const pinned = requestHeaders?.get?.(DELETION_EPOCH_HEADER);
  if (typeof owner === 'string' && owner.toLowerCase() === userId.toLowerCase()) {
    const epoch = parseDeletionEpoch(`${userId}.${pinned}`);
    if (epoch) return epoch.generation;
  }
  if (marker.data?.data_deletion_completed_at != null) throw new Error('Refresh before uploading');
  // A new account / old page with no cookie can still write before its first
  // deletion; if deletion races this read, the Storage/row trigger rejects it.
  return current.generation;
}
