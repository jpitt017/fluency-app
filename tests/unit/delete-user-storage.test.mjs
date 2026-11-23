import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearUserStorage } from '../../lib/b1b2/delete-user-storage.mjs';

function fakeStorage(initial) {
  const objects = new Set(initial);
  const client = {
    async list(prefix, { limit }) {
      const names = new Map();
      for (const path of objects) {
        if (!path.startsWith(`${prefix}/`)) continue;
        const rest = path.slice(prefix.length + 1);
        const [name, ...parts] = rest.split('/');
        names.set(name, { name, id: parts.length ? null : name });
      }
      return { data: [...names.values()].slice(0, limit), error: null };
    },
    async remove(paths) { for (const path of paths) objects.delete(path); return { data: paths.map(name => ({ name })), error: null }; },
  };
  return { objects, storage: { from: () => client } };
}

test('removes nested and paginated user files without touching other users', async () => {
  const paths = Array.from({ length: 120 }, (_, i) => `user/${i}.wav`);
  const fake = fakeStorage([...paths, 'user/sub/one.wav', 'someone/recording.wav']);
  assert.equal(await clearUserStorage(fake.storage, 'speaking-recordings', 'user'), 121);
  assert.deepEqual([...fake.objects], ['someone/recording.wav']);
});

test('fails closed on storage listing or deletion errors', async () => {
  const badList = { from: () => ({ list: async () => ({ error: new Error('list failed') }) }) };
  await assert.rejects(clearUserStorage(badList, 'bucket', 'user'), /list failed/);
  const badRemove = { from: () => ({ list: async () => ({ data: [{ id: 'id', name: 'a' }] }), remove: async () => ({ error: new Error('remove failed') }) }) };
  await assert.rejects(clearUserStorage(badRemove, 'bucket', 'user'), /remove failed/);
});
