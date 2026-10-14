// Live checks use the extension's real request builders and stream readers.
// Requires provider keys in the environment; never prints or writes credentials.
import { fetchAndStream } from '../src/gpt.js';
import { MODEL_GROUPS } from '../src/models.js';

const credentials = {
  openAIKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  googleApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  perplexityApiKey: process.env.PERPLEXITY_API_KEY,
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  xaiApiKey: process.env.XAI_API_KEY,
  moonshotApiKey: process.env.MOONSHOT_API_KEY || process.env.KIMI_API_KEY,
  qwenApiKey: process.env.QWEN_API_KEY || process.env.BAILIAN_TOKEN_PLAN_API_KEY,
};
const groups = ['openAIKey', 'anthropicApiKey', 'googleApiKey', 'perplexityApiKey', 'xaiApiKey', 'moonshotApiKey', 'qwenApiKey', 'openRouterApiKey'];
const requested = new Set(process.argv.slice(2));
const originalFetch = globalThis.fetch;
const log = console.log.bind(console);
console.log = console.error = () => {}; // The extension otherwise logs full prompts/events.
let failed = false;
let checked = 0;
let skipped = 0;

for (let index = 0; index < MODEL_GROUPS.length; index++) {
  const [provider, models] = MODEL_GROUPS[index];
  if (!credentials[groups[index]]) {
    log(`SKIP ${provider}: ${groups[index]} credential unavailable`);
    skipped += models.length;
    continue;
  }
  for (const [model] of models) {
    if (requested.size && !requested.has(model)) continue;
    checked++;
    const timeoutMs = model.includes('fable') ? 1_200_000 : model.startsWith('grok-') ? 900_000 : 180_000;
    let result;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const events = [];
      const storage = { ...credentials, profile__check: { model, thinkingEffort: 'low' } };
      globalThis.chrome = { storage: { sync: { get: async () => storage } } };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      globalThis.fetch = (url, init) => originalFetch(url, { ...init, signal: controller.signal });
      const start = Date.now();
      try {
        await fetchAndStream({ onDisconnect: { addListener() {} }, postMessage: event => events.push(event) }, [
          { role: 'system', content: 'Follow the user instruction. No research is needed.' },
          { role: 'user', content: 'Reply with exactly API_OK.' },
        ], model, 'check');
        result = events.at(-1);
        if (result?.action === 'GPT_DONE' && result.summary.trim() === 'API_OK') {
          log(`PASS ${model}: streamed API_OK (${((Date.now() - start) / 1000).toFixed(1)}s)`);
          break;
        }
        const error = result?.error || `Unexpected result: ${result?.action || 'no terminal event'}`;
        const hadOutput = events.some(event => event.action === 'GPT_MESSAGE');
        log(`FAIL ${model} attempt ${attempt}: ${error}${hadOutput ? ' (partial output received; no cache was written)' : ''}`);
        if (attempt === 3) failed = true;
      } catch (error) {
        log(`FAIL ${model} attempt ${attempt}: ${error.message}`);
        if (attempt === 3) failed = true;
      } finally {
        clearTimeout(timer);
      }
    }
  }
}
globalThis.fetch = originalFetch;
delete globalThis.chrome;
log(`Checked ${checked} models; skipped ${skipped} models without credentials.`);
if (failed || !checked) process.exitCode = 1;
