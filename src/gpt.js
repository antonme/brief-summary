import { debug } from './util.js';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DATA_MARKER = 'data: ';
const DONE_MARKER = `${DATA_MARKER}[DONE]`;
//const PORT_CLOSED = 'Error: Attempting to use a disconnected port object';
const ERR_OPENAI_KEY = 'Error: OpenAI API key is not set';

// Add new constants for Anthropic
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ERR_ANTHROPIC_API_KEY = 'Error: Anthropic API key is not set';

// Add new constants for Perplexity
const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
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

/*------------------------------------------------------------------------------
 * Builds up a buffer of JSON data and returns the parsed JSON object once
 * enough data has been received to represent a complete JSON string. If the
 * buffer is incomplete, returns null until enough data has been received to
 * return a complete JSON object.
 *----------------------------------------------------------------------------*/
function JsonBuffer() {
  let buffer = '';

  return function (data) {
    buffer += data;

    let result = null;

    try {
      result = JSON.parse(buffer);
      buffer = '';
    } catch (error) {
      // do nothing
    }

    return result;
  };
}

/*------------------------------------------------------------------------------
 * Parses the response from the openai chat completions endpoint and acts as an
 * iterator over the response. Because the response is streamed, the generator
 * builds up the aggregated response, returning the complete buffer on each
 * invocation until complete.
 *
 * For example:
 *   {data: "Hello", error: null}
 *   {data: "Hello, how are", error: null}
 *   {data: "Hello, how are you?", error: null}
 *
 * If an error occurs, the error is returned in the error field and the
 * generation is stopped. After that, it will always return the same structure.
 *----------------------------------------------------------------------------*/
function GptResponseReader(response) {
  const reader = response.body.getReader();

  let buffer = '';
  let error = null;
  let done = false;

  return async function () {
    if (done) {
      return null;
    }

    const { value: chunk, done: readerDone } = await reader.read();

    if (readerDone) {
      await debug('FINISH');
      done = true;
      return { data: buffer, error: error };
    }

    const string = new TextDecoder().decode(chunk);
    await debug('RECV:', string);

    // Some errors are returned as the initial message, but they can be
    // multi-line, so we have to attempt to parse them here to see if they are
    // an error. If the chunk cannot be parsed as JSON, then it is a normal
    // message chunk.
    try {
      const data = JSON.parse(string);

      if (data.error) {
        error = data.error.message;
        return { data: buffer, error: error };
      }
    } catch (error) {
      // do nothing
    }

    const lines = string.split('\n').filter((line) => line !== '');
    const json_buffer = JsonBuffer();

    await debug('LINES:', lines);

    for (const line of lines) {
      if (line === DONE_MARKER) {
        done = true;
        return { data: buffer, error: error };
      }

      if (line.startsWith('data: ')) {
        const data = json_buffer(line.substring(6));

        if (data !== null) {
          if (data.error) {
            error = data.error.message;
            return { data: buffer, error: error };
          }

          if (data.choices[0].delta.content) {
            buffer += data.choices[0].delta.content;
          }
        }
      }
    }

    return { data: buffer, error: error };
  };
}

// Modify fetchCompletions to handle CORS for Perplexity and Google Gemini
async function fetchCompletions(apiKey, payload, useAnthropicApi = false, usePerplexityApi = false, useGoogleApi = false, useOpenRouterApi = false, useXaiApi = false, model = '', useOpenAIResponsesApi = false) {
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
      body: JSON.stringify(payload)
    });
  } else if (useOpenAIResponsesApi) {
    headers['Authorization'] = `Bearer ${apiKey}`;
    // Hint intermediate proxies/CDNs to forward the response as event-stream
    // rather than buffering it as a single body.
    headers['Accept'] = 'text/event-stream';

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

function gptThinking(port, thinking, profileName) {
  console.log('Sending thinking:', thinking.slice(-50)); // Log last 50 chars
  port.postMessage({ action: 'GPT_THINKING', thinking: thinking, profile: profileName });
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
  const { openAIKey, anthropicApiKey, perplexityApiKey, googleApiKey, openRouterApiKey, xaiApiKey } = await chrome.storage.sync.get([
    'openAIKey',
    'anthropicApiKey',
    'perplexityApiKey',
    'googleApiKey',
    'openRouterApiKey',
    'xaiApiKey'
  ]);
  console.log("Model: ", model);

  // Determine which API to use based on model name prefixes
  const useAnthropicApi = model.startsWith('claude-');
  const usePerplexityApi = model.startsWith('sonar') || model.startsWith('llama-');
  const useGoogleApi = model.startsWith('gemini-');
  const useOpenRouterApi = model.startsWith('openrouter/');
  const useXaiApi = model.startsWith('grok-');
  // GPT-5+ and o-series go through OpenAI's modern Responses API so reasoning
  // streams visibly via `response.reasoning_summary_text.delta` events.
  // Legacy GPT models (gpt-4o-mini, gpt-4-turbo, search variants) stay on the
  // older Chat Completions endpoint as the final fallthrough.
  const useOpenAIResponsesApi = !useAnthropicApi && !usePerplexityApi && !useGoogleApi &&
                                !useOpenRouterApi && !useXaiApi &&
                                (model.startsWith('gpt-5') || /^o\d/.test(model));

  // Select appropriate API key from global keys
  const selectedApiKey = useAnthropicApi ? anthropicApiKey :
                        usePerplexityApi ? perplexityApiKey :
                        useGoogleApi ? googleApiKey :
                        useOpenRouterApi ? openRouterApiKey :
                        useXaiApi ? xaiApiKey :
                        openAIKey;

  // Add validation for API key
  if (!selectedApiKey) {
    const errorMsg = useAnthropicApi ? ERR_ANTHROPIC_API_KEY :
                    usePerplexityApi ? ERR_PERPLEXITY_API_KEY :
                    useGoogleApi ? ERR_GOOGLE_API_KEY :
                    useOpenRouterApi ? ERR_OPENROUTER_API_KEY :
                    useXaiApi ? ERR_XAI_API_KEY :
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
  const profile = profileData[profileKey];

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
    // Format payload for Anthropic API (Opus 4.6/4.7/4.8, Sonnet 4.6).
    // Opus 4.7/4.8 reject `thinking: {type: "enabled", budget_tokens: N}` with 400 —
    // adaptive thinking is the only supported mode. Effort goes inside `output_config`.
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');

    // Higher max_tokens for high/xhigh/max effort to leave room for thinking + output.
    // Opus 4.7+ also count tokens slightly higher than 4.6, so leave headroom.
    const uiEffort = profile.thinkingEffort;
    const maxTokensByEffort = { off: 8000, low: 8000, medium: 16000, high: 32000, xhigh: 48000, max: 64000, dynamic: 16000 };

    payload = {
      model: profile.model,
      messages: [{
        role: 'user',
        content: userMessages
      }],
      system: systemMessage,
      stream: true,
      max_tokens: maxTokensByEffort[uiEffort] ?? 16000,
    };

    if (uiEffort === 'off') {
      payload.thinking = { type: 'disabled' };
    } else {
      // `display: "summarized"` is required on Opus 4.7/4.8 to keep thinking text
      // streaming to the UI — the new default is "omitted" (empty thinking_delta).
      payload.thinking = { type: 'adaptive', display: 'summarized' };

      if (uiEffort && uiEffort !== 'dynamic') {
        // Effort gating:
        //   - `max` is Opus-tier only — downgrade to `high` on Sonnet/Haiku.
        //   - `xhigh` is Opus 4.7/4.8 only — downgrade to `high` on every other Claude model.
        const isOpus = profile.model.includes('opus');
        const supportsXhigh = profile.model.includes('opus-4-7') || profile.model.includes('opus-4-8');
        let effortValue = uiEffort;
        if (effortValue === 'max' && !isOpus) effortValue = 'high';
        if (effortValue === 'xhigh' && !supportsXhigh) effortValue = 'high';
        payload.output_config = { effort: effortValue };
      }
      // 'dynamic' → omit effort; API defaults to 'high' with adaptive thinking.
    }
  } else if (usePerplexityApi) {
    // Format payload for Perplexity API with web search (built-in).
    // NOTE: `search_mode` only accepts web|academic|sec (default web) — the old
    // value 'medium' was invalid. The balanced-depth control is a separate
    // parameter: web_search_options.search_context_size (low|medium|high).
    payload = {
      model: profile.model,
      messages: messages,
      stream: true,
      web_search_options: { search_context_size: 'medium' }
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

    // If there's a system message, prepend it to the first user message
    if (systemMessage && contents.length > 0) {
      contents[0].parts[0].text = systemMessage + '\n\n' + contents[0].parts[0].text;
    }

    // Thinking control differs by Gemini generation:
    //   - Gemini 3.x: `thinkingLevel` (minimal|low|medium|high). The numeric
    //     `thinkingBudget` is discouraged on 3.x ("may cause unexpected
    //     performance") and the two are mutually exclusive.
    //   - Gemini 2.5: numeric `thinkingBudget` (0 disables, -1 = dynamic).
    let thinkingConfig;
    if (profile.model.startsWith('gemini-3')) {
      // Map the shared effort vocabulary onto Gemini 3 thinking levels.
      // 'dynamic' (and anything unmapped) → omit level so the model uses its
      // own default (medium for Flash, high for Pro).
      const effortToLevel = { off: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'high', max: 'high' };
      const level = effortToLevel[profile.thinkingEffort];
      thinkingConfig = { includeThoughts: true, ...(level ? { thinkingLevel: level } : {}) };
    } else if (thinkingBudget !== 0) {
      // -1 = Gemini's native dynamic mode; positive = fixed budget.
      thinkingConfig = { thinkingBudget: thinkingBudget, includeThoughts: true };
    }

    payload = {
      contents: contents,
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
      ]
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

    const uiEffort = profile.thinkingEffort;
    if (uiEffort && uiEffort !== 'off') {
      // Always send effort and summary together — sending only `summary`
      // without `effort` can cause the API to hang instead of erroring.
      // `summary: "auto"` is the most compatible value and lets the API
      // choose detail level based on effort.
      const effortValue = (uiEffort === 'dynamic' || !uiEffort)
        ? 'medium'
        : (uiEffort === 'max' ? 'xhigh' : uiEffort);
      payload.reasoning = { effort: effortValue, summary: 'auto' };
    }
    // For 'off': omit `reasoning` entirely. OpenAI's no-reasoning default
    // is what we want, and avoids edge cases with `effort: "none"`.

    // Bound reasoning + output combined to prevent runaway thinking on xhigh.
    const maxByEffort = { off: 4000, low: 8000, medium: 16000, high: 24000, xhigh: 32000, max: 32000, dynamic: 16000 };
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
  } else {
    apiKey = profile.apiKey || selectedApiKey; // OpenAI key
  }




  let connected = true;
  port.onDisconnect.addListener(() => {
    connected = false;
  });

  try {
    await debug('PAYLOAD', payload);

    const response = await fetchCompletions(selectedApiKey, payload, useAnthropicApi, usePerplexityApi, useGoogleApi, useOpenRouterApi, useXaiApi, profile.model, useOpenAIResponsesApi);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        headers: Object.fromEntries(response.headers.entries())
      });

      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error?.message || errorJson.message || `API request failed: ${response.status} ${response.statusText}`);
      } catch (e) {
        // If JSON parsing fails, throw the text error
        throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText.substring(0, 200)}`);
      }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary = '';

    // State tracking for thinking vs. output content
    let thinkingBuffer = '';
    let outputBuffer = '';
    let currentBlockType = null;

    // xAI citations map: citation number -> URL
    const xaiCitationsMap = {};

    while (connected) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value);
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.length === 0) continue;
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
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
            } else if (useGoogleApi) {
              // Handle Google Gemini streaming format with thinking tokens
              // Gemini format: { candidates: [{ content: { parts: [{ text: "...", thought: bool }] } }] }
              const candidate = parsed.candidates?.[0];
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
            } else if (usePerplexityApi) {
              // Handle Perplexity streaming format
              console.log('Response:', response);
              console.log("Delta: ", parsed.choices[0].delta);

              const content = parsed.choices[0]?.delta?.content || '';
              if (content) {
                summary += content;
                gptMessage(port, summary, profileName);
              }

              // Check for citations (Perplexity returns these)
              const citations = parsed.citations;
              if (citations) {
                console.log('Perplexity citations:', citations);
              }
            } else if (useOpenRouterApi) {
              // Handle OpenRouter streaming format (OpenAI-compatible)
              const content = parsed.choices[0]?.delta?.content || '';
              if (content) {
                summary += content;
                gptMessage(port, summary, profileName);
              }
            } else if (useXaiApi) {
              // Handle xAI Responses API streaming format
              const eventType = parsed.type;

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
              // Handle reasoning/thinking content
              else if (eventType === 'response.reasoning_summary_text.delta' ||
                       eventType === 'response.reasoning.delta') {
                const reasoningDelta = parsed.delta || '';
                if (reasoningDelta) {
                  thinkingBuffer += reasoningDelta;
                  summary += reasoningDelta;
                  gptThinking(port, thinkingBuffer, profileName);
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
            } else if (useOpenAIResponsesApi) {
              // Handle OpenAI Responses API streaming format.
              const eventType = parsed.type;
              console.log('OpenAI Responses event:', eventType, parsed);

              if (eventType === 'response.output_text.delta') {
                const textDelta = parsed.delta || '';
                if (textDelta) {
                  outputBuffer += textDelta;
                  summary += textDelta;
                  gptMessage(port, outputBuffer, profileName);
                }
              }
              else if (eventType === 'response.output_text.done') {
                const finalText = parsed.text || '';
                if (finalText && finalText.length > outputBuffer.length) {
                  outputBuffer = finalText;
                  summary = thinkingBuffer + finalText;
                  gptMessage(port, outputBuffer, profileName);
                }
              }
              else if (eventType === 'response.reasoning_summary_text.delta' ||
                       eventType === 'response.reasoning.delta') {
                const reasoningDelta = parsed.delta || '';
                if (reasoningDelta) {
                  thinkingBuffer += reasoningDelta;
                  summary += reasoningDelta;
                  gptThinking(port, thinkingBuffer, profileName);
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
              const content = parsed.choices[0]?.delta?.content || '';
              if (content) {
                summary += content;
                gptMessage(port, summary, profileName);
              }
            }
          } catch (e) {
            console.error('Parse error:', e, 'Line:', line);
          }
        }
      }
    }

    // Send done message with output buffer (or full summary for backward compatibility)
    let finalContent = outputBuffer || summary;
    if (finalContent) {
      // Transform xAI citations to domain-based format in final output
      if (useXaiApi) {
        finalContent = transformCitationsToDomains(finalContent, xaiCitationsMap);
      }
      gptDone(port, model, finalContent, profileName);
    } else {
      throw new Error('No content received from API');
    }
  } catch (error) {
    console.error('Stream error:', error);
    gptError(port, error.message, profileName);
  }
}
