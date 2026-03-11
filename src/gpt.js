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
async function fetchCompletions(apiKey, payload, useAnthropicApi = false, usePerplexityApi = false, useGoogleApi = false, useOpenRouterApi = false, useXaiApi = false, model = '') {
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


  // Map thinking effort to token budgets (-1 = dynamic)
  const effortToBudget = { off: 0, low: 2000, medium: 10000, high: 32000, max: 100000, dynamic: -1 };
  const thinkingBudget = effortToBudget[profile.thinkingEffort] ?? -1;

  let payload;
  if (useAnthropicApi) {
    // Format payload for Anthropic API
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n');

    payload = {
      model: profile.model,
      messages: [{
        role: 'user',
        content: userMessages
      }],
      system: systemMessage,
      stream: true,
      max_tokens: thinkingBudget > 0 ? thinkingBudget + 8000 : (thinkingBudget === -1 ? 16000 : 8000),
    };

    if (thinkingBudget !== 0) {
      payload.thinking = {
        type: "enabled",
        // Claude has no native dynamic mode; use 10k as a reasonable default
        budget_tokens: thinkingBudget === -1 ? 10000 : thinkingBudget
      };
    }
  } else if (usePerplexityApi) {
    // Format payload for Perplexity API with web search (built-in)
    payload = {
      model: profile.model,
      messages: messages,
      stream: true,
      // Perplexity models have built-in web search
      // Use 'medium' search mode for balanced performance
      search_mode: 'medium'
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

    payload = {
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        ...(thinkingBudget !== 0 ? {
          thinkingConfig: {
            // -1 = Gemini's native dynamic mode; positive = fixed budget
            thinkingBudget: thinkingBudget,
            includeThoughts: true
          }
        } : {})
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
    // Format payload for xAI Responses API
    // Responses API uses 'input' for messages and 'instructions' for system prompt
    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    payload = {
      model: profile.model,
      input: nonSystemMessages,
      stream: true,
      tools: [
        { type: 'web_search' }
      ]
    };

    if (systemMessage) {
      payload.instructions = systemMessage;
    }
  } else {
    // Format payload for OpenAI API
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

    const response = await fetchCompletions(selectedApiKey, payload, useAnthropicApi, usePerplexityApi, useGoogleApi, useOpenRouterApi, useXaiApi, profile.model);

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
            } else {
              // Handle OpenAI streaming format
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
