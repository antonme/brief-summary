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
async function fetchCompletions(apiKey, payload, useAnthropicApi = false, usePerplexityApi = false, useGoogleApi = false, model = '') {
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

function gptError(port, error) {
  console.error('Sending error:', error);
  port.postMessage({ action: 'GPT_ERROR', error: error });
}

function gptMessage(port, summary) {
  console.log('Sending message:', summary.slice(-50)); // Log last 50 chars
  port.postMessage({ action: 'GPT_MESSAGE', summary: summary });
}

function gptDone(port, summary) {
  console.log('Sending done signal');
  port.postMessage({ action: 'GPT_DONE', summary: summary });
}

//------------------------------------------------------------------------------
// Takes the list of message prompts and sends them to OpenAI's chat
// completions endpoint. It then streams the responses back to the
// caller-supplied port.
//------------------------------------------------------------------------------
export async function fetchAndStream(port, messages, model, profileName) {
  // Get global API keys
  const { openAIKey, anthropicApiKey, perplexityApiKey, googleApiKey } = await chrome.storage.sync.get([
    'openAIKey',
    'anthropicApiKey',
    'perplexityApiKey',
    'googleApiKey'
  ]);
  console.log("Model: ", model);

  // Determine which API to use based on model name prefixes
  const useAnthropicApi = model.startsWith('claude-');
  const usePerplexityApi = model.startsWith('sonar') || model.startsWith('llama-');
  const useGoogleApi = model.startsWith('gemini-');

  // Select appropriate API key from global keys
  const selectedApiKey = useAnthropicApi ? anthropicApiKey :
                        usePerplexityApi ? perplexityApiKey :
                        useGoogleApi ? googleApiKey :
                        openAIKey;

  // Add validation for API key
  if (!selectedApiKey) {
    const errorMsg = useAnthropicApi ? ERR_ANTHROPIC_API_KEY :
                    usePerplexityApi ? ERR_PERPLEXITY_API_KEY :
                    useGoogleApi ? ERR_GOOGLE_API_KEY :
                    ERR_OPENAI_KEY;
    console.error('API Key Error:', errorMsg);
    gptError(port, errorMsg);
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
      max_tokens: 4096
    };
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
        maxOutputTokens: 8192
      },
      // Add Google Search grounding tool
      tools: [{
        googleSearch: {}
      }]
    };
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

  // Use profile-specific API keys (if implemented) or fall back to global keys
  let apiKey;
  if (useAnthropicApi) {
    apiKey = profile.anthropicApiKey || selectedApiKey;
  } else if (usePerplexityApi) {
    apiKey = profile.perplexityApiKey || selectedApiKey;
  } else if (useGoogleApi) {
    apiKey = profile.googleApiKey || selectedApiKey;
  } else {
    apiKey = profile.apiKey || selectedApiKey; // OpenAI key
  }




  let connected = true;
  port.onDisconnect.addListener(() => {
    connected = false;
  });

  try {
    await debug('PAYLOAD', payload);

    const response = await fetchCompletions(selectedApiKey, payload, useAnthropicApi, usePerplexityApi, useGoogleApi, profile.model);

    if (!response.ok) {
      const error = await response.json();
      console.error('API Error:', error);
      throw new Error(error.error?.message || 'API request failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let summary = '';

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
              // Handle Anthropic streaming format
              const content = parsed.delta?.text || '';
              if (content) {
                summary += content;
                gptMessage(port, summary);
              }
            } else if (useGoogleApi) {
              // Handle Google Gemini streaming format
              // Gemini format: { candidates: [{ content: { parts: [{ text: "..." }] } }] }
              const candidate = parsed.candidates?.[0];
              const content = candidate?.content?.parts?.[0]?.text || '';
              if (content) {
                summary += content;
                gptMessage(port, summary);
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
                gptMessage(port, summary);
              }

              // Check for citations (Perplexity returns these)
              const citations = parsed.citations;
              if (citations) {
                console.log('Perplexity citations:', citations);
              }
            } else {
              // Handle OpenAI streaming format
              const content = parsed.choices[0]?.delta?.content || '';
              if (content) {
                summary += content;
                gptMessage(port, summary);
              }
            }
          } catch (e) {
            console.error('Parse error:', e, 'Line:', line);
          }
        }
      }
    }

    if (summary) {
      gptDone(port, summary);
    } else {
      throw new Error('No content received from API');
    }
  } catch (error) {
    console.error('Stream error:', error);
    gptError(port, error.message);
  }
}
