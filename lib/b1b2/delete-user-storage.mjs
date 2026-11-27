/**
 * Compatibility helper for the 0080 schema, which cannot enumerate exact object
 * metadata through the newer fenced RPC. Take a complete owner-prefix snapshot
 * before removal and recheck the worker claim after listing. This prevents a
 * delayed worker from discovering new files after another worker finishes.
 * The old schema cannot fence late non-weekly uploads; see the rollout notes.
 */
export async function clearUserStorage(storage, bucket, userId, { beforeDelete = async () => {} } = {}) {
  if (typeof userId !== 'string' || !userId || userId.includes('/') || userId === '.' || userId === '..') {
    throw new Error('Invalid storage owner.');
  }
  const client = storage.from(bucket);
  const paths = [];
  async function collect(prefix, depth) {
    if (depth > 20) throw new Error('Storage folder nesting is too deep.');
    const names = new Set();
    for (let page = 0; page < 10_000; page += 1) {
      const { data, error } = await client.list(prefix, {
        limit: 100, offset: page * 100, sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw error;
      if (!Array.isArray(data) || data.length > 100) throw new Error('Storage listing is incomplete.');
      for (const item of data) {
        if (typeof item.name !== 'string' || !item.name || item.name.includes('/') || item.name === '.' || item.name === '..' || names.has(item.name)) {
          throw new Error('Invalid storage object name.');
        }
        names.add(item.name);
        const path = `${prefix}/${item.name}`;
        if (item.id) paths.push(path);
        else await collect(path, depth + 1);
      }
      if (data.length < 100) return;
    }
    throw new Error('Storage listing needs another retry.');
  }
  await collect(userId, 0);
  // This check follows the last listing. If another worker finished while a
  // Storage response was delayed, discard the snapshot without removing it.
  await beforeDelete();
  let removedCount = 0;
  for (let start = 0; start < paths.length; start += 100) {
    const batch = paths.slice(start, start + 100);
    const removed = await client.remove(batch);
    if (removed.error) throw removed.error;
    // A partial/no-op response leaves the durable job for a fresh retry.
    if (!Array.isArray(removed.data) || removed.data.length !== batch.length) throw new Error('Storage deletion incomplete.');
    removedCount += removed.data.length;
  }
  return removedCount;
}
