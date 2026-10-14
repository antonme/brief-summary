import { debug } from './util.js';
import { normalizeEffort, isOpenAIReasoningModel } from './models.js';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const ERR_OPENAI_KEY = 'Error: OpenAI API key is not set';

// Add new constants for Anthropic
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ERR_ANTHROPIC_API_KEY = 'Error: Anthropic API key is not set';

// Add new constants for Perplexity
const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/v1/agent';
const ERR_PERPLEXITY_API_KEY = 'Error: Perplexity API key is not set';

// Add new constants for Google Gemini
const GOOGLE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';
const ERR_GOOGLE_API_KEY = 'Error: Google API key is not set';

// Add new constants for OpenRouter
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const ERR_OPENROUTER_API_KEY = 'Error: OpenRouter API key is not set';

// Add new constants for xAI (Responses API required for web_search tool)
const XAI_ENDPOINT = 'https://api.x.ai/v1/responses';
const ERR_XAI_API_KEY = 'Error: xAI API key is not set';

// Add new constants for Moonshot (Kimi K3, OpenAI-compatible open platform).
// Keys are endpoint-specific: a Kimi Code subscription key does NOT work
// here — an open-platform key is required.
const MOONSHOT_ENDPOINT = 'https://api.moonshot.ai/v1/chat/completions';
const ERR_MOONSHOT_API_KEY = 'Error: Moonshot API key is not set';

// Qwen uses the international Token Plan endpoint and its dedicated key.
const QWEN_ENDPOINT = 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions';
const ERR_QWEN_API_KEY = 'Error: Qwen API key is not set';

// OpenAI Responses API — used for GPT-5+ and o-series reasoning models so that
// `response.reasoning_summary_text.delta` events stream visible thinking
// progress. Chat Completions stays as the fallback for legacy GPT models
// (gpt-4o-mini, gpt-4-turbo, etc.) that don't need reasoning streaming.
const OPENAI_RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses';

/*------------------------------------------------------------------------------
 * Transforms xAI citations from numbered format to domain-based format.
 * Uses a citations map to replace [1], [2] etc. with superscript linked domains.
 * Output format: <sup><a href="url">[domain]</a></sup> with thin space for separation
 *----------------------------------------------------------------------------*/
function transformCitationsToDomains(text, citationsMap = {}) {
  // First, handle any inline citations with URLs: [[1]](url) or [1](url)
  let result = text.replace(/\[?\[(\d+)\]\]?\((https?:\/\/[^)]+)\)/g, (match, num, url) => {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');
      // Add thin space after for separation when multiple citations are adjacent
      return `<sup><a href="${url}" target="_blank" title="${url}">[${domain}]</a></sup> `;
    } catch (e) {
      return match;
    }
  });

  // Then, handle plain numbered references [1], [2] using the citations map
  // Only match [number] that's NOT already followed by (url)
  result = result.replace(/\[(\d+)\](?!\()/g, (match, num) => {
    const url = citationsMap[num];
    if (url) {
      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace(/^www\./, '');
        // Add thin space after for separation when multiple citations are adjacent
        return `<sup><a href="${url}" target="_blank" title="${url}">[${domain}]</a></sup> `;
      } catch (e) {
        return match;
      }
    }
    return match;
  });

  return result;
}

// Decode SSE frames across arbitrary network/UTF-8 boundaries. The providers
// all use SSE; framing belongs here rather than in their individual adapters.
async function* readServerEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let finished = false;
  const parseFrame = frame => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data) return null;
    if (data === '[DONE]') return { type: 'stream.done' };
    return JSON.parse(data);
  };
  try {
    while (!finished) {
      const { value, done } = await reader.read();
      finished = done;
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        const frame = pending.slice(0, boundary.index);
        pending = pending.slice(boundary.index + boundary[0].length);
        const event = parseFrame(frame);
        if (event) yield event;
      }
    }
    if (pending.trim()) {
      const event = parseFrame(pending);
      if (event) yield event;
    }
  } finally {
    if (!finished) {
      try { await reader.cancel(); } catch { /* Completion/consumer cancellation already decided the result. */ }
    }
    reader.releaseLock();
  }
}

// Modify fetchCompletions to handle CORS for Perplexity and Google Gemini
async function fetchCompletions(apiKey, payload, useAnthropicApi = false, usePerplexityApi = false, useGoogleApi = false, useOpenRouterApi = false, useXaiApi = false, model = '', useOpenAIResponsesApi = false, useMoonshotApi = false, useQwenApi = false, signal) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (useAnthropicApi) {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';

    console.log('Sending request to Anthropic API:', {
      endpoint: ANTHROPIC_ENDPOINT,
      headers: { ...headers, 'x-api-key': '***' },
      payload
    });

    return fetch(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
  } else if (usePerplexityApi) {
    headers['Authorization'] = `Bearer ${apiKey}`;

    console.log('Sending request to Perplexity API:', {
      endpoint: PERPLEXITY_ENDPOINT,
      headers: { ...headers, Authorization: '***' },
      payload
    });

    return fetch(PERPLEXITY_ENDPOINT, {
      method: 'POST',
      headers: headers,
      mode: 'cors',
      body: JSON.stringify(payload)
    });
  } else if (useGoogleApi) {
    // Google uses x-goog-api-key header instead of Authorization
    headers['x-goog-api-key'] = apiKey;

    // Build the Google endpoint with model and streaming
    const endpoint = `${GOOGLE_ENDPOINT}${model}:streamGenerateContent?alt=sse`;

    console.log('Sending request to Google Gemini API:', {
      endpoint,
      headers: { ...headers, 'x-goog-api-key': '***' },
      payload
    });

    return fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
  } else if (useOpenRouterApi) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['HTTP-Referer'] = 'https://github.com/sysread/page-summarizer';
    headers['X-Title'] = 'Page Summarizer';

    console.log('Sending request to OpenRouter API:', {
      endpoint: OPENROUTER_ENDPOINT,
      headers: { ...headers, Authorization: '***' },
      payload
    });

    return fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
  } else if (useXaiApi) {
    headers['Authorization'] = `Bearer ${apiKey}`;

    console.log('Sending request to xAI API:', {
      endpoint: XAI_ENDPOINT,
      headers: { ...headers, Authorization: '***' },
      payload
    });

    return fetch(XAI_ENDPOINT, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
      signal,
    });
  } else if (useMoonshotApi || useQwenApi) {
    // Both are OpenAI-compatible Chat Completions with plain Bearer auth;
    // they differ only in endpoint (and in payload, built by the caller).
    headers['Authorization'] = `Bearer ${apiKey}`;
    const endpoint = useMoonshotApi ? MOONSHOT_ENDPOINT : QWEN_ENDPOINT;

    console.log(`Sending request to ${useMoonshotApi ? 'Moonshot' : 'Qwen'} API:`, {
      endpoint,
      headers: { ...headers, Authorization: '***' },
      payload
    });

    return fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
  } else if (useOpenAIResponsesApi) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    // Hint intermediate proxies/CDNs to forward the response as event-stream
    // rather than buffering it as a single body.
    headers['Accept'] = 'text/event-stream';

    // The multi-agent beta (ultra mode on GPT-5.6) is gated behind an
    // opt-in beta header; requests with `multi_agent` 400 without it.
    if (payload.multi_agent?.enabled) {
      headers['OpenAI-Beta'] = 'responses_multi_agent=v1';
    }

    console.log('Sending request to OpenAI Responses API:', {
      endpoint: OPENAI_RESPONSES_ENDPOINT,
      headers: { ...headers, Authorization: '***' },
      payload
    });

    return fetch(OPENAI_RESPONSES_ENDPOINT, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;

    console.log('Sending request to OpenAI API:', {
      endpoint: ENDPOINT,
      headers: { ...headers, Authorization: '***' },
      payload
    });

    return fetch(ENDPOINT, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });
  }
}

function gptError(port, error, profileName) {
  console.error('Sending error:', error);
  port.postMessage({ action: 'GPT_ERROR', error: error, profile: profileName });
}

function gptMessage(port, summary, profileName) {
  console.log('Sending message:', summary.slice(-50)); // Log last 50 chars
  port.postMessage({ action: 'GPT_MESSAGE', summary: summary, profile: profileName });
}

function gptThinking(port, thinking, profileName, current) {
  console.log('Sending thinking:', thinking.slice(-50)); // Log last 50 chars
  // `current` (optional) is the most recent reasoning-summary part only; the
  // popup shows it live and keeps `thinking` (the full buffer) for review.
  port.postMessage({ action: 'GPT_THINKING', thinking: thinking, current: current, profile: profileName });
}

function gptDone(port, model, summary, profileName) {
  console.log('Sending done signal');
  port.postMessage({ action: 'GPT_DONE', model: model, summary: summary, profile: profileName });
}

//------------------------------------------------------------------------------
// Takes the list of message prompts and sends them to OpenAI's chat
// completions endpoint. It then streams the responses back to the
// caller-supplied port.
//------------------------------------------------------------------------------
export async function fetchAndStream(port, messages, model, profileName) {
  // Get global API keys
  const { openAIKey, anthropicApiKey, perplexityApiKey, googleApiKey, openRouterApiKey, xaiApiKey, moonshotApiKey, qwenApiKey } = await chrome.storage.sync.get([
    'openAIKey',
    'anthropicApiKey',
    'perplexityApiKey',
    'googleApiKey',
    'openRouterApiKey',
    'xaiApiKey',
    'moonshotApiKey',
    'qwenApiKey'
  ]);
  console.log("Model: ", model);

  // Determine which API to use based on model name prefixes
  const useAnthropicApi = model.startsWith('claude-');
  const usePerplexityApi = model.startsWith('perplexity/') || model.startsWith('sonar') || model.startsWith('llama-');
  const useGoogleApi = model.startsWith('gemini-');
  const useOpenRouterApi = model.startsWith('openrouter/');
  const useXaiApi = model.startsWith('grok-');
  // Native Moonshot (kimi-k3) and Alibaba Qwen. The
  // OpenRouter-routed kimi/qwen presets start with 'openrouter/' so they
  // never reach these prefixes.
  const useMoonshotApi = model.startsWith('kimi-');
  const useQwenApi = model.startsWith('qwen');
  // GPT-5+ and o-series go through OpenAI's modern Responses API so reasoning
  // streams visibly via `response.reasoning_summary_text.delta` events.
  // Legacy GPT models (gpt-4o-mini, gpt-4-turbo, search variants) stay on the
  // older Chat Completions endpoint as the final fallthrough.
  const useOpenAIResponsesApi = !useAnthropicApi && !usePerplexityApi && !useGoogleApi &&
                                !useOpenRouterApi && !useXaiApi && !useMoonshotApi && !useQwenApi &&
                                isOpenAIReasoningModel(model);

  // Select appropriate API key from global keys
  const selectedApiKey = useAnthropicApi ? anthropicApiKey :
                        usePerplexityApi ? perplexityApiKey :
                        useGoogleApi ? googleApiKey :
                        useOpenRouterApi ? openRouterApiKey :
                        useXaiApi ? xaiApiKey :
                        useMoonshotApi ? moonshotApiKey :
                        useQwenApi ? qwenApiKey :
                        openAIKey;

  // Add validation for API key
  if (!selectedApiKey) {
    const errorMsg = useAnthropicApi ? ERR_ANTHROPIC_API_KEY :
                    usePerplexityApi ? ERR_PERPLEXITY_API_KEY :
                    useGoogleApi ? ERR_GOOGLE_API_KEY :
                    useOpenRouterApi ? ERR_OPENROUTER_API_KEY :
                    useXaiApi ? ERR_XAI_API_KEY :
                    useMoonshotApi ? ERR_MOONSHOT_API_KEY :
                    useQwenApi ? ERR_QWEN_API_KEY :
                    ERR_OPENAI_KEY;
    console.error('API Key Error:', errorMsg);
    gptError(port, errorMsg, profileName);
    return;
  }

  // Debug current profile and storage
  const { profiles, defaultProfile } = await chrome.storage.sync.get(['profiles', 'defaultProfile']);
  const profileKey = `profile__${profileName}`;

  console.log('Profile debug:', {
    profileName,
    profileKey,
    hasProfiles: !!profiles,
    defaultProfile
  });

  const profileData = await chrome.storage.sync.get(profileKey);
  const profile = { ...profileData[profileKey], model, thinkingEffort: normalizeEffort(model, profileData[profileKey]?.thinkingEffort) };

  console.log('Retrieved profile:', {
    exists: !!profile,
    model: profile?.model,
  });


  // Map thinking effort to token budgets (-1 = dynamic). Used by Gemini.
  // Anthropic uses the adaptive-thinking + `effort` parameter instead — see below.
  const effortToBudget = { off: 0, low: 2000, medium: 10000, high: 32000, xhigh: 60000, max: 100000, dynamic: -1 };
  const thinkingBudget = effortToBudget[profile.thinkingEffort] ?? -1;

  let payload;
  if (useAnthropicApi) {
    // Current Claude models use adaptive thinking and output_config.effort.
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');

    // Fable, Mythos and Opus 5.5 always think; a saved off value becomes low.
    const alwaysThinks = /claude-(fable|mythos|opus-5-5)/.test(profile.model);

    // Higher max_tokens for high/xhigh/max effort to leave room for thinking + output.
    // Opus 4.7+ also count tokens slightly higher than 4.6, so leave headroom.
    const uiEffort = profile.thinkingEffort;
    const maxTokensByEffort = { off: 8000, low: 8000, medium: 16000, high: 32000, xhigh: 48000, max: 64000, dynamic: 16000 };
    const baseMaxTokens = maxTokensByEffort[uiEffort] ?? 16000;

    payload = {
      model: profile.model,
      messages: [{
        role: 'user',
        content: userMessages
      }],
      system: systemMessage,
      stream: true,
      max_tokens: alwaysThinks ? Math.round(baseMaxTokens * 1.3) : baseMaxTokens,
    };

    if (uiEffort === 'off' && !alwaysThinks) {
      payload.thinking = { type: profile.model.includes('sonnet-5-5') ? 'between_tools' : 'disabled' };
      if (/claude-(sonnet|haiku)-5-5/.test(profile.model)) payload.output_config = { effort: 'low' };
    } else {
      // `display: "summarized"` is required on Fable 5 / Opus 4.7/4.8 to keep
      // thinking text streaming to the UI — the new default is "omitted"
      // (empty thinking_delta).
      payload.thinking = { type: 'adaptive', display: 'summarized' };

      // A stale 'off' from a previously selected model maps to the lowest
      // effort on Fable, since thinking can't be disabled there.
      let effortValue = uiEffort === 'off' ? 'low' : uiEffort;

      if (effortValue && effortValue !== 'dynamic' && !profile.model.includes('haiku-4-5')) {
        payload.output_config = { effort: effortValue };
      }
      // Dynamic uses the model default (medium on Opus/Haiku 5.5, high otherwise).
    }
  } else if (usePerplexityApi) {
    // Agent API replaces Sonar Chat Completions. Preserve saved Sonar profiles
    // using Perplexity's documented preset mappings without rewriting storage.
    const sonarPresets = { 'sonar': 'fast', 'sonar-pro': 'fast', 'sonar-reasoning': 'low', 'sonar-reasoning-pro': 'low', 'sonar-deep-research': 'high' };
    const preset = model.startsWith('perplexity/') ? model.slice('perplexity/'.length) : (sonarPresets[model] || 'fast');
    payload = {
      preset,
      instructions: messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n'),
      input: messages.filter(m => m.role !== 'system'),
      stream: true,
    };
  } else if (useGoogleApi) {
    // Format payload for Google Gemini API
    // Google API has a different format - uses contents array instead of messages
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role === 'user');

    // Build contents array for Gemini
    const contents = userMessages.map(msg => ({
      role: 'user',
      parts: [{ text: msg.content }]
    }));

    // Thinking control differs by Gemini generation:
    //   - Gemini 3.x: `thinkingLevel` (minimal|low|medium|high). The numeric
    //     `thinkingBudget` is discouraged on 3.x ("may cause unexpected
    //     performance") and the two are mutually exclusive.
    //   - Gemini 2.5: numeric `thinkingBudget` (0 disables, -1 = dynamic).
    let thinkingConfig;
    if (/^gemini-[34]/.test(profile.model)) {
      // Map the shared effort vocabulary onto Gemini 3 thinking levels.
      // 'dynamic' (and anything unmapped) → omit level so the model uses its
      // own default (medium for Flash, high for Pro).
      const effortToLevel = { off: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'high', max: 'high' };
      const level = effortToLevel[profile.thinkingEffort] || (profile.model.startsWith('gemini-4') ? 'medium' : undefined);
      thinkingConfig = { includeThoughts: true, ...(level ? { thinkingLevel: level } : {}) };
    } else if (profile.model.startsWith('gemini-2.5')) {
      // -1 = Gemini's native dynamic mode; positive = fixed budget.
      thinkingConfig = { thinkingBudget: thinkingBudget, includeThoughts: true };
    }

    payload = {
      contents: contents,
      ...(systemMessage ? { systemInstruction: { parts: [{ text: systemMessage }] } } : {}),
      generationConfig: {
        temperature: 0.7,
        // Thinking tokens count toward this limit on Gemini, so leave room for
        // both reasoning and a full summary at higher thinking levels.
        maxOutputTokens: 32768,
        ...(thinkingConfig ? { thinkingConfig } : {})
      },
      // Add Google Search grounding tool
      tools: [{
        googleSearch: {}
      }]
    };
  } else if (useOpenRouterApi) {
    // Format payload for OpenRouter API
    // OpenRouter uses OpenAI-compatible format, but we need to strip the 'openrouter/' prefix
    const openRouterModel = profile.model.replace('openrouter/', '');

    payload = {
      model: openRouterModel,
      messages: messages,
      stream: true
    };
  } else if (useMoonshotApi) {
    // Kimi K3 always thinks and accepts low/high/max effort.
    payload = {
      model: profile.model,
      messages: messages,
      stream: true,
      reasoning_effort: profile.thinkingEffort === 'dynamic' ? 'max' : profile.thinkingEffort,
      // Bound always-on reasoning + output; generous so summaries never clip.
      max_tokens: 32768,
    };
  } else if (useQwenApi) {
    // Qwen supports disabling thinking or bounding it with thinking_budget.
    const qwenTokenCap = 16384;
    const budgetFraction = { off: 0.1, low: 0.25, medium: 0.4, high: 0.6, xhigh: 0.8, max: 0.8, dynamic: 0.4 };
    const frac = budgetFraction[profile.thinkingEffort] ?? 0.4;

    payload = {
      model: profile.model,
      messages: messages,
      stream: true,
      max_tokens: qwenTokenCap,
      enable_thinking: profile.thinkingEffort !== 'off',
      ...(profile.thinkingEffort !== 'off' ? { thinking_budget: Math.max(256, Math.round(frac * qwenTokenCap)) } : {}),
    };
  } else if (useXaiApi) {
    // Format payload for xAI Responses API (grok-*).
    // Per xAI docs the system prompt is a {role:'system'} entry INSIDE the
    // `input` array — NOT a top-level `instructions` field (current Grok models
    // can silently ignore `instructions`). Keep the system message first.
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const input = [];
    if (systemMessage) {
      input.push({ role: 'system', content: systemMessage });
    }
    for (const m of messages.filter(m => m.role !== 'system')) {
      input.push(m);
    }

    payload = {
      model: profile.model,
      input: input,
      stream: true,
      tools: [
        { type: 'web_search' }
      ],
      ...(/^grok-4\.[67]/.test(model) ? { reasoning: { effort: profile.thinkingEffort === 'dynamic' ? 'high' : profile.thinkingEffort } } : {})
    };
  } else if (useOpenAIResponsesApi) {
    // Format payload for OpenAI Responses API (GPT-5+ and o-series).
    // - `instructions` carries the system prompt (extracted from messages)
    // - `input` carries non-system messages
    // - `reasoning: {effort, summary}` controls thinking depth and
    //   opts in to `response.reasoning_summary_text.delta` streaming
    // - `max_output_tokens` caps reasoning + output combined
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    payload = {
      model: profile.model,
      input: nonSystemMessages,
      stream: true,
    };

    if (systemMessage) {
      payload.instructions = systemMessage;
    }

    // GPT-5.6 (sol/terra/luna) extends the effort scale with 'max' and adds
    // two 5.6-only Responses API features surfaced as UI effort choices:
    //   - 'pro'   → `reasoning.mode: "pro"` (deeper single-agent work,
    //     orthogonal to effort — effort stays on the API default 'medium')
    //   - 'ultra' → `multi_agent` beta (parallel subagents synthesized into
    //     one response; the ChatGPT ultra product runs 4 concurrent agents).
    //     `reasoning.summary` is rejected alongside `multi_agent`, so ultra
    //     streams only final text — no thinking panel.
    const isGpt56 = profile.model.startsWith('gpt-5.6');
    const isGpt6 = profile.model.startsWith('gpt-6');
    const uiEffort = profile.thinkingEffort;
    if (uiEffort === 'off' && (isGpt56 || isGpt6)) {
      // GPT-5.6 defaults to medium effort when `reasoning` is omitted, so
      // 'off' must send an explicit 'none'. Older models default to no
      // reasoning, so omitting (below) remains correct for them.
      payload.reasoning = { effort: 'none' };
    } else if (uiEffort && uiEffort !== 'off') {
      if (isGpt56 && uiEffort === 'ultra') {
        payload.multi_agent = { enabled: true, max_concurrent_subagents: 4 };
        payload.reasoning = { effort: 'high' };
      } else if (isGpt56 && uiEffort === 'pro') {
        payload.reasoning = { mode: 'pro', effort: 'medium', summary: 'auto' };
      } else {
        // Always send effort and summary together — sending only `summary`
        // without `effort` can cause the API to hang instead of erroring.
        // `summary: "auto"` is the most compatible value and lets the API
        // choose detail level based on effort.
        let effortValue = (uiEffort === 'dynamic') ? 'medium' : uiEffort;
        // Preserve legacy GPT-5 limits; GPT-6 supports max effort.
        if (!isGpt56 && !isGpt6 && ['max', 'pro', 'ultra'].includes(effortValue)) {
          effortValue = 'xhigh';
        }
        payload.reasoning = { effort: effortValue, summary: 'auto' };
      }
    }

    // Bound reasoning + output combined to prevent runaway thinking on xhigh.
    // max/pro/ultra do strictly more model work, so they get extra headroom.
    const maxByEffort = { off: 4000, low: 8000, medium: 16000, high: 24000, xhigh: 32000, max: 48000, pro: 48000, ultra: 48000, dynamic: 16000 };
    payload.max_output_tokens = maxByEffort[uiEffort] ?? 16000;
  } else {
    // Legacy OpenAI Chat Completions for non-reasoning models
    // (gpt-4o-mini, gpt-4-turbo, *-search-*, etc.).
    payload = {
      model: profile.model,
      messages: messages,
      stream: true
    };

    // Add web search for GPT search models
    if (profile.model.includes('search')) {
      payload.tools = [{
        type: 'function',
        function: {
          name: 'web_search',
          description: 'Search the web for current information'
        }
      }];
    }
  }


  // Determine which model to use and log it
  console.log('Selected model:', profile.model);

  console.log('Using Anthropic API:', useAnthropicApi);
  console.log('Using Perplexity API:', usePerplexityApi);
  console.log('Using Google API:', useGoogleApi);
  console.log('Using OpenRouter API:', useOpenRouterApi);
  console.log('Using xAI API:', useXaiApi);
  console.log('Using Moonshot API:', useMoonshotApi);
  console.log('Using Qwen API:', useQwenApi);

  // Use profile-specific API keys (if implemented) or fall back to global keys
  let apiKey;
  if (useAnthropicApi) {
    apiKey = profile.anthropicApiKey || selectedApiKey;
  } else if (usePerplexityApi) {
    apiKey = profile.perplexityApiKey || selectedApiKey;
  } else if (useGoogleApi) {
    apiKey = profile.googleApiKey || selectedApiKey;
  } else if (useOpenRouterApi) {
    apiKey = profile.openRouterApiKey || selectedApiKey;
  } else if (useXaiApi) {
    apiKey = profile.xaiApiKey || selectedApiKey;
  } else if (useMoonshotApi) {
    apiKey = profile.moonshotApiKey || selectedApiKey;
  } else if (useQwenApi) {
    apiKey = profile.qwenApiKey || selectedApiKey;
  } else {
    apiKey = profile.apiKey || selectedApiKey; // OpenAI key
  }




  let connected = true;
  const requestController = new AbortController();
  // xAI recommends at least 900 seconds for reasoning requests. Bound stalled
  // streams without treating ordinary silent reasoning intervals as failures.
  const requestTimeout = useXaiApi ? setTimeout(() => {
    requestController.abort(new Error('Grok did not finish within 15 minutes. Try a lower thinking effort or retry the request.'));
  }, 900_000) : undefined;
  port.onDisconnect.addListener(() => {
    connected = false;
    if (useXaiApi) requestController.abort();
  });

  try {
    await debug('PAYLOAD', payload);

    const response = await fetchCompletions(selectedApiKey, payload, useAnthropicApi, usePerplexityApi, useGoogleApi, useOpenRouterApi, useXaiApi, profile.model, useOpenAIResponsesApi, useMoonshotApi, useQwenApi, requestController.signal);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        headers: Object.fromEntries(response.headers.entries())
      });

      let errorJson;
      try { errorJson = JSON.parse(errorText); } catch { /* Plain-text error body. */ }
      throw new Error(errorJson?.error?.message || errorJson?.message || `API request failed: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
    }

    let summary = '';

    // State tracking for thinking vs. output content
    let thinkingBuffer = '';
    let outputBuffer = '';
    let currentBlockType = null;

    // Anthropic stop reason — Fable 5's safety classifiers can end a stream
    // with `stop_reason: "refusal"` (HTTP 200, possibly empty content).
    let anthropicStopReason = null;

    // xAI citations map: citation number -> URL
    const xaiCitationsMap = {};

    // OpenAI Responses: per-item metadata from `response.output_item.added`.
    // Multi-agent (ultra) streams interleave output items from subagents with
    // the root agent's final answer; only the root `final_answer` message may
    // go to the summary. Items also carry `phase` on plain GPT-5.6 streams
    // ("final_answer" on the answer message), while older models (gpt-5.5,
    // o-series) send neither `agent` nor `phase` — both absent means render.
    const openAIItemMeta = {};
    // Reasoning summaries arrive as discrete parts, each opening with a bold
    // heading. Parts carry no trailing separator, so without one the next
    // heading glues onto the previous sentence ("…clear!Reviewing baseline…").
    // Track the current part for the popup's live view; the full buffer keeps
    // every part (separated) for the collapsed review.
    let openAICurrentPart = '';
    const isOpenAIFinalAnswer = (p) => {
      const meta = openAIItemMeta[p.item_id] || {};
      const agentName = p.agent?.agent_name ?? meta.agentName;
      if (agentName && agentName !== '/root') return false;
      if (meta.phase && meta.phase !== 'final_answer') return false;
      return true;
    };

    // Pro mode reasons privately server-side and streams almost nothing until
    // the answer is ready; ultra never streams reasoning summaries. Seed the
    // thinking panel so the popup shows activity instead of sitting silent.
    // Seeds touch only thinkingBuffer, never `summary`, so the final cached
    // result stays clean.
    if (useOpenAIResponsesApi && payload.reasoning?.mode === 'pro') {
      thinkingBuffer = 'Pro mode: reasoning runs server-side with no live stream — the full answer arrives at the end and can take a while…\n\n';
      gptThinking(port, thinkingBuffer, profileName);
    } else if (useOpenAIResponsesApi && payload.multi_agent?.enabled) {
      thinkingBuffer = 'Ultra: coordinating parallel subagents — their work streams here; the synthesized answer follows…\n\n';
      gptThinking(port, thinkingBuffer, profileName);
    }

    let streamCompleted = false;
    for await (const parsed of readServerEvents(response)) {
      if (!connected) return;
      if (parsed.type === 'stream.done' && !useAnthropicApi && !useGoogleApi && !useOpenAIResponsesApi && !useXaiApi && !usePerplexityApi) streamCompleted = true;
      if (parsed.type === 'response.completed' || parsed.type === 'message_stop' || parsed.candidates?.[0]?.finishReason === 'STOP') streamCompleted = true;
      const finishReason = parsed.choices?.[0]?.finish_reason;
      if (finishReason) {
        if (finishReason !== 'stop') throw new Error(`The model stopped before completing the summary: ${finishReason}`);
        streamCompleted = true;
      }
      if (parsed.error || parsed.type === 'error' || ['response.failed', 'response.incomplete'].includes(parsed.type)) {
        throw new Error(parsed.error?.message || parsed.response?.error?.message || parsed.message ||
          (parsed.response?.incomplete_details?.reason ? `Response incomplete: ${parsed.response.incomplete_details.reason}` : 'Provider stream failed'));
      }
      if (useAnthropicApi) {
        // Handle Anthropic streaming format with thinking tokens
        if (parsed.type === 'content_block_start') {
          currentBlockType = parsed.content_block?.type;
          console.log('Starting content block:', currentBlockType);
        }
        else if (parsed.type === 'content_block_delta') {
          const deltaType = parsed.delta?.type;

          if (deltaType === 'thinking_delta') {
            // Accumulate thinking content
            const thinkingText = parsed.delta.thinking || '';
            thinkingBuffer += thinkingText;
            summary += thinkingText;  // For backward compatibility
            gptThinking(port, thinkingBuffer, profileName);
          }
          else if (deltaType === 'text_delta') {
            // Accumulate output content
            const textContent = parsed.delta.text || '';
            outputBuffer += textContent;
            summary += textContent;  // For backward compatibility
            gptMessage(port, outputBuffer, profileName);
          }
          // Ignore signature_delta - just for verification
        }
        else if (parsed.type === 'content_block_stop') {
          console.log('Finished content block:', currentBlockType);
          currentBlockType = null;
        }
        else if (parsed.type === 'message_delta' && parsed.delta?.stop_reason) {
          anthropicStopReason = parsed.delta.stop_reason;
          console.log('Anthropic stop reason:', anthropicStopReason);
        }
      } else if (useGoogleApi) {
        // Handle Google Gemini streaming format with thinking tokens
        // Gemini format: { candidates: [{ content: { parts: [{ text: "...", thought: bool }] } }] }
        const candidate = parsed.candidates?.[0];
        if (parsed.promptFeedback?.blockReason) throw new Error(`Gemini blocked the prompt: ${parsed.promptFeedback.blockReason}`);
        if (candidate?.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(candidate.finishReason)) {
          throw new Error(`Gemini stopped: ${candidate.finishReason}`);
        }
        const parts = candidate?.content?.parts || [];

        // Debug logging for Gemini responses
        if (parts.length > 0) {
          console.log('Gemini parts received:', parts.map(p => ({
            hasText: !!p.text,
            textLength: p.text?.length || 0,
            thought: p.thought
          })));
        }

        // Process all parts in this chunk
        for (const part of parts) {
          const text = part.text || '';
          if (!text) continue;

          // Check if this is thinking or output based on thought boolean
          if (part.thought === true) {
            // This is thinking content
            console.log('Gemini thinking detected:', text.substring(0, 50) + '...');
            thinkingBuffer += text;
            summary += text;  // For backward compatibility
            gptThinking(port, thinkingBuffer, profileName);
          } else {
            // This is regular output (thought === false or undefined)
            console.log('Gemini output detected:', text.substring(0, 50) + '...');
            outputBuffer += text;
            summary += text;  // For backward compatibility
            gptMessage(port, outputBuffer, profileName);
          }
        }

        // Check for grounding metadata (search results)
        const groundingMetadata = candidate?.groundingMetadata;
        if (groundingMetadata) {
          console.log('Google Search grounding metadata:', groundingMetadata);
        }
      } else if (useOpenRouterApi) {
        // Handle OpenRouter streaming format (OpenAI-compatible)
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) {
          summary += content;
          gptMessage(port, summary, profileName);
        }
      } else if (useMoonshotApi || useQwenApi) {
        // Kimi K3 / Qwen3.8 stream OpenAI-compatible SSE with reasoning
        // on a separate `reasoning_content` delta channel (DeepSeek
        // style). Reasoning goes to the thinking panel; the popup
        // collapses it when the first answer token arrives.
        const delta = parsed.choices?.[0]?.delta || {};

        const reasoningText = delta.reasoning_content || '';
        if (reasoningText) {
          thinkingBuffer += reasoningText;
          summary += reasoningText;  // For backward compatibility
          gptThinking(port, thinkingBuffer, profileName);
        }

        const content = delta.content || '';
        if (content) {
          outputBuffer += content;
          summary += content;  // For backward compatibility
          gptMessage(port, outputBuffer, profileName);
        }
      } else if (useXaiApi) {
        // Handle xAI Responses API streaming format
        const eventType = parsed.type;
        const statuses = {
          'response.web_search_call.in_progress': 'Grok is starting a web search…',
          'response.web_search_call.searching': 'Grok is searching the web…',
          'response.web_search_call.completed': 'Waiting for Grok to finish reasoning over the search results…',
        };
        if (statuses[eventType]) port.postMessage({ action: 'GPT_STATUS', status: statuses[eventType], profile: profileName });
        // Collect citations from response
        if (parsed.citations && Array.isArray(parsed.citations)) {
          parsed.citations.forEach((url, index) => {
            xaiCitationsMap[index + 1] = url;
          });
        }
        if (eventType === 'response.completed' && parsed.response?.citations) {
          parsed.response.citations.forEach((url, index) => {
            xaiCitationsMap[index + 1] = url;
          });
        }

        if (eventType === 'response.completed') {
          // The completed response carries the authoritative full answer.
          // Some transports omit individual text deltas or send only a prefix.
          const finalMessage = (parsed.response?.output || []).filter(item => item.type === 'message' && item.role === 'assistant' && (!item.phase || item.phase === 'final_answer')).at(-1);
          const finalText = (finalMessage?.content || []).filter(part => part.type === 'output_text').map(part => part.text || '').join('');
          if (finalText) {
            outputBuffer = finalText;
            gptMessage(port, transformCitationsToDomains(outputBuffer, xaiCitationsMap), profileName);
          }
        }

        // Handle text output delta
        if (eventType === 'response.output_text.delta') {
          const textDelta = parsed.delta || '';
          if (textDelta) {
            outputBuffer += textDelta;
            summary += textDelta;
            gptMessage(port, transformCitationsToDomains(outputBuffer, xaiCitationsMap), profileName);
          }
        }
        // Handle final text output
        else if (eventType === 'response.output_text.done') {
          const finalText = parsed.text || '';
          if (finalText && finalText.length > outputBuffer.length) {
            outputBuffer = finalText;
            summary = thinkingBuffer + finalText;
            gptMessage(port, transformCitationsToDomains(outputBuffer, xaiCitationsMap), profileName);
          }
        }
        // Handle reasoning/thinking content (same part semantics as
        // OpenAI: separate parts, track the current one for live view)
        else if (eventType === 'response.reasoning_summary_part.added') {
          if (thinkingBuffer && !thinkingBuffer.endsWith('\n\n')) {
            thinkingBuffer += '\n\n';
            summary += '\n\n';
          }
          openAICurrentPart = '';
        }
        else if (eventType === 'response.reasoning_summary_text.delta' ||
                 eventType === 'response.reasoning.delta' || eventType === 'response.reasoning_text.delta') {
          const reasoningDelta = parsed.delta || '';
          if (reasoningDelta) {
            openAICurrentPart += reasoningDelta;
            thinkingBuffer += reasoningDelta;
            summary += reasoningDelta;
            gptThinking(port, thinkingBuffer, profileName, openAICurrentPart);
          }
        }
        // Fallback: OpenAI-compatible choices format
        else if (parsed.choices?.[0]?.delta) {
          const delta = parsed.choices[0].delta;
          const content = delta.content || '';
          const reasoning = delta.reasoning_content || '';

          if (reasoning) {
            thinkingBuffer += reasoning;
            summary += reasoning;
            gptThinking(port, thinkingBuffer, profileName);
          }
          if (content) {
            outputBuffer += content;
            summary += content;
            gptMessage(port, transformCitationsToDomains(outputBuffer, xaiCitationsMap), profileName);
          }
        }
      } else if (useOpenAIResponsesApi || usePerplexityApi) {
        // Handle OpenAI Responses API streaming format.
        const eventType = parsed.type;
        console.log('OpenAI Responses event:', eventType, parsed);

        if (eventType === 'response.output_item.added') {
          const item = parsed.item || {};
          openAIItemMeta[item.id] = {
            phase: item.phase,
            agentName: parsed.agent?.agent_name ?? item.agent?.agent_name,
          };
        }
        else if (eventType === 'response.reasoning_summary_part.added') {
          // New summary part: separate it from the previous one and
          // start a fresh live part for the popup.
          if (thinkingBuffer && !thinkingBuffer.endsWith('\n\n')) {
            thinkingBuffer += '\n\n';
            summary += '\n\n';
          }
          openAICurrentPart = '';
        }
        else if (eventType === 'response.output_text.delta') {
          const textDelta = parsed.delta || '';
          if (textDelta && isOpenAIFinalAnswer(parsed)) {
            outputBuffer += textDelta;
            summary += textDelta;
            gptMessage(port, outputBuffer, profileName);
          } else if (textDelta) {
            // Subagent / interim-phase output (ultra): show as thinking
            // so the work is visible, but keep it out of the summary.
            thinkingBuffer += textDelta;
            gptThinking(port, thinkingBuffer, profileName);
          }
        }
        else if (eventType === 'response.output_text.done') {
          const finalText = parsed.text || '';
          if (finalText && isOpenAIFinalAnswer(parsed) && finalText.length > outputBuffer.length) {
            outputBuffer = finalText;
            summary = thinkingBuffer + finalText;
            gptMessage(port, outputBuffer, profileName);
          }
        }
        else if (eventType === 'response.reasoning_summary_text.delta' ||
                 eventType === 'response.reasoning.delta') {
          const reasoningDelta = parsed.delta || '';
          if (reasoningDelta) {
            openAICurrentPart += reasoningDelta;
            thinkingBuffer += reasoningDelta;
            summary += reasoningDelta;
            gptThinking(port, thinkingBuffer, profileName, openAICurrentPart);
          }
        }
        else if (eventType === 'response.failed' || eventType === 'response.incomplete') {
          const errMsg = parsed.response?.error?.message || `Response ${eventType.replace('response.', '')}`;
          throw new Error(errMsg);
        }
        else if (eventType === 'error') {
          // Bare error event (no `response.` prefix) — emitted on
          // mid-stream errors. Without this branch, the loop would
          // keep reading until the connection force-closes.
          const errMsg = parsed.message || parsed.error?.message || 'Stream error';
          throw new Error(errMsg);
        }
      } else {
        // Handle OpenAI Chat Completions streaming format (legacy GPT)
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) {
          summary += content;
          gptMessage(port, summary, profileName);
        }
      }
      // The protocol completion event is authoritative; do not await TCP EOF.
      if (streamCompleted) break;
    }

    if (!streamCompleted) throw new Error('The API stream ended before completing the summary.');

    // Send done message with output buffer (or full summary for backward compatibility)
    let finalContent = (useAnthropicApi || useGoogleApi || useMoonshotApi || useQwenApi || useXaiApi || useOpenAIResponsesApi || usePerplexityApi) ? outputBuffer : summary;
    if (anthropicStopReason === 'max_tokens') throw new Error('The model reached its token limit before completing the summary. Lower thinking effort or try a different model.');
    if (finalContent) {
      // Transform xAI citations to domain-based format in final output
      if (useXaiApi) {
        finalContent = transformCitationsToDomains(finalContent, xaiCitationsMap);
      }
      gptDone(port, model, finalContent, profileName);
    } else if (anthropicStopReason === 'refusal') {
      throw new Error('The model declined to summarize this page (safety refusal). Try a different model.');
    } else {
      throw new Error('No content received from API');
    }
  } catch (error) {
    console.error('Stream error:', error);
    if (connected) gptError(port, requestController.signal.aborted ? (requestController.signal.reason?.message || error.message) : error.message, profileName);
  } finally {
    if (requestTimeout !== undefined) clearTimeout(requestTimeout);
  }
}
