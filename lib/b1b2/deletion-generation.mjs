import { DELETION_EPOCH_HEADER, DELETION_OWNER_HEADER, DELETION_UPLOAD_EXPLICIT_HEADER, parseDeletionEpoch } from './deletion-epoch.mjs';

/** The proxy removes any incoming copy of its internal marker and derives it
 * only from a valid epoch explicitly sent by this authenticated workflow. */
export function hasExplicitUploadGeneration(requestHeaders, userId) {
  const owner = requestHeaders?.get?.(DELETION_OWNER_HEADER);
  const pinned = requestHeaders?.get?.(DELETION_EPOCH_HEADER);
  return requestHeaders?.get?.(DELETION_UPLOAD_EXPLICIT_HEADER) === '1'
    && typeof owner === 'string' && owner.toLowerCase() === userId.toLowerCase()
    && Boolean(parseDeletionEpoch(`${userId}.${pinned}`));
}

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
  if (!hasExplicitUploadGeneration(requestHeaders, userId)) {
    // A stale page can share a fresh cookie with a different tab. During
    // overlap it still works; after cutover it must explicitly refresh. The
    // Storage trigger checks the same workflow marker at final commit, so a
    // request which began just before activation cannot slip across the fence.
    const config = await admin.from('data_deletion_safety_config').select('enforce_legacy_fence').eq('singleton', true).maybeSingle();
    if (config.error || typeof config.data?.enforce_legacy_fence !== 'boolean') throw new Error('Upload safety configuration is unavailable');
    if (config.data.enforce_legacy_fence) throw new Error('Refresh before uploading');
  }
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

/** Gate transient audio endpoints too. The proxy supplies a verified owner;
 * those routes still perform their normal authentication separately. */
export async function requireUploadEpochForFencedRequest(admin, requestHeaders) {
  const owner = requestHeaders?.get?.(DELETION_OWNER_HEADER);
  if (!owner) return; // unauthenticated requests are rejected by the route's auth guard
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner)) {
    throw new Error('Refresh before uploading');
  }
  if (!admin) throw new Error('Upload safety configuration is unavailable');
  const pinned = await readDeletionGeneration(admin, owner, requestHeaders);
  if (pinned === null) return; // 0080 has no generation marker yet
  // Unlike saved uploads, transient audio has no Storage commit trigger. A
  // current-format request may still be from a recording begun before data
  // deletion, so compare it to the live marker before sending it to AI.
  const marker = await admin.from('profiles').select('data_deletion_generation').eq('id', owner).maybeSingle();
  const current = parseDeletionEpoch(`${owner}.${marker.data?.data_deletion_generation}`);
  if (marker.error || !current || pinned !== current.generation) throw new Error('Refresh before uploading');
}
