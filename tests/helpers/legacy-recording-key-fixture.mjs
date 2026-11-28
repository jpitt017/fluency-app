// In-memory stand-in for 0080's ai_request_logs bigint identity. Used only by
// unit tests; hosted rollout CI exercises PostgREST and the real identity.
export function legacyRecordingKeyFixture() {
  let next = 0n;
  const rows = new Map();
  const calls = [];
  const state = { insertError: false, deleteError: false, insertedId: undefined, deletedId: undefined };
  const table = {
    insert(row) {
      calls.push(['insert', row]);
      return { select(columns) {
        calls.push(['insert-select', columns]);
        return { async single() {
          const id = (++next).toString();
          rows.set(id, row);
          if (state.insertError) return { data: null, error: { message: 'ambiguous insert' } };
          return { data: { id: state.insertedId === undefined ? id : state.insertedId }, error: null };
        } };
      } };
    },
    delete() {
      const filters = {};
      const query = {
        eq(key, value) { filters[key] = value; return query; },
        is(key, value) { filters[key] = value; return query; },
        select(columns) { calls.push(['delete-select', columns]); return query; },
        async maybeSingle() {
          calls.push(['delete', { ...filters }]);
          if (state.deleteError) return { data: null, error: { message: 'ambiguous cleanup' } };
          const row = rows.get(filters.id);
          if (!row || row.endpoint !== filters.endpoint || row.user_id !== filters.user_id) return { data: null, error: null };
          rows.delete(filters.id);
          return { data: { id: state.deletedId === undefined ? filters.id : state.deletedId }, error: null };
        },
      };
      return query;
    },
  };
  return { table, rows, calls, state };
}
