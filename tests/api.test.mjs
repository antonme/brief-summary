import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchAndStream } from '../src/gpt.js';

const messages = [{ role: 'system', content: 'Be concise.' }, { role: 'user', content: 'Summarize this page.' }];
const answer = { type: 'response.output_text.delta', item_id: 'msg_1', delta: 'Résumé 🌍' };
const completed = { type: 'response.completed', response: { status: 'completed', output: [] } };

async function run(model, effort = 'dynamic', events = [answer, completed], options = {}) {
  const storage = { openAIKey: 'openai-test', anthropicApiKey: 'claude-test', googleApiKey: 'google-test',
    perplexityApiKey: 'perplexity-test', openRouterApiKey: 'router-test', xaiApiKey: 'xai-test',
    moonshotApiKey: 'kimi-test', qwenApiKey: 'qwen-test', profile__test: { model, thinkingEffort: effort } };
  globalThis.chrome = { storage: { sync: { get: async () => storage } } };
  const sent = [];
  let request;
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const originalError = console.error;
  console.log = console.error = () => {};
  globalThis.fetch = async (url, init) => {
    request = { url, headers: init.headers, body: JSON.parse(init.body), signal: init.signal };
    if (options.httpError) return new Response(JSON.stringify({ error: { message: 'Invalid effort' } }), { status: 400 });
    const text = events.map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join('') + (options.rawDone ? 'data:[DONE]\r\n\r\n' : '');
    const bytes = new TextEncoder().encode(text);
    return new Response(new ReadableStream({ start(controller) {
      // Network chunks can split JSON, SSE delimiters and multibyte text.
      if (options.fragmented) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      else controller.enqueue(bytes);
      if (options.neverEnds) {
        init.signal?.addEventListener('abort', () => controller.error(init.signal.reason), { once: true });
      } else if (options.failAfterTerminal) setTimeout(() => controller.error(new Error('Transport failed after completion')), 20);
      else controller.close();
    } }), { headers: { 'Content-Type': 'text/event-stream' } });
  };
  try {
    await fetchAndStream({ postMessage: m => sent.push(m), onDisconnect: { addListener() {} } }, messages, model, 'test');
    return { request, sent };
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    console.error = originalError;
    delete globalThis.chrome;
  }
}

for (const model of ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna']) {
  test(`${model} streams through Responses with max effort`, async () => {
    const { request, sent } = await run(model, 'max');
    assert.equal(request.url, 'https://api.openai.com/v1/responses');
    assert.equal(request.body.reasoning.effort, 'max');
    assert.equal(request.body.instructions, 'Be concise.');
    assert.equal(sent.at(-1).summary, 'Résumé 🌍');
  });
}
for (const [model, expected] of [['gpt-6-astra', 'low'], ['gpt-6.1-sol', 'low'], ['gpt-6-luna', 'none'], ['gpt-6-sol', 'none']]) {
  test(`${model} maps a saved off setting to supported effort`, async () => {
    const { request } = await run(model, 'off');
    assert.equal(request.body.reasoning?.effort, expected);
  });
}
for (const model of ['gemini-4-argon', 'gemini-3.8-flash']) {
  test(`${model} uses levels instead of a legacy thinking budget`, async () => {
    const { request } = await run(model, 'off');
    assert.equal(request.body.generationConfig.thinkingConfig.thinkingLevel, 'low');
    assert.equal(request.body.generationConfig.thinkingConfig.thinkingBudget, undefined);
    assert.equal(request.body.systemInstruction.parts[0].text, 'Be concise.');
  });
}
for (const [model, type] of [['claude-opus-5-5', 'adaptive'], ['claude-fable-5-1', 'adaptive'], ['claude-sonnet-5-5', 'between_tools'], ['claude-haiku-5-5', 'disabled']]) {
  test(`${model} uses its supported lowest thinking mode`, async () => {
    const { request } = await run(model, 'off');
    assert.equal(request.body.thinking.type, type);
    assert.equal(request.body.output_config.effort, 'low');
  });
}
test('Sonnet 5.5 supports max effort', async () => {
  const { request } = await run('claude-sonnet-5-5', 'max');
  assert.equal(request.body.output_config.effort, 'max');
});
test('Kimi K3 preserves the selected low effort', async () => {
  const { request } = await run('kimi-k3', 'low');
  assert.equal(request.body.reasoning_effort, 'low');
});
test('Qwen stable models can disable thinking', async () => {
  const { request } = await run('qwen3.8-max', 'off');
  assert.equal(request.body.enable_thinking, false);
  assert.equal(request.body.thinking_budget, undefined);
});
for (const [model, preset] of [['sonar-pro', 'fast'], ['sonar-deep-research', 'high'], ['perplexity/xhigh', 'xhigh']]) {
  test(`${model} uses the current Perplexity Agent API`, async () => {
    const { request, sent } = await run(model);
    assert.equal(request.url, 'https://api.perplexity.ai/v1/agent');
    assert.equal(request.headers.Authorization, 'Bearer perplexity-test');
    assert.equal(request.body.preset, preset);
    assert.equal(request.body.instructions, 'Be concise.');
    assert.equal(request.body.messages, undefined);
    assert.equal(sent.at(-1).summary, 'Résumé 🌍');
  });
}
test('fragmented UTF-8 and SSE still produce the exact answer', async () => {
  const { sent } = await run('gpt-5.6-sol', 'low', [answer, completed], { fragmented: true });
  assert.equal(sent.at(-1).summary, 'Résumé 🌍');
});
for (const model of ['gpt-5.6-sol', 'grok-4.7', 'claude-opus-5-5', 'gemini-4-argon', 'openrouter/z-ai/glm-5.3']) {
  test(`${model} reports mid-stream failures without caching partial content`, async () => {
    const { sent } = await run(model, 'low', [answer, { type: 'error', error: { message: 'Provider overloaded' } }]);
    assert.equal(sent.at(-1).action, 'GPT_ERROR');
    assert.match(sent.at(-1).error, /Provider overloaded/);
    assert.equal(sent.some(m => m.action === 'GPT_DONE'), false);
  });
}
test('HTTP API errors retain the provider message', async () => {
  const { sent } = await run('gpt-5.6-sol', 'low', [], { httpError: true });
  assert.equal(sent.at(-1).error, 'Invalid effort');
});
test('thinking-only output is not saved as a completed summary', async () => {
  const { sent } = await run('claude-fable-5-1', 'high', [
    { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Thinking privately' } },
    { type: 'message_delta', delta: { stop_reason: 'max_tokens' } }
  ]);
  assert.equal(sent.at(-1).action, 'GPT_ERROR');
  assert.equal(sent.some(m => m.action === 'GPT_DONE'), false);
});
for (const [model, events, expected] of [
  ['claude-opus-5-5', [
    { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Reasoning' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Answer' } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' } }, { type: 'message_stop' },
  ], 'Answer'],
  ['gemini-4-argon', [
    { candidates: [{ content: { parts: [{ text: 'Reasoning', thought: true }] } }] },
    { candidates: [{ content: { parts: [{ text: 'Answer' }] }, finishReason: 'STOP' }] },
  ], 'Answer'],
  ['kimi-k3', [
    { choices: [{ delta: { reasoning_content: 'Reasoning' }, finish_reason: null }] },
    { choices: [{ delta: { content: 'Answer' }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
  ], 'Answer'],
  ['qwen3.8-max', [
    { choices: [{ delta: { reasoning_content: 'Reasoning' }, finish_reason: null }] },
    { choices: [{ delta: { content: 'Answer' }, finish_reason: 'stop' }] }, { choices: [], usage: { total_tokens: 10 } },
  ], 'Answer'],
  ['openrouter/z-ai/glm-5.3', [
    { choices: [{ delta: { content: 'Answer' }, finish_reason: 'stop' }] },
  ], 'Answer'],
  ['grok-4.7', [answer, completed], 'Résumé 🌍'],
  ['gpt-4o-mini', [{ choices: [{ delta: { content: 'Answer' }, finish_reason: 'stop' }] }], 'Answer'],
]) {
  test(`${model} completes with answer text only`, async () => {
    const { sent } = await run(model, 'low', events, { fragmented: true });
    assert.equal(sent.at(-1).action, 'GPT_DONE');
    assert.equal(sent.at(-1).summary, expected);
  });
}
test('Grok 4.7 applies its selected reasoning effort', async () => {
  const { request } = await run('grok-4.7', 'xhigh');
  assert.equal(request.body.reasoning.effort, 'xhigh');
});
for (const [model, events] of [
  ['gpt-6.1-sol', [answer]],
  ['claude-opus-5-5', [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Partial' } }]],
  ['gemini-4-argon', [{ candidates: [{ content: { parts: [{ text: 'Partial' }] } }] }]],
  ['openrouter/z-ai/glm-5.3', [{ choices: [{ delta: { content: 'Partial' }, finish_reason: null }] }]],
]) {
  test(`${model} does not cache a stream that ends before completion`, async () => {
    const { sent } = await run(model, 'low', events);
    assert.equal(sent.at(-1).action, 'GPT_ERROR');
    assert.equal(sent.some(m => m.action === 'GPT_DONE'), false);
  });
}
test('Chat Completions length stop is an error instead of a completed summary', async () => {
  const { sent } = await run('kimi-k3', 'low', [{ choices: [{ delta: { content: 'Partial' }, finish_reason: 'length' }] }]);
  assert.equal(sent.at(-1).action, 'GPT_ERROR');
});
test('Gemini reports safety blocks without caching the partial answer', async () => {
  const { sent } = await run('gemini-4-argon', 'low', [{ candidates: [{ content: { parts: [{ text: 'Partial' }] }, finishReason: 'SAFETY' }] }]);
  assert.equal(sent.at(-1).action, 'GPT_ERROR');
  assert.match(sent.at(-1).error, /SAFETY/);
});
test('Gemini 3.1 Pro normalizes an unsupported saved minimal setting', async () => {
  const { request } = await run('gemini-3.1-pro-preview', 'off');
  assert.equal(request.body.generationConfig.thinkingConfig.thinkingLevel, 'low');
});
test('Gemini 4 dynamic effort explicitly sends its medium default', async () => {
  const { request } = await run('gemini-4-argon', 'dynamic');
  assert.equal(request.body.generationConfig.thinkingConfig.thinkingLevel, 'medium');
});

for (const [model, events] of [
  ['gpt-6.1-sol', [answer, completed]],
  ['perplexity/fast', [answer, completed]],
  ['grok-4.7', [answer, completed]],
  ['claude-opus-5-5', [{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Answer' } }, { type: 'message_stop' }]],
  ['gemini-4-argon', [{ candidates: [{ content: { parts: [{ text: 'Answer' }] }, finishReason: 'STOP' }] }]],
  ['openrouter/z-ai/glm-5.3', [{ choices: [{ delta: { content: 'Answer' }, finish_reason: 'stop' }] }]],
]) {
  test(`${model} completes at its protocol terminator without awaiting transport EOF`, async () => {
    const { sent } = await run(model, 'low', events, { failAfterTerminal: true });
    assert.equal(sent.at(-1).action, 'GPT_DONE');
  });
}

for (const model of ['openrouter/z-ai/glm-5.3', 'kimi-k3', 'qwen3.8-max', 'gpt-4o-mini']) {
  test(`${model} recognizes the Chat Completions DONE terminator`, async () => {
    const { sent } = await run(model, 'low', [{ choices: [{ delta: { content: 'Answer' }, finish_reason: null }] }], { rawDone: true, failAfterTerminal: true });
    assert.equal(sent.at(-1).action, 'GPT_DONE');
    assert.equal(sent.at(-1).summary, 'Answer');
  });
}

test('Grok reports web search activity while no answer text is available', async () => {
  const { sent } = await run('grok-4.7', 'dynamic', [
    { type: 'response.reasoning_summary_text.delta', delta: 'Planning research' },
    { type: 'response.web_search_call.searching', item_id: 'search_1' },
    { type: 'response.web_search_call.completed', item_id: 'search_1' },
    answer, completed,
  ]);
  assert.ok(sent.some(e => e.action === 'GPT_STATUS' && /search/i.test(e.status)));
  assert.equal(sent.at(-1).action, 'GPT_DONE');
});
test('Grok explicitly sends its default high reasoning effort', async () => {
  const { request } = await run('grok-4.7', 'dynamic');
  assert.equal(request.body.reasoning?.effort, 'high');
});
test('Grok surfaces a deadline error after a thinking-only stream stalls for 15 minutes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const running = run('grok-4.7', 'dynamic', [
    { type: 'response.reasoning_summary_text.delta', delta: 'Planning research' },
  ], { neverEnds: true });
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(900_000);
  // An unfixed client never completes; close the test with a bounded diagnostic.
  const result = await Promise.race([running, new Promise(resolve => setImmediate(() => resolve(null)))]);
  assert.ok(result, 'A stalled Grok stream must terminate at its 15-minute deadline');
  assert.equal(result.sent.at(-1).action, 'GPT_ERROR');
  assert.match(result.sent.at(-1).error, /15 minutes/);
});
test('Grok uses final response content when a provider omits answer deltas', async () => {
  const { sent } = await run('grok-4.7', 'low', [
    { type: 'response.reasoning_summary_text.delta', delta: 'Planning research' },
    { type: 'response.completed', response: { status: 'completed', output: [
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Final answer' }] },
    ] } },
  ]);
  assert.equal(sent.at(-1).action, 'GPT_DONE');
  assert.equal(sent.at(-1).summary, 'Final answer');
});
test('Grok final-response fallback excludes interim assistant commentary', async () => {
  const { sent } = await run('grok-4.7', 'low', [{ type: 'response.completed', response: { status: 'completed', output: [
    { type: 'message', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: 'I will research this.' }] },
    { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'Final answer' }] },
  ] } }]);
  assert.equal(sent.at(-1).summary, 'Final answer');
});
test('Grok completed-response fallback sends linked citations to the popup', async () => {
  const { sent } = await run('grok-4.7', 'low', [{ type: 'response.completed', response: { status: 'completed', citations: ['https://example.com/source'], output: [
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Answer [1]' }] },
  ] } }]);
  const message = sent.find(e => e.action === 'GPT_MESSAGE');
  assert.match(message.summary, /href="https:\/\/example.com\/source"/);
  assert.equal(message.summary, sent.at(-1).summary);
});
