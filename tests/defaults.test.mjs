import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setDefaultConfig } from '../src/compat.js';
import { isOpenAIReasoningModel } from '../src/models.js';

test('new installations select a model served by the current OpenAI Responses API', async () => {
  const storage = {};
  globalThis.chrome = { storage: { sync: {
    get: async () => ({ ...storage }), set: async updates => Object.assign(storage, updates),
  } } };
  try {
    await setDefaultConfig();
    assert.equal(isOpenAIReasoningModel(storage.profile__default.model), true);
  } finally { delete globalThis.chrome; }
});
test('installation setup preserves existing profile model choices', async () => {
  const storage = { defaultProfile: 'pinned', profiles: ['pinned'], profile__pinned: { model: 'gpt-5.6-sol', thinkingEffort: 'high' } };
  globalThis.chrome = { storage: { sync: {
    get: async () => ({ ...storage }), set: async updates => Object.assign(storage, updates),
  } } };
  try {
    await setDefaultConfig();
    assert.deepEqual(storage.profile__pinned, { model: 'gpt-5.6-sol', thinkingEffort: 'high' });
  } finally { delete globalThis.chrome; }
});
