// Verified against provider documentation and OpenRouter's live catalog on 2026-10-14.
// Shared by the options UI and request builders to keep valid settings aligned.
function effortOptions(values) {
  const labels = { off: 'Off (no reasoning)', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra High', max: 'Max' };
  return [...values.map(value => ({ value, label: labels[value] })), { value: 'dynamic', label: 'Dynamic (model default)' }];
}

export function normalizeEffort(model, effort = 'dynamic') {
  const options = getEffortOptions(model);
  if (!options || options.some(option => option.value === effort)) return effort;
  // Profiles may retain values from a different model. Never send rejected settings.
  if (effort === 'off') return 'low';
  if (['max', 'xhigh', 'pro', 'ultra'].includes(effort)) {
    return ['max', 'xhigh', 'high'].find(value => options.some(option => option.value === value)) || 'dynamic';
  }
  return 'dynamic';
}

export function isOpenAIReasoningModel(model) {
  return /^gpt-[5-9](?:[.-]|$)/.test(model) || /^o\d/.test(model);
}

export function getEffortOptions(modelId) {
  if (!modelId) return null;

  // Kimi K3 keeps thinking enabled; effort controls depth.
  if (modelId.startsWith('kimi-k3')) return effortOptions(['low', 'high', 'max']);
  if (modelId.startsWith('kimi-')) return null;

  if (/^gpt-6(?:[.-]|$)/.test(modelId)) {
    const values = ['low', 'medium', 'high', 'xhigh', 'max'];
    if (/^gpt-6-(sol|luna)(?:$|-)/.test(modelId)) values.unshift('off');
    return effortOptions(values);
  }

  if (/^grok-4\.[67](?:$|-)/.test(modelId)) return effortOptions(['low', 'medium', 'high', 'xhigh']);

  if (modelId.startsWith('qwen')) {
    return [
      { value: 'off',     label: 'Off (no reasoning)' },
      { value: 'low',     label: 'Low (~4k)' },
      { value: 'medium',  label: 'Medium (~6.5k)' },
      { value: 'high',    label: 'High (~10k)' },
      { value: 'xhigh',   label: 'Extra High (~13k)' },
      { value: 'dynamic', label: 'Dynamic (default: medium)' },
    ];
  }

  if (modelId.startsWith('gpt-5.6')) {
    return [
      { value: 'off',     label: 'Off (no reasoning)' },
      { value: 'low',     label: 'Low' },
      { value: 'medium',  label: 'Medium' },
      { value: 'high',    label: 'High' },
      { value: 'xhigh',   label: 'Extra High' },
      { value: 'max',     label: 'Max' },
      { value: 'pro',     label: 'Pro mode (deepest — no live stream, answer arrives at end)' },
      { value: 'ultra',   label: 'Ultra (multi-agent, beta — subagent work shown as thinking)' },
      { value: 'dynamic', label: 'Dynamic (default: medium)' },
    ];
  }

  if (modelId.startsWith('gpt-5') || /^o\d/.test(modelId)) {
    return [
      { value: 'off',     label: 'Off (no reasoning)' },
      { value: 'low',     label: 'Low' },
      { value: 'medium',  label: 'Medium' },
      { value: 'high',    label: 'High' },
      { value: 'xhigh',   label: 'Extra High' },
      { value: 'dynamic', label: 'Dynamic (default: medium)' },
    ];
  }

  if (modelId.startsWith('claude-')) {
    if (modelId.includes('haiku') && !modelId.includes('haiku-5-5')) {
      // Haiku 4.5 errors on any effort value — only the off/adaptive endpoints work.
      return [
        { value: 'off',     label: 'Off' },
        { value: 'dynamic', label: 'Dynamic (adaptive)' },
      ];
    }
    // Fable/Mythos and Opus 5.5 have always-on adaptive thinking.
    const isFable = modelId.includes('fable') || modelId.includes('mythos') || modelId.includes('opus-5-5');
    // Current Claude models support all five effort levels.
    const supportsXhigh = isFable || /claude-(opus|sonnet|haiku)-5/.test(modelId) || modelId.includes('opus-4-7') || modelId.includes('opus-4-8');
    const supportsMax = isFable || modelId.includes('opus') || /claude-(sonnet-5|sonnet-4-6|haiku-5-5)/.test(modelId);
    const opts = [];
    if (!isFable) opts.push({ value: 'off', label: modelId.includes('sonnet-5-5') ? 'No up-front thinking' : 'Off' });
    opts.push(
      { value: 'low',    label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high',   label: 'High' },
    );
    if (supportsXhigh) opts.push({ value: 'xhigh', label: 'Extra High' });
    if (supportsMax)   opts.push({ value: 'max',   label: 'Max' });
    opts.push({ value: 'dynamic', label: 'Dynamic (adaptive)' });
    return opts;
  }

  if (modelId.startsWith('gemini-')) {
    // New Gemini models use levels. Minimal is model-specific; 2.5 uses budgets.
    if (/^gemini-(4|3\.8|3\.1-pro)/.test(modelId)) return effortOptions(['low', 'medium', 'high']);
    if (modelId.startsWith('gemini-3')) {
      return [
        { value: 'off',     label: 'Minimal' },
        { value: 'low',     label: 'Low' },
        { value: 'medium',  label: 'Medium' },
        { value: 'high',    label: 'High' },
        { value: 'dynamic', label: 'Dynamic (model default)' },
      ];
    }
    // Legacy Gemini 2.5: `thinkingBudget` is a token count — show it in the label.
    return [
      { value: 'off',     label: 'Off' },
      { value: 'low',     label: 'Low (2k tokens)' },
      { value: 'medium',  label: 'Medium (10k tokens)' },
      { value: 'high',    label: 'High (32k tokens)' },
      { value: 'xhigh',   label: 'Extra High (60k tokens)' },
      { value: 'max',     label: 'Max (100k tokens)' },
      { value: 'dynamic', label: 'Dynamic (model decides)' },
    ];
  }

  return null;
}

export const MODEL_GROUPS = [
  ['OpenAI Models', [
    ['gpt-6.1-sol', 'GPT-6.1 Sol'], ['gpt-6-astra', 'GPT-6 Astra'],
    ['gpt-6-sol', 'GPT-6 Sol'], ['gpt-6-luna', 'GPT-6 Luna'],
  ]],
  ['Anthropic Claude Models', [
    ['claude-fable-5-1', 'Claude Fable 5.1'], ['claude-opus-5-5', 'Claude Opus 5.5'],
    ['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5'],
  ]],
  ['Google Gemini Models', [
    ['gemini-4-argon', 'Gemini 4 Argon'], ['gemini-3.8-flash', 'Gemini 3.8 Flash'],
    ['gemini-3.6-flash', 'Gemini 3.6 Flash'], ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite'],
    ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview'],
  ]],
  ['Perplexity Agent API', ['fast', 'low', 'medium', 'high', 'xhigh'].map(preset =>
    [`perplexity/${preset}`, `Perplexity ${preset}`])],
  ['xAI Grok Models', [['grok-4.7', 'Grok 4.7'], ['grok-4.6', 'Grok 4.6']]],
  ['Moonshot Kimi Models', [['kimi-k3', 'Kimi K3']]],
  ['Alibaba Qwen Models (Token Plan)', [
    ['qwen3.8-max', 'Qwen3.8 Max'], ['qwen3.8-max-0902', 'Qwen3.8 Max (0902)'],
    ['qwen3.8-flash', 'Qwen3.8 Flash'],
  ]],
  ['OpenRouter Models', [
    ['openrouter/openai/gpt-6.1-sol', 'OpenRouter: GPT-6.1 Sol'],
    ['openrouter/openai/gpt-6-astra', 'OpenRouter: GPT-6 Astra'],
    ['openrouter/openai/gpt-6-sol', 'OpenRouter: GPT-6 Sol'],
    ['openrouter/openai/gpt-6-luna', 'OpenRouter: GPT-6 Luna'],
    ['openrouter/google/gemini-4-argon', 'OpenRouter: Gemini 4 Argon'],
    ['openrouter/google/gemini-3.8-flash', 'OpenRouter: Gemini 3.8 Flash'],
    ['openrouter/x-ai/grok-4.7', 'OpenRouter: Grok 4.7'],
    ['openrouter/deepseek/deepseek-v4-pro', 'OpenRouter: DeepSeek V4 Pro'],
    ['openrouter/deepseek/deepseek-v4.1-flash', 'OpenRouter: DeepSeek V4.1 Flash'],
    ['openrouter/moonshotai/kimi-k3', 'OpenRouter: Kimi K3'],
    ['openrouter/z-ai/glm-5.3', 'OpenRouter: GLM 5.3'],
    ['openrouter/z-ai/glm-5.3-flash', 'OpenRouter: GLM 5.3 Flash'],
    ['openrouter/qwen/qwen3.8-max-0902', 'OpenRouter: Qwen3.8 Max (0902)'],
    ['openrouter/qwen/qwen3.8-flash', 'OpenRouter: Qwen3.8 Flash'],
    ['openrouter/minimax/minimax-m3', 'OpenRouter: MiniMax M3'],
    ['openrouter/xiaomi/mimo-v2.5-pro', 'OpenRouter: MiMo V2.5 Pro'],
  ]],
];
