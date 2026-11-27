import { randomUUID } from 'node:crypto';
import { clearUserStorage } from './delete-user-storage.mjs';

// 0080 already has one service-only lock row per user. A far-future expiry
// makes it a durable pending job without requiring a new table. Worker leases
// are shifted by 4,800 years, so their expiry never drops the deletion barrier.
const IDLE = '9999-12-31T23:59:59.000Z';
const DURABLE_FROM = Date.UTC(6000, 0, 1);
const LEASE_YEARS = 4800; // a multiple of 400 keeps Gregorian leap dates aligned
const LEASE_MS = 30 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missingRpc = (error) => error?.code === 'PGRST202' || error?.code === '42883';
const durable = (expiry) => Number.isFinite(Date.parse(expiry)) && Date.parse(expiry) >= DURABLE_FROM;
const idle = (expiry) => new Date(expiry).getUTCFullYear() === 9999;

export class DeletionProblem extends Error {
  constructor(message, status = 503, code = null) { super(message); this.status = status; this.code = code; }
}

async function readLock(admin, userId) {
  const result = await admin.from('week_speaking_deletion_locks').select('lock_id,expires_at')
    .eq('user_id', userId).maybeSingle();
  if (result.error) throw new DeletionProblem('Data deletion is temporarily unavailable. Please try again.');
  return result.data;
}

async function compareAndSetExpiry(admin, userId, lockId, before, after) {
  const result = await admin.from('week_speaking_deletion_locks').update({ expires_at: after })
    .eq('user_id', userId).eq('lock_id', lockId).eq('expires_at', before)
    .select('lock_id,expires_at').maybeSingle();
  if (result.error) throw new DeletionProblem('Data deletion is temporarily unavailable. Please try again.');
  return result.data;
}

/** Record a durable pending job before attempting to remove any files. */
export async function beginOrResumeDeletion(admin, userId, createId = randomUUID) {
  if (!UUID.test(userId)) throw new DeletionProblem('Sign in required.', 401);
  const existing = await readLock(admin, userId);
  if (existing && durable(existing.expires_at) && UUID.test(existing.lock_id)) return existing.lock_id;
  if (existing && Date.parse(existing.expires_at) > Date.now()) {
    throw new DeletionProblem('A recording or deletion is still in progress. Please wait and try again.', 409);
  }
  const lockId = createId();
  if (!UUID.test(lockId)) throw new DeletionProblem('Could not start deletion. Please try again.');
  const begun = await admin.rpc('begin_week_speaking_deletion', { p_user_id: userId, p_lock_id: lockId });
  if (begun.error) {
    // A lost response may still have committed the finite lock. No file has
    // been touched; only resume it if it is provably our own token.
    const after = await readLock(admin, userId);
    if (!after || after.lock_id !== lockId) throw new DeletionProblem('Data deletion is temporarily unavailable. Please try again.');
  } else if (begun.data !== true) {
    throw new DeletionProblem('A recording or deletion is still in progress. Please wait and try again.', 409);
  }

  const promoted = await admin.rpc('promote_retryable_data_deletion', { p_user_id: userId, p_lock_id: lockId });
  if (promoted.error && missingRpc(promoted.error)) {
    // Compatibility with 0080 while an additive 0081 migration is not yet
    // present. Nothing is deleted until this compare-and-set has succeeded.
    const lock = await readLock(admin, userId);
    if (!lock || lock.lock_id !== lockId) throw new DeletionProblem('Could not start deletion. Please try again.');
    if (!durable(lock.expires_at)) {
      const changed = await compareAndSetExpiry(admin, userId, lockId, lock.expires_at, IDLE);
      if (!changed) throw new DeletionProblem('Could not start deletion. Please try again.');
    }
  } else if (promoted.error || promoted.data !== true) {
    // The promotion may have committed even if its response was lost.
    const lock = await readLock(admin, userId);
    if (!lock || lock.lock_id !== lockId || !durable(lock.expires_at)) {
      throw new DeletionProblem('Could not start deletion. Please try again.');
    }
  }
  return lockId;
}

async function claim(admin, userId, lock) {
  const args = { p_user_id: userId, p_lock_id: lock.lock_id };
  const claimed = await admin.rpc('claim_retryable_data_deletion', args);
  if (!claimed.error) {
    if (!claimed.data || typeof claimed.data.expiry !== 'string' || !durable(claimed.data.expiry)
      || typeof claimed.data.token !== 'string' || !UUID.test(claimed.data.token)) {
      throw new DeletionProblem('Deletion is already running. Please wait and try again.', 409);
    }
    return { expiry: claimed.data.expiry, token: claimed.data.token, viaRpc: true };
  }
  if (!missingRpc(claimed.error)) throw new DeletionProblem('Could not resume deletion. Please try again.');

  // Old-schema compatibility: the shifted claim still leaves the 0080 lock
  // active. Atomic compare-and-set makes concurrent HTTP retries take turns.
  const current = await readLock(admin, userId);
  if (!current || current.lock_id !== lock.lock_id || !durable(current.expires_at)) {
    throw new DeletionProblem('Could not resume deletion. Please try again.');
  }
  if (!idle(current.expires_at)) {
    const deadline = new Date(current.expires_at);
    deadline.setUTCFullYear(deadline.getUTCFullYear() - LEASE_YEARS);
    if (deadline.getTime() > Date.now()) throw new DeletionProblem('Deletion is already running. Please wait and try again.', 409);
  }
  const shifted = new Date(Date.now() + LEASE_MS);
  shifted.setUTCFullYear(shifted.getUTCFullYear() + LEASE_YEARS);
  const changed = await compareAndSetExpiry(admin, userId, lock.lock_id, current.expires_at, shifted.toISOString());
  if (!changed) throw new DeletionProblem('Deletion is already running. Please wait and try again.', 409);
  return { expiry: changed.expires_at, viaRpc: false };
}

async function release(admin, userId, lockId, reservation) {
  if (reservation.viaRpc) {
    const result = await admin.rpc('release_retryable_data_deletion', {
      p_user_id: userId, p_lock_id: lockId, p_claim_until: reservation.expiry, p_claim_token: reservation.token,
    });
    if (!result.error) return;
    if (!missingRpc(result.error)) throw result.error;
  }
  await compareAndSetExpiry(admin, userId, lockId, reservation.expiry, IDLE);
}

function validOwnedPath(path, userId) {
  if (typeof path !== 'string') return false;
  const segments = path.split('/');
  return segments.length > 1 && segments[0].toLowerCase() === userId.toLowerCase()
    && segments.every((part) => part && part !== '.' && part !== '..');
}

async function clearJobFiles(admin, userId, lockId, reservation) {
  const args = { p_user_id: userId, p_lock_id: lockId, p_claim_until: reservation.expiry, p_claim_token: reservation.token };
  const snapshot = [];
  let afterBucket = '';
  let afterName = '';
  // Freeze every candidate before the first external deletion. A Storage
  // request may outlive the worker lease; an expired worker must never list
  // fresh work after another worker has completed the job. Every page is read
  // under the database claim, and our generated keys cannot be reused across
  // generations. Finalization checks the database again for missed objects.
  for (let page = 0; page < 10_000; page += 1) {
    const listed = await admin.rpc('list_retryable_deletion_files', {
      ...args, p_after_bucket: afterBucket, p_after_name: afterName,
    });
    if (listed.error || !Array.isArray(listed.data) || listed.data.length > 100) {
      throw listed.error || new Error('Incomplete object listing');
    }
    for (const item of listed.data) {
      const order = item && typeof item.bucket === 'string' && typeof item.path === 'string'
        ? Buffer.compare(Buffer.from(`${item.bucket}\0${item.path}`), Buffer.from(`${afterBucket}\0${afterName}`)) : -1;
      if (!item || !['issue-attachments', 'speaking-recordings'].includes(item.bucket)
          || !validOwnedPath(item.path, userId) || order <= 0) {
        throw new Error('Invalid owner-scoped object');
      }
      snapshot.push(item);
      afterBucket = item.bucket;
      afterName = item.path;
    }
    if (listed.data.length < 100) break;
    if (page === 9_999) throw new Error('Storage cleanup needs another retry');
  }
  let audioRemoved = 0;
  for (let offset = 0; offset < snapshot.length; offset += 100) {
    const groups = { 'issue-attachments': [], 'speaking-recordings': [] };
    for (const item of snapshot.slice(offset, offset + 100)) groups[item.bucket].push(item.path);
    for (const [bucket, paths] of Object.entries(groups)) {
      if (!paths.length) continue;
      const removed = await admin.storage.from(bucket).remove(paths);
      if (removed.error || !Array.isArray(removed.data)) throw removed.error || new Error('Ambiguous Storage deletion');
      if (bucket === 'speaking-recordings') audioRemoved += removed.data.length;
    }
  }
  return audioRemoved;
}

/** Resume one job. Its signed receipt proves a missing lock means completion. */
export async function finishDeletion(admin, userId, lockId) {
  if (!UUID.test(userId) || !UUID.test(lockId)) throw new DeletionProblem('Invalid deletion request.', 400);
  const current = await readLock(admin, userId);
  if (!current) return { deleted: true, removedAudioFiles: 0, alreadyCompleted: true };
  if (current.lock_id !== lockId || !durable(current.expires_at)) {
    throw new DeletionProblem('This saved request no longer matches. Please start again.', 409, 'stale_receipt');
  }
  const reservation = await claim(admin, userId, current);
  try {
    // 0081 lists exact owner-scoped Storage metadata under the fenced claim,
    // including unreferenced and uppercase-prefix objects. On 0080, the API
    // lists the owner's prefix instead; that overlap keeps the known old race.
    let removedAudioFiles;
    if (reservation.viaRpc) {
      removedAudioFiles = await clearJobFiles(admin, userId, lockId, reservation);
    } else {
      const beforeDelete = async () => {
        const lock = await readLock(admin, userId);
        const deadline = new Date(reservation.expiry);
        deadline.setUTCFullYear(deadline.getUTCFullYear() - LEASE_YEARS);
        if (!lock || lock.lock_id !== lockId || Date.parse(lock.expires_at) !== Date.parse(reservation.expiry)
            || deadline.getTime() <= Date.now()) throw new Error('Deletion worker expired');
      };
      await clearUserStorage(admin.storage, 'issue-attachments', userId, { beforeDelete });
      removedAudioFiles = await clearUserStorage(admin.storage, 'speaking-recordings', userId, { beforeDelete });
      // 0080's expendable evaluation cache has no owner. The only way to
      // erase this learner's old cached feedback is to discard the shared cache
      // for everyone. New app instances do not repopulate that legacy cache.
      // An old instance can still race this purge until schema expansion.
      await beforeDelete();
      const purged = await admin.from('ai_evaluation_cache').delete().not('cache_key', 'is', null);
      if (purged.error) throw purged.error;
    }
    let finished = await admin.rpc('finish_retryable_data_deletion', {
      p_user_id: userId, p_lock_id: lockId, p_claim_until: reservation.expiry,
      ...(reservation.viaRpc ? { p_claim_token: reservation.token } : {}),
    });
    if (finished.error && missingRpc(finished.error)) {
      // The 0080 wrapper remains available on the old schema. Recheck the
      // claim immediately beforehand; the new RPC adds database-side fencing.
      const beforeFinish = await readLock(admin, userId);
      if (!beforeFinish) return { deleted: true, removedAudioFiles, alreadyCompleted: true };
      if (beforeFinish.lock_id !== lockId || Date.parse(beforeFinish.expires_at) !== Date.parse(reservation.expiry)) {
        throw new DeletionProblem('Deletion is still pending. Please retry.');
      }
      finished = await admin.rpc('finish_week_speaking_deletion', { p_user_id: userId, p_lock_id: lockId });
    }
    if (finished.error || finished.data?.deleted !== true) {
      // Database deletion and removal of the lock are one transaction. If a
      // response was lost after commit, the signed job receipt makes retry a
      // read-only success instead of deleting newly created work a second time.
      const after = await readLock(admin, userId);
      if (!after) return { deleted: true, removedAudioFiles, alreadyCompleted: true };
      throw new DeletionProblem('Some files may already be removed. Your deletion is pending; please retry.');
    }
    return { deleted: true, removedAudioFiles, alreadyCompleted: false };
  } catch (error) {
    if (error instanceof DeletionProblem) throw error;
    throw new DeletionProblem('Some files may already be removed. Your deletion is pending; please retry.');
  } finally {
    // Release only the worker claim, never the durable job. A crashed worker's
    // claim becomes reclaimable after its 30-minute lease; the barrier remains.
    try { await release(admin, userId, lockId, reservation); }
    catch (error) { console.error('[delete-data] worker release failed:', error); }
  }
}
