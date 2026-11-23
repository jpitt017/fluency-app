/** Delete all objects beneath one authenticated user's prefix, including nested folders. */
export async function clearUserStorage(storage, bucket, userId) {
  const client = storage.from(bucket);
  async function clear(prefix, depth) {
    if (depth > 20) throw new Error('Storage folder nesting is too deep.');
    let removedCount = 0;
    while (true) {
      const { data, error } = await client.list(prefix, { limit: 100 });
      if (error) throw error;
      if (!data?.length) return removedCount;
      const files = [];
      for (const item of data) {
        if (!item.name || item.name.includes('/') || item.name === '.' || item.name === '..') throw new Error('Invalid storage object name.');
        const path = `${prefix}/${item.name}`;
        if (item.id) files.push(path);
        else removedCount += await clear(path, depth + 1);
      }
      if (files.length) {
        const removed = await client.remove(files);
        if (removed.error || !removed.data || removed.data.length !== files.length) throw removed.error || new Error('Storage deletion incomplete.');
        removedCount += files.length;
      } else {
        // Empty folders are virtual; repeated entries mean the provider did not remove them.
        const again = await client.list(prefix, { limit: 100 });
        if (again.error) throw again.error;
        if (again.data?.length) throw new Error('Storage cleanup incomplete.');
        return removedCount;
      }
    }
  }
  return clear(userId, 0);
}
