// The SQL function classifies object metadata using a completed-deletion
// marker and upload generation. It returns only private-bucket candidates;
// actual object removal always goes through the Storage API.
const BUCKETS = new Set(['speaking-recordings', 'issue-attachments']);
const USER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validPath(path) {
  if (typeof path !== 'string') return false;
  const parts = path.split('/');
  return parts.length > 1 && USER.test(parts[0])
    && parts.every((part) => part && part !== '.' && part !== '..');
}

/** @param {{examined: number, removed: number}} counts */
function ignoreProgress(counts) { void counts; }

/** Remove late files; return counts only. The optional owner is for isolated tests. */
export async function sweepLateDeletionFiles(admin, { userId = null, batchSize = 100, maxBatches = 1000,
  onProgress = ignoreProgress } = {}) {
  if (userId !== null && !USER.test(userId)) throw new Error('Invalid sweep owner');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100
    || !Number.isInteger(maxBatches) || maxBatches < 1) throw new Error('Invalid sweep limit');
  let cursorBucket = '';
  let cursorName = '';
  let removed = 0;
  let examined = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const page = await admin.rpc('list_late_deletion_files', {
      p_after_bucket: cursorBucket, p_after_name: cursorName, p_limit: batchSize, p_user_id: userId,
    });
    if (page.error || !Array.isArray(page.data)) {
      const error = new Error('Could not list late deletion files');
      error.code = page.error?.code;
      throw error;
    }
    if (!page.data.length) return { examined, removed, hasMore: false };
    const groups = { 'speaking-recordings': [], 'issue-attachments': [] };
    let previous = `${cursorBucket}\0${cursorName}`;
    for (const item of page.data) {
      if (!item || !BUCKETS.has(item.bucket_id) || !validPath(item.object_name)
        || (userId && item.object_name.split('/')[0].toLowerCase() !== userId.toLowerCase())) {
        throw new Error('Invalid late deletion file');
      }
      const identity = `${item.bucket_id}\0${item.object_name}`;
      // The database orders by C collation, matching this bytewise cursor.
      // Refuse an incomplete, duplicate or out-of-order page rather than
      // accidentally skipping candidates after a successful-looking run.
      if (Buffer.compare(Buffer.from(identity), Buffer.from(previous)) <= 0) {
        throw new Error('Unordered late deletion file');
      }
      previous = identity;
      groups[item.bucket_id].push(item.object_name);
    }
    examined += page.data.length;
    onProgress({ examined, removed });
    for (const [bucket, paths] of Object.entries(groups)) {
      if (!paths.length) continue;
      const result = await admin.storage.from(bucket).remove(paths);
      // A shorter response may mean a concurrent worker already removed a
      // file, or an incomplete/ambiguous provider operation. Do not report a
      // successful sweep without a complete acknowledgment; the next run
      // re-lists from the beginning and safely resolves either case.
      if (result.error || !Array.isArray(result.data) || result.data.length > paths.length) {
        throw new Error('Could not remove late deletion files');
      }
      removed += result.data.length;
      onProgress({ examined, removed });
      if (result.data.length !== paths.length) throw new Error('Could not remove late deletion files');
    }
    const last = page.data.at(-1);
    cursorBucket = last.bucket_id;
    cursorName = last.object_name;
    if (page.data.length < batchSize) return { examined, removed, hasMore: false };
  }
  return { examined, removed, hasMore: true };
}
