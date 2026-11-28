import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the real component handlers with lightweight hooks and media fakes.
// Permission promises can resolve after a user leaves; no browser or remote
// service is needed to test that privacy-sensitive lifecycle.
function fixture(kind, { constructorFails = false } = {}) {
  let resolvePermission;
  const permission = new Promise((resolve) => { resolvePermission = resolve; });
  let requests = 0;
  let stoppedTracks = 0;
  let submitted = 0;
  let audioContexts = 0;
  const recorders = [];
  const stream = { getTracks: () => [{ stop() { stoppedTracks++; } }] };
  class Recorder {
    static isTypeSupported() { return true; }
    constructor() {
      if (constructorFails) throw new Error('recorder unavailable');
      this.state = 'inactive'; this.mimeType = 'audio/webm'; recorders.push(this);
    }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
      this.onstop?.();
    }
  }
  class Audio {
    constructor() { audioContexts++; this.state = 'running'; }
    createAnalyser() { return { fftSize: 0, frequencyBinCount: 0 }; }
    createMediaStreamSource() { return { connect() {} }; }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const slots = [];
  let index = 0;
  let pendingEffects = [];
  const react = {
    useState(initial) {
      const i = index++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, (value) => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }];
    },
    useRef(initial) {
      const i = index++;
      if (!slots[i]) slots[i] = { current: initial };
      return slots[i];
    },
    useEffect(effect, deps) {
      const i = index++;
      const previous = slots[i];
      const changed = !previous || !deps || deps.some((dep, n) => !Object.is(dep, previous.deps?.[n]));
      if (changed) pendingEffects.push(() => {
        previous?.cleanup?.();
        slots[i] = { effect: true, deps, cleanup: effect() };
      });
    },
    useContext() { return {}; },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: Symbol('Fragment') },
    '@/lib/b1b2/speech': { speakPhrase() {}, playImprovedAnswerTts: async () => {} },
    '@/lib/b1b2/speaking-feedback.mjs': { structureUsed: () => false, cueChecklistFromEvidence: () => [] },
    '@/components/b1b2/SpeakingFeedbackDetails': { __esModule: true, default() {} },
    '@/components/b1b2/ImprovedAnswerCard': { __esModule: true, default() {} },
    './ImprovedAnswerCard': { __esModule: true, default() {} },
    '@/components/labs/LessonLabContext': { LessonLabContext: {} },
  };
  const file = kind === 'weekly' ? 'components/b1b2/SpeakingFeedbackDetails.tsx' : 'components/labs/SpeakingLab.tsx';
  const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports, require(name) { if (!(name in modules)) throw new Error(`Unexpected import ${name}`); return modules[name]; },
    navigator: { mediaDevices: { getUserMedia() { requests++; return permission; } } },
    MediaRecorder: Recorder, AudioContext: Audio, Blob, FormData, console,
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    fetch: async () => { submitted++; return { ok: true, json: async () => ({ transcript: 'Test.' }) }; },
  });
  const component = kind === 'weekly' ? exports.RecordButton : exports.default;
  function render(props = {}) {
    index = 0;
    pendingEffects = [];
    const tree = component(kind === 'weekly' ? { label: 'Start recording', onRecorded: () => { submitted++; }, ...props } : props);
    for (const effect of pendingEffects) effect();
    return tree;
  }
  function unmount() { for (const slot of slots) if (slot?.effect) slot.cleanup?.(); }
  return { render, unmount, resolvePermission: () => resolvePermission(stream), recorders,
    requests: () => requests, stoppedTracks: () => stoppedTracks, submitted: () => submitted, audioContexts: () => audioContexts };
}

function findButton(node, text) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'button' && node.props.children === text) return node;
  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
  for (const child of children.flat(Infinity)) {
    const found = findButton(child, text);
    if (found) return found;
  }
  return null;
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

for (const kind of ['weekly', 'lab']) {
  test(`${kind}: pending permission cannot open two microphones`, async () => {
    const f = fixture(kind);
    const start = findButton(f.render(), 'Start recording');
    assert.ok(start);
    start.props.onClick(); start.props.onClick();
    assert.equal(f.requests(), 1);
    const pending = findButton(f.render(), 'Starting microphone…');
    assert.equal(pending?.props.disabled, true);
    f.resolvePermission(); await flush();
    assert.equal(f.recorders.length, 1);
    const stop = findButton(f.render(), 'Stop recording');
    assert.ok(stop);
    stop.props.onClick(); await flush();
    assert.ok(f.stoppedTracks() >= 1);
    assert.equal(f.submitted(), 1);
    f.unmount();
  });

  test(`${kind}: leaving before a permission grant stops the late stream`, async () => {
    const f = fixture(kind);
    findButton(f.render(), 'Start recording').props.onClick();
    f.unmount();
    f.resolvePermission(); await flush();
    assert.equal(f.stoppedTracks(), 1);
    assert.equal(f.recorders.length, 0);
    assert.equal(f.audioContexts(), 0);
    assert.equal(f.submitted(), 0);
  });

  test(`${kind}: leaving an active recording stops it without submitting`, async () => {
    const f = fixture(kind);
    findButton(f.render(), 'Start recording').props.onClick();
    f.resolvePermission(); await flush();
    assert.equal(f.recorders[0].state, 'recording');
    f.unmount(); await flush();
    assert.equal(f.recorders[0].state, 'inactive');
    assert.ok(f.stoppedTracks() >= 1);
    assert.equal(f.submitted(), 0);
  });

  test(`${kind}: a recorder setup failure releases an acquired stream`, async () => {
    const f = fixture(kind, { constructorFails: true });
    findButton(f.render(), 'Start recording').props.onClick();
    f.resolvePermission(); await flush();
    assert.ok(f.stoppedTracks() >= 1);
    assert.equal(f.submitted(), 0);
    assert.ok(findButton(f.render(), 'Start recording'));
    f.unmount();
  });
}

test('weekly: a changed callback is used when recording stops', async () => {
  const f = fixture('weekly');
  let oldCalls = 0; let newCalls = 0;
  const oldCallback = () => { oldCalls++; };
  const newCallback = () => { newCalls++; };
  findButton(f.render({ onRecorded: oldCallback }), 'Start recording').props.onClick();
  f.resolvePermission(); await flush();
  const stop = findButton(f.render({ onRecorded: newCallback }), 'Stop recording');
  stop.props.onClick();
  assert.equal(oldCalls, 0);
  assert.equal(newCalls, 1);
  f.unmount();
});
